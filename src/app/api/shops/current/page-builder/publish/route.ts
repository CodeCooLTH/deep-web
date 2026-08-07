/**
 * PATCH /api/shops/current/page-builder/publish — สลับสถานะเผยแพร่ทั้งหน้า (feature 00035)
 * API.md §4.4, SRS TFR-009 — endpoint เดียวใช้ร่วมกันทั้ง desktop builder toolbar และ
 * /public-profile มือถือ (PublishToggleClient) แยกจาก PUT /page-builder โดยตั้งใจ (atomic toggle
 * ที่ไม่ผูกกับ draft lifecycle ของหน้าจอไหนเลย)
 */
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { setShopPagePublished } from "@/services/shop-page-layout.service";
import { SetShopPagePublishedSchema } from "@/lib/validations";
import { requireBuilderShopContext, handleBuilderError, errorResponse } from "../_shared";

// per-user + per-shop data — ห้าม cache ข้ามคน/ข้ามร้าน (feedback_auth_api_cache_control)
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const { ctx, response } = await requireBuilderShopContext();
  if (!ctx) return response;

  const parsed = v.safeParse(SetShopPagePublishedSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "ข้อมูลไม่ถูกต้อง", 400);
  }

  try {
    const result = await setShopPagePublished(ctx.shopId, ctx.actorUserId, parsed.output.isPublished);
    const res = NextResponse.json(result);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (e) {
    return handleBuilderError(e, "PATCH /api/shops/current/page-builder/publish");
  }
}
