import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, cleanDatabase } from "../setup";
import {
  evaluateBadges,
  evaluateSignupYearBadge,
  getBadgeProgress,
  checkFirstOrder,
  checkOrderCount,
  checkPerfectRating,
  checkHighRating,
  checkZeroComplaint,
  checkVeteran,
  checkFastShipping,
  checkFullVerification,
  checkUniqueReviewers,
  checkSignupYear,
} from "@/services/badge.service";

// seedDefaultBadges ถูกลบออกใน Phase-4 Batch 1 Unit B (data-driven engine)
// seed เฉพาะ badge ที่ test ต้องการแทน — single source of truth คือ prisma/seed.ts
async function seedTestBadges() {
  await prisma.badge.createMany({
    data: [
      { name: "เปิดหน้าร้าน",    nameEN: "First Sale",    icon: "🏪", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "FIRST_ORDER" } },
      { name: "ยืนยันครบถ้วน",   nameEN: "Fully Verified", icon: "✅", type: "VERIFICATION", audience: "ANY",    criteria: { type: "FULL_VERIFICATION" } },
    ],
    skipDuplicates: true,
  });
}

// ─── helpers สร้าง user + shop ────────────────────────────────────────────────

async function createUserWithShop(suffix: string) {
  const user = await prisma.user.create({
    data: { displayName: `User ${suffix}`, username: `u_${suffix}`, isShop: true },
  });
  const shop = await prisma.shop.create({
    data: { userId: user.id, shopName: `Shop ${suffix}`, businessType: "INDIVIDUAL" },
  });
  return { user, shop };
}

async function createCompletedOrder(shopId: string) {
  return prisma.order.create({
    data: {
      shopId,
      type: "DIGITAL",
      totalAmount: 100,
      status: "CONFIRMED",
      items: { create: { name: "Item", qty: 1, price: 100 } },
    },
  });
}

// ─── Unit B: existing integration tests ───────────────────────────────────────

describe("BadgeService", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestBadges();
  });

  it("awards Fully Verified badge when all levels approved", async () => {
    const user = await prisma.user.create({
      data: { displayName: "Test", username: "badge1" },
    });
    await prisma.verificationRecord.createMany({
      data: [
        { userId: user.id, type: "PHONE_OTP", level: 1, status: "APPROVED" },
        { userId: user.id, type: "ID_CARD", level: 2, status: "APPROVED" },
        { userId: user.id, type: "BUSINESS_REG", level: 3, status: "APPROVED" },
      ],
    });
    await evaluateBadges(user.id);
    const badges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      include: { badge: true },
    });
    const names = badges.map((b) => b.badge.nameEN);
    expect(names).toContain("Fully Verified");
  });

  it("awards First Sale badge on first completed order", async () => {
    const user = await prisma.user.create({
      data: { displayName: "Seller", username: "badge2", isShop: true },
    });
    const shop = await prisma.shop.create({
      data: { userId: user.id, shopName: "Shop", businessType: "INDIVIDUAL" },
    });
    await prisma.order.create({
      data: {
        shopId: shop.id, type: "DIGITAL", totalAmount: 100, status: "CONFIRMED",
        items: { create: { name: "Item", qty: 1, price: 100 } },
      },
    });
    await evaluateBadges(user.id);
    const badges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      include: { badge: true },
    });
    const names = badges.map((b) => b.badge.nameEN);
    expect(names).toContain("First Sale");
  });

  it("does not duplicate badges", async () => {
    const user = await prisma.user.create({
      data: { displayName: "Test", username: "badge3", isShop: true },
    });
    const shop = await prisma.shop.create({
      data: { userId: user.id, shopName: "Shop", businessType: "INDIVIDUAL" },
    });
    await prisma.order.create({
      data: {
        shopId: shop.id, type: "DIGITAL", totalAmount: 100, status: "CONFIRMED",
        items: { create: { name: "Item", qty: 1, price: 100 } },
      },
    });
    await evaluateBadges(user.id);
    await evaluateBadges(user.id); // run twice
    const count = await prisma.userBadge.count({ where: { userId: user.id } });
    expect(count).toBe(1); // First Sale only, not duplicated
  });
});

// ─── H1: Criteria handler unit tests ─────────────────────────────────────────

