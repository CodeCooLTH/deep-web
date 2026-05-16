import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
// completeOrder ถูกลบใน OMS redesign Task 2 — terminal ใหม่คือ confirmOrder (CONFIRMED)
// route นี้ preserved เพื่อ backward compat แต่ redirect logic ไปที่ confirmOrder
// TODO(Task 4): ลบ route นี้เมื่อ UI อัปเดตครบ
import { confirmOrder } from "@/services/order.service";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
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
    // complete → confirm (terminal ใหม่); buyerContact ต้องมีอยู่แล้ว
    const updated = await confirmOrder(token, order.buyerContact ?? "");
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
