/**
 * PUT /api/shops/current/page-builder — บันทึกผัง (feature 00035)
 * API.md §4.3, SRS TFR-007 — แทนที่ tabOrder + ShopPageBlock ทั้งชุดของร้านในทรานแซกชันเดียว
 * ไม่แตะ isPublished (คนละ endpoint — ดู publish/route.ts)
 */
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { saveShopPageLayout } from "@/services/shop-page-layout.service";
import { SaveShopPageLayoutSchema } from "@/lib/validations";
import { requireBuilderShopContext, handleBuilderError, errorResponse } from "./_shared";

// per-user + per-shop data — ห้าม cache ข้ามคน/ข้ามร้าน (feedback_auth_api_cache_control)
export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  const { ctx, response } = await requireBuilderShopContext();
  if (!ctx) return response;

  const parsed = v.safeParse(SaveShopPageLayoutSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "ข้อมูลผังไม่ถูกต้อง", 400);
  }

  try {
    const saved = await saveShopPageLayout(ctx.shopId, ctx.actorUserId, parsed.output);
    const res = NextResponse.json(saved);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (e) {
    return handleBuilderError(e, "PUT /api/shops/current/page-builder");
  }
}
