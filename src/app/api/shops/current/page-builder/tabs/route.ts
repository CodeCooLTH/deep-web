/**
 * PATCH /api/shops/current/page-builder/tabs — แทนที่ชุดแท็บที่ซ่อนบนหน้าร้านสาธารณะ
 * CR 00053 2026-10-10 hide-tabs
 *
 * Base: ../prices/route.ts — แยก endpoint จาก PUT /page-builder ด้วยเหตุผลเดียวกัน (สวิตช์ atomic
 * ไม่ผูก draft ของตัวจัดหน้าร้าน กัน session ที่เปิด builder ค้างไว้เขียนทับ)
 */
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { setShopPageHiddenTabs } from "@/services/shop-page-layout.service";
import { SetShopPageHiddenTabsSchema } from "@/lib/validations";
import { requireBuilderShopContext, handleBuilderError, errorResponse } from "../_shared";

// per-user + per-shop data — ห้าม cache ข้ามคน/ข้ามร้าน (feedback_auth_api_cache_control)
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const { ctx, response } = await requireBuilderShopContext("T1");
  if (!ctx) return response;

  const parsed = v.safeParse(SetShopPageHiddenTabsSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "ข้อมูลไม่ถูกต้อง", 400);
  }

  try {
    const result = await setShopPageHiddenTabs(ctx.shopId, ctx.actorUserId, parsed.output.hiddenTabs);
    const res = NextResponse.json(result);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (e) {
    return handleBuilderError(e, "PATCH /api/shops/current/page-builder/tabs");
  }
}
