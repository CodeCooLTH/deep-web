/**
 * "อื่น ๆ" สะกดได้ 2 แบบ (label ใหม่มีเว้นวรรค · แถวเก่าไม่มี) — ต้องตัดบรรทัดขนส่งเหมือนกันทุกจุด
 * + provider เก่าต้อง prefill ลง ShipForm ได้ (providerToOptionLabel)
 */
import { describe, expect, it } from 'vitest'
import { trackingMessage } from '@/lib/chat-shipment-panel'
import { buildTemplateValues, type AutoNotifySnapshot } from '@/lib/auto-notify/values'
import { isOtherCourier, providerToOptionLabel, COURIER_OPTIONS } from '@/lib/iship/courier'

const snap = (courierName: string | null): AutoNotifySnapshot => ({
  vertical: 'ONLINE_SALES', shopName: 'ร้าน', buyerName: 'ก', orderNo: 'A-1', publicToken: 't',
  createdAt: new Date('2026-06-07T03:00:00Z'), totalAmount: 1, firstItemName: 'x', itemCount: 1,
  courierName, trackingNo: 'TH1', trackingLink: null, serviceName: null, appointmentStart: null,
  appointmentEnd: null, depositAmount: null, serviceStartedAt: null, serviceClosedAt: null,
})

describe('isOtherCourier', () => {
  it.each(['อื่น ๆ', 'อื่นๆ', ' อื่น ๆ ', 'OTHER'])('%s = อื่น ๆ', (p) => expect(isOtherCourier(p)).toBe(true))
  it.each(['Kerry Express', '', null, undefined])('%s ไม่ใช่', (p) => expect(isOtherCourier(p)).toBe(false))
})

describe('ข้อความถึงลูกค้าไม่มี "จัดส่งด้วย อื่น ๆ"', () => {
  it.each(['อื่น ๆ', 'อื่นๆ'])('trackingMessage MANUAL (%s)', (p) => {
    expect(trackingMessage('MANUAL', 'TH1', p)).toBe('เลขติดตามพัสดุ: TH1')
  })
  it.each(['อื่น ๆ', 'อื่นๆ'])('ตัวแปร ขนส่ง ของ TRACKING ว่าง (%s)', (p) => {
    expect(buildTemplateValues('TRACKING', snap(p)).ขนส่ง).toBe('')
  })
  it('ขนส่งจริงยังแสดง', () => {
    expect(buildTemplateValues('TRACKING', snap('Flash Express')).ขนส่ง).toBe('Flash Express')
  })
})

describe('providerToOptionLabel — prefill แถวเก่า', () => {
  const labels = COURIER_OPTIONS.map((o) => o.label)
  it('ค่าเก่า/ใหม่ resolve เป็น label ที่อยู่ในตัวเลือกปัจจุบันเสมอ', () => {
    for (const p of ['Thailand Post', 'อื่นๆ', 'อื่น ๆ', 'Kerry Express', 'J&T Express', 'DHL', 'ไปรษณีย์ไทย']) {
      expect(labels, p).toContain(providerToOptionLabel(p))
    }
    expect(providerToOptionLabel('Thailand Post')).toBe('ไปรษณีย์ไทย')
    expect(providerToOptionLabel('อื่นๆ')).toBe('อื่น ๆ')
  })
  it('ไม่รู้จัก/ว่าง = "" (ไม่เดาให้)', () => {
    for (const p of ['ขนส่งแปลก', '', null, undefined]) expect(providerToOptionLabel(p)).toBe('')
  })
})
