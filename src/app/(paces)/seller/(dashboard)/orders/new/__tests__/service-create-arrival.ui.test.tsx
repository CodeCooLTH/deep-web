/**
 * ฟอร์มสร้างออเดอร์มือถือของร้านบริการ — "ลูกค้ามาแบบไหน" (00086 P2-T4 · prototype v13)
 *
 * render จริงเป็น HTML แล้วยืนยัน:
 *  - ร้านบริการตอนสร้าง: ลำดับ section ใหม่ · ค่าเริ่ม "จองล่วงหน้า" · ไม่มี "ไม่บังคับ — ข้ามได้"
 *  - หน้าร้าน (WALK_IN): ซ่อนวัน/เวลา/มัดจำ · โชว์รายการคิว + บรรทัดเวลา
 *  - ChannelPaymentSelect variant="row": ค่า + [เปลี่ยน] · ล็อก = ข้อความเดิม ไม่มีปุ่ม
 *  - [blocker] regression: ร้านที่ไม่ใช่บริการ + หน้าแก้ไขร้านบริการ ได้ลำดับเดิม
 *
 * mutation ที่ต้องแดง: QuickForm สลับ `if (serviceLayout)` เป็นเงื่อนไขเสมอจริง → regression แดง ·
 * AppointmentBlock แสดงคำ "ไม่บังคับ" ทุกโหมด → service create แดง
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h, type ReactElement } from 'react'
import { useForm, type Control } from 'react-hook-form'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/orders/new',
  useSearchParams: () => new URLSearchParams(),
}))

import OrderCreateForm, { type FormValues } from '../components/OrderCreateForm'
import AppointmentBlock, { type ServiceResourceOption } from '../components/AppointmentBlock'
import ChannelPaymentSelect from '../components/ChannelPaymentSelect'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { ORDER_VOCAB } from '@/lib/seller-menu'

// คลาสของชิปแบบเดิม (ChannelPaymentSelect variant grid) — เก็บในค่าคงที่ ไม่ให้ guard ใน orders/__tests__/mobile-affordance.test.ts อ่านเป็น element จริง
const OLD_CHIP = 'min-h-11 lg:min-h-0 border border-default-300'

const RESOURCES: ServiceResourceOption[] = [
  { id: 'r1', name: 'ช่างเอ', durationMinutes: 60, capacity: 2, depositMode: 'FIXED', depositValue: '100' },
  { id: 'r2', name: 'ช่างบี', durationMinutes: null, capacity: 3, depositMode: 'FIXED', depositValue: '0' },
]

type Vertical = 'SERVICE_QUEUE' | 'ONLINE_SALES' | 'LODGING'
function renderForm(vertical: Vertical, extra: Record<string, unknown> = {}): string {
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
  // QuickForm (มือถือ) มาก่อนแผงเดสก์ท็อปเสมอ — ตัดเฉพาะส่วนมือถือ
  const cut = html.indexOf('hidden lg:grid')
  expect(cut).toBeGreaterThan(0)
  return html.slice(0, cut)
}

/** ตำแหน่งของ label ตามลำดับ — label ที่หาไม่เจอ = -1 */
function order(html: string, labels: string[]): number[] {
  return labels.map((l) => html.indexOf(l))
}
function expectAscending(positions: number[]) {
  for (const p of positions) expect(p).toBeGreaterThanOrEqual(0)
  for (let i = 1; i < positions.length; i++) expect(positions[i]).toBeGreaterThan(positions[i - 1])
}

