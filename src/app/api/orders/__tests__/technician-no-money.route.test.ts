/**
 * ช่าง (TECHNICIAN = ระดับเงิน NONE) ต้องไม่ได้รับเงินจาก route ใด ๆ ของออเดอร์/นัด — 00071 P3 · S-15
 * (docs/conventions/permission-gate-follows-the-row.md ข้อ 4: เทสที่ไล่คีย์ของ payload จริง ไม่ใช่แค่ดูว่ามีตัวตัดสินในไฟล์)
 *
 * 🛑 ไม่ mock ด่านสิทธิ์/ shop-context / shop-permissions — เดินตัวจริงด้วย session ของแต่ละบทบาท (mock แค่ prisma และ service ที่ดึงนัด)
 * mutation ที่ต้องแดง: (1) ข้าม toNoMoneyOrder ที่ GET /api/orders (2) ข้ามที่ GET /api/orders/[token] (3) ข้าม toNoMoneyAppointmentDay
 * (4) ข้าม canChat ที่ appointment-summary (5) เติม 'totalAmount' ลง NO_MONEY_ORDER_KEYS
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

const db = vi.hoisted(() => ({
  shop: { findUnique: vi.fn() },
  shopMember: { findUnique: vi.fn() },
  order: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
  conversation: { findMany: vi.fn() },
  chatMessage: { findFirst: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const appt = vi.hoisted(() => ({ listAppointmentsForDay: vi.fn(), listAppointments: vi.fn(), setAppointmentOutcome: vi.fn() }))
vi.mock('@/services/appointment.service', async (orig) => ({
  ...(await orig<object>()),
  listAppointmentsForDay: appt.listAppointmentsForDay,
  listAppointments: appt.listAppointments,
  setAppointmentOutcome: appt.setAppointmentOutcome,
}))

import { getServerSession } from 'next-auth'
import { GET as listOrders } from '../route'
import { GET as getOrder } from '../[token]/route'
import { GET as summaryGet } from '../[token]/appointment-summary/route'
import { GET as dayGet } from '@/app/api/shops/current/appointments/day/route'
import { GET as monthGet } from '@/app/api/shops/current/appointments/route'
import { GET as customersGet } from '../customers/route'
import { POST as outcomePost } from '../[token]/appointment/outcome/route'
import { NO_MONEY_FORBIDDEN_KEYS, NO_MONEY_ORDER_KEYS } from '@/lib/order-view-by-level'

const SHOP = '11111111-1111-4111-8111-111111111111'
const params = { params: Promise.resolve({ token: 'tok-1' }) }

function asRole(roles: string[], vertical = 'SERVICE_QUEUE') {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1', activeShopId: SHOP } } as never)
  const shopRow = {
    id: SHOP, userId: 'owner-x', kind: 'BUSINESS', vertical, deletedAt: null, packageLockedAt: null, packageLockReason: null,
    payoutBankCode: null, payoutAccountNo: null, payoutAccountName: null, payoutPromptPayId: null,
    members: [{ role: 'ADMIN', roles }],
  }
  db.shop.findUnique.mockResolvedValue(shopRow)
  db.shopMember.findUnique.mockResolvedValue({ role: 'ADMIN', roles })
}

/** ไล่คีย์ทุกชั้น — เจอคีย์เงินต้องห้ามที่ใด = payload รั่ว */
function moneyKeysIn(v: unknown, path = '$', out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x, i) => moneyKeysIn(x, `${path}[${i}]`, out))
  else if (v && typeof v === 'object' && !(v instanceof Date)) {
    for (const [k, x] of Object.entries(v)) {
      if (NO_MONEY_FORBIDDEN_KEYS.includes(k)) out.push(`${path}.${k}`)
      moneyKeysIn(x, `${path}.${k}`, out)
    }
  }
  return out
}

const req = (url: string) => new NextRequest(`http://seller.deepth.local${url}`)

