/**
 * shop-permissions — ตัวตัดสินสิทธิ์กลางของสมาชิกร้าน (feature 00071 · BRD §8.3 = SSOT)
 *
 * ไฟล์บริสุทธิ์: ห้าม import prisma/service เพื่อให้เทสทุกคู่ (บทบาท × capability) ได้โดยไม่ต้องมี DB
 * และให้ client component import ได้
 *
 * ทำไม `rolesFromMembership`: วันนี้ `ShopMember.role` มีแค่ OWNER/ADMIN (P1 ยังไม่มีคอลัมน์ roles)
 * ฟังก์ชันนี้คือ "จุดสลับเดียว" — P2 จะเปลี่ยนให้อ่านคอลัมน์ roles จริง ผู้เรียกทุกรายไม่ต้องแก้
 *
 * เซลล์แบบมีเงื่อนไขใน BRD (O3 ของ BILLING = เฉพาะบริการที่ยังไม่ชำระ · P1 ของ BILLING = เฉพาะบริการ)
 * ระดับ module นี้คืน `true` (D-6) — เงื่อนไขต่อใบ/ต่อประเภทบังคับที่ caller ใน P3
 * T4 (เจ้าของหลักเท่านั้น) ระดับ module = OWNER; การแยก "เจ้าของหลัก" จาก "เจ้าของร่วม" ทำที่ caller
 */

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
  S2: [O],
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
  T1: [O, M],
  T2: [O],
  T3: [O],
  T4: [O],
} as const satisfies Record<string, readonly ShopRole[]>

export type Capability = keyof typeof TABLE

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

/** OWNER → เจ้าของ · ADMIN → ผู้ดูแล (BR-RP-06) — จุดสลับเดียวที่ P2 จะแทนด้วยคอลัมน์ roles */
export function rolesFromMembership(role: 'OWNER' | 'ADMIN'): ShopRole[] {
  if (role === 'OWNER') return ['OWNER']
  if (role === 'ADMIN') return ['MANAGER']
  // ค่าอื่นที่หลุดมาจากฐาน (คอลัมน์เป็น String) = ไม่มีสิทธิ์อะไรเลย — ห้ามโยนเป็น MANAGER
  // ซึ่งเป็นบทบาทที่สิทธิ์สูงสุดรองจากเจ้าของ (fail-closed, security review T1)
  return []
}
