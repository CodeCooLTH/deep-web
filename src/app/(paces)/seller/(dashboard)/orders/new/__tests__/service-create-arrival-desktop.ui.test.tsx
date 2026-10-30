/**
 * ฟอร์มสร้างออเดอร์เดสก์ท็อป (CartPanel) ของร้านบริการ — "ลูกค้ามาแบบไหน" (00086 P2-T5 · prototype v13)
 * คู่กับ service-create-arrival.ui.test.tsx (มือถือ T4)
 *
 * ยืนยัน:
 *  - ร้านบริการตอนสร้าง: ลำดับ ลูกค้า → วันที่ → ลูกค้ามาแบบไหน → รายการ → นัด/คิว (กางเสมอ) → เพิ่มเติม
 *    · ส่วนลด/VAT ไม่อยู่ใน footer แล้ว · ไม่มี accordion "ชำระเงิน / ช่องทาง"/"หมายเหตุ" แยก
 *  - หน้าร้าน (WALK_IN): หัวบล็อก "เข้าคิววันนี้" + รายการคิว
 *  - "เพิ่มเติม" กาง: ช่องทาง → ชำระเงิน → ส่วนลด → VAT → หมายเหตุ
 *  - [blocker] regression: ONLINE_SALES / LODGING / หน้าแก้ไขร้านบริการ = ลำดับ + footer เดิม
 *
 * mutation ที่ต้องแดง (ทำแล้วตอนเขียน): CartPanel `serviceLayout ? serviceMiddle : legacyMiddle`
 * กลับด้าน → regression + ลำดับแดง · footer เลิกกั้น `serviceLayout` → "ไม่มีช่องส่วนลดใน footer" แดง
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h, type ReactElement } from 'react'
import { useForm } from 'react-hook-form'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/orders/new',
  useSearchParams: () => new URLSearchParams(),
}))

import OrderCreateForm, { type FormValues } from '../components/OrderCreateForm'
import CartPanel from '../components/CartPanel'
import AppointmentBlock, { type ServiceResourceOption } from '../components/AppointmentBlock'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { ORDER_VOCAB } from '@/lib/seller-menu'

const RESOURCES: ServiceResourceOption[] = [
  { id: 'r1', name: 'ช่างเอ', durationMinutes: 60, capacity: 2, depositMode: 'FIXED', depositValue: '100' },
  { id: 'r2', name: 'ช่างบี', durationMinutes: null, capacity: 3, depositMode: 'FIXED', depositValue: '0' },
]

type Vertical = 'SERVICE_QUEUE' | 'ONLINE_SALES' | 'LODGING'
/** render ฟอร์มจริงแล้วตัดเฉพาะแผงเดสก์ท็อป (หลัง QuickForm มือถือ) */
function renderDesktop(vertical: Vertical, extra: Record<string, unknown> = {}): string {
  const html = renderToStaticMarkup(
    h(LocaleProvider, {
      locale: 'th',
      children: h(OrderCreateForm, {
        vocab: ORDER_VOCAB[vertical],
        shopVertical: vertical,
        shopId: 's1',
        catalog: [],
        serviceResourcesEnabled: vertical === 'SERVICE_QUEUE',
        serviceResources: vertical === 'SERVICE_QUEUE' ? RESOURCES : [],
        appointmentGranularity: 'TIME',
        ...extra,
      } as never),
    }) as ReactElement,
  )
  const cut = html.indexOf('hidden lg:grid')
  expect(cut).toBeGreaterThan(0)
  return html.slice(cut)
}

function order(html: string, labels: string[]): number[] {
  return labels.map((l) => html.indexOf(l))
}
function expectAscending(positions: number[]) {
  for (const p of positions) expect(p).toBeGreaterThanOrEqual(0)
  for (let i = 1; i < positions.length; i++) expect(positions[i]).toBeGreaterThan(positions[i - 1])
}

/** footer ของแผง = หลังปุ่ม/บล็อกกลางที่ scroll — เริ่มที่ "ยอดรวมรายการ" */
const footerOf = (html: string) => html.slice(html.indexOf('ยอดรวมรายการ'))

