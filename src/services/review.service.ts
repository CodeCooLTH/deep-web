import { prisma } from "@/lib/prisma";
import { evaluateBadges, evaluateSellerBadgesForShop } from "@/services/badge.service";

export async function createReview(orderToken: string, data: {
  rating: number;
  comment?: string;
  reviewerContact?: string;
  reviewerUserId?: string;
}) {
  const order = await prisma.order.findUnique({
    where: { publicToken: orderToken },
    include: { review: true, shop: true },
  });
  if (!order) throw new Error("Order not found");
  if (order.review) throw new Error("Review already exists for this order");
  // State guard — รีวิวได้เฉพาะหลัง buyer ยืนยัน (CONFIRMED / SHIPPED); COMPLETED ถูกลบออกจาก OMS redesign
  // PRD FR-7.1: "Buyer ให้ review + rating ได้หลัง confirm order"
  if (!["CONFIRMED", "SHIPPED"].includes(order.status)) {
    throw new Error(`Cannot review order in status ${order.status} (must be CONFIRMED or later)`);
  }

  const review = await prisma.review.create({
    data: {
      orderId: order.id,
      rating: data.rating,
      comment: data.comment,
      reviewerContact: data.reviewerContact,
      reviewerUserId: data.reviewerUserId,
    },
  });

  // Review is persisted at this point. The post-create recalc is best-effort:
  // a transient Prisma error (e.g. connection pool timeout in dev with
  // connection_limit=1) should NOT fail the review request — the review row
  // is already saved. Log the failure so it's visible, not silent.
  try {
    // 00008 P5-2: scope เหมือน confirmOrder — business shop แยก badge ต่อร้าน, personal เดิม
    if (order.shop.kind === "BUSINESS") {
      await evaluateSellerBadgesForShop({ id: order.shop.id, userId: order.shop.userId, kind: order.shop.kind });
    } else {
      await evaluateBadges(order.shop.userId);
    }
  } catch (err) {
    console.error(
      `[review] post-create recalc failed for shop owner ${order.shop.userId}; review ${review.id} persisted but trust score / badges may be stale. Retry via admin tool.`,
      err,
    );
  }

  return review;
}

export async function getReviewsByBuyer(userId: string, take?: number) {
  return prisma.review.findMany({
    where: { reviewerUserId: userId },
    include: {
      order: {
        select: {
          publicToken: true,
          items: { take: 1 },
          shop: { select: { user: { select: { displayName: true, username: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    ...(take ? { take } : {}),
  });
}

export async function getReviewsByShopUser(userId: string) {
  return prisma.review.findMany({
    where: { order: { shop: { userId } } },
    include: { order: { select: { publicToken: true, items: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getReviewsByUsername(username: string, take = 10, skip = 0) {
  return prisma.review.findMany({
    where: { order: { shop: { user: { username } } } },
    include: { order: { select: { publicToken: true, items: true } } },
    orderBy: { createdAt: "desc" },
    take,
    skip,
  });
}

// คำนวณ avg rating + จำนวน review จาก review ทั้งหมดของร้าน
// ไม่ใช้ getReviewsByUsername เพราะมี take=10 ทำให้ avg ผิด (bug เดิม)
export async function getAvgRatingByUsername(
  username: string,
): Promise<{ avgRating: number; reviewCount: number }> {
  const agg = await prisma.review.aggregate({
    _avg: { rating: true },
    _count: { id: true },
    where: { order: { shop: { user: { username } } } },
  });
  return {
    avgRating: agg._avg.rating ?? 0,
    reviewCount: agg._count.id,
  };
}
