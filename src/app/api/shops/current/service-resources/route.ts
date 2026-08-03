import { NextRequest } from "next/server";
import * as v from "valibot";
import { CreateServiceResourceSchema } from "@/lib/validations";
import { requireShopMember, jsonNoStore } from "@/lib/shop-api-guard";
import { appointmentErrorResponse } from "@/lib/appointment-api";
import {
  createServiceResource,
  listServiceResources,
} from "@/services/service-resource.service";

/**
 * GET  /api/shops/current/service-resources — รายการทรัพยากรที่จองเวลาได้
 * POST /api/shops/current/service-resources — สร้างทรัพยากร
 *
 * feature 00024 Service Appointment Booking (API.md §4.1 / FR-RSV-01)
 *
 * สิทธิ์: สมาชิกของร้าน (OWNER หรือ ADMIN) — เท่ากับสิทธิ์จัดการออเดอร์ ไม่สร้างระดับใหม่
 * (BR-RSV-25) มิเรอร์ rooms ของ feature 00017
 *
 * IMPORTANT: service เรียก assertShopCanUseAppointments() เสมอ — ร้านที่ vertical ไม่ใช่
 * SERVICE_QUEUE เรียกได้ 403 ไม่ใช่แค่ไม่เห็นเมนู (BR-RSV-02, TC-B04)
 * feature 00028 BR-SBT-11 ตัดเงื่อนไข kind=BUSINESS ออกแล้ว — บัญชีบุคคลใช้คิวงานได้
 */

// per-user data — กัน shared/carrier cache ส่งข้อมูลข้ามผู้ใช้ (feedback_auth_api_cache_control)
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = await requireShopMember();
  if ("error" in ctx) return ctx.error;

  const activeOnly = request.nextUrl.searchParams.get("activeOnly") === "1";

  try {
    const resources = await listServiceResources(ctx.shopId, { activeOnly });
    return jsonNoStore({ resources });
  } catch (e: unknown) {
    const mapped = appointmentErrorResponse(e);
    if (mapped) return mapped;
    console.error(
      "[GET /api/shops/current/service-resources] shopId:",
      ctx.shopId,
      e instanceof Error ? e.message : e,
    );
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireShopMember();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(CreateServiceResourceSchema, body ?? {});
  if (!parsed.success) {
    return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const resource = await createServiceResource(ctx.shopId, parsed.output);
    return jsonNoStore(resource, { status: 201 });
  } catch (e: unknown) {
    const mapped = appointmentErrorResponse(e);
    if (mapped) return mapped;
    console.error(
      "[POST /api/shops/current/service-resources] shopId:",
      ctx.shopId,
      e instanceof Error ? e.message : e,
    );
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