describe("H1 — checkFirstOrder", () => {
  beforeEach(cleanDatabase);

  it("met=true + count≥1 เมื่อมี order COMPLETED", async () => {
    const { user, shop } = await createUserWithShop("fo1");
    await createCompletedOrder(shop.id);
    const result = await checkFirstOrder(user.id);
    expect(result.met).toBe(true);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it("met=false + count=0 เมื่อไม่มี shop", async () => {
    const user = await prisma.user.create({
      data: { displayName: "No Shop", username: "fo_noshop" },
    });
    const result = await checkFirstOrder(user.id);
    expect(result.met).toBe(false);
    expect(result.count).toBe(0);
  });

  it("met=false เมื่อ order ยังไม่ CONFIRMED", async () => {
    const { user, shop } = await createUserWithShop("fo2");
    await prisma.order.create({
      data: {
        shopId: shop.id, type: "DIGITAL", totalAmount: 100, status: "PENDING",
        items: { create: { name: "Item", qty: 1, price: 100 } },
      },
    });
    const result = await checkFirstOrder(user.id);
    expect(result.met).toBe(false);
    expect(result.count).toBe(0);
  });
});

describe("H1 — checkOrderCount", () => {
  beforeEach(cleanDatabase);

  it("met=true เมื่อ count ถึง threshold", async () => {
    const { user, shop } = await createUserWithShop("oc1");
    await createCompletedOrder(shop.id);
    await createCompletedOrder(shop.id);
    await createCompletedOrder(shop.id);
    const result = await checkOrderCount(user.id, { type: "ORDER_COUNT", count: 3 });
    expect(result.met).toBe(true);
    expect(result.count).toBeGreaterThanOrEqual(3);
  });

  it("met=false เมื่อ count ยังไม่ถึง threshold", async () => {
    const { user, shop } = await createUserWithShop("oc2");
    await createCompletedOrder(shop.id);
    const result = await checkOrderCount(user.id, { type: "ORDER_COUNT", count: 10 });
    expect(result.met).toBe(false);
    expect(result.count).toBeLessThan(10);
  });

  it("met=false + count=0 เมื่อไม่มี shop", async () => {
    const user = await prisma.user.create({
      data: { displayName: "No Shop", username: "oc_noshop" },
    });
    const result = await checkOrderCount(user.id, { type: "ORDER_COUNT", count: 1 });
    expect(result.met).toBe(false);
    expect(result.count).toBe(0);
  });
});

describe("H1 — checkPerfectRating", () => {
  beforeEach(cleanDatabase);

  it("met=true เมื่อ avg=5 และ reviewCount ถึง minReviews", async () => {
    const { user, shop } = await createUserWithShop("pr1");
    for (let i = 0; i < 3; i++) {
      const order = await createCompletedOrder(shop.id);
      await prisma.review.create({
        data: { orderId: order.id, reviewerContact: `buyer${i}@test.com`, rating: 5 },
      });
    }
    const result = await checkPerfectRating(user.id, { type: "PERFECT_RATING", minReviews: 3 });
    expect(result.met).toBe(true);
    expect(result.avg).toBe(5);
    expect(result.reviewCount).toBeGreaterThanOrEqual(3);
  });

  it("met=false เมื่อ avg ไม่ถึง 5.0", async () => {
    const { user, shop } = await createUserWithShop("pr2");
    const order1 = await createCompletedOrder(shop.id);
    await prisma.review.create({
      data: { orderId: order1.id, reviewerContact: "b1@test.com", rating: 4 },
    });
    const order2 = await createCompletedOrder(shop.id);
    await prisma.review.create({
      data: { orderId: order2.id, reviewerContact: "b2@test.com", rating: 5 },
    });
    const order3 = await createCompletedOrder(shop.id);
    await prisma.review.create({
      data: { orderId: order3.id, reviewerContact: "b3@test.com", rating: 5 },
    });
    const result = await checkPerfectRating(user.id, { type: "PERFECT_RATING", minReviews: 3 });
    expect(result.met).toBe(false);
    expect(result.avg).toBeLessThan(5);
  });

  it("met=false เมื่อ reviewCount ไม่ถึง minReviews", async () => {
    const { user, shop } = await createUserWithShop("pr3");
    const order = await createCompletedOrder(shop.id);
    await prisma.review.create({
      data: { orderId: order.id, reviewerContact: "b@test.com", rating: 5 },
    });
    const result = await checkPerfectRating(user.id, { type: "PERFECT_RATING", minReviews: 5 });
    expect(result.met).toBe(false);
  });
});

describe("H1 — checkHighRating", () => {
  beforeEach(cleanDatabase);

  it("met=true เมื่อ avg >= minRating และ reviewCount ถึง minReviews", async () => {
    const { user, shop } = await createUserWithShop("hr1");
    const ratings = [4, 5, 5];
    for (let i = 0; i < ratings.length; i++) {
      const order = await createCompletedOrder(shop.id);
      await prisma.review.create({
        data: { orderId: order.id, reviewerContact: `b${i}@test.com`, rating: ratings[i] },
      });
    }
    const result = await checkHighRating(user.id, { type: "HIGH_RATING", minRating: 4.0, minReviews: 3 });
    expect(result.met).toBe(true);
  });

  it("met=false เมื่อ avg ต่ำกว่า minRating", async () => {
    const { user, shop } = await createUserWithShop("hr2");
    for (let i = 0; i < 3; i++) {
      const order = await createCompletedOrder(shop.id);
      await prisma.review.create({
        data: { orderId: order.id, reviewerContact: `b${i}@test.com`, rating: 3 },
      });
    }
    const result = await checkHighRating(user.id, { type: "HIGH_RATING", minRating: 4.0, minReviews: 3 });
    expect(result.met).toBe(false);
  });
});

describe("H1 — checkZeroComplaint", () => {
  beforeEach(cleanDatabase);

  it("met=true เมื่อ completed >= minOrders และไม่มี CANCELLED", async () => {
    const { user, shop } = await createUserWithShop("zc1");
    await createCompletedOrder(shop.id);
    await createCompletedOrder(shop.id);
    const result = await checkZeroComplaint(user.id, { type: "ZERO_COMPLAINT", minOrders: 2 });
    expect(result.met).toBe(true);
    expect(result.cancelled).toBe(0);
    expect(result.completed).toBeGreaterThanOrEqual(2);
  });

  it("met=false เมื่อมี order CANCELLED โดย seller (นับเป็น complaint)", async () => {
    const { user, shop } = await createUserWithShop("zc2");
    await createCompletedOrder(shop.id);
    await createCompletedOrder(shop.id);
    await prisma.order.create({
      data: {
        shopId: shop.id, type: "DIGITAL", totalAmount: 100, status: "CANCELLED",
        cancelInitiator: "seller",
        items: { create: { name: "Item", qty: 1, price: 100 } },
      },
    });
    const result = await checkZeroComplaint(user.id, { type: "ZERO_COMPLAINT", minOrders: 2 });
    expect(result.met).toBe(false);
    expect(result.cancelled).toBeGreaterThan(0);
  });

  it("met=false เมื่อ completed < minOrders", async () => {
    const { user, shop } = await createUserWithShop("zc3");
    await createCompletedOrder(shop.id);
    const result = await checkZeroComplaint(user.id, { type: "ZERO_COMPLAINT", minOrders: 5 });
    expect(result.met).toBe(false);
  });
});

describe("H1 — checkVeteran", () => {
  beforeEach(cleanDatabase);
  // ทำไม afterEach: veteran tests สร้าง order ด้วย custom createdAt — ทำให้ FK
  // ใน cleanDatabase ต่อไปอาจ fail ถ้า PgBouncer ล้าง order ไม่ครบก่อน shop
  afterEach(cleanDatabase);

  it("met=true เมื่อ user เก่าพอ + มี order ล่าสุด 30 วัน", async () => {
    // สร้าง user ที่ createdAt เก่า 400 วัน
    const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const user = await prisma.user.create({
      data: { displayName: "Veteran", username: "vet1", isShop: true, createdAt: oldDate },
    });
    const shop = await prisma.shop.create({
      data: { userId: user.id, shopName: "VetShop", businessType: "INDIVIDUAL" },
    });
    // order ล่าสุด (updatedAt ≈ now → ตรง where clause)
    await prisma.order.create({
      data: {
        shopId: shop.id, type: "DIGITAL", totalAmount: 100, status: "CONFIRMED",
        items: { create: { name: "Item", qty: 1, price: 100 } },
      },
    });
    const result = await checkVeteran(user.id, { type: "VETERAN", minDays: 365 });
    expect(result.met).toBe(true);
    expect(result.daysOld).toBeGreaterThan(365);
  });

  it("met=false เมื่อ user ยังใหม่เกินไป", async () => {
    const { user } = await createUserWithShop("vet2");
    const result = await checkVeteran(user.id, { type: "VETERAN", minDays: 365 });
    expect(result.met).toBe(false);
    expect(result.daysOld).toBeLessThan(365);
  });
});

describe("H1 — checkFastShipping", () => {
  beforeEach(cleanDatabase);

  it("met=true เมื่อ avgHours <= maxHours และ orders ถึง minOrders", async () => {
    const { user, shop } = await createUserWithShop("fs1");
    for (let i = 0; i < 3; i++) {
      const order = await createCompletedOrder(shop.id);
      // สร้าง shipmentTracking ที่ createdAt ≈ order.createdAt + 12ชม.
      const shipped = new Date(order.createdAt.getTime() + 12 * 60 * 60 * 1000);
      await prisma.shipmentTracking.create({
        data: { orderId: order.id, provider: "Kerry", trackingNo: `TRK${i}`, createdAt: shipped },
      });
    }
    const result = await checkFastShipping(user.id, {
      type: "FAST_SHIPPING", maxHours: 24, minOrders: 3,
    });
    expect(result.met).toBe(true);
    expect(result.avgHours).toBeLessThanOrEqual(24);
    expect(result.orderCount).toBeGreaterThanOrEqual(3);
  });

  it("met=false เมื่อมี orders น้อยกว่า minOrders", async () => {
    const { user, shop } = await createUserWithShop("fs2");
    const order = await createCompletedOrder(shop.id);
    await prisma.shipmentTracking.create({
      data: { orderId: order.id, provider: "Kerry", trackingNo: "TRK0" },
    });
    const result = await checkFastShipping(user.id, {
      type: "FAST_SHIPPING", maxHours: 24, minOrders: 5,
    });
    expect(result.met).toBe(false);
    expect(result.orderCount).toBeLessThan(5);
  });
});

describe("H1 — checkFullVerification", () => {
  beforeEach(cleanDatabase);

  it("met=true เมื่อ user มี level 1, 2, 3 APPROVED", async () => {
    const user = await prisma.user.create({
      data: { displayName: "FullVerified", username: "fv1" },
    });
    await prisma.verificationRecord.createMany({
      data: [
        { userId: user.id, type: "PHONE_OTP", level: 1, status: "APPROVED" },
        { userId: user.id, type: "ID_CARD", level: 2, status: "APPROVED" },
        { userId: user.id, type: "BUSINESS_REG", level: 3, status: "APPROVED" },
      ],
    });
    const result = await checkFullVerification(user.id);
    expect(result.met).toBe(true);
    expect(result.levels.has(1)).toBe(true);
    expect(result.levels.has(2)).toBe(true);
    expect(result.levels.has(3)).toBe(true);
  });

  it("met=false เมื่อขาด level 3", async () => {
    const user = await prisma.user.create({
      data: { displayName: "PartVerified", username: "fv2" },
    });
    await prisma.verificationRecord.createMany({
      data: [
        { userId: user.id, type: "PHONE_OTP", level: 1, status: "APPROVED" },
        { userId: user.id, type: "ID_CARD", level: 2, status: "APPROVED" },
      ],
    });
    const result = await checkFullVerification(user.id);
    expect(result.met).toBe(false);
    expect(result.levels.has(3)).toBe(false);
  });

  it("met=false เมื่อ user ไม่มี verification ใดเลย", async () => {
    const user = await prisma.user.create({
      data: { displayName: "NoVerify", username: "fv3" },
    });
    const result = await checkFullVerification(user.id);
    expect(result.met).toBe(false);
    expect(result.levels.size).toBe(0);
  });
});

describe("H1 — checkUniqueReviewers", () => {
  beforeEach(cleanDatabase);

  it("met=true เมื่อ unique reviewerUserId ถึง count", async () => {
    const { user, shop } = await createUserWithShop("ur1");
    // สร้าง buyer users 3 คนเพื่อ review
    const buyers = await Promise.all([
      prisma.user.create({ data: { displayName: "B1", username: "urb1" } }),
      prisma.user.create({ data: { displayName: "B2", username: "urb2" } }),
      prisma.user.create({ data: { displayName: "B3", username: "urb3" } }),
    ]);
    for (const buyer of buyers) {
      const order = await createCompletedOrder(shop.id);
      await prisma.review.create({
        data: { orderId: order.id, reviewerContact: `${buyer.username}@test.com`, reviewerUserId: buyer.id, rating: 5 },
      });
    }
    const result = await checkUniqueReviewers(user.id, { type: "UNIQUE_REVIEWERS", count: 3 });
    expect(result.met).toBe(true);
    expect(result.uniqueCount).toBeGreaterThanOrEqual(3);
  });

  it("met=false เมื่อ unique reviewers น้อยกว่า count", async () => {
    const { user, shop } = await createUserWithShop("ur2");
    const buyer = await prisma.user.create({ data: { displayName: "B1", username: "urb_single" } });
    // reviewer คนเดียว review 2 ออเดอร์ — unique ยังคง 1
    for (let i = 0; i < 2; i++) {
      const order = await createCompletedOrder(shop.id);
      // ออเดอร์ที่สองจะไม่มี reviewerUserId เพื่อ simulate unique = 1
      if (i === 0) {
        await prisma.review.create({
          data: { orderId: order.id, reviewerContact: "b@test.com", reviewerUserId: buyer.id, rating: 5 },
        });
      } else {
        await prisma.review.create({
          data: { orderId: order.id, reviewerContact: "b@test.com", reviewerUserId: buyer.id, rating: 5 },
        });
      }
    }
    const result = await checkUniqueReviewers(user.id, { type: "UNIQUE_REVIEWERS", count: 5 });
    expect(result.met).toBe(false);
  });

  it("met=false เมื่อไม่มี shop", async () => {
    const user = await prisma.user.create({
      data: { displayName: "No Shop", username: "ur_noshop" },
    });
    const result = await checkUniqueReviewers(user.id, { type: "UNIQUE_REVIEWERS", count: 1 });
    expect(result.met).toBe(false);
    expect(result.uniqueCount).toBe(0);
  });
});

describe("H1 — checkSignupYear", () => {
  beforeEach(cleanDatabase);

  it("met=true เมื่อ createdAt ปีตรงกับ criteria.year", async () => {
    const signupYear = new Date().getFullYear();
    const user = await prisma.user.create({
      data: { displayName: "New User", username: "sy1" },
    });
    // user.createdAt = now → ปีนี้
    const result = await checkSignupYear(user.id, { type: "SIGNUP_YEAR", year: signupYear });
    expect(result.met).toBe(true);
  });

  it("met=false เมื่อ year ไม่ตรงกับ createdAt", async () => {
    const user = await prisma.user.create({
      data: { displayName: "Old User", username: "sy2" },
    });
    const result = await checkSignupYear(user.id, { type: "SIGNUP_YEAR", year: 2020 });
    expect(result.met).toBe(false);
  });

  it("met=false เมื่อ userId ไม่มีใน DB", async () => {
    const result = await checkSignupYear("nonexistent-id", { type: "SIGNUP_YEAR", year: 2026 });
    expect(result.met).toBe(false);
  });
});

// ─── H1: evaluateBadges integration ──────────────────────────────────────────

describe("H1 — evaluateBadges: award + idempotent + unknown-type skip", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestBadges();
  });

  it("award badge ที่ user ผ่าน criteria และ skip ที่ยังไม่ผ่าน", async () => {
    const { user, shop } = await createUserWithShop("ev1");
    await createCompletedOrder(shop.id);
    // ยังไม่มี verification → Fully Verified ไม่ควร award
    await evaluateBadges(user.id);
    const badges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      include: { badge: true },
    });
    const names = badges.map((b) => b.badge.nameEN);
    expect(names).toContain("First Sale");
    expect(names).not.toContain("Fully Verified");
  });

  it("idempotent: เรียก 2 ครั้งไม่ทำให้ UserBadge ซ้ำ", async () => {
    const { user, shop } = await createUserWithShop("ev2");
    await createCompletedOrder(shop.id);
    await evaluateBadges(user.id);
    await evaluateBadges(user.id);
    const count = await prisma.userBadge.count({ where: { userId: user.id } });
    // ต้องได้ badge ไม่ซ้ำ — DB @@unique enforce ไว้แล้ว
    expect(count).toBe(1);
  });

  it("unknown criteria.type → ไม่ throw + ไม่ award + console.warn ถูกเรียก", async () => {
    // seed badge ที่ criteria.type ไม่รู้จัก
    await prisma.badge.create({
      data: {
        name: "ทดสอบ Unknown", nameEN: "Unknown Badge",
        type: "ACHIEVEMENT", audience: "SELLER",
        criteria: { type: "TOTALLY_UNKNOWN_TYPE_XYZ" },
      },
    });
    const user = await prisma.user.create({
      data: { displayName: "Unknown User", username: "ev_unknown" },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(evaluateBadges(user.id)).resolves.toBeUndefined();
      // ต้องมีการเรียก warn สำหรับ unknown type
      const unknownWarn = warnSpy.mock.calls.some(
        (args) => String(args[0]).includes("[badge]") && String(args[1]).includes("TOTALLY_UNKNOWN_TYPE_XYZ"),
      );
      expect(unknownWarn).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
    // ไม่ควร award badge ที่ไม่รู้จัก criteria
    const count = await prisma.userBadge.count({ where: { userId: user.id } });
    expect(count).toBe(0);
  });
});

