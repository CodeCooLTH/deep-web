/**
 * 00071 P3 T9 — สัญญาระดับฟิลด์ของบทบาท (runtime contract) บน Postgres จริง
 *
 * ทำไมต้องมี: ด่านที่ "มีอยู่ในไฟล์" ≠ ด่านที่ "คีย์ต้องห้ามไม่โผล่ใน JSON จริง" (permission-gate-follows-the-row)
 * เทสนี้เรียก route handler จริง ด้วย session ของแต่ละบทบาท แล้วไล่คีย์ใน payload ทุกชั้น
 *
 * รันกับ local Docker Postgres (5434) เท่านั้น — ปักหมุด URL ในคำสั่งตรง ๆ (HR13/HR14):
 *   npx dotenv -e .env -- env DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" \
 *     DIRECT_URL="postgresql://safepay:safepay@localhost:5434/safepay" \
 *     npx vitest run tests/integration/role-contract.test.ts
 * ข้อมูลที่เทสสร้างลบด้วย id ที่บันทึกไว้เท่านั้น — ไม่มี deleteMany ที่ไม่ scope
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'

// ── ด่าน DB: ต้องเป็น localhost:5434 เท่านั้น ไม่งั้นหยุดทั้งไฟล์ก่อน import prisma ──
function resolveDbUrl(): string {
  let url = process.env.DATABASE_URL ?? ''
  if (!url) {
    try {
      const m = readFileSync('.env.local', 'utf8').match(/^DATABASE_URL="?([^"\n]+)"?/m)
      url = m?.[1] ?? ''
    } catch { /* ไม่มีไฟล์ */ }
  }
  if (!url.includes('@localhost:5434/')) {
    throw new Error('[role-contract] DATABASE_URL ต้องชี้ @localhost:5434/ เท่านั้น (HR13/HR14) — ยกเลิก')
  }
  process.env.DATABASE_URL = url
  return url
}
resolveDbUrl()

// session ของบทบาทที่กำลังยิง — mock ที่ next-auth ที่เดียว (ทุก route เรียก getServerSession)
const sess = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => sess.current) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
// push: ดักผู้รับ/payload แทนการยิง Expo จริง
const pushed = vi.hoisted(() => ({ calls: [] as { userIds: string[]; title: string; body: string; data?: unknown }[] }))
vi.mock('@/services/app-push.service', () => ({
  pushToUsers: vi.fn(async (userIds: string[], title: string, body: string, data?: unknown) => {
    pushed.calls.push({ userIds, title, body, data })
  }),
  pushToUser: vi.fn(),
  pushToUsersWithStatus: vi.fn(async () => 'SENT'),
}))

// `after()` ใช้ไม่ได้นอก request scope ของ Next — ทำเป็น no-op (งานเบื้องหลังไม่เกี่ยวกับคีย์ใน response)
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: () => {} }))

type Role = 'OWNER' | 'MANAGER' | 'CHAT' | 'BILLING' | 'TECHNICIAN'
const ROLES: Role[] = ['OWNER', 'MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN']
const LEVEL: Record<Role, 'FULL' | 'PER_ORDER' | 'NONE'> = {
  OWNER: 'FULL', MANAGER: 'PER_ORDER', CHAT: 'PER_ORDER', BILLING: 'PER_ORDER', TECHNICIAN: 'NONE',
}

// คีย์ต้องห้ามตามระดับเงิน (ชื่อจริงที่พบในโค้ด)
const PER_ORDER_FORBIDDEN = [
  'cost', 'totalSpent', 'lifetimeSpend', 'revenueOrderCount', 'balance', 'walletBalance', 'revenue', 'netProfit', 'profit', 'soldCount',
]
const NONE_FORBIDDEN = [
  ...PER_ORDER_FORBIDDEN,
  'price', 'totalAmount', 'amount', 'discount', 'vatAmount', 'vatRate', 'depositAmount', 'unitPrice', 'codAmount',
  'carrierPrice', 'codFee', 'refundAmount', 'shippingCost', 'payments',
]

/** รวมคีย์ทุกชั้น (ชื่อคีย์เท่านั้น ไม่ใช่ค่า) */
function allKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out))
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) { out.add(k); allKeys(x, out) }
  }
  return out
}
/**
 * คีย์ที่ตัดด้วย "null" โดยการออกแบบ (agent-revenue-redact D-3 · ai-quota F3: balance:null) —
 * ยอมรับเมื่อค่า = null เท่านั้น · ค่าจริงโผล่ = รั่ว
 */
const NULL_MEANS_REDACTED = new Set(['revenue', 'balance'])
function valuesOf(v: unknown, key: string, out: unknown[] = []): unknown[] {
  if (Array.isArray(v)) v.forEach((x) => valuesOf(x, key, out))
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) { if (k === key) out.push(x); valuesOf(x, key, out) }
  }
  return out
}
const forbiddenIn = (body: unknown, list: readonly string[]) =>
  list.filter((k) => allKeys(body).has(k) && !(NULL_MEANS_REDACTED.has(k) && valuesOf(body, k).every((x) => x === null)))

// ── ข้อมูลที่เทสสร้าง ──
type Ctx = {
  userIds: Record<Role, string>
  buyerId: string
  shop1: string
  shop2: string
  token: string
  token2: string
  product2Id: string
  orderId: string
  apptToken: string
  apptDate: string
  productId: string
  convId: string
  customerId: string
  resourceId: string
  pubUsername: string
  pubShopId: string
}
let ctx: Ctx
const created = { userIds: [] as string[], shopIds: [] as string[], customerIds: [] as string[], convIds: [] as string[] }
let prisma: typeof import('@/lib/prisma').prisma
let seq = 0

const sessionOf = (userId: string, shopId: string) => ({ user: { id: userId, activeShopId: shopId } })

