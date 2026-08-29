import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireActiveShop } from "@/lib/shop-context";
import {
  setHandedOver,
  clearHandedOver,
  OrderNotPickupError,
  OrderHandoverNotPendingError,
  OrderHandoverAlreadyClosedError,
} from "@/services/order.service";
import { prisma } from "@/lib/prisma";

/**
 * POST   /api/orders/[token]/handover  — ร้านยืนยันว่ามอบสินค้าให้ผู้ซื้อในการนัดรับแล้ว (feature 00062)
 * DELETE /api/orders/[token]/handover  — ยกเลิกการยืนยัน (กดผิดใบ)
 *
 * มิเรอร์โครง `cod-received/route.ts` (ownership scope ที่ WHERE, session guard) — ต่างที่ guard
 * ทางธุรกิจ (NOT_PICKUP_ORDER/ORDER_NOT_PENDING/ORDER_ALREADY_CLOSED) อยู่ที่ setHandedOver/
 * clearHandedOver (`order.service.ts`) แทนที่จะ inline ที่นี่ — งานนี้สั่งชัดว่าด่าน "ขอบเขต
 * ONLINE_SALES" ต้องกันที่ service layer ไม่ใช่แค่ที่ route/UI เพื่อให้ mutation test พิสูจน์ได้จริง
 * (ถอดด่านออกจาก service ต้องทำให้เทสแดง) route ที่เหลือมีหน้าที่แค่แปล error class → HTTP status
 *
 * ไม่เปลี่ยน Order.status ทั้งสองทาง (FR-PKP-03 — คนละแกนกับ "ลูกค้าได้ของแล้ว")
 *
 * สิทธิ์: สมาชิกของร้านที่เป็นเจ้าของออเดอร์เท่านั้น (ผ่าน requireActiveShop ซึ่ง guard
 * membership ให้อยู่แล้ว) — ผู้ซื้อกดไม่ได้ ไม่ว่ากรณีใด
 */
async function resolveOrder(token: string) {
  const session = await getServerSession(authOptions);
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  ).catch(() => null);
  if (!active) return { error: NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 }) };

  // scope shopId ใน WHERE — ออเดอร์ของร้านอื่นต้องหาไม่เจอ ไม่ใช่หาเจอแล้วค่อยปฏิเสธ
  const order = await prisma.order.findFirst({
    where: { publicToken: token, shopId: active.shop.id },
    select: { id: true },
  });
  if (!order) return { error: NextResponse.json({ error: "ไม่พบคำสั่งซื้อนี้" }, { status: 404 }) };

  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  return { order, userId };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const r = await resolveOrder(token);
  if ("error" in r) return r.error;

  try {
    const updated = await setHandedOver(r.order.id, r.userId);
    return NextResponse.json({ handedOverAt: updated.handedOverAt });
  } catch (err) {
    if (err instanceof OrderNotPickupError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof OrderHandoverNotPendingError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[orders/handover] unexpected error (POST)", { token, err });
    return NextResponse.json(
      { error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const r = await resolveOrder(token);
  if ("error" in r) return r.error;

  try {
    const updated = await clearHandedOver(r.order.id, r.userId);
    return NextResponse.json({ handedOverAt: updated.handedOverAt });
  } catch (err) {
    if (err instanceof OrderHandoverAlreadyClosedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[orders/handover] unexpected error (DELETE)", { token, err });
    return NextResponse.json(
      { error: "ยกเลิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