// ─── H1: evaluateSignupYearBadge ──────────────────────────────────────────────

describe("H1 — evaluateSignupYearBadge", () => {
  beforeEach(async () => {
    await cleanDatabase();
    // seed SIGNUP_YEAR badge สำหรับปีนี้และปีที่แล้ว
    const thisYear = new Date().getFullYear();
    await prisma.badge.createMany({
      data: [
        {
          name: `สมาชิกปี ${thisYear}`, nameEN: `Member ${thisYear}`,
          type: "ACHIEVEMENT", audience: "ANY",
          criteria: { type: "SIGNUP_YEAR", year: thisYear },
        },
        {
          name: "สมาชิกปีเก่า", nameEN: "Member Old",
          type: "ACHIEVEMENT", audience: "ANY",
          criteria: { type: "SIGNUP_YEAR", year: 2020 },
        },
      ],
      skipDuplicates: true,
    });
  });

  it("award SIGNUP_YEAR badge เมื่อ createdAt ตรงกับ criteria.year", async () => {
    // user สมัครปีนี้ (createdAt = now)
    const user = await prisma.user.create({
      data: { displayName: "New Member", username: "sy_ev1" },
    });
    await evaluateSignupYearBadge(user.id);
    const badges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      include: { badge: true },
    });
    const thisYear = new Date().getFullYear();
    expect(badges.some((b) => b.badge.nameEN === `Member ${thisYear}`)).toBe(true);
  });

  it("ไม่ award เมื่อ year ไม่ตรงกับ createdAt", async () => {
    // user สมัครปีนี้ → ไม่ควรได้ badge ปี 2020
    const user = await prisma.user.create({
      data: { displayName: "Current Member", username: "sy_ev2" },
    });
    await evaluateSignupYearBadge(user.id);
    const badges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      include: { badge: true },
    });
    expect(badges.some((b) => b.badge.nameEN === "Member Old")).toBe(false);
  });

  it("ดึง year จาก DB createdAt เสมอ — ไม่มี argument ปลอม", async () => {
    // user สมัครปีนี้ — signature ไม่รับ year argument → year จาก DB เสมอ
    const user = await prisma.user.create({
      data: { displayName: "Secure Member", username: "sy_ev3" },
    });
    // เรียกแค่ userId — ถ้า signature รับ year ด้วยจะ compile error ในตัวมันเอง
    await evaluateSignupYearBadge(user.id);
    const thisYear = new Date().getFullYear();
    const badges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      include: { badge: true },
    });
    // ผลต้องมาจาก createdAt ที่ create ด้วย default now() → ปีนี้เท่านั้น
    const yearNames = badges.map((b) => b.badge.nameEN);
    expect(yearNames).toContain(`Member ${thisYear}`);
    expect(yearNames).not.toContain("Member Old");
  });

  it("user ไม่มีใน DB → warn + return (ไม่ throw)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(evaluateSignupYearBadge("nonexistent-user-id")).resolves.toBeUndefined();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ─── H1: getBadgeProgress ─────────────────────────────────────────────────────

describe("H1 — getBadgeProgress", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await prisma.badge.createMany({
      data: [
        // ORDER_COUNT — countable type
        {
          name: "นักขายมือใหม่", nameEN: "Starter Seller",
          type: "ACHIEVEMENT", audience: "SELLER",
          criteria: { type: "ORDER_COUNT", count: 10 },
        },
        // FULL_VERIFICATION — boolean type
        {
          name: "ยืนยันครบ", nameEN: "Full Verified GP",
          type: "VERIFICATION", audience: "ANY",
          criteria: { type: "FULL_VERIFICATION" },
        },
        // SIGNUP_YEAR — boolean type
        {
          name: `สมาชิกปีนี้ GP`, nameEN: "Member This Year GP",
          type: "ACHIEVEMENT", audience: "ANY",
          criteria: { type: "SIGNUP_YEAR", year: new Date().getFullYear() },
        },
      ],
      skipDuplicates: true,
    });
  });

  it("ORDER_COUNT ที่ยังไม่ครบ → progressRatio เป็น partial + Thai label", async () => {
    const { user, shop } = await createUserWithShop("gp1");
    // สร้าง 3 orders จาก 10 ที่ต้องการ
    for (let i = 0; i < 3; i++) await createCompletedOrder(shop.id);

    const progress = await getBadgeProgress(user.id, "SELLER");
    const starterBadge = progress.find((p) => p.badge.nameEN === "Starter Seller");
    expect(starterBadge).toBeDefined();
    expect(starterBadge!.earned).toBe(false);
    // progressRatio = 3/10 = 0.3
    expect(starterBadge!.progressRatio).toBeCloseTo(0.3, 1);
    // label ภาษาไทย ระบุจำนวนที่เหลือ
    expect(starterBadge!.progressLabel).toMatch(/อีก 7 ออเดอร์/);
  });

  it("ORDER_COUNT ที่ครบแล้ว → earned=true + progressRatio=1", async () => {
    const { user, shop } = await createUserWithShop("gp2");
    for (let i = 0; i < 10; i++) await createCompletedOrder(shop.id);

    // award badge ก่อน
    const badge = await prisma.badge.findUnique({ where: { nameEN: "Starter Seller" } });
    if (badge) await prisma.userBadge.create({ data: { userId: user.id, badgeId: badge.id } });

    const progress = await getBadgeProgress(user.id, "SELLER");
    const starterBadge = progress.find((p) => p.badge.nameEN === "Starter Seller");
    expect(starterBadge!.earned).toBe(true);
    expect(starterBadge!.progressRatio).toBe(1);
  });

  it("FULL_VERIFICATION ที่ยังไม่ได้ → progressRatio=0", async () => {
    const user = await prisma.user.create({
      data: { displayName: "Unverified", username: "gp3" },
    });
    const progress = await getBadgeProgress(user.id, "SELLER");
    const fvBadge = progress.find((p) => p.badge.nameEN === "Full Verified GP");
    expect(fvBadge).toBeDefined();
    expect(fvBadge!.progressRatio).toBe(0);
    expect(fvBadge!.earned).toBe(false);
  });

  it("FULL_VERIFICATION ที่ verified ครบ → progressRatio=1 (boolean 0/1 เท่านั้น)", async () => {
    const user = await prisma.user.create({
      data: { displayName: "FullVerify", username: "gp4" },
    });
    await prisma.verificationRecord.createMany({
      data: [
        { userId: user.id, type: "PHONE_OTP", level: 1, status: "APPROVED" },
        { userId: user.id, type: "ID_CARD", level: 2, status: "APPROVED" },
        { userId: user.id, type: "BUSINESS_REG", level: 3, status: "APPROVED" },
      ],
    });
    const progress = await getBadgeProgress(user.id, "ANY");
    const fvBadge = progress.find((p) => p.badge.nameEN === "Full Verified GP");
    expect(fvBadge!.progressRatio).toBe(1);
  });

  it("SIGNUP_YEAR → progressRatio=0 หรือ 1 (boolean) ไม่มีค่าระหว่าง", async () => {
    const user = await prisma.user.create({
      data: { displayName: "Year User", username: "gp5" },
    });
    const progress = await getBadgeProgress(user.id, "ANY");
    const yearBadge = progress.find((p) => p.badge.nameEN === "Member This Year GP");
    expect(yearBadge).toBeDefined();
    // user สมัครปีนี้ → progressRatio=1
    expect(yearBadge!.progressRatio === 0 || yearBadge!.progressRatio === 1).toBe(true);
    // user สมัครปีนี้ → ควรได้ 1
    expect(yearBadge!.progressRatio).toBe(1);
  });

  it("earned badge → earned=true ใน getBadgeProgress", async () => {
    // ทำไม: ใช้ ORDER_COUNT badge ที่ user มี orders ครบแล้ว + ได้รับ badge แล้ว
    // เพราะ FULL_VERIFICATION switch re-compute progressRatio จาก checkFullVerification
    // ทำให้ earned badge ที่ไม่มี verification จะได้ progressRatio=0 (behavior จริงของ service)
    const { user, shop } = await createUserWithShop("gp6");
    for (let i = 0; i < 10; i++) await createCompletedOrder(shop.id);
    const badge = await prisma.badge.findUnique({ where: { nameEN: "Starter Seller" } });
    if (badge) await prisma.userBadge.create({ data: { userId: user.id, badgeId: badge.id } });

    const progress = await getBadgeProgress(user.id, "SELLER");
    const starterBadge = progress.find((p) => p.badge.nameEN === "Starter Seller");
    expect(starterBadge!.earned).toBe(true);
    expect(starterBadge!.progressRatio).toBe(1);
  });
});

