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
