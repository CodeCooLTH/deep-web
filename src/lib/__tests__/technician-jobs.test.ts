/**
 * technician-jobs + serviceProgressBadge (00086 P3 · T9 · BRD FR-008)
 *
 * mutation ที่ต้องแดง:
 *  · `myJobsSections` คืน carryOver ทั้งตัวกรอง "ทั้งร้าน" ⇒ เทส "ทั้งร้านไม่มีกลุ่มค้าง" แดง
 *  · ตัวกรอง "งานของฉัน" ตัด `isUnassignedJob` ⇒ เทส "ของฉัน ∪ ยังไม่มีคนรับ" แดง
 *  · `isMyJob` เทียบชื่อแทน userId ⇒ เทส "ชื่อซ้ำ" แดง
 *  · `technicianTodayGroups` ไม่ตัดงานปิดแล้ว ⇒ เทสหน้าแรกแดง
 *  · `serviceProgressBadge` ไม่เช็กปิดแล้ว ⇒ เทส "ปิดแล้ว = null" แดง
 */
import { describe, expect, it } from 'vitest'
import {
  assigneeAriaSuffix,
  isJobClosed,
  myJobsSections,
  technicianTodayGroups,
  type TechnicianJobLike,
} from '@/lib/technician-jobs'
import { SERVICE_STATUS_META, serviceProgressBadge } from '@/lib/service-status'

const ME = 'u-me'
type J = TechnicianJobLike & { id: string }
const job = (id: string, p: Partial<J> = {}): J => ({ id, appointmentStatus: 'SCHEDULED', assignee: null, serviceClosedAt: null, ...p })
const mine = (id: string, p: Partial<J> = {}) => job(id, { assignee: { userId: ME, displayName: 'สมศักดิ์' }, ...p })
const other = (id: string, p: Partial<J> = {}) => job(id, { assignee: { userId: 'u-other', displayName: 'วิชัย' }, ...p })
const ids = (xs: J[]) => xs.map((x) => x.id)

describe('isJobClosed', () => {
  it('ปิดงาน (serviceClosedAt) หรือผลนัดที่สุดแล้ว = ปิด · อื่น ๆ = ยังไม่ปิด', () => {
    expect(isJobClosed(job('a', { serviceClosedAt: '2026-10-29T03:00:00.000Z' }))).toBe(true)
    expect(isJobClosed(job('a', { appointmentStatus: 'COMPLETED' }))).toBe(true)
    expect(isJobClosed(job('a', { appointmentStatus: 'NO_SHOW' }))).toBe(true)
    expect(isJobClosed(job('a'))).toBe(false)
    expect(isJobClosed(job('a', { appointmentStatus: 'RESCHEDULE_REQUESTED' }))).toBe(false)
  })
})

describe('technicianTodayGroups — หน้าแรกช่าง', () => {
  const items = [mine('m1'), mine('m2', { appointmentStatus: 'COMPLETED' }), job('u1'), job('u2', { serviceClosedAt: '2026-10-29T03:00:00.000Z' }), other('o1')]
  it('[blocker] ของฉัน = assignee เป็นผู้ดู ∧ ยังไม่ปิด · ยังไม่มีคนรับ = ไม่มี assignee ∧ ยังไม่ปิด · งานคนอื่นไม่อยู่สักกอง', () => {
    const g = technicianTodayGroups(items, ME)
    expect(ids(g.mine)).toEqual(['m1'])
    expect(ids(g.unassigned)).toEqual(['u1'])
  })
  it('[blocker] เทียบ userId ไม่ใช่ชื่อ — ชื่อซ้ำกับผู้ดูแต่คนละคน ไม่ใช่ "ของฉัน"', () => {
    const g = technicianTodayGroups([job('x', { assignee: { userId: 'u-x', displayName: 'สมศักดิ์' } })], ME)
    expect(g.mine).toEqual([])
  })
  it('ไม่รู้ตัวผู้ดู (null) = ไม่มีงานไหนเป็นของฉัน', () => {
    expect(technicianTodayGroups(items, null).mine).toEqual([])
  })
  it('ไม่มีคีย์ assignee (แถวเก่า) = ยังไม่มีคนรับ', () => {
    expect(ids(technicianTodayGroups([{ id: 'k', appointmentStatus: 'SCHEDULED' }], ME).unassigned)).toEqual(['k'])
  })
})

