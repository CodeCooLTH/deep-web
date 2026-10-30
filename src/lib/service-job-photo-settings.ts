/**
 * service-job-photo-settings — การ์ดตั้งค่า "รูปก่อน-หลังงาน" ในหน้าประเภทงาน (feature 00086 P3-T10 · S-11 · FR-013)
 *
 * 🛑 ตัวตัดสินของการ์ด (สวิตช์เปิด/ปิด/กดได้ · ค่าหลังเลือก · ข้อความยืนยัน) อยู่ที่นี่ ไม่ใช่ในเทอร์นารีกลาง JSX
 * (docs/conventions/ui-boolean-needs-a-testable-home.md) — "ไม่ใช้รูป ⇒ ลูกค้าไม่เห็น" ถ้าเขียนกลับด้าน
 * จอจะโชว์สวิตช์เปิดค้างทั้งที่ server บังคับปิดแล้ว (updateServiceJobPhotoSettings) โดยไม่มีอะไรฟ้อง
 */
import { SERVICE_JOB_PHOTO_MODES, type ServiceJobPhotoMode } from './service-job'

export interface ServiceJobPhotoSettings {
  mode: ServiceJobPhotoMode
  buyerVisible: boolean
}

/** ค่าเริ่มของร้าน (FR-013) — ตรงกับ @default ใน schema */
export const DEFAULT_SERVICE_JOB_PHOTO_SETTINGS: ServiceJobPhotoSettings = { mode: 'OPTIONAL', buyerVisible: false }

/** ตัวเลือก 3 ใบตามลำดับต้นแบบ v13 `screenSettings` — คำอธิบายเป็นกลาง ใช้กับทุกประเภทธุรกิจ */
export const SERVICE_JOB_PHOTO_MODE_COPY: Record<ServiceJobPhotoMode, { title: string; hint: string }> = {
  REQUIRED: { title: 'บังคับ', hint: 'ต้องถ่ายอย่างน้อย 1 รูปทั้งตอนเริ่มและตอนเสร็จ' },
  OPTIONAL: { title: 'ไม่บังคับ', hint: 'มีช่องถ่ายรูป แต่ข้ามได้' },
  NONE: { title: 'ไม่ใช้รูป', hint: 'เหมาะกับงานส่วนตัว เช่น นวด · ยังบันทึกข้อความได้' },
}

/**
 * ค่าจากแถว Shop → ค่าของการ์ด · โหมดที่ไม่รู้จัก (ข้อมูลเพี้ยน) = OPTIONAL
 * NONE ⇒ buyerVisible false เสมอ (เท่ากติกา server + CHECK ฐาน)
 */
export function initialServiceJobPhotoSettings(
  mode: string | null | undefined,
  buyerVisible: boolean | null | undefined,
): ServiceJobPhotoSettings {
  const m = (SERVICE_JOB_PHOTO_MODES as readonly string[]).includes(mode ?? '')
    ? (mode as ServiceJobPhotoMode)
    : DEFAULT_SERVICE_JOB_PHOTO_SETTINGS.mode
  return { mode: m, buyerVisible: m === 'NONE' ? false : buyerVisible === true }
}

/** สวิตช์ "ลูกค้าเห็นรูปและบันทึก" — NONE = ปิดและกดไม่ได้ */
export function photoVisibilitySwitch(s: ServiceJobPhotoSettings): { checked: boolean; disabled: boolean } {
  const none = s.mode === 'NONE'
  return { checked: !none && s.buyerVisible, disabled: none }
}

/** ค่าหลังเลือกโหมด (optimistic) — เลือก NONE ปิดสวิตช์ตาม · กลับจาก NONE ไม่เปิดสวิตช์คืนเอง */
export function settingsAfterModeChange(prev: ServiceJobPhotoSettings, mode: ServiceJobPhotoMode): ServiceJobPhotoSettings {
  return { mode, buyerVisible: mode === 'NONE' ? false : prev.buyerVisible }
}

/** toast สำเร็จหลังเปลี่ยนโหมด — เลือก NONE ขณะสวิตช์เปิด ต้องบอกว่าสวิตช์ถูกปิดตามด้วย */
export function modeChangedToast(prev: ServiceJobPhotoSettings, mode: ServiceJobPhotoMode): string {
  if (mode === 'NONE' && prev.mode !== 'NONE' && prev.buyerVisible) return 'ไม่ใช้รูปแล้ว · ปิดการแสดงรูปให้ลูกค้าด้วย'
  return `ตั้งค่ารูปเป็น "${SERVICE_JOB_PHOTO_MODE_COPY[mode].title}" แล้ว`
}

/** toast สำเร็จหลังสลับสวิตช์ */
export function visibilityChangedToast(buyerVisible: boolean): string {
  // critique P1-8 — "เปิดให้…" ไม่ใช่ "ลูกค้าเห็น…แล้ว" (ฟังเหมือนลูกค้าเปิดดูแล้ว)
  return buyerVisible ? 'เปิดให้ลูกค้าเห็นรูปและบันทึกแล้ว' : 'ซ่อนรูปและบันทึกจากลูกค้าแล้ว'
}

/** คำใต้สวิตช์ */
export const PHOTO_VISIBILITY_HINT = 'แสดงในหน้างานบริการที่ลูกค้าเปิดจากลิงก์'
export const PHOTO_VISIBILITY_OFF_BY_NONE_HINT = 'ปิดอยู่เพราะเลือก "ไม่ใช้รูป"'
/**
 * Controller decision Q2 (2026-10-29) — ผลข้างเคียงจริงตาม PRD §10.2 ให้ร้านรู้ก่อนเปิด
 *
 * critique P1-7 — บอกเงื่อนไขตามจริง: SERVICE_FINISHED เป็นชนิด implicit (ไม่มีสวิตช์ส่งอัตโนมัติของตัวเอง —
 * สวิตช์นี้คือตัวเปิด) แต่ยังต้องผ่าน `evaluateAutoNotifyEligibility` ซึ่งตัดใบที่ไม่ผูกห้องแชท (NO_CONVERSATION)
 * ⇒ งาน walk-in ที่ไม่มีแชทกับลูกค้าไม่ได้ข้อความ · คำเดียวกับชีตทำเสร็จ (ServiceJobPhotoSheet notifyText)
 */
export const PHOTO_VISIBILITY_SENDS_MESSAGE_HINT =
  'เมื่อช่างกด "ทำเสร็จแล้ว" ระบบส่งลิงก์ดูรูปให้ลูกค้าในแชท (เฉพาะงานที่มีแชทกับลูกค้า)'

/**
 * บรรทัดใต้สวิตช์ตามสถานะ
 *  - NONE → บอกว่าทำไมกดไม่ได้ (บรรทัดเดียว)
 *  - อื่น → คำอธิบาย + คำเตือนเรื่องข้อความถึงลูกค้า (แสดงทั้งตอนปิดและเปิด: ร้านต้องรู้ "ก่อน" เปิด)
 */
export function photoVisibilityHints(s: ServiceJobPhotoSettings): string[] {
  if (s.mode === 'NONE') return [PHOTO_VISIBILITY_OFF_BY_NONE_HINT]
  return [PHOTO_VISIBILITY_HINT, PHOTO_VISIBILITY_SENDS_MESSAGE_HINT]
}
