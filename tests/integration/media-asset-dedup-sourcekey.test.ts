/**
 * tests/integration/media-asset-dedup-sourcekey.test.ts — feature 00051 (Chat Media
 * Deduplication), S-3 + S-4 — ครอบ layer-2 sourceKey cache ที่ `ingestAdReferral` (S-3) และ
 * 3 ฟังก์ชัน derived-image (S-4, path B) ใน `channel-chat.service.ts` ตาม
 * docs/20 - Features/00051 - Chat Media Deduplication/TestCase.md §2.4
 * (TC-SRC-01/02/03 + TC-DERIVED-01/02/03)
 *
 * ต้องรันด้วย local Docker Postgres เท่านั้น (ห้ามชี้ .env.local — Hard Rule 13):
 *   npx dotenv -e .env -- npx vitest run tests/integration/media-asset-dedup-sourcekey.test.ts
 *
 * ทำไมยิงใส่ Postgres จริง (ไม่ mock prisma): ต้องพิสูจน์ว่า claimSourceKey (updateMany
 * where sourceKey: null) เป็น set-once จริงบนแถวจริง — ตรงกับ pattern ของ
 * tests/integration/media-asset-dedup.test.ts (S-2)
 *
 * ห้าม mock @/lib/prisma — mock เฉพาะ global fetch (ตัวเดียวที่ ingestAdReferral ใช้ยิงออกไป
 * ทั้ง Graph API และ Meta CDN) เพื่อควบคุม call count ได้แม่นยำโดยไม่ต้องพึ่งเครือข่ายจริง
 *
 * S-4: mock `buildMetaCardJpeg`/`buildLinePreviewJpeg` เท่านั้น (ตามที่ TestCase.md ระบุ "mock
 * buildMetaCardJpeg (spy call count)") — echo เนื้อ buffer ต้นทางกลับมาแทนที่จะคืนค่าคงที่ เพื่อให้
 * เทส TC-DERIVED-02 พิสูจน์ได้ว่า resolveMetaCardImageUrl อ่านเนื้อไฟล์ต้นทาง**สดจริง**ทุกครั้ง
 * ไม่ใช่แค่คืน URL อะไรก็ได้ที่ไม่ null (ถ้า mock คืนค่าคงที่ การ cache ผิด fileId จะตรวจจับไม่ได้เลย)
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi, beforeAll } from "vitest";
import { prisma as testPrisma, deleteTestData } from "../setup";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/token-crypto";
import { ingestAdReferral, resolveMetaCardImageUrl, resolveLineFlexImageUrl } from "@/services/channel-chat.service";
import { getFile, saveFile, deleteFile as realDeleteFileFromLocal } from "@/lib/storage/local";
import type { Referral } from "@/lib/facebook/webhook-types";

beforeAll(() => {
  // encryptToken/decryptToken (token-crypto.ts) ต้องมีคีย์นี้ — .env (ที่ใช้รันชุดเทสนี้) ไม่มี
  // ค่านี้ตั้งใจ (คนละ concern กับ DATABASE_URL) ต้องตั้งเองในเทสเหมือน shop-channel.service.test.ts
  process.env.CHANNEL_TOKEN_KEY = process.env.CHANNEL_TOKEN_KEY ?? "f".repeat(64);
});

// ── S-4: mock transcode ของ 2 ฟังก์ชันที่ derived-image เรียก (buildMetaCardJpeg ใช้โดย
// resolveMetaCardImageUrl, buildLinePreviewJpeg ใช้โดยทั้ง resolveLineFlexImageUrl และ
// resolveLinePreviewUrl — ไฟล์นี้เทสแค่ 2 ฟังก์ชันที่ export เท่านั้น resolveLinePreviewUrl เป็น
// private ของ channel-chat.service.ts เข้าถึงได้แค่ผ่าน sendOutboundLineMessage เต็ม flow ซึ่ง
// นอกขอบเขต S-4) — echo เนื้อ input buffer กลับมาพร้อม prefix บอกชนิด กัน hash ชนกันข้ามฟังก์ชัน
// และพิสูจน์ได้ว่าอินพุตที่แท้จริงถูกอ่านจริง ไม่ใช่ค่าคงที่
let metaCardCallCount = 0;
let metaCardBehavior: "success" | "null" | "throw" = "success";
vi.mock("@/lib/meta/card-image", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meta/card-image")>();
  return {
    ...actual,
    buildMetaCardJpeg: vi.fn(async (source: Buffer) => {
      metaCardCallCount++;
      if (metaCardBehavior === "throw") throw new Error("[test] simulated transcode crash");
      if (metaCardBehavior === "null") return null;
      return Buffer.concat([Buffer.from("metacard:"), source]);
    }),
  };
});

let lineFlexCallCount = 0;
vi.mock("@/lib/line/preview-image", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/line/preview-image")>();
  return {
    ...actual,
    buildLinePreviewJpeg: vi.fn(async (source: Buffer) => {
      lineFlexCallCount++;
      return Buffer.concat([Buffer.from("linepreview:"), source]);
    }),
  };
});

// เนื้อไฟล์คงที่ — ใช้ทั้ง TC-SRC-01/02 (ad เดียวกัน ต้อง hash เดียวกัน) และ TC-SRC-03 (ad
// คนละใบ แต่ครีเอทีฟเนื้อหาเดียวกัน — ตั้งใจให้ hash ชนกัน เพื่อพิสูจน์ set-once)
const FIXED_IMAGE_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

function fakeImageResponse(): Response {
  return new Response(FIXED_IMAGE_BYTES as unknown as BodyInit, {
    status: 200,
    headers: { "content-type": "image/jpeg" },
  });
}

const allSavedFileIdsEver: string[] = [];

let userIds: string[] = [];
let shopIds: string[] = [];
let shopChannelIds: string[] = [];

async function createShopWithChannel(suffix: string, pageExternalId: string) {
  const user = await testPrisma.user.create({
    data: { displayName: `SrcKeyUser ${suffix}`, username: `srckey_${suffix}_${Date.now()}` },
  });
  userIds.push(user.id);
  const shop = await testPrisma.shop.create({
    data: { userId: user.id, shopName: `SrcKey Shop ${suffix}`, businessType: "INDIVIDUAL" },
  });
  shopIds.push(shop.id);
  const channel = await testPrisma.shopChannel.create({
    data: {
      shopId: shop.id,
      provider: "MESSENGER",
      externalId: pageExternalId,
      name: `Page ${suffix}`,
      accessTokenEnc: encryptToken("page-token-plain"),
      connectedByUserId: user.id,
    },
  });
  shopChannelIds.push(channel.id);
  return { shop, channel };
}

async function createContactAndConversation(shopId: string, shopChannelId: string, externalUserId: string) {
  const contact = await testPrisma.externalContact.create({
    data: { shopChannelId, externalUserId },
  });
  const conversation = await testPrisma.conversation.create({
    data: { shopId, shopChannelId, externalContactId: contact.id, channel: "MESSENGER" },
  });
  return { contact, conversation };
}

beforeEach(() => {
  userIds = [];
  shopIds = [];
  shopChannelIds = [];
  vi.stubGlobal("fetch", vi.fn(async () => fakeImageResponse()));
  // S-4 — รีเซ็ตทุกเทส กัน call count/behavior รั่วข้ามเทส
  metaCardCallCount = 0;
  metaCardBehavior = "success";
  lineFlexCallCount = 0;
});

afterEach(async () => {
  if (shopIds.length > 0) {
    await prisma.mediaAsset.deleteMany({ where: { shopId: { in: shopIds } } });
  }
  await deleteTestData({ userIds, shopIds });
  vi.unstubAllGlobals();
});

afterAll(async () => {
  for (const fileId of allSavedFileIdsEver) {
    await realDeleteFileFromLocal(fileId).catch(() => {});
  }
});

async function getLatestPhotoFileId(conversationId: string): Promise<string | null> {
  const row = await prisma.conversationAdReferral.findFirst({
    where: { conversationId },
    orderBy: { receivedAt: "desc" },
  });
  return row?.photoFileId ?? null;
}

describe("ingestAdReferral — layer-2 sourceKey cache (TC-SRC-01/02/03)", () => {
  it("TC-SRC-01: ad ID ใหม่ (cache miss ชั้น 2) — fetch จาก Meta CDN 1 ครั้ง, บันทึกทั้งสองชั้น", async () => {
    const { shop, channel } = await createShopWithChannel("src01", "PAGE_SRC01");
    const { conversation } = await createContactAndConversation(shop.id, channel.id, "PSID_SRC01_A");

    const referral: Referral = {
      source: "ADS",
      ad_id: "ad-src-test-1",
      ads_context_data: { photo_url: "https://scontent.fbcdn.net/ad-src-test-1.jpg" },
    };

    await ingestAdReferral({
      provider: "MESSENGER",
      pageExternalId: "PAGE_SRC01",
      contactExternalId: "PSID_SRC01_A",
      referral,
    });

    expect(fetch).toHaveBeenCalledTimes(1);

    const asset = await prisma.mediaAsset.findFirst({ where: { shopId: shop.id, sourceKey: "ad:ad-src-test-1" } });
    expect(asset).not.toBeNull();

    const photoFileId = await getLatestPhotoFileId(conversation.id);
    expect(photoFileId).toBe(asset!.fileId);
    allSavedFileIdsEver.push(asset!.fileId);
  });

  // TC-SRC-02 (blocker): ad ID เดิมถูกคลิกซ้ำ (คนที่ 51) — ห้าม fetch ซ้ำ
  it("TC-SRC-02 (blocker): ad ID เดิมถูกคลิกซ้ำจากลูกค้าคนใหม่ ในร้านเดียวกัน — ห้ามยิง fetch ซ้ำ", async () => {
    const { shop, channel } = await createShopWithChannel("src02", "PAGE_SRC02");
    const { conversation: conv1 } = await createContactAndConversation(shop.id, channel.id, "PSID_SRC02_A");

    const referral: Referral = {
      source: "ADS",
      ad_id: "ad-src-test-2",
      ads_context_data: { photo_url: "https://scontent.fbcdn.net/ad-src-test-2.jpg" },
    };

    // คนแรก (cache miss) — สร้าง cache ไว้
    await ingestAdReferral({
      provider: "MESSENGER",
      pageExternalId: "PAGE_SRC02",
      contactExternalId: "PSID_SRC02_A",
      referral,
    });
    const firstFileId = await getLatestPhotoFileId(conv1.id);
    expect(firstFileId).not.toBeNull();
    allSavedFileIdsEver.push(firstFileId!);

    // รีเซ็ต spy ของ fetch ก่อนคนที่สอง (จำลอง "คนที่ 51" คลิกโฆษณาเดิม — เธรดใหม่ ร้านเดียวกัน)
    (fetch as ReturnType<typeof vi.fn>).mockClear();
    const { conversation: conv2 } = await createContactAndConversation(shop.id, channel.id, "PSID_SRC02_B");

    await ingestAdReferral({
      provider: "MESSENGER",
      pageExternalId: "PAGE_SRC02",
      contactExternalId: "PSID_SRC02_B",
      referral,
    });

    // 🛑 การพิสูจน์หลักของเคสนี้: ห้ามยิง fetch เลยแม้แต่ครั้งเดียว
    expect(fetch).not.toHaveBeenCalled();

    const secondFileId = await getLatestPhotoFileId(conv2.id);
    expect(secondFileId).toBe(firstFileId); // ได้ fileId เดิมเป๊ะจาก cache ชั้น 2

    const count = await prisma.mediaAsset.count({ where: { shopId: shop.id, sourceKey: "ad:ad-src-test-2" } });
    expect(count).toBe(1); // ไม่มีแถวใหม่ถูกสร้างจากการ hit
  });

  it("TC-SRC-03: claimSourceKey เป็น set-once — ad คนละชิ้นที่ใช้ครีเอทีฟเนื้อหาเดียวกัน ไม่แย่งเจ้าของ sourceKey", async () => {
    const { shop, channel } = await createShopWithChannel("src03", "PAGE_SRC03");
    const { conversation: convA } = await createContactAndConversation(shop.id, channel.id, "PSID_SRC03_A");
    const { conversation: convB } = await createContactAndConversation(shop.id, channel.id, "PSID_SRC03_B");

    // ad A ก่อน — สร้างแถว MediaAsset(hash=H, sourceKey='ad:src03-A')
    await ingestAdReferral({
      provider: "MESSENGER",
      pageExternalId: "PAGE_SRC03",
      contactExternalId: "PSID_SRC03_A",
      referral: {
        source: "ADS",
        ad_id: "ad-src03-A",
        ads_context_data: { photo_url: "https://scontent.fbcdn.net/ad-src03-A.jpg" },
      },
    });
    const fileIdA = await getLatestPhotoFileId(convA.id);
    expect(fileIdA).not.toBeNull();
    allSavedFileIdsEver.push(fileIdA!);

    // ad B — sourceKey ต่างกัน ('ad:src03-B') แต่เนื้อไฟล์เหมือนกันเป๊ะ (FIXED_IMAGE_BYTES เดียวกัน)
    // ⇒ miss ที่ชั้น 2 (sourceKey ไม่เคยเห็น) แต่ hit ที่ชั้น 1 (hash เดิม) — ต้องไม่ overwrite sourceKey เดิม
    await ingestAdReferral({
      provider: "MESSENGER",
      pageExternalId: "PAGE_SRC03",
      contactExternalId: "PSID_SRC03_B",
      referral: {
        source: "ADS",
        ad_id: "ad-src03-B",
        ads_context_data: { photo_url: "https://scontent.fbcdn.net/ad-src03-B.jpg" },
      },
    });
    const fileIdB = await getLatestPhotoFileId(convB.id);
    expect(fileIdB).toBe(fileIdA); // ได้ fileId เดิม (dedup ผ่าน hash แม้ sourceKey ไม่ตรง)

    // แถวเดิมยัง sourceKey='ad:src03-A' — ไม่ถูกแย่งเป็น 'ad:src03-B'
    const row = await prisma.mediaAsset.findUnique({ where: { shopId_hash: { shopId: shop.id, hash: (await prisma.mediaAsset.findFirst({ where: { shopId: shop.id, fileId: fileIdA! } }))!.hash } } });
    expect(row?.sourceKey).toBe("ad:ad-src03-A");

    // ครั้งถัดไปที่ค้นด้วย sourceKey='ad:src03-B' ต้อง miss ที่ชั้น 2 (regression ตามที่ TC-SRC-03 ระบุ)
    const missAtLayer2 = await prisma.mediaAsset.findFirst({ where: { shopId: shop.id, sourceKey: "ad:ad-src03-B" } });
    expect(missAtLayer2).toBeNull();

    // ยังมีแถวเดียวเท่านั้นสำหรับเนื้อไฟล์นี้ (ไม่ได้ถูก dedup ผิดสร้างแถวซ้ำ)
    const count = await prisma.mediaAsset.count({ where: { shopId: shop.id } });
    expect(count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// S-4 — derived-image sourceKey cache (path B): resolveMetaCardImageUrl / resolveLineFlexImageUrl
// ─────────────────────────────────────────────────────────────────────────────────────────

async function createBareShop(suffix: string) {
  const user = await testPrisma.user.create({
    data: { displayName: `DerivedUser ${suffix}`, username: `derived_${suffix}_${Date.now()}` },
  });
  userIds.push(user.id);
  const shop = await testPrisma.shop.create({
    data: { userId: user.id, shopName: `Derived Shop ${suffix}`, businessType: "INDIVIDUAL" },
  });
  shopIds.push(shop.id);
  return shop;
}

/** เขียนไฟล์ "ต้นทาง" จริงลง storage (จำลองรูปสินค้าที่มีอยู่แล้ว) — ผ่าน saveFile ของ local driver
 *  ตรง ๆ ไม่ผ่าน writeDedupedFile เพราะรูปต้นทางของ Product ไม่ได้เกิดจาก dedup pipeline */
