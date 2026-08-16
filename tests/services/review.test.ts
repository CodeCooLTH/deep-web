import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma, deleteTestData } from "../setup";
import { createReview } from "@/services/review.service";

describe("ReviewService", () => {
  let orderId: string;
  let orderToken: string;
  let buyerId: string;
  let userIds: string[] = [];
  let shopIds: string[] = [];

  beforeEach(async () => {
    userIds = [];
    shopIds = [];
    const user = await prisma.user.create({
      data: { displayName: "Seller", username: "rev_seller", isShop: true },
    });
    userIds.push(user.id);
    const buyer = await prisma.user.create({
      data: { displayName: "Buyer", username: "rev_buyer", phone: "0811111111" },
    });
    userIds.push(buyer.id);
    buyerId = buyer.id;
    const shop = await prisma.shop.create({
      data: { userId: user.id, shopName: "Shop", businessType: "INDIVIDUAL" },
    });
    shopIds.push(shop.id);
    const order = await prisma.order.create({
      data: {
        shopId: shop.id, type: "DIGITAL", totalAmount: 100, status: "CONFIRMED",
        buyerContact: "0811111111", buyerUserId: buyer.id,
        items: { create: { name: "Item", qty: 1, price: 100 } },
      },
    });
    orderId = order.id;
    orderToken = order.publicToken;
  });

  afterEach(async () => {
    await deleteTestData({ userIds, shopIds });
  });

  it("creates review for order", async () => {
    const review = await createReview(orderToken, {
      rating: 5,
      comment: "Great!",
      reviewerUserId: buyerId,
    });
    expect(review.rating).toBe(5);
    expect(review.orderId).toBe(orderId);
  });

  it("rejects duplicate review for same order", async () => {
    await createReview(orderToken, { rating: 5, reviewerUserId: buyerId });
    await expect(
      createReview(orderToken, { rating: 4, reviewerUserId: buyerId })
    ).rejects.toThrow();
  });
});