/** แถวออเดอร์จาก prisma (include เต็ม) ที่มีเงินทุกชั้น + คอลัมน์ใหม่ที่ยังไม่มีใครรู้จัก */
const RAW = () => ({
  id: 'o1', publicToken: 'tok-1', orderNo: 'DP1', shortCode: 'ab', status: 'PENDING', type: 'SERVICE',
  createdAt: new Date('2026-10-10T03:00:00Z'), salesChannel: 'LINE', fulfillmentMode: 'SHIPPED',
  buyerName: 'สมชาย', buyerContact: '0812345678', buyerUserId: null, customerId: 'c1', conversationId: 'conv-1',
  auctionId: null, internalNote: 'ตัดสั้น', shippingAddress: null,
  serviceStart: new Date('2026-10-12T03:00:00Z'), serviceEnd: new Date('2026-10-12T04:00:00Z'), serviceResourceId: 'r1',
  appointmentStatus: 'SCHEDULED', rescheduleRequestNote: null,
  totalAmount: '900', discount: '10', vatRate: '0.07', vatAmount: '5', depositAmount: '300', draftStatedTotalAmount: '900',
  paymentMethod: 'COD', paymentConfirmedAt: null, codReceivedAt: null, slipFileId: null, futureMoneyColumn: '7',
  items: [{ id: 'i1', productId: null, name: 'ตัดผม', description: null, qty: 1, price: '900', cost: '100', product: { images: [] } }],
  payments: [{ kind: 'DEPOSIT', amount: '300', voidedAt: null }],
  shipments: [{ id: 's1', trackingNo: 'T1', courierName: 'x', status: 'CREATED', carrierPrice: '40', estimatedPrice: '40', codFee: '5', codAmount: '900' }],
  shipmentTracking: null,
  serviceResource: { id: 'r1', name: 'ช่าง A', capacity: 1 },
  shopChannel: null,
  buyer: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  db.order.findMany.mockResolvedValue([RAW()])
  db.order.findFirst.mockResolvedValue(RAW())
})

