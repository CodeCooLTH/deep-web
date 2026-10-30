/**
 * service-job-photo-settings — การ์ดตั้งค่ารูปก่อน-หลัง (00086 P3-T10 · FR-013)
 *
 * mutation ที่ต้องแดง (ทำแล้วตอนเขียน):
 *  - photoVisibilitySwitch: ถอด `!none &&` → [blocker] NONE สวิตช์เปิดค้างแดง
 *  - photoVisibilitySwitch: disabled = false เสมอ → [blocker] แดง
 *  - settingsAfterModeChange: ไม่บังคับ false เมื่อ NONE → [blocker] แดง
 *  - settingsAfterModeChange: กลับจาก NONE เปิดสวิตช์คืน → แดง
 *  - initialServiceJobPhotoSettings: ค่าเริ่มไม่ใช่ OPTIONAL/false → แดง
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SERVICE_JOB_PHOTO_SETTINGS,
  PHOTO_VISIBILITY_HINT,
  PHOTO_VISIBILITY_OFF_BY_NONE_HINT,
  PHOTO_VISIBILITY_SENDS_MESSAGE_HINT,
  SERVICE_JOB_PHOTO_MODE_COPY,
  initialServiceJobPhotoSettings,
  modeChangedToast,
  photoVisibilityHints,
  photoVisibilitySwitch,
  settingsAfterModeChange,
  visibilityChangedToast,
} from '../service-job-photo-settings'
import { SERVICE_JOB_PHOTO_MODES } from '../service-job'

describe('initialServiceJobPhotoSettings', () => {
  it('ค่าเริ่มของร้าน = ไม่บังคับ + ลูกค้าไม่เห็น (FR-013)', () => {
    expect(DEFAULT_SERVICE_JOB_PHOTO_SETTINGS).toEqual({ mode: 'OPTIONAL', buyerVisible: false })
    expect(initialServiceJobPhotoSettings('OPTIONAL', false)).toEqual({ mode: 'OPTIONAL', buyerVisible: false })
  })
  it('โหมดแปลก/ว่าง → OPTIONAL', () => {
    expect(initialServiceJobPhotoSettings('WHATEVER', true)).toEqual({ mode: 'OPTIONAL', buyerVisible: true })
    expect(initialServiceJobPhotoSettings(undefined, undefined)).toEqual({ mode: 'OPTIONAL', buyerVisible: false })
  })
  it('[blocker] NONE + true (ข้อมูลเพี้ยน) → ลูกค้าไม่เห็น', () => {
    expect(initialServiceJobPhotoSettings('NONE', true)).toEqual({ mode: 'NONE', buyerVisible: false })
  })
  it('REQUIRED + true คงค่า', () => {
    expect(initialServiceJobPhotoSettings('REQUIRED', true)).toEqual({ mode: 'REQUIRED', buyerVisible: true })
  })
})

describe('photoVisibilitySwitch', () => {
  it('[blocker] NONE → ปิด + กดไม่ได้ (แม้ค่าเก่าเป็น true)', () => {
    expect(photoVisibilitySwitch({ mode: 'NONE', buyerVisible: true })).toEqual({ checked: false, disabled: true })
  })
  it.each(['REQUIRED', 'OPTIONAL'] as const)('%s → กดได้ ตามค่า', (mode) => {
    expect(photoVisibilitySwitch({ mode, buyerVisible: true })).toEqual({ checked: true, disabled: false })
    expect(photoVisibilitySwitch({ mode, buyerVisible: false })).toEqual({ checked: false, disabled: false })
  })
})

describe('settingsAfterModeChange', () => {
  it('[blocker] เลือก NONE ขณะสวิตช์เปิด → สวิตช์ปิดตาม', () => {
    expect(settingsAfterModeChange({ mode: 'OPTIONAL', buyerVisible: true }, 'NONE')).toEqual({ mode: 'NONE', buyerVisible: false })
  })
  it('กลับจาก NONE → ไม่เปิดสวิตช์คืนเอง', () => {
    expect(settingsAfterModeChange({ mode: 'NONE', buyerVisible: false }, 'REQUIRED')).toEqual({ mode: 'REQUIRED', buyerVisible: false })
  })
  it('สลับระหว่าง REQUIRED/OPTIONAL คงสวิตช์', () => {
    expect(settingsAfterModeChange({ mode: 'OPTIONAL', buyerVisible: true }, 'REQUIRED')).toEqual({ mode: 'REQUIRED', buyerVisible: true })
  })
})

describe('ข้อความ', () => {
  it('ทุกโหมดมีชื่อ+คำอธิบาย ตามลำดับ บังคับ → ไม่บังคับ → ไม่ใช้รูป', () => {
    expect(SERVICE_JOB_PHOTO_MODES.map((m) => SERVICE_JOB_PHOTO_MODE_COPY[m].title)).toEqual(['บังคับ', 'ไม่บังคับ', 'ไม่ใช้รูป'])
  })
  it('toast เปลี่ยนโหมด', () => {
    expect(modeChangedToast({ mode: 'OPTIONAL', buyerVisible: false }, 'REQUIRED')).toBe('ตั้งค่ารูปเป็น "บังคับ" แล้ว')
    expect(modeChangedToast({ mode: 'OPTIONAL', buyerVisible: false }, 'NONE')).toBe('ตั้งค่ารูปเป็น "ไม่ใช้รูป" แล้ว')
    expect(modeChangedToast({ mode: 'OPTIONAL', buyerVisible: true }, 'NONE')).toBe('ไม่ใช้รูปแล้ว · ปิดการแสดงรูปให้ลูกค้าด้วย')
  })
  it('toast สวิตช์', () => {
    // critique P1-8 — ไม่อ่านเป็น "ลูกค้าเปิดดูแล้ว"
    expect(visibilityChangedToast(true)).toBe('เปิดให้ลูกค้าเห็นรูปและบันทึกแล้ว')
    expect(visibilityChangedToast(false)).toBe('ซ่อนรูปและบันทึกจากลูกค้าแล้ว')
  })
  it('hint: NONE บอกเหตุผล · อื่นบอกผลข้างเคียงก่อนเปิด (Controller Q2)', () => {
    expect(photoVisibilityHints({ mode: 'NONE', buyerVisible: false })).toEqual([PHOTO_VISIBILITY_OFF_BY_NONE_HINT])
    expect(photoVisibilityHints({ mode: 'OPTIONAL', buyerVisible: false })).toEqual([PHOTO_VISIBILITY_HINT, PHOTO_VISIBILITY_SENDS_MESSAGE_HINT])
  })
  // critique P1-7 — SERVICE_FINISHED ถูกตัดเมื่อใบไม่ผูกแชท (NO_CONVERSATION) ⇒ hint ต้องบอกเงื่อนไขนี้ · ไม่อ้างสวิตช์ส่งอัตโนมัติที่ไม่มีจริง
  it('hint ข้อความถึงลูกค้าบอกเงื่อนไขจริง (เฉพาะงานที่มีแชท)', () => {
    expect(PHOTO_VISIBILITY_SENDS_MESSAGE_HINT).toBe('เมื่อช่างกด "ทำเสร็จแล้ว" ระบบส่งลิงก์ดูรูปให้ลูกค้าในแชท (เฉพาะงานที่มีแชทกับลูกค้า)')
    expect(PHOTO_VISIBILITY_SENDS_MESSAGE_HINT).not.toContain('ส่งอัตโนมัติ')
  })
})
