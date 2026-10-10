/**
 * หน้า RSC ของออเดอร์ (รายการ + รายละเอียด) สำหรับช่าง (ระดับเงิน NONE) — 00071 P3 · S-15
 *
 * หน้าเหล่านี้อยู่ใต้ client layout: ทุกคีย์ที่อยู่ใน props ของ client component = อยู่ใน flight payload ที่ผู้ใช้เปิดดูได้
 * จึงไล่ "ต้นไม้ element" ที่หน้า return (ทุก props ทุกชั้น) แล้วยืนยันว่าไม่มีคีย์เงิน — ไม่ใช่แค่ดู JSX ที่ render
 * (docs/conventions/permission-gate-follows-the-row.md ข้อ 1 ข้อ 4)
 *
 * mutation ที่ต้องแดง: ลบ `if (!showMoney) rawOrders = rawOrders.map(toNoMoneyOrder)` ที่หน้ารายการ ·
 * ลบสาขา `moneyLevel(viewerRoles) === 'NONE'` ที่หน้ารายละเอียด · ลบ `filterOrderEventsForNoMoney` ใน TechnicianOrderDetail
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('redirect') }),
  notFound: vi.fn(() => { throw new Error('notFound') }),
  useRouter: vi.fn(), usePathname: vi.fn(), useSearchParams: vi.fn(),
}))

const db = vi.hoisted(() => ({
  shop: { findUnique: vi.fn() },
  shopMember: { findUnique: vi.fn() },
  shopChannel: { findMany: vi.fn() },
  conversation: { findMany: vi.fn() },
  externalContact: { findMany: vi.fn() },
  order: { groupBy: vi.fn(), findMany: vi.fn() },
  orderEvent: { findMany: vi.fn() },
  appointmentReschedule: { count: vi.fn() },
  shipmentEvidence: { count: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const svc = vi.hoisted(() => ({
  getOrdersByShop: vi.fn(),
  getOrderForShop: vi.fn(),
  getReceiptNoForOrder: vi.fn(),
  getShipmentPanel: vi.fn(),
  getActiveReturnForTimeline: vi.fn(),
  getCustomerSummary: vi.fn(),
  resolveExpenseAccess: vi.fn(),
  getReturnAdjustments: vi.fn(),
  getConnection: vi.fn(),
}))
vi.mock('@/services/order.service', () => ({ getOrdersByShop: svc.getOrdersByShop, getOrderForShop: svc.getOrderForShop }))
vi.mock('@/services/receipt.service', () => ({ getReceiptNoForOrder: svc.getReceiptNoForOrder }))
vi.mock('@/services/iship.service', () => ({ getShipmentPanel: svc.getShipmentPanel, getConnection: svc.getConnection }))
vi.mock('@/services/order-return.service', () => ({ getActiveReturnForTimeline: svc.getActiveReturnForTimeline }))
vi.mock('@/services/customer.service', () => ({ getCustomerSummary: svc.getCustomerSummary }))
vi.mock('@/services/expense-access.service', () => ({ resolveExpenseAccess: svc.resolveExpenseAccess }))
vi.mock('@/services/return-adjustment.service', () => ({ getReturnAdjustments: svc.getReturnAdjustments }))

import { getServerSession } from 'next-auth'
import OrdersPage from '../page'
import OrderDetailPage from '../[token]/page'
import TechnicianOrderDetail from '../[token]/components/TechnicianOrderDetail'
import { NO_MONEY_FORBIDDEN_KEYS } from '@/lib/order-view-by-level'

const SHOP = '11111111-1111-4111-8111-111111111111'

function asRole(roles: string[], vertical = 'SERVICE_QUEUE') {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1', activeShopId: SHOP } } as never)
  const shopRow = {
    id: SHOP, userId: 'owner-x', kind: 'BUSINESS', vertical, deletedAt: null, packageLockedAt: null, packageLockReason: null,
    shopName: 'ร้านทดสอบ', address: null, appointmentGranularity: 'TIME',
    members: [{ role: 'ADMIN', roles }],
  }
  db.shop.findUnique.mockResolvedValue(shopRow)
  db.shopMember.findUnique.mockResolvedValue({ role: 'ADMIN', roles })
}

const dec = (n: number) => ({ toFixed: (d: number) => n.toFixed(d), valueOf: () => n, toString: () => String(n) })

const RAW = () => ({
  id: 'o1', publicToken: 'tok-1', orderNo: 'DP1', shortCode: 'ab', status: 'PENDING', type: 'SERVICE',
  createdAt: new Date('2026-10-10T03:00:00Z'), salesChannel: 'LINE', fulfillmentMode: 'SHIPPED',
  buyerName: 'สมชาย', buyerContact: '0812345678', buyerUserId: null, customerId: 'c1', conversationId: 'conv-1',
  auctionId: null, internalNote: 'ตัดสั้น', shippingAddress: null,
  serviceStart: new Date('2026-10-12T03:00:00Z'), serviceEnd: new Date('2026-10-12T04:00:00Z'), serviceResourceId: 'r1',
  appointmentStatus: 'SCHEDULED', rescheduleRequestNote: null, handedOverAt: null, disputeOpenedAt: null, disputeResolvedAt: null,
  totalAmount: dec(900), discount: dec(10), vatRate: dec(0.07), vatAmount: dec(5), depositAmount: dec(300),
  paymentMethod: 'COD', paymentConfirmedAt: null, codReceivedAt: null, slipFileId: null,
  items: [{ id: 'i1', productId: null, name: 'ตัดผม', description: null, qty: 1, price: dec(900), cost: dec(100), stockDeducted: null, product: { images: [] } }],
  payments: [{ kind: 'DEPOSIT', amount: dec(300), method: 'CASH', note: null, receivedAt: new Date(), voidedAt: null }],
  shipments: [{ id: 's1', trackingNo: 'T1', courierCode: 'x', courierName: 'x', provider: 'ISHIP', carrierStatus: null, status: 'CREATED', isDryRun: false, direction: 'FORWARD', problemAt: null, returnStartedAt: null, returnedAt: null, returnDispatchedAt: null, carrierPrice: dec(40), estimatedPrice: dec(40), codFee: dec(5) }],
  shipmentTracking: null, serviceResource: { id: 'r1', name: 'ช่าง A', capacity: 1 }, shopChannel: null, buyer: null, review: null,
  shop: { id: SHOP },
})

type El = { type?: unknown; props?: Record<string, unknown> }
/** เดินต้นไม้ element: คืน [{ name, props }] ของทุก element (ไม่เรียก component) */
function elements(node: unknown, out: { name: string; props: Record<string, unknown> }[] = []) {
  if (Array.isArray(node)) node.forEach((n) => elements(n, out))
  else if (node && typeof node === 'object' && 'props' in node) {
    const el = node as El
    const t = el.type as { name?: string; displayName?: string } | string | undefined
    out.push({ name: typeof t === 'string' ? t : (t?.displayName ?? t?.name ?? ''), props: el.props ?? {} })
    for (const v of Object.values(el.props ?? {})) elements(v, out)
  }
  return out
}
function moneyKeysIn(v: unknown, path = '$', out: string[] = [], seen = new Set<unknown>()): string[] {
  if (v == null || typeof v !== 'object' || v instanceof Date || seen.has(v)) return out
  seen.add(v)
  if (Array.isArray(v)) v.forEach((x, i) => moneyKeysIn(x, `${path}[${i}]`, out, seen))
  else if ('props' in v && '$$typeof' in v) moneyKeysIn((v as El).props, `${path}<>`, out, seen)
  else for (const [k, x] of Object.entries(v)) {
    if (NO_MONEY_FORBIDDEN_KEYS.includes(k)) out.push(`${path}.${k}`)
    moneyKeysIn(x, `${path}.${k}`, out, seen)
  }
  return out
}
const find = (tree: ReactNode, name: string) => elements(tree).find((e) => e.name === name)

