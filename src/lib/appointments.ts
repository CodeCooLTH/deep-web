/**
 * ระบบนัดหมายวันเข้าใช้บริการ — ค่าคงที่ + ตัวกั้นฟีเจอร์ + กฎการเปลี่ยนสถานะ (feature 00024)
 *
 * SSOT: docs/20 - Features/00024 - Service Appointment Booking/{BRD,SRS,SDS}.md
 */

/** ออเดอร์ที่มีนัดใช้ type นี้ — ไม่สร้างชนิดออเดอร์ใหม่ (BR-RSV-10/11) */
export const APPOINTMENT_ORDER_TYPE = "SERVICE";

export const APPOINTMENT_STATUS = {
  SCHEDULED: "SCHEDULED",
  CONFIRMED_BY_BUYER: "CONFIRMED_BY_BUYER",
  RESCHEDULE_REQUESTED: "RESCHEDULE_REQUESTED",
  COMPLETED: "COMPLETED",
  NO_SHOW: "NO_SHOW",
} as const;

export type AppointmentStatus =
  (typeof APPOINTMENT_STATUS)[keyof typeof APPOINTMENT_STATUS];

/** สถานะที่ถือว่าจบแล้ว — เลื่อน/ขอเลื่อน/ทำเครื่องหมายซ้ำไม่ได้ (BR-RSV-31) */
export const TERMINAL_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  APPOINTMENT_STATUS.COMPLETED,
  APPOINTMENT_STATUS.NO_SHOW,
];

export function isTerminalAppointmentStatus(
  status: string | null | undefined,
): boolean {
  return (
    !!status &&
    TERMINAL_APPOINTMENT_STATUSES.includes(status as AppointmentStatus)
  );
}

/**
 * ตัวกั้นฟีเจอร์ (BR-RSV-01)
 *
 * IMPORTANT: ต้องเข้าเงื่อนไข "ทั้งสองอย่าง" — ห้ามเช็ค vertical อย่างเดียว
 *    ร้านบุคคลธรรมดาที่เป็น GENERAL ต้องถูกปฏิเสธ (BR-RSV-02)
 *
 * IMPORTANT: ต้องเรียกครบ 3 ชั้น: เมนู/หน้า, การ render, และ API ทุกเส้น
 *    การซ่อนแค่เมนูไม่ถือว่ากั้น (TC-B04)
 */
export function canUseAppointments(
  shop: { kind: string; vertical: string } | null | undefined,
): boolean {
  return shop?.kind === "BUSINESS" && shop?.vertical === "GENERAL";
}

/** ป้ายภาษาไทยของสถานะนัด — ใช้ร่วมกันทุก surface เพื่อไม่ให้คำเรียกเพี้ยนกัน */
export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  SCHEDULED: "นัดแล้ว",
  CONFIRMED_BY_BUYER: "ลูกค้ายืนยันแล้ว",
  RESCHEDULE_REQUESTED: "ลูกค้าขอเลื่อน",
  COMPLETED: "ให้บริการแล้ว",
  NO_SHOW: "ไม่มาตามนัด",
};

// ---------------------------------------------------------------------------
// Error ของโดเมนนี้ — route catch แล้ว map เป็น HTTP status
// ทุกตัวต้องมี S-id ครอบใน route catch (บทเรียน feedback_service_error_route_mapping)
// ---------------------------------------------------------------------------

/** เต็มทุกที่นั่งในช่วงเวลานั้น → 409 APPOINTMENT_SLOT_FULL (BR-RSV-16) */
export class AppointmentSlotFullError extends Error {
  constructor(
    readonly resourceName: string,
    readonly capacity: number,
  ) {
    super("APPOINTMENT_SLOT_FULL");
    this.name = "AppointmentSlotFullError";
  }
}

/** นัดจบไปแล้ว แก้ไม่ได้ → 409 APPOINTMENT_TERMINAL (BR-RSV-31) */
export class AppointmentTerminalError extends Error {
  constructor() {
    super("APPOINTMENT_TERMINAL");
    this.name = "AppointmentTerminalError";
  }
}

/** ยังไม่ถึงเวลานัด แต่พยายามปิดผล → 409 APPOINTMENT_NOT_STARTED (BR-RSV-34) */
export class AppointmentNotStartedError extends Error {
  constructor() {
    super("APPOINTMENT_NOT_STARTED");
    this.name = "AppointmentNotStartedError";
  }
}

/** เลยเวลานัดไปแล้ว แต่พยายามขอเลื่อน → 409 APPOINTMENT_PAST (BR-RSV-31) */
export class AppointmentPastError extends Error {
  constructor() {
    super("APPOINTMENT_PAST");
    this.name = "AppointmentPastError";
  }
}

/** ออเดอร์นี้ไม่มีนัด → 404 */
export class AppointmentNotFoundError extends Error {
  constructor() {
    super("APPOINTMENT_NOT_FOUND");
    this.name = "AppointmentNotFoundError";
  }
}

/** ร้านไม่เข้าเงื่อนไข BR-RSV-01 → 403 */
export class AppointmentFeatureUnavailableError extends Error {
  constructor() {
    super("FEATURE_NOT_AVAILABLE");
    this.name = "AppointmentFeatureUnavailableError";
  }
}

export class ServiceResourceNotFoundError extends Error {
  constructor() {
    super("RESOURCE_NOT_FOUND");
    this.name = "ServiceResourceNotFoundError";
  }
}

/** ทรัพยากรถูกปิดการใช้งาน → 409 (BR-RSV-07) */
export class ServiceResourceInactiveError extends Error {
  constructor() {
    super("RESOURCE_INACTIVE");
    this.name = "ServiceResourceInactiveError";
  }
}

/** ลบทรัพยากรที่ยังมีนัดผูกอยู่ → 409 (BR-RSV-08) */
export class ServiceResourceHasAppointmentsError extends Error {
  constructor() {
    super("RESOURCE_HAS_APPOINTMENTS");
    this.name = "ServiceResourceHasAppointmentsError";
  }
}

/** ลดความจุแล้วมีนัดติดอยู่ → 409 (BR-RSV-06.2) */
export class CapacityReductionBlockedError extends Error {
  constructor(
    readonly blockedBy: {
      orderNo: string | null;
      start: Date;
      end: Date;
    },
  ) {
    super("CAPACITY_REDUCTION_BLOCKED");
    this.name = "CapacityReductionBlockedError";
  }
}

/** ช่วงเวลาไม่ถูกต้อง → 400 (BR-RSV-13) */
export class InvalidAppointmentRangeError extends Error {
  constructor() {
    super("INVALID_APPOINTMENT_RANGE");
    this.name = "InvalidAppointmentRangeError";
  }
}
