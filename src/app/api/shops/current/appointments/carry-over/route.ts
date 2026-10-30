import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonNoStore } from "@/lib/shop-api-guard";
import { requireShopCapability } from "@/lib/shop-capability";
import { appointmentErrorResponse } from "@/lib/appointment-api";
import { toAppointmentDayPayload } from "@/lib/appointment-day-payload";
import { listMyCarryOverJobs, listMyUnscheduledJobs } from "@/services/appointment.service";

/**
 * GET /api/shops/current/appointments/carry-over — งานของฉันที่ "ค้างจากวันก่อน" (00086 P3 · มติ user Q2)
 *
 * กลุ่มบนสุดของหน้า "งานของฉัน": มอบให้ผู้เรียก ∧ เริ่มแล้ว ∧ ยังไม่ทำเสร็จ/ยังไม่ปิด ∧ นัดจบก่อนวันนี้ (เวลาไทย)
 * นิยามเต็มอยู่ที่ `listMyCarryOverJobs` · รูปแถว = แถวของ `…/appointments/day` ทุกคีย์ (การ์ดเดียวกัน)
 *
 * ทำไมแยก route ไม่เติมใน day route: day route ถาม "ทั้งร้าน ของวันที่ระบุ" ส่วนนี่ถาม "ของฉัน ข้ามวัน"
 * — ผูกกับตัวผู้เรียก (userId จาก session เท่านั้น ไม่รับจาก query) และไม่มีพารามิเตอร์วันเลย
 * ถ้าเติมเป็นโหมดของ day route จะต้องผ่อนกติกา "รับวันเดียว" ที่ route นั้นตั้งไว้เป็นเพดานของคำขอที่มีเบอร์ลูกค้า
 *
 * `unscheduled` (00086 M1): งานของฉันที่ยังไม่ระบุเวลา (`listMyUnscheduledJobs`) — แถวทรงเดียวกันแต่ start/end = null
 * อยู่ route เดียวกันเพราะคำถามเดียวกัน ("ของฉัน ที่ไม่อยู่ในรายการวันนี้") · ทางออกเงินเดียวกัน (toAppointmentDayPayload)
 *
 * Q1 เหมือน day route · ตัดเงิน/ห้องแชทด้วยตัวเดียวกัน (toAppointmentDayPayload) · ร้านไม่ใช่บริการ → 403 FEATURE_NOT_AVAILABLE
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireShopCapability(await getServerSession(authOptions), "Q1");
  if (!gate.ok) return gate.response;

  try {
    const [items, unscheduled] = await Promise.all([
      listMyCarryOverJobs({ shopId: gate.shopId, userId: gate.userId }),
      listMyUnscheduledJobs({ shopId: gate.shopId, userId: gate.userId }),
    ]);
    return jsonNoStore({
      items: toAppointmentDayPayload(items, gate.roles),
      unscheduled: toAppointmentDayPayload(unscheduled, gate.roles),
    });
  } catch (e: unknown) {
    const mapped = appointmentErrorResponse(e);
    if (mapped) return mapped;
    console.error(
      "[GET /api/shops/current/appointments/carry-over] shopId:",
      gate.shopId,
      e instanceof Error ? e.message : e,
    );
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
