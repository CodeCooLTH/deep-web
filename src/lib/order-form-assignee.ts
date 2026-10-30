/**
 * order-form-assignee — ช่อง "ผู้รับผิดชอบ" ในฟอร์มสร้างงานของร้านบริการ (feature 00086 P3-T8 · S-6)
 *
 * 🛑 ทุก boolean ที่ตัดสินว่าฟอร์ม "โหลด/แสดง/ส่ง" ผู้รับผิดชอบหรือไม่ อยู่ที่นี่ ไม่ใช่ในเทอร์นารีกลาง JSX
 * (docs/conventions/ui-boolean-needs-a-testable-home.md) — ถ้าเขียนกลับด้าน ร้านที่ไม่ใช่บริการหรือหน้าแก้ไข
 * จะได้ช่องนี้ (หรือ body มีคีย์ใหม่) ซึ่ง tsc/build จับไม่ได้
 *
 * ตัวกั้นหลักคือ `serviceLayout` ของ P2 (usesServiceCreateLayout: SERVICE_QUEUE ∧ ไม่ใช่หน้าแก้ไข) ตัวเดียว
 * ไม่ตั้งเงื่อนไขร้านบริการใหม่ซ้ำที่นี่
 */

import type { StaffLoad } from './assignee-load'

/** แถวจาก GET /api/shops/current/service-staff — ชื่อคนเปล่า ๆ (ไม่เติม "ช่าง" นำหน้า · OOS-3) */
export interface ServiceStaffOption {
  userId: string
  displayName: string
  /** มีเมื่อขอพร้อมช่วงเวลา (?from=&to=) — ป้าย "ว่าง/ติดงาน" ในชีตเลือก (assignee-load) */
  load?: StaffLoad
}

/** ฟอร์มนี้ต้องโหลดรายชื่อช่างไหม — ไม่ใช่ฟอร์มร้านบริการตอนสร้าง = ไม่ยิงเลย */
export function loadsServiceStaff(serviceLayout: boolean): boolean {
  return serviceLayout
}

/**
 * แสดงส่วน "ผู้รับผิดชอบ" ไหม
 * staff = null คือกำลังโหลดหรือโหลดล้ม · รายชื่อว่าง = ซ่อนทั้งส่วน (ช่องไม่บังคับ มอบทีหลังได้จากหน้างาน)
 */
export function showsAssigneePicker(serviceLayout: boolean, staff: readonly ServiceStaffOption[] | null): boolean {
  return serviceLayout && staff !== null && staff.length > 0
}

/**
 * คีย์ `assignedUserId` ใน body ของ POST /api/orders
 * เฉพาะฟอร์มร้านบริการตอนสร้าง — ร้านอื่น/หน้าแก้ไข body ไม่มีคีย์นี้เลย (พฤติกรรมเดิมทุกตัวอักษร)
 * "ยังไม่ระบุ" = null (server รับ null = ไม่มีผู้รับผิดชอบ)
 */
export function assigneePayload(
  serviceLayout: boolean,
  value: string | null | undefined,
): { assignedUserId: string | null } | Record<string, never> {
  return serviceLayout ? { assignedUserId: value ?? null } : {}
}

/** รหัสจาก server เมื่อคนที่เลือกไม่ได้อยู่ฝ่ายช่างแล้ว (ถอดบทบาทระหว่างกรอก) */
export const ASSIGNEE_NOT_TECHNICIAN = 'ASSIGNEE_NOT_TECHNICIAN'

/**
 * ส่งล้มแล้วต้องล้างค่าที่เลือกกลับเป็น "ยังไม่ระบุ" + โหลดรายชื่อใหม่ไหม
 * เฉพาะรหัสนี้ — error อื่นค่าที่เลือกยังถูกต้อง ห้ามล้างทิ้ง
 */
export function resetsAssigneeAfterError(code: string | null | undefined): boolean {
  return code === ASSIGNEE_NOT_TECHNICIAN
}

/** อ่าน body ของ service-staff แบบไม่เชื่อรูปทรง — แถวที่ไม่ครบถูกทิ้ง · body เพี้ยนทั้งก้อน = null (ซ่อนส่วน)
 *  `load` รูปทรงผิด = ตัดทิ้งเฉพาะ load (แถวยังอยู่ — ชื่อยังเลือกได้) */
export function parseServiceStaff(body: unknown): ServiceStaffOption[] | null {
  const staff = (body as { staff?: unknown } | null)?.staff
  if (!Array.isArray(staff)) return null
  return staff
    .filter(
      (s): s is ServiceStaffOption =>
        !!s &&
        typeof (s as ServiceStaffOption).userId === 'string' &&
        typeof (s as ServiceStaffOption).displayName === 'string',
    )
    .map((s) => {
      const row: ServiceStaffOption = { userId: s.userId, displayName: s.displayName }
      if (isStaffLoad(s.load)) row.load = s.load
      return row
    })
}

function isStaffLoad(v: unknown): v is StaffLoad {
  const l = v as StaffLoad | null | undefined
  if (!l || typeof l.dayJobs !== 'number') return false
  return l.clash === null || (!!l.clash && typeof l.clash.start === 'string' && typeof l.clash.end === 'string')
}
