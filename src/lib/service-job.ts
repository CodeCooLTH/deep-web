/**
 * service-job.ts — error + ค่าคงที่ของ "ปิดงาน / เปิดงานอีกครั้ง" ของร้านบริการ (feature 00073)
 *
 * pure module — ใช้ได้ทั้ง server (service/route) และ client (ข้อความ error)
 */

/** ผลของการปิดงาน — คำที่ร้านเลือกในหน้าปิดงาน */
export const SERVICE_CLOSE_OUTCOMES = ['SERVED', 'NO_SHOW'] as const
export type ServiceCloseOutcome = (typeof SERVICE_CLOSE_OUTCOMES)[number]

/** มัดจำตอนปิดแบบไม่มาตามนัด (มติ D1): เก็บ = เป็นยอดขาย (ค่าตั้งต้น) · คืน = void ⇒ ยอด 0 */
export const SERVICE_NO_SHOW_DEPOSIT = ['KEEP', 'REFUND'] as const
export type ServiceNoShowDeposit = (typeof SERVICE_NO_SHOW_DEPOSIT)[number]

/** เหตุผลที่บันทึกลงรายการเงินที่ถูก void ตอนคืนมัดจำ — ประวัติเงินต้องอ่านออกว่าทำไมหาย */
export const NO_SHOW_REFUND_REASON = 'คืนมัดจำ — ลูกค้าไม่มาตามนัด'

/**
 * feature 00082 — หมายเหตุบนรายการรับเงินที่ระบบบันทึกให้ตอนลูกค้ากด "ยืนยันรับบริการ"
 * (ลูกค้ายืนยัน = ชำระแล้ว · มติ user 2026-10-21/23) — ร้านเห็นว่าใครยืนยัน และยกเลิกรายการนี้ได้ถ้าไม่จริง
 * 🛑 migration ปิดย้อนหลัง (`…_service_buyer_confirm_settle`) ใช้ข้อความเดียวกันนี้ — แก้ที่หนึ่งต้องแก้อีกที่
 */
export const BUYER_CONFIRM_PAYMENT_NOTE = 'ลูกค้ายืนยันรับบริการและชำระแล้ว'

/**
 * บรรทัดท้ายชีตปิดงาน (ServiceCloseSheet) — 00086 FR-011
 * คนที่ไม่มีสิทธิ์รับเงิน (ไม่มี O5 ⇒ ชีตได้ money = null) เห็นกล่องล็อก "รับเงินไม่ได้" อยู่แล้ว
 * ⇒ ห้ามพูดเรื่อง "ยอดเข้าการเงินร้าน" กับเขา (เงินไม่ใช่เรื่องในจอของเขา) — เหลือแค่ขั้นของลูกค้า
 * ผู้ที่เห็นเงิน = ข้อความเดิมตรงตัว
 */
export function serviceCloseFootnote(canSeeMoney: boolean): string {
  const buyerStep = 'ลูกค้ายืนยันรับบริการเพื่อขึ้นหน้าร้านและรีวิว'
  return canSeeMoney ? `ปิดงานแล้วยอดเข้าการเงินร้านทันที · ${buyerStep}` : buyerStep
}

/** หาไม่เจอ (token ผิดร้าน/ไม่มีจริง) */
export class ServiceJobNotFoundError extends Error {
  constructor() {
    super('SERVICE_JOB_NOT_FOUND')
    this.name = 'ServiceJobNotFoundError'
  }
}

/** ปิดไปแล้ว — ปิดซ้ำไม่ได้ (กันสองคนกดพร้อมกัน) */
export class ServiceJobAlreadyClosedError extends Error {
  constructor() {
    super('SERVICE_JOB_ALREADY_CLOSED')
    this.name = 'ServiceJobAlreadyClosedError'
  }
}

/** ยกเลิก/คืนทั้งใบ/ร่าง — ไม่ใช่งานที่ปิดได้ */
export class ServiceJobNotClosableError extends Error {
  constructor() {
    super('SERVICE_JOB_NOT_CLOSABLE')
    this.name = 'ServiceJobNotClosableError'
  }
}

