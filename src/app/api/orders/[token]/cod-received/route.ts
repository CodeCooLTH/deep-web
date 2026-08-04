import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireActiveShop } from "@/lib/shop-context";
import { setCodReceived } from "@/services/order.service";
import { isCODPayment } from "@/lib/order-display";
import { prisma } from "@/lib/prisma";

/**
 * POST   /api/orders/[token]/cod-received  — ร้านกดยืนยันว่าได้รับเงินเก็บปลายทางแล้ว
 * DELETE /api/orders/[token]/cod-received  — ยกเลิกการกด (กดผิดใบ)
 *
 * ทำไมต้องให้คนกด ไม่ดึงจาก iShip: ดูรายการ `GET /api/order_statuses` ของ iShip เต็ม ๆ
 * (ยืนยันกับ user 2026-08-04) — ทั้ง 15 สถานะเป็นสถานะ *พัสดุ* ล้วน ไม่มีตัวไหนแปลว่า
 * "โอนเงินเข้าบัญชีร้านแล้ว" เลย · `payment_success` = เก็บเงินจากผู้ซื้อสำเร็จที่หน้าบ้าน
 * (คนละเรื่องกับรอบโอนเข้าร้าน) · `cod_refund` = รายการขอเงินคืน ซึ่งเป็นปัญหา
 * การกดเองจึงเป็นสัญญาณเดียวที่เชื่อได้ 100% เพราะมาจากคนที่เห็นเงินเข้าบัญชีจริง
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
    select: { id: true, paymentMethod: true, codReceivedAt: true },
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

  // ออเดอร์ที่ไม่ใช่เก็บเงินปลายทางไม่มีเงินให้ตาม — กดได้เท่ากับบันทึกข้อเท็จจริงที่ไม่มีอยู่
  if (!isCODPayment(r.order.paymentMethod)) {
    return NextResponse.json(
      { error: "คำสั่งซื้อนี้ไม่ใช่การเก็บเงินปลายทาง" },
      { status: 400 },
    );
  }

  const updated = await setCodReceived(r.order.id, r.userId);
  return NextResponse.json({ codReceivedAt: updated.codReceivedAt });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const r = await resolveOrder(token);
  if ("error" in r) return r.error;

  const updated = await setCodReceived(r.order.id, null, { clear: true });
  return NextResponse.json({ codReceivedAt: updated.codReceivedAt });
}
