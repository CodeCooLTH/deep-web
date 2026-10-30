/**
 * order-form-assignee — ช่อง "ผู้รับผิดชอบ" ในฟอร์มสร้างงานร้านบริการ (00086 P3-T8)
 *
 * mutation ที่ต้องแดง (ทำแล้วตอนเขียน):
 *  - showsAssigneePicker: ถอด `serviceLayout &&` → [blocker] ร้านอื่น/หน้าแก้ไขแดง
 *  - showsAssigneePicker: ถอด `staff.length > 0` → รายชื่อว่างแดง
 *  - assigneePayload: คืนคีย์เสมอ → [blocker] ร้านอื่นแดง
 *  - resetsAssigneeAfterError: คืน true ทุกรหัส → error อื่นแดง
 */
import { describe, it, expect } from 'vitest'
import {
  ASSIGNEE_NOT_TECHNICIAN,
  assigneePayload,
  loadsServiceStaff,
  parseServiceStaff,
  resetsAssigneeAfterError,
  showsAssigneePicker,
} from '../order-form-assignee'
import { usesServiceCreateLayout } from '../order-form-arrival'
import { SERVICE_JOB_ERROR_MESSAGE } from '../service-job'

const STAFF = [{ userId: 'u1', displayName: 'นิด' }]

describe('loadsServiceStaff', () => {
  it('โหลดเฉพาะฟอร์มร้านบริการตอนสร้าง', () => {
    expect(loadsServiceStaff(usesServiceCreateLayout('SERVICE_QUEUE', undefined))).toBe(true)
  })
  it.each([
    ['ONLINE_SALES', undefined],
    ['LODGING', undefined],
    ['SERVICE_QUEUE', 'tok-1'],
  ] as const)('[blocker] %s (edit=%s) ไม่ยิง', (v, tok) => {
    expect(loadsServiceStaff(usesServiceCreateLayout(v, tok))).toBe(false)
  })
})

describe('showsAssigneePicker', () => {
  it('ร้านบริการตอนสร้าง + มีช่างอย่างน้อย 1 คน → แสดง', () => {
    expect(showsAssigneePicker(true, STAFF)).toBe(true)
  })
  it('กำลังโหลด/โหลดล้ม (null) → ซ่อน', () => {
    expect(showsAssigneePicker(true, null)).toBe(false)
  })
  it('รายชื่อว่าง (ร้านยังไม่มีช่าง) → ซ่อนทั้งส่วน', () => {
    expect(showsAssigneePicker(true, [])).toBe(false)
  })
  it('[blocker] ไม่ใช่ serviceLayout (ร้านอื่น/หน้าแก้ไข) → ซ่อนแม้มีรายชื่อ', () => {
    expect(showsAssigneePicker(false, STAFF)).toBe(false)
  })
})

describe('assigneePayload', () => {
  it('serviceLayout: ส่งคนที่เลือก', () => {
    expect(assigneePayload(true, 'u1')).toEqual({ assignedUserId: 'u1' })
  })
  it('serviceLayout + "ยังไม่ระบุ" (null/undefined) → null', () => {
    expect(assigneePayload(true, null)).toEqual({ assignedUserId: null })
    expect(assigneePayload(true, undefined)).toEqual({ assignedUserId: null })
  })
  it('[blocker] ไม่ใช่ serviceLayout → ไม่มีคีย์ใน body เลย (แม้ค่าค้างในฟอร์ม)', () => {
    expect(assigneePayload(false, 'u1')).toEqual({})
    expect('assignedUserId' in assigneePayload(false, null)).toBe(false)
  })
})

describe('resetsAssigneeAfterError', () => {
  it('ASSIGNEE_NOT_TECHNICIAN → ล้างกลับเป็นยังไม่ระบุ', () => {
    expect(resetsAssigneeAfterError(ASSIGNEE_NOT_TECHNICIAN)).toBe(true)
  })
  it.each(['RESOURCE_NOT_FOUND', 'FORBIDDEN_ROLE', null, undefined])('%s → ไม่แตะค่าที่เลือก', (code) => {
    expect(resetsAssigneeAfterError(code)).toBe(false)
  })
  it('รหัสตรงกับที่ server ใช้ (มีข้อความไทยใน SERVICE_JOB_ERROR_MESSAGE)', () => {
    expect(SERVICE_JOB_ERROR_MESSAGE[ASSIGNEE_NOT_TECHNICIAN]).toBeTruthy()
  })
})

describe('parseServiceStaff', () => {
  it('รูปทรงถูก → รายชื่อ', () => {
    expect(parseServiceStaff({ staff: STAFF })).toEqual(STAFF)
  })
  it('แถวไม่ครบถูกทิ้ง', () => {
    expect(parseServiceStaff({ staff: [...STAFF, { userId: 'x' }, null, { displayName: 'y' }] })).toEqual(STAFF)
  })
  it('body เพี้ยน → null (ซ่อนส่วน)', () => {
    expect(parseServiceStaff(null)).toBeNull()
    expect(parseServiceStaff({ error: 'X' })).toBeNull()
    expect(parseServiceStaff({ staff: 'nope' })).toBeNull()
  })
})
