import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { setCodReceived } from "@/services/order.service";
import { isCODPayment } from "@/lib/order-display";
import { prisma } from "@/lib/prisma";

/**
 * POST   /api/orders/[token]/cod-received  — ร้านกดยืนยันว่าได้รับเงินเก็บปลายทางแล้ว
 * DELETE /api/orders/[token]/cod-received  — ยกเลิกการกด (กดผิดใบ)
 *
 * เส้นทางนี้ไม่ใช่ทางเดียวอีกต่อไป (2026-08-06): รอบ sync ของ iShip เขียนช่องเดียวกันนี้
 * ได้ด้วยเมื่อขนส่งแจ้ง `settlement_at` (BR-ISHIP-45/48, ดู settleCodFromCarrier ใน
 * order.service) — ใครมาก่อนได้ก่อน ระบบไม่ทับค่าที่ร้านกดไว้แล้ว
 *
 * เดิมคอมเมนต์ตรงนี้เขียนว่า "ทั้ง 15 สถานะของ iShip เป็นสถานะพัสดุล้วน ไม่มีตัวไหนแปลว่า
 * โอนเงินเข้าบัญชีร้าน" — 2026-08-06 ยิง API จริงแล้วพบว่าไม่จริง: payload ของ
 * `query_orders`/`get_order` มี `settlement_at` ตรงตัว (= "เงินเข้าระบบ" บนหน้าจอ iShip)
 * ข้อสรุปเดิมมาจากการดูแค่ตาราง `order_statuses` โดยไม่เคยเปิดดู payload ของพัสดุจริง
 *
 * ปุ่มนี้ยังต้องมีอยู่: พัสดุที่เงินเข้าช้ากว่าช่วง 6 วันที่ sync ขอได้ และใบที่ร้านรับเงินสด
 * นอกระบบ iShip ยังต้องพึ่งคนกดอยู่เหมือนเดิม
 *
 * สิทธิ์: สมาชิกของร้านที่เป็นเจ้าของออเดอร์เท่านั้น (ผ่าน requireActiveShop ซึ่ง guard
 * membership ให้อยู่แล้ว) — ผู้ซื้อกดไม่ได้ ไม่ว่ากรณีใด
 */
async function resolveOrder(token: string, gate: { shopId: string; userId: string }) {
  // scope shopId ใน WHERE — ออเดอร์ของร้านอื่นต้องหาไม่เจอ ไม่ใช่หาเจอแล้วค่อยปฏิเสธ
  const order = await prisma.order.findFirst({
    where: { publicToken: token, shopId: gate.shopId },
    select: { id: true, paymentMethod: true, codReceivedAt: true },
  });
  if (!order) return { error: NextResponse.json({ error: "ไม่พบคำสั่งซื้อนี้" }, { status: 404 }) };

  return { order, userId: gate.userId };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const gate = await requireShopCapability(await getServerSession(authOptions), "O5");
  if (!gate.ok) return gate.response;
  const r = await resolveOrder(token, gate);
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
  const gate = await requireShopCapability(await getServerSession(authOptions), "O5");
  if (!gate.ok) return gate.response;
  const r = await resolveOrder(token, gate);
  if ("error" in r) return r.error;

  const updated = await setCodReceived(r.order.id, null, { clear: true });
  return NextResponse.json({ codReceivedAt: updated.codReceivedAt });
}
