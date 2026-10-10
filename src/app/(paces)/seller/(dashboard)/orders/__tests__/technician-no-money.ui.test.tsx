/**
 * ชั้น UI ของช่าง (showMoney=false เป็นค่าตั้งต้น) — 00071 P3 · S-15
 * render จริงเป็น HTML แล้วยืนยันว่า "ไม่มีเงินบนจอ" (ด่านชั้นที่สอง · ด่านแรกคือข้อมูลที่ server ตัดไปแล้ว)
 * และเปรียบเทียบกับ showMoney=true ว่าของเดิมยังอยู่ครบ (ไม่ regress ผู้ที่เห็นเงิน)
 *
 * mutation ที่ต้องแดง: เปลี่ยนค่าตั้งต้น `showMoney = false` เป็น true ที่ OrderCard/OrdersTable/OrderSummary/OrderActions
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/orders',
  useSearchParams: () => new URLSearchParams(),
}))

import OrderCard from '../components/OrderCard'
import OrdersTable from '../components/OrdersTable'
import OrderActions from '../components/OrderActions'
import { OrderViewerRolesProvider } from '../components/OrderViewerRoles'
import OrderSummary from '../[token]/components/OrderSummary'
import AppointmentDayCard from '@/components/safepay/appointment-board/AppointmentDayCard'
import { AppointmentBoardCapsProvider } from '@/components/safepay/appointment-board/AppointmentBoardCaps'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import type { OrderRow } from '../components/data'
import { ORDER_VOCAB } from '@/lib/seller-menu'

const vocab = ORDER_VOCAB.SERVICE_QUEUE

/** แถวของช่าง: ไม่มีคีย์เงินเลย (รูปเดียวกับที่ page.tsx ผลิตเมื่อ showMoney=false) */
const NO_MONEY_ROW = {
  id: 'tok-1', publicToken: 'tok-1', shortCode: null, buyer: '0812345678', orderType: 'SERVICE', status: 'PENDING',
  createdAtISO: '2026-10-10T03:00:00.000Z', buyerName: 'สมชาย', buyerUsername: null, buyerAccountLabel: null, buyerAvatar: null,
  salesChannel: 'LINE', isFromAuction: false, buyerPhone: '0812345678', shipTo: null, customerStats: null, conversationId: null,
  items: [{ id: 'i1', name: 'ตัดผม', qty: 2, imageUrl: null }],
  appointment: { startISO: '2026-10-12T03:00:00.000Z', endISO: '2026-10-12T04:00:00.000Z', allDay: false, resourceName: 'ช่าง A', stage: 'SCHEDULED' },
} as unknown as OrderRow

const MONEY_ROW = {
  ...NO_MONEY_ROW, total: 1234, paymentMethod: 'COD', codReceivedAtISO: null, conversationId: 'conv-1',
  customerStats: { orders: 3, cancelled: 2, cancelledByBuyer: 2, returned: 0 },
  money: { totalAmount: 1234, totalReceived: 0, outstanding: 1234 },
  items: [{ id: 'i1', name: 'ตัดผม', qty: 2, price: 617, imageUrl: null }],
} as unknown as OrderRow

const noop = () => {}
const tableProps = (orders: OrderRow[], extra: object = {}) => ({
  orders, vocab, vertical: 'SERVICE_QUEUE' as const, busy: { busy: false, run: (f: () => void) => f(), begin: noop, end: noop } as never,
  search: '', appliedSearch: '', onSearchChange: noop, wholeShopMatches: 0, onClearFilters: noop, hasShippingAxis: false, ...extra,
})

describe('OrderCard', () => {
  it('ค่าตั้งต้น (ช่าง): ไม่มี ฿, ไม่มีวิธีชำระ, ไม่มีปุ่ม action — แต่ยังมีชื่อ/เบอร์/รายการ×จำนวน/นัด', () => {
    const html = renderToStaticMarkup(h(OrderCard, { order: NO_MONEY_ROW, vocab, onCancelRequest: noop }))
    expect(html).not.toContain('฿')
    expect(html).not.toContain('เก็บปลายทาง')
    expect(html).not.toContain('คัดลอกลิงก์')
    expect(html).not.toContain('เมนูเพิ่มเติม')
    for (const t of ['สมชาย', '0812345678', 'ตัดผม', 'x2', 'ช่าง A']) expect(html).toContain(t)
    // class ที่เคยแตกกลางคำต้องหายไป (OrderCard.tsx:335 เดิม `ju…stify-center`)
    expect(html).not.toMatch(/class="[^"]*\bju\b/)
  })

  it('showMoney=true: ยอด/ราคา/วิธีชำระ/ปุ่ม action ครบเหมือนเดิม', () => {
    const html = renderToStaticMarkup(h(OrderCard, { order: MONEY_ROW, vocab, onCancelRequest: noop, showMoney: true }))
    for (const t of ['฿1,234', '฿617', 'เก็บปลายทาง', 'คัดลอกลิงก์', 'เมนูเพิ่มเติม']) expect(html).toContain(t)
  })
})

