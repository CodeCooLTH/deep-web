import { beforeEach, describe, expect, it, vi } from 'vitest'

// mock เฉพาะชั้นฐานข้อมูล — requireShopForRequest/resolveActiveShopContext ตัวจริงต้องทำงาน
// เพื่อพิสูจน์ว่า helper ต่อเข้ากับกฎสมาชิกเดิม ไม่ได้เขียนกฎสมาชิกชุดที่สอง
const db = vi.hoisted(() => ({
  shop: null as null | Record<string, unknown>,
  member: null as null | { role: string; roles: string[] },
  many: [] as Record<string, unknown>[],
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    shop: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        db.shop && db.shop.id === where.id ? { ...db.shop, members: db.member ? [db.member] : [] } : null),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => db.many),
    },
    shopMember: { findUnique: vi.fn(async () => db.member) },
  },
}))

import { canAccessShopWith, effectiveRoles, ForbiddenRoleError, gatePage, listAccessibleShopIds, requireShopCapability } from '@/lib/shop-capability'
import type { Capability } from '@/lib/shop-permissions'

const SESSION = { user: { id: 'u1', activeShopId: 's1' } }

type Setup = { kind?: 'PERSONAL' | 'BUSINESS'; vertical?: string; shopUserId?: string; member?: { role: string; roles: string[] } | null; deleted?: boolean }
function setup({ kind = 'BUSINESS', vertical = 'ONLINE_SALES', shopUserId = 'owner', member = null, deleted = false }: Setup) {
  db.shop = { id: 's1', kind, vertical, userId: shopUserId, deletedAt: deleted ? new Date() : null, packageLockedAt: null, packageLockReason: null }
  db.member = member
}
const admin = (...roles: string[]) => ({ role: 'ADMIN', roles })

async function verdict(cap: Capability, s: Setup) {
  setup(s)
  const r = await requireShopCapability(SESSION, cap)
  return r.ok ? 'OK' : `${r.response.status}:${(await r.response.json()).error}`
}

beforeEach(() => { db.shop = null; db.member = null; db.many = [] })

