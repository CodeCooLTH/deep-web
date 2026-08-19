/**
 * tests/integration/media-asset-dedup-sourcekey.test.ts — feature 00051 (Chat Media
 * Deduplication), S-3 — ครอบ layer-2 sourceKey cache ที่ `ingestAdReferral`
 * (channel-chat.service.ts) ตาม
 * docs/20 - Features/00051 - Chat Media Deduplication/TestCase.md §2.4 (TC-SRC-01/02/03)
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
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi, beforeAll } from "vitest";
import { prisma as testPrisma, deleteTestData } from "../setup";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/token-crypto";
import { ingestAdReferral } from "@/services/channel-chat.service";
import { getFile, deleteFile as realDeleteFileFromLocal } from "@/lib/storage/local";
import type { Referral } from "@/lib/facebook/webhook-types";

beforeAll(() => {
  // encryptToken/decryptToken (token-crypto.ts) ต้องมีคีย์นี้ — .env (ที่ใช้รันชุดเทสนี้) ไม่มี
  // ค่านี้ตั้งใจ (คนละ concern กับ DATABASE_URL) ต้องตั้งเองในเทสเหมือน shop-channel.service.test.ts
  process.env.CHANNEL_TOKEN_KEY = process.env.CHANNEL_TOKEN_KEY ?? "f".repeat(64);
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
