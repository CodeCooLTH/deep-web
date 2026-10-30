import { describe, expect, it } from 'vitest'
import { trackingMessage } from '@/lib/chat-shipment-panel'
import { DEFAULT_TEMPLATES } from '../defaults'
import { renderTemplate } from '../render'
import { buildTemplateValues, customerDisplayName, itemsText, type AutoNotifySnapshot } from '../values'
import { variableNamesOf } from '../variables'
import { AUTO_NOTIFY_KINDS } from '../ledger-constants'

const snap = (o: Partial<AutoNotifySnapshot> = {}): AutoNotifySnapshot => ({
  vertical: 'ONLINE_SALES',
  shopName: 'ร้านดีดี',
  buyerName: 'คุณสมชาย',
  orderNo: 'A-1',
  publicToken: 'tok123',
  createdAt: new Date('2026-06-07T03:00:00Z'),
  totalAmount: 1290,
  firstItemName: 'เสื้อยืด',
  itemCount: 1,
  courierName: null,
  trackingNo: null,
  trackingLink: null,
  serviceName: null,
  appointmentStart: null,
  appointmentEnd: null,
  depositAmount: null,
  serviceStartedAt: null,
  serviceClosedAt: null,
  ...o,
})
const BASE = (process.env.NEXT_PUBLIC_BUYER_URL || 'https://deepthailand.app').replace(/\/+$/, '')
const render = (kind: Parameters<typeof buildTemplateValues>[0], s: AutoNotifySnapshot, body = DEFAULT_TEMPLATES[kind]) => {
  const r = renderTemplate(body, buildTemplateValues(kind, s))
  return r.ok ? r.text : r.reason
}

describe('customerDisplayName (TC-112)', () => {
  it.each([
    ['คุณสมชาย', 'สมชาย'],
    ['คุณ สมชาย', 'สมชาย'],
    ['  คุณสมชาย  ', 'สมชาย'],
    ['สมชาย', 'สมชาย'],
    ['คุณ', 'ลูกค้า'],
    ['', 'ลูกค้า'],
    [null, 'ลูกค้า'],
    ['   ', 'ลูกค้า'],
    ['คุณากร', 'คุณากร'], // ชื่อคนที่ขึ้นต้นด้วยตัวอักษรเหล่านี้ ห้ามกินครึ่งชื่อ
  ])('%s → %s', (inp, out) => expect(customerDisplayName(inp)).toBe(out))
})

describe('itemsText — D-1', () => {
  it('รายการเดียว = ชื่อล้วน · หลายรายการ = ชื่อแรก และอีก N-1 · ไม่มีชื่อใช้คำเรียก', () => {
    expect(itemsText('เสื้อ', 1, 'คำสั่งซื้อ')).toBe('เสื้อ')
    expect(itemsText('เสื้อ', 3, 'คำสั่งซื้อ')).toBe('เสื้อ และอีก 2 รายการ')
    expect(itemsText(null, 1, 'คำสั่งซื้อ')).toBe('คำสั่งซื้อ')
    expect(itemsText('  ', 0, 'คำสั่งซื้อ')).toBe('คำสั่งซื้อ')
  })
})

