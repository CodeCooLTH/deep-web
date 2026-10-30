/**
 * shop-permissions — ตัวตัดสินสิทธิ์กลางของสมาชิกร้าน (feature 00071 · BRD §8.3 = SSOT)
 *
 * ไฟล์บริสุทธิ์: ห้าม import prisma/service เพื่อให้เทสทุกคู่ (บทบาท × capability) ได้โดยไม่ต้องมี DB
 * และให้ client component import ได้
 *
 * ทำไม `rolesFromMembership`: จุดแปลง `ShopMember.role` + คอลัมน์ `roles` (P2) เป็นชุดบทบาท — จุดเดียวทั้งระบบ
 *
 * เซลล์แบบมีเงื่อนไขใน BRD (O3 ของ BILLING = เฉพาะบริการที่ยังไม่ชำระ · P1 ของ BILLING = เฉพาะบริการ)
 * ระดับ module นี้คืน `true` (D-6) — เงื่อนไขต่อใบ/ต่อประเภทบังคับที่ caller ใน P3
 * T4 (เจ้าของหลักเท่านั้น) ระดับ module = OWNER; การแยก "เจ้าของหลัก" จาก "เจ้าของร่วม" ทำที่ caller
 */
import { canUseAppointments } from '@/lib/appointments'

export type ShopRole = 'OWNER' | 'MANAGER' | 'CHAT' | 'BILLING' | 'TECHNICIAN'
export type MoneyLevel = 'FULL' | 'PER_ORDER' | 'NONE'

const O: ShopRole = 'OWNER'
const M: ShopRole = 'MANAGER'
const C: ShopRole = 'CHAT'
const B: ShopRole = 'BILLING'
const T: ShopRole = 'TECHNICIAN'

const TABLE = {
  H1: [O, M, C],
  H2: [O, M, C],
  H3: [O, M],
  O1: [O, M, C, B, T],
  O2: [O, M, C],
  O2s: [O, M, C, B],
  O3: [O, M, C, B], // BILLING: เฉพาะบริการที่ยังไม่ชำระ (D-6)
  O4: [O, M, C, T],
  O5: [O, M, C, B],
  O6: [O, M],
  O7: [O, M, C, B],
  D1: [O, M, C, B],
  S1: [O, M, C],
  S2: [O, M], // มติ C-2 (2026-10-10): คงสิทธิ์ผู้ดูแลที่เปิดไว้ 2026-07-29
  P1: [O, M, C, B], // BILLING: เฉพาะบริการ (D-6)
  P2: [O, M],
  P3: [O],
  Q1: [O, M, C, B, T],
  Q2: [O, M],
  C1: [O, M, C, B],
  C2: [O, M, C, B],
  C3: [O, M],
  F1: [O],
  F2: [O],
  F3: [O],
  F4: [O, M], // มติ C-5: ใช้เครดิตกระเป๋าซื้อฟีเจอร์ร้าน — ไม่เห็นยอด
  T1: [O, M],
  T2: [O],
  T3: [O],
  T4: [O], // เจ้าของหลักเท่านั้น — ดู PRIMARY_OWNER_ONLY
  // X1-X5: ฟีเจอร์ที่ตารางเดิมไม่มีแถว (มติ C-1) — ใส่ไว้กันผู้ดูแลเสียงานจาก BR-RP-11
  X1: [O, M], // ประมูลผู้ขาย
  X2: [O, M, C], // เครื่องมือแชทเสริม — อ่านตาม H1 เขียนตาม H2 (บทบาทชุดเดียวกัน)
  X3: [O, M], // สร้างออเดอร์อัตโนมัติ (ตั้งค่า)
  X4: [O, M, C], // ผลงานตัวเองในรายงานแอดมิน (SELF)
  X5: [O, M], // โปรไฟล์ใบเสร็จของร้าน
  X6: [O, M], // ดูแผนตรวจสอบร้าน (อ่านอย่างเดียว) — มติ C-13: คืนสิทธิ์ดูของผู้ดูแลเดิม · การกระทำทั้งหมดยังเป็น T4
  X8: [O, M], // 00078 ตั้งค่าแจ้งลูกค้าอัตโนมัติ (เขียน) — อ่านใช้ H1 · CHAT แก้ไม่ได้เพราะข้อความนี้ส่งในนามร้านถึงลูกค้าทุกคน
  X7: [O], // 00077 โต๊ะแชท 3D — เห็นภาพรวมการตอบของแอดมินทุกคน จึงเปิดเจ้าของเท่านั้น (SDS TD-02)
} as const satisfies Record<string, readonly ShopRole[]>