describe('ร้านบริการ — สร้าง (serviceLayout)', () => {
  const html = renderForm('SERVICE_QUEUE')
  const v = ORDER_VOCAB.SERVICE_QUEUE

  it('ลำดับ v13: ลูกค้า → วันที่ → ลูกค้ามาแบบไหน → รายการ → วันเข้าใช้บริการ → เพิ่มเติม (ช่องทาง/ชำระ → ส่วนลด/VAT/หมายเหตุ)', () => {
    expectAscending(
      order(html, [
        '>ลูกค้า</h2>',
        `>${v.dateLabel}</span>`,
        '>ลูกค้ามาแบบไหน</h2>',
        'id="order-items-section"',
        '>วันเข้าใช้บริการ</h4>',
        '>เพิ่มเติม</h2>',
        'ช่องทางการขาย',
        'การชำระเงิน',
        'ส่วนลด (บาท)',
        'VAT (%)',
        'หมายเหตุ',
      ]),
    )
  })

  it('ค่าเริ่ม = จองล่วงหน้า (aria-pressed) · มีทั้งสองตัวเลือกพร้อมคำอธิบาย', () => {
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?จองล่วงหน้า/)
    expect(html).toMatch(/aria-pressed="false"[^>]*>.*?หน้าร้าน<\/span><span class="text-xs">ลูกค้าอยู่ที่ร้านตอนนี้/)
    expect(html).toContain('นัดวันและเวลา')
  })

  it('[blocker] ไม่มีคำ "ไม่บังคับ — ข้ามได้" ในร้านบริการตอนสร้าง', () => {
    expect(html).not.toContain('ไม่บังคับ')
  })

  it('ช่องทาง/ชำระเงินเป็นแถว ค่า + [เปลี่ยน] (หน้าร้าน/เงินสดตามค่าเริ่ม)', () => {
    const more = html.slice(html.indexOf('>เพิ่มเติม</h2>'))
    expect(more).toContain('aria-label="เปลี่ยนช่องทางการขาย ค่าปัจจุบันคือ หน้าร้าน"')
    expect(more).toContain('aria-label="เปลี่ยนการชำระเงิน ค่าปัจจุบันคือ เงินสด"')
    // ชิปแบบเดิม (chevron) ต้องไม่อยู่ในฟอร์มนี้แล้ว
    expect(html).not.toContain(OLD_CHIP)
  })
})

describe('[blocker] regression — ฟอร์มเดิม', () => {
  const legacyOrder = (html: string, dateLabel: string) =>
    expectAscending(order(html, ['>ลูกค้า</h2>', 'ช่องทางการขาย', `>${dateLabel}</span>`, 'id="order-items-section"', '>เพิ่มเติม</h2>']))

  it('ร้านขายออนไลน์: ช่องทางอยู่บน ไม่มี "ลูกค้ามาแบบไหน"', () => {
    const html = renderForm('ONLINE_SALES')
    legacyOrder(html, ORDER_VOCAB.ONLINE_SALES.dateLabel)
    expect(html).not.toContain('ลูกค้ามาแบบไหน')
    expect(html).not.toContain('>เปลี่ยน</button></div></div><div class="flex w-full items-center gap-3 py-2.5">')
  })

  it('ร้านบ้านพัก: ลำดับเดิม', () => {
    const html = renderForm('LODGING')
    legacyOrder(html, ORDER_VOCAB.LODGING.dateLabel)
    expect(html).not.toContain('ลูกค้ามาแบบไหน')
  })

  it('ร้านบริการ หน้าแก้ไข: ลำดับเดิม + บล็อกนัดแบบเดิม ("ไม่บังคับ — ข้ามได้")', () => {
    const html = renderForm('SERVICE_QUEUE', { editOrderToken: 'tok-1' })
    legacyOrder(html, ORDER_VOCAB.SERVICE_QUEUE.dateLabel)
    expect(html).not.toContain('ลูกค้ามาแบบไหน')
    expect(html).toContain('ไม่บังคับ — ข้ามได้ถ้าลูกค้ายังไม่ระบุวัน')
    // ช่องทางยังเป็นชิปเดิม (variant grid)
    expect(html).toContain(OLD_CHIP)
  })
})

// ── AppointmentBlock โหมดต่าง ๆ — harness ที่ถือ useForm เอง (ค่าเริ่มกำหนดได้) ──
function Harness(props: {
  mode?: 'BOOKED' | 'WALK_IN'
  appointment?: FormValues['appointment']
  render: (control: Control<FormValues>, appointment: FormValues['appointment']) => ReactElement
}) {
  const { control } = useForm<FormValues>({
    defaultValues: { appointment: props.appointment, salesChannel: 'STOREFRONT', paymentMethod: 'CASH' },
  })
  return props.render(control, props.appointment)
}
function renderBlock(mode: 'BOOKED' | 'WALK_IN' | undefined, appointment: FormValues['appointment'] = {}) {
  return renderToStaticMarkup(
    h(Harness, {
      appointment,
      render: (control, ap) =>
        h(AppointmentBlock, {
          control,
          errors: {},
          setValue: () => {},
          resources: RESOURCES,
          granularity: 'TIME',
          total: 500,
          idPrefix: 'm',
          mode,
          value: { ...ap },
        }),
    }),
  )
}