describe('ค่าตั้งต้น = ข้อความเดิม ทุกตัวอักษร (TC-113 ส่วน unit)', () => {
  it('ORDER_SUMMARY รายการเดียว = linkText เดิมของ messages/route.ts (ยกเว้นเงินผ่าน formatBaht — D-2)', () => {
    const noun = 'คำสั่งซื้อ'
    const legacy = `${noun}: เสื้อยืด\nยอดสุทธิ ฿1,290\n${BASE}/o/tok123`
    expect(render('ORDER_SUMMARY', snap())).toBe(legacy)
  })
  it('ORDER_SUMMARY ไม่มีชื่อรายการ → ใช้คำเรียกเหมือนเดิม · ผันตาม vertical', () => {
    expect(render('ORDER_SUMMARY', snap({ firstItemName: null, itemCount: 0 }))).toBe(
      `คำสั่งซื้อ: คำสั่งซื้อ\nยอดสุทธิ ฿1,290\n${BASE}/o/tok123`,
    )
    expect(render('ORDER_SUMMARY', snap({ vertical: 'LODGING' }))).toMatch(/^บิลเข้าพัก: เสื้อยืด\n/)
  })
  it('ORDER_SUMMARY หลายรายการ = เดิม + " และอีก N รายการ"', () => {
    expect(render('ORDER_SUMMARY', snap({ itemCount: 4 }))).toBe(
      `คำสั่งซื้อ: เสื้อยืด และอีก 3 รายการ\nยอดสุทธิ ฿1,290\n${BASE}/o/tok123`,
    )
  })
  it('ORDER_SUMMARY มีสตางค์ใช้ formatBaht (฿1,234.50)', () => {
    expect(render('ORDER_SUMMARY', snap({ totalAmount: '1234.5' }))).toContain('ยอดสุทธิ ฿1,234.50')
  })
  const link = 'https://app.iship.cloud/tracking?track=TH123'
  it.each([
    ['มีขนส่ง', 'Flash Express'],
    ['ไม่มีขนส่ง', null],
    ['อื่นๆ', 'อื่นๆ'],
  ])('TRACKING (%s) = trackingMessage(ISHIP) เดิม', (_n, courier) => {
    const legacy = trackingMessage('ISHIP', 'TH123', courier === 'อื่นๆ' ? null : courier)
    expect(render('TRACKING', snap({ courierName: courier, trackingNo: 'TH123', trackingLink: link }))).toBe(legacy)
  })
  it('TRACKING ส่งเอง (ไม่มีลิงก์) = trackingMessage(MANUAL) เดิม', () => {
    expect(render('TRACKING', snap({ courierName: 'Kerry', trackingNo: 'K1' }))).toBe(trackingMessage('MANUAL', 'K1', 'Kerry'))
    expect(render('TRACKING', snap({ courierName: 'อื่นๆ', trackingNo: 'K1' }))).toBe(trackingMessage('MANUAL', 'K1', 'อื่นๆ'))
  })
})

describe('ค่าตัวแปรต่อชนิด', () => {
  it('คีย์ที่คืน = ชุดตัวแปรของ kind เป๊ะ (ไม่เกิน ไม่ขาด)', () => {
    for (const k of AUTO_NOTIFY_KINDS) {
      expect(Object.keys(buildTemplateValues(k, snap())).sort()).toEqual([...variableNamesOf(k)].sort())
    }
  })
  it('SERVICE_BOOKED: มัดจำ 0 = บรรทัดหาย · ไม่มีเงินสตางค์ไม่ใส่ .00', () => {
    const s = snap({
      vertical: 'SERVICE_QUEUE',
      serviceName: 'ตัดผม',
      appointmentStart: new Date('2026-08-08T12:00:00Z'),
      appointmentEnd: new Date('2026-08-08T13:00:00Z'),
      totalAmount: 500,
      depositAmount: 0,
    })
    const t = render('SERVICE_BOOKED', s)
    expect(t).toContain('วันและเวลา: 08 ส.ค. 2569 · 19:00–20:00')
    expect(t).toContain('ยอดรวม: ฿500')
    expect(t).not.toContain('มัดจำ')
    expect(render('SERVICE_BOOKED', { ...s, depositAmount: '100.00' })).toContain('มัดจำที่ตกลงไว้: ฿100')
    expect(t.endsWith(`ยืนยันคิวเรียบร้อยค่ะ\n${BASE}/o/tok123`)).toBe(true)
  })
  it('SERVICE_FINISHED (00086): ข้อความ BRD FR-015 + ลิงก์งาน · ไม่มีเงิน/ชื่อช่าง', () => {
    const s = snap({ vertical: 'SERVICE_QUEUE', serviceName: 'ล้างแอร์' })
    expect(render('SERVICE_FINISHED', s)).toBe(`ทำเสร็จแล้ว ดูรูปก่อน-หลังได้ที่ลิงก์งานบริการ\n${BASE}/o/tok123`)
    expect(buildTemplateValues('SERVICE_FINISHED', s)).toEqual({ ชื่อร้าน: 'ร้านดีดี', ชื่อลูกค้า: 'สมชาย', บริการ: 'ล้างแอร์', ลิงก์งาน: `${BASE}/o/tok123` })
  })
  it('SERVICE_CLOSED: ไม่มีเวลาเริ่มงาน → ตัดบรรทัด (เทมเพลตที่ร้านเขียนเอง) · ไม่มีตัวเลขเงินในค่าตั้งต้น', () => {
    const s = snap({ vertical: 'SERVICE_QUEUE', serviceName: 'ตัดผม', serviceClosedAt: new Date('2026-08-08T12:50:00Z') })
    expect(render('SERVICE_CLOSED', s, 'เริ่ม {เวลาเริ่มงาน}\nปิด {เวลาปิดงาน}')).toBe('ปิด 08 ส.ค. 2569 19:50')
    expect(render('SERVICE_CLOSED', s)).not.toMatch(/฿/)
  })
})
