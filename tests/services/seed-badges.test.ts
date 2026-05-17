import { describe, it, expect, beforeEach } from "vitest";
import { prisma, cleanDatabase } from "../setup";
import { defaultBadges } from "../../prisma/badge-seed-data";
import { LUCIDE_FOR_BADGE } from "@/app/(paces)/seller/(dashboard)/_constants/badge-icons";
import { evaluateBadges } from "@/services/badge.service";

// P1 — 7 badge ใหม่ฝั่ง seller (ดู spec 2026-05-16-seller-achievements-p1-design.md §3)
const P1 = [
  { nameEN: "Getting Started", criteria: { type: "ORDER_COUNT", count: 10 }, imageUrl: "/badges/seller/getting-started.svg" },
  { nameEN: "Rising Seller", criteria: { type: "ORDER_COUNT", count: 25 }, imageUrl: "/badges/seller/rising-seller.svg" },
  { nameEN: "Well Rated", criteria: { type: "HIGH_RATING", minRating: 4.5, minReviews: 10 }, imageUrl: "/badges/seller/well-rated.svg" },
  { nameEN: "Getting Noticed", criteria: { type: "UNIQUE_REVIEWERS", count: 10 }, imageUrl: "/badges/seller/getting-noticed.svg" },
  { nameEN: "Spotless 100", criteria: { type: "ZERO_COMPLAINT", minOrders: 100 }, imageUrl: "/badges/seller/spotless-100.svg" },
  { nameEN: "3 Months Strong", criteria: { type: "VETERAN", minDays: 90 }, imageUrl: "/badges/seller/3-months-strong.svg" },
  { nameEN: "Same-Day Hero", criteria: { type: "FAST_SHIPPING", maxHours: 12, minOrders: 20 }, imageUrl: "/badges/seller/same-day-hero.svg" },
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
  beforeEach(cleanDatabase);

  it("10 CONFIRMED order → award 'Getting Started' (criteria ORDER_COUNT count:10)", async () => {
    await prisma.badge.create({
      data: { name: "เริ่มมีลูกค้า", nameEN: "Getting Started", icon: "🌱", type: "ACHIEVEMENT", audience: "SELLER", criteria: { type: "ORDER_COUNT", count: 10 }, imageUrl: "/badges/seller/getting-started.svg" },
    });
    const user = await prisma.user.create({ data: { displayName: "S10", username: "s_gs10", isShop: true } });
    const shop = await prisma.shop.create({ data: { userId: user.id, shopName: "Shop10", businessType: "INDIVIDUAL" } });
    for (let i = 0; i < 10; i++) await createConfirmedOrder(shop.id);

    await evaluateBadges(user.id, "SELLER");

    const earned = await prisma.userBadge.findMany({ where: { userId: user.id }, include: { badge: true } });
    expect(earned.map((e) => e.badge.nameEN)).toContain("Getting Started");
  });

  it("9 CONFIRMED order → ยังไม่ award 'Getting Started' (boundary)", async () => {
    await prisma.badge.create({
      data: { name: "เริ่มมีลูกค้า", nameEN: "Getting Started", icon: "🌱", type: "ACHIEVEMENT", audience: "SELLER", criteria: { type: "ORDER_COUNT", count: 10 }, imageUrl: "/badges/seller/getting-started.svg" },
    });
    const user = await prisma.user.create({ data: { displayName: "S9", username: "s_gs9", isShop: true } });
    const shop = await prisma.shop.create({ data: { userId: user.id, shopName: "Shop9", businessType: "INDIVIDUAL" } });
    for (let i = 0; i < 9; i++) await createConfirmedOrder(shop.id);

    await evaluateBadges(user.id, "SELLER");

    const earned = await prisma.userBadge.findMany({ where: { userId: user.id }, include: { badge: true } });
    expect(earned.map((e) => e.badge.nameEN)).not.toContain("Getting Started");
  });
});