async function writeOriginalFile(bytes: Buffer, suffix: string): Promise<string> {
  const file = new File([bytes as unknown as ArrayBuffer], `original-${suffix}.png`, { type: "image/png" });
  const fileId = await saveFile(file, { skipValidation: true });
  allSavedFileIdsEver.push(fileId);
  return fileId;
}

/** resolveMetaCardImageUrl/resolveLineFlexImageUrl ของ local driver คืน `/api/files/<fileId>` เสมอ
 *  (getFileUrl ของ lib/storage/local.ts) — แกะ fileId กลับมาเพื่อพิสูจน์ "เปิดได้จริง" ด้วย getFile()
 *  ตรง ๆ แทนการยิง HTTP จริง (ไฟล์นี้เป็น integration test ระดับ service ไม่ใช่ e2e ที่มี server รัน) */
function extractFileId(url: string): string {
  const prefix = "/api/files/";
  if (!url.startsWith(prefix)) throw new Error(`[test] unexpected URL shape: ${url}`);
  return url.slice(prefix.length);
}

describe("derived-image sourceKey cache (path B, TC-DERIVED-01/02/03)", () => {
  it("TC-DERIVED-01: cache hit ข้าม transcode ทั้งหมด", async () => {
    const shop = await createBareShop("derived01");
    const originalBytes = Buffer.from(`original-derived01-${Date.now()}`);
    const originalFileId = await writeOriginalFile(originalBytes, "derived01");

    const url1 = await resolveMetaCardImageUrl(originalFileId, { shopId: shop.id });
    expect(metaCardCallCount).toBe(1);
    expect(url1).not.toBeNull();

    const url2 = await resolveMetaCardImageUrl(originalFileId, { shopId: shop.id });
    // 🛑 การพิสูจน์หลัก: เรียกซ้ำด้วย fileId เดิม ต้อง "ไม่" เรียก buildMetaCardJpeg อีก
    expect(metaCardCallCount).toBe(1);
    expect(url2).not.toBeNull();

    const fileId1 = extractFileId(url1!);
    const fileId2 = extractFileId(url2!);
    expect(fileId2).toBe(fileId1); // cache hit คืน fileId เดิมเป๊ะ

    const cardFile = await getFile(fileId1);
    expect(cardFile).not.toBeNull();
    expect(cardFile!.buffer.equals(Buffer.concat([Buffer.from("metacard:"), originalBytes]))).toBe(true);

    const asset = await prisma.mediaAsset.findFirst({
      where: { shopId: shop.id, sourceKey: `derived:metacard:${originalFileId}` },
    });
    expect(asset?.fileId).toBe(fileId1);
  });

  // TC-DERIVED-02 (🛑 mandatory #10 / blocker): survivor เปลี่ยนหลัง backfill — sourceKey เดิม
  // ต้องไม่คืนไฟล์ที่ถูกลบไปแล้ว (NFR-CMD-09)
  it("TC-DERIVED-02 (blocker): survivor เปลี่ยนหลัง backfill — sourceKey เดิมต้องไม่คืนไฟล์ที่ถูกลบไปแล้ว", async () => {
    const shop = await createBareShop("derived02");

    const bytesA = Buffer.from(`original-A-derived02-${Date.now()}`);
    const fileA = await writeOriginalFile(bytesA, "derived02-A");

    const product = await testPrisma.product.create({
      data: { shopId: shop.id, name: "สินค้าทดสอบ dedup", price: 100, images: [fileA] },
    });

    // ── ขั้น 1: เรียกด้วย fileA (อ่านสดจาก DB) — สร้าง cache sourceKey='derived:metacard:<fileA>' ──
    const productRow1 = await testPrisma.product.findUniqueOrThrow({ where: { id: product.id } });
    const originalFileId1 = (productRow1.images as string[])[0]!;
    expect(originalFileId1).toBe(fileA);

    const url1 = await resolveMetaCardImageUrl(originalFileId1, { shopId: shop.id });
    expect(url1).not.toBeNull();
    expect(metaCardCallCount).toBe(1);

    // ── ขั้น 2: จำลอง backfill repoint — Product.images[0] เปลี่ยนเป็น fileB แล้วลบไฟล์ A จริง ──
    const bytesB = Buffer.from(`original-B-derived02-${Date.now()}`);
    const fileB = await writeOriginalFile(bytesB, "derived02-B");
    await testPrisma.product.update({ where: { id: product.id }, data: { images: [fileB] } });
    await realDeleteFileFromLocal(fileA); // ไฟล์ A หายจาก storage จริง (เหมือน backfill repoint-then-delete)

    const fileAStillReadable = await getFile(fileA);
    expect(fileAStillReadable).toBeNull(); // sanity — ไฟล์ A หายจริงแล้ว

    // ── ขั้น 3: อ่าน Product.images[0] สด ๆ จาก DB (ต้องได้ fileB) แล้วเรียกฟังก์ชันด้วยค่านั้น ──
    const productRow2 = await testPrisma.product.findUniqueOrThrow({ where: { id: product.id } });
    const originalFileId2 = (productRow2.images as string[])[0]!;
    expect(originalFileId2).toBe(fileB);
    expect(originalFileId2).not.toBe(originalFileId1);

    const url2 = await resolveMetaCardImageUrl(originalFileId2, { shopId: shop.id });

    // 1. blocker: ต้องได้ URL ที่ใช้งานได้จริง ไม่ null (ไม่ error/ไม่ 404)
    expect(url2).not.toBeNull();

    // 2. sourceKey ใหม่ 'derived:metacard:<fileB>' คนละคีย์กับเดิม ⇒ cache miss ⇒ transcode ใหม่
    //    (ไม่ใช่ stale hit ที่คืน URL เก่าซึ่งอ้างอิงไฟล์ A ที่ถูกลบไปแล้ว)
    expect(metaCardCallCount).toBe(2);

    // 3. เนื้อการ์ดที่ได้ต้องมาจาก fileB จริง (พิสูจน์ว่าอ่านไฟล์ต้นทางสดจาก fileB ไม่ใช่ไฟล์ A เดิม
    //    ที่ถูกลบไปแล้ว หรือค่าที่ค้างจาก closure ของการเรียกครั้งแรก)
    const cardFileId2 = extractFileId(url2!);
    const cardFile2 = await getFile(cardFileId2);
    expect(cardFile2).not.toBeNull(); // "เปิดได้จริง" — ไม่ใช่ 404
    expect(cardFile2!.buffer.equals(Buffer.concat([Buffer.from("metacard:"), bytesB]))).toBe(true);

    // 4. แถว MediaAsset เดิม (sourceKey='derived:metacard:<fileA>') ยังอยู่ — dead cache ที่ยอมรับ
    //    ได้ตาม TFR-CMD-09 ข้อ 5 (ไม่มีกลไก sweep ใน v1) ไม่ใช่ถูกลบ/เขียนทับ
    const oldRow = await prisma.mediaAsset.findFirst({
      where: { shopId: shop.id, sourceKey: `derived:metacard:${fileA}` },
    });
    expect(oldRow).not.toBeNull();

    const newRow = await prisma.mediaAsset.findFirst({
      where: { shopId: shop.id, sourceKey: `derived:metacard:${fileB}` },
    });
    expect(newRow).not.toBeNull();
    expect(newRow!.fileId).toBe(cardFileId2);
  });

  it("TC-DERIVED-03: transcode ล้มเหลว (throw) — คืน null ไม่ throw", async () => {
    const shop = await createBareShop("derived03");
    const originalFileId = await writeOriginalFile(Buffer.from("derived03-source"), "derived03");
    metaCardBehavior = "throw";

    await expect(resolveMetaCardImageUrl(originalFileId, { shopId: shop.id })).resolves.toBeNull();

    // ไม่ลงทะเบียน MediaAsset แม้แต่แถวเดียว — transcode ล้มเหลวไม่ควรเหลือ cache ค้าง
    const count = await prisma.mediaAsset.count({ where: { shopId: shop.id } });
    expect(count).toBe(0);
  });

  it("TC-DERIVED-03b: buildMetaCardJpeg คืน null (ไม่ throw) — คืน null เหมือนกัน", async () => {
    const shop = await createBareShop("derived03b");
    const originalFileId = await writeOriginalFile(Buffer.from("derived03b-source"), "derived03b");
    metaCardBehavior = "null";

    const url = await resolveMetaCardImageUrl(originalFileId, { shopId: shop.id });
    expect(url).toBeNull();
  });

  it("resolveLineFlexImageUrl: cache hit ข้าม transcode + namespace แยกจาก metacard แม้ fileId เดียวกัน", async () => {
    const shop = await createBareShop("lineflex01");
    const originalBytes = Buffer.from(`original-lineflex01-${Date.now()}`);
    const originalFileId = await writeOriginalFile(originalBytes, "lineflex01");

    // เรียก metacard ก่อน — สร้าง cache ที่ sourceKey='derived:metacard:<fileId>'
    const metaCardUrl = await resolveMetaCardImageUrl(originalFileId, { shopId: shop.id });
    expect(metaCardUrl).not.toBeNull();
    expect(metaCardCallCount).toBe(1);

    // เรียก lineflex ด้วย fileId เดียวกัน — namespace คนละอัน ('derived:lineflex:') ต้อง miss ที่
    // ชั้น sourceKey (ไม่ได้ hit ผิดกับแถวของ metacard) แล้ว transcode จริงของ line
    const flexUrl1 = await resolveLineFlexImageUrl(originalFileId, { shopId: shop.id });
    expect(flexUrl1).not.toBeNull();
    expect(lineFlexCallCount).toBe(1);
    expect(flexUrl1).not.toBe(metaCardUrl); // คนละไฟล์กัน (คนละ crop/encode)

    // เรียกซ้ำ — cache hit ที่ layer 2 ของ lineflex เอง ข้าม transcode
    const flexUrl2 = await resolveLineFlexImageUrl(originalFileId, { shopId: shop.id });
    expect(lineFlexCallCount).toBe(1);
    expect(extractFileId(flexUrl2!)).toBe(extractFileId(flexUrl1!));

    const flexFile = await getFile(extractFileId(flexUrl1!));
    expect(flexFile!.buffer.equals(Buffer.concat([Buffer.from("linepreview:"), originalBytes]))).toBe(true);

    // ยืนยันมีแถว MediaAsset 2 แถวแยกกันสำหรับ hash เดียวกันไม่ได้ (เนื้อ transcode คนละไบต์กัน
    // เพราะ prefix ต่างกัน 'metacard:' vs 'linepreview:') — เช็คว่า sourceKey ทั้งสองชี้คนละ fileId
    const metaCardRow = await prisma.mediaAsset.findFirst({
      where: { shopId: shop.id, sourceKey: `derived:metacard:${originalFileId}` },
    });
    const lineFlexRow = await prisma.mediaAsset.findFirst({
      where: { shopId: shop.id, sourceKey: `derived:lineflex:${originalFileId}` },
    });
    expect(metaCardRow).not.toBeNull();
    expect(lineFlexRow).not.toBeNull();
    expect(metaCardRow!.fileId).not.toBe(lineFlexRow!.fileId);
  });
});
