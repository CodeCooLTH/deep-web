/**
 * หน้าการจอง (รายการ + รายละเอียด) สำหรับช่าง (เงิน NONE) — 00071 P3 · S-15
 * ไล่ต้นไม้ element ทุกชั้น (props ที่ข้าม RSC) + JSON ของหน้ารายการ (ซึ่ง render เป็น host element ตรง ๆ)
 *
 * mutation ที่ต้องแดง: ทำให้ showMoney เป็น true เสมอในทั้งสองหน้า
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'u1' } })) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('notFound') }) }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'seller.deepthailand.app' }) }))
const cap = vi.hoisted(() => ({ roles: ['TECHNICIAN'] as string[] }))
vi.mock('@/lib/shop-capability', () => ({ gatePage: async () => ({ ok: true, roles: cap.roles }) }))
vi.mock('@/lib/viewer-roles', () => ({ viewerRolesOf: vi.fn() }))
vi.mock('@/lib/shop-context', () => ({ requireActiveShop: async () => ({ shop: { id: 's1', vertical: 'LODGING' } }) }))
vi.mock('@/lib/seller-contact-display', () => ({ sellerContactOrNull: (c: string | null) => c }))
vi.mock('@/services/housekeeping.service', () => ({ listHousekeepers: async () => [] }))

const dec = (n: number) => ({ toFixed: (d: number) => n.toFixed(d) })
const ROW = () => ({
  publicToken: 'tok', shortCode: 'ab', status: 'PENDING', room: { name: 'ห้อง 1' }, buyerName: 'สมชาย', buyerContact: '0812345678',
  checkIn: new Date('2026-10-12'), checkOut: new Date('2026-10-14'), totalAmount: dec(7777), depositAmount: dec(3333),
  slipFileId: 'slip-1', cancelReason: null, internalNote: null, housekeeperId: null, housekeepingStatus: null, publicToken2: null,
})
vi.mock('@/services/booking.service', () => ({
  listBookings: async () => [ROW()],
  getBookingDetail: async () => ROW(),
  toDateOnlyString: () => '2026-10-12',
  nightsBetween: () => 2,
  BookingNotFoundError: class extends Error {},
}))

import ListPage from '../page'
import DetailPage from '../[token]/page'

type El = { type?: unknown; props?: Record<string, unknown> }
function find(node: unknown, name: string): El | undefined {
  if (Array.isArray(node)) { for (const n of node) { const r = find(n, name); if (r) return r } return }
  if (!node || typeof node !== 'object' || !('props' in node)) return
  const el = node as El
  const t = el.type as { name?: string } | string
  if (typeof t !== 'string' && t?.name === name) return el
  for (const v of Object.values(el.props ?? {})) { const r = find(v, name); if (r) return r }
}
const dump = (t: unknown) => JSON.stringify(t, (k, v) => (k === 'type' && typeof v !== 'string' ? 'C' : k === '_owner' || k === '_store' ? undefined : v))
const MONEY = ['totalAmount', 'depositAmount', 'slipFileId', 'publicUrl', 'hasSlip']

beforeEach(() => { cap.roles = ['TECHNICIAN'] })

describe('bookings — ช่างไม่เห็นเงิน', () => {
  it('รายการ: TECHNICIAN ไม่มียอด/มัดจำ/สลิปใน tree เลย · MANAGER มี', async () => {
    const tech = dump(await ListPage())
    expect(tech).toContain('สมชาย')
    expect(tech).not.toMatch(/7,?777|3,?333|ยอดรวม|มัดจำ|มีสลิป/)
    cap.roles = ['MANAGER']
    expect(dump(await ListPage())).toMatch(/7,?777/)
  })

  it('รายละเอียด: TECHNICIAN → booking ไม่มีคีย์เงินสักตัว (absent) + showMoney=false · MANAGER เหมือนเดิม', async () => {
    const tech = find(await DetailPage({ params: Promise.resolve({ token: 'tok' }) }), 'BookingDetail')!
    expect(tech.props!.showMoney).toBe(false)
    const b = tech.props!.booking as Record<string, unknown>
    for (const k of MONEY) expect(Object.hasOwn(b, k)).toBe(false)
    expect(b).toMatchObject({ guestName: 'สมชาย', roomName: 'ห้อง 1', status: 'PENDING' })

    cap.roles = ['MANAGER']
    const mgr = find(await DetailPage({ params: Promise.resolve({ token: 'tok' }) }), 'BookingDetail')!
    expect(mgr.props!.showMoney).toBe(true)
    expect(mgr.props!.booking).toMatchObject({ totalAmount: '7777.00', depositAmount: '3333.00', slipFileId: 'slip-1' })
    expect((mgr.props!.booking as { publicUrl: string }).publicUrl).toContain('/o/tok')
  })
})
