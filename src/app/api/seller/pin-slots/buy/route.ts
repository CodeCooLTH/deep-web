import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireActiveShop } from "@/lib/shop-context";
import { BuyPinSlotSchema } from "@/lib/validations";
import {
  buyPinSlotAndPin,
  PinProductNotFoundError,
  PinProductInactiveError,
} from "@/services/pin.service";

/**
 * POST /api/seller/pin-slots/buy — ซื้อ slot ฿99 (หัก SellerWallet) และปักหมุด productId
 * ในธุรกรรมเดียว (atomic). API.md §4.3 — เรียกจาก dialog ยืนยันหลังกด pin ขณะ slot เต็ม
 *
 * idempotent ต่อ double-charge: productId ปักหมุดอยู่แล้ว → คืน state ไม่หักซ้ำ (service layer)
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (!active) {
    return NextResponse.json({ error: "ไม่พบร้านค้า", code: "SHOP_NOT_FOUND" }, { status: 404 });
  }
  // buy = spend action (หักเงิน + เพิ่ม slot) — ร้านที่ถูก lock ต้อง read-only (pattern เดียวกับ /pin)
  if (active.locked) {
    return NextResponse.json({ error: "ร้านถูกล็อก ไม่สามารถทำรายการนี้ได้", code: "SHOP_LOCKED" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const parsed = v.safeParse(BuyPinSlotSchema, body);
  if (!parsed.success) {
    const firstIssue = parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: firstIssue, code: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const { product, pinState } = await buyPinSlotAndPin(active.shop.id, parsed.output.productId);
    return NextResponse.json({
      productId: product.id,
      pinnedAt: product.pinnedAt ? product.pinnedAt.toISOString() : null,
      pinSlots: pinState.pinSlots,
      pinnedCount: pinState.pinnedCount,
    });
  } catch (e: unknown) {
    if (e instanceof PinProductNotFoundError) {
      return NextResponse.json({ error: "ไม่พบสินค้า", code: "PRODUCT_NOT_FOUND" }, { status: 404 });
    }
    if (e instanceof PinProductInactiveError) {
      return NextResponse.json(
        { error: "สินค้านี้ปิดใช้งานอยู่ ไม่สามารถปักหมุดได้", code: "PRODUCT_NOT_ACTIVE" },
        { status: 400 },
      );
    }
    // INSUFFICIENT_CREDIT เกิดได้เฉพาะจาก buyPinSlotAndPin() (ผ่าน deductCredit) — ครอบเฉพาะ route นี้
    if (e instanceof Error && e.message === "INSUFFICIENT_CREDIT") {
      return NextResponse.json(
        { error: "ยอดเงินไม่พอ กรุณาเติมเงินก่อนซื้อสล็อต", code: "INSUFFICIENT_CREDIT" },
        { status: 402 },
      );
    }
    console.error("[POST /api/seller/pin-slots/buy] shopId:", active.shop.id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
