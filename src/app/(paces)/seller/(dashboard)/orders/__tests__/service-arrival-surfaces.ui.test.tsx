/**
 * 00086 P2 QA — งานหน้าร้าน/จองล่วงหน้า บนจอฝั่งร้าน (ร้านบริการเท่านั้น)
 *
 *  FR-001: งานหน้าร้านขึ้น "รอเริ่มงาน" (ไม่ใช่ "จองแล้ว"/"นัดแล้ว") แม้มีเวลาเริ่มตั้งแต่สร้าง
 *  FR-002: ชิปแบบการมาติดทั้ง "จองล่วงหน้า" และ "หน้าร้าน" (การ์ดนัดหน้างาน · การ์ดงานในแชทเดสก์ท็อป)
 *  v13: ปุ่มบันทึกของงานหน้าร้าน = "บันทึกงานบริการ · เข้าคิววันนี้" (มือถือ QuickSummaryPanel)
 *
 * mutation ที่ต้องแดง: ถอด `arrivalMode: arrival` ที่ OrderCardView ⇒ "รอเริ่มงาน" แดง ·
 * ส่ง arrivalChipMeta เฉพาะ WALK_IN ⇒ "จองล่วงหน้า" แดง · เลิกกั้น usesServiceFinanceRules ⇒ regression ร้านขายของแดง
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h, type ReactElement } from 'react'
import { useForm } from 'react-hook-form'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/orders/x',
  useSearchParams: () => new URLSearchParams(),
}))

import AppointmentCard from '../[token]/components/AppointmentCard'
import OrderCardView, { type OrderCardViewData } from '@/app/(paces)/seller/(chat)/_components/OrderCardView'
import QuickSummaryPanel from '../new/components/QuickSummaryPanel'
import type { FormValues } from '../new/components/OrderCreateForm'

const count = (html: string, word: string) => html.split(word).length - 1

// ── การ์ด "การนัดหมาย" หน้างาน ──────────────────────────────────────────────
const CREATED = '2026-10-27T03:00:00.000Z'
const FAR = '2026-10-30T03:00:00.000Z'
const renderApptCard = (
  arrivalMode: string | null,
  startISO = FAR,
  stage: 'SCHEDULED' | 'COMPLETED' = 'SCHEDULED',
  hideStageBadge?: boolean,
) =>
  renderToStaticMarkup(
    h(AppointmentCard, {
      ...(hideStageBadge === undefined ? {} : { hideStageBadge }),
      publicToken: 'tok',
      startISO,
      endISO: null,
      allDay: false,
      resourceName: 'ช่าง A',
      resourceId: 'r1',
      stage,
      rescheduleCount: 0,
      rescheduleRequestNote: null,
      createdAtISO: CREATED,
      arrivalMode,
    }),
  )

describe('AppointmentCard (หน้างาน)', () => {
  it('[blocker] จองล่วงหน้า ⇒ ชิป "จองล่วงหน้า" + ป้าย "นัดแล้ว"', () => {
    const html = renderApptCard('BOOKED')
    expect(count(html, 'จองล่วงหน้า')).toBe(1)
    expect(html).toContain('นัดแล้ว')
    expect(html).not.toContain('หน้าร้าน')
  })

  it('[blocker] หน้าร้าน ⇒ ชิป "หน้าร้าน" + ป้าย "รอเริ่มงาน" (ไม่ใช่ "นัดแล้ว")', () => {
    const html = renderApptCard('WALK_IN')
    expect(count(html, 'หน้าร้าน')).toBe(1)
    expect(html).toContain('รอเริ่มงาน')
    expect(html).not.toContain('นัดแล้ว')
    // title ของชิปหน้าร้านมีวลี "ไม่ได้จองล่วงหน้า" — นับเฉพาะป้ายที่เห็น
    expect(html).not.toContain('>จองล่วงหน้า<')
  })

  // 00086 critique P0 — สถานะเดียวต่อจอ: หน้าที่มีการ์ด "งานนี้" ส่ง hideStageBadge ⇒ เหลือแค่ชิปแบบการมา
  it('[blocker] hideStageBadge ⇒ ไม่มีป้ายขั้นนัด (รอเริ่มงาน/นัดแล้ว/ให้บริการแล้ว) แต่ชิปแบบการมายังอยู่', () => {
    const walk = renderApptCard('WALK_IN', FAR, 'SCHEDULED', true)
    expect(count(walk, 'หน้าร้าน')).toBe(1)
    expect(walk).not.toContain('รอเริ่มงาน')
    const booked = renderApptCard('BOOKED', FAR, 'SCHEDULED', true)
    expect(booked).toContain('>จองล่วงหน้า<')
    expect(booked).not.toContain('นัดแล้ว')
    const done = renderApptCard('BOOKED', FAR, 'COMPLETED', true)
    expect(done).not.toContain('ให้บริการแล้ว')
  })

  it('ไม่ส่ง hideStageBadge (ค่าตั้งต้น — ร้านอื่น/ใบที่ไม่มีการ์ดงาน) ⇒ ป้ายขั้นนัดเดิมอยู่ครบ', () => {
    expect(renderApptCard('BOOKED', FAR, 'COMPLETED')).toContain('ให้บริการแล้ว')
    expect(renderApptCard('BOOKED', FAR, 'SCHEDULED', false)).toContain('นัดแล้ว')
  })

  it('ใบเก่าไม่มีค่าเก็บ ⇒ สูตรเดิม (เวลาห่าง = จองล่วงหน้า · เวลาเดียวกับเปิดบิล = หน้าร้าน)', () => {
    expect(renderApptCard(null, FAR)).toContain('จองล่วงหน้า')
    const walk = renderApptCard(null, CREATED)
    expect(walk).toContain('หน้าร้าน')
    expect(walk).toContain('รอเริ่มงาน')
  })
})

// ── การ์ดงานในแชท (แผงขวาเดสก์ท็อป + ฟองแชท) ───────────────────────────────
const CARD: OrderCardViewData = {
  token: 'tok-abcdef12',
  orderNo: 'DP1',
  status: 'PENDING',
  totalAmount: '500.00',
  items: [{ name: 'ล้างรถ', qty: 1, price: '500.00', imageFileId: null }],
  shipment: null,
  hasManualTracking: false,
  fulfillmentMode: 'NO_SHIPPING',
  vertical: 'SERVICE_QUEUE',
  serviceStart: FAR,
  serviceEnd: null,
  appointmentStatus: 'SCHEDULED',
  serviceClosedAt: null,
  createdAt: CREATED,
  arrivalMode: null,
}
const renderCard = (patch: Partial<OrderCardViewData>, side: 'seller' | 'buyer' = 'seller') =>
  renderToStaticMarkup(h(OrderCardView, { data: { ...CARD, ...patch }, side }))

describe('OrderCardView — ร้านบริการ', () => {
  it('[blocker] หน้าร้าน ⇒ ป้าย "รอเริ่มงาน" + ชิป "หน้าร้าน" (ไม่ใช่ "จองแล้ว")', () => {
    const html = renderCard({ arrivalMode: 'WALK_IN' })
    expect(html).toContain('รอเริ่มงาน')
    expect(html).not.toContain('จองแล้ว')
    expect(count(html, 'หน้าร้าน')).toBe(1)
  })

  it('[blocker] จองล่วงหน้า ⇒ ป้าย "จองแล้ว" + ชิป "จองล่วงหน้า"', () => {
    const html = renderCard({ arrivalMode: 'BOOKED' })
    expect(html).toContain('จองแล้ว')
    expect(count(html, 'จองล่วงหน้า')).toBe(1)
    expect(html).not.toContain('รอเริ่มงาน')
  })

  it('ยังไม่ระบุเวลา ⇒ ชิป "ยังไม่ระบุเวลา" ชุดเดียวกับแถบงานในแชทมือถือ (OrderProgressBar)', () => {
    const html = renderCard({ serviceStart: null, arrivalMode: null })
    expect(html).toContain('ยังไม่ระบุเวลา')
    expect(html).toContain('รอเริ่มงาน')
  })

  it('caller เก่า (ไม่ส่ง arrivalMode/createdAt) ⇒ ป้ายเดิม ไม่มีชิป', () => {
    const html = renderCard({ arrivalMode: undefined, createdAt: undefined })
    expect(html).toContain('จองแล้ว')
    for (const chip of ['จองล่วงหน้า', 'หน้าร้าน', 'ยังไม่ระบุเวลา']) expect(html).not.toContain(chip)
  })

  it('[blocker] ฝั่งร้าน ส่งเวลาเริ่ม/ทำเสร็จ ⇒ ป้ายขั้นเดียวกับการ์ดงาน (มติ 2026-10-30 · หนึ่งหน้า หนึ่งป้ายสถานะ)', () => {
    const started = renderCard({ arrivalMode: 'WALK_IN', serviceStartedAt: CREATED })
    expect(started).toContain('กำลังให้บริการ')
    expect(started).not.toContain('รอเริ่มงาน')
    expect(renderCard({ arrivalMode: 'BOOKED', serviceStartedAt: CREATED, serviceFinishedAt: CREATED })).toContain('ทำเสร็จ · รอปิดงาน')
  })

  it('[blocker] ฝั่งลูกค้า ไม่เห็นขั้นภายในร้าน แม้ข้อมูลมีเวลาเริ่ม/ทำเสร็จ', () => {
    const html = renderCard({ arrivalMode: 'WALK_IN', serviceStartedAt: CREATED, serviceFinishedAt: CREATED }, 'buyer')
    expect(html).toContain('รับงานแล้ว')
    for (const w of ['กำลังให้บริการ', 'ทำเสร็จ · รอปิดงาน', 'รอเริ่มงาน']) expect(html).not.toContain(w)
  })

  it('ฝั่งลูกค้า ⇒ ได้ป้าย "รับงานแล้ว" แต่ไม่มีชิปแบบการมา (ข้อมูลภายในร้าน)', () => {
    const html = renderCard({ arrivalMode: 'WALK_IN' }, 'buyer')
    expect(html).toContain('รับงานแล้ว')
    expect(html).not.toContain('หน้าร้าน')
  })

  it('[blocker] ร้านขายของ ⇒ ไม่มีชิปแบบการมา/ป้ายงานบริการ แม้ส่งค่ามา', () => {
    const html = renderCard({ vertical: 'ONLINE_SALES', arrivalMode: 'WALK_IN' })
    for (const w of ['หน้าร้าน', 'จองล่วงหน้า', 'รับงานแล้ว', 'รอเริ่มงาน', 'กำลังให้บริการ', 'ยังไม่ระบุเวลา']) expect(html).not.toContain(w)
  })
})

// ── ปุ่มบันทึกมือถือ ───────────────────────────────────────────────────────────
function SummaryHarness(props: { arrivalMode?: 'BOOKED' | 'WALK_IN'; orderNoun: string }) {
  const { control } = useForm<FormValues>({ defaultValues: { items: [] } as never })
  return h(QuickSummaryPanel, { control, subtotal: 0, total: 0, orderNoun: props.orderNoun, arrivalMode: props.arrivalMode })
}
const renderSummary = (p: Parameters<typeof SummaryHarness>[0]) =>
  renderToStaticMarkup(h(SummaryHarness, p) as ReactElement)

describe('QuickSummaryPanel — ปุ่มบันทึก (v13)', () => {
  it('[blocker] หน้าร้าน ⇒ "บันทึกงานบริการ · เข้าคิววันนี้"', () => {
    expect(renderSummary({ arrivalMode: 'WALK_IN', orderNoun: 'งานบริการ' })).toContain('บันทึกงานบริการ · เข้าคิววันนี้')
  })
  it('[blocker] จองล่วงหน้า / ไม่ส่ง (ร้านอื่น/หน้าแก้ไข) ⇒ คำเดิม', () => {
    const booked = renderSummary({ arrivalMode: 'BOOKED', orderNoun: 'งานบริการ' })
    expect(booked).toContain('บันทึกงานบริการ')
    expect(booked).not.toContain('เข้าคิววันนี้')
    expect(renderSummary({ orderNoun: 'คำสั่งซื้อ' })).not.toContain('เข้าคิววันนี้')
  })
})