export type Capability = keyof typeof TABLE

/** capability ที่ต้องเป็นเจ้าของหลัก (`Shop.userId`) — เจ้าของร่วมไม่ผ่าน · ตัดสินที่ shop-capability.ts (ไฟล์นี้ไม่รู้จักแถวร้าน) */
export const PRIMARY_OWNER_ONLY: ReadonlySet<Capability> = new Set<Capability>(['T4'])

export const CAPABILITY_ROLES: Record<Capability, ReadonlySet<ShopRole>> = Object.fromEntries(
  Object.entries(TABLE).map(([k, v]) => [k, new Set<ShopRole>(v)]),
) as unknown as Record<Capability, ReadonlySet<ShopRole>>

/** สิทธิ์ = union ของทุกบทบาท · capability ที่ไม่รู้จัก = เจ้าของเท่านั้น (BR-RP-11, fail-closed) */
export function can(roles: readonly ShopRole[], cap: Capability | (string & {})): boolean {
  const allowed = (CAPABILITY_ROLES as Record<string, ReadonlySet<ShopRole>>)[cap]
  if (!allowed) return roles.includes('OWNER')
  return roles.some((r) => allowed.has(r))
}

const LEVEL_OF: Record<ShopRole, MoneyLevel> = {
  OWNER: 'FULL',
  MANAGER: 'PER_ORDER',
  CHAT: 'PER_ORDER',
  BILLING: 'PER_ORDER',
  TECHNICIAN: 'NONE',
}
const RANK: Record<MoneyLevel, number> = { NONE: 0, PER_ORDER: 1, FULL: 2 }

/** ระดับเงิน = สูงสุดของทุกบทบาท (BR-RP-03) · ชุดว่าง = NONE */
export function moneyLevel(roles: readonly ShopRole[]): MoneyLevel {
  let best: MoneyLevel = 'NONE'
  for (const r of roles) if (RANK[LEVEL_OF[r]] > RANK[best]) best = LEVEL_OF[r]
  return best
}

/** บทบาทที่มอบให้ ADMIN ได้ (BR-RP) — OWNER ไม่อยู่ในชุดนี้: เจ้าของมาจาก ShopMember.role เท่านั้น */
export const STAFF_ROLES = ['MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN'] as const

/**
 * OWNER → เจ้าของ (ไม่สน roles) · ADMIN → roles ∩ STAFF_ROLES ตัดซ้ำ (BR-RP-06)
 * ไม่มีค่าตั้งต้นโดยตั้งใจ (permission-gate-follows-the-row): ADMIN ที่ roles ว่าง/แปลก = [] ไม่ใช่ MANAGER
 * ค่าอื่นที่หลุดมาจากฐาน (คอลัมน์เป็น String) = [] เช่นกัน (fail-closed)
 */
export function rolesFromMembership(role: 'OWNER' | 'ADMIN', roles: readonly string[]): ShopRole[] {
  if (role === 'OWNER') return ['OWNER']
  if (role === 'ADMIN') return STAFF_ROLES.filter((r) => roles.includes(r))
  return []
}

/**
 * ชุดบทบาทที่ "มีผลจริง" ของสมาชิกในร้านนี้ — กฎ PERSONAL/BILLING อยู่ที่นี่ที่เดียว (บริสุทธิ์ · เมนู/ด่านหน้าใช้ร่วมกัน)
 *  - ร้าน PERSONAL = เจ้าของเสมอ (BR-RP-05)
 *  - BILLING ถูกตัดทิ้งเมื่อร้านขายบริการไม่ได้ (BR-RP-07)
 * ย้ายมาจาก shop-capability.ts (ไฟล์นั้น server-only เมนูฝั่ง client import ไม่ได้) — shop-capability ยัง re-export ชื่อเดิม
 */
