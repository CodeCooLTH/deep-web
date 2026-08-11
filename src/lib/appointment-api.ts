import { jsonNoStore } from "@/lib/shop-api-guard";
import {
  AppointmentFeatureUnavailableError,
  AppointmentNotFoundError,
  AppointmentNotStartedError,
  AppointmentPastError,
  AppointmentSlotFullError,
  AppointmentTerminalError,
  CapacityReductionBlockedError,
  InvalidAppointmentRangeError,
  ServiceResourceHasAppointmentsError,
  ServiceResourceInactiveError,
  ServiceResourceNotFoundError,
} from "@/lib/appointments";

/**
 * แปลง error ของโดเมนนัดหมายเป็น HTTP response (feature 00024)
 *
 * รวมไว้ที่เดียวเพราะ route มีหลายเส้นและใช้ error ชุดเดียวกัน — ถ้าแยก catch รายเส้น
 * จะมีเส้นที่ลืมครอบแล้วตกเป็น 500 (บทเรียน feedback_service_error_route_mapping)
 *
 * IMPORTANT: ห้ามส่งข้อความดิบจาก Postgres ออกไป — มีชื่อ constraint และเลขที่นั่ง
 * ซึ่งเป็นกลไกภายใน ทุกข้อความที่คืนต้องเป็นภาษาธุรกิจ (BR-RSV-19, API.md §1)
 *
 * คืน null ถ้าไม่ใช่ error ของโดเมนนี้ → ผู้เรียกต้อง log แล้วคืน 500 เอง
 */
export function appointmentErrorResponse(e: unknown): Response | null {
  if (e instanceof AppointmentFeatureUnavailableError) {
    return jsonNoStore(
      {
        error: "FEATURE_NOT_AVAILABLE",
        // feature 00028 (BR-SBT-11) — "บัญชีธุรกิจ" เป็นเท็จแล้วหลังงานนี้ (บัญชีบุคคลใช้ได้ด้วย)
        message: "ระบบนัดหมายใช้ได้เฉพาะร้านประเภทสินค้าและบริการ",
      },
      { status: 403 },
    );
  }
  if (e instanceof ServiceResourceNotFoundError) {
    // 🛑 เคสเดียวในไฟล์นี้ที่เคยไม่มี `message` — จอสร้างออเดอร์จึงโชว์รหัสดิบ `RESOURCE_NOT_FOUND`
    // เต็มจอให้ผู้ขายอ่าน (user report prod 2026-08-11). ใช้คำว่า "คิวงาน" ตามที่หน้าฟอร์มเรียก
    // ไม่ใช่ "ทรัพยากร" ซึ่งเป็นชื่อภายใน และไม่ใช่ "ปิดใช้งาน" ซึ่งเป็นคนละ error (RESOURCE_INACTIVE)
    return jsonNoStore(
      {
        error: "RESOURCE_NOT_FOUND",
        message: "คิวงานที่เลือกไว้ถูกลบไปแล้ว — เลือกคิวงานอื่นก่อนบันทึก",
      },
      { status: 404 },
    );
  }
  if (e instanceof AppointmentNotFoundError) {
    return jsonNoStore({ error: "APPOINTMENT_NOT_FOUND" }, { status: 404 });
  }
  if (e instanceof InvalidAppointmentRangeError) {
    return jsonNoStore(
      { error: "VALIDATION_ERROR", message: "เวลาสิ้นสุดต้องมาหลังเวลาเริ่ม" },
      { status: 400 },
    );
  }
  if (e instanceof AppointmentSlotFullError) {
    // ข้อความระดับธุรกิจ — ไม่พูดถึง "ที่นั่ง" ซึ่งเป็นกลไกภายใน
    return jsonNoStore(
      {
        error: "APPOINTMENT_SLOT_FULL",
        message:
          e.capacity === 1
            ? "ช่วงเวลานี้มีนัดอยู่แล้ว"
            : `ช่วงเวลานี้เต็มแล้ว (${e.capacity} จาก ${e.capacity} คิว)`,
        resourceName: e.resourceName,
        capacity: e.capacity,
      },
      { status: 409 },
    );
  }
  if (e instanceof CapacityReductionBlockedError) {
    return jsonNoStore(
      {
        error: "CAPACITY_REDUCTION_BLOCKED",
        message: "ลดจำนวนคิวไม่ได้ เพราะยังมีนัดที่จองไว้เกินจำนวนใหม่",
        blockedBy: {
          orderNo: e.blockedBy.orderNo,
          start: e.blockedBy.start.toISOString(),
          end: e.blockedBy.end.toISOString(),
        },
      },
      { status: 409 },
    );
  }
  if (e instanceof ServiceResourceHasAppointmentsError) {
    return jsonNoStore(
      {
        error: "RESOURCE_HAS_APPOINTMENTS",
        message: "ลบไม่ได้เพราะยังมีนัดผูกอยู่ — ปิดการใช้งานแทนได้",
      },
      { status: 409 },
    );
  }
  if (e instanceof ServiceResourceInactiveError) {
    return jsonNoStore(
      { error: "RESOURCE_INACTIVE", message: "รายการนี้ถูกปิดการใช้งานอยู่" },
      { status: 409 },
    );
  }
  if (e instanceof AppointmentTerminalError) {
    return jsonNoStore(
      { error: "APPOINTMENT_TERMINAL", message: "นัดนี้จบไปแล้ว แก้ไขไม่ได้" },
      { status: 409 },
    );
  }
  if (e instanceof AppointmentNotStartedError) {
    return jsonNoStore(
      { error: "APPOINTMENT_NOT_STARTED", message: "ยังไม่ถึงเวลานัด" },
      { status: 409 },
    );
  }
  if (e instanceof AppointmentPastError) {
    return jsonNoStore(
      { error: "APPOINTMENT_PAST", message: "เลยเวลานัดไปแล้ว" },
      { status: 409 },
    );
  }
  return null;
}