beforeEach(() => {
  vi.clearAllMocks()
  db.shopChannel.findMany.mockResolvedValue([])
  db.conversation.findMany.mockResolvedValue([{ id: 'conv-9', buyerUserId: null, externalContactId: 'x1' }])
  db.externalContact.findMany.mockResolvedValue([{ id: 'x1', customerId: 'c1' }])
  db.order.groupBy.mockResolvedValue([{ customerId: 'c1', status: 'CANCELLED', cancelInitiator: 'seller', cancelReason: null, _count: { _all: 3 } }])
  db.order.findMany.mockResolvedValue([])
  db.orderEvent.findMany.mockResolvedValue([
    { id: 'e1', type: 'ORDER_CREATED', meta: {}, occurredAt: new Date('2026-10-10T03:00:00Z'), actor: null },
    { id: 'e2', type: 'COD_SETTLED', meta: { amount: 900 }, occurredAt: new Date('2026-10-11T03:00:00Z'), actor: null },
    { id: 'e3', type: 'PAYMENT_CONFIRMED', meta: {}, occurredAt: new Date('2026-10-11T04:00:00Z'), actor: null },
  ])
  db.appointmentReschedule.count.mockResolvedValue(0)
  db.shipmentEvidence.count.mockResolvedValue(0)
  svc.getOrdersByShop.mockResolvedValue([RAW()])
  svc.getOrderForShop.mockResolvedValue(RAW())
  svc.getReceiptNoForOrder.mockResolvedValue(null)
  svc.getShipmentPanel.mockResolvedValue(null)
  svc.getActiveReturnForTimeline.mockResolvedValue(null)
  svc.getCustomerSummary.mockResolvedValue({ orderCount: 4, sinceISO: '2026-01-01T00:00:00Z' })
  svc.resolveExpenseAccess.mockResolvedValue({ kind: 'DENIED' })
  svc.getReturnAdjustments.mockResolvedValue(new Map())
  svc.getConnection.mockResolvedValue({ connected: false })
})

