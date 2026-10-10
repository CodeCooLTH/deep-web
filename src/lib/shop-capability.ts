import 'server-only'
/**
 * shop-capability — ด่านสิทธิ์กลางของ route/หน้าของร้าน (00071 P3 · S-12)
 *
 * ชั้นนี้ "ต่อ" ตัวตัดสิน `can()` (shop-permissions.ts · บริสุทธิ์) เข้ากับแถวสมาชิกที่อ่านสดจากฐาน — ไม่เขียนกฎสมาชิกภาพใหม่:
 * requireShopCapability/gatePage ใช้ requireShopForRequest → resolveActiveShopContext ตัวเดิม (re-verify ทุกคำขอ ไม่เชื่อ JWT)
 *
 * กฎที่ต้องอยู่ "ในนี้ที่เดียว" (ถ้าปล่อยให้ caller ทำเอง จะลืมทีละจุด):
 *  - ร้าน PERSONAL = เจ้าของเสมอ (BR-RP-05)
 *  - T4 (PRIMARY_OWNER_ONLY) = `shop.userId === userId` — เจ้าของร่วมไม่ผ่าน
 *  - BILLING ถูกตัดทิ้งเมื่อร้านขายบริการไม่ได้ (BR-RP-07) ⇒ สมาชิก [BILLING] ในร้านทั่วไปได้ชุดว่าง = ไม่มีสิทธิ์อะไรเลย
 *  - ไม่มีค่าตั้งต้นที่เปิด: อ่านไม่ได้/ไม่ใช่สมาชิก/ชุดบทบาทแปลก = ปฏิเสธ (permission-gate-follows-the-row)
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canUseAppointments } from '@/lib/appointments'
import { forbiddenRoleResponse } from '@/lib/forbidden-role'
import { sessionUserId } from '@/lib/session-user'
import { requireShopForRequest, type ActiveShop } from '@/lib/shop-context'
import { can, PRIMARY_OWNER_ONLY, rolesFromMembership, type Capability, type ShopRole } from '@/lib/shop-permissions'

type SessionLike = { user?: { id?: string | null; activeShopId?: string | null } | null } | null

const NO_STORE = { 'cache-control': 'private, no-store' } as const

/** โยนจาก service เมื่อบทบาทไม่มีสิทธิ์ — message คง 'FORBIDDEN' ให้ mapper เดิมที่จับด้วยข้อความยังทำงาน */
export class ForbiddenRoleError extends Error {
  readonly code = 'FORBIDDEN_ROLE' as const
  constructor() {
    super('FORBIDDEN')
    this.name = 'ForbiddenRoleError'
  }
}

type ShopFacts = { kind: string; vertical: string; userId: string }

/** ชุดบทบาทที่ "มีผลจริง" ของสมาชิกในร้านนี้ — กฎ PERSONAL/BILLING อยู่ที่นี่ที่เดียว */
export function effectiveRoles(shop: ShopFacts, role: string, roles: readonly string[]): ShopRole[] {
  if (shop.kind === 'PERSONAL') return ['OWNER']
  if (role !== 'OWNER' && role !== 'ADMIN') return []
  const rs = rolesFromMembership(role, roles)
  return canUseAppointments(shop) ? rs : rs.filter((r) => r !== 'BILLING')
}

function allowed(cap: Capability, eff: readonly ShopRole[], shop: ShopFacts, userId: string): boolean {
  if (PRIMARY_OWNER_ONLY.has(cap) && shop.userId !== userId) return false
  return can(eff, cap)
}

export type ShopCapabilityResult =
  | { ok: true; shopId: string; userId: string; active: ActiveShop; roles: ShopRole[] }
  | { ok: false; response: NextResponse }

/**
 * ด่านของ API route — คืนร้านที่คำขอทำงานด้วย + บทบาทที่มีผลจริง
 * 401 ไม่รู้ตัวตน · 404 ไม่มีร้าน · 403 `FORBIDDEN` ไม่ใช่สมาชิกร้านที่ขอ · 403 `FORBIDDEN_ROLE` เป็นสมาชิกแต่ไม่มี capability
 * opts.shopId ระบุแล้ว = ห้ามถอยไปร้าน active (กติกาของ requireShopForRequest)
 */