async function seed(): Promise<Ctx> {
  const n = `${Date.now()}${seq++}`.slice(-8)
  const mkUser = async (tag: string) => {
    const u = await prisma.user.create({ data: { phone: `09${tag}${n}`.slice(0, 10), displayName: `rc ${tag}`, username: `rc${tag}${n}` } })
    created.userIds.push(u.id)
    return u
  }
  const owner = await mkUser('1'); const mgr = await mkUser('2'); const chat = await mkUser('3')
  const bill = await mkUser('4'); const tech = await mkUser('5'); const buyer = await mkUser('6'); const pub = await mkUser('7')

  const mkShop = async (userId: string, vertical: string, kind = 'BUSINESS') => {
    const s = await prisma.shop.create({ data: { userId, shopName: `RC ${vertical} ${n}`, businessType: 'INDIVIDUAL', kind, vertical } })
    created.shopIds.push(s.id)
    return s
  }
  const shop1 = await mkShop(owner.id, 'SERVICE_QUEUE')
  const shop2 = await mkShop(owner.id, 'ONLINE_SALES')
  const pubShop = await mkShop(pub.id, 'ONLINE_SALES', 'PERSONAL')

  const members: [string, string, string[]][] = [
    [owner.id, 'OWNER', []], [mgr.id, 'ADMIN', ['MANAGER']], [chat.id, 'ADMIN', ['CHAT']],
    [bill.id, 'ADMIN', ['BILLING']], [tech.id, 'ADMIN', ['TECHNICIAN']],
  ]
  for (const shopId of [shop1.id, shop2.id]) {
    for (const [userId, role, roles] of members) await prisma.shopMember.create({ data: { shopId, userId, role, roles } })
  }

  const cust = await prisma.customer.create({ data: { phone: `08${n}` } })
  created.customerIds.push(cust.id)

  const prodSvc = await prisma.product.create({ data: { shopId: shop1.id, name: 'บริการ RC', price: 500, cost: 123, type: 'SERVICE', stockQty: null } })
  await prisma.product.create({ data: { shopId: shop1.id, name: 'สินค้า RC', price: 300, cost: 77, type: 'PHYSICAL', stockQty: 5 } })
  const resource = await prisma.serviceResource.create({ data: { shopId: shop1.id, name: 'ช่อง RC', capacity: 1, depositValue: 50 } })

  const conv = await prisma.conversation.create({ data: { shopId: shop1.id, buyerUserId: buyer.id, channel: 'DEEP' } })
  created.convIds.push(conv.id)
  await prisma.chatMessage.create({ data: { conversationId: conv.id, senderUserId: buyer.id, senderRole: 'BUYER', body: 'สวัสดี' } })

  // ออเดอร์สินค้า: ต้นทุน 40/บรรทัด · ชำระ · พัสดุ
  const order = await prisma.order.create({
    data: {
      shopId: shop1.id, buyerUserId: buyer.id, customerId: cust.id, conversationId: conv.id, type: 'PHYSICAL', status: 'CONFIRMED',
      totalAmount: 1234, discount: 10, vatAmount: 5, depositAmount: 100, buyerName: 'ลูกค้า RC', buyerContact: `08${n}`,
      paymentMethod: 'TRANSFER', paymentConfirmedAt: new Date(), buyerConfirmedAt: new Date(),
      items: { create: [{ productId: prodSvc.id, name: 'รายการ A', qty: 2, price: 600, cost: 40 }] },
      shipmentTracking: { create: { provider: 'KERRY', trackingNo: `RC${n}` } },
    },
  })
  await prisma.orderPayment.create({ data: { orderId: order.id, shopId: shop1.id, kind: 'DEPOSIT', amount: 100, receivedByUserId: owner.id } })
  await prisma.orderShipment.create({
    data: { orderId: order.id, shopId: shop1.id, idempotencyKey: `rc-${n}`, trackingNo: `RC${n}`, codAmount: 321, carrierPrice: 45, codFee: 9, estimatedPrice: 50 },
  })

  // นัดหมาย (ใบบริการ) วันที่คงที่
  const apptDate = '2030-01-15'
  const appt = await prisma.order.create({
    data: {
      shopId: shop1.id, buyerUserId: buyer.id, customerId: cust.id, type: 'SERVICE', status: 'CONFIRMED', fulfillmentMode: 'NO_SHIPPING',
      totalAmount: 900, depositAmount: 200, buyerName: 'ลูกค้านัด RC', buyerContact: `08${n}`,
      serviceResourceId: resource.id, serviceSeat: 1, serviceStart: new Date('2030-01-15T03:00:00Z'), serviceEnd: new Date('2030-01-15T04:00:00Z'),
      appointmentStatus: 'SCHEDULED',
      items: { create: [{ productId: prodSvc.id, name: 'งานบริการ', qty: 1, price: 900, cost: 300 }] },
    },
  })

  // shop2 (ONLINE_SALES): สินค้า/ออเดอร์/สิทธิ์คลัง สำหรับ inventory + iShip
  const prod2 = await prisma.product.create({ data: { shopId: shop2.id, name: 'สินค้า shop2', price: 80, cost: 66, type: 'PHYSICAL', stockQty: 9 } })
  const order2 = await prisma.order.create({
    data: {
      shopId: shop2.id, type: 'PHYSICAL', status: 'CONFIRMED', totalAmount: 160, buyerName: 'ลูกค้า2', buyerContact: `08${n}`,
      items: { create: [{ name: 'ของ shop2', qty: 2, price: 80, cost: 66 }] },
    },
  })
  await prisma.inventoryEntitlement.create({
    data: { shopId: shop2.id, package: 'PRO', activatedAt: new Date(), currentPeriodStart: new Date(), nextRenewalAt: new Date(Date.now() + 30 * 86400000) },
  })
  await prisma.stockMovement.create({ data: { shopId: shop2.id, productName: 'สินค้า shop2', delta: -1, resultingQty: 8, source: 'MANUAL_ADJUST' } })

  await prisma.sellerWallet.create({ data: { shopId: shop1.id, balance: 777 } })
  await prisma.expense.create({ data: { shopId: shop1.id, category: 'RENT', amount: 4321, expenseDate: new Date(), createdByUserId: owner.id } })
  await prisma.stockMovement.create({ data: { shopId: shop1.id, productName: 'สินค้า RC', delta: -1, resultingQty: 4, source: 'MANUAL_ADJUST' } })
  await prisma.customerFollowUp.create({ data: { shopId: shop1.id, conversationId: conv.id, title: 'ตามงาน', dueAt: new Date(Date.now() + 86400000) } })

  // สาธารณะ: ร้านส่วนตัว + ออเดอร์ที่ยืนยัน + รีวิวที่มีเบอร์ผู้รีวิว
  await prisma.product.create({ data: { shopId: pubShop.id, name: 'สินค้าสาธารณะ', price: 99, cost: 11, type: 'PHYSICAL' } })
  const pubOrder = await prisma.order.create({
    data: {
      shopId: pubShop.id, type: 'PHYSICAL', status: 'CONFIRMED', totalAmount: 99, buyerContact: `08${n}`, buyerConfirmedAt: new Date(),
      items: { create: [{ name: 'สินค้าสาธารณะ', qty: 1, price: 99, cost: 11 }] },
    },
  })
  await prisma.review.create({ data: { orderId: pubOrder.id, reviewerContact: `0877${n}`, rating: 5, comment: 'ดีมาก' } })

  return {
    userIds: { OWNER: owner.id, MANAGER: mgr.id, CHAT: chat.id, BILLING: bill.id, TECHNICIAN: tech.id },
    buyerId: buyer.id, shop1: shop1.id, shop2: shop2.id, token: order.publicToken, token2: order2.publicToken, product2Id: prod2.id, orderId: order.id,
    apptToken: appt.publicToken, apptDate, productId: prodSvc.id, convId: conv.id, customerId: cust.id,
    resourceId: resource.id, pubUsername: pub.username, pubShopId: pubShop.id,
  }
}