/** เริ่มงานไม่ได้ — ยกเลิก/คืนทั้งใบ/ร่าง (00078) */
export class ServiceJobNotStartableError extends Error {
  constructor() {
    super('SERVICE_JOB_NOT_STARTABLE')
    this.name = 'ServiceJobNotStartableError'
  }
}

/** "ไม่มาตามนัด" ใช้ได้เฉพาะงานที่มีนัด — walk-in ลูกค้ามาแล้วโดยนิยาม */
export class ServiceJobNoShowWithoutAppointmentError extends Error {
  constructor() {
    super('SERVICE_JOB_NO_SHOW_WITHOUT_APPOINTMENT')
    this.name = 'ServiceJobNoShowWithoutAppointmentError'
  }
}

/**
 * 00086 P3 — "ไม่มาตามนัด" กับงานที่กดเริ่มงานแล้ว (เริ่มงาน = ลูกค้ามาแล้ว ขัดกันเอง · ต้นแบบ sheetHtml close)
 * จอซ่อนตัวเลือกนี้เมื่อเริ่มแล้ว · ตัวนี้กันทางที่จอไม่ได้ซ่อน (แชท/บอร์ดที่ข้อมูลค้าง · เรียก API ตรง)
 */
export class ServiceJobNoShowAfterStartError extends Error {
  constructor() {
    super('SERVICE_JOB_NO_SHOW_AFTER_START')
    this.name = 'ServiceJobNoShowAfterStartError'
  }
}

/** เปิดงานอีกครั้งไม่ได้ — ยังไม่ปิด หรือ ลูกค้ายืนยันไปแล้ว (มติ D2) */
export class ServiceJobNotReopenableError extends Error {
  constructor() {
    super('SERVICE_JOB_NOT_REOPENABLE')
    this.name = 'ServiceJobNotReopenableError'
  }
}

/** งานที่ปิดแล้วถูกล็อก — ต้องเปิดงานอีกครั้งก่อนแก้ (มติ D3) / ยกเลิกไม่ได้ (PRD §3.1) */
export class ServiceJobClosedLockedError extends Error {
  constructor() {
    super('SERVICE_JOB_CLOSED_LOCKED')
    this.name = 'ServiceJobClosedLockedError'
  }
}

/** ลูกค้ายืนยันรับบริการงานที่ร้านปิดแบบไม่มาตามนัดไม่ได้ (PRD §3.1) */
export class ServiceJobNoShowConfirmError extends Error {
  constructor() {
    super('SERVICE_JOB_NO_SHOW_CONFIRM')
    this.name = 'ServiceJobNoShowConfirmError'
  }
}

// ─── feature 00086 P3 — ผู้รับผิดชอบ · เริ่ม/ทำเสร็จพร้อมรูป (S-6 · S-8 · S-9 · ตาราง error ใน 00086-p3-plan §1.1) ───

/** การกระทำที่ติดด่าน "งานของตัวเอง" — ใช้เลือกคำในข้อความ (ช่างกดปิดงานคนอื่น ต้องไม่ได้ข้อความว่า "เริ่มงาน") */
export type ServiceJobAction = 'START' | 'FINISH' | 'CLOSE'

const ACTION_VERB: Record<ServiceJobAction, string> = { START: 'เริ่มงาน', FINISH: 'บันทึกว่าทำเสร็จ', CLOSE: 'ปิดงาน' }

/** ช่างล้วนแตะงานที่มีผู้รับผิดชอบเป็นคนอื่น (BRD FR-009 "งานนี้เป็นของ …") */
export class ServiceJobNotAssigneeError extends Error {
  constructor(
    public readonly assigneeName: string | null,
    public readonly action: ServiceJobAction = 'START',
  ) {
    super('SERVICE_JOB_NOT_ASSIGNEE')
    this.name = 'ServiceJobNotAssigneeError'
  }
}

