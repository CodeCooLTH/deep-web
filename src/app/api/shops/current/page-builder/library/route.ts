/**
 * GET /api/shops/current/page-builder/library — คลังบล็อกที่เพิ่มได้ในตัวจัดหน้าร้าน (feature 00035)
 * API.md §4.1 — เหรียญ ACHIEVEMENT ที่ร้าน/ผู้ใช้นี้ได้รับจริง + โพสต์ Facebook ของเพจที่เชื่อมไว้
 * ใช้ทั้งตอน initial load (SSR ที่ BuilderPage) และตอน paginate/search ต่อผ่าน client fetch
 *
 * [สำคัญ] endpoint นี้ไม่รู้จัก draft state เลย — "เพิ่มแล้ว"/"เลือกแล้ว" เป็น UI state ที่ client
 * คำนวณเองจาก draft ปัจจุบันเทียบกับผลลัพธ์ endpoint นี้ (API.md §4.1 หมายเหตุ) ไม่ใช่ field ที่นี่
 */
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getBuilderLibrary } from "@/services/shop-page-layout.service";
import { BuilderLibraryQuerySchema } from "@/lib/validations";
import { requireBuilderShopContext, handleBuilderError, errorResponse } from "../_shared";

// per-user + per-shop data — ห้าม cache ข้ามคน/ข้ามร้าน (feedback_auth_api_cache_control)
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { ctx, response } = await requireBuilderShopContext();
  if (!ctx) return response;

  const { searchParams } = new URL(request.url);
  const takeRaw = searchParams.get("take");
  const parsed = v.safeParse(BuilderLibraryQuerySchema, {
    q: searchParams.get("q") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
    take: takeRaw != null ? Number(takeRaw) : undefined,
  });
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "พารามิเตอร์ค้นหาไม่ถูกต้อง", 400);
  }

  try {
    const library = await getBuilderLibrary({
      shopId: ctx.shopId,
      actorUserId: ctx.actorUserId,
      q: parsed.output.q,
      cursor: parsed.output.cursor,
      take: parsed.output.take,
    });
    const res = NextResponse.json(library);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (e) {
    return handleBuilderError(e, "GET /api/shops/current/page-builder/library");
  }
}
