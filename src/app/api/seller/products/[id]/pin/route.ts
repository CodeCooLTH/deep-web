import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireActiveShop } from "@/lib/shop-context";
import {
  pinProduct,
  PinProductNotFoundError,
  PinProductInactiveError,
  NoPinSlotError,
} from "@/services/pin.service";

// path param productId ต้องเป็น uuid — ไม่ผ่าน = 400 ชัดเจนแทนปล่อยไป findFirst→404 (consistency กับ buy route)
const ProductIdParamSchema = v.pipe(v.string(), v.uuid());

/**
 * POST /api/seller/products/{id}/pin — ปักหมุดสินค้า (ต้องมี slot ว่าง)
 * API.md §4.1 — idempotent (ปักหมุดซ้ำ → 200 state ปัจจุบัน ไม่ error)
 *
 * ทำไม shop derive จาก requireActiveShop เท่านั้น (ไม่รับ shopId จาก client):
 * DAL ownership — session.user เป็น single source of truth สำหรับ identity (SDS TD-005)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (!active) {
    return NextResponse.json({ error: "ไม่พบร้านค้า", code: "SHOP_NOT_FOUND" }, { status: 404 });
  }
  // pin = spend/exposure-increasing action (เพิ่มสินค้าที่แสดงเด่น) — ร้านที่ถูก lock (BUSINESS
  // ค้างชำระ package) ต้อง read-only (pattern เดียวกับ api/products/route.ts, api/inventory/subscribe)
  if (active.locked) {
    return NextResponse.json({ error: "ร้านถูกล็อก ไม่สามารถทำรายการนี้ได้", code: "SHOP_LOCKED" }, { status: 403 });
  }

  const { id: rawProductId } = await params;
  const idCheck = v.safeParse(ProductIdParamSchema, rawProductId);
  if (!idCheck.success) {
    return NextResponse.json({ error: "รหัสสินค้าไม่ถูกต้อง", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const productId = idCheck.output;

  try {
    const { product, pinState } = await pinProduct(active.shop.id, productId);
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
    // NoPinSlotError เกิดได้เฉพาะจาก pinProduct() (ไม่เกิดใน unpin/buy) — ครอบเฉพาะ route นี้
    if (e instanceof NoPinSlotError) {
      return NextResponse.json(
        { error: "สล็อตปักหมุดเต็ม ต้องซื้อสล็อตเพิ่มหรือยกเลิกปักหมุดอื่นก่อน", code: "NO_PIN_SLOT" },
        { status: 409 },
      );
    }
    console.error("[POST /api/seller/products/[id]/pin] shopId:", active.shop.id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