/** ลบเฉพาะแถวที่เทสสร้าง — scope ด้วย id ทุกคำสั่ง ลูกก่อนแม่ */
async function cleanup() {
  const shopIds = created.shopIds
  if (shopIds.length) {
    const orderIds = (await prisma.order.findMany({ where: { shopId: { in: shopIds } }, select: { id: true } })).map((o) => o.id)
    if (orderIds.length) {
      await prisma.review.deleteMany({ where: { orderId: { in: orderIds } } })
      await prisma.orderPayment.deleteMany({ where: { orderId: { in: orderIds } } })
      await prisma.orderShipment.deleteMany({ where: { orderId: { in: orderIds } } })
      await prisma.shipmentTracking.deleteMany({ where: { orderId: { in: orderIds } } })
      await prisma.orderEvent.deleteMany({ where: { orderId: { in: orderIds } } })
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    }
    await prisma.customerFollowUp.deleteMany({ where: { shopId: { in: shopIds } } })
    if (created.convIds.length) {
      await prisma.chatMessage.deleteMany({ where: { conversationId: { in: created.convIds } } })
      await prisma.conversation.deleteMany({ where: { id: { in: created.convIds } } })
    }
    await prisma.stockMovement.deleteMany({ where: { shopId: { in: shopIds } } })
    await prisma.inventoryEntitlement.deleteMany({ where: { shopId: { in: shopIds } } })
    await prisma.expense.deleteMany({ where: { shopId: { in: shopIds } } })
    await prisma.sellerWallet.deleteMany({ where: { shopId: { in: shopIds } } })
    await prisma.serviceResource.deleteMany({ where: { shopId: { in: shopIds } } })
    await prisma.product.deleteMany({ where: { shopId: { in: shopIds } } })
    await prisma.shopMember.deleteMany({ where: { shopId: { in: shopIds } } })
    await prisma.shop.deleteMany({ where: { id: { in: shopIds } } })
  }
  if (created.customerIds.length) await prisma.customer.deleteMany({ where: { id: { in: created.customerIds } } })
  if (created.userIds.length) await prisma.user.deleteMany({ where: { id: { in: created.userIds } } })
}

// ── ตาราง route ──
type RouteMod = { GET: (req: NextRequest, c?: { params: Promise<Record<string, string>> }) => Promise<Response> }
type Entry = {
  /** key ในทะเบียน route-capabilities */
  key: string
  name: string
  load: () => Promise<unknown>
  url: (c: Ctx) => string
  params?: (c: Ctx) => Record<string, string>
  /** true = ผลเป็น text (CSV) */
  text?: boolean
  /** ชุดบทบาทที่ route นี้ "ไม่ใช้ cap ของทะเบียน" (เช่น buyer) — ไม่ใช้ในลูปบทบาท */
  /** override cap ที่คาดหวัง (เมื่อทะเบียนยัง PENDING / ตัดสินต่อใบ) */
  caps?: string | string[]
  /** ร้านที่ใช้ยิง (ค่าตั้งต้น shop1 = SERVICE_QUEUE) — shop2 = ONLINE_SALES สำหรับ inventory/iShip */
  shop?: 'shop1' | 'shop2'
  /** สถานะที่ถือว่า "ผ่านด่านแล้ว" (ค่าตั้งต้น [200]) — iShip ตอบ 404 เหตุผลเมื่อร้านเทสไม่มีบัญชีขนส่ง */
  okStatuses?: number[]
  /** true = 403 ของ route นี้ไม่ใช่รูป { error: 'FORBIDDEN_ROLE' } (บันทึกเป็นช่องว่างที่รู้) */
  non403Standard?: string
  /** ช่องว่างที่รู้: บทบาทระดับ PER_ORDER/NONE ที่ยังเห็นคีย์นี้ — เทสยืนยันว่า "ยังรั่วเท่านี้" (แก้แล้วต้องลบรายการ) */
  knownLeaks?: { keys: string[]; why: string }
}
const R = (p: string) => `src/app/api/${p}/route.ts`
const E = (e: Entry): Entry => e

