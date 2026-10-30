/**
 * "รูปจากร้าน" บนหน้าลูกค้า `/o/[token]` — feature 00086 P3 · T12 (S-13 · API §4.16)
 *
 * page.tsx เป็น RSC: ทุก props ของ client component = flight payload ที่ผู้ใช้เปิดดูได้
 * ⇒ เรียกหน้าจริง (mock prisma/service) แล้วไล่ต้นไม้ element ทุก props ทุกชั้น
 * (แพตเทิร์นเดียวกับ technician-no-money.page.test.tsx · permission-gate-follows-the-row.md)
 *
 * mutation ที่ต้องแดง:
 *  - ลบเงื่อนไข `serviceJobPhotoMode !== 'NONE'` ใน buyerSeesServiceJobPhotos
 *  - เพิ่ม `createdByUserId`/`createdBy` ใน BUYER_SERVICE_JOB_RECORD_SELECT
 *  - ส่ง `serviceJobPhotos: null`/[] แทนการไม่ใส่คีย์
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('redirect') }),
  notFound: vi.fn(() => { throw new Error('notFound') }),
  useRouter: vi.fn(), usePathname: vi.fn(), useSearchParams: vi.fn(),
}))

const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn(), groupBy: vi.fn() },
  verificationRecord: { findMany: vi.fn() },
  review: { aggregate: vi.fn(), findFirst: vi.fn() },
  shopChannel: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  orderEvent: { findFirst: vi.fn() },
  serviceJobRecord: { findMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const svc = vi.hoisted(() => ({
  getOrderByToken: vi.fn(),
  resolveOrderAccess: vi.fn(),
  guaranteeOrderLink: vi.fn(),
}))
vi.mock('@/services/order.service', () => ({ getOrderByToken: svc.getOrderByToken }))
vi.mock('@/services/order-access.service', () => ({
  resolveOrderAccess: svc.resolveOrderAccess,
  guaranteeOrderLink: svc.guaranteeOrderLink,
}))
vi.mock('@/services/sms-code.service', () => ({ peekSmsCode: vi.fn().mockResolvedValue(null) }))
vi.mock('@/services/order-dispute.service', () => ({ hasOpenDispute: vi.fn(() => false) }))
vi.mock('@/services/auto-notify-config.service', () => ({ getTrackingNoticeTiming: vi.fn().mockResolvedValue('ON_SAVE') }))

import { getServerSession } from 'next-auth'
import PublicOrderPage from '../page'
import ServiceJobPhotosCard from '../ServiceJobPhotosCard'
import { BUYER_SERVICE_JOB_RECORD_SELECT, buyerSeesServiceJobPhotos, toBuyerServiceJobPhotos } from '../buyer-service-job-photos'

const TOKEN = '8f14e45f-ceea-467a-9f3a-6b2c1d0e9a11'
const NOTE_BEFORE = 'โคมขวาเหลืองหนัก รอยร้าวมุมบน-ลับเฉพาะ'
const NOTE_AFTER = 'ขัดเคลือบเสร็จ-ลับเฉพาะ'
const FILE_BEFORE = '2026/10/28/aaaa1111-before.jpg'
const FILE_AFTER = '2026/10/28/bbbb2222-after.jpg'
const STAFF_ID = 'staff-user-77'
const STAFF_NAME = 'ช่างสมศักดิ์'

type ShopOver = { vertical?: string; serviceJobPhotosBuyerVisible?: boolean; serviceJobPhotoMode?: string }

const dec = (n: number) => ({ toFixed: (d: number) => n.toFixed(d), valueOf: () => n, toString: () => String(n) })

function makeOrder(shop: ShopOver = {}, over: Record<string, unknown> = {}) {
  return {
    id: 'order-1', publicToken: TOKEN, shortCode: 'ABCDEFGH', shopId: 'shop-1', status: 'PENDING', type: 'SERVICE',
    createdAt: new Date('2026-10-28T03:00:00Z'), totalAmount: dec(900), depositAmount: null, payments: [],
    buyerUserId: 'buyer-1', buyerContact: '0812345678', buyerName: 'ลูกค้า', shippingAddress: null,
    paymentMethod: 'CASH', fulfillmentMode: 'PICKUP', payoutSnapshot: null, paymentConfirmedAt: null, handedOverAt: null,
    cancelInitiator: null, slipFileId: null, accessUrl: null, disputeOpenedAt: null, disputeResolvedAt: null,
    serviceStart: null, serviceEnd: null, serviceResource: null, appointmentStatus: null, buyerConfirmedAt: null,
    rescheduleRequestNote: null, serviceClosedAt: null, serviceStartedAt: new Date('2026-10-28T03:30:00Z'),
    serviceFinishedAt: null, arrivalMode: 'WALK_IN',
    review: null, shopChannel: null, shipmentTracking: null, shipments: [],
    items: [{ id: 'i1', name: 'ขัดโคม', description: null, qty: 1, price: dec(900), product: { images: [] } }],
    shop: {
      id: 'shop-1', userId: 'owner-1', kind: 'BUSINESS', vertical: 'SERVICE_QUEUE', shopName: 'ร้านทดสอบ',
      logo: null, coverImage: null, address: null,
      serviceJobPhotosBuyerVisible: true, serviceJobPhotoMode: 'REQUIRED',
      user: { id: 'owner-1', displayName: 'เจ้าของ', username: 'owner', trustScore: 30, avatar: null, userBadges: [] },
      ...shop,
    },
    ...over,
  }
}

/** แถวที่ "ฐาน" คืน — ใส่คีย์ผู้บันทึกไว้ด้วยโดยตั้งใจ: ถ้าหน้า select เกิน allow-list (mutation) ค่าพวกนี้จะไหลลง payload */
function dbRowsHonouringSelect(args: { select: Record<string, boolean> }) {
  const full = [
    { id: 'r1', phase: 'BEFORE', note: NOTE_BEFORE, fileIds: [FILE_BEFORE], createdAt: new Date('2026-10-28T03:30:00Z'),
      createdByUserId: STAFF_ID, createdBy: { displayName: STAFF_NAME }, shopId: 'shop-1' },
    { id: 'r2', phase: 'AFTER', note: NOTE_AFTER, fileIds: [FILE_AFTER], createdAt: new Date('2026-10-28T05:10:00Z'),
      createdByUserId: STAFF_ID, createdBy: { displayName: STAFF_NAME }, shopId: 'shop-1' },
  ]
  return full.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => args.select[k])))
}

