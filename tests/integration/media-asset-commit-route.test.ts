/**
 * tests/integration/media-asset-commit-route.test.ts — feature 00051 (Chat Media Deduplication), S-5
 *
 * ครอบ POST /api/uploads/commit (path C, TFR-CMD-10/11) ตาม
 * docs/20 - Features/00051 - Chat Media Deduplication/TestCase.md §2.5 — TC-COMMIT-01/02/03,
 * TC-PATHC-SCOPE-01/02/03 เรียกผ่าน route handler จริง (POST) ไม่ mock DB/storage เลย ยกเว้น
 * `reconcileUploadedFile` ที่ mock เฉพาะ TC-COMMIT-03 (จำลอง reconcile ล้มเหลว) — ทุกเทสอื่นแตะ
 * Postgres จริง + local storage driver จริง (Hard Rule 13 — local Docker เท่านั้น)
 *
 * รันด้วย: npx dotenv -e .env -- npx vitest run tests/integration/media-asset-commit-route.test.ts
 *
 * 🛑 TC-PATHC-SCOPE-01/02 จงใจแนบ `conversationId` แม้ purpose='IMAGE'/'DOCUMENT' — ถ้าทดสอบด้วย
 * ticket ที่ไม่มี conversationId เฉย ๆ (แบบที่ ticket route จริงจะทำ) มันจะผ่านได้แม้ถอดเงื่อนไข
 * `claim.purpose === 'CHAT'` ออกจาก route ไปแล้ว (เพราะ `claim.conversationId` เพียงอย่างเดียวก็
 * falsy อยู่ดี) — ต้องพิสูจน์ guard ตัวจริงแยกจาก guard เรื่อง conversationId (TC-PATHC-SCOPE-03)
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma as testPrisma, deleteTestData } from "../setup";
// 🛑 ใช้ instance เดียวกับที่ route/service import จริง (@/lib/prisma) — ไม่ใช่ testPrisma ของ
// tests/setup.ts (บทเรียนจาก media-asset-dedup.test.ts: คนละ instance = mock/assert ไม่ตรงกัน)
import { prisma } from "@/lib/prisma";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

// mock เฉพาะ reconcileUploadedFile (TC-COMMIT-03 ต้องจำลองล้มเหลว) — export อื่นทั้งหมดเป็นของจริง
// (claimMediaAsset ใช้ตั้ง survivor row ล่วงหน้าใน TC-COMMIT-01 — ไม่ mock)
let reconcileShouldFail = false;
vi.mock("@/services/media-asset.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/media-asset.service")>();
  return {
    ...actual,
    reconcileUploadedFile: vi.fn(async (opts: Parameters<typeof actual.reconcileUploadedFile>[0]) => {
      if (reconcileShouldFail) throw new Error("[test] simulated reconcile failure (TC-COMMIT-03)");
      return actual.reconcileUploadedFile(opts);
    }),
  };
});

// import หลัง vi.mock (hoisted โดย vitest — เขียนแบบนี้ให้ชัดเจนสำหรับคนอ่านตาม pattern เดิมของไฟล์
// tests/integration/media-asset-dedup.test.ts)
import { getServerSession } from "next-auth";
import { POST } from "@/app/api/uploads/commit/route";
import { saveFile, getFile, deleteFile as realDeleteFile } from "@/lib/storage";
import { signUploadTicket } from "@/lib/upload-ticket";
import { uploadMaxSize } from "@/lib/upload-policy";
import { claimMediaAsset } from "@/services/media-asset.service";
import { sha256Hex } from "@/lib/media-hash";

let userIds: string[] = [];
let shopIds: string[] = [];
const writtenFileIds: string[] = [];

async function createTestShop(suffix: string) {
  const user = await testPrisma.user.create({
    data: { displayName: `CommitRouteUser ${suffix}`, username: `mac_${suffix}_${Date.now()}` },
  });
  userIds.push(user.id);
  const shop = await testPrisma.shop.create({
    data: { userId: user.id, shopName: `CommitRoute Shop ${suffix}`, businessType: "INDIVIDUAL" },
  });
  shopIds.push(shop.id);
  return { user, shop };
}

// buyerUserId = ผู้ทดสอบเอง — เพื่อผ่าน resolveChatChannelForUser ด้วย `conv.buyerUserId === userId`
// โดยไม่ต้องตั้ง ShopMember (canAccessShop ไม่ถูกเรียกเลยเพราะ short-circuit ที่ OR ตัวแรก)
async function createTestConversation(shopId: string, buyerUserId: string) {
  return testPrisma.conversation.create({
    data: { shopId, buyerUserId, channel: "DEEP" },
  });
}

function randomBuffer(seed: string): Buffer {
  return Buffer.from(`commit-route-fixture:${seed}:${Math.random()}`, "utf8");
}

// จำลอง "client PUT ไฟล์ตรงเข้า storage มาแล้ว" (path C ไม่เคยเรียก writeDedupedFile — SRS §3.0)
async function writeRealFile(buf: Buffer, ext = "png", mime = "image/png"): Promise<string> {
  const file = new File([buf as unknown as ArrayBuffer], `test-upload.${ext}`, { type: mime });
  const fileId = await saveFile(file, { skipValidation: true });
  writtenFileIds.push(fileId);
  return fileId;
}

function postCommit(body: { ticket: string; name?: string; mime?: string }) {
  const req = new NextRequest("https://x.test/api/uploads/commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "test.png", mime: "image/png", ...body }),
  });
  return POST(req);
}

beforeEach(() => {
  userIds = [];
  shopIds = [];
  reconcileShouldFail = false;
});

afterEach(async () => {
  // MediaAsset ไม่มี FK ผูก Shop (comment ของ schema) — ต้องลบเองก่อน deleteTestData เหมือน
  // pattern ของ media-asset-dedup.test.ts
  if (shopIds.length > 0) {
    await prisma.mediaAsset.deleteMany({ where: { shopId: { in: shopIds } } });
  }
  // Conversation.shopId มี onDelete: Cascade ไปที่ Shop → deleteTestData ลบ shop แล้วพา
  // Conversation หายไปด้วยโดยอัตโนมัติ ไม่ต้องลบเอง
  await deleteTestData({ userIds, shopIds });
});

afterAll(async () => {
  for (const fileId of writtenFileIds) {
    await realDeleteFile(fileId).catch(() => {});
  }
});

describe("POST /api/uploads/commit — path C reconcile (S-5, TFR-CMD-10)", () => {
  // TC-COMMIT-01 (mandatory #12, blocker)
  it("TC-COMMIT-01 (blocker): ไฟล์ซ้ำกับ survivor เดิม — commit คืน fileId ของ survivor, ลบไฟล์ที่เพิ่ง PUT ทิ้ง", async () => {
    const { user, shop } = await createTestShop("commit01");
    const conv = await createTestConversation(shop.id, user.id);
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: user.id } } as never);

    const buf = randomBuffer("commit01");
    const hash = sha256Hex(buf);
    // survivor เดิม — ลงทะเบียนตรงด้วย claimMediaAsset โดยไม่ต้องมีไฟล์จริงบน disk (commit route
    // ไม่อ่านเนื้อไฟล์ของ survivor เลย แค่คืน fileId ของมัน)
    const survivorFileId = `2026/08/20/${crypto.randomUUID()}.png`;
    await claimMediaAsset({
      shopId: shop.id,
      hash,
      fileId: survivorFileId,
      contentType: "image/png",
      size: buf.length,
    });

    // จำลอง client PUT ไฟล์เนื้อหาเดียวกัน (คนละ fileId) ตรงเข้า storage มาแล้ว
    const uploadedFileId = await writeRealFile(buf);
    const ticket = signUploadTicket({
      fileId: uploadedFileId,
      userId: user.id,
      purpose: "CHAT",
      maxSize: uploadMaxSize("CHAT"),
      conversationId: conv.id,
    });

    const res = await postCommit({ ticket });
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.fileId).toBe(survivorFileId); // ≠ uploadedFileId (= claim.fileId เดิม)
    expect(body.fileId).not.toBe(uploadedFileId);

    const readUploaded = await getFile(uploadedFileId);
    expect(readUploaded).toBeNull(); // ไฟล์ที่เพิ่ง PUT ถูกลบทิ้งแล้ว

    const count = await prisma.mediaAsset.count({ where: { shopId: shop.id, hash } });
    expect(count).toBe(1); // ไม่เพิ่มแถวใหม่
  });

  // TC-COMMIT-02
  it("TC-COMMIT-02: ไฟล์ใหม่จริง (unique) — commit คืน fileId เดิม, ลงทะเบียนเป็น survivor", async () => {
    const { user, shop } = await createTestShop("commit02");
    const conv = await createTestConversation(shop.id, user.id);
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: user.id } } as never);

    const buf = randomBuffer("commit02");
    const uploadedFileId = await writeRealFile(buf);
    const ticket = signUploadTicket({
      fileId: uploadedFileId,
      userId: user.id,
      purpose: "CHAT",
      maxSize: uploadMaxSize("CHAT"),
      conversationId: conv.id,
    });

    const res = await postCommit({ ticket });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.fileId).toBe(uploadedFileId); // ไฟล์ตัวเองกลายเป็น survivor

    const row = await prisma.mediaAsset.findFirst({ where: { shopId: shop.id, fileId: uploadedFileId } });
    expect(row).not.toBeNull();
  });

  // TC-COMMIT-03 (blocker)
  it("TC-COMMIT-03 (blocker): reconcileUploadedFile ล้มเหลว — commit ยังตอบ 201 ด้วย claim.fileId เดิม ไม่ block การอัปโหลด", async () => {
    const { user, shop } = await createTestShop("commit03");
    const conv = await createTestConversation(shop.id, user.id);
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: user.id } } as never);

    reconcileShouldFail = true;

    const buf = randomBuffer("commit03");
    const uploadedFileId = await writeRealFile(buf);
    const ticket = signUploadTicket({
      fileId: uploadedFileId,
      userId: user.id,
      purpose: "CHAT",
      maxSize: uploadMaxSize("CHAT"),
      conversationId: conv.id,
    });

    const res = await postCommit({ ticket });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.fileId).toBe(uploadedFileId); // ไฟล์เดิม ไม่ block การอัปโหลด

    // ไฟล์ยังอยู่จริง (ไม่ถูกลบทิ้งเพราะ reconcile ล้มก่อนถึงขั้น deleteFile)
    const readUploaded = await getFile(uploadedFileId);
    expect(readUploaded).not.toBeNull();

    const row = await prisma.mediaAsset.findFirst({ where: { shopId: shop.id, fileId: uploadedFileId } });
    expect(row).toBeNull(); // reconcile ล้มก่อนจะลงทะเบียนอะไรเลย
  });
});

describe("POST /api/uploads/commit — path C scope guard (S-5, TD-09/OOS-10)", () => {
  // TC-PATHC-SCOPE-01 (mandatory #11, blocker)
  it("TC-PATHC-SCOPE-01 (blocker): purpose=IMAGE เนื้อไฟล์ซ้ำ 2 ครั้ง แม้มี conversationId แนบมาด้วย — ต้องไม่ถูกแตะเลย", async () => {
    const { user, shop } = await createTestShop("scope01");
    const conv = await createTestConversation(shop.id, user.id);
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: user.id } } as never);

    const buf = randomBuffer("scope01");

    const fileA = await writeRealFile(buf);
    const ticketA = signUploadTicket({
      fileId: fileA,
      userId: user.id,
      purpose: "IMAGE",
      maxSize: uploadMaxSize("IMAGE"),
      conversationId: conv.id, // จงใจแนบแม้ purpose≠CHAT — ดูคอมเมนต์หัวไฟล์
    });
    const resA = await postCommit({ ticket: ticketA, mime: "image/png" });
    expect(resA.status).toBe(201);
    const bodyA = await resA.json();
    expect(bodyA.fileId).toBe(fileA);

    const fileB = await writeRealFile(buf); // เนื้อหาเดียวกันเป๊ะ
    const ticketB = signUploadTicket({
      fileId: fileB,
      userId: user.id,
      purpose: "IMAGE",
      maxSize: uploadMaxSize("IMAGE"),
      conversationId: conv.id,
    });
    const resB = await postCommit({ ticket: ticketB, mime: "image/png" });
    expect(resB.status).toBe(201);
    const bodyB = await resB.json();

    expect(bodyB.fileId).toBe(fileB); // ไม่ถูก dedup ไปเป็น fileA
    expect(bodyB.fileId).not.toBe(bodyA.fileId);

    const count = await prisma.mediaAsset.count({ where: { shopId: shop.id } });
    expect(count).toBe(0); // ไม่มีแถวถูกสร้างเลยจากทั้งสอง commit
  });

  // TC-PATHC-SCOPE-02
  it("TC-PATHC-SCOPE-02: purpose=DOCUMENT เนื้อไฟล์ซ้ำ 2 ครั้ง แม้มี conversationId แนบมาด้วย — ต้องไม่ถูกแตะเลย", async () => {
    const { user, shop } = await createTestShop("scope02");
    const conv = await createTestConversation(shop.id, user.id);
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: user.id } } as never);

    const buf = randomBuffer("scope02");

    const fileA = await writeRealFile(buf);
    const ticketA = signUploadTicket({
      fileId: fileA,
      userId: user.id,
      purpose: "DOCUMENT",
      maxSize: uploadMaxSize("DOCUMENT"),
      conversationId: conv.id,
    });
    const resA = await postCommit({ ticket: ticketA, mime: "image/png" });
    expect(resA.status).toBe(201);
    const bodyA = await resA.json();
    expect(bodyA.fileId).toBe(fileA);

    const fileB = await writeRealFile(buf);
    const ticketB = signUploadTicket({
      fileId: fileB,
      userId: user.id,
      purpose: "DOCUMENT",
      maxSize: uploadMaxSize("DOCUMENT"),
      conversationId: conv.id,
    });
    const resB = await postCommit({ ticket: ticketB, mime: "image/png" });
    expect(resB.status).toBe(201);
    const bodyB = await resB.json();

    expect(bodyB.fileId).toBe(fileB);
    expect(bodyB.fileId).not.toBe(bodyA.fileId);

    const count = await prisma.mediaAsset.count({ where: { shopId: shop.id } });
    expect(count).toBe(0);
  });

  // TC-PATHC-SCOPE-03
  it("TC-PATHC-SCOPE-03: purpose=CHAT แต่ไม่มี conversationId — ข้าม reconcile, พฤติกรรมเดิม", async () => {
    const { user } = await createTestShop("scope03");
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: user.id } } as never);

    const buf = randomBuffer("scope03");

    const fileA = await writeRealFile(buf);
    const ticketA = signUploadTicket({
      fileId: fileA,
      userId: user.id,
      purpose: "CHAT",
      maxSize: uploadMaxSize("CHAT"),
      // ไม่มี conversationId
    });
    const resA = await postCommit({ ticket: ticketA });
    expect(resA.status).toBe(201);
    const bodyA = await resA.json();
    expect(bodyA.fileId).toBe(fileA);

    const fileB = await writeRealFile(buf); // เนื้อหาเดียวกัน
    const ticketB = signUploadTicket({
      fileId: fileB,
      userId: user.id,
      purpose: "CHAT",
      maxSize: uploadMaxSize("CHAT"),
    });
    const resB = await postCommit({ ticket: ticketB });
    expect(resB.status).toBe(201);
    const bodyB = await resB.json();

    expect(bodyB.fileId).toBe(fileB); // ไม่ dedup — resolveChatChannelForUser ไม่ถูกเรียกเลย
    const row = await prisma.mediaAsset.findFirst({ where: { fileId: fileA } });
    expect(row).toBeNull(); // MediaAsset ไม่มีแถวใหม่จากทั้งสอง commit
  });
});