export function effectiveRoles(
  shop: { kind: string; vertical: string; userId?: string },
  role: string,
  roles: readonly string[],
): ShopRole[] {
  if (shop.kind === 'PERSONAL') return ['OWNER']
  if (role !== 'OWNER' && role !== 'ADMIN') return []
  const rs = rolesFromMembership(role, roles)
  return canUseAppointments(shop) ? rs : rs.filter((r) => r !== 'BILLING')
}

// ─── 00086 Service Staff Workflow — สิทธิ์เพิ่มรายคน (S-4 · S-5 · S-15) ───────────────────────────
//
// ธงสองตัวบน ShopMember (`canCloseJob` · `canRecordExpense`) ใช้กับ "ร้านบริการ" เท่านั้น
// ตัวตัดสินประเภทร้าน = canUseAppointments (ไม่ใช่ usesServiceFinanceRules): เป็นตัวเดียวกับที่ effectiveRoles
// ใช้ตัด BILLING อยู่แล้ว = โดเมน "สิทธิ์สมาชิกตามประเภทร้าน" · usesServiceFinanceRules เป็นโดเมนตัวเลขเงิน
// และต้อง import lodging เพิ่ม — ผลลัพธ์เท่ากัน (=== 'SERVICE_QUEUE') แต่ไม่ควรผูกสิทธิ์กับกติกาเงิน
//
// 🛑 ธงที่ไม่ได้ส่งมา (undefined) = false เสมอ (permission-gate-follows-the-row: ห้ามค่าตั้งต้นที่เปิด)
// 🛑 ธงเป็นภาพนิ่ง (stored-flag-vs-owner-truth): ร้านเปลี่ยนจากบริการเป็นประเภทอื่น ธงที่ค้างอยู่ต้องไม่มีผล
//    ⇒ เช็ค vertical ปัจจุบันก่อนอ่านธงทุกครั้ง

export type StaffFlags = { canCloseJob?: boolean; canRecordExpense?: boolean }

/**
 * ปิดงาน (ทำเสร็จ / ส่งมอบ) ได้ไหม — `roles` ต้องเป็นชุดที่ผ่าน effectiveRoles แล้ว
 * (กฎ PERSONAL = เจ้าของเสมอ อยู่ที่ effectiveRoles ที่เดียว — ฟังก์ชันนี้ไม่เขียนซ้ำ)
 *  - ร้านที่ไม่ใช่บริการ: = can(roles,'O4') เป๊ะ (พฤติกรรมเดิมทุกอย่าง · ธงไม่มีผล)
 *  - ร้านบริการ: OWNER ∨ MANAGER ∨ (ธง canCloseJob === true ∧ ถือ CHAT หรือ TECHNICIAN)
 * ชื่อไม่ใช่ canCloseServiceJob — ชื่อนั้นมีแล้วใน service-status.ts (กฎสถานะงาน ไม่ใช่สิทธิ์คน)
 */
export function memberCanCloseJob(
  shop: { vertical: string; kind?: string },
  roles: readonly ShopRole[],
  flags?: StaffFlags,
): boolean {
  if (!canUseAppointments({ kind: shop.kind ?? '', vertical: shop.vertical })) return can(roles, 'O4')
  if (roles.includes('OWNER') || roles.includes('MANAGER')) return true
  return flags?.canCloseJob === true && (roles.includes('CHAT') || roles.includes('TECHNICIAN'))
}

/**
 * พนักงาน (ไม่ใช่เจ้าของ) บันทึกค่าใช้จ่ายของตัวเองได้ไหม — ร้านบริการ ∧ role ADMIN ∧ ธง canRecordExpense
 * เจ้าของไม่ผ่านทางนี้โดยตั้งใจ: เจ้าของใช้เส้นทาง F1/F2 เดิม (เห็น/แก้ค่าใช้จ่ายทั้งร้าน)
 */
export function memberCanRecordStaffExpense(
  shop: { vertical: string; kind?: string },
  role: string,
  flags?: StaffFlags,
): boolean {
  if (!canUseAppointments({ kind: shop.kind ?? '', vertical: shop.vertical })) return false
  return role === 'ADMIN' && flags?.canRecordExpense === true
}

export type CloseJobFlagState = 'LOCKED_ON' | 'DISABLED' | 'EDITABLE'

