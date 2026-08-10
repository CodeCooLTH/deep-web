import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 วันล่าสุด
  const [
    totalUsers,
    totalShops,
    totalOrders,
    pendingVerifications,
    avgTrustScore,
    confirmedOrders,
    cancelledOrders,
    ratingAgg,
    recentOrders,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isShop: true } }),
    prisma.order.count(),
    prisma.verificationRecord.count({ where: { status: "PENDING" } }),
    prisma.user.aggregate({ _avg: { trustScore: true } }),
    // Completion Rate = CONFIRMED / (CONFIRMED + CANCELLED) (PRD §9.1)
    prisma.order.count({ where: { status: "CONFIRMED" } }),
    prisma.order.count({ where: { status: "CANCELLED" } }),
    prisma.review.aggregate({ _avg: { rating: true }, where: { deletedAt: null } }),
    // Active Users = user (buyer/เจ้าของร้าน) ที่มี order ใน 30 วัน
    prisma.order.findMany({
      where: { createdAt: { gte: since } },
      select: { buyerUserId: true, shop: { select: { userId: true } } },
    }),
  ]);

  const completedDenom = confirmedOrders + cancelledOrders;
  const completionRate =
    completedDenom > 0 ? Math.round((confirmedOrders / completedDenom) * 100) : 0;
  const avgRating = Math.round((ratingAgg._avg.rating ?? 0) * 10) / 10;

  const activeUserIds = new Set<string>();
  for (const o of recentOrders) {
    if (o.buyerUserId) activeUserIds.add(o.buyerUserId);
    if (o.shop?.userId) activeUserIds.add(o.shop.userId);
  }

  return NextResponse.json({
    totalUsers,
    totalShops,
    totalOrders,
    pendingVerifications,
    avgTrustScore: Math.round(avgTrustScore._avg.trustScore || 0),
    completionRate,
    avgRating,
    activeUsers: activeUserIds.size,
  });
}