describe('requireShopCapability — บทบาท × capability (ผ่านกฎสมาชิกจริง)', () => {
  const svc = { vertical: 'SERVICE_QUEUE' }
  it('OWNER (เจ้าของหลัก): F1 · T2 · T4 ผ่าน', async () => {
    const s = { shopUserId: 'u1', member: { role: 'OWNER', roles: [] } }
    for (const cap of ['F1', 'T2', 'T4'] as const) expect(await verdict(cap, s), cap).toBe('OK')
  })
  it('MANAGER: T1 S2 F4 ผ่าน · F1 P3 F3 → 403 FORBIDDEN_ROLE', async () => {
    const s = { member: admin('MANAGER') }
    for (const cap of ['T1', 'S2', 'F4', 'X1'] as const) expect(await verdict(cap, s), cap).toBe('OK')
    for (const cap of ['F1', 'P3', 'F3', 'T2'] as const) expect(await verdict(cap, s), cap).toBe('403:FORBIDDEN_ROLE')
  })
  it('CHAT: H2 X2 O2 S1 ผ่าน · H3 O6 F4 → 403', async () => {
    const s = { member: admin('CHAT') }
    for (const cap of ['H1', 'H2', 'X2', 'O2', 'S1'] as const) expect(await verdict(cap, s), cap).toBe('OK')
    for (const cap of ['H3', 'O6', 'F4', 'P2'] as const) expect(await verdict(cap, s), cap).toBe('403:FORBIDDEN_ROLE')
  })
  it('BILLING ในร้านบริการ: O2s O5 ผ่าน · H1 O2 → 403', async () => {
    const s = { ...svc, member: admin('BILLING') }
    for (const cap of ['O2s', 'O5', 'D1'] as const) expect(await verdict(cap, s), cap).toBe('OK')
    for (const cap of ['H1', 'O2', 'S1'] as const) expect(await verdict(cap, s), cap).toBe('403:FORBIDDEN_ROLE')
  })
  it('BILLING ในร้านที่ขายบริการไม่ได้: ถูกตัดทิ้ง → ไม่ได้อะไรเลย แม้ O1/O2s', async () => {
    const s = { vertical: 'ONLINE_SALES', member: admin('BILLING') }
    for (const cap of ['O1', 'O2s', 'O5'] as const) expect(await verdict(cap, s), cap).toBe('403:FORBIDDEN_ROLE')
  })
  it('BILLING+CHAT ในร้านทั่วไป: ได้เฉพาะส่วนของ CHAT', async () => {
    const s = { vertical: 'ONLINE_SALES', member: admin('BILLING', 'CHAT') }
    expect(await verdict('O2s', s)).toBe('OK') // จาก CHAT
    expect(effectiveRoles({ kind: 'BUSINESS', vertical: 'ONLINE_SALES', userId: 'o' }, 'ADMIN', ['BILLING', 'CHAT'])).toEqual(['CHAT'])
  })
  it('TECHNICIAN: O1 O4 Q1 ผ่าน · S1 O3 O2s F4 → 403', async () => {
    const s = { ...svc, member: admin('TECHNICIAN') }
    for (const cap of ['O1', 'O4', 'Q1'] as const) expect(await verdict(cap, s), cap).toBe('OK')
    for (const cap of ['S1', 'O3', 'O2s', 'F4'] as const) expect(await verdict(cap, s), cap).toBe('403:FORBIDDEN_ROLE')
  })
  it('ADMIN ที่ roles ว่าง/แปลก = ไม่มีสิทธิ์ (ไม่ fallback เป็นผู้ดูแล)', async () => {
    expect(await verdict('O1', { member: admin() })).toBe('403:FORBIDDEN_ROLE')
    expect(await verdict('O1', { member: admin('OWNER', 'WAT') })).toBe('403:FORBIDDEN_ROLE')
  })
  it('T4: เจ้าของหลักผ่าน · เจ้าของร่วม (OWNER แต่ Shop.userId เป็นคนอื่น) → 403', async () => {
    expect(await verdict('T4', { shopUserId: 'u1', member: { role: 'OWNER', roles: [] } })).toBe('OK')
    expect(await verdict('T4', { shopUserId: 'someone-else', member: { role: 'OWNER', roles: [] } })).toBe('403:FORBIDDEN_ROLE')
    expect(await verdict('T2', { shopUserId: 'someone-else', member: { role: 'OWNER', roles: [] } })).toBe('OK') // ร่วมยังทำ T2 ได้
  })
  it('PERSONAL = เจ้าของเสมอ รวม T4 F1', async () => {
    const s = { kind: 'PERSONAL' as const, shopUserId: 'u1' }
    for (const cap of ['F1', 'T4', 'H3'] as const) expect(await verdict(cap, s), cap).toBe('OK')
  })
})

describe('requireShopCapability — ไม่ใช่สมาชิก/ไม่มีตัวตน (พฤติกรรมเดิมไม่เปลี่ยน)', () => {
  it('ไม่มี session / ไม่มี id → 401', async () => {
    for (const s of [null, { user: {} }, { user: { id: '' } }]) {
      const r = await requireShopCapability(s, 'O1')
      expect(r.ok === false && r.response.status).toBe(401)
    }
  })
  it('ระบุ shopId ที่ไม่ใช่สมาชิก → 403 FORBIDDEN (ไม่ถอยไปร้าน active)', async () => {
    setup({ member: null })
    const r = await requireShopCapability(SESSION, 'O1', { shopId: 's1' })
    expect(r.ok === false && r.response.status).toBe(403)
    expect(r.ok === false && (await r.response.json()).error).toBe('FORBIDDEN')
  })
  it('ไม่ระบุ shopId และ active resolve ไม่ได้ (ไม่มีร้านส่วนตัวให้ถอย) → 404', async () => {
    setup({ member: null })
    const r = await requireShopCapability(SESSION, 'O1')
    expect(r.ok === false && r.response.status).toBe(404)
  })
  it('ผ่าน → คืน shopId, userId, active, roles ที่มีผลจริง', async () => {
    setup({ member: admin('MANAGER', 'CHAT') })
    const r = await requireShopCapability(SESSION, 'H2')
    expect(r.ok && { shopId: r.shopId, userId: r.userId, roles: r.roles }).toEqual({ shopId: 's1', userId: 'u1', roles: ['MANAGER', 'CHAT'] })
  })
  it('ร้านถูกลบ → ไม่ผ่าน', async () => {
    setup({ member: admin('MANAGER'), deleted: true })
    expect((await requireShopCapability(SESSION, 'O1', { shopId: 's1' })).ok).toBe(false)
  })
})

