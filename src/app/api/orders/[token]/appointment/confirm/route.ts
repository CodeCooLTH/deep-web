import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { appointmentErrorResponse } from "@/lib/appointment-api";
import { confirmAppointmentByBuyer } from "@/services/appointment.service";
import { sessionUserId } from "@/lib/session-user";

/**
 * POST /api/orders/[token]/appointment/confirm — ลูกค้ายืนยันนัด
 *
 * feature 00024 Service Appointment Booking (API.md §4.9 / FR-RSV-06)
 *
 * IMPORTANT: ใช้กติกาการเข้าถึงของ feature 00015 ตามที่เป็น — session + ownership
 * ผ่าน Order.buyerUserId (Access Gate ของหน้า /o/[token] การันตีให้ตรงมาก่อนแล้ว)
 * ห้ามสร้างเส้นทางเข้าถึงใหม่ ห้ามแก้ flow ยืนยันตัวตน (BR-RSV-20)
 *
 * Idempotent: กดซ้ำคืน 200 เหมือนเดิม ไม่เขียนทับเวลาที่ยืนยันครั้งแรก (BR-RSV-26)
 */

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  const buyerUserId = sessionUserId(session);
  if (!session?.user || !buyerUserId) {
    return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  }

  try {
    const result = await confirmAppointmentByBuyer({ orderToken: token, buyerUserId });
    return NextResponse.json(
      {
        appointmentStatus: result.appointmentStatus,
        buyerConfirmedAt: result.buyerConfirmedAt?.toISOString() ?? null,
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (e: unknown) {
    const mapped = appointmentErrorResponse(e);
    if (mapped) return mapped;
    // ห้าม echo err.message ดิบ (บทเรียนเดียวกับ /confirm ของ 00015)
    console.error("[POST /api/orders/[token]/appointment/confirm]", e);
    return NextResponse.json(
      { error: "ยืนยันนัดไม่สำเร็จ กรุณาลองใหม่" },
      { status: 400 },
    );
  }
}
