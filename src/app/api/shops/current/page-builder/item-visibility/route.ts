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
import {
  setProfileItemVisibility,
  setProfileItemsVisibilityBulk,
} from "@/services/profile-visibility.service";
import {
  SetProfileItemVisibilitySchema,
  SetProfileItemsVisibilityBulkSchema,
} from "@/lib/validations";
import { requireBuilderShopContext, handleBuilderError, errorResponse } from "../_shared";

// per-user + per-shop data — ห้าม cache ข้ามคน/ข้ามร้าน (feedback_auth_api_cache_control)
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const { ctx, response } = await requireBuilderShopContext();
  if (!ctx) return response;

  const body = await request.json().catch(() => null);

  // แบบ "ทั้งชุด" (redesign 2026-08-23) — ลองก่อนเพราะมี `scope` เป็นตัวแยกที่ชัดเจน
  // 🛑 ต้องมีทางนี้ ไม่ใช่ให้ client วนยิงทีละรายการ: ร้านที่มีสินค้า 32 ชิ้นจะยิง 32 request
  // แล้วชน rate-limit ของ guardApi (mutation ผู้ใช้ล็อกอิน 30/นาที) ⇒ กด "ซ่อนทั้งหมด" แล้ว
  // บางชิ้นถูกซ่อน บางชิ้นไม่ถูก โดยไม่มีอะไรบอกว่าอันไหนพลาด
  const bulk = v.safeParse(SetProfileItemsVisibilityBulkSchema, body);
  if (bulk.success) {
    try {
      const result = await setProfileItemsVisibilityBulk(
        ctx.shopId,
        ctx.actorUserId,
        bulk.output.kind,
        bulk.output.showOnProfile,
      );
      const res = NextResponse.json(result);
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    } catch (e) {
      return handleBuilderError(e, "PATCH .../item-visibility (bulk)");
    }
  }

  const parsed = v.safeParse(SetProfileItemVisibilitySchema, body);
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