describe('เดสก์ท็อป ร้านบริการ — สร้าง (CartPanel serviceLayout)', () => {
  const html = renderDesktop('SERVICE_QUEUE')
  const v = ORDER_VOCAB.SERVICE_QUEUE

  it('ลำดับ v13: ลูกค้า → วันที่ → ลูกค้ามาแบบไหน → รายการ → วันเข้าใช้บริการ → เพิ่มเติม → ยอดรวม', () => {
    expectAscending(
      order(html, [
        '</span> ลูกค้า<',
        `>${v.dateLabel}</span>`,
        '>ลูกค้ามาแบบไหน</h5>',
        'ยังไม่มีรายการ',
        '>วันเข้าใช้บริการ</h5>',
        '</span> เพิ่มเติม<',
        'ยอดรวมรายการ',
        `บันทึก${v.noun}`,
      ]),
    )
  })

  it('ลูกค้ากางเป็นค่าเริ่ม · ค่าเริ่ม "จองล่วงหน้า" · ไม่มี "ไม่บังคับ"', () => {
    expect(html).toContain('id="cust-name"')
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?จองล่วงหน้า/)
    expect(html).not.toContain('ไม่บังคับ')
  })

  it('ช่องทาง/ชำระเงิน + หมายเหตุ ไม่เป็น accordion แยกแล้ว · footer ไม่มีช่องกรอกส่วนลด/VAT', () => {
    expect(html).not.toContain('ชำระเงิน / ช่องทาง')
    expect(html).not.toContain('</span> หมายเหตุ')
    expect(footerOf(html)).not.toContain('aria-label="ส่วนลด (บาท)"')
    expect(footerOf(html)).not.toContain('aria-label="VAT (เปอร์เซ็นต์)"')
    expect(footerOf(html)).toContain('รวมทั้งสิ้น')
  })

  it('ร้านบริการที่ยังไม่ตั้งคิวงาน: ไม่มีปุ่มเลือก ไม่มีบล็อกนัด แต่ลำดับใหม่ยังอยู่', () => {
    const noRes = renderDesktop('SERVICE_QUEUE', { serviceResources: [] })
    expect(noRes).not.toContain('ลูกค้ามาแบบไหน')
    expect(noRes).not.toContain('วันเข้าใช้บริการ')
    expect(noRes).toContain('</span> เพิ่มเติม<')
  })
})

// ── CartPanel ตรง ๆ — คุมค่าเริ่ม arrivalMode/errors ได้ ──
function PanelHarness(props: { arrivalMode: 'BOOKED' | 'WALK_IN'; forceMoreOpen?: boolean; discount?: number }) {
  const { control, setValue } = useForm<FormValues>({
    defaultValues: {
      items: [],
      arrivalMode: props.arrivalMode,
      appointment: { resourceId: 'r1' },
      salesChannel: 'STOREFRONT',
      paymentMethod: 'CASH',
      discount: props.discount,
    } as never,
  })
  return h(CartPanel, {
    control,
    setValue,
    catalog: [],
    itemsCtl: { fields: [] } as never,
    // error ของส่วนลด = เหตุให้ "เพิ่มเติม" กางเอง (static render กดไม่ได้)
    errors: (props.forceMoreOpen ? { discount: { message: 'x' } } : {}) as never,
    serviceLayout: true,
    showArrivalPicker: true,
    appointmentBlock: h(AppointmentBlock, {
      control,
      errors: {},
      setValue: () => {},
      resources: RESOURCES,
      granularity: 'TIME',
      total: 0,
      idPrefix: 'd',
      variant: 'embedded',
      mode: props.arrivalMode,
      value: { resourceId: 'r1' },
    }),
  })
}
const renderPanel = (p: Parameters<typeof PanelHarness>[0]) =>
  renderToStaticMarkup(h(LocaleProvider, { locale: 'th', children: h(PanelHarness, p) }) as ReactElement)

