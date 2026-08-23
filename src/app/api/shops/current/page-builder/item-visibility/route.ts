/**
 * PATCH /api/shops/current/page-builder/item-visibility — สลับ "แสดงบนหน้าร้าน" ของรายการเดียว
 * (feature 00053 API.md §4.2, SRS TFR-009) ครอบสินค้า/ห้องพัก/บริการ ผ่าน field `kind`
 *
 * ทำไม endpoint เดียวรับ 3 ชนิดแทนที่จะแยก 3 route: สัญญาเหมือนกันทุกตัวอักษร (id + boolean)
 * ต่างกันแค่ตารางปลายทาง การแยก route จะได้โค้ดเหมือนกัน 3 ชุดที่ต้องแก้พร้อมกันทุกครั้ง
 * ความปลอดภัยไม่ต่างกันเพราะทุกชนิด scope ด้วย shopId ใน where เดียวกัน
 */
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { setProfileItemVisibility } from "@/services/profile-visibility.service";
import { SetProfileItemVisibilitySchema } from "@/lib/validations";
import { requireBuilderShopContext, handleBuilderError, errorResponse } from "../_shared";

// per-user + per-shop data — ห้าม cache ข้ามคน/ข้ามร้าน (feedback_auth_api_cache_control)
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const { ctx, response } = await requireBuilderShopContext();
  if (!ctx) return response;

  const parsed = v.safeParse(SetProfileItemVisibilitySchema, await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "ข้อมูลไม่ถูกต้อง", 400);
  }

  try {
    const result = await setProfileItemVisibility(
      ctx.shopId,
      ctx.actorUserId,
      parsed.output.kind,
      parsed.output.id,
      parsed.output.showOnProfile,
    );
    const res = NextResponse.json(result);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (e) {
    return handleBuilderError(e, "PATCH /api/shops/current/page-builder/item-visibility");
  }
}
