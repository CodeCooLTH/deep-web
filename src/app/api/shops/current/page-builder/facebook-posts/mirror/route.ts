/**
 * POST /api/shops/current/page-builder/facebook-posts/mirror — mirror รูปโพสต์ 1 โพสต์ (feature 00035)
 * API.md §4.2, SRS TFR-006 — เรียกตอนผู้ขายกด "+" ที่โพสต์นั้นในคลัง (ก่อน Save) idempotent —
 * ไม่ persist ShopPageBlock ใด ๆ เขียนแค่ FacebookPost.mirroredFileId/mirroredAt
 */
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { mirrorFacebookPostForBuilder } from "@/services/shop-page-layout.service";
import { MirrorFacebookPostSchema } from "@/lib/validations";
import { requireBuilderShopContext, handleBuilderError, errorResponse } from "../../_shared";

// per-user + per-shop data — ห้าม cache ข้ามคน/ข้ามร้าน (feedback_auth_api_cache_control)
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { ctx, response } = await requireBuilderShopContext();
  if (!ctx) return response;

  const parsed = v.safeParse(MirrorFacebookPostSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "ข้อมูลไม่ถูกต้อง", 400);
  }

  try {
    const result = await mirrorFacebookPostForBuilder(
      ctx.shopId,
      ctx.actorUserId,
      parsed.output.facebookPostId,
    );
    const res = NextResponse.json(result);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (e) {
    return handleBuilderError(e, "POST /api/shops/current/page-builder/facebook-posts/mirror");
  }
}