describe('CartPanel serviceLayout', () => {
  it('WALK_IN: หัวบล็อก "เข้าคิววันนี้" + รายการคิว · ไม่มีวัน/เวลา/มัดจำ', () => {
    const html = renderPanel({ arrivalMode: 'WALK_IN' })
    expect(html).toContain('>เข้าคิววันนี้</h5>')
    expect(html).toContain('เข้าคิวงานไหน')
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?หน้าร้าน/)
    for (const gone of ['วันเข้าใช้บริการ', 'วันที่นัด', 'มัดจำที่เก็บ']) expect(html).not.toContain(gone)
  })

  it('[blocker] WALK_IN: ปุ่มบันทึก "… · เข้าคิววันนี้" (v13) · BOOKED: คำเดิม', () => {
    expect(renderPanel({ arrivalMode: 'WALK_IN' })).toContain('บันทึกคำสั่งซื้อ · เข้าคิววันนี้')
    expect(renderPanel({ arrivalMode: 'BOOKED' })).not.toContain('· เข้าคิววันนี้')
  })

  it('BOOKED: หัวบล็อก "วันเข้าใช้บริการ"', () => {
    const html = renderPanel({ arrivalMode: 'BOOKED' })
    expect(html).toContain('>วันเข้าใช้บริการ</h5>')
    expect(html).not.toContain('เข้าคิวงานไหน')
  })

  it('"เพิ่มเติม" กาง: ช่องทาง → ชำระเงิน → ส่วนลด → VAT → หมายเหตุ (+ คำรับประกันว่าผู้ซื้อ/ลูกค้าไม่เห็น)', () => {
    const html = renderPanel({ arrivalMode: 'BOOKED', forceMoreOpen: true })
    const more = html.slice(html.indexOf('</span> เพิ่มเติม<'))
    expectAscending(
      order(more, [
        'for="cp-sales-channel"',
        'for="cp-payment-method"',
        'for="cp-discount"',
        'for="cp-vat"',
        'for="cp-note"',
        'ไม่เห็นข้อความนี้',
        'ยอดรวมรายการ',
      ]),
    )
    expect(html).toContain('aria-expanded="true"')
  })

  it('footer: ส่วนลด > 0 แสดงเป็นบรรทัดอ่านอย่างเดียว', () => {
    const html = renderPanel({ arrivalMode: 'BOOKED', discount: 50 })
    expect(footerOf(html)).toMatch(/<span>ส่วนลด<\/span><span>− ฿50\.00<\/span>/)
    expect(footerOf(html)).not.toContain('<input')
  })
})

describe('[blocker] regression เดสก์ท็อป — แผงเดิม', () => {
  const legacy = (html: string, dateLabel: string) => {
    expectAscending(
      order(html, [
        'ยังไม่มีรายการ',
        '</span> ลูกค้า<',
        'ชำระเงิน / ช่องทาง',
        `>${dateLabel}</span>`,
        '</span> หมายเหตุ',
        'ยอดรวมรายการ',
        'aria-label="ส่วนลด (บาท)"',
        'aria-label="VAT (เปอร์เซ็นต์)"',
        'รวมทั้งสิ้น',
      ]),
    )
    expect(html).not.toContain('ลูกค้ามาแบบไหน')
    expect(html).not.toContain('</span> เพิ่มเติม<')
    // ลูกค้าพับเป็นค่าเริ่มเหมือนเดิม
    expect(html).not.toContain('id="cust-name"')
  }

  it('ร้านขายออนไลน์', () => legacy(renderDesktop('ONLINE_SALES'), ORDER_VOCAB.ONLINE_SALES.dateLabel))
  it('ร้านบ้านพัก', () => legacy(renderDesktop('LODGING'), ORDER_VOCAB.LODGING.dateLabel))
  it('ร้านบริการ หน้าแก้ไข: + accordion "วันเข้าใช้บริการ" แบบเดิม (ปุ่มพับ)', () => {
    const html = renderDesktop('SERVICE_QUEUE', { editOrderToken: 'tok-1' })
    legacy(html, ORDER_VOCAB.SERVICE_QUEUE.dateLabel)
    expect(html).toContain('</span> วันเข้าใช้บริการ')
    expect(html).not.toContain('>วันเข้าใช้บริการ</h5>')
  })
})