const MATRIX: Entry[] = [
  E({ key: R('orders'), name: 'orders list', load: () => import('@/app/api/orders/route'), url: () => '/api/orders' }),
  E({ key: R('orders/[token]'), name: 'order detail', load: () => import('@/app/api/orders/[token]/route'), url: (c) => `/api/orders/${c.token}`, params: (c) => ({ token: c.token }) }),
  E({ key: R('orders/[token]'), name: 'order detail (appointment)', load: () => import('@/app/api/orders/[token]/route'), url: (c) => `/api/orders/${c.apptToken}`, params: (c) => ({ token: c.apptToken }) }),
  E({ key: R('orders/[token]/payments'), name: 'order payments', load: () => import('@/app/api/orders/[token]/payments/route'), url: (c) => `/api/orders/${c.token}/payments`, params: (c) => ({ token: c.token }) }),
  E({ key: R('orders/[token]/returns'), name: 'order returns', load: () => import('@/app/api/orders/[token]/returns/route'), url: (c) => `/api/orders/${c.token}/returns`, params: (c) => ({ token: c.token }), non403Standard: 'ตอบ { error: "Forbidden" } ธรรมดา ไม่ใช่ FORBIDDEN_ROLE' }),
  E({ key: R('orders/[token]/appointment-summary'), name: 'appointment summary', load: () => import('@/app/api/orders/[token]/appointment-summary/route'), url: (c) => `/api/orders/${c.apptToken}/appointment-summary`, params: (c) => ({ token: c.apptToken }) }),
  E({ key: R('orders/[token]/buyer-reputation'), name: 'buyer reputation', load: () => import('@/app/api/orders/[token]/buyer-reputation/route'), url: (c) => `/api/orders/${c.token}/buyer-reputation`, params: (c) => ({ token: c.token }) }),
  E({ key: R('orders/customers'), name: 'orders customers', load: () => import('@/app/api/orders/customers/route'), url: () => '/api/orders/customers?q=RC' }),
  E({ key: R('products'), name: 'products', load: () => import('@/app/api/products/route'), url: () => '/api/products' }),
  E({ key: R('products'), name: 'products sort=best', load: () => import('@/app/api/products/route'), url: () => '/api/products?sort=best',
    knownLeaks: { keys: ['soldCount'], why: 'sort=best แนบ soldCount (จำนวนชิ้นที่สั่ง) ให้ทุกผู้ถือ P1 — ProductPickerPanel ใช้แสดง "สั่งซื้อแล้ว X ชิ้น" · spec T9 ระบุเป็นคีย์ต้องห้ามของ PER_ORDER → รอ Controller ตัดสิน' } }),
  E({ key: R('seller/customers/[key]/contact'), name: 'customer contact', load: () => import('@/app/api/seller/customers/[key]/contact/route'), url: (c) => `/api/seller/customers/c-${c.customerId}/contact`, params: (c) => ({ key: `c-${c.customerId}` }) }),
  E({ key: R('shops/current/appointments'), name: 'appointments month', load: () => import('@/app/api/shops/current/appointments/route'), url: () => '/api/shops/current/appointments?from=2030-01-01T00:00:00Z&to=2030-02-01T00:00:00Z' }),
  E({ key: R('shops/current/appointments/day'), name: 'appointments day', load: () => import('@/app/api/shops/current/appointments/day/route'), url: (c) => `/api/shops/current/appointments/day?date=${c.apptDate}` }),
  E({ key: R('shops/current/service-resources'), name: 'service resources', load: () => import('@/app/api/shops/current/service-resources/route'), url: () => '/api/shops/current/service-resources' }),
  E({ key: R('wallet'), name: 'wallet', load: () => import('@/app/api/wallet/route'), url: () => '/api/wallet' }),
  E({ key: R('expenses'), name: 'expenses', load: () => import('@/app/api/expenses/route'), url: () => '/api/expenses' }),
  E({ key: R('expenses/report'), name: 'expenses report', load: () => import('@/app/api/expenses/report/route'), url: () => '/api/expenses/report?range=month' }),
  E({ key: R('finance/receivables'), name: 'receivables', load: () => import('@/app/api/finance/receivables/route'), url: () => '/api/finance/receivables' }),
  E({ key: R('seller/sales-series'), name: 'sales series', load: () => import('@/app/api/seller/sales-series/route'), url: () => '/api/seller/sales-series?mode=monthly&year=2030' }),
  E({ key: R('seller/reports/agents'), name: 'reports agents', load: () => import('@/app/api/seller/reports/agents/route'), url: () => '/api/seller/reports/agents?from=2030-01-01&to=2030-01-31' }),
  E({ key: R('chat/conversations'), name: 'chat conversations', load: () => import('@/app/api/chat/conversations/route'), url: () => '/api/chat/conversations' }),
  E({ key: R('chat/conversations/[id]/messages'), name: 'chat messages', load: () => import('@/app/api/chat/conversations/[id]/messages/route'), url: (c) => `/api/chat/conversations/${c.convId}/messages`, params: (c) => ({ id: c.convId }) }),
  E({ key: R('chat/conversations/[id]/orders'), name: 'chat customer panel orders', load: () => import('@/app/api/chat/conversations/[id]/orders/route'), url: (c) => `/api/chat/conversations/${c.convId}/orders`, params: (c) => ({ id: c.convId }) }),
  E({ key: R('chat/conversations/[id]/crm'), name: 'chat crm', load: () => import('@/app/api/chat/conversations/[id]/crm/route'), url: (c) => `/api/chat/conversations/${c.convId}/crm`, params: (c) => ({ id: c.convId }) }),
  E({ key: R('chat/conversations/[id]/customer-prefill'), name: 'chat customer-prefill', load: () => import('@/app/api/chat/conversations/[id]/customer-prefill/route'), url: (c) => `/api/chat/conversations/${c.convId}/customer-prefill`, params: (c) => ({ id: c.convId }) }),
  E({ key: R('chat/conversations/[id]/follow-ups'), name: 'chat follow-ups', load: () => import('@/app/api/chat/conversations/[id]/follow-ups/route'), url: (c) => `/api/chat/conversations/${c.convId}/follow-ups`, params: (c) => ({ id: c.convId }) }),
  E({ key: R('chat/shop-context'), name: 'chat shop-context', load: () => import('@/app/api/chat/shop-context/route'), url: (c) => `/api/chat/shop-context?shopId=${c.shop1}` }),
  E({ key: R('chat/ai-quota'), name: 'chat ai-quota', load: () => import('@/app/api/chat/ai-quota/route'), url: () => '/api/chat/ai-quota' }),
  E({ key: R('follow-ups/board'), name: 'follow-ups board', load: () => import('@/app/api/follow-ups/board/route'), url: () => '/api/follow-ups/board' }),
  E({ key: R('seller/iship/unlinked'), name: 'iship unlinked', load: () => import('@/app/api/seller/iship/unlinked/route'), url: (c) => `/api/seller/iship/unlinked?shopId=${c.shop2}`, shop: 'shop2', okStatuses: [200, 404, 409], non403Standard: 'iShip ห่อ error เป็น { error: { code, message } }' }),
  E({ key: R('seller/iship/order-context'), name: 'iship order-context', load: () => import('@/app/api/seller/iship/order-context/route'), url: (c) => `/api/seller/iship/order-context?shopId=${c.shop2}&orderToken=${c.token2}`, shop: 'shop2', okStatuses: [200, 404], non403Standard: 'iShip ห่อ error เป็น { error: { code, message } }' }),
  E({ key: R('inventory/movements'), name: 'inventory movements', load: () => import('@/app/api/inventory/movements/route'), url: (c) => `/api/inventory/movements?productId=${c.product2Id}`, shop: 'shop2' }),
  E({ key: R('inventory/csv/export'), name: 'inventory csv export', load: () => import('@/app/api/inventory/csv/export/route'), url: () => '/api/inventory/csv/export', text: true, shop: 'shop2' }),
]