describe('myJobsSections — หน้า "งานของฉัน"', () => {
  const today = [mine('m1'), job('u1'), other('o1'), mine('m-done', { serviceClosedAt: '2026-10-29T05:00:00.000Z' }), other('o-done', { appointmentStatus: 'COMPLETED' })]
  const carry = [mine('c1'), mine('c2')]

  it('[blocker] "งานของฉัน" = ของฉัน ∪ ยังไม่มีคนรับ (ไม่มีงานคนอื่น) · แยกปิดแล้ว', () => {
    const s = myJobsSections(today, carry, 'mine', ME)
    expect(ids(s.open)).toEqual(['m1', 'u1'])
    expect(ids(s.closed)).toEqual(['m-done'])
  })
  it('"ทั้งร้าน" = ทุกงานของวันนี้', () => {
    const s = myJobsSections(today, carry, 'all', ME)
    expect(ids(s.open)).toEqual(['m1', 'u1', 'o1'])
    expect(ids(s.closed)).toEqual(['m-done', 'o-done'])
  })
  it('[blocker] ค้างจากวันก่อน: แสดงเฉพาะตัวกรอง "งานของฉัน" · "ทั้งร้าน" ไม่มีกลุ่มนี้', () => {
    expect(ids(myJobsSections(today, carry, 'mine', ME).carryOver)).toEqual(['c1', 'c2'])
    expect(myJobsSections(today, carry, 'all', ME).carryOver).toEqual([])
  })
  it('ไม่มีงานค้าง = กลุ่มว่าง (ผู้เรียกไม่ render หัว)', () => {
    expect(myJobsSections(today, [], 'mine', ME).carryOver).toEqual([])
  })
  it('กันชั้นสอง: แถวค้างที่ไม่ใช่ของผู้ดูไม่โผล่ (endpoint ควรกรองมาแล้ว)', () => {
    expect(ids(myJobsSections(today, [other('cx'), mine('c1')], 'mine', ME).carryOver)).toEqual(['c1'])
  })
})

describe('assigneeAriaSuffix', () => {
  it('ชื่อ / ยังไม่มีคนรับ', () => {
    expect(assigneeAriaSuffix({ userId: 'a', displayName: 'วิชัย' })).toBe(' ผู้รับผิดชอบ วิชัย')
    expect(assigneeAriaSuffix(null)).toBe(' ยังไม่มีคนรับ')
    expect(assigneeAriaSuffix(undefined)).toBe(' ยังไม่มีคนรับ')
  })
})

describe('serviceProgressBadge — ป้ายระหว่างทำงานของแถวนัดรายวัน', () => {
  const T = '2026-10-29T03:00:00.000Z'
  it('ยังไม่เริ่ม = null (ผู้เรียกใช้ป้ายนัดเดิม)', () => {
    expect(serviceProgressBadge({ appointmentStatus: 'SCHEDULED' })).toBeNull()
    expect(serviceProgressBadge({ appointmentStatus: 'SCHEDULED', serviceStartedAt: null })).toBeNull()
  })
  it('[blocker] เริ่มแล้ว = กำลังให้บริการ · ทำเสร็จ = ทำเสร็จ · รอปิดงาน (คำ/สีเดียวกับ SERVICE_STATUS_META)', () => {
    expect(serviceProgressBadge({ appointmentStatus: 'SCHEDULED', serviceStartedAt: T })).toMatchObject({
      key: 'IN_SERVICE', label: SERVICE_STATUS_META.IN_SERVICE.seller, cls: SERVICE_STATUS_META.IN_SERVICE.cls,
    })
    expect(serviceProgressBadge({ appointmentStatus: 'CONFIRMED_BY_BUYER', serviceStartedAt: T, serviceFinishedAt: T })).toMatchObject({
      key: 'FINISHED_AWAITING_CLOSE', label: SERVICE_STATUS_META.FINISHED_AWAITING_CLOSE.seller,
    })
  })
  it('[blocker] ปิดแล้ว/ไม่มาตามนัด = null (ป้ายนัดเดิมคือข้อเท็จจริงสุดท้าย)', () => {
    expect(serviceProgressBadge({ appointmentStatus: 'COMPLETED', serviceStartedAt: T, serviceFinishedAt: T, serviceClosedAt: T })).toBeNull()
    expect(serviceProgressBadge({ appointmentStatus: 'SCHEDULED', serviceStartedAt: T, serviceClosedAt: T })).toBeNull()
    expect(serviceProgressBadge({ appointmentStatus: 'NO_SHOW', serviceStartedAt: T })).toBeNull()
  })
})