describe('หน้ารายการออเดอร์ (/orders)', () => {
  it('TECHNICIAN: OrdersList ได้ showMoney=false · orders ไม่มีคีย์เงินทุกชั้น · ไม่ดึงแถวเงิน/ประวัติลูกค้า', async () => {
    asRole(['TECHNICIAN'])
    const tree = await OrdersPage({ searchParams: Promise.resolve({}) })
    const list = find(tree as ReactNode, 'OrdersList')!
    expect(list.props.showMoney).toBe(false)
    expect(moneyKeysIn(tree)).toEqual([])
    const [row] = list.props.orders as Record<string, unknown>[]
    expect(row).toMatchObject({ buyerName: 'สมชาย', buyerPhone: '0812345678', conversationId: null, customerStats: null })
    expect('total' in row || 'paymentMethod' in row || 'money' in row || 'editLocked' in row || 'codReceivedAtISO' in row).toBe(false)
    expect((row.items as Record<string, unknown>[])[0]).not.toHaveProperty('price')
    expect(svc.getOrdersByShop).toHaveBeenCalledWith(SHOP, undefined, { withPayments: false })
    expect(db.order.groupBy).not.toHaveBeenCalled()
    // ทักแชทต้องมี H1 — ช่างไม่ต้องหาห้อง
    expect(db.conversation.findMany).not.toHaveBeenCalled()
  })

  it('สถานะพัสดุไม่เล่าเรื่องเงิน: ใบ COD ส่งถึงแล้ว — ช่างไม่ได้กอง "รอเงิน COD" (AWAITING_COD) แต่ผู้ดูแลได้', async () => {
    const codDelivered = () => ({
      ...RAW(), status: 'SHIPPED', paymentMethod: 'COD', codReceivedAt: null,
      shipments: [{ ...RAW().shipments[0], carrierStatus: 'delivered' }],
    })
    svc.getOrdersByShop.mockResolvedValue([codDelivered()])
    asRole(['TECHNICIAN'], 'ONLINE_SALES')
    const tech = find((await OrdersPage({ searchParams: Promise.resolve({}) })) as ReactNode, 'OrdersList')!
    expect((tech.props.orders as { shippingStage?: string }[])[0].shippingStage).not.toBe('AWAITING_COD')

    asRole(['MANAGER'], 'ONLINE_SALES')
    const mgr = find((await OrdersPage({ searchParams: Promise.resolve({}) })) as ReactNode, 'OrdersList')!
    expect((mgr.props.orders as { shippingStage?: string }[])[0].shippingStage).toBe('AWAITING_COD')
  })

  it('MANAGER: showMoney=true และแถวมียอด/วิธีชำระ/ราคาต่อหน่วยเหมือนเดิม', async () => {
    asRole(['MANAGER'])
    const tree = await OrdersPage({ searchParams: Promise.resolve({}) })
    const list = find(tree as ReactNode, 'OrdersList')!
    expect(list.props.showMoney).toBe(true)
    const [row] = list.props.orders as Record<string, any>[]
    expect(row).toMatchObject({ total: 900, paymentMethod: 'COD', conversationId: 'conv-1' })
    expect(row.items[0].price).toBe(900)
    expect(svc.getOrdersByShop).toHaveBeenCalledWith(SHOP, undefined, { withPayments: true })
  })

  it('TECHNICIAN+CHAT = PER_ORDER: เห็นเงิน (union ของบทบาท) และทักแชทได้', async () => {
    asRole(['TECHNICIAN', 'CHAT'])
    const tree = await OrdersPage({ searchParams: Promise.resolve({}) })
    const list = find(tree as ReactNode, 'OrdersList')!
    expect(list.props.showMoney).toBe(true)
    expect((list.props.orders as Record<string, unknown>[])[0].total).toBe(900)
  })
})