/** ช่างล้วนแตะงานที่ยังไม่มีคนรับ — ต้องกด "รับงานนี้" ก่อน */
export class ServiceJobUnassignedError extends Error {
  constructor() {
    super('SERVICE_JOB_UNASSIGNED')
    this.name = 'ServiceJobUnassignedError'
  }
}

/** ทำเสร็จก่อนเริ่มงาน (CHECK Order_serviceFinished_requires_started เป็นด่านที่สอง) */
export class ServiceJobNotStartedError extends Error {
  constructor() {
    super('SERVICE_JOB_NOT_STARTED')
    this.name = 'ServiceJobNotStartedError'
  }
}

/** ช่างล้วนปิดงานก่อนกด "ทำเสร็จแล้ว" (SDS TD-004 · FR-011 "หลังทำเสร็จ") */
export class ServiceJobNotFinishedError extends Error {
  constructor() {
    super('SERVICE_JOB_NOT_FINISHED')
    this.name = 'ServiceJobNotFinishedError'
  }
}

/** กด "รับงานนี้" แต่มีคนรับไปแล้ว (รวมแพ้การกดพร้อมกัน) */
export class ServiceJobAlreadyAssignedError extends Error {
  constructor(public readonly assigneeName: string | null) {
    super('SERVICE_JOB_ALREADY_ASSIGNED')
    this.name = 'ServiceJobAlreadyAssignedError'
  }
}

/** ร้านตั้ง "บังคับ" แต่ไม่มีรูป */
export class ServiceJobPhotoRequiredError extends Error {
  constructor() {
    super('SERVICE_JOB_PHOTO_REQUIRED')
    this.name = 'ServiceJobPhotoRequiredError'
  }
}

/** ร้านตั้ง "ไม่ใช้รูป" แต่ส่งรูปมา (กันรูปค้างโดยไม่มีที่แสดง) */
export class ServiceJobPhotosDisabledError extends Error {
  constructor() {
    super('SERVICE_JOB_PHOTOS_DISABLED')
    this.name = 'ServiceJobPhotosDisabledError'
  }
}

/** fileId ที่ส่งมาไม่มีไฟล์จริงใน storage (อัปไม่ครบ/ปลอม) — ตรวจก่อนเปิด transaction */
export class ServiceJobPhotoMissingError extends Error {
  constructor() {
    super('SERVICE_JOB_PHOTO_MISSING')
    this.name = 'ServiceJobPhotoMissingError'
  }
}

/** รูปเกิน SERVICE_JOB_MAX_PHOTOS — route ตัดด้วย valibot ก่อนแล้ว ตัวนี้เป็นด่านของ service (เรียกตรงไม่ผ่าน route) */
export class ServiceJobTooManyPhotosError extends Error {
  constructor() {
    super('SERVICE_JOB_TOO_MANY_PHOTOS')
    this.name = 'ServiceJobTooManyPhotosError'
  }
}

/** กด "รับงานนี้" โดยไม่ได้ถือบทบาทช่าง (API §4.8) — route ตัดก่อนแล้ว ตัวนี้เป็นด่านของ service (เรียกตรงไม่ผ่าน route) */
export class ServiceJobClaimTechnicianOnlyError extends Error {
  constructor() {
    super('SERVICE_JOB_CLAIM_TECHNICIAN_ONLY')
    this.name = 'ServiceJobClaimTechnicianOnlyError'
  }
}

/** มอบงานให้คนที่ไม่ใช่สมาชิกฝ่ายช่างของร้าน */
export class AssigneeNotTechnicianError extends Error {
  constructor() {
    super('ASSIGNEE_NOT_TECHNICIAN')
    this.name = 'AssigneeNotTechnicianError'
  }
}