export async function requireShopCapability(
  session: SessionLike,
  cap: Capability,
  opts?: { shopId?: string | null },
): Promise<ShopCapabilityResult> {
  const userId = sessionUserId(session)
  if (!userId) return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE }) }
  const resolved = await requireShopForRequest(session, opts?.shopId)
  if (!resolved.ok) {
    return resolved.reason === 'NO_SHOP'
      ? { ok: false, response: NextResponse.json({ error: 'NO_SHOP' }, { status: 404, headers: NO_STORE }) }
      : { ok: false, response: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers: NO_STORE }) }
  }
  const active = resolved.target
  const eff = effectiveRoles(active.shop, active.role, active.roles)
  if (!allowed(cap, eff, active.shop, userId)) return { ok: false, response: forbiddenRoleResponse() }
  return { ok: true, shopId: active.shop.id, userId, active, roles: eff }
}

/**
 * ด่านของหน้า RSC — ไม่มีสิทธิ์ให้หน้า render `NoPermissionCard` (ไม่ใช่ notFound/redirect เงียบ · BRD FR-RP-02)
 * ร้านที่ active resolve ไม่ได้ = ok:false reason NO_SHOP (หน้าเดิมมีทางจัดการ "ไม่มีร้าน" ของตัวเองอยู่แล้ว)
 */
export async function gatePage(
  session: SessionLike,
  cap: Capability,
): Promise<{ ok: true; active: ActiveShop; roles: ShopRole[] } | { ok: false; reason: 'NO_SHOP' | 'FORBIDDEN_ROLE' }> {
  const userId = sessionUserId(session)
  if (!userId) return { ok: false, reason: 'NO_SHOP' }
  const resolved = await requireShopForRequest(session)
  if (!resolved.ok) return { ok: false, reason: 'NO_SHOP' }
  const active = resolved.target
  const eff = effectiveRoles(active.shop, active.role, active.roles)
  if (!allowed(cap, eff, active.shop, userId)) return { ok: false, reason: 'FORBIDDEN_ROLE' }
  return { ok: true, active, roles: eff }
}

/**
 * ผู้ใช้นี้ทำ capability นี้ในร้าน "ที่ระบุ" ได้ไหม — 1 query (ร้าน + แถวสมาชิกของผู้ใช้)
 * ใช้แทน canAccessShop ใน service/route ที่รู้ shopId จากข้อมูล (เธรด/ออเดอร์) ไม่ใช่จาก session
 * กฎสมาชิกเดียวกับ resolveActiveShopContext: ร้านที่ลบแล้ว/ไม่ใช่สมาชิก = false (BUSINESS ต้องมีแถว ShopMember แม้เป็นเจ้าของ)
 */
export async function canAccessShopWith(shopId: string, userId: string, cap: Capability): Promise<boolean> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      userId: true, kind: true, vertical: true, deletedAt: true,
      members: { where: { userId }, select: { role: true, roles: true }, take: 1 },
    },
  })
  if (!shop || shop.deletedAt) return false
  return decideForRow(shop, userId, cap)
}

function decideForRow(
  shop: ShopFacts & { members: { role: string; roles: string[] }[] },
  userId: string,
  cap: Capability,
): boolean {
  if (shop.kind === 'PERSONAL') {
    return shop.userId === userId && allowed(cap, effectiveRoles(shop, 'OWNER', []), shop, userId)
  }
  const m = shop.members[0]
  if (!m) return false
  return allowed(cap, effectiveRoles(shop, m.role, m.roles), shop, userId)
}

/**
 * ทุกร้านที่ผู้ใช้ทำ capability นี้ได้ — cap บังคับ (ไม่มี overload "ทุกร้านที่เป็นสมาชิก": นั่นคือที่มาของช่องโหว่ BILLING/TECHNICIAN เห็นแชท)
 * กรอง deletedAt/purgedAt เหมือน listAccessibleShopIds เดิม · 1 query
 */
export async function listAccessibleShopIds(userId: string, cap: Capability): Promise<string[]> {
  const rows = await prisma.shop.findMany({
    where: {
      deletedAt: null, purgedAt: null,
      OR: [{ userId, kind: 'PERSONAL' }, { members: { some: { userId } } }],
    },
    select: {
      id: true, userId: true, kind: true, vertical: true,
      members: { where: { userId }, select: { role: true, roles: true }, take: 1 },
    },
  })
  return rows.filter((r) => decideForRow(r, userId, cap)).map((r) => r.id)
}
