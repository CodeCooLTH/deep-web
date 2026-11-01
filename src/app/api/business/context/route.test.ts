/**
 * GET /api/business/context — `businesses[].canCloseJob` (00088 แชท native ซ่อนปุ่ม "ปิดงาน" ให้เท่าหน้าแชทเว็บ)
 *
 * 🛑 ไม่ mock `@/lib/shop-permissions` — ให้ memberCanCloseJob ตัวจริงตัดสิน (กฎเดียวกับ canCloseJobInShop ที่หน้าแชทเว็บใช้)
 * mock แค่ prisma (ห้ามต่อ DB จริง · HR13) + session + ตัวช่วยแพ็กเกจที่ไม่เกี่ยว
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/app-shell-server', () => ({ shouldHidePayments: vi.fn(async () => false) }))
vi.mock('@/lib/shop-context', () => ({ getPersonalShop: vi.fn(async () => null) }))
vi.mock('@/services/business-package.service', () => ({ getSubscriptionStatus: vi.fn(async () => null) }))

const db = vi.hoisted(() => ({
  shopMember: { findMany: vi.fn() },
  shop: { count: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { getServerSession } from 'next-auth'
import { GET } from './route'

type Row = { role: string; roles: string[]; canCloseJob: boolean; vertical: string }
function member({ role, roles, canCloseJob, vertical }: Row, id = 'shop-1') {
  return {
    role, roles, canCloseJob,
    shop: { id, shopName: 'ร้าน', logo: null, kind: 'BUSINESS', vertical, packageLockedAt: null, packageLockReason: null, deletedAt: null },
  }
}
async function closeFlag(row: Row): Promise<unknown> {
  db.shopMember.findMany.mockResolvedValueOnce([member(row)])
  const res = await GET()
  const body = await res.json()
  return body.businesses[0].canCloseJob
}

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1' } } as never)
})

describe('businesses[].canCloseJob — เท่า memberCanCloseJob ของหน้าแชทเว็บ', () => {
  it('ร้านบริการ: เจ้าของ/ผู้จัดการ = ปิดได้เสมอ', async () => {
    expect(await closeFlag({ role: 'OWNER', roles: [], canCloseJob: false, vertical: 'SERVICE_QUEUE' })).toBe(true)
    expect(await closeFlag({ role: 'ADMIN', roles: ['MANAGER'], canCloseJob: false, vertical: 'SERVICE_QUEUE' })).toBe(true)
  })
  it('ร้านบริการ: แอดมินแชท/ช่าง ต้องถูกติ๊ก "ปิดงานได้"', async () => {
    expect(await closeFlag({ role: 'ADMIN', roles: ['CHAT'], canCloseJob: false, vertical: 'SERVICE_QUEUE' })).toBe(false)
    expect(await closeFlag({ role: 'ADMIN', roles: ['CHAT'], canCloseJob: true, vertical: 'SERVICE_QUEUE' })).toBe(true)
    expect(await closeFlag({ role: 'ADMIN', roles: ['TECHNICIAN'], canCloseJob: false, vertical: 'SERVICE_QUEUE' })).toBe(false)
    expect(await closeFlag({ role: 'ADMIN', roles: ['TECHNICIAN'], canCloseJob: true, vertical: 'SERVICE_QUEUE' })).toBe(true)
  })
  it('ร้านไม่ใช่บริการ: ธงไม่มีผล (= O4 เดิม)', async () => {
    expect(await closeFlag({ role: 'ADMIN', roles: ['CHAT'], canCloseJob: false, vertical: 'ONLINE_SALES' })).toBe(true)
  })
  it('ฟิลด์เดิมของตัวสลับบัญชีไม่เปลี่ยน', async () => {
    db.shopMember.findMany.mockResolvedValueOnce([member({ role: 'ADMIN', roles: ['CHAT'], canCloseJob: true, vertical: 'SERVICE_QUEUE' })])
    const body = await (await GET()).json()
    expect(Object.keys(body.businesses[0]).sort()).toEqual(
      ['canCloseJob', 'deletedAt', 'lockReason', 'locked', 'logo', 'role', 'roles', 'shopId', 'shopName'].sort(),
    )
    expect(body.businesses[0].roles).toEqual(['CHAT'])
  })
})
