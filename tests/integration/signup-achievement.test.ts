/**
 * tests/integration/signup-achievement.test.ts
 *
 * Integration test: สมัครสมาชิกใหม่ด้วย phone OTP จำลอง → ได้ achievement badge จริง
 *
 * Code path ที่ test ครอบคลุม (auth.ts):
 *   authorize() → verifyOtp() [mocked] → prisma.user.create + verificationRecord
 *   → evaluateSignupYearBadge(userId) [รันจริง]
 *
 * ทำไมเลือก service layer แทน authorize() โดยตรง:
 *   authorize() ไม่ถูก export จาก auth.ts (NextAuth ห่อไว้ใน closure) — ไม่สามารถเรียก
 *   โดยตรงใน test ได้. เลือกเรียก Prisma + badge service ที่ authorize() ใช้จริง ซึ่ง
 *   เป็น "code path จริง" ตาม spec. logic badge award รันจริงทุกบรรทัด (ไม่ mock).
 *
 * Mock OTP: vi.mock('@/lib/otp') — mock verifyOtp ให้ return true (bypass SMS)
 *   ป้องกันไม่ให้ส่ง SMS จริง. logic ทุกอย่างหลัง OTP (user create, badge award) รันจริง.
 *
 * ทำไมเก็บ userIds เอง (Hard Rule 13): user ในไฟล์นี้ถูกสร้างผ่าน simulatePhoneOtpSignup()
 * (service เป็นคนสร้าง ไม่ใช่เทสสร้างตรง ๆ) — ทุก helper ที่นี่ return ค่า user ที่สร้างแล้ว
 * เสมอ จึง push id ได้ทันทีที่ helper คืนค่า ไม่ต้อง query แบบ scope กว้าง
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, deleteTestData } from "../setup";
import {
  evaluateSignupYearBadge,
  evaluateBadges,
} from "@/services/badge.service";

// ── mock ตัวส่ง SMS/OTP external เท่านั้น — ห้าม mock badge/award logic ────────
// ทำไม: verifyOtp เป็น external-network call (ผ่าน apitel SMS API ใน prod)
// mock แค่ return true เพื่อ simulate "user กรอก OTP ถูก" โดยไม่ส่ง SMS จริง
vi.mock("@/lib/otp", () => ({
  verifyOtp: vi.fn().mockReturnValue(true),
  storeOtp: vi.fn().mockReturnValue("123456"),
  generateOtp: vi.fn().mockReturnValue("123456"),
  sendOtpViaSms: vi.fn().mockResolvedValue(undefined),
  consumeOtpRequestQuota: vi.fn().mockReturnValue(true),
  isTestAccount: vi.fn().mockReturnValue(false),
  toE164Thai: vi.fn((phone: string) => "+66" + phone.slice(1)),
}));

// ─── id ที่เทสสร้าง — เก็บไว้ลบเฉพาะของตัวเองใน afterEach (Hard Rule 13) ────────
// badgeNameENs แยกจาก deleteTestData เพราะ Badge เป็นตารางกลาง (nameEN @unique)
// ไม่ผูกกับ user/shop — ต้องลบเองแบบ scope ด้วยรายชื่อที่เทสสร้างจริงเท่านั้น
let userIds: string[] = [];
let shopIds: string[] = [];
let badgeNameENs: string[] = [];

// ทำไม findUnique ก่อนสร้างเสมอ: `{thisYear}_BADGE`/"First Sale" เป็นส่วนหนึ่งของ
// defaultBadges จริงที่ prisma/seed.ts upsert ไว้แล้วบน DB dev เครื่องนี้ (nameEN
// ชนกับของจริง โดยเฉพาะปีปัจจุบันที่ hardcode ไว้ใน badge-seed-data.ts) — สร้างทับ
// + track ไปลบโดยไม่เช็คก่อนจะลบ badge ที่ seed จริงทิ้ง (เกิดขึ้นจริงมาแล้วรอบหนึ่ง
// กับ "First Sale"/"Fully Verified" ในไฟล์พี่น้อง badge.test.ts — กู้คืนด้วย
// `npm run seed:local`) ต้อง track ใน badgeNameENs เฉพาะตัวที่เทสสร้างเองเท่านั้น
async function ensureTestBadge(data: Parameters<typeof prisma.badge.create>[0]["data"]) {
  const nameEN = (data as { nameEN: string }).nameEN;
  const existing = await prisma.badge.findUnique({ where: { nameEN } });
  if (existing) return existing;
  const created = await prisma.badge.create({ data });
  badgeNameENs.push(nameEN);
  return created;
}

// ── ฟังก์ชัน seed badge {year}_BADGE จาก defaultBadges (criteria SIGNUP_YEAR) ──
// เหมือน pattern badge.test.ts แต่ seed เฉพาะ badge ที่ test นี้ต้องการ
async function seedSignupYearBadges() {
  const thisYear = new Date().getFullYear();
  // {thisYear}_BADGE — test ใช้ getFullYear() จริงเสมอ จึง match ทุกปีที่รัน
  await ensureTestBadge({
    name: `สมาชิกปี ${thisYear}`,
    nameEN: `${thisYear}_BADGE`,
    icon: null,
    type: "ACHIEVEMENT",
    audience: "ANY",
    criteria: { type: "SIGNUP_YEAR", year: thisYear },
    imageUrl: `/images/badges/deep-${thisYear}.svg`,
  });
}

// ── helper จำลอง code path ของ authorize() ใน auth.ts ────────────────────────
// ทำไม: authorize() ไม่ถูก export — replicate exactly the user creation logic
// ที่ auth.ts lines 55-79 (prisma.user.create + verificationRecord nested create)
// เพื่อ test ว่า evaluateSignupYearBadge จะ award badge หลังจาก user สร้างจริง
async function simulatePhoneOtpSignup(phone: string, displayName: string, username: string) {
  // ตรวจ OTP ผ่าน mock (ใน real auth.ts เรียก verifyOtp ก่อนสร้าง user)
  const { verifyOtp } = await import("@/lib/otp");
  const otpValid = verifyOtp(phone, "123456");
  if (!otpValid) throw new Error("OTP ไม่ผ่าน (mock ผิด)");

  // สร้าง user + L1 PHONE_OTP verification — เหมือน auth.ts lines 55-79 ทุกบรรทัด
  const user = await prisma.user.create({
    data: {
      phone,
      displayName,
      username,
      authAccounts: {
        create: {
          provider: "PHONE",
          providerAccountId: phone,
        },
      },
      verifications: {
        create: {
          type: "PHONE_OTP",
          level: 1,
          status: "APPROVED",
          reviewedAt: new Date(),
        },
      },
    },
  });
  userIds.push(user.id); // เก็บ id ทันทีที่ service สร้าง user สำเร็จ

  // เรียก evaluateSignupYearBadge — เหมือน auth.ts line 118
  // รันจริง (ไม่ mock) เพื่อ verify ว่า badge logic ทำงานถูกต้องใน integration context
  await evaluateSignupYearBadge(user.id);

  return user;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("สมัครสมาชิกใหม่ → OTP จำลอง → ได้ achievement", () => {
  beforeEach(async () => {
    userIds = [];
    shopIds = [];
    badgeNameENs = [];
    await seedSignupYearBadges();
  });

  afterEach(async () => {
    await deleteTestData({ userIds, shopIds });
    if (badgeNameENs.length > 0) {
      await prisma.badge.deleteMany({ where: { nameEN: { in: badgeNameENs } } });
    }
  });

  // ── Test 1 (หลัก): signup ปีปัจจุบัน → ได้ SIGNUP_YEAR badge ────────────────
  it("Test 1: user สมัครใหม่ (phone OTP จำลอง) → ได้ badge สมาชิกปีปัจจุบัน", async () => {
    const thisYear = new Date().getFullYear();

    const user = await simulatePhoneOtpSignup(
      "0812345678",
      "ผู้ทดสอบหนึ่ง",
      `test_signup_${Date.now()}`,
    );

    // ตรวจว่า user ถูกสร้างใน DB
    expect(user.id).toBeTruthy();
    expect(user.phone).toBe("0812345678");

    // ตรวจ VerificationRecord L1 ถูกสร้าง (เหมือน auth.ts nested create)
    const verif = await prisma.verificationRecord.findFirst({
      where: { userId: user.id, type: "PHONE_OTP", level: 1, status: "APPROVED" },
    });
    expect(verif).toBeTruthy();

    // ตรวจ badge award หลัก: user ต้องได้ SIGNUP_YEAR badge ของปีปัจจุบัน
    const badges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      include: { badge: true },
    });
    const badgeNames = badges.map((b) => b.badge.nameEN);
    expect(badgeNames).toContain(`${thisYear}_BADGE`);
  });

  // ── Test 2 (boundary/negative): badge ปีอื่น ≠ ปีที่สมัคร → ไม่ได้ ──────────
  it("Test 2: badge SIGNUP_YEAR ปีอื่น → user สมัครปีนี้ ไม่ได้รับ badge นั้น", async () => {
    const thisYear = new Date().getFullYear();
    const otherYear = thisYear - 1; // ปีที่แล้ว

    // seed badge ปีที่แล้วเพิ่ม — user ที่สมัครปีนี้ไม่ควรได้
    await ensureTestBadge({
      name: `สมาชิกปี ${otherYear}`,
      nameEN: `${otherYear}_BADGE`,
      icon: null,
      type: "ACHIEVEMENT",
      audience: "ANY",
      criteria: { type: "SIGNUP_YEAR", year: otherYear },
    });

    const user = await simulatePhoneOtpSignup(
      "0898765432",
      "ผู้ทดสอบสอง",
      `test_signup_y2_${Date.now()}`,
    );

    const badges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      include: { badge: true },
    });
    const badgeNames = badges.map((b) => b.badge.nameEN);

    // ได้ badge ปีปัจจุบัน
    expect(badgeNames).toContain(`${thisYear}_BADGE`);
    // ไม่ได้ badge ปีที่แล้ว (criteria ไม่ตรง)
    expect(badgeNames).not.toContain(`${otherYear}_BADGE`);
  });

  // ── Test 3 (optional): สร้าง CONFIRMED order → evaluateBadges → ได้ First Sale ─
  it("Test 3: หลังสมัคร + สร้าง 1 CONFIRMED order → evaluateBadges → ได้ First Sale", async () => {
    // seed First Sale badge (FIRST_ORDER, audience SELLER)
    await ensureTestBadge({
      name: "เปิดหน้าร้าน",
      nameEN: "First Sale",
      type: "ACHIEVEMENT",
      audience: "SELLER",
      criteria: { type: "FIRST_ORDER" },
    });

    const user = await simulatePhoneOtpSignup(
      "0811111111",
      "ผู้ทดสอบสาม",
      `test_signup_y3_${Date.now()}`,
    );

    // สร้าง shop (seller onboarding path ใน auth.ts จะทำเมื่อ mode=signup+shopName)
    // ทำ manual create เพื่อ simulate flow ที่ครบสมบูรณ์
    const shop = await prisma.shop.create({
      data: {
        userId: user.id,
        shopName: "ร้านทดสอบ",
        businessType: "INDIVIDUAL",
      },
    });
    shopIds.push(shop.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { isShop: true },
    });

    // สร้าง 1 CONFIRMED order — เหมือน buyer ยืนยัน order ใน real flow
    await prisma.order.create({
      data: {
        shopId: shop.id,
        type: "DIGITAL",
        totalAmount: 500,
        status: "CONFIRMED",
        items: { create: { name: "สินค้าทดสอบ", qty: 1, price: 500 } },
      },
    });

    // evaluateBadges audience=SELLER — logic รันจริง (ไม่ mock)
    await evaluateBadges(user.id, "SELLER");

    const badges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      include: { badge: true },
    });
    const badgeNames = badges.map((b) => b.badge.nameEN);

    // ได้ First Sale จาก CONFIRMED order
    expect(badgeNames).toContain("First Sale");
    // ยังได้ SIGNUP_YEAR badge ด้วย (award ตอน signup, idempotent)
    const thisYear = new Date().getFullYear();
    expect(badgeNames).toContain(`${thisYear}_BADGE`);
  });
});
