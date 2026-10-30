/**
 * /my-jobs "งานของฉัน" (00086 P3 · T9 · BRD FR-008)
 *
 * mutation ที่ต้องแดง:
 *  · ลบ `redirect('/orders')` ของร้านที่ไม่ใช่บริการ ⇒ เทส redirect แดง
 *  · MyJobsView render กลุ่มค้างโดยไม่เช็กความยาว / คืน carryOver ในตัวกรอง "ทั้งร้าน" ⇒ เทสกลุ่มค้างแดง
 *  · ลบ `aria-pressed` ⇒ เทสตัวกรองแดง
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h, type ReactElement } from 'react'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('notFound')
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/my-jobs',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/wrappers/Icon', () => ({
  default: ({ icon, className }: { icon: string; className?: string }) => <i data-icon={icon} className={className} />,
}))
const db = vi.hoisted(() => ({ shop: { findUnique: vi.fn() }, shopMember: { findUnique: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { getServerSession } from 'next-auth'
import MyJobsPage from '../page'
import MyJobsList, { MyJobsView } from '../components/MyJobsList'
import { myJobsSections, type MyJobsFilter } from '@/lib/technician-jobs'
import type { AppointmentDayApiItem, UnscheduledDayApiItem } from '@/components/safepay/appointment-board/types'

const SHOP = '11111111-1111-4111-8111-111111111111'
function asRole(roles: string[], vertical = 'SERVICE_QUEUE') {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1', activeShopId: SHOP } } as never)
  db.shop.findUnique.mockResolvedValue({
    id: SHOP, userId: 'owner-x', kind: 'BUSINESS', vertical, deletedAt: null, appointmentGranularity: 'TIME',
    members: [{ role: 'ADMIN', roles }],
  })
  db.shopMember.findUnique.mockResolvedValue({ role: 'ADMIN', roles })
}
type El = { type?: unknown; props?: Record<string, unknown> }
function find(node: unknown, type: unknown): El | undefined {
  if (Array.isArray(node)) return node.map((n) => find(n, type)).find(Boolean)
  if (node && typeof node === 'object' && 'props' in node) {
    const el = node as El
    if (el.type === type) return el
    return find(el.props?.children, type)
  }
  return undefined
}

beforeEach(() => vi.clearAllMocks())

describe('MyJobsPage (RSC) — ด่าน', () => {
  it('[blocker] ร้านที่ไม่ใช่บริการ ⇒ redirect /orders (ทุกบทบาท)', async () => {
    for (const v of ['ONLINE_SALES', 'LODGING']) {
      asRole(['TECHNICIAN'], v)
      await expect(MyJobsPage()).rejects.toThrow('redirect:/orders')
    }
  })
  it('ร้านบริการ ช่างล้วน ⇒ render รายการพร้อม viewerUserId จาก session', async () => {
    asRole(['TECHNICIAN'])
    const tree = await MyJobsPage()
    const list = find(tree, MyJobsList)
    expect(list?.props?.viewerUserId).toBe('u1')
  })
  it('ร้านบริการ เจ้าของ/บทบาทอื่นที่มี Q1 ⇒ เปิดได้ (เมนูไม่มี แต่ URL ตรงไม่พัง)', async () => {
    asRole(['CHAT'])
    expect(find(await MyJobsPage(), MyJobsList)).toBeTruthy()
  })
})

const ME = 'u-me'
const T = '2026-10-29T03:00:00.000Z'
const item = (token: string, p: Partial<AppointmentDayApiItem> = {}): AppointmentDayApiItem => ({
  orderToken: token, orderNo: `DP-${token}`, createdAt: '2026-10-20T03:00:00.000Z', arrivalMode: 'BOOKED',
  start: '2026-10-29T03:00:00.000Z', end: '2026-10-29T04:00:00.000Z', appointmentStatus: 'SCHEDULED',
  buyerName: `ลูกค้า-${token}`, buyerContact: null, resource: { id: 'r1', name: 'งานล้าง' },
  source: null, salesChannel: null, customerAvatarUrl: null, conversationId: null,
  firstItemName: null, itemCount: 1, assignee: null, serviceStartedAt: null, serviceFinishedAt: null, serviceClosedAt: null,
  ...p,
})
const MINE = { assignee: { userId: ME, displayName: 'สมศักดิ์' } }
const OTHER = { assignee: { userId: 'u-x', displayName: 'วิชัย' } }
const TODAY = [item('m1', MINE), item('u1'), item('o1', OTHER), item('done', { ...MINE, serviceClosedAt: T, appointmentStatus: 'COMPLETED' })]
const CARRY = [item('c1', { ...MINE, start: '2026-10-27T03:00:00.000Z', end: '2026-10-27T04:00:00.000Z', serviceStartedAt: '2026-10-27T03:05:00.000Z' })]

// 00086 M1 — งานของฉันที่ยังไม่ระบุเวลา (start/end = null) · walk-in เก่าที่ไม่มีเวลา
const unsched = (token: string, p: Partial<UnscheduledDayApiItem> = {}): UnscheduledDayApiItem => ({
  ...item(token), arrivalMode: null, ...MINE, ...p, start: null, end: null,
})

const view = (
  filter: MyJobsFilter,
  opts: { today?: AppointmentDayApiItem[]; carry?: AppointmentDayApiItem[]; unscheduled?: UnscheduledDayApiItem[]; failed?: boolean; loading?: boolean } = {},
) =>
  renderToStaticMarkup(
    h(MyJobsView, {
      filter,
      onFilter: () => {},
      failed: opts.failed ?? false,
      sections: opts.loading ? null : myJobsSections(opts.today ?? TODAY, opts.carry ?? CARRY, filter, ME, opts.unscheduled ?? []),
      onRetry: () => {},
      onRowClick: () => {},
    }) as ReactElement,
  )

describe('MyJobsView — ตัวกรอง + กลุ่ม', () => {
  it('ตัวกรอง 2 ช่อง role=group · ค่าที่เลือก aria-pressed=true', () => {
    const html = view('mine')
    expect(html).toContain('role="group" aria-label="กรองงาน"')
    expect(html).toMatch(/aria-pressed="true"[^>]*>งานของฉัน</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>ทั้งร้าน</)
    expect(view('all')).toMatch(/aria-pressed="true"[^>]*>ทั้งร้าน</)
  })
  it('[blocker] "งานของฉัน": ของฉัน + ยังไม่มีคนรับ · ไม่มีงานของคนอื่น · ปิดแล้วแยกการ์ด', () => {
    const html = view('mine')
    expect(html).toContain('วันนี้ · 2 งานที่ยังไม่ปิด')
    expect(html).toContain('ลูกค้า-m1')
    expect(html).toContain('ลูกค้า-u1')
    expect(html).not.toContain('ลูกค้า-o1')
    expect(html).toContain('ปิดงานแล้ว · 1')
  })
  it('"ทั้งร้าน": ทุกงานวันนี้ (มีงานของคนอื่นด้วย)', () => {
    const html = view('all')
    expect(html).toContain('วันนี้ · 3 งานที่ยังไม่ปิด')
    expect(html).toContain('ลูกค้า-o1')
  })
  it('[blocker] ค้างจากวันก่อน: อยู่บนสุดใต้ตัวกรอง "งานของฉัน" · warning-ink + clock-exclamation · คอลัมน์เวลามีวันที่', () => {
    const html = view('mine')
    const carryAt = html.indexOf('ค้างจากวันก่อน · 1 งาน')
    expect(carryAt).toBeGreaterThan(-1)
    expect(carryAt).toBeLessThan(html.indexOf('วันนี้ · 2 งานที่ยังไม่ปิด'))
    expect(html).toContain('<i data-icon="tabler:clock-exclamation" class="size-4 shrink-0 text-warning-ink">')
    expect(html).toContain('ลูกค้า-c1')
    expect(html).toMatch(/aria-label="[^"]*ลูกค้า-c1[^"]* วันที่ /)
  })
  it('[blocker] ค้างจากวันก่อน: ตัวกรอง "ทั้งร้าน" ไม่แสดง · ไม่มีงานค้าง = ไม่มีหัวว่าง', () => {
    expect(view('all')).not.toContain('ค้างจากวันก่อน')
    expect(view('all')).not.toContain('ลูกค้า-c1')
    expect(view('mine', { carry: [] })).not.toContain('ค้างจากวันก่อน')
  })
  it('ว่าง: ของฉัน "วันนี้ยังไม่มีงานของคุณ" · ทั้งร้าน "วันนี้ยังไม่มีงาน" + ลิงก์ตารางงาน · ไม่มีการ์ดปิดงาน', () => {
    const mine = view('mine', { today: [item('o1', OTHER)], carry: [] })
    expect(mine).toContain('วันนี้ยังไม่มีงานของคุณ')
    expect(mine).toContain('href="/queues"')
    expect(mine).not.toContain('ปิดงานแล้ว')
    expect(view('all', { today: [], carry: [] })).toContain('วันนี้ยังไม่มีงาน<')
  })
  it('โหลด = skeleton (ไม่มีหัวการ์ด) · ล้ม = ข้อความ + ลองอีกครั้ง', () => {
    const loading = view('mine', { loading: true })
    expect(loading).toContain('animate-pulse')
    expect(loading).not.toContain('วันนี้ ·')
    const failed = view('mine', { failed: true })
    expect(failed).toContain('โหลดงานไม่สำเร็จ')
    expect(failed).toContain('ลองอีกครั้ง')
  })
  it('แถวมี who-line + ป้ายระหว่างทำงาน (showAssignee)', () => {
    const html = view('mine', { today: [item('s1', { ...MINE, serviceStartedAt: T })], carry: [] })
    expect(html).toContain('<span class="truncate">สมศักดิ์</span>')
    expect(html).toContain('กำลังให้บริการ')
  })
})

describe('MyJobsView — ยังไม่ระบุเวลา (00086 M1)', () => {
  it('[blocker] "งานของฉัน": กลุ่ม "ยังไม่ระบุเวลา" อยู่หลัง "ค้างจากวันก่อน" ก่อนรายการวันนี้ · ไอคอน/สีของ UNSCHEDULED', () => {
    const html = view('mine', { unscheduled: [unsched('n1')] })
    const carryAt = html.indexOf('ค้างจากวันก่อน · 1 งาน')
    const unAt = html.indexOf('ยังไม่ระบุเวลา · 1 งาน')
    const todayAt = html.indexOf('วันนี้ · 2 งานที่ยังไม่ปิด')
    expect(unAt).toBeGreaterThan(carryAt)
    expect(unAt).toBeLessThan(todayAt)
    expect(html).toContain('<i data-icon="tabler:clock-question" class="size-4 shrink-0 text-warning-ink">')
    expect(html).toContain('ลูกค้า-n1')
  })
  it('[blocker] แถวไม่มีเวลา: คอลัมน์เวลา = "ยังไม่ระบุเวลา" (ไม่ใช่ 07:00 ของปี 1970) · aria ไม่มี "เวลา … ถึง" · ป้าย "รอเริ่มงาน"', () => {
    const html = view('mine', { today: [], carry: [], unscheduled: [unsched('n1')] })
    expect(html).toContain('<i data-icon="clock-question" class="block size-4"></i>ยังไม่ระบุเวลา')
    expect(html).not.toContain('1970')
    expect(html).not.toMatch(/aria-label="[^"]*ลูกค้า-n1[^"]* เวลา \d/)
    expect(html).toMatch(/aria-label="[^"]*ลูกค้า-n1[^"]* ยังไม่ระบุเวลา สถานะ รอเริ่มงาน/)
  })
  it('[blocker] ว่าง = ไม่มีหัวกลุ่ม · ตัวกรอง "ทั้งร้าน" ไม่แสดง · งานของคนอื่น/ปิดแล้วไม่โผล่', () => {
    expect(view('mine', { unscheduled: [] })).not.toContain('ยังไม่ระบุเวลา')
    expect(view('all', { unscheduled: [unsched('n1')] })).not.toContain('ลูกค้า-n1')
    const html = view('mine', { unscheduled: [unsched('x1', OTHER), unsched('x2', { serviceClosedAt: T })] })
    expect(html).not.toContain('ยังไม่ระบุเวลา')
  })
})

describe('AppointmentDayRows showAssignee — ป้ายสำรองตัวเดียวกับ AppointmentDayCard (MINOR-2)', () => {
  it('[blocker] งานหน้าร้าน (WALK_IN) ยังไม่เริ่ม → "รอเริ่มงาน" ไม่ใช่ "นัดแล้ว" · จองล่วงหน้ายัง "นัดแล้ว"', () => {
    const walk = view('mine', { today: [item('w1', { ...MINE, arrivalMode: 'WALK_IN' })], carry: [] })
    expect(walk).toMatch(/aria-label="[^"]*ลูกค้า-w1[^"]* สถานะ รอเริ่มงาน/)
    expect(walk).not.toContain('นัดแล้ว')
    const booked = view('mine', { today: [item('b1', MINE)], carry: [] })
    expect(booked).toMatch(/aria-label="[^"]*ลูกค้า-b1[^"]* สถานะ นัดแล้ว/)
  })
})
