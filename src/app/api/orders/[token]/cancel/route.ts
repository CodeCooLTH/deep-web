import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cancelOrder } from "@/services/order.service";
import { prisma } from "@/lib/prisma";

// POST /api/orders/[token]/cancel
//
// Access model (Task 3 spec):
// - Route เป็น public — token possession = buyer access (model เดียวกับ confirmOrder)
// - ไม่ 401/403 ผู้ที่ไม่ได้ login หรือ non-owner — state machine คือ gate จริง
// - session-owner = seller; ทุกคนอื่น (guest หรือ logged-in non-owner) = buyer
// - cancelOrder → assertTransition ปฏิเสธ cancel หลัง CONFIRMED อัตโนมัติ
//   ดังนั้น buyer ไม่สามารถ cancel order ที่ confirmed แล้วได้ (state bound)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // โหลด order ก่อน — 404 ถ้าไม่พบ (ป้องกัน timing leak ของ session check)
  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    include: { shop: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // session optional — ไม่ 401 ถ้าไม่มี session (buyer อาจเป็น guest)
  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;

  // derive initiator: owner-with-session = seller, ทุกกรณีอื่น = buyer
  const initiator: "seller" | "buyer" =
    sessionUserId && sessionUserId === order.shop.userId ? "seller" : "buyer";

  try {
    const updated = await cancelOrder(token, initiator);
    return NextResponse.json(updated);
  } catch (err: any) {
    // assertTransition throw → 400 (invalid state transition, e.g. cancel-after-CONFIRMED)
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
