/**
 * tests/integration/media-asset-dedup.test.ts — feature 00051 (Chat Media Deduplication), S-2
 *
 * ครอบ src/services/media-asset.service.ts (choke point จริงของฟีเจอร์) ตาม
 * docs/20 - Features/00051 - Chat Media Deduplication/TestCase.md §2.3 — ปรับให้ตรง scope
 * ของ S-2 เท่านั้น (เรียก claimMediaAsset / writeDedupedFile / findMediaAssetBy... / claimSourceKey ตรง ๆ ไม่ผ่าน
 * mirrorRemoteImage/ingestAdReferral ที่ยังไม่ถูกแก้ให้ thread shopId จนกว่าจะถึง S-3 — Controller
 * ปรับ acceptance ของ S-2 ให้เรียก writeDedupedFile ตรงแทน)
 *
 * ต้องรันด้วย local Docker Postgres เท่านั้น (ห้ามชี้ .env.local — Hard Rule 13):
 *   npx dotenv -e .env -- npx vitest run tests/integration/media-asset-dedup.test.ts
 *
 * TC-RACE-01/02/03 ห้าม mock unique-constraint — ยิงใส่ Postgres จริงพร้อมกันจริงผ่าน
 * Promise.all (ไม่ await ทีละตัว) เพื่อพิสูจน์ R-4: isUniqueViolationOn กับ composite unique
 * [shopId, hash] ยังไม่เคยถูกพิสูจน์จริงมาก่อนฟีเจอร์นี้
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { prisma as testPrisma, deleteTestData } from "../setup";
// 🛑 บั๊กที่เจอระหว่างพัฒนา: tests/setup.ts สร้าง `new PrismaClient()` ของตัวเอง คนละ instance กับที่
// src/lib/prisma.ts export (แม้จะต่อ DB เดียวกัน) — mock method บน instance ของ setup.ts จึง "เงียบ"
// ไม่มีผลกับโค้ดจริงเลย (media-asset.service.ts import จาก @/lib/prisma เท่านั้น) ทุกเทสที่ต้อง mock
// prisma.mediaAsset.* (TC-SAFE-*) ต้องใช้ instance นี้ (`prisma` ตัวนี้ = ตัวเดียวกับที่ service ใช้จริง
// เพราะ ES module import แคชเป็น singleton ต่อ process อยู่แล้ว ไม่ต้องพึ่ง globalForPrisma ก็ได้ผลเดียวกัน)
// — testPrisma (จาก tests/setup.ts) ใช้เฉพาะสร้าง/ลบ Shop/User/deleteTestData (ยังต้อง import เพื่อให้
// allowlist guard ของ setup.ts รันเสมอ)
import { prisma } from "@/lib/prisma";

// ── mock storage เฉพาะ saveFile/deleteFile เพื่อสอดแนม call (spy) — ของจริงยังทำงานอยู่
// เสมอ (wrap ไม่ replace) ยกเว้นตอนตั้งใจจำลอง deleteFile ล้มเหลว (TC-RACE-03) ──────────────
// savedFileIds: reset ทุก test (ใช้เช็ค "test นี้เขียนไฟล์กี่ใบ")
// allSavedFileIdsEver: สะสมทั้งไฟล์ (ไม่ reset) — ใช้กวาดไฟล์จริงทิ้งใน afterAll เท่านั้น
// (บั๊กที่เจอระหว่างพัฒนา: ถ้าใช้ array เดียวกันแล้ว reset ทุก beforeEach, afterAll จะเห็นแค่ไฟล์
// ของเทสสุดท้ายที่รัน ทำให้ไฟล์ของเทสก่อนหน้าตกค้างใน uploads/ ของ repo)
const savedFileIds: string[] = [];
const allSavedFileIdsEver: string[] = [];
const deletedFileIds: string[] = [];
let deleteFileShouldFail = false;

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...actual,
    saveFile: vi.fn(async (file: File, opts?: { skipValidation?: boolean }) => {
      const fileId = await actual.saveFile(file, opts);
      savedFileIds.push(fileId);
      allSavedFileIdsEver.push(fileId);
      return fileId;
    }),
    deleteFile: vi.fn(async (fileId: string) => {
      if (deleteFileShouldFail) throw new Error("[test] mock deleteFile failure");
      deletedFileIds.push(fileId);
      return actual.deleteFile(fileId);
    }),
  };
});

// import หลัง vi.mock (hoisted อยู่แล้วโดย vitest แต่เขียนแบบนี้ให้ชัดเจนสำหรับคนอ่าน)
import {
  findMediaAssetByHash,
  findMediaAssetBySourceKey,
  claimSourceKey,
  claimMediaAsset,
  writeDedupedFile,
  reconcileUploadedFile,
} from "@/services/media-asset.service";
import { getFile, deleteFile as realDeleteFileFromLocal } from "@/lib/storage/local";
import { sha256Hex } from "@/lib/media-hash";

// ─── id ที่เทสสร้าง — ลบเฉพาะของตัวเองใน afterEach (Hard Rule 13) ───────────────────────
// MediaAsset เป็นตารางใหม่ ยังไม่อยู่ใน deleteTestData() (ไม่มี FK ผูก Shop เลยตาม comment ของ
// schema — ต้องลบเองก่อนเรียก deleteTestData({shopIds}) เหมือน pattern badgeNameENs ของ
// signup-achievement.test.ts)
let userIds: string[] = [];
let shopIds: string[] = [];

async function createTestShop(suffix: string) {
  const user = await testPrisma.user.create({
    data: { displayName: `MediaDedupUser ${suffix}`, username: `mdd_${suffix}_${Date.now()}` },
  });
  userIds.push(user.id);
  const shop = await testPrisma.shop.create({
    data: { userId: user.id, shopName: `MediaDedup Shop ${suffix}`, businessType: "INDIVIDUAL" },
  });
  shopIds.push(shop.id);
  return shop;
}

beforeEach(() => {
  userIds = [];
  shopIds = [];
  savedFileIds.length = 0;
  deletedFileIds.length = 0;
  deleteFileShouldFail = false;
});

afterEach(async () => {
  if (shopIds.length > 0) {
    await prisma.mediaAsset.deleteMany({ where: { shopId: { in: shopIds } } });
  }
  await deleteTestData({ userIds, shopIds });
});

// เผื่อไฟล์ที่เขียนจริงลง storage ระหว่างเทสยังไม่ถูกลบ (เช่น TC-RACE-03 ที่ตั้งใจให้ deleteFile
// ล้มเหลว) — เก็บกวาดจริงด้วย local driver ตรง ๆ (ไม่ผ่าน mock) กัน uploads/ ของ repo รก
afterAll(async () => {
  for (const fileId of allSavedFileIdsEver) {
    await realDeleteFileFromLocal(fileId).catch(() => {});
  }
});

function randomBuffer(seed: string): Buffer {
  return Buffer.from(`media-dedup-fixture:${seed}:${Math.random()}`, "utf8");
}

// จำลอง DB error เฉพาะ method เดียวของ prisma.mediaAsset แล้วคืนของเดิมเป๊ะหลังจบ
// (ไม่ใช้ vi.spyOn(...).mockRestore() เพราะ delegate ของ Prisma รุ่นนี้ทำให้ mockRestore ไม่คืนค่า
// เดิมให้ครบถ้วน — เจอเองระหว่างพัฒนา: TC-SAFE-02 mock แล้ว restore ทำให้ findFirst เพี้ยนสำหรับเทส
// ถัดไปทั้งไฟล์ — ฟังก์ชันนี้ save/reassign/restore ตรง ๆ แทน ปลอดภัยกว่า)
async function withMockedMediaAssetMethod<M extends keyof typeof prisma.mediaAsset, T>(
  method: M,
  error: Error,
  fn: () => Promise<T>,
): Promise<T> {
  return withMockedMediaAssetMethods([[method, error]], fn);
}

async function withMockedMediaAssetMethods<T>(
  mocks: [keyof typeof prisma.mediaAsset, Error][],
  fn: () => Promise<T>,
): Promise<T> {
  const originals = mocks.map(([method]) => [method, prisma.mediaAsset[method]] as const);
  for (const [method, error] of mocks) {
    // @ts-expect-error — mock ชั่วคราวด้วย reject เสมอ ไม่สนใจ argument
    prisma.mediaAsset[method] = vi.fn().mockRejectedValue(error);
  }
  try {
    return await fn();
  } finally {
    for (const [method, original] of originals) {
      // @ts-expect-error — คืนของเดิมเป๊ะ
      prisma.mediaAsset[method] = original;
    }
  }
}

describe("media-asset.service — claimMediaAsset", () => {
  // TC-CLAIM-01
  it("TC-CLAIM-01: เขียนครั้งแรกของ (shopId, hash) ต้องลงทะเบียนสำเร็จ", async () => {
    const shop = await createTestShop("claim01");
    const hash = sha256Hex(randomBuffer("claim01"));
    const fileId = `2026/08/19/${crypto.randomUUID()}.jpg`;

    const result = await claimMediaAsset({
      shopId: shop.id,
      hash,
      fileId,
      contentType: "image/jpeg",
      size: 123,
    });

    expect(result).toEqual({ survivorFileId: fileId, isNewRegistration: true });

    const row = await prisma.mediaAsset.findUnique({
      where: { shopId_hash: { shopId: shop.id, hash } },
    });
    expect(row?.fileId).toBe(fileId);
  });

  // TC-CLAIM-02 (blocker)
  it("TC-CLAIM-02 (blocker): เขียนซ้ำ (shopId, hash) เดิม (sequential) ต้องได้ fileId เดิม ไม่สร้างแถวใหม่", async () => {
    const shop = await createTestShop("claim02");
    const hash = sha256Hex(randomBuffer("claim02"));
    const fileId1 = `2026/08/19/${crypto.randomUUID()}.jpg`;
    const fileId2 = `2026/08/19/${crypto.randomUUID()}.jpg`;

    const first = await claimMediaAsset({
      shopId: shop.id,
      hash,
      fileId: fileId1,
      contentType: "image/jpeg",
      size: 100,
    });
    expect(first.isNewRegistration).toBe(true);

    const second = await claimMediaAsset({
      shopId: shop.id,
      hash,
      fileId: fileId2,
      contentType: "image/jpeg",
      size: 100,
    });

    expect(second).toEqual({ survivorFileId: fileId1, isNewRegistration: false });

    const count = await prisma.mediaAsset.count({ where: { shopId: shop.id, hash } });
    expect(count).toBe(1);
  });

  // TC-RACE-01 (mandatory #1, blocker — ห้าม mock, ยิง Postgres จริงพร้อมกันจริง)
  it("TC-RACE-01 (blocker): 2 claimMediaAsset แข่งกันจริงบน hash เดียวกัน ร้านเดียวกัน — ห้ามซ้ำ", async () => {
    const shop = await createTestShop("race01");
    const hash = sha256Hex(randomBuffer("race01"));
    const fileA = `2026/08/19/${crypto.randomUUID()}.jpg`;
    const fileB = `2026/08/19/${crypto.randomUUID()}.jpg`;

    // ยิง 2 call พร้อมกันจริง (ไม่ await ทีละตัว) — จำลอง 2 request แข่งกัน
    const [resultA, resultB] = await Promise.all([
      claimMediaAsset({ shopId: shop.id, hash, fileId: fileA, contentType: "image/jpeg", size: 10 }),
      claimMediaAsset({ shopId: shop.id, hash, fileId: fileB, contentType: "image/jpeg", size: 10 }),
    ]);

    // 1. ต้องมีแถวเดียวเท่านั้น
    const count = await prisma.mediaAsset.count({ where: { shopId: shop.id, hash } });
    expect(count).toBe(1);

    // 2. ทั้งสอง call ต้องคืน survivorFileId ค่าเดียวกัน
    expect(resultA.survivorFileId).toBe(resultB.survivorFileId);
    expect([fileA, fileB]).toContain(resultA.survivorFileId);

    // 3. ฝั่งแพ้ race ต้องได้ isNewRegistration: false — ต้องมีผู้ชนะ 1 ผู้แพ้ 1 เสมอ
    const registrations = [resultA.isNewRegistration, resultB.isNewRegistration];
    expect(registrations.filter((v) => v === true)).toHaveLength(1);
    expect(registrations.filter((v) => v === false)).toHaveLength(1);

    // 4. พิสูจน์ R-4 โดยตรง: isUniqueViolationOn(e, 'hash') จับ P2002 ของ composite unique
    // [shopId, hash] ได้จริง (ไม่ mock) — ถ้าจับไม่ได้ ฝั่งแพ้ race จะ throw ออกมาแทนที่จะคืนผลลัพธ์
    // ปกติ (Promise.all จะ reject ทั้งคู่) ซึ่งการที่โค้ดด้านบนรันมาถึงบรรทัดนี้ได้โดยไม่ throw
    // คือหลักฐานว่าจับได้ถูกต้อง
  });

  // TC-SCOPE-01 (mandatory #3, blocker)
  it("TC-SCOPE-01 (blocker): เนื้อไฟล์เดียวกันเป๊ะ คนละร้าน ต้องได้คนละแถวเสมอ (ไม่ dedup ข้ามร้าน)", async () => {
    const shopA = await createTestShop("scope01a");
    const shopB = await createTestShop("scope01b");
    const hash = sha256Hex(randomBuffer("scope01-shared"));
    const fileA = `2026/08/19/${crypto.randomUUID()}.jpg`;
    const fileB = `2026/08/19/${crypto.randomUUID()}.jpg`;

    const [resultA, resultB] = await Promise.all([
      claimMediaAsset({ shopId: shopA.id, hash, fileId: fileA, contentType: "image/jpeg", size: 10 }),
      claimMediaAsset({ shopId: shopB.id, hash, fileId: fileB, contentType: "image/jpeg", size: 10 }),
    ]);

    // ไม่มีใครแพ้ race เพราะ unique คือ [shopId, hash] ไม่ใช่ [hash] เดี่ยว ๆ
    expect(resultA).toEqual({ survivorFileId: fileA, isNewRegistration: true });
    expect(resultB).toEqual({ survivorFileId: fileB, isNewRegistration: true });

    const countByHashOnly = await prisma.mediaAsset.count({ where: { hash } });
    expect(countByHashOnly).toBe(2);
  });
});

describe("media-asset.service — writeDedupedFile (path A/B choke point)", () => {
  // TC-RACE-02: ฝั่งแพ้ race ที่เขียนไฟล์ไปแล้วต้องถูกลบทิ้งจริง (storage จริง, ไม่ mock)
  it("TC-RACE-02: ไฟล์ของฝั่งแพ้ race ถูกลบออกจาก storage จริง ผู้ชนะยังอ่านได้ปกติ", async () => {
    const shop = await createTestShop("race02");
    const buf = randomBuffer("race02");

    const [r1, r2] = await Promise.all([
      writeDedupedFile(buf, "image/png", { shopId: shop.id, filenamePrefix: "race02" }),
      writeDedupedFile(buf, "image/png", { shopId: shop.id, filenamePrefix: "race02" }),
    ]);

    expect(r1).toBe(r2);
    expect(savedFileIds).toHaveLength(2); // ทั้งคู่เขียนไฟล์จริงก่อนแข่งที่ DB (miss ทั้งคู่ที่ SELECT)

    const loserFileId = savedFileIds.find((id) => id !== r1);
    expect(loserFileId).toBeDefined();

    const winnerFile = await getFile(r1);
    expect(winnerFile).not.toBeNull();
    expect(winnerFile!.buffer.equals(buf)).toBe(true);

    const loserFile = await getFile(loserFileId!);
    expect(loserFile).toBeNull(); // ถูกลบทิ้งจริงแล้ว (best-effort deleteFile สำเร็จ)
  });

  // TC-RACE-03 (blocker): deleteFile ของฝั่งแพ้ race ล้มเหลว — ต้องไม่ throw ออกไปทำให้ request ล้ม
  it("TC-RACE-03 (blocker): deleteFile ของฝั่งแพ้ race ล้มเหลว — ยังคืน fileId ผู้ชนะได้ตามปกติ ไม่ throw", async () => {
    const shop = await createTestShop("race03");
    const buf = randomBuffer("race03");
    deleteFileShouldFail = true;

    const results = await Promise.all([
      writeDedupedFile(buf, "image/png", { shopId: shop.id, filenamePrefix: "race03" }),
      writeDedupedFile(buf, "image/png", { shopId: shop.id, filenamePrefix: "race03" }),
    ]);

    deleteFileShouldFail = false; // reset ก่อน assertion เผื่อ assertion fail จะได้ไม่ leak state ไปเทสอื่น

    expect(results[0]).toBe(results[1]); // ไม่ throw — ทั้งคู่ resolve และได้ fileId เดียวกัน
    expect(typeof results[0]).toBe("string");
  });

  // TC-SAFE-01 (mandatory #2, blocker): DB error ทุก query ที่แตะ MediaAsset — writeDedupedFile
  // ต้องยังคืน fileId ที่ใช้งานได้จริง ไม่ใช่ null/throw
  it("TC-SAFE-01 (blocker): findUnique และ create ของ MediaAsset ล้มเหลวทั้งคู่ — writeDedupedFile ยังคืน fileId ที่ใช้งานได้จริง", async () => {
    const shop = await createTestShop("safe01");
    const buf = randomBuffer("safe01");

    const fileId = await withMockedMediaAssetMethods(
      [
        ["findUnique", new Error("[test] simulated MediaAsset subsystem down")],
        ["create", new Error("[test] simulated MediaAsset subsystem down")],
      ],
      () => writeDedupedFile(buf, "image/png", { shopId: shop.id, filenamePrefix: "safe01" }),
    );

    expect(fileId).toBeTruthy();
    const readBack = await getFile(fileId);
    expect(readBack).not.toBeNull();
    expect(readBack!.buffer.equals(buf)).toBe(true);
  });

  // TC-SAFE-02: findMediaAssetBySourceKey ล้มเหลว — ต้อง degrade เป็น miss ไม่ throw
  it("TC-SAFE-02: findMediaAssetBySourceKey ล้มเหลว (DB error) — คืน null ไม่ throw", async () => {
    const shop = await createTestShop("safe02");
    const result = await withMockedMediaAssetMethod(
      "findFirst",
      new Error("[test] simulated sourceKey query down"),
      () => findMediaAssetBySourceKey(shop.id, "ad:test-safe02"),
    );
    expect(result).toBeNull();
  });

  // TC-SAFE-03: claimSourceKey ล้มเหลว — best-effort, ไม่กระทบผลลัพธ์หลัก
  it("TC-SAFE-03: claimSourceKey ล้มเหลว (updateMany throw) — ไม่ throw ออกไปให้ผู้เรียก", async () => {
    const shop = await createTestShop("safe03");
    const hash = sha256Hex(randomBuffer("safe03"));

    await withMockedMediaAssetMethod(
      "updateMany",
      new Error("[test] simulated updateMany failure"),
      async () => {
        await expect(claimSourceKey(shop.id, hash, "ad:test-safe03")).resolves.toBeUndefined();
      },
    );
  });

  // TC-SAFE-04: claimMediaAsset โยน error ที่ไม่ใช่ P2002 หลัง saveFile() สำเร็จไปแล้ว — คืน fileId
  // ที่เขียนสำเร็จ ไม่ throw (มติที่ spec ยืนยันแล้ว — TFR-CMD-01 ข้อ 5)
  it("TC-SAFE-04: claimMediaAsset โยน error ที่ไม่ใช่ P2002 หลัง saveFile สำเร็จ — คืน fileId ที่เขียนไปแล้ว", async () => {
    const shop = await createTestShop("safe04");
    const buf = randomBuffer("safe04");

    const fileId = await withMockedMediaAssetMethod(
      "create",
      new Error("[test] simulated connection timeout (ไม่ใช่ P2002)"),
      () => writeDedupedFile(buf, "image/png", { shopId: shop.id, filenamePrefix: "safe04" }),
    );

    expect(fileId).toBeTruthy();
    expect(savedFileIds).toContain(fileId); // fileId ที่คืนมาต้องเป็นไฟล์ที่เขียนจริง ไม่ใช่ค่าว่าง/undefined
    const readBack = await getFile(fileId);
    expect(readBack).not.toBeNull();
  });
});

describe("media-asset.service — hit path (ไม่เขียนไฟล์ซ้ำ)", () => {
  it("writeDedupedFile: เนื้อไฟล์เดียวกันครั้งที่สอง ต้องคืน fileId เดิม ไม่เขียนไฟล์ใหม่", async () => {
    const shop = await createTestShop("hit01");
    const buf = randomBuffer("hit01");

    const first = await writeDedupedFile(buf, "image/png", { shopId: shop.id, filenamePrefix: "hit01" });
    const savedAfterFirst = savedFileIds.length;

    const second = await writeDedupedFile(buf, "image/png", { shopId: shop.id, filenamePrefix: "hit01" });

    expect(second).toBe(first);
    expect(savedFileIds).toHaveLength(savedAfterFirst); // ไม่มี saveFile ครั้งใหม่เกิดขึ้น
  });

  it("writeDedupedFile: hit พร้อม sourceKey ต้อง claimSourceKey แบบ set-once บนแถวเดิม", async () => {
    const shop = await createTestShop("hit02");
    const buf = randomBuffer("hit02");

    const fileId = await writeDedupedFile(buf, "image/png", {
      shopId: shop.id,
      filenamePrefix: "hit02",
      sourceKey: "derived:metacard:original-A",
    });

    const hit = await findMediaAssetBySourceKey(shop.id, "derived:metacard:original-A");
    expect(hit?.fileId).toBe(fileId);
  });
});

describe("media-asset.service — findMediaAssetByHash / grep gate helper", () => {
  it("findMediaAssetByHash: miss เมื่อยังไม่มีแถว, hit เมื่อมีแถวแล้ว", async () => {
    const shop = await createTestShop("findbyhash01");
    const hash = sha256Hex(randomBuffer("findbyhash01"));

    const miss = await findMediaAssetByHash(shop.id, hash);
    expect(miss).toBeNull();

    const fileId = `2026/08/19/${crypto.randomUUID()}.jpg`;
    await claimMediaAsset({ shopId: shop.id, hash, fileId, contentType: "image/jpeg", size: 5 });

    const hit = await findMediaAssetByHash(shop.id, hash);
    expect(hit?.fileId).toBe(fileId);
  });
});

describe("media-asset.service — reconcileUploadedFile (path C primitive)", () => {
  // ครอบเฉพาะ correctness ระดับฟังก์ชัน — เทสระดับ route (TC-COMMIT-*) เป็นของ S-5
  it("ไฟล์ใหม่จริง (unique) — คืน fileId เดิม, ลงทะเบียนเป็น survivor", async () => {
    const shop = await createTestShop("reconcile01");
    const buf = randomBuffer("reconcile01");
    const uploadedFileId = await writeUploadedFileDirectlyToStorage(buf, "png");

    const result = await reconcileUploadedFile({
      shopId: shop.id,
      fileId: uploadedFileId,
      contentType: "image/png",
      size: buf.length,
    });

    expect(result.fileId).toBe(uploadedFileId);
    const row = await prisma.mediaAsset.findFirst({ where: { shopId: shop.id, fileId: uploadedFileId } });
    expect(row).not.toBeNull();
  });

  it("ไฟล์ซ้ำกับที่มีอยู่แล้ว — คืน fileId ของ survivor เดิม และลบไฟล์ที่เพิ่ง PUT ทิ้ง", async () => {
    const shop = await createTestShop("reconcile02");
    const buf = randomBuffer("reconcile02");

    // จำลองไฟล์เดิมที่มีอยู่แล้ว (survivor) ผ่าน writeDedupedFile ปกติ
    const survivorFileId = await writeDedupedFile(buf, "image/png", {
      shopId: shop.id,
      filenamePrefix: "reconcile02-original",
    });

    // จำลอง client PUT ไฟล์เนื้อหาเดียวกันตรงเข้า storage มาแล้ว (คนละ fileId)
    const uploadedFileId = await writeUploadedFileDirectlyToStorage(buf, "png");

    const result = await reconcileUploadedFile({
      shopId: shop.id,
      fileId: uploadedFileId,
      contentType: "image/png",
      size: buf.length,
    });

    expect(result.fileId).toBe(survivorFileId);
    const readUploaded = await getFile(uploadedFileId);
    expect(readUploaded).toBeNull(); // ไฟล์ที่เพิ่ง PUT ถูกลบทิ้งแล้ว (ซ้ำกับ survivor)

    const count = await prisma.mediaAsset.count({ where: { shopId: shop.id } });
    expect(count).toBe(1); // ไม่มีการสร้างแถวใหม่ซ้ำ
  });

  it("getFile คืน null (ไฟล์หายจาก storage หลัง PUT) — throw ให้ผู้เรียกชั้นบนจัดการ (ไม่กลืน error เอง)", async () => {
    const shop = await createTestShop("reconcile03");
    await expect(
      reconcileUploadedFile({
        shopId: shop.id,
        fileId: `2026/08/19/${crypto.randomUUID()}-does-not-exist.png`,
        contentType: "image/png",
        size: 10,
      }),
    ).rejects.toThrow();
  });
});

// จำลอง "client PUT ไฟล์ตรงเข้า storage มาแล้ว" (path C) — เขียนผ่าน saveFile ตรง ๆ (ไม่ผ่าน
// writeDedupedFile เพราะ path C ไม่เคยเรียก writeDedupedFile เลยตาม SRS §3.0)
async function writeUploadedFileDirectlyToStorage(buf: Buffer, ext: string): Promise<string> {
  const { saveFile } = await import("@/lib/storage");
  const file = new File([buf as unknown as ArrayBuffer], `direct-upload-${Date.now()}.${ext}`, {
    type: `image/${ext}`,
  });
  return saveFile(file, { skipValidation: true });
}