/**
 * GET ในทะเบียนที่ "ไม่อยู่ใน MATRIX" โดยตั้งใจ — ต้องมีเหตุผล (ทะเบียนใหม่ที่ไม่อยู่ทั้งสองที่ = เทสแดง)
 * ใช้คำนำหน้า path (ลงท้าย /) หรือ path เต็ม
 */
const COVERED: Record<string, string> = {
  'src/app/api/shops/auto-reply/': 'ตั้งค่าบอท/กฎตอบอัตโนมัติ (H3) — ไม่มีแถวออเดอร์/เงิน/ต้นทุน · ขอบเขตคือ OWNER+MANAGER (ไม่ใช่ระดับเงิน)',
  'src/app/api/shops/comment-reply/': 'กฎตอบคอมเมนต์ (H3) — config ล้วน ไม่มีเงิน',
  'src/app/api/shops/ai-settings/': 'ตั้งค่า AI ร้าน (H3) — config ล้วน',
  'src/app/api/channels/': 'ช่องทางแชท/ice-breakers/rich-menu (H1/H3) — config ไม่มีเงิน/ต้นทุน',
  'src/app/api/seller/auto-order/': 'ตั้งค่าสร้างออเดอร์อัตโนมัติ (X3) — config + test-thread ไม่มีต้นทุน',
  'src/app/api/seller/auctions/': 'ประมูลผู้ขาย (X1 OWNER+MANAGER) — ราคาเริ่ม/บิดเป็นของประมูล ไม่ใช่ cost/ยอดร้าน',
  'src/app/api/seller/inspection/': 'แผนตรวจสอบร้าน (T4) — เฉพาะเจ้าของหลัก',
  'src/app/api/seller/iship/boxes/': 'ลิสต์กล่อง/ขนส่งของ iShip (S1) — ข้อมูลอ้างอิง ไม่ผูกออเดอร์',
  'src/app/api/seller/iship/couriers/': 'ลิสต์ขนส่ง (S1) — ข้อมูลอ้างอิง',
  'src/app/api/seller/iship/connection/': 'สถานะเชื่อม iShip (S1) — ไม่มีเงิน',
  'src/app/api/seller/iship/settings/': 'ตั้งค่า iShip (S1) — config',
  'src/app/api/seller/iship/shipments/': 'พัสดุรายใบ (label/traces) S1 — ไบนารี/ไทม์ไลน์ขนส่ง ไม่มีต้นทุนสินค้า · ค่าส่งอยู่ที่ order-context (อยู่ใน MATRIX)',
  'src/app/api/seller/iship/unlinked/preview/': 'พรีวิวนำเข้าพัสดุ (S1) — ข้อมูลขนส่งดิบ ไม่ผูกต้นทุน',
  'src/app/api/seller/reports/agents/': 'รายงานแอดมินรายคน — ครอบด้วย agents (อยู่ใน MATRIX) + redactAgent* unit test',
  'src/app/api/chat/comments/': 'กล่องคอมเมนต์ (H1) — ข้อความ/โพสต์ ไม่มีเงิน',
  'src/app/api/chat/conversations/[id]/ai-suggest/': 'สถานะ AI ตอบอัตโนมัติ (H1) — config',
  'src/app/api/chat/conversations/[id]/library/': 'คลังไฟล์ลูกค้า (X2) — ไฟล์/รูป',
  'src/app/api/chat/conversations/[id]/memory/': 'ความจำแชท (H1) — ข้อความสรุป',
  'src/app/api/chat/conversations/[id]/preview/': 'พรีวิวห้องสำหรับ toast (H1) — ข้อความล่าสุด ไม่มีเงิน',
  'src/app/api/chat/groups/': 'กลุ่มห้องแชท (X2) — ชื่อกลุ่ม',
  'src/app/api/chat/giphy/': 'ค้นหา GIF ภายนอก',
  'src/app/api/chat/inbox-tab-counts/': 'ตัวนับแท็บ (H1) — จำนวนล้วน',
  'src/app/api/chat/preferences/': 'ค่าตั้งของผู้ใช้เอง (X2)',
  'src/app/api/chat/problem-count/': 'ตัวนับ (H1)',
  'src/app/api/chat/quick-messages/': 'ข้อความด่วน (X2)',
  'src/app/api/chat/spam-unread/': 'ตัวนับ (H1)',
  'src/app/api/chat/tags/': 'แท็กแชท (X2)',
  'src/app/api/follow-ups/inbox-counts/': 'ตัวนับ (X2)',
  'src/app/api/follow-ups/mine/': 'งานติดตามของตัวเอง (X2) — ชุดเดียวกับ board (อยู่ใน MATRIX)',
  'src/app/api/files/': 'ไบนารีไฟล์ — ตรวจสิทธิ์ที่ตัวเปิดไฟล์ ไม่ใช่ JSON ที่สแกนคีย์ได้',
  'src/app/api/business/': 'จัดการทีม/คำเชิญ/แพ็กเกจ (T2/T4 เจ้าของ) — ไม่มีแถวออเดอร์',
  'src/app/api/verification/': 'การยืนยันตัวตนร้าน (T1)',
  'src/app/api/wallet/events/': 'SSE ของกระเป๋า (F3 เจ้าของ) — wallet หลักอยู่ใน MATRIX',
  'src/app/api/shops/current/appointments/day/': 'อยู่ใน MATRIX แล้ว (ชื่อซ้ำกับคำนำหน้า)',
  'src/app/api/shops/current/housekeepers/': 'รายชื่อแม่บ้าน (Q1) — ชื่อ/สถานะ ไม่มีเงิน',
  'src/app/api/shops/current/rooms/': 'ห้องพัก (Q1) — ความจุ/ราคาห้องเป็นสินค้าให้เช่า ไม่ใช่ cost',
  'src/app/api/shops/current/service-resources/availability/': 'ช่วงว่างของช่อง (Q1) — เวลา ไม่มีเงิน',
  'src/app/api/shops/current/invite-links/': 'ลิงก์เชิญ (T2 เจ้าของ)',
  'src/app/api/shops/current/page-builder/': 'ตัวจัดหน้าร้าน (T1)',
  'src/app/api/shops/current/videos/': 'วิดีโอร้าน (T1)',
  'src/app/api/orders/[token]/shipment-evidence/': 'หลักฐานพัสดุ (S1) — รูป/ไฟล์',
  'src/app/api/shops/current/customers/lookup/': 'เฉพาะร้านบ้านพัก (requireLodgingShop) — ร้านขายบริการ/ออนไลน์ได้ 403 NOT_LODGING_SHOP · ฟิลด์ลูกค้าไม่มีเงิน',
  'src/app/api/seller/portfolio-series/': 'เฉพาะบัญชีส่วนตัว (PERSONAL) + F1 เจ้าของ — ร้านธุรกิจได้ 403 · อยู่ในกลุ่มเดียวกับ sales-series (อยู่ใน MATRIX)',
}
const coveredBy = (key: string): string | undefined => {
  const dir = key.replace(/route\.ts$/, '')
  return Object.entries(COVERED).find(([p]) => dir.startsWith(p) || key === p)?.[1]
}

