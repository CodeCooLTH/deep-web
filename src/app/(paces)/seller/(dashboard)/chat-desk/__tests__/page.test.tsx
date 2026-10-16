import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  session: { user: { id: 'u-1', activeShopId: 'shop-a' } } as unknown,
  owned: [] as string[],
  roles: ['ADMIN'] as string[],
  listShops: vi.fn(),
}))
vi.mock('next-auth', () => ({ getServerSession: async () => m.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/session-user', () => ({ sessionUserId: (s: { user?: { id?: string } } | null) => s?.user?.id ?? null }))
vi.mock('@/lib/shop-capability', () => ({ listAccessibleShopIds: async () => m.owned }))
vi.mock('@/lib/viewer-roles', () => ({ viewerRolesOf: async () => m.roles }))
vi.mock('@/services/chat-desk.service', () => ({ listDeskShopOptions: (...a: unknown[]) => m.listShops(...a) }))
// ตัวกลางที่ต้องมี provider/hook ฝั่ง client — เทสนี้ดูเฉพาะการตัดสินของ server page
vi.mock('@/components/PageBreadcrumb', () => ({ default: ({ title }: { title: string }) => <h4>{title}</h4> }))
vi.mock('../components/DeskPageClient', () => ({ default: (p: { ownerShops: { name: string }[]; initialShopId: string }) => <div data-client data-shop={p.initialShopId}>{p.ownerShops.map((s) => s.name).join('|')}</div> }))

import Page from '../page'

const render = async (sp: Record<string, string> = {}) => renderToStaticMarkup(await Page({ searchParams: Promise.resolve(sp) }))

beforeEach(() => {
  m.session = { user: { id: 'u-1', activeShopId: 'shop-a' } }
  m.owned = []
  m.roles = ['ADMIN']
  m.listShops.mockReset()
  m.listShops.mockResolvedValue([{ id: 'shop-a', name: 'ร้านลับ เอ' }, { id: 'shop-b', name: 'ร้านลับ บี' }])
})

describe('/chat-desk page (X7)', () => {
  it('ADMIN (ไม่ถือ X7 ร้านไหนเลย) → NoPermissionCard · ไม่มีชื่อร้านใน HTML · ไม่แตะข้อมูลร้าน', async () => {
    const h = await render()
    expect(h).toContain('หน้านี้ดูได้เฉพาะเจ้าของร้าน')
    expect(h).toContain('บทบาทของคุณตอนนี้')
    expect(h).not.toContain('ร้านลับ')
    expect(h).not.toContain('data-client')
    expect(m.listShops).not.toHaveBeenCalled()
  })

  it('ไม่มี session → ไม่ render อะไร (layout จัดการ)', async () => {
    m.session = null
    expect(await render()).toBe('')
  })

  it('เจ้าของ: ส่งเฉพาะร้านของตน · ?shop= ที่ไม่ใช่ร้านของตน → ตกไปร้านตั้งต้น (ร้านที่ active)', async () => {
    m.owned = ['shop-a', 'shop-b']
    const h = await render({ shop: 'shop-zzz' })
    expect(h).toContain('data-shop="shop-a"')
    expect(h).toContain('ร้านลับ เอ|ร้านลับ บี')
    expect(m.listShops).toHaveBeenCalledWith(['shop-a', 'shop-b'])
    expect(await render({ shop: 'shop-b' })).toContain('data-shop="shop-b"')
  })
})