describe('OrderActions', () => {
  const html = (variant: 'card' | 'table-grid', showMoney?: boolean) =>
    renderToStaticMarkup(
      h(OrderViewerRolesProvider, { roles: ['TECHNICIAN'], children: h(OrderActions, { order: NO_MONEY_ROW, onCancelRequest: noop, variant, showMoney }) }),
    )
  it('ช่างเห็นเฉพาะ "ดูรายละเอียด" (ลิงก์ผู้ซื้อ /o/… มียอดเงินครบ จึงไม่แจกคัดลอก/QR)', () => {
    const t = html('table-grid')
    expect(t).toContain('ดูรายละเอียด')
    expect(t).not.toContain('คัดลอกลิงก์')
    expect(t).not.toContain('QR')
    expect(html('card')).toBe('')
  })
  it('ค่าตั้งต้นของ prop = ปิดเงิน (ลืมส่ง = ปลอดภัย)', () => {
    expect(html('table-grid', undefined)).not.toContain('คัดลอกลิงก์')
    expect(html('table-grid', true)).toContain('คัดลอกลิงก์')
  })
})

describe('OrdersTable (เดสก์ท็อป)', () => {
  const render = (order: OrderRow, props: object = {}, roles: string[] = ['TECHNICIAN']) =>
    renderToStaticMarkup(
      h(LocaleProvider, {
        locale: 'th',
        children: h(OrderViewerRolesProvider, { roles: roles as never, children: h(OrdersTable, tableProps([order], props) as never) }),
      }),
    )

  it('ช่าง: ไม่มีคอลัมน์ชำระเงิน/ยอด, ไม่มี checkbox, ไม่มีราคาต่อหน่วย, ไม่มีขั้นรับเงิน, ไม่มีปุ่มสร้าง, ไม่มีแถบ bulk', () => {
    const html = render(NO_MONEY_ROW)
    expect(html).not.toContain('฿')
    expect(html).not.toContain('การชำระเงิน')
    expect(html).not.toContain('ยอด')
    expect(html).not.toContain('type="checkbox"')
    expect(html).not.toContain('เก็บเงินครบ')
    expect(html).not.toContain('รับเงินปลายทาง')
    expect(html).not.toContain(vocab.createLabel)
    expect(html).not.toContain('เปิดข้อความสนทนา')
    for (const t of ['สมชาย', 'ตัดผม', 'x2']) expect(html).toContain(t)
  })

  it('showMoney=true + บทบาทเจ้าของ: คอลัมน์/ยอด/checkbox/ปุ่มสร้างครบเหมือนเดิม', () => {
    const html = render(MONEY_ROW, { showMoney: true }, ['OWNER'])
    for (const t of ['฿1,234', '฿617', 'การชำระเงิน', 'type="checkbox"', 'เก็บเงินครบ', vocab.createLabel, 'เปิดข้อความสนทนา']) expect(html).toContain(t)
  })

  it('TECHNICIAN+CHAT เห็นเงิน (showMoney=true) เปิดข้อความสนทนาได้ และมีปุ่มสร้าง (CHAT มี O2s)', () => {
    const html = render(MONEY_ROW, { showMoney: true }, ['TECHNICIAN', 'CHAT'])
    expect(html).toContain('เปิดข้อความสนทนา')
    expect(html).toContain(vocab.createLabel)
  })
})

