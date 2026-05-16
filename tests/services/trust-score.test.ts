import { describe, it, expect, beforeEach } from "vitest";
import { prisma, cleanDatabase } from "../setup";
import { recalculateTrustScore, getTrustLevel } from "@/services/trust-score.service";

describe("TrustScoreService", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("returns 0 for new user with no activity", async () => {
    const user = await prisma.user.create({
      data: { displayName: "Test", username: "test1" },
    });
    const score = await recalculateTrustScore(user.id);
    expect(score).toBe(0);
  });

  it("adds verification score for level 1 approval", async () => {
    const user = await prisma.user.create({
      data: { displayName: "Test", username: "test2" },
    });
    await prisma.verificationRecord.create({
      data: { userId: user.id, type: "PHONE_OTP", level: 1, status: "APPROVED" },
    });
    const score = await recalculateTrustScore(user.id);
    expect(score).toBe(10);
  });

  it("gives max 35 for level 3 verification", async () => {
    const user = await prisma.user.create({
      data: { displayName: "Test", username: "test3" },
    });
    await prisma.verificationRecord.createMany({
      data: [
        { userId: user.id, type: "PHONE_OTP", level: 1, status: "APPROVED" },
        { userId: user.id, type: "ID_CARD", level: 2, status: "APPROVED" },
        { userId: user.id, type: "BUSINESS_REG", level: 3, status: "APPROVED" },
      ],
    });
    const score = await recalculateTrustScore(user.id);
    expect(score).toBeGreaterThanOrEqual(35);
  });

  it("includes rating score when 3+ reviews exist", async () => {
    const seller = await prisma.user.create({
      data: { displayName: "Seller", username: "seller1", isShop: true },
    });
    const shop = await prisma.shop.create({
      data: { userId: seller.id, shopName: "Shop", businessType: "INDIVIDUAL" },
    });
    for (let i = 0; i < 3; i++) {
      const order = await prisma.order.create({
        data: {
          shopId: shop.id, type: "DIGITAL", totalAmount: 100, status: "CONFIRMED",
          items: { create: { name: "Item", qty: 1, price: 100 } },
        },
      });
      await prisma.review.create({
        data: { orderId: order.id, reviewerContact: `buyer${i}@test.com`, rating: 5 },
      });
    }
    const score = await recalculateTrustScore(seller.id);
    expect(score).toBeGreaterThanOrEqual(20);
  });

  it("getTrustLevel returns correct level", () => {
    expect(getTrustLevel(95)).toBe("A+");
    expect(getTrustLevel(85)).toBe("A");
    expect(getTrustLevel(75)).toBe("B+");
    expect(getTrustLevel(65)).toBe("B");
    expect(getTrustLevel(50)).toBe("C");
    expect(getTrustLevel(20)).toBe("D");
  });
});