/** แบบรูปก่อน-หลังของร้าน — ต้องตรง CHECK Shop_serviceJobPhoto_check (migration 20261027100500) */
export const SERVICE_JOB_PHOTO_MODES = ['REQUIRED', 'OPTIONAL', 'NONE'] as const
export type ServiceJobPhotoMode = (typeof SERVICE_JOB_PHOTO_MODES)[number]
/** ต้องตรง CHECK ServiceJobRecord_fileIds_max / ServiceJobRecord_note_len (migration 20261027100400) */
export const SERVICE_JOB_MAX_PHOTOS = 10
export const SERVICE_JOB_NOTE_MAX = 1000

/**
 * กติการูปตามการตั้งค่าร้าน (FR-009/010) — ตัดสินที่นี่ที่เดียว ใช้ทั้งตอนเริ่มและทำเสร็จ
 *  - REQUIRED ∧ ไม่มีรูป → PhotoRequired · NONE ∧ มีรูป → PhotosDisabled · เกิน 10 → TooManyPhotos
 * ค่าโหมดที่ไม่รู้จัก (ข้อมูลเพี้ยน) ถือเป็น REQUIRED ไม่ได้ และ NONE ไม่ได้ → ปฏิบัติแบบ OPTIONAL (CHECK ฐานกันอยู่แล้ว)
 */
export function assertServiceJobPhotoInput(mode: string, fileIds: readonly string[]): void {
  if (fileIds.length > SERVICE_JOB_MAX_PHOTOS) throw new ServiceJobTooManyPhotosError()
  if (mode === 'REQUIRED' && fileIds.length === 0) throw new ServiceJobPhotoRequiredError()
  if (mode === 'NONE' && fileIds.length > 0) throw new ServiceJobPhotosDisabledError()
}

/**
 * ข้อความไทยของ error พร้อมชื่อคน (ถ้ามี) — route ใช้ตัวนี้แทนอ่าน SERVICE_JOB_ERROR_MESSAGE ตรง ๆ
 * สำหรับสองรหัสที่มีชื่อ: NOT_ASSIGNEE / ALREADY_ASSIGNED
 */
export function serviceJobErrorMessage(
  code: string,
  opts: { assigneeName?: string | null; action?: ServiceJobAction } = {},
): string {
  const name = opts.assigneeName?.trim()
  if (code === 'SERVICE_JOB_NOT_ASSIGNEE' && name) {
    return `งานนี้เป็นของ ${name} · ${ACTION_VERB[opts.action ?? 'START']}ได้เฉพาะผู้รับผิดชอบ`
  }
  if (code === 'SERVICE_JOB_ALREADY_ASSIGNED' && name) return `มีคนรับงานนี้แล้ว · ${name}`
  return SERVICE_JOB_ERROR_MESSAGE[code] ?? code
}

