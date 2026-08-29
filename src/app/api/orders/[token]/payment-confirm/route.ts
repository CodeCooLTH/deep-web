import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireActiveShop } from "@/lib/shop-context";
import {
  setPaymentConfirmed,
  clearPaymentConfirmed,
  PaymentConfirmNotEligibleError,
} from "@/services/order.service";
import { prisma } from "@/lib/prisma";

/**
 * POST   /api/orders/[token]/payment-confirm  — ร้านยืนยันได้รับเงินโอน/พร้อมเพย์/เงินสด (feature 00062)
 * DELETE /api/orders/[token]/payment-confirm  — ยกเลิกการยืนยัน
 *
 * มิเรอร์โครง `cod-received/route.ts` เป๊ะ (ownership scope ที่ WHERE, session guard) แต่ครอบ
 * `paymentMethod ∈ {TRANSFER, PROMPTPAY, CASH}` เท่านั้น (COD ใช้ `/cod-received` เดิม — ห้ามปน)
 *
 * guard ทางธุรกิจ (PAYMENT_METHOD_NOT_ELIGIBLE — รวมเงื่อนไข COD/vertical/CANCELLED ทั้งหมด)
 * อยู่ที่ setPaymentConfirmed/clearPaymentConfirmed (`order.service.ts`) ไม่ใช่ inline ที่นี่
 * — เหตุผลเดียวกับ handover/route.ts: ต้องกันที่ service layer ให้ mutation test พิสูจน์ได้จริง
 *
 * ไม่เปลี่ยน Order.status ทั้งสองทาง (BR-PAY-02 — "ได้เงินแล้ว" กับ "ลูกค้าได้ของแล้ว" คนละแกน)
 *
 * สิทธิ์: สมาชิกของร้านที่เป็นเจ้าของออเดอร์เท่านั้น — ผู้ซื้อกดไม่ได้ ไม่ว่ากรณีใด
 */
async function resolveOrder(token: string) {
  const session = await getServerSession(authOptions);
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  ).catch(() => null);
  if (!active) return { error: NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 }) };

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
    const updated = await setPaymentConfirmed(r.order.id, r.userId);
    return NextResponse.json({ paymentConfirmedAt: updated.paymentConfirmedAt });
  } catch (err) {
    if (err instanceof PaymentConfirmNotEligibleError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[orders/payment-confirm] unexpected error (POST)", { token, err });
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
    const updated = await clearPaymentConfirmed(r.order.id, r.userId);
    return NextResponse.json({ paymentConfirmedAt: updated.paymentConfirmedAt });
  } catch (err) {
    if (err instanceof PaymentConfirmNotEligibleError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[orders/payment-confirm] unexpected error (DELETE)", { token, err });
    return NextResponse.json(
      { error: "ยกเลิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
