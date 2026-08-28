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
 * feature 00028 (BR-SBT-11) — เดิมต้องเข้าเงื่อนไข "ทั้งสองอย่าง" (kind is BUSINESS และ
 * vertical เป็นค่าเก่าที่ครอบทั้งร้านขายของและร้านรับคิวไว้ด้วยกัน — vertical มีแค่ 2 ค่าตอนนั้น)
 * ตอนนี้ vertical แยกเป็น 3 ทางแล้ว เหลือเช็คแค่ vertical==='SERVICE_QUEUE'
 * เงื่อนไขเดียวพอ — บัญชีบุคคลธรรมดาที่เลือก SERVICE_QUEUE ใช้คิวงานได้แล้วด้วย (matrix §8.1)
 *
 * IMPORTANT: ต้องเรียกครบ 3 ชั้น: เมนู/หน้า, การ render, และ API ทุกเส้น
 *    การซ่อนแค่เมนูไม่ถือว่ากั้น (TC-B04)
 */
export function canUseAppointments(
  shop: { kind: string; vertical: string } | null | undefined,
): boolean {
  return shop?.vertical === "SERVICE_QUEUE";
}

/**
 * รูปแบบมัดจำเริ่มต้นของทรัพยากร (BR-RSV-43) — FR-RSV-12
 *
 * ประกาศแยกจาก DEPOSIT_MODES ของ src/lib/lodging.ts โดยตั้งใจ แม้ค่าจะเหมือนกันตอนนี้
 * เพราะเป็นคนละโดเมน (บริการ vs ห้องพัก) และมีกฎต่างกันจริง: ของบ้านพัก มัดจำ > 0
 * บังคับ flow แนบสลิปก่อนยืนยัน ส่วนของที่นี่ไม่กั้นการกันคิวเลย (BR-RSV-49/50)
 * การ import ข้ามโดเมนจะทำให้คนแก้ทีหลังเข้าใจผิดว่าสองที่นี้ต้องเปลี่ยนพร้อมกัน
 */
export const APPOINTMENT_DEPOSIT_MODES = {
  FIXED: "จำนวนเงิน (บาท)",
  PERCENT: "เปอร์เซ็นต์ของยอดรวม",
} as const;

export type AppointmentDepositMode = keyof typeof APPOINTMENT_DEPOSIT_MODES;

/**
 * หน่วยเวลาของการนัด (FR-RSV-13, BR-RSV-53) — ค่าตั้งค่าระดับร้าน
 *
 * IMPORTANT: เป็นแค่ค่าที่บอกว่า "ฟอร์มควรถามอะไร" ไม่ใช่ชนิดของข้อมูล — ทั้งสองโหมด
 * เก็บด้วย Order.serviceStart/serviceEnd ชุดเดียวกัน (BR-RSV-54) เปลี่ยนโหมดต้องไม่แตะ
 * นัดเก่าแม้แต่แถวเดียว (BR-RSV-55)
 */
export const APPOINTMENT_GRANULARITY = {
  DAY: "DAY",
  TIME: "TIME",
} as const;

export type AppointmentGranularity =
  (typeof APPOINTMENT_GRANULARITY)[keyof typeof APPOINTMENT_GRANULARITY];

export const APPOINTMENT_GRANULARITY_LABEL: Record<AppointmentGranularity, string> = {
  DAY: "รับนัดเป็นรายวัน",
  TIME: "ระบุช่วงเวลา",
};

export function isAppointmentGranularity(v: string): v is AppointmentGranularity {
  return v === "DAY" || v === "TIME";
}

// เวลาไทยคงที่ UTC+7 ไม่มี DST → คำนวณขอบวันด้วย offset คงที่ได้ปลอดภัย
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/**
 * นัดนี้กินทั้งวันพอดีไหม — ใช้ตัดสิน "การแสดงผล" ของแต่ละแถว
 *
 * IMPORTANT: ตัดสินจาก **ข้อมูลจริงของแถวนั้น** ไม่ใช่จากโหมดปัจจุบันของร้าน (BR-RSV-57)
 * ร้านที่สลับโหมดไป-มาจะได้ไม่เห็นนัดเก่าเพี้ยน — นัดที่บันทึกตอนโหมดรายวันยังแสดงว่า
 * "ทั้งวัน" ต่อไปแม้ร้านจะเปลี่ยนเป็นระบุช่วงเวลาแล้ว
 */
export function isAllDayAppointment(start: Date, end: Date): boolean {
  const s = start.getTime() + BKK_OFFSET_MS;
  const e = end.getTime() + BKK_OFFSET_MS;
  return s % DAY_MS === 0 && e % DAY_MS === 0 && e - s === DAY_MS;
}