type El = { type?: unknown; props?: Record<string, unknown> }
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
/** ทุกอย่างที่ลง payload — serialize props ทุก element */
const payloadOf = (tree: unknown) => JSON.stringify(elements(tree).map((e) => e.props), (_k, v) => (typeof v === 'function' ? undefined : v))
const orderPropOf = (tree: unknown) =>
  elements(tree).find((e) => e.name === 'PublicOrderClient')?.props.order as Record<string, unknown> | undefined

const render = () => PublicOrderPage({ params: Promise.resolve({ token: TOKEN }), searchParams: Promise.resolve({}) })

function grantedAs(order: ReturnType<typeof makeOrder>) {
  svc.getOrderByToken.mockResolvedValue(order)
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'buyer-1' } } as never)
  svc.resolveOrderAccess.mockReturnValue({ kind: 'OWNER_MATCH' })
}

beforeEach(() => {
  vi.clearAllMocks()
  db.verificationRecord.findMany.mockResolvedValue([])
  db.order.groupBy.mockResolvedValue([])
  db.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } })
  db.review.findFirst.mockResolvedValue(null)
  db.shopChannel.findMany.mockResolvedValue([])
  db.user.findUnique.mockResolvedValue({ phone: '0812345678' })
  db.orderEvent.findFirst.mockResolvedValue(null)
  db.serviceJobRecord.findMany.mockImplementation(async (args: { select: Record<string, boolean> }) => dbRowsHonouringSelect(args))
  svc.guaranteeOrderLink.mockResolvedValue(undefined)
})

describe('/o/[token] — ไม่เข้าเงื่อนไข ⇒ ไม่มีคีย์ serviceJobPhotos และไม่มี note/fileId ใน payload', () => {
  const cases: [string, ShopOver][] = [
    ['ร้านปิด "ลูกค้าเห็นรูป"', { serviceJobPhotosBuyerVisible: false }],
    ['โหมด NONE (แม้ธงเปิด — ข้อมูลเพี้ยน)', { serviceJobPhotoMode: 'NONE', serviceJobPhotosBuyerVisible: true }],
    ['ร้านขายออนไลน์ ONLINE_SALES', { vertical: 'ONLINE_SALES' }],
    ['ร้านที่พัก LODGING', { vertical: 'LODGING' }],
  ]
  it.each(cases)('%s', async (_label, shop) => {
    grantedAs(makeOrder(shop))
    const tree = await render()
    const order = orderPropOf(tree)
    expect(order, 'ต้องถึงจอหลัง grant').toBeDefined()
    expect(Object.prototype.hasOwnProperty.call(order, 'serviceJobPhotos')).toBe(false)
    expect(db.serviceJobRecord.findMany).not.toHaveBeenCalled()
    const payload = payloadOf(tree)
    for (const secret of [NOTE_BEFORE, NOTE_AFTER, FILE_BEFORE, FILE_AFTER, STAFF_ID, STAFF_NAME]) {
      expect(payload).not.toContain(secret)
    }
  })
})

