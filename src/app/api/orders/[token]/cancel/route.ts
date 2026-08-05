import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cancelOrder, CancelReasonRequiredError, InvalidCancelReasonError } from "@/services/order.service";
import { prisma } from "@/lib/prisma";
import { canAccessShop } from "@/lib/shop-context";

// POST /api/orders/[token]/cancel
//
// Access model (feature 00015 TD-004 — session+ownership แทน phone-parity):
// ─────────────────────────────────────────────────────────────────────
// Seller  = session เข้าถึงร้านเจ้าของออเดอร์ได้ (owner หรือ BUSINESS admin ผ่าน canAccessShop
//           — เดิมเช็ค shop.userId ตรง ๆ ทำให้ admin ที่ถูกเชิญโดน 403 ทั้งที่เปิดหน้า
//           order detail ได้ เพราะหน้าใช้ requireActiveShop ซึ่งเป็น membership-based;
//           บั๊กคลาสเดียวกับที่เคยแก้ในแชท ดู comment ของ canAccessShop)
// Buyer   = session required + session.user.id === order.buyerUserId
//           (Order.buyerUserId ถูก guarantee ตรงกับ session มาก่อนแล้วโดย
//           Access Gate ของหน้า /o/[token] — ไม่มี guest-cancel อีกต่อไป)
// cancelInitiator ถูก derive จาก session เสมอ — ไม่รับจาก body (ป้องกัน spoofing)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // โหลด order ก่อน session check เพื่อป้องกัน timing leak
  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    include: { shop: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;

  const isSellerMember =
    !!sessionUserId && (await canAccessShop(order.shopId, sessionUserId));
  const isBuyerOwner = !!sessionUserId && sessionUserId === order.buyerUserId;

  let initiator: "seller" | "buyer";

  if (isSellerMember) {
    initiator = "seller";
  } else if (isBuyerOwner) {
    initiator = "buyer";
  } else {
    // ไม่ใช่สมาชิกร้าน และไม่ใช่ buyer-owner (รวมเคส order.buyerUserId == null
    // — ไม่มีใครยกเลิกได้ยกเว้น seller)
    return NextResponse.json(
      { error: "ไม่มีสิทธิ์ยกเลิกคำสั่งซื้อนี้" },
      { status: 403 },
    );
  }

  try {
    // feature 00017 — รับ reason จาก body (บังคับเมื่อเจ้าของยกเลิกการจอง)
    // cancelInitiator ยัง derive จาก session เหมือนเดิม ห้ามรับจาก body (กันปลอม)
    const body = await request.json().catch(() => null);
    const reason = typeof body?.reason === "string" ? body.reason : undefined;

    // cancelOrder → assertTransition → throw ถ้า cancel-after-CONFIRMED
    const updated = await cancelOrder(token, initiator, reason, sessionUserId ?? null);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err instanceof CancelReasonRequiredError) {
      return NextResponse.json({ error: "เลือกเหตุผลก่อนยกเลิกการจอง" }, { status: 400 });
    }
    if (err instanceof InvalidCancelReasonError) {
      return NextResponse.json({ error: "เหตุผลที่เลือกไม่อยู่ในรายการ" }, { status: 400 });
    }
    // assertTransition throw → 400 (invalid state transition, เช่น cancel-after-CONFIRMED)
    const message = err instanceof Error ? err.message : "Cancel failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