/** ข้อความภาษาธุรกิจต่อ error — ใช้ทั้ง route (message) และ client (fallback) */
export const SERVICE_JOB_ERROR_MESSAGE: Record<string, string> = {
  SERVICE_JOB_NOT_FOUND: 'ไม่พบงานนี้ในร้าน',
  SERVICE_JOB_ALREADY_CLOSED: 'งานนี้ปิดไปแล้ว',
  SERVICE_JOB_NOT_CLOSABLE: 'งานนี้ถูกยกเลิกหรือยังเป็นร่าง จึงปิดงานไม่ได้',
  SERVICE_JOB_NOT_STARTABLE: 'งานนี้ถูกยกเลิกหรือยังเป็นร่าง จึงเริ่มงานไม่ได้',
  SERVICE_JOB_NO_SHOW_WITHOUT_APPOINTMENT: 'งานที่ไม่มีนัดบันทึกว่าไม่มาตามนัดไม่ได้',
  SERVICE_JOB_NO_SHOW_AFTER_START: 'งานนี้เริ่มงานแล้ว (ลูกค้ามาแล้ว) จึงบันทึกว่าไม่มาตามนัดไม่ได้ · เลือก "ให้บริการแล้ว"',
  SERVICE_JOB_NOT_REOPENABLE: 'เปิดงานอีกครั้งได้เฉพาะงานที่ปิดแล้วและลูกค้ายังไม่ยืนยัน',
  SERVICE_JOB_CLOSED_LOCKED: 'งานนี้ปิดแล้ว — กด "เปิดงานอีกครั้ง" ก่อนถ้าต้องการแก้ไข',
  SERVICE_JOB_NO_SHOW_CONFIRM: 'ร้านบันทึกว่างานนี้ไม่ได้เข้ารับบริการ จึงยืนยันรับบริการไม่ได้',
  // 00086 P3 — ตัวที่มีชื่อคนใช้ serviceJobErrorMessage() เติมชื่อ · ค่าตรงนี้เป็น fallback ตอนไม่รู้ชื่อ
  SERVICE_JOB_NOT_ASSIGNEE: 'งานนี้เป็นของผู้รับผิดชอบคนอื่น · ทำได้เฉพาะผู้รับผิดชอบ',
  SERVICE_JOB_UNASSIGNED: 'กด "รับงานนี้" ก่อนเริ่มงาน',
  SERVICE_JOB_NOT_STARTED: 'งานนี้ยังไม่ได้เริ่ม · กด "เริ่มงาน" ก่อนบันทึกว่าทำเสร็จ',
  SERVICE_JOB_NOT_FINISHED: 'กด "ทำเสร็จแล้ว" ก่อนปิดงาน',
  SERVICE_JOB_ALREADY_ASSIGNED: 'มีคนรับงานนี้แล้ว',
  SERVICE_JOB_PHOTO_REQUIRED: 'ถ่ายรูปอย่างน้อย 1 รูปก่อน',
  SERVICE_JOB_PHOTOS_DISABLED: 'ร้านตั้งค่าไม่ใช้รูป · บันทึกเป็นข้อความได้',
  SERVICE_JOB_PHOTO_MISSING: 'มีรูปที่อัปโหลดไม่สำเร็จ · ลองแนบรูปใหม่อีกครั้ง',
  SERVICE_JOB_TOO_MANY_PHOTOS: 'แนบรูปได้ไม่เกิน 10 รูป',
  SERVICE_JOB_CLAIM_TECHNICIAN_ONLY: 'รับงานได้เฉพาะพนักงานฝ่ายช่าง',
  ASSIGNEE_NOT_TECHNICIAN: 'มอบงานได้เฉพาะพนักงานฝ่ายช่างของร้าน',
}

/**
 * feature 00086 S-5 (FR-005/FR-011) — ปุ่มบนการ์ด "งานนี้" (ServiceJobCard) ตัดสินที่นี่ที่เดียว
 *
 * 🛑 เริ่มงาน กับ ปิดงาน เป็น **คนละสิทธิ์** แล้ว: เริ่มงาน = O4 (เดิม) · ปิดงาน = memberCanCloseJob
 * (ร้านบริการ: เจ้าของ/ผู้จัดการ/คนที่ติ๊ก "ปิดงานได้") — เดิมทั้งคู่ผูกกับ canClose ตัวเดียว
 * ถ้าปุ่มเริ่มงานกลับไปอ่าน canClose พนักงานที่เริ่มงานได้แต่ปิดไม่ได้จะเริ่มงานไม่ได้อีก โดยไม่มี tsc ตัวไหนฟ้อง
 * (docs/conventions/ui-boolean-needs-a-testable-home.md)
 *
 * P3 (S-6/8/9 · BRD §8.1/§8.2) เพิ่ม: รับงาน · ทำเสร็จแล้ว · ด่าน "ช่างล้วนเฉพาะงานของตัวเอง" · ข้อความปิดงานไม่ได้ (FR-011)
 *  - ช่างล้วน: เริ่ม/ทำเสร็จได้เฉพาะงานที่ตัวเองรับผิดชอบ · งานยังไม่มีคนรับ → ปุ่ม "รับงานนี้" แทนปุ่มเริ่ม
 *  - ช่างล้วน: ปิดงานได้ต่อเมื่อเป็นงานของตัวเอง **และทำเสร็จแล้ว** (SDS TD-004) · คนอื่นที่ปิดได้ ปิดก่อนทำเสร็จได้ (FR-010)
 * ด่านจริงอยู่ที่ server (service-job.service) — ตรงนี้คือ "ปุ่มไหนขึ้น" ให้ตรงกับด่านนั้น
 *
 * input ใหม่ของ P3 ไม่บังคับส่งชั่วคราว (ServiceJobCard ยังเป็นรุ่น P2 จน T6 ต่อ) — ค่าที่ไม่ส่ง = ปุ่มใหม่ไม่ขึ้น
 * (canFinish/canClaim/finished/assigned/isAssignee = false) และ technicianOnly = false = พฤติกรรม P2 เดิมเป๊ะ
 * ด่านของช่างล้วนไม่ได้พึ่งค่านี้ — server ปฏิเสธเองอยู่แล้ว (serviceJobActorBlock)
 */