describe('หน้ารายละเอียดออเดอร์ (/orders/[token])', () => {
  const run = () => OrderDetailPage({ params: Promise.resolve({ token: 'tok-1' }) })

  it('TECHNICIAN: ได้หน้าของช่าง ส่งเฉพาะ allow-list · ไม่แตะโค้ดเงิน/กำไร/ใบเสร็จ/พัสดุ', async () => {
    asRole(['TECHNICIAN'])
    const tree = await run()
    const tech = find(tree as ReactNode, 'TechnicianOrderDetail')!
    expect(tech).toBeTruthy()
    expect(find(tree as ReactNode, 'OrderDetailClient')).toBeUndefined()
    expect(moneyKeysIn(tree)).toEqual([])
    expect(svc.getReceiptNoForOrder).not.toHaveBeenCalled()
    expect(svc.getShipmentPanel).not.toHaveBeenCalled()
    expect(svc.resolveExpenseAccess).not.toHaveBeenCalled()
    expect(svc.getCustomerSummary).not.toHaveBeenCalled()
  })

  it('TECHNICIAN: จอที่ประกอบแล้ว — ลูกค้าไม่มีโปรไฟล์/ยอดสั่ง · สรุปไม่มีราคา · ไทม์ไลน์ไม่มีเหตุการณ์เงิน · ไม่มีส่งสรุปนัด/เลื่อนนัด', async () => {
    asRole(['TECHNICIAN'])
    const page = await run()
    const props = find(page as ReactNode, 'TechnicianOrderDetail')!.props as Parameters<typeof TechnicianOrderDetail>[0]
    const tree = await TechnicianOrderDetail(props)
    expect(moneyKeysIn(tree)).toEqual([])

    const summary = find(tree as ReactNode, 'OrderSummary')!
    expect(summary.props.showMoney).toBeUndefined() // ค่าตั้งต้นของ OrderSummary = false
    expect(summary.props.items).toEqual([{ id: 'i1', name: 'ตัดผม', description: null, qty: 1, imageUrl: null }])
    expect(summary.props.internalNote).toBe('ตัดสั้น')

    const cust = find(tree as ReactNode, 'CustomerDetails')!
    expect(cust.props.summary).toBeNull()
    expect(cust.props.profileKey).toBeNull()
    expect(cust.props.buyer).toMatchObject({ buyerContact: '0812345678', buyerName: 'สมชาย' })

    const events = find(tree as ReactNode, 'ShippingActivity')!.props.events as { type: string }[]
    expect(events.map((e) => e.type)).toEqual(['ORDER_CREATED'])

    const appt = find(tree as ReactNode, 'AppointmentCard')!
    expect(appt.props).toMatchObject({ canOutcome: true, canReschedule: false, canSendSummary: false })
  })

  it('MANAGER: ยังได้หน้าเต็ม (OrderDetailClient พร้อมยอด) ไม่ใช่หน้าของช่าง', async () => {
    asRole(['MANAGER'])
    const tree = await run()
    expect(find(tree as ReactNode, 'TechnicianOrderDetail')).toBeUndefined()
    const client = find(tree as ReactNode, 'OrderDetailClient')!
    expect(client.props.totalAmount).toBe(900)
    expect(svc.getReceiptNoForOrder).toHaveBeenCalled()
  })
})
