/**
 * autosave — ส่วน pure ของ useAutosave (00068 · addendum E §4.4) · ตัดสินว่า patch รวมกันอย่างไร / response ทับ state ตรงไหน / error ทำอะไร
 *
 * ทำไมแยกจาก hook: กติกา "response ของคำขอเก่าห้ามกระโดดทับสิ่งที่ผู้ใช้เพิ่งกด" ต้องมีเทส mutation จับ
 */
import { INVALID_SETTINGS_RULE_MESSAGE, type InvalidSettingsRule } from '@/lib/line-report/errors'

export type SettingsPatch = Partial<{
  dailyEnabled: boolean
  dailyTimes: number[]
  monthlyEnabled: boolean
  cutoffDay: number | null
  showOrders: boolean
  showSales: boolean
  showCancelled: boolean
  showTopProducts: boolean
  showProfit: boolean
  skipWhenNoOrders: boolean
  attachCycleToDaily: boolean
  /** ไปพร้อม showProfit:true คำขอเดียวกันเท่านั้น */
  confirmProfit: true
}>

export const SAVE_FALLBACK = 'บันทึกไม่สำเร็จ ค่ากลับเป็นเดิมแล้ว ลองอีกครั้ง'
export const RATE_LIMIT_MESSAGE = 'ส่งคำขอถี่เกินไป ลองใหม่ภายหลัง'

/** key เดียวกันทับค่าเดิม · ถ้า showProfit ไม่ใช่ true แล้ว (ผู้ใช้ปิดทันทีหลังเปิด) → ทิ้ง confirmProfit (ไม่ส่ง confirm ลอย ๆ) */
export function coalescePatch(pending: SettingsPatch, next: SettingsPatch): SettingsPatch {
  const merged: SettingsPatch = { ...pending, ...next }
  if (merged.showProfit !== true) delete merged.confirmProfit
  return merged
}

export const isEmptyPatch = (p: SettingsPatch): boolean => Object.keys(p).length === 0

/** ค่าที่แสดง = ค่าที่ server ยืนยัน แล้วทับด้วยคีย์ที่ยังไม่ส่ง (ไม่ให้ response เก่ากระโดดทับ) · confirmProfit ไม่ใช่ setting */
export function overlaySettings<S extends object>(server: S, pending: SettingsPatch): S {
  const { confirmProfit: _c, ...rest } = pending
  void _c
  return { ...server, ...rest }
}

export type FailureEffect = 'REVERT' | 'REFRESH' | 'LIST'
export type SaveFailure = { toast: string; effect: FailureEffect }

/** ข้อผิดพลาดของ autosave → ข้อความ + สิ่งที่ต้องทำ (ใช้ `message` ไทยจาก API ไม่ใช่ `error` ที่เป็นรหัส) */
export function classifyFailure(status: number, body: { error?: string; message?: string; details?: { rule?: string } } | null | undefined): SaveFailure {
  const message = body?.message
  if (status === 404) return { toast: message ?? 'ไม่พบกลุ่มนี้', effect: 'LIST' }
  if (status === 403 && body?.error === 'PACKAGE_REQUIRED') return { toast: message ?? SAVE_FALLBACK, effect: 'REFRESH' }
  if (status === 429) return { toast: RATE_LIMIT_MESSAGE, effect: 'REVERT' }
  if (status === 400 && body?.error === 'INVALID_SETTINGS') {
    const rule = body.details?.rule as InvalidSettingsRule | undefined
    return { toast: (rule && INVALID_SETTINGS_RULE_MESSAGE[rule]) || message || SAVE_FALLBACK, effect: 'REVERT' }
  }
  if (status === 400 && body?.error === 'PROFIT_CONFIRM_REQUIRED') return { toast: message ?? SAVE_FALLBACK, effect: 'REVERT' }
  return { toast: SAVE_FALLBACK, effect: 'REVERT' }
}

export type SaveStatus = 'idle' | 'saving' | 'saved'
export const SAVE_STATUS_TEXT: Record<SaveStatus, string> = { idle: 'บันทึกอัตโนมัติ', saving: 'กำลังบันทึก…', saved: 'บันทึกแล้ว' }

/** กำลังบันทึก = มี patch รอส่ง ∨ คำขอค้าง · ไม่งั้นดูว่าเพิ่งบันทึกเสร็จ (2 วิ) หรือไม่ */
export function saveStatusOf(s: { dirty: boolean; inflight: boolean; justSaved: boolean }): SaveStatus {
  if (s.dirty || s.inflight) return 'saving'
  return s.justSaved ? 'saved' : 'idle'
}