describe('GET /api/orders — รายการ', () => {
  it('TECHNICIAN: ไม่มีคีย์เงินที่ความลึกใดก็ตาม และทุกคีย์ระดับใบอยู่ใน allow-list', async () => {
    asRole(['TECHNICIAN'])
    const res = await listOrders(req('/api/orders'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(moneyKeysIn(body)).toEqual([])
    // allow-list: เติมคอลัมน์ใหม่ลง DAL แล้วต้องไม่ไหลออก (futureMoneyColumn)
    for (const o of body) for (const k of Object.keys(o)) expect([...NO_MONEY_ORDER_KEYS, 'items', 'shipments', 'shipmentTracking', 'serviceResource', 'shopChannel', 'buyer']).toContain(k)
    expect(body[0]).toMatchObject({ buyerName: 'สมชาย', buyerContact: '0812345678', internalNote: 'ตัดสั้น' })
  })

  it('MANAGER: payload ไม่เปลี่ยน (ยังมียอด/ราคา/การชำระ)', async () => {
    asRole(['MANAGER'])
    const body = await (await listOrders(req('/api/orders'))).json()
    expect(body[0]).toMatchObject({ totalAmount: '900', paymentMethod: 'COD' })
    expect(body[0].items[0].price).toBe('900')
  })

  it('TECHNICIAN+CHAT = PER_ORDER: เงินยังอยู่ (ระดับเงินคือ union ของทุกบทบาท)', async () => {
    asRole(['TECHNICIAN', 'CHAT'])
    const body = await (await listOrders(req('/api/orders'))).json()
    expect(body[0].totalAmount).toBe('900')
  })
})

describe('GET /api/orders/[token] — ข้อมูลหน้าแก้ไข', () => {
  it('TECHNICIAN: ไม่มีคีย์เงิน', async () => {
    asRole(['TECHNICIAN'])
    const res = await getOrder(req('/api/orders/tok-1'), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(moneyKeysIn(body)).toEqual([])
    expect(body.publicToken).toBe('tok-1')
  })

  it('MANAGER: รูปเดิมที่ฟอร์มแก้ไขใช้ (มี discount/paymentMethod/items.price)', async () => {
    asRole(['MANAGER'])
    const body = await (await getOrder(req('/api/orders/tok-1'), params)).json()
    expect(body.token).toBe('tok-1')
    expect(body).toHaveProperty('paymentMethod')
    expect(body.items[0]).toHaveProperty('price')
  })
})

const DAY_ITEM = () => ({
  orderToken: 'tok-1', orderNo: 'DP1', createdAt: new Date('2026-10-10T03:00:00Z'),
  start: new Date('2026-10-12T03:00:00Z'), end: new Date('2026-10-12T04:00:00Z'), appointmentStatus: 'SCHEDULED',
  buyerName: 'สมชาย', buyerContact: '0812345678', resource: { id: 'r1', name: 'ช่าง A', capacity: 1 },
  source: null, salesChannel: 'LINE', customerAvatarUrl: null, conversationId: 'conv-1', firstItemName: 'ตัดผม', itemCount: 1,
  totalAmount: '900', depositAmount: '300',
})

describe('GET /api/shops/current/appointments/day — คิวรายวัน', () => {
  beforeEach(() => appt.listAppointmentsForDay.mockResolvedValue([DAY_ITEM()]))

  it('TECHNICIAN: ไม่มียอด/มัดจำ และไม่มีห้องแชท (ไม่มี H1)', async () => {
    asRole(['TECHNICIAN'])
    const res = await dayGet(req('/api/shops/current/appointments/day?date=2026-10-12'))
    expect(res.status).toBe(200)
    const { items } = await res.json()
    expect(moneyKeysIn(items)).toEqual([])
    expect(items[0].conversationId).toBeNull()
    expect(items[0]).toMatchObject({ buyerName: 'สมชาย', buyerContact: '0812345678', firstItemName: 'ตัดผม' })
  })

  it('MANAGER: ยอด/มัดจำ/ห้องแชทคงเดิม', async () => {
    asRole(['MANAGER'])
    const { items } = await (await dayGet(req('/api/shops/current/appointments/day?date=2026-10-12'))).json()
    expect(items[0]).toMatchObject({ totalAmount: '900', depositAmount: '300', conversationId: 'conv-1' })
  })

  it('TECHNICIAN+CHAT: เงินและแชทอยู่', async () => {
    asRole(['TECHNICIAN', 'CHAT'])
    const { items } = await (await dayGet(req('/api/shops/current/appointments/day?date=2026-10-12'))).json()
    expect(items[0]).toMatchObject({ totalAmount: '900', conversationId: 'conv-1' })
  })
})

describe('GET /api/shops/current/appointments — ปฏิทินเดือน', () => {
  it('TECHNICIAN: payload ไม่มีเงิน (ไม่เคยมี — ล็อกไว้ไม่ให้ใครเติมทีหลัง)', async () => {
    asRole(['TECHNICIAN'])
    appt.listAppointments.mockResolvedValue([
      { orderToken: 't', orderNo: 'DP1', resource: { id: 'r1', name: 'A', capacity: 1 }, start: new Date(), end: new Date(), appointmentStatus: 'SCHEDULED', buyerName: 'a' },
    ])
    const res = await monthGet(req('/api/shops/current/appointments?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z'))
    expect(res.status).toBe(200)
    expect(moneyKeysIn(await res.json())).toEqual([])
  })
})

describe('GET /api/orders/[token]/appointment-summary', () => {
  const ORDER = () => ({
    shopId: SHOP, customerId: 'c1', conversationId: 'conv-1',
    serviceStart: new Date('2026-10-12T03:00:00Z'), serviceEnd: new Date('2026-10-12T04:00:00Z'), appointmentStatus: 'SCHEDULED',
    buyerName: 'สมชาย', buyerContact: '0812345678', totalAmount: '900', depositAmount: '300',
    items: [{ name: 'ตัดผม' }], serviceResource: { name: 'ช่าง A' }, shop: { kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' },
    customer: { userId: null },
  })
  beforeEach(() => {
    db.order.findUnique.mockResolvedValue(ORDER())
    db.conversation.findMany.mockResolvedValue([{ id: 'conv-1', channel: 'FACEBOOK', externalContact: { name: 'n' }, shopChannel: { name: 'p' } }])
    db.chatMessage.findFirst.mockResolvedValue(null)
  })

  it('TECHNICIAN (ไม่มี H1): ไม่มี totalText/depositText และไม่มีห้องแชทให้ส่ง', async () => {
    asRole(['TECHNICIAN'])
    const res = await summaryGet(req('/api/orders/tok-1/appointment-summary'), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(moneyKeysIn(body)).toEqual([])
    expect(body.targets).toEqual([])
    expect(body.data.serviceName).toBe('ตัดผม')
  })

  it('CHAT (มี H1): สรุปเต็ม + ห้องแชท', async () => {
    asRole(['CHAT'])
    const body = await (await summaryGet(req('/api/orders/tok-1/appointment-summary'), params)).json()
    expect(body.data.totalText).toBeTruthy()
    expect(body.targets).toHaveLength(1)
  })

  it('TECHNICIAN+CHAT: ได้ครบ (ระดับเงิน PER_ORDER)', async () => {
    asRole(['TECHNICIAN', 'CHAT'])
    const body = await (await summaryGet(req('/api/orders/tok-1/appointment-summary'), params)).json()
    expect(body.data.totalText).toBeTruthy()
  })
})

describe('ของที่ช่างต้องไม่ได้ / ต้องได้', () => {
  it('GET /api/orders/customers — TECHNICIAN ไม่มี C1 → 403 FORBIDDEN_ROLE', async () => {
    asRole(['TECHNICIAN'])
    const res = await customersGet(req('/api/orders/customers?q=0812'))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
  })

  it('POST appointment/outcome — TECHNICIAN (O4) ปิดผลนัดได้ → 200', async () => {
    asRole(['TECHNICIAN'])
    appt.setAppointmentOutcome.mockResolvedValue({ appointmentStatus: 'COMPLETED' })
    const res = await outcomePost(
      new NextRequest('http://seller.deepth.local/api/orders/tok-1/appointment/outcome', { method: 'POST', body: JSON.stringify({ outcome: 'COMPLETED' }) }),
      params,
    )
    expect(res.status).toBe(200)
  })
})
