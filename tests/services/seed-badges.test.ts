import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma, deleteTestData } from "../setup";
import { defaultBadges } from "../../prisma/badge-seed-data";
import { LUCIDE_FOR_BADGE } from "@/app/(paces)/seller/(dashboard)/_constants/badge-icons";
import { evaluateBadges } from "@/services/badge.service";

// P1 — 7 badge ใหม่ฝั่ง seller (ดู spec 2026-05-16-seller-achievements-p1-design.md §3)
const P1 = [
  { nameEN: "Getting Started", criteria: { type: "ORDER_COUNT", count: 10 }, imageUrl: "/images/badges/seller/getting-started.svg" },
  { nameEN: "Rising Seller", criteria: { type: "ORDER_COUNT", count: 25 }, imageUrl: "/images/badges/seller/rising-seller.svg" },
  { nameEN: "Well Rated", criteria: { type: "HIGH_RATING", minRating: 4.5, minReviews: 10 }, imageUrl: "/images/badges/seller/well-rated.svg" },
  { nameEN: "Getting Noticed", criteria: { type: "UNIQUE_REVIEWERS", count: 10 }, imageUrl: "/images/badges/seller/getting-noticed.svg" },
  { nameEN: "Spotless 100", criteria: { type: "ZERO_COMPLAINT", minOrders: 100 }, imageUrl: "/images/badges/seller/spotless-100.svg" },
  { nameEN: "3 Months Strong", criteria: { type: "VETERAN", minDays: 90 }, imageUrl: "/images/badges/seller/3-months-strong.svg" },
  { nameEN: "Same-Day Hero", criteria: { type: "FAST_SHIPPING", maxHours: 12, minOrders: 20 }, imageUrl: "/images/badges/seller/same-day-hero.svg" },
] as const;

describe("P1 — defaultBadges definitions", () => {
  it("มี 7 badge P1 ครบ + criteria/imageUrl เป๊ะ + ACHIEVEMENT/SELLER", () => {
    for (const want of P1) {
      const found = defaultBadges.find((b) => b.nameEN === want.nameEN);
      expect(found, `missing badge ${want.nameEN}`).toBeDefined();
      expect(found!.type).toBe("ACHIEVEMENT");
      expect(found!.audience).toBe("SELLER");
      expect(found!.criteria).toEqual(want.criteria);
      expect(found!.imageUrl).toBe(want.imageUrl);
    }
  });

  it("ทุก nameEN ของ P1 มี fallback ใน LUCIDE_FOR_BADGE", () => {
    for (const want of P1) {
      expect(LUCIDE_FOR_BADGE[want.nameEN], `no lucide fallback for ${want.nameEN}`).toBeTruthy();
    }
  });

  it("ไม่มี nameEN ซ้ำใน defaultBadges", () => {
    const names = defaultBadges.map((b) => b.nameEN);
    expect(new Set(names).size).toBe(names.length);
  });

  it("11 badge เดิมยังอยู่ (sanity)", () => {
    const names = defaultBadges.map((b) => b.nameEN);
    expect(names).toContain("First Sale");
    expect(names).toContain("Fully Verified");
  });
});

async function createConfirmedOrder(shopId: string) {
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

describe("P1 — engine dispatch ผ่าน DB จริง (ORDER_COUNT boundary)", () => {
  // ทำไม track badgeNameENs แยกจาก deleteTestData: Badge เป็นตารางกลาง (nameEN
  // @unique) ไม่ผูกกับ user/shop — deleteTestData ไม่รู้จักมัน ต้องลบเองแบบ scope
  // ด้วยรายชื่อที่เทสสร้างจริงเท่านั้น (Hard Rule 13)
  let userIds: string[] = [];
  let shopIds: string[] = [];
  let badgeNameENs: string[] = [];

  beforeEach(() => {
    userIds = [];
    shopIds = [];
    badgeNameENs = [];
  });

  afterEach(async () => {
    await deleteTestData({ userIds, shopIds });
    if (badgeNameENs.length > 0) {
      await prisma.badge.deleteMany({ where: { nameEN: { in: badgeNameENs } } });
    }
  });

  // ทำไม findUnique ก่อนสร้าง: "Getting Started" เป็นหนึ่งใน defaultBadges จริงที่
  // prisma/seed.ts upsert ไว้แล้วบน DB dev เครื่องนี้ (nameEN ชนกับของจริง) — สร้างทับ
  // + track ไปลบโดยไม่เช็คก่อนจะลบ badge ที่ seed จริงทิ้ง (เกิดขึ้นจริงมาแล้วรอบหนึ่ง
  // ตอนพัฒนาไฟล์นี้ — กู้คืนด้วย `npm run seed:local`) ต้อง track เฉพาะตัวที่เทสสร้างเอง
  async function ensureGettingStartedBadge() {
    const existing = await prisma.badge.findUnique({ where: { nameEN: "Getting Started" } });
    if (existing) return existing;
    const created = await prisma.badge.create({
      data: { name: "เริ่มมีลูกค้า", nameEN: "Getting Started", type: "ACHIEVEMENT", audience: "SELLER", criteria: { type: "ORDER_COUNT", count: 10 }, imageUrl: "/images/badges/seller/getting-started.svg" },
    });
    badgeNameENs.push("Getting Started");
    return created;
  }

  it("10 CONFIRMED order → award 'Getting Started' (criteria ORDER_COUNT count:10)", async () => {
    await ensureGettingStartedBadge();
    const user = await prisma.user.create({ data: { displayName: "S10", username: "s_gs10", isShop: true } });
    userIds.push(user.id);
    const shop = await prisma.shop.create({ data: { userId: user.id, shopName: "Shop10", businessType: "INDIVIDUAL" } });
    shopIds.push(shop.id);
    for (let i = 0; i < 10; i++) await createConfirmedOrder(shop.id);

    await evaluateBadges(user.id, "SELLER");

    const earned = await prisma.userBadge.findMany({ where: { userId: user.id }, include: { badge: true } });
    expect(earned.map((e) => e.badge.nameEN)).toContain("Getting Started");
  });

  it("9 CONFIRMED order → ยังไม่ award 'Getting Started' (boundary)", async () => {
    await ensureGettingStartedBadge();
    const user = await prisma.user.create({ data: { displayName: "S9", username: "s_gs9", isShop: true } });
    userIds.push(user.id);
    const shop = await prisma.shop.create({ data: { userId: user.id, shopName: "Shop9", businessType: "INDIVIDUAL" } });
    shopIds.push(shop.id);
    for (let i = 0; i < 9; i++) await createConfirmedOrder(shop.id);

    await evaluateBadges(user.id, "SELLER");

    const earned = await prisma.userBadge.findMany({ where: { userId: user.id }, include: { badge: true } });
    expect(earned.map((e) => e.badge.nameEN)).not.toContain("Getting Started");
  });
});
