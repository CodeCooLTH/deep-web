import { describe, it, expect, beforeEach } from "vitest";
import { prisma, cleanDatabase } from "../setup";
import { evaluateBadges } from "@/services/badge.service";

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
        shopId: shop.id, type: "DIGITAL", totalAmount: 100, status: "COMPLETED",
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
        shopId: shop.id, type: "DIGITAL", totalAmount: 100, status: "COMPLETED",
        items: { create: { name: "Item", qty: 1, price: 100 } },
      },
    });
    await evaluateBadges(user.id);
    await evaluateBadges(user.id); // run twice
    const count = await prisma.userBadge.count({ where: { userId: user.id } });
    expect(count).toBe(1); // First Sale only, not duplicated
  });
});
