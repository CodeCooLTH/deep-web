import { NextRequest } from "next/server";
import * as v from "valibot";
import { UpdateServiceResourceSchema } from "@/lib/validations";
import { requireShopMember, jsonNoStore } from "@/lib/shop-api-guard";
import { appointmentErrorResponse } from "@/lib/appointment-api";
import {
  deleteServiceResource,
  updateServiceResource,
} from "@/services/service-resource.service";

/**
 * PATCH  /api/shops/current/service-resources/[resourceId] — แก้ไข / เปลี่ยนความจุ / เปิด-ปิด
 * DELETE /api/shops/current/service-resources/[resourceId] — ลบ (เฉพาะที่ไม่มีนัดผูกอยู่)
 *
 * feature 00024 Service Appointment Booking (API.md §4.2, §4.3 / FR-RSV-01)
 *
 * ต่างจาก rooms ของ 00017 ที่ไม่มี DELETE เลย — ที่นี่มีได้เพราะทรัพยากรที่ยังไม่เคยถูกจอง
 * เป็นแค่รายการที่ร้านพิมพ์ผิดแล้วอยากลบทิ้ง ส่วนตัวที่มีนัดแล้วถูกกันด้วย FK RESTRICT
 * ที่ระดับฐานข้อมูล (BR-RSV-08) แล้วแปลงเป็น 409 พร้อมแนะให้ปิดการใช้งานแทน
 */

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> },
) {
  const { resourceId } = await params;
  const ctx = await requireShopMember();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(UpdateServiceResourceSchema, body ?? {});
  if (!parsed.success) {
    return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const resource = await updateServiceResource(ctx.shopId, resourceId, parsed.output);
    return jsonNoStore(resource);
  } catch (e: unknown) {
    const mapped = appointmentErrorResponse(e);
    if (mapped) return mapped;
    console.error(
      "[PATCH /api/shops/current/service-resources/[resourceId]] shopId:",
      ctx.shopId,
      e instanceof Error ? e.message : e,
    );
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> },
) {
  const { resourceId } = await params;
  const ctx = await requireShopMember();
  if ("error" in ctx) return ctx.error;

  try {
    await deleteServiceResource(ctx.shopId, resourceId);
    return new Response(null, { status: 204 });
  } catch (e: unknown) {
    const mapped = appointmentErrorResponse(e);
    if (mapped) return mapped;
    console.error(
      "[DELETE /api/shops/current/service-resources/[resourceId]] shopId:",
      ctx.shopId,
      e instanceof Error ? e.message : e,
    );
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