describe('gatePage', () => {
  it('มีสิทธิ์ → ok · ไม่มี → FORBIDDEN_ROLE · ไม่มีร้าน → NO_SHOP', async () => {
    setup({ member: admin('CHAT') })
    expect((await gatePage(SESSION, 'H1')).ok).toBe(true)
    expect(await gatePage(SESSION, 'F1')).toEqual({ ok: false, reason: 'FORBIDDEN_ROLE' })
    setup({ member: null })
    expect(await gatePage(SESSION, 'H1')).toEqual({ ok: false, reason: 'NO_SHOP' })
    expect(await gatePage(null, 'H1')).toEqual({ ok: false, reason: 'NO_SHOP' })
  })
})

describe('canAccessShopWith (1 query ต่อคำถาม)', () => {
  it('สมาชิกที่มี cap ผ่าน · ไม่มี cap ไม่ผ่าน · ไม่ใช่สมาชิกไม่ผ่าน', async () => {
    setup({ member: admin('CHAT') })
    expect(await canAccessShopWith('s1', 'u1', 'H2')).toBe(true)
    expect(await canAccessShopWith('s1', 'u1', 'F1')).toBe(false)
    setup({ member: null })
    expect(await canAccessShopWith('s1', 'u1', 'O1')).toBe(false)
    expect(await canAccessShopWith('nope', 'u1', 'O1')).toBe(false)
  })
  it('ใช้กฎเดียวกัน: BILLING ในร้านทั่วไปไม่ผ่าน · T4 เฉพาะเจ้าของหลัก · PERSONAL ของคนอื่นไม่ผ่าน · ร้านที่ลบแล้วไม่ผ่าน', async () => {
    setup({ member: admin('BILLING') })
    expect(await canAccessShopWith('s1', 'u1', 'O1')).toBe(false)
    setup({ shopUserId: 'someone-else', member: { role: 'OWNER', roles: [] } })
    expect(await canAccessShopWith('s1', 'u1', 'T4')).toBe(false)
    expect(await canAccessShopWith('s1', 'u1', 'T2')).toBe(true)
    setup({ kind: 'PERSONAL', shopUserId: 'another' })
    expect(await canAccessShopWith('s1', 'u1', 'O1')).toBe(false)
    setup({ member: admin('MANAGER'), deleted: true })
    expect(await canAccessShopWith('s1', 'u1', 'O1')).toBe(false)
  })
})

describe('listAccessibleShopIds(userId, cap) — กรองตาม cap ต่อร้าน', () => {
  it('คืนเฉพาะร้านที่ role มี cap นั้น', async () => {
    const row = (id: string, kind: string, vertical: string, shopUserId: string, m: { role: string; roles: string[] } | null) =>
      ({ id, kind, vertical, userId: shopUserId, members: m ? [m] : [] })
    db.many = [
      row('mine', 'PERSONAL', 'ONLINE_SALES', 'u1', null),
      row('chatShop', 'BUSINESS', 'ONLINE_SALES', 'o', admin('CHAT')),
      row('billingGeneral', 'BUSINESS', 'ONLINE_SALES', 'o', admin('BILLING')), // ถูกตัดทิ้ง
      row('techShop', 'BUSINESS', 'SERVICE_QUEUE', 'o', admin('TECHNICIAN')),
      row('notMine', 'PERSONAL', 'ONLINE_SALES', 'other', null),
    ]
    expect(await listAccessibleShopIds('u1', 'H1')).toEqual(['mine', 'chatShop'])
    expect(await listAccessibleShopIds('u1', 'O1')).toEqual(['mine', 'chatShop', 'techShop'])
    expect(await listAccessibleShopIds('u1', 'T4')).toEqual(['mine'])
  })
})

describe('ForbiddenRoleError', () => {
  it("message 'FORBIDDEN' + code FORBIDDEN_ROLE (mapper เดิมที่จับด้วยข้อความยังทำงาน)", () => {
    const e = new ForbiddenRoleError()
    expect(e).toBeInstanceOf(Error)
    expect({ m: e.message, c: e.code }).toEqual({ m: 'FORBIDDEN', c: 'FORBIDDEN_ROLE' })
  })
})