describe('AppointmentBlock', () => {
  it('WALK_IN: "เข้าคิววันนี้" + รายการคิว (ชื่อ + N คิว) + บรรทัดเวลา · ไม่มีวัน/เวลา/มัดจำ', () => {
    const html = renderBlock('WALK_IN', { resourceId: 'r1' })
    expect(html).toContain('>เข้าคิววันนี้</h4>')
    expect(html).toContain('เข้าคิวงานไหน')
    expect(html).toContain('ช่างเอ')
    expect(html).toContain('2 คิว')
    expect(html).toContain('3 คิว')
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?ช่างเอ/)
    expect(html).toMatch(/เริ่ม \d\d:\d\d — ประมาณ \d\d:\d\d น\. ของวันนี้ · ไม่ต้องเลือกวันเวลา · ไม่เก็บมัดจำ/)
    for (const gone of ['วันที่นัด', 'มัดจำที่เก็บ', 'วันเข้าใช้บริการ', 'ไม่บังคับ']) expect(html).not.toContain(gone)
  })

  it('BOOKED: วันที่นัด* + เวลา* + มัดจำ · ไม่มี "ไม่บังคับ"', () => {
    const html = renderBlock('BOOKED', { resourceId: 'r1', date: '2026-10-28', startTime: '10:00', endTime: '11:00' })
    expect(html).toContain('>วันเข้าใช้บริการ</h4>')
    expect(html).toContain('ประเภทงาน')
    expect(html).toContain('วันที่นัด<span class="ms-0.5 text-danger">*</span>')
    expect(html).toContain('เวลา<span class="ms-0.5 text-danger">*</span>')
    expect(html).toContain('10:00–11:00')
    expect(html).toContain('มัดจำที่เก็บ')
    expect(html).not.toContain('ไม่บังคับ')
    expect(html).not.toContain('เข้าคิวงานไหน')
  })

  it('BOOKED ร้านรายวัน: ไม่มีช่องเวลา', () => {
    const html = renderToStaticMarkup(
      h(Harness, {
        appointment: { resourceId: 'r1', date: '2026-10-28' },
        render: (control, ap) =>
          h(AppointmentBlock, {
            control, errors: {}, setValue: () => {}, resources: RESOURCES, granularity: 'DAY',
            total: 500, idPrefix: 'm', mode: 'BOOKED', value: { ...ap },
          }),
      }),
    )
    expect(html).toContain('วันที่นัด<span class="ms-0.5 text-danger">*</span>')
    expect(html).not.toContain('id="m-appt-time"')
  })

  it('ไม่ส่ง mode = บล็อกเดิม ("วันและเวลาที่นัด" ปุ่มเดียว + "ไม่บังคับ")', () => {
    const html = renderBlock(undefined, { resourceId: 'r1', date: '2026-10-28' })
    expect(html).toContain('ไม่บังคับ — ข้ามได้ถ้าลูกค้ายังไม่ระบุวัน')
    expect(html).toContain('>วันและเวลาที่นัด</label>')
    expect(html).not.toContain('id="m-appt-time"')
  })
})

describe('ChannelPaymentSelect', () => {
  const render = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      h(Harness, { render: (control) => h(ChannelPaymentSelect, { control, ...props }) }),
    )

  it('row: ค่า + ปุ่ม [เปลี่ยน] ทั้งสองแถว', () => {
    const html = render({ variant: 'row' })
    expect(html.match(/>เปลี่ยน<\/button>/g)).toHaveLength(2)
    expect(html).toContain('หน้าร้าน')
    expect(html).toContain('เงินสด')
    expect(html).not.toContain('ล็อกตามช่องทางที่ลูกค้าทักมา')
  })

  it('row + ล็อก: ข้อความเหตุผลเดิม ไม่มีปุ่มเปลี่ยนช่องทาง (ชำระเงินยังเปลี่ยนได้)', () => {
    const html = render({ variant: 'row', channelLocked: true })
    expect(html).toContain('ล็อกตามช่องทางที่ลูกค้าทักมา')
    expect(html.match(/>เปลี่ยน<\/button>/g)).toHaveLength(1)
    expect(html).not.toContain('เปลี่ยนช่องทางการขาย')
    expect(html).toContain('เปลี่ยนการชำระเงิน')
  })

  it('[blocker] ค่าตั้งต้น (grid) = ชิปเดิม ไม่มีปุ่ม "เปลี่ยน"', () => {
    const html = render({})
    expect(html).not.toContain('>เปลี่ยน</button>')
    expect(html).toContain(OLD_CHIP)
    expect(html).toContain('sm:grid sm:grid-cols-2')
  })
})