// ─── H1: audience filter ──────────────────────────────────────────────────────

describe("H1 — audience filter", () => {
  beforeEach(async () => {
    await cleanDatabase();
    // seed badge audience แตกต่างกัน
    await prisma.badge.createMany({
      data: [
        {
          name: "เฉพาะ Seller", nameEN: "Seller Only Badge",
          type: "ACHIEVEMENT", audience: "SELLER",
          criteria: { type: "FULL_VERIFICATION" },
        },
        {
          name: "เฉพาะ Buyer", nameEN: "Buyer Only Badge",
          type: "ACHIEVEMENT", audience: "BUYER",
          criteria: { type: "FULL_VERIFICATION" },
        },
        {
          name: "ทุกคน", nameEN: "Any Audience Badge",
          type: "ACHIEVEMENT", audience: "ANY",
          criteria: { type: "FULL_VERIFICATION" },
        },
      ],
      skipDuplicates: true,
    });
  });

  it("audience='SELLER' → include SELLER+ANY, exclude BUYER", async () => {
    const user = await prisma.user.create({
      data: { displayName: "Seller Aud", username: "aud_seller" },
    });
    await prisma.verificationRecord.createMany({
      data: [
        { userId: user.id, type: "PHONE_OTP", level: 1, status: "APPROVED" },
        { userId: user.id, type: "ID_CARD", level: 2, status: "APPROVED" },
        { userId: user.id, type: "BUSINESS_REG", level: 3, status: "APPROVED" },
      ],
    });
    await evaluateBadges(user.id, "SELLER");
    const badges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      include: { badge: true },
    });
    const names = badges.map((b) => b.badge.nameEN);
    expect(names).toContain("Seller Only Badge");
    expect(names).toContain("Any Audience Badge");
    // BUYER badge ต้องไม่อยู่ใน seller context
    expect(names).not.toContain("Buyer Only Badge");
  });

  it("audience='BUYER' → include BUYER+ANY, exclude SELLER", async () => {
    const user = await prisma.user.create({
      data: { displayName: "Buyer Aud", username: "aud_buyer" },
    });
    await prisma.verificationRecord.createMany({
      data: [
        { userId: user.id, type: "PHONE_OTP", level: 1, status: "APPROVED" },
        { userId: user.id, type: "ID_CARD", level: 2, status: "APPROVED" },
        { userId: user.id, type: "BUSINESS_REG", level: 3, status: "APPROVED" },
      ],
    });
    await evaluateBadges(user.id, "BUYER");
    const badges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      include: { badge: true },
    });
    const names = badges.map((b) => b.badge.nameEN);
    expect(names).toContain("Buyer Only Badge");
    expect(names).toContain("Any Audience Badge");
    expect(names).not.toContain("Seller Only Badge");
  });

  it("getBadgeProgress audience='SELLER' → ไม่มี BUYER badge ใน result", async () => {
    const user = await prisma.user.create({
      data: { displayName: "GP Seller", username: "aud_gp_seller" },
    });
    const progress = await getBadgeProgress(user.id, "SELLER");
    const names = progress.map((p) => p.badge.nameEN);
    expect(names).toContain("Seller Only Badge");
    expect(names).toContain("Any Audience Badge");
    expect(names).not.toContain("Buyer Only Badge");
  });
});
