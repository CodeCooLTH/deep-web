import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cancelOrder } from "@/services/order.service";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the seller owns this order
  const userId = (session.user as any).id;
  const order = await prisma.order.findUnique({ where: { publicToken: token }, include: { shop: true } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.shop.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    // initiator derive จาก session — ไม่รับจาก client body (spec §2)
    const initiator: "seller" | "buyer" = order.shop.userId === userId ? "seller" : "buyer";
    const updated = await cancelOrder(token, initiator);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
