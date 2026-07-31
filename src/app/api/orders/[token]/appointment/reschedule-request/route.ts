import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { RequestRescheduleSchema } from "@/lib/validations";
import { appointmentErrorResponse } from "@/lib/appointment-api";
import { requestAppointmentReschedule } from "@/services/appointment.service";

/**
 * POST /api/orders/[token]/appointment/reschedule-request — ลูกค้าขอเลื่อนนัด
 *
 * feature 00024 Service Appointment Booking (API.md §4.10 / FR-RSV-07)
 *
 * IMPORTANT: endpoint นี้ "ไม่ย้ายเวลา" ใด ๆ — เป็นแค่การส่งคำขอให้ร้านตัดสิน
 * ช่วงเวลาเดิมยังนับเข้าความจุอยู่จนกว่าร้านจะย้ายให้ (BR-RSV-27)
 * ลูกค้าเปลี่ยนวันเองไม่ได้โดยเจตนา — ร้านเป็นผู้ตัดสินสุดท้าย (BR-RSV-23/24)
 * ถ้าจะเปิดให้ลูกค้าเลือกวันเอง = โหมด B2 ซึ่งอยู่นอกขอบเขต phase 1
 */

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  }
  const buyerUserId = (session.user as { id: string }).id;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(RequestRescheduleSchema, body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const result = await requestAppointmentReschedule({
      orderToken: token,
      buyerUserId,
      note: parsed.output.note ?? null,
    });
    return NextResponse.json(
      { appointmentStatus: result.appointmentStatus },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (e: unknown) {
    const mapped = appointmentErrorResponse(e);
    if (mapped) return mapped;
    console.error("[POST /api/orders/[token]/appointment/reschedule-request]", e);
    return NextResponse.json(
      { error: "ส่งคำขอเลื่อนนัดไม่สำเร็จ กรุณาลองใหม่" },
      { status: 400 },
    );
  }
}