describe('/o/[token] — ร้านบริการเปิดให้ลูกค้าเห็น', () => {
  it('มีคีย์ครบ (ก่อน/หลัง · URL ผ่าน /api/files · บันทึก) และไม่มีตัวระบุพนักงาน', async () => {
    grantedAs(makeOrder())
    const tree = await render()
    const order = orderPropOf(tree)!
    const photos = order.serviceJobPhotos as { records: { phase: string; note: string; photoUrls: string[]; thumbUrls: (string | null)[] }[] }
    expect(photos.records.map((r) => r.phase)).toEqual(['BEFORE', 'AFTER'])
    expect(photos.records[0].photoUrls).toEqual([`/api/files/${FILE_BEFORE}`])
    // กริดได้รูปย่อ webp (variant thumb) · lightbox ยังใช้ต้นฉบับ
    expect(photos.records[0].thumbUrls).toEqual(['/api/files/2026/10/28/aaaa1111-before.thumb.webp'])
    expect(photos.records[1].note).toBe(NOTE_AFTER)

    const payload = payloadOf(tree)
    for (const leak of [STAFF_ID, STAFF_NAME, 'createdByUserId', 'createdBy', 'displayName":"' + STAFF_NAME]) {
      expect(payload).not.toContain(leak)
    }
  })

  it('query เป็น allow-list 4 คีย์ ไม่มีผู้บันทึก และ scope ด้วย orderId ของใบนี้', async () => {
    grantedAs(makeOrder())
    await render()
    expect(db.serviceJobRecord.findMany).toHaveBeenCalledTimes(1)
    const args = db.serviceJobRecord.findMany.mock.calls[0][0]
    expect(args.where).toEqual({ orderId: 'order-1' })
    expect(Object.keys(args.select).sort()).toEqual(['createdAt', 'fileIds', 'note', 'phase'])
    expect(args.include).toBeUndefined()
  })

  it('ร้านเปิดแต่ยังไม่มีแถว ⇒ ไม่มีคีย์ (ไม่ใช่ [])', async () => {
    grantedAs(makeOrder())
    db.serviceJobRecord.findMany.mockResolvedValue([])
    const order = orderPropOf(await render())!
    expect(Object.prototype.hasOwnProperty.call(order, 'serviceJobPhotos')).toBe(false)
  })
})

describe('/o/[token] — ยังไม่ปลดล็อก ⇒ ไม่เห็นการ์ด', () => {
  it('ไม่มี session (GuestOrderView) — ไม่ยิง query ไม่มี note/fileId ใน payload', async () => {
    svc.getOrderByToken.mockResolvedValue(makeOrder())
    vi.mocked(getServerSession).mockResolvedValue(null as never)
    const tree = await render()
    expect(elements(tree).some((e) => e.name === 'GuestOrderView')).toBe(true)
    expect(db.serviceJobRecord.findMany).not.toHaveBeenCalled()
    const payload = payloadOf(tree)
    for (const secret of [NOTE_BEFORE, NOTE_AFTER, FILE_BEFORE, FILE_AFTER]) expect(payload).not.toContain(secret)
  })

  it.each(['OTP_CLAIM_REQUIRED', 'OWNER_MISMATCH', 'PHONE_VERIFY_REQUIRED', 'LEGACY_NO_CLAIM'])(
    'ล็อกอินแต่ด่านตอบ %s — ไม่ยิง query',
    async (kind) => {
      svc.getOrderByToken.mockResolvedValue(makeOrder())
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'someone' } } as never)
      svc.resolveOrderAccess.mockReturnValue({ kind, targetPhone: '0812345678' })
      const tree = await render()
      expect(db.serviceJobRecord.findMany).not.toHaveBeenCalled()
      expect(payloadOf(tree)).not.toContain(NOTE_BEFORE)
    },
  )
})

describe('buyerSeesServiceJobPhotos — ด่านเดียว', () => {
  it('ผ่านเฉพาะ SERVICE_QUEUE ∧ visible ∧ mode≠NONE', () => {
    const ok = { vertical: 'SERVICE_QUEUE', serviceJobPhotosBuyerVisible: true, serviceJobPhotoMode: 'OPTIONAL' }
    expect(buyerSeesServiceJobPhotos(ok)).toBe(true)
    expect(buyerSeesServiceJobPhotos({ ...ok, serviceJobPhotoMode: 'REQUIRED' })).toBe(true)
    expect(buyerSeesServiceJobPhotos({ ...ok, serviceJobPhotoMode: 'NONE' })).toBe(false)
    expect(buyerSeesServiceJobPhotos({ ...ok, serviceJobPhotosBuyerVisible: false })).toBe(false)
    expect(buyerSeesServiceJobPhotos({ ...ok, vertical: 'ONLINE_SALES' })).toBe(false)
  })
  it('select ไม่มีคีย์ผู้บันทึก', () => {
    expect(Object.keys(BUYER_SERVICE_JOB_RECORD_SELECT).sort()).toEqual(['createdAt', 'fileIds', 'note', 'phase'])
  })
})

