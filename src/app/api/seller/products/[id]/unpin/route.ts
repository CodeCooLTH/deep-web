import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireActiveShop } from "@/lib/shop-context";
import { unpinProduct, PinProductNotFoundError } from "@/services/pin.service";

// path param productId ต้องเป็น uuid — ไม่ผ่าน = 400 ชัดเจนแทนปล่อยไป findFirst→404 (consistency กับ pin route)
const ProductIdParamSchema = v.pipe(v.string(), v.uuid());

/**
 * POST /api/seller/products/{id}/unpin — ยกเลิกปักหมุด ฟรีเสมอ ไม่มีเงื่อนไข slot
 * API.md §4.2 — idempotent (ยกเลิกซ้ำ → 200 pinnedAt:null)
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
  // ไม่เช็ค active.locked ที่นี่โดยตั้งใจ — unpin ลด exposure (ปลดสินค้าเด่น) ไม่ใช่ spend action
  // ปล่อยผ่านเหมือน pattern delete เดิม (ร้านที่ถูก lock ยังยกเลิกปักหมุดได้)

  const { id: rawProductId } = await params;
  const idCheck = v.safeParse(ProductIdParamSchema, rawProductId);
  if (!idCheck.success) {
    return NextResponse.json({ error: "รหัสสินค้าไม่ถูกต้อง", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const productId = idCheck.output;

  try {
    const { product, pinState } = await unpinProduct(active.shop.id, productId);
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
    console.error("[POST /api/seller/products/[id]/unpin] shopId:", active.shop.id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