/**
 * รวม "YYYY-MM-DD" + "HH:mm" เป็น Date ตามเวลาเครื่อง (ผู้ใช้คิดเป็นเวลาไทยอยู่แล้ว)
 *
 * ย้ายมาจาก AppointmentBlock.tsx เมื่อ 2026-08-08 ตอนย้ายการเลือกเวลาเข้าไปในปฏิทิน —
 * ตอนนี้มีผู้ใช้ 2 ที่ (ฟอร์มใช้คำนวณ "นัดนี้ผ่านไปแล้วไหม" · ชีตปฏิทินใช้เช็คช่วงเวลาทับกัน)
 * ถ้าปล่อยให้ต่างคนต่างประกาศ วันหนึ่งจะตัดสิน "เวลาเดียวกัน" ไม่ตรงกัน (HR16)
 */
export function combineDateTime(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * บวกนาทีเข้ากับ "HH:mm" แล้วคืนเป็น "HH:mm" — ใช้ auto-fill เวลาสิ้นสุดจากระยะเวลามาตรฐาน
 *
 * IMPORTANT: วนกลับที่ 24 ชม. (`% 24`) โดยตั้งใจ — คิวที่ยาวข้ามเที่ยงคืนจะได้เวลาสิ้นสุดที่
 * "ดูเหมือนย้อนหลัง" ซึ่งเป็นค่าตั้งต้นที่ผู้ใช้ต้องเห็นแล้วแก้เอง ไม่ใช่ค่าที่ระบบเงียบ ๆ
 * ตีความให้ (ตัวที่กันจริงคือปุ่มยืนยันที่บังคับให้เวลาสิ้นสุดอยู่หลังเวลาเริ่ม)
 */
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const total = h * 60 + m + minutes;
  const hh = `${Math.floor((total / 60) % 24)}`.padStart(2, "0");
  const mm = `${total % 60}`.padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * จำนวนนาทีระหว่าง "HH:mm" สองค่าในวันเดียวกัน — null เมื่ออ่านค่าไม่ได้หรือปลายทางไม่ได้อยู่หลังต้นทาง
 *
 * คู่กับ addMinutesToTime (ทิศกลับ) — ใช้ตอนเปิดชีตซ้ำเพื่อถอดว่า "ช่วงที่บันทึกไว้เดิม
 * ยาวเท่าไหร่" แล้วเลือกชิประยะเวลาให้ถูกอันโดยไม่ต้องเก็บ duration ลงฐาน
 * (ฐานเก็บ start/end เป็นความจริง ระยะเวลาเป็นแค่วิธีกรอก — ห้ามเพิ่มคอลัมน์ให้มันเป็นความจริงที่สอง)
 */
export function minutesBetweenTimes(start: string, end: string): number | null {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : null;
}

/**
 * ระยะเวลาตั้งต้นเมื่อคิวงานไม่ได้ตั้ง `durationMinutes` ไว้ (schema เปิดให้เป็น null ได้)
 *
 * ต้องมีค่าตั้งต้นเสมอ ห้ามปล่อยว่าง — ทางลัด "กดครั้งเดียวได้ทั้งเริ่มและจบ" ของเวอร์ชันก่อน
 * ทำงานเฉพาะร้านที่ตั้งระยะเวลาไว้ ร้านที่ไม่ได้ตั้งจะได้แค่เวลาเริ่มแล้วค้าง
 */
export const DEFAULT_APPOINTMENT_DURATION_MIN = 60;

/**
 * ถอดค่าที่ฟอร์มถืออยู่ (start/end) กลับเป็น "ระยะเวลา" เพื่อเลือกชิปให้ถูกอันตอนเปิดชีตซ้ำ
 *
 * ฐานข้อมูลเก็บ start/end เป็นความจริง ระยะเวลาเป็นแค่ *วิธีกรอก* — ห้ามเพิ่มคอลัมน์ให้มัน
 * กลายเป็นความจริงที่สอง (docs/conventions/stored-flag-vs-owner-truth.md) จึง derive ทุกครั้ง
 *
 * 🛑 กติกา 3 ข้อที่มีเทสผูกไว้ (src/lib/__tests__/appointment-duration.test.ts) — แก้แล้วต้องแดง:
 *   1. ช่วงที่ตรงชิปพอดี → เลือกชิปนั้น (เปิดออเดอร์เดิมแล้วต้องเห็นว่าเคยตั้งอะไรไว้)
 *   2. ช่วงที่ไม่ตรงชิปไหนเลย (13:00–16:45) → โหมด "กำหนดเอง" พร้อมค่าเดิมเป๊ะ
 *      **ห้าม snap ให้ใกล้เคียง** — เปิดดูออเดอร์เดิมแล้วเวลาขยับเองคือการแก้ข้อมูลโดยไม่มีใครสั่ง
 *   3. ค่าเสียที่ค้างมาจากฟอร์ม (end ไม่ได้อยู่หลัง start เช่นบั๊ก 13:00/12:25 ของ 2026-08-09)
 *      → **ห้ามพาเข้ามาต่อ** ตกกลับไปใช้ระยะเวลามาตรฐาน ไม่งั้นจอเปิดมาพร้อม error ตั้งแต่ paint แรก
 */
export function resolveInitialDuration(
  startTime: string | undefined,
  endTime: string | undefined,
  choices: number[],
  resourceDefault: number | null | undefined,
): { durationMin: number | null; customEnd: string } {
  if (startTime && endTime) {
    const diff = minutesBetweenTimes(startTime, endTime);
    if (diff != null) {
      return choices.includes(diff)
        ? { durationMin: diff, customEnd: "" }
        : { durationMin: null, customEnd: endTime };
    }
  }
  return {
    durationMin:
      resourceDefault && resourceDefault > 0
        ? resourceDefault
        : DEFAULT_APPOINTMENT_DURATION_MIN,
    customEnd: "",
  };
}

/**
 * ปุ่ม "เวลาอื่น / ย่อกลับ" ควรพาไปสถานะไหน
 *
 * 🛑 กติกา: ย่อกลับได้ก็ต่อเมื่อเวลาเริ่มที่เลือกไว้ **ไม่ได้อยู่นอกหน้าต่างตั้งต้น** — ไม่งั้น
 * กริดจะวาด 12 ชิปโดยไม่มีตัวไหน active ขณะที่กล่องสรุปยังยืนยันเวลาเดิมและปุ่มยืนยันกดได้
 * (จอโกหกตัวเอง). กางออกทำได้เสมอ
 *
 * ทำไมต้องเป็นฟังก์ชันแยกทั้งที่เป็นเทอร์นารีบรรทัดเดียว: ตอนอยู่ใน JSX มันเขียนกลับด้าน
 * (`!startsOutside` แทน `startsOutside`) แล้วผลคือ **ปุ่มย่อกลับไม่ทำงานเลยทุกกรณี** —
 * ผ่าน tsc/build/detector/theme-guard ครบเพราะเป็น boolean ที่ถูกต้องตามชนิดทุกประการ
 * และไม่มีเทสไหนเอื้อมถึงตรรกะที่ฝังอยู่ใน onClick (user เจอเองบน prod 2026-08-09)
 */
export function nextShowAllHours(
  currentlyExpanded: boolean,
  startsOutsideDefaultWindow: boolean,
): boolean {
  if (!currentlyExpanded) return true;
  return startsOutsideDefaultWindow;
}

/**
 * ระยะเวลาเป็นคำไทย: 30 → "30 นาที" · 60 → "1 ชม." · 90 → "1 ชม. 30 นาที"
 *
 * HR16 — SSOT ของ "คำเรียกระยะเวลาบริการ" ทั้งระบบ. ก่อนหน้านี้มี 2 ที่เขียน `${นาที} นาที`
 * ดิบ ๆ เอง (ResourceList / PublicServiceList) ซึ่งอ่านว่า "90 นาที" ขณะที่จอเลือกเวลาจะ
 * อ่านว่า "1 ชม. 30 นาที" — เลขเดียวกัน คนละคำ คนละหน้าจอ โดยไม่มี tsc/build ตัวไหนฟ้อง
 * เพราะทั้งคู่เป็นสตริงที่ถูกในตัวเอง. เพิ่มที่เรียกใหม่ต้องเรียกตัวนี้ ห้ามประกอบคำเอง
 */
export function formatDurationTH(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} นาที`;
  if (m === 0) return `${h} ชม.`;
  return `${h} ชม. ${m} นาที`;
}

/**
 * ป้ายภาษาไทยของสถานะนัด — **มุมของร้าน** ใช้ทุก surface ฝั่งผู้ขาย
 * (ปฏิทินคิวงาน · รายการงาน · ห้องแชท) เพื่อไม่ให้คำเรียกเพี้ยนกัน
 */
export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  SCHEDULED: "นัดแล้ว",
  CONFIRMED_BY_BUYER: "ลูกค้ายืนยันแล้ว",
  RESCHEDULE_REQUESTED: "ลูกค้าขอเลื่อน",
  COMPLETED: "ให้บริการแล้ว",
  NO_SHOW: "ไม่มาตามนัด",
};

/**
 * ป้ายเดียวกัน แต่พูดกับ **ผู้ซื้อ** — ใช้เฉพาะหน้า `/o/[token]`
 *
 * ## 🛑 ทำไมต้องมีสองชุด ไม่ใช่ชุดเดียว
 *
 * ชุดบนเขียนจากมุมของร้าน จึงเรียกผู้ซื้อว่า **"ลูกค้า"** — พอเอาไปแปะบนหน้าของผู้ซื้อเอง
 * เขาจะอ่านว่า *"ลูกค้ายืนยันแล้ว"* เกี่ยวกับตัวเอง ซึ่งเป็นการพูดถึงเขาเป็นบุคคลที่สาม
 * บนหน้าที่เป็นของเขา (อาการนี้อยู่บน prod มาตั้งแต่ 00024 ไม่มีใครทัก)
 *
 * และ `SCHEDULED` หนักกว่านั้น: *"นัดแล้ว"* เป็นข้อเท็จจริงเฉย ๆ ทั้งที่ตรงนั้น
 * **ผู้ซื้อคือคนที่ต้องลงมือ** — ป้ายที่ไม่บอกว่าต้องทำอะไรบนหน้าที่รอเขาอยู่ คือป้ายที่เสียเปล่า
 *
 * ## กติกาเวลาจะเพิ่ม/แก้
 *
 * ต้องแก้ **คู่กัน** เสมอและอยู่ติดกันในไฟล์นี้ (HR16) — ชุดล่างไม่ใช่ "คำแปล" ของชุดบน
 * แต่เป็นคำตอบของคำถามเดียวกันจากอีกฝั่งของโต๊ะ · ค่าที่ไม่มีมุมมอง (`COMPLETED`/`NO_SHOW`)
 * ใช้คำเดียวกันได้และควรเหมือนกัน ไม่ต้องแต่งให้ต่าง
 *
 * คลาสเดียวกับ `describeProgress(audience)` ของไทม์ไลน์พัสดุ ซึ่งเคยไม่มีพารามิเตอร์นี้
 * แล้วหน้าผู้ซื้อขึ้นกล่องเตือนที่เขียนสำหรับผู้ขายคำต่อคำ
 */
export const APPOINTMENT_STATUS_LABEL_BUYER: Record<AppointmentStatus, string> = {
  SCHEDULED: "รอยืนยันจากคุณ",
  CONFIRMED_BY_BUYER: "คุณยืนยันแล้ว",
  RESCHEDULE_REQUESTED: "คุณขอเลื่อนนัด",
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

/**
 * ช่วงเวลาของงาน walk-in (feature 00050 · BR-SQ-21)
 *
 * 🛑 **walk-in ไม่ใช่ "นัดที่ไม่มีเวลา"** — มันคืองานที่เริ่ม ณ เวลาที่กด ต้องมีเวลาเริ่มจริง
 * ระบบเดิมปล่อย `serviceStart = null` แล้วงานหายจากทุกจอ: ตารางงานรายวันกรองด้วย
 * `serviceStart < to AND serviceEnd > from` ซึ่ง `null` ไม่เข้าเงื่อนไขทั้งคู่
 * ⇒ ร้านมีงานที่ทำอยู่จริงแต่ตารางบอกว่าวันนี้ว่าง โดยไม่มีอะไรฟ้อง
 *
 * ปัดวินาที/มิลลิวินาทีทิ้ง: เวลาที่ผู้ใช้เห็นบนตารางคือ "13:04" อยู่แล้ว การเก็บ 13:04:37.812
 * ทำให้ช่วงเวลาสองงานที่ดูเหมือนต่อกันพอดี **ไม่ต่อกันจริง** ในสายตาของ EXCLUDE constraint
 * (`tstzrange('[)')`) แล้วเกิดช่องว่าง 23 วินาทีที่ไม่มีใครอธิบายได้
 *
 * ระยะเวลาที่ไม่สมเหตุสมผล (0/ติดลบ/NaN) ตกไปใช้ค่ามาตรฐาน — **ห้ามคืนช่วงว่างเปล่า**
 * เพราะ `assertValidRange` จะโยน error แล้วผู้ใช้เห็นแค่ "ข้อมูลไม่ถูกต้อง" โดยไม่รู้ว่าอะไรผิด
 */
export function walkInWindow(
  now: Date,
  durationMinutes: number | null | undefined,
): { start: Date; end: Date } {
  const start = new Date(now.getTime());
  start.setSeconds(0, 0);
  const minutes =
    typeof durationMinutes === "number" && Number.isFinite(durationMinutes) && durationMinutes > 0
      ? Math.floor(durationMinutes)
      : DEFAULT_APPOINTMENT_DURATION_MIN;
  return { start, end: new Date(start.getTime() + minutes * 60_000) };
}