describe('toBuyerServiceJobPhotos — "รูปหลังทำจะขึ้นที่นี่" พูดได้เฉพาะเมื่อจริง', () => {
  const before = { phase: 'BEFORE', note: null, fileIds: [FILE_BEFORE], createdAt: new Date('2026-10-28T03:30:00Z') }
  const base = { status: 'PENDING', serviceFinishedAt: null, serviceClosedAt: null, shopPhotoMode: 'REQUIRED' }
  it('บังคับรูป ∧ ยังไม่ทำเสร็จ ∧ ยังไม่ปิด = true', () => {
    expect(toBuyerServiceJobPhotos([before], base)?.afterPending).toBe(true)
  })
  it.each([
    ['โหมดไม่บังคับ', { shopPhotoMode: 'OPTIONAL' }],
    ['ทำเสร็จแล้ว', { serviceFinishedAt: new Date() }],
    ['ปิดงานแล้ว', { serviceClosedAt: new Date() }],
    ['ยกเลิก', { status: 'CANCELLED' }],
  ])('%s = false', (_l, over) => {
    expect(toBuyerServiceJobPhotos([before], { ...base, ...over })?.afterPending).toBe(false)
  })
  it('แถวว่าง/ไม่มีทั้งรูปและบันทึก = null', () => {
    expect(toBuyerServiceJobPhotos([], base)).toBeNull()
    expect(toBuyerServiceJobPhotos([{ ...before, fileIds: [], note: '  ' }], base)).toBeNull()
  })
})

describe('ServiceJobPhotosCard — markup', () => {
  const rec = (phase: 'BEFORE' | 'AFTER', urls: string[], note: string | null) => ({
    phase, note, photoUrls: urls, thumbUrls: urls.map((u) => (u.startsWith('/api/files/') ? u.replace(/\.[a-z]+$/, '.thumb.webp') : null)), createdAtIso: '2026-10-28T03:30:00.000Z',
  })
  it('ก่อนทำ + วันเวลา + บันทึก + hint หลังทำ', () => {
    const html = renderToStaticMarkup(
      createElement(ServiceJobPhotosCard, { photos: { records: [rec('BEFORE', ['/api/files/x.jpg'], 'บันทึกก่อน')], afterPending: true } }),
    )
    expect(html).toContain('รูปจากร้าน')
    expect(html).toContain('ก่อนทำ · 28 ต.ค. 10:30 น.')
    expect(html).toContain('บันทึกก่อน')
    // critique P2 — ไม่สัญญาว่า "ร้านจะส่ง" (ส่งข้อความหรือไม่ขึ้นกับแชท) · บอกแค่ว่ารูปจะขึ้นที่นี่
    expect(html).toContain('รูปหลังทำจะขึ้นที่นี่เมื่อร้านทำเสร็จ')
    expect(html).not.toContain('ร้านจะส่งรูป')
    expect(html).toContain('aria-label="ดูรูปก่อนทำที่ 1"')
    // กริดโหลดรูปย่อ ไม่ใช่ต้นฉบับ
    expect(html).toContain('src="/api/files/x.thumb.webp"')
    expect(html).not.toContain('src="/api/files/x.jpg"')
    expect(html).not.toContain('ช่าง')
  })
  it('มี AFTER แล้ว ⇒ ไม่มี hint · มีแต่บันทึก ⇒ หัวข้อ "บันทึกจากร้าน"', () => {
    const withAfter = renderToStaticMarkup(
      createElement(ServiceJobPhotosCard, {
        photos: { records: [rec('BEFORE', ['/a.jpg'], null), rec('AFTER', ['/b.jpg'], null)], afterPending: true },
      }),
    )
    expect(withAfter).not.toContain('รูปหลังทำจะขึ้นที่นี่')
    expect(withAfter).toContain('หลังทำ · ')
    const notesOnly = renderToStaticMarkup(
      createElement(ServiceJobPhotosCard, { photos: { records: [rec('BEFORE', [], 'มีแต่บันทึก')], afterPending: false } }),
    )
    expect(notesOnly).toContain('บันทึกจากร้าน')
    expect(notesOnly).not.toContain('<img')
  })
})