/**
 * สถานะช่องติ๊ก "ปิดงานได้" ในฟอร์มสมาชิก
 *  - LOCKED_ON: มี MANAGER = ปิดงานได้อยู่แล้วโดยบทบาท (ติ๊กค้าง แก้ไม่ได้)
 *  - DISABLED: ไม่มี CHAT/TECHNICIAN/MANAGER = ไม่มีงานให้ปิด (BILLING ล้วน / ชุดว่าง)
 *  - EDITABLE: มี CHAT หรือ TECHNICIAN (ไม่มี MANAGER)
 */
export function closeJobFlagState(roles: readonly string[]): CloseJobFlagState {
  if (roles.includes('MANAGER')) return 'LOCKED_ON'
  if (roles.includes('CHAT') || roles.includes('TECHNICIAN')) return 'EDITABLE'
  return 'DISABLED'
}

// ─── 00086 P3 — ผู้รับผิดชอบงาน · ช่างล้วน (S-6 · S-8 · S-9 · BRD §8.1/§8.2) ───────────────────────────

/**
 * "ช่างล้วน" = ถือ TECHNICIAN อย่างเดียว (ชุดว่าง = ไม่ใช่) — นิยามเดียวทั้งระบบ
 * (แถบล่าง role-nav · หน้าแรก dashboard-money · ด่านเริ่ม/ทำเสร็จ/ปิดงาน ใช้ตัวนี้)
 * CHAT+TECHNICIAN ไม่ใช่ช่างล้วน: ทำงานแทนคนอื่นได้แบบตอบแชท (BRD §8.2 "ช่างล้วนเฉพาะงานของตัวเอง")
 * `roles` ต้องผ่าน effectiveRoles แล้ว · เป็นนิยามบทบาทล้วน (ไม่ดู vertical) — ผู้เรียกกั้นร้านบริการเอง
 */
export function isTechnicianOnly(roles: readonly ShopRole[]): boolean {
  return roles.length > 0 && roles.every((r) => r === 'TECHNICIAN')
}

export type ServiceJobActorBlock = 'UNASSIGNED' | 'NOT_ASSIGNEE'

/**
 * ด่าน "งานของตัวเอง" ของการเริ่ม/ทำเสร็จ/ปิดงาน (ร้านบริการ)
 *  - ไม่ใช่ช่างล้วน → null เสมอ (เจ้าของ/ผู้จัดการ/ตอบแชท ทำแทนได้ทุกใบ)
 *  - ช่างล้วน ∧ ยังไม่มีคนรับ → 'UNASSIGNED' (ต้องกด "รับงานนี้" ก่อน)
 *  - ช่างล้วน ∧ งานของคนอื่น → 'NOT_ASSIGNEE'
 * ไม่ได้ตัดสินสิทธิ์ O4/ปิดงาน — ผู้เรียกตรวจ can()/memberCanCloseJob แยก (ฟังก์ชันนี้ตอบแค่ "ของใคร")
 */
export function serviceJobActorBlock(
  roles: readonly ShopRole[],
  job: { assignedUserId: string | null },
  userId: string,
): ServiceJobActorBlock | null {
  if (!isTechnicianOnly(roles)) return null
  if (job.assignedUserId == null) return 'UNASSIGNED'
  return job.assignedUserId === userId ? null : 'NOT_ASSIGNEE'
}

/** มอบ/เปลี่ยน/ยกเลิกผู้รับผิดชอบได้ไหม — คนที่แก้งานได้ (O2s · SDS TD-009: เจ้าของ ผู้จัดการ ตอบแชท เปิดบิล) */
export function canAssignServiceJob(roles: readonly ShopRole[]): boolean {
  return can(roles, 'O2s')
}

/**
 * กด "รับงานนี้" (ตั้งตัวเองเป็นผู้รับผิดชอบ) ได้ไหม — ต้องทำงานได้ (O4) และถือ TECHNICIAN (API §4.8)
 * เจ้าของ/ตอบแชทที่ไม่ใช่ช่างไม่รับงานเอง (ใช้ "มอบงาน" แทน) · CHAT+TECHNICIAN รับได้
 */
export function canClaimServiceJob(roles: readonly ShopRole[]): boolean {
  return can(roles, 'O4') && roles.includes('TECHNICIAN')
}
