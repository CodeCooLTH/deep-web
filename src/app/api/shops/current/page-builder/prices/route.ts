/**
 * PATCH /api/shops/current/page-builder/prices — สลับ "แสดงราคาบนหน้าร้าน" (feature 00053)
 * 00053 API.md §4.1, SRS TFR-009
 *
 * แยก endpoint จาก PUT /page-builder และจาก .../publish โดยตั้งใจ — เป็นสวิตช์ atomic ที่ไม่ผูก
 * กับ draft lifecycle ของตัวจัดหน้าร้าน (เหตุผลเดียวกับที่ 00035 แยก publish ออกมา: กัน session
 * ที่เปิด builder ค้างไว้กด "บันทึก" แล้วเขียนทับค่าที่อีกหน้าจอเพิ่งสลับไป)
 */
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { setShopPageShowPrices } from "@/services/shop-page-layout.service";
import { SetShopPageShowPricesSchema } from "@/lib/validations";
import { requireBuilderShopContext, handleBuilderError, errorResponse } from "../_shared";

// per-user + per-shop data — ห้าม cache ข้ามคน/ข้ามร้าน (feedback_auth_api_cache_control)
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const { ctx, response } = await requireBuilderShopContext();
  if (!ctx) return response;

  const parsed = v.safeParse(SetShopPageShowPricesSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "ข้อมูลไม่ถูกต้อง", 400);
  }

  try {
    const result = await setShopPageShowPrices(ctx.shopId, ctx.actorUserId, parsed.output.showPrices);
    const res = NextResponse.json(result);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (e) {
    return handleBuilderError(e, "PATCH /api/shops/current/page-builder/prices");
  }
}