// ── ทะเบียน ──
let registry: Record<string, Record<string, unknown>>

beforeAll(async () => {
  ;({ prisma } = await import('@/lib/prisma'))
  registry = (await import('@/lib/route-capabilities')).ROUTE_CAPABILITIES as unknown as typeof registry
  ctx = await seed()
}, 60_000)

afterAll(async () => {
  if (prisma) {
    await cleanup()
    await prisma.$disconnect()
  }
}, 60_000)

async function callRoute(e: Entry, session: unknown): Promise<{ status: number; json: unknown; text: string }> {
  sess.current = session
  const mod = (await e.load()) as unknown as RouteMod
  const req = new NextRequest(new URL(e.url(ctx), 'http://seller.deepth.local'), { headers: { host: 'seller.deepth.local' } })
  const res = await mod.GET(req, e.params ? { params: Promise.resolve(e.params(ctx)) } : undefined)
  const text = await res.text()
  let json: unknown = null
  try { json = JSON.parse(text) } catch { /* ไม่ใช่ JSON */ }
  return { status: res.status, json, text }
}

const capsOf = (e: Entry): string[] => {
  const entry = registry[e.key]
  const c = (entry?.GET ?? e.caps) as string | string[] | undefined
  return c === undefined ? [] : Array.isArray(c) ? c : [c]
}

