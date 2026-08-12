/**
 * [blocker] การ์ดสรุปนัด — Flex ของ LINE (ส่วนขยาย 00024, 2026-08-11)
 *
 * `altText` คือสิ่งเดียวที่ลูกค้าเห็นใน **รายการแชทและ notification** (flex ไม่ถูกเรนเดอร์
 * ในสองที่นั้น) ถ้าไม่มีวันนัดอยู่ในนั้น ลูกค้าไม่มีทางรู้ว่านัดวันไหนจนกว่าจะเปิดห้องแชท
 */

import { describe, it, expect } from 'vitest'
import { buildAppointmentSummary } from '../../appointment-summary'
import { buildLineFlexAppointmentCard } from '../flex-appointment-card'

const summary = (over?: Partial<Parameters<typeof buildAppointmentSummary>[0]>) =>
  buildAppointmentSummary({
    serviceStart: '2026-08-14T06:00:00.000Z',
    serviceEnd: '2026-08-14T07:00:00.000Z',
    serviceName: 'ล้างแอร์ 2 เครื่อง',
    resourceName: 'ช่างเอ',
    customerName: 'คุณขวัญใจ',
    phone: '085-331-5378',
    totalText: '฿1,200',
    depositText: '฿300',
    ...over,
  })

const URL = 'https://deepthailand.app/o/T1'

/** เก็บ text ทุกก้อนใน bubble แบบไล่ทั้งต้นไม้ — โครงสร้าง flex ซ้อนหลายชั้น */
function collectText(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const n of node) collectText(n, out)
    return out
  }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (o.type === 'text' && typeof o.text === 'string') out.push(o.text)
    for (const v of Object.values(o)) collectText(v, out)
  }
  return out
}

describe('buildLineFlexAppointmentCard', () => {
  it('[สำคัญ] altText มีทั้งวันและเวลา — ไม่ใช่ "ข้อความจากร้าน" ลอย ๆ', () => {
    const { altText } = buildLineFlexAppointmentCard(summary(), URL)
    expect(altText).toContain('ยืนยันนัดหมาย')
    expect(altText).toContain('ส.ค.')
    expect(altText).toContain('13:00')
  })

  it('altText ไม่เกิน 1500 ตัวอักษร (LINE ปฏิเสธทั้งข้อความถ้าเกิน)', () => {
    const long = summary({ serviceName: 'ล้างแอร์'.repeat(600) })
    expect(buildLineFlexAppointmentCard(long, URL).altText.length).toBeLessThanOrEqual(1500)
  })

  it('ทุกบรรทัดของสรุปโผล่ในการ์ด (ไม่ตกหล่นระหว่างแปลงเป็น flex)', () => {
    const s = summary()
    const texts = collectText(buildLineFlexAppointmentCard(s, URL).contents)
    for (const line of s.lines) {
      expect(texts).toContain(line.value)
    }
  })

  it('ข้อความท้ายอยู่ในการ์ดด้วย', () => {
    const texts = collectText(buildLineFlexAppointmentCard(summary(), URL).contents)
    expect(texts).toContain('ยืนยันคิวเรียบร้อยค่ะ')
  })

  it('มีปุ่มเดียวชี้ url ที่ส่งมา และป้ายปุ่ม ≤20 ตัว (เกินแล้ว LINE ตีตกทั้งใบ)', () => {
    const c = buildLineFlexAppointmentCard(summary(), URL).contents as {
      footer: { contents: { action: { type: string; label: string; uri: string } }[] }
    }
    expect(c.footer.contents).toHaveLength(1)
    const a = c.footer.contents[0].action
    expect(a.type).toBe('uri')
    expect(a.uri).toBe(URL)
    expect(a.label.length).toBeLessThanOrEqual(20)
  })

  it('ไม่ใช้สีของฝั่งผู้ขาย — การ์ดนี้ไปโผล่ในแอปลูกค้า (HR7)', () => {
    const json = JSON.stringify(buildLineFlexAppointmentCard(summary(), URL))
    expect(json).toContain('#7367F0') // แบรนด์ Deep ฝั่งผู้ซื้อ
    expect(json).not.toContain('#236dc9') // paces-primary = surface ฝั่งผู้ขาย
    expect(json).not.toContain('#000000')
  })
})
