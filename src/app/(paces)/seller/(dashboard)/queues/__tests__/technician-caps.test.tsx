/**
 * /queues ของช่าง — สิทธิ์ที่ส่งลงปฏิทิน/การ์ดนัด + ข้อความเมื่อยังไม่มีประเภทงาน (00071 P3 · S-15)
 * mutation ที่ต้องแดง: เปลี่ยน `canCreate: can(viewerRoles, 'O2s')` เป็น true · ลบ `AppointmentBoardCapsProvider` ครอบ
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('notFound') }), useRouter: vi.fn(), usePathname: vi.fn(), useSearchParams: vi.fn() }))
const db = vi.hoisted(() => ({ shop: { findUnique: vi.fn() }, shopMember: { findUnique: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
const svc = vi.hoisted(() => ({ listServiceResources: vi.fn() }))
vi.mock('@/services/service-resource.service', () => ({ listServiceResources: svc.listServiceResources }))

import { getServerSession } from 'next-auth'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import WorkSchedulePage from '../page'

const SHOP = '11111111-1111-4111-8111-111111111111'
function asRole(roles: string[]) {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1', activeShopId: SHOP } } as never)
  db.shop.findUnique.mockResolvedValue({
    id: SHOP, userId: 'owner-x', kind: 'BUSINESS', vertical: 'SERVICE_QUEUE', deletedAt: null, appointmentGranularity: 'TIME',
    members: [{ role: 'ADMIN', roles }],
  })
  db.shopMember.findUnique.mockResolvedValue({ role: 'ADMIN', roles })
}
type El = { type?: { name?: string }; props?: Record<string, unknown> }
function find(node: unknown, name: string): El | undefined {
  if (Array.isArray(node)) return node.map((n) => find(n, name)).find(Boolean)
  if (node && typeof node === 'object' && 'props' in node) {
    const el = node as El
    if (el.type?.name === name) return el
    return find(el.props?.children, name)
  }
  return undefined
}

beforeEach(() => {
  vi.clearAllMocks()
  svc.listServiceResources.mockResolvedValue([{ id: 'r1', name: 'ช่าง A', capacity: 1, isActive: true }])
})

describe('WorkSchedulePage — สิทธิ์ที่ส่งลงปฏิทิน', () => {
  it('TECHNICIAN: ไม่เห็นเงิน/แชท/เลื่อนนัด/สร้างงาน', async () => {
    asRole(['TECHNICIAN'])
    const tree = await WorkSchedulePage()
    expect(find(tree, 'AppointmentBoardCapsProvider')!.props!.value).toEqual({ showMoney: false, canChat: false, canReschedule: false, canCreate: false })
  })
  it('MANAGER: ครบ', async () => {
    asRole(['MANAGER'])
    const tree = await WorkSchedulePage()
    expect(find(tree, 'AppointmentBoardCapsProvider')!.props!.value).toEqual({ showMoney: true, canChat: true, canReschedule: true, canCreate: true })
  })
  it('TECHNICIAN+CHAT: union — เห็นเงิน ทักแชท และเลื่อนนัดได้ (CHAT มี O3)', async () => {
    asRole(['TECHNICIAN', 'CHAT'])
    const tree = await WorkSchedulePage()
    expect(find(tree, 'AppointmentBoardCapsProvider')!.props!.value).toMatchObject({ showMoney: true, canChat: true, canReschedule: true })
  })
})

describe('WorkSchedulePage — ยังไม่มีประเภทงาน', () => {
  beforeEach(() => svc.listServiceResources.mockResolvedValue([]))
  it('ช่าง: ข้อความบอกว่าใครต้องตั้ง + ไม่มีปุ่มไปตั้งค่า', async () => {
    asRole(['TECHNICIAN'])
    const html = renderToStaticMarkup(h(LocaleProvider, { locale: 'th', children: (await WorkSchedulePage()) as ReactNode }))
    expect(html).toContain('ยังไม่มีประเภทงาน')
    expect(html).toContain('เจ้าของร้านหรือผู้ดูแลต้องตั้งประเภทงานก่อน ตารางนัดของแต่ละวันถึงจะขึ้นที่นี่')
    expect(html).not.toContain('/settings/job-types')
  })
  it('ผู้ดูแล: มีปุ่มไปตั้งค่าเหมือนเดิม', async () => {
    asRole(['MANAGER'])
    const html = renderToStaticMarkup(h(LocaleProvider, { locale: 'th', children: (await WorkSchedulePage()) as ReactNode }))
    expect(html).toContain('/settings/job-types')
    expect(html).toContain('ตั้งประเภทงานที่ร้านรับก่อน')
  })
})