export type ServiceJobCloseBlockedNote = 'NONE' | 'NO_RIGHT' | 'TECH_END'

export function serviceJobCardButtons(input: {
  canStart: boolean
  canClose: boolean
  /** สถานะงานปิดได้ (canCloseServiceJob ของ service-status) — ไม่ใช่สิทธิ์ของผู้ดู */
  closable: boolean
  started: boolean
  /** ยังไม่ถึงเวลานัด */
  notStarted: boolean
  /** 00086 — กด "ทำเสร็จแล้ว" ได้ตามบทบาท (O4 · ตัวเดียวกับเริ่มงาน) */
  canFinish?: boolean
  /** 00086 — canClaimServiceJob(roles) */
  canClaim?: boolean
  /** 00086 — isTechnicianOnly(roles) */
  technicianOnly?: boolean
  /** 00086 — Order.serviceFinishedAt != null */
  finished?: boolean
  /** 00086 — Order.assignedUserId != null */
  assigned?: boolean
  /** 00086 — Order.assignedUserId === ผู้ดู */
  isAssignee?: boolean
}): {
  startedNote: boolean
  start: boolean
  finish: boolean
  claim: boolean
  close: boolean
  /** ช่างล้วนดูงานของคนอื่น → "งานนี้เป็นของ {ชื่อ} · …" */
  notAssigneeNote: boolean
  /** ทำเสร็จแล้วแต่ผู้ดูปิดไม่ได้ → NO_RIGHT "ทำเสร็จแล้ว · รอเจ้าของร้าน…" · TECH_END (ช่างเจ้าของงาน) = "ส่งงานแล้ว · รอเจ้าของร้านหรือผู้มีสิทธิ์ปิดงาน" */
  closeBlockedNote: ServiceJobCloseBlockedNote
} {
  const { canStart, canClose, closable, started, notStarted } = input
  const canFinish = input.canFinish === true
  const canClaim = input.canClaim === true
  const technicianOnly = input.technicianOnly === true
  const finished = input.finished === true
  const assigned = input.assigned === true
  const isAssignee = assigned && input.isAssignee === true
  // ช่างล้วนแตะได้เฉพาะงานของตัวเอง · บทบาทอื่นทำแทนได้ทุกใบ (BRD §8.2)
  const actorOk = !technicianOnly || isAssignee
  const close = canClose && closable && (!technicianOnly || (isAssignee && finished))
  const notAssigneeNote = technicianOnly && closable && assigned && !isAssignee
  return {
    startedNote: canStart && closable && started,
    start: canStart && closable && !started && !notStarted && actorOk,
    finish: canFinish && closable && started && !finished && actorOk,
    claim: canClaim && technicianOnly && closable && !assigned,
    close,
    notAssigneeNote,
    // งานของคนอื่น: กล่อง "งานนี้เป็นของ …" บอกครบแล้ว ไม่ซ้อนกล่องที่สอง
    closeBlockedNote:
      closable && finished && !close && !notAssigneeNote ? (technicianOnly && !canClose ? 'TECH_END' : 'NO_RIGHT') : 'NONE',
  }
}
