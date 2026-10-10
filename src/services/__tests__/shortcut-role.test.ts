/**
 * shortcut.service × บทบาท (00071 S-16) — ทางลัดที่บทบาทปัจจุบันเปิดไม่ได้ไม่โผล่ทั้งบนการ์ดและใน "ไม่พร้อมใช้งาน"
 * mock เฉพาะขอบ I/O (prisma/ร้าน/entitlement) — ตัวกรองจริงทำงานเต็มสาย
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const active = vi.hoisted(() => ({ value: null as unknown }))
const pref = vi.hoisted(() => ({ slugs: null as string[] | null }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    sellerShortcutPreference: {
      findUnique: async () => (pref.slugs ? { slugs: pref.slugs } : null),
      upsert: async () => ({}),
    },
  },
}))
vi.mock('@/lib/shop-context', () => ({ requireActiveShop: async () => active.value }))
vi.mock('@/services/line-report-access.service', () => ({ ownsAnyShop: async () => true }))
vi.mock('@/services/inventory-entitlement.service', () => ({
  getEntitlementInfo: async () => ({ status: 'ACTIVE', package: 'PRO' }),
}))

import { resolveShortcutState } from '@/services/shortcut.service'

const SHELL = { hidePayments: false, hidePaidFeatures: false, offerIap: true }
const session = { user: { id: 'u1', activeShopId: 's1' } }

function as(role: 'OWNER' | 'ADMIN', roles: string[], vertical = 'SERVICE_QUEUE') {
  active.value = { kind: 'BUSINESS', role, roles, shop: { id: 's1', userId: role === 'OWNER' ? 'u1' : 'owner', vertical } }
}

beforeEach(() => {
  pref.slugs = null
})

describe('resolveShortcutState — unavailableByRole', () => {
  it('ช่างที่เคยปักแชท: แชทไม่อยู่ในการ์ด ไม่อยู่ใน unavailable แต่อยู่ใน unavailableByRole (ยังอยู่ใน pinnedSlugs)', async () => {
    as('ADMIN', ['TECHNICIAN'])
    pref.slugs = ['seller:orders', 'seller:inbox']
    const s = await resolveShortcutState(session, SHELL)
    if (s.kind !== 'OK') throw new Error('NO_SHOP')
    expect(s.tiles.map((t) => t.slug)).toEqual(['seller:orders'])
    expect(s.unavailable).toEqual([])
    expect(s.unavailableByRole).toEqual(['seller:inbox'])
    expect(s.pinnedSlugs).toContain('seller:inbox')
    expect(s.catalog.map((c) => c.slug)).not.toContain('seller:inbox')
  })

  it('ถูกถอดเพราะประเภทร้าน (ไม่ใช่บทบาท) ยังเป็น unavailable เดิม', async () => {
    as('OWNER', [])
    pref.slugs = ['seller:orders', 'seller:rooms']
    const s = await resolveShortcutState(session, SHELL)
    if (s.kind !== 'OK') throw new Error('NO_SHOP')
    expect(s.unavailable.map((u) => u.slug)).toEqual(['seller:rooms'])
    expect(s.unavailableByRole).toEqual([])
  })

  it('ค่าเริ่มต้นของช่าง = เมนูที่ช่างเห็นเท่านั้น (แคตตาล็อกผ่านตัวกรองบทบาท)', async () => {
    as('ADMIN', ['TECHNICIAN'])
    const s = await resolveShortcutState(session, SHELL)
    if (s.kind !== 'OK') throw new Error('NO_SHOP')
    expect(s.isDefault).toBe(true)
    expect(s.catalog.map((c) => c.slug)).toEqual(expect.arrayContaining(['seller:orders', 'seller:queues']))
    for (const bad of ['seller:inbox', 'seller:sales', 'seller:wallet']) expect(s.catalog.map((c) => c.slug)).not.toContain(bad)
  })
})