describe('ทะเบียน × MATRIX (ความครบ)', () => {
  it('ทุก GET ในทะเบียนอยู่ใน MATRIX หรือ COVERED พร้อมเหตุผล', () => {
    const inMatrix = new Set(MATRIX.map((m) => m.key))
    const missing = Object.entries(registry)
      .filter(([k, v]) => k.startsWith('src/app/api/') && 'GET' in v)
      .map(([k]) => k)
      .filter((k) => !inMatrix.has(k) && !coveredBy(k))
    expect(missing, `GET ที่ยังไม่มีทั้งใน MATRIX และ COVERED:\n${missing.join('\n')}`).toEqual([])
  })
  it('MATRIX ชี้ key ที่มีใน ทะเบียน และมี GET', () => {
    for (const m of MATRIX) expect(registry[m.key]?.GET, m.key).toBeDefined()
  })
  it('COVERED ไม่ค้าง: ทุกคำนำหน้าต้องตรงกับ GET ในทะเบียนอย่างน้อยหนึ่งรายการ', () => {
    const keys = Object.entries(registry).filter(([k, v]) => k.startsWith('src/app/api/') && 'GET' in v).map(([k]) => k.replace(/route\.ts$/, ''))
    const stale = Object.keys(COVERED).filter((p) => !keys.some((k) => k.startsWith(p)))
    expect(stale).toEqual([])
  })
})

describe('บทบาท × route (บนฐานจริง)', () => {
  for (const m of MATRIX) {
    for (const role of ROLES) {
      it(`${m.name} · ${role}`, async () => {
        const caps = capsOf(m)
        const { can } = await import('@/lib/shop-permissions')
        const allowed = caps.every((c) => can([role], c))
        const r = await callRoute(m, sessionOf(ctx.userIds[role], m.shop === 'shop2' ? ctx.shop2 : ctx.shop1))
        // ร้านขายออนไลน์: BILLING ไม่มีบทบาทที่มีผล (ขายบริการไม่ได้) ⇒ ไม่ผ่านทุก cap
        const effAllowed = allowed && !(m.shop === 'shop2' && role === 'BILLING')
        if (!effAllowed) {
          expect(r.status, `${role} ต้องถูกปฏิเสธ (${caps}): ${r.text.slice(0, 200)}`).toBe(403)
          if (!m.non403Standard) expect(JSON.stringify(r.json)).toContain('FORBIDDEN_ROLE')
          return
        }
        expect(m.okStatuses ?? [200], `${role} ต้องผ่านด่าน: ${r.status} ${r.text.slice(0, 200)}`).toContain(r.status)
        if (r.status !== 200 && !r.json) return
        if (m.text) {
          // CSV: คอลัมน์ cost เฉพาะเจ้าของ
          const header = r.text.split('\n')[0]
          if (role === 'OWNER') expect(header).toContain('cost')
          else expect(header).not.toContain('cost')
          return
        }
        const level = LEVEL[role]
        if (level === 'FULL') return
        const found = forbiddenIn(r.json, level === 'NONE' ? NONE_FORBIDDEN : PER_ORDER_FORBIDDEN)
        // ช่องว่างที่รู้: ต้องรั่ว "เท่านี้พอดี" — ถ้าแก้แล้วเทสแดงให้ลบ knownLeaks ออก
        expect(found, `${m.name}/${role}`).toEqual(m.knownLeaks?.keys ?? [])
      })
    }
  }
})

describe('ตัวควบคุมเชิงบวก (กันเทสว่างเปล่า): เจ้าของต้องเห็นต้นทุน/ยอดจริง', () => {
  it('products list: OWNER ได้ cost 123/77', async () => {
    const m = MATRIX.find((x) => x.name === 'products')!
    const r = await callRoute(m, sessionOf(ctx.userIds.OWNER, ctx.shop1))
    const costs = (r.json as { cost?: number }[]).map((p) => p.cost).sort()
    expect(costs).toEqual([123, 77].sort())
  })
  it('order detail: OWNER ได้ items[].cost = 40', async () => {
    const m = MATRIX.find((x) => x.name === 'order detail')!
    const r = await callRoute(m, sessionOf(ctx.userIds.OWNER, ctx.shop1))
    expect((r.json as { items: { cost?: number }[] }).items[0].cost).toBe(40)
  })
  it('wallet: OWNER เห็น 777', async () => {
    const m = MATRIX.find((x) => x.name === 'wallet')!
    const r = await callRoute(m, sessionOf(ctx.userIds.OWNER, ctx.shop1))
    expect(JSON.stringify(r.json)).toContain('777')
  })
})

describe('ร้านขายออนไลน์ (shop2): BILLING ถูกตัดเพราะร้านขายบริการไม่ได้', () => {
  for (const name of ['orders list', 'products']) {
    it(`${name} · BILLING บน shop2 = 403`, async () => {
      const m = MATRIX.find((x) => x.name === name)!
      const r = await callRoute(m, sessionOf(ctx.userIds.BILLING, ctx.shop2))
      expect(r.status).toBe(403)
    })
  }
})

describe('ผู้ซื้อ + สาธารณะ', () => {
  it('/api/orders?role=buyer ไม่มี cost', async () => {
    const m = E({ key: R('orders'), name: 'buyer', load: () => import('@/app/api/orders/route'), url: () => '/api/orders?role=buyer' })
    const r = await callRoute(m, { user: { id: ctx.buyerId } })
    expect(r.status).toBe(200)
    expect((r.json as unknown[]).length).toBeGreaterThan(0)
    expect(allKeys(r.json).has('cost')).toBe(false)
  })
  it('public reviews (ไม่ล็อกอิน): ไม่มี cost / เบอร์ผู้รีวิว / publicToken', async () => {
    const m = E({ key: R('public/reviews/[username]'), name: 'pub reviews', load: () => import('@/app/api/public/reviews/[username]/route'), url: () => `/api/public/reviews/${ctx.pubUsername}`, params: () => ({ username: ctx.pubUsername }) })
    const r = await callRoute(m, null)
    expect(r.status).toBe(200)
    expect((r.json as unknown[]).length).toBeGreaterThan(0)
    const keys = allKeys(r.json)
    for (const k of ['cost', 'reviewerContact', 'publicToken', 'buyerContact', 'phone', 'email', 'items']) expect(keys.has(k), k).toBe(false)
    expect(r.text).not.toMatch(/0877\d{6}/)
  })
  it('public profile (ไม่ล็อกอิน): ไม่มี cost', async () => {
    const m = E({ key: R('public/profile/[username]'), name: 'pub profile', load: () => import('@/app/api/public/profile/[username]/route'), url: () => `/api/public/profile/${ctx.pubUsername}`, params: () => ({ username: ctx.pubUsername }) })
    const r = await callRoute(m, null)
    expect(r.status).toBe(200)
    expect(allKeys(r.json).has('cost')).toBe(false)
    expect(allKeys(r.json).has('reviewerContact')).toBe(false)
  })
})