describe('OrderSummary (หน้ารายละเอียด)', () => {
  const base = {
    publicToken: 'tok-1', status: 'PENDING', createdAtISO: '2026-10-10T03:00:00.000Z', salesChannel: 'LINE', internalNote: 'ตัดสั้น',
    isFromAuction: false, vocab, vertical: 'SERVICE_QUEUE', orderNoun: vocab.noun,
  }
  it('ค่าตั้งต้น: ไม่มีราคา/ยอด/ป้ายชำระ/ปุ่ม — มีชื่อ×จำนวน + หมายเหตุภายใน', () => {
    const html = renderToStaticMarkup(h(OrderSummary, { ...base, items: [{ id: 'i1', name: 'ตัดผม', qty: 2, imageUrl: null }] }))
    expect(html).not.toContain('฿')
    expect(html).not.toContain('ราคา')
    expect(html).not.toContain('ยอดรวม')
    for (const t of ['ตัดผม', 'จำนวน', 'ตัดสั้น']) expect(html).toContain(t)
  })
  it('showMoney=true: ตารางราคา/ยอดรวมครบ', () => {
    const html = renderToStaticMarkup(
      h(OrderSummary, { ...base, showMoney: true, totalAmount: 1234, discount: 0, vatAmount: 0, vatRate: 0, items: [{ id: 'i1', name: 'ตัดผม', qty: 2, price: 617, imageUrl: null }] }),
    )
    for (const t of ['฿617.00', '฿1,234.00', 'ราคา/']) expect(html).toContain(t)
  })
})

describe('AppointmentDayCard (คิวรายวัน)', () => {
  const item = {
    orderToken: 'tok-1', orderNo: 'DP1', createdAt: '2026-10-10T03:00:00.000Z', start: '2099-10-12T03:00:00.000Z', end: '2099-10-12T04:00:00.000Z',
    appointmentStatus: 'RESCHEDULE_REQUESTED', buyerName: 'สมชาย', buyerContact: '0812345678', resource: { id: 'r1', name: 'ช่าง A' },
    source: null, salesChannel: 'LINE', customerAvatarUrl: null, conversationId: 'conv-1', firstItemName: 'ตัดผม', itemCount: 1,
    totalAmount: '900', depositAmount: '300',
  }
  const render = (caps: object, it = item) =>
    renderToStaticMarkup(
      h(AppointmentBoardCapsProvider, {
        value: { showMoney: false, canChat: false, canReschedule: false, canCreate: false, ...caps },
        children: h(AppointmentDayCard, { item: it, now: new Date('2099-10-12T03:30:00.000Z'), onChanged: noop }),
      }),
    )

  it('ไม่มีสิทธิ์ใดเลย (ค่าตั้งต้น/ช่าง): ไม่มียอด/มัดจำ/ทักแชท/เลือกเวลาใหม่ แม้ข้อมูลมียอดมา (ด่านชั้นที่สอง)', () => {
    const html = render({})
    expect(html).not.toContain('฿')
    expect(html).not.toContain('ยอด ')
    expect(html).not.toContain('มัดจำ')
    expect(html).not.toContain('ทักแชท')
    expect(html).not.toContain('เลือกเวลาใหม่ให้ลูกค้า')
    // ยังโทรหาลูกค้าได้ และมีปุ่มตัวเลือก (ไม่มาตามนัด)
    expect(html).toContain('โทรหา สมชาย')
    expect(html).toContain('ตัวเลือกอื่นของนัด')
  })

  it('มีสิทธิ์ครบ: ยอด/มัดจำ/ทักแชท/เลือกเวลาใหม่อยู่ครบ', () => {
    const html = render({ showMoney: true, canChat: true, canReschedule: true })
    for (const t of ['฿900', 'มัดจำ ฿300', 'ทักแชทหา สมชาย', 'เลือกเวลาใหม่ให้ลูกค้า']) expect(html).toContain(t)
  })

  it('ไม่มี Provider ครอบ (ลืมใส่) = ปิดทุกสิทธิ์ ไม่ใช่เปิด', () => {
    const html = renderToStaticMarkup(h(AppointmentDayCard, { item, now: new Date('2099-10-12T03:30:00.000Z'), onChanged: noop }))
    expect(html).not.toContain('฿')
    expect(html).not.toContain('ทักแชท')
    expect(html).not.toContain('เลือกเวลาใหม่ให้ลูกค้า')
  })

  it('ข้อมูลไม่มีคีย์ยอด (server ตัดแล้ว) ไม่ crash', () => {
    const { totalAmount: _t, depositAmount: _d, ...noMoney } = item
    expect(() => render({}, noMoney as never)).not.toThrow()
  })
})
