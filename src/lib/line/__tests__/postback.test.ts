import { describe, it, expect } from 'vitest'
import { describeLinePostback } from '@/lib/line/postback'

describe('describeLinePostback', () => {
  it('ใช้ label ที่เราแนบมากับ data เป็นหลัก (อ่านง่ายที่สุดสำหรับผู้ขาย)', () => {
    expect(describeLinePostback('action=confirm&label=ยืนยันคำสั่งซื้อ')).toBe(
      'ลูกค้าแตะปุ่ม: ยืนยันคำสั่งซื้อ',
    )
  })

  it('ไม่มี label → ถอยไปใช้ action', () => {
    expect(describeLinePostback('action=confirm')).toBe('ลูกค้าแตะปุ่ม: confirm')
  })

  it('data ที่ไม่ใช่ query string (เช่น rich menu ที่ตั้งใน LINE OA Manager) → แสดงดิบ', () => {
    expect(describeLinePostback('richmenu-changed-to-b')).toBe('ลูกค้าแตะปุ่ม: richmenu-changed-to-b')
  })

  it('datetimepicker → ต่อท้ายด้วยค่าที่ลูกค้าเลือก', () => {
    const t = describeLinePostback('action=book&label=เลือกวันเข้าใช้บริการ', { datetime: '2026-08-12T10:00' })
    expect(t).toContain('เลือกวันเข้าใช้บริการ')
    expect(t).toContain('2026-08-12T10:00')
  })

  it('รองรับ mode date/time ไม่ใช่แค่ datetime', () => {
    expect(describeLinePostback('label=วันนัด', { date: '2026-08-12' })).toContain('2026-08-12')
    expect(describeLinePostback('label=เวลานัด', { time: '10:00' })).toContain('10:00')
  })

  it('[blocker] ต้องไม่คืนข้อความว่างไม่ว่าอินพุตจะเพี้ยนแค่ไหน — บับเบิลว่างในเธรดตีความไม่ได้เลย', () => {
    for (const data of ['', '   ', '=', '&&&']) {
      const t = describeLinePostback(data)
      expect(t.trim().length).toBeGreaterThan(0)
      expect(t).toContain('ลูกค้าแตะปุ่ม')
    }
  })

  it('ตัดความยาวไม่ให้บับเบิลบวม (data ของ LINE ยาวได้ถึง 300 ตัวอักษร)', () => {
    const t = describeLinePostback(`label=${'ก'.repeat(300)}`)
    expect(t.length).toBeLessThan(200)
  })
})