describe('push / แจ้งเตือน (หนี้ review T5)', () => {
  it('ผู้รับ push แชท = ผู้ถือ H1 เท่านั้น (ไม่มี BILLING/TECHNICIAN) และ payload ไม่มีคีย์เงิน', async () => {
    pushed.calls.length = 0
    const { pushNewChatMessage } = await import('@/services/seller-push.service')
    await pushNewChatMessage({ shopId: ctx.shop1, conversationId: ctx.convId })
    expect(pushed.calls.length).toBeGreaterThan(0)
    const recipients = new Set(pushed.calls.flatMap((c) => c.userIds))
    expect(recipients.has(ctx.userIds.TECHNICIAN)).toBe(false)
    expect(recipients.has(ctx.userIds.BILLING)).toBe(false)
    expect(recipients.has(ctx.userIds.CHAT)).toBe(true)
    for (const c of pushed.calls) expect(forbiddenIn(c.data, NONE_FORBIDDEN)).toEqual([])
  })
  it('userIdsHoldingCap(H1/H3) ไม่รวมช่าง', async () => {
    const { userIdsHoldingCap } = await import('@/lib/chat-scope')
    for (const cap of ['H1', 'H3'] as const) {
      const s = (await userIdsHoldingCap([ctx.shop1], cap)).get(ctx.shop1)!
      expect(s.has(ctx.userIds.TECHNICIAN), cap).toBe(false)
    }
  })
  it('แจ้งเตือนในระบบ (Notification) ที่ช่างเห็น: ไม่มี kind ที่เล่าเรื่องเงินของออเดอร์', async () => {
    const kinds = await import('@/services/notification.service')
    expect(kinds.BELL_HIDDEN_KINDS).toContain('chat_message')
    // writer ทั้งระบบมีแค่ chat_message / badge_earned / auction (grep prisma.notification.create) — ไม่มี kind ออเดอร์/เงิน
  })
})

describe('HR16: ต้นทุนเดิมยังคำนวณกำไรได้เท่าเดิมหลังเพิ่ม omit', () => {
  it('getOrderForShop(withCost) → computeOrderProfit = 1234 - 2*40 ; ไม่ opt-in = ไม่มี cost', async () => {
    const { getOrderForShop } = await import('@/services/order.service')
    const { computeOrderProfit } = await import('@/lib/order-profit')
    const withCost = await getOrderForShop(ctx.token, ctx.shop1, { withCost: true })
    const without = await getOrderForShop(ctx.token, ctx.shop1)
    expect(withCost!.items[0].cost).not.toBeUndefined()
    expect('cost' in without!.items[0]).toBe(false)
    const p = computeOrderProfit({ totalAmount: withCost!.totalAmount, items: withCost!.items })
    expect(JSON.stringify(p)).toContain('1154') // 1234 - (40*2)
  })
  it('pnl.service ยังหา COGS ได้ (select cost โดยตรง)', async () => {
    const { getPnlReport } = await import('@/services/pnl.service')
    const { resolveDateRange } = await import('@/lib/date-range')
    const rep = await getPnlReport(ctx.shop2, resolveDateRange('month'), 'ONLINE_SALES')
    // ออเดอร์ shop2: ต้นทุน 66 × 2 = 132 (ถ้า omit ทำให้ cost หาย ค่านี้จะเป็น 0 + hasMissingCost)
    expect(rep.cogs).toBe(132)
    expect(rep.hasMissingCost).toBe(false)
  })
})

describe('หน้าแรก (RSC ไม่ใช่ route): redactCommandCenterData บนข้อมูลจริง', () => {
  it('PER_ORDER/NONE: bestSellers ไม่มี soldCount · ไม่มี walletBalance/salesSeries/portfolio', async () => {
    const { getBestSellerProducts } = await import('@/services/product.service')
    const { redactCommandCenterData } = await import('@/lib/dashboard-money')
    const best = await getBestSellerProducts(ctx.shop1, 8)
    expect(best.length).toBeGreaterThan(0)
    expect(best[0].soldCount).toBeGreaterThan(0) // ตัวควบคุม: ก่อนตัดต้องมีจริง
    for (const level of ['PER_ORDER', 'NONE'] as const) {
      const out = redactCommandCenterData(
        { bestSellers: best, walletBalance: 777, salesSeries: [1], portfolio: { x: 1 } } as never,
        level,
      )
      expect(forbiddenIn(out, PER_ORDER_FORBIDDEN)).toEqual([])
      expect(allKeys(out).has('salesSeries')).toBe(false)
      expect(allKeys(out).has('portfolio')).toBe(false)
    }
  })
})

describe('omit ระดับ client', () => {
  it('query ปกติไม่คืน cost · select/omit:false คืน', async () => {
    const a = await prisma.orderItem.findMany({ where: { orderId: ctx.orderId } })
    expect('cost' in a[0]).toBe(false)
    const b = await prisma.orderItem.findMany({ where: { orderId: ctx.orderId }, select: { cost: true } })
    expect(Number(b[0].cost)).toBe(40)
    const c = await prisma.product.findUnique({ where: { id: ctx.productId } })
    expect('cost' in c!).toBe(false)
    const d = await prisma.product.findUnique({ where: { id: ctx.productId }, omit: { cost: false } })
    expect(Number(d!.cost)).toBe(123)
  })
})
