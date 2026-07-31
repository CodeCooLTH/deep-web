import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireShopMember, jsonNoStore } from "@/lib/shop-api-guard";
import { appointmentErrorResponse } from "@/lib/appointment-api";
import { assertShopCanUseAppointments } from "@/services/appointment.service";
import { isAppointmentGranularity } from "@/lib/appointments";

/**
 * PATCH /api/shops/current/appointment-settings — หน่วยเวลาของการนัดระดับร้าน
 *
 * feature 00024 (API.md §4.0 / FR-RSV-13)
 *
 * IMPORTANT: เปลี่ยนค่านี้ **ไม่แตะนัดที่บันทึกไว้แล้วแม้แต่แถวเดียว** (BR-RSV-55) —
 * เป็นแค่ค่าที่บอกว่า "ฟอร์มสร้างออเดอร์ควรถามอะไร" การแสดงผลของนัดเก่าตัดสินจาก
 * ข้อมูลจริงของแถวนั้นเสมอ (BR-RSV-57, isAllDayAppointment)
 */

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const ctx = await requireShopMember();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  const value = (body as { appointmentGranularity?: unknown } | null)
    ?.appointmentGranularity;
  if (typeof value !== "string" || !isAppointmentGranularity(value)) {
    return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    // ตัวกั้นฟีเจอร์เหมือนทุก endpoint ของโดเมนนี้ — ไม่ใช่แค่ซ่อนเมนู (BR-RSV-02)
    await assertShopCanUseAppointments(ctx.shopId);
    const shop = await prisma.shop.update({
      where: { id: ctx.shopId },
      data: { appointmentGranularity: value },
      select: { appointmentGranularity: true },
    });
    return jsonNoStore(shop);
  } catch (e: unknown) {
    const mapped = appointmentErrorResponse(e);
    if (mapped) return mapped;
    console.error(
      "[PATCH /api/shops/current/appointment-settings] shopId:",
      ctx.shopId,
      e instanceof Error ? e.message : e,
    );
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
