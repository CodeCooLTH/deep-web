import { describe, it, expect } from 'vitest'
import { daysOutstandingTH, receivableDisplayName, RECEIVABLE_BASIS_NOTE } from '../receivable.service'

/**
 * feature 00067 — TC-017, TC-027 (ส่วนที่เป็นฟังก์ชันบริสุทธิ์)
 *
 * ส่วนที่แตะ prisma ไม่ได้เทสที่นี่ตาม Hard Rule 13 (unit test ห้ามแตะฐาน) — ตรรกะที่ตัดสินใจ
 * จริงถูกสกัดออกมาเป็นฟังก์ชันบริสุทธิ์แล้วทั้งหมด
 */

describe('[blocker] daysOutstandingTH — นับวันตามปฏิทินไทย ไม่ใช่ผลต่าง timestamp', () => {
  // 2026-09-30T17:30:00Z = 2026-10-01 00:30 น. เวลาไทย → วันไทยคือ 1 ต.ค.
  const now = new Date('2026-09-30T17:30:00Z')

  it('บิลของวันนี้ (เวลาไทย) = 0 วัน', () => {
    expect(daysOutstandingTH(new Date('2026-09-30T18:00:00Z'), now)).toBe(0)
  })

  it('บิลเปิด 23:30 ของเมื่อวาน (เวลาไทย) = 1 วัน ไม่ใช่ 0', () => {
    // 2026-09-30T16:30:00Z = 30 ก.ย. 23:30 น. ไทย — ห่างจาก now แค่ 1 ชม. แต่ข้ามวันมาแล้ว
    // การหารด้วย 86400000 จะได้ 0 ซึ่งอ่านว่า "เพิ่งเปิดวันนี้" ทั้งที่ข้ามวันไปแล้ว
    expect(daysOutstandingTH(new Date('2026-09-30T16:30:00Z'), now)).toBe(1)
  })

  it('บิลเมื่อ 23 วันก่อน', () => {
    expect(daysOutstandingTH(new Date('2026-09-08T03:12:00Z'), now)).toBe(23)
  })

  it('บิลที่ลงวันที่ล่วงหน้า (feature 00033 อนุญาต +7 วัน) ไม่ติดลบ', () => {
    expect(daysOutstandingTH(new Date('2026-10-05T03:00:00Z'), now)).toBe(0)
  })

  it('รับสตริง ISO ได้เหมือน Date', () => {
    expect(daysOutstandingTH('2026-09-08T03:12:00Z', now)).toBe(23)
  })

  it('ข้ามเดือน/ข้ามปีต้องยังนับถูก', () => {
    const newYear = new Date('2027-01-02T05:00:00Z') // 2 ม.ค. 2027 เที่ยงวันไทย
    expect(daysOutstandingTH(new Date('2026-12-31T05:00:00Z'), newYear)).toBe(2)
  })
})

describe('[blocker] receivableDisplayName — ห้ามคืนค่าว่าง และห้ามหลุด PII', () => {
  it('ใช้ชื่อที่ร้านกรอกไว้บนบิล', () => {
    expect(receivableDisplayName({ buyerName: 'คุณสมชาย ท.' })).toBe('คุณสมชาย ท.')
  })

  it('ชื่อว่าง/เว้นวรรคล้วน/null → คำแทน ไม่ใช่สตริงว่าง', () => {
    for (const buyerName of [null, '', '   ']) {
      expect(receivableDisplayName({ buyerName })).toBe('ไม่ระบุชื่อ')
    }
  })

  it('ตัดช่องว่างหัวท้ายออก', () => {
    expect(receivableDisplayName({ buyerName: '  คุณวรรณา  ' })).toBe('คุณวรรณา')
  })

  it('ไม่มีทางคืนตัวเลขที่ดูเหมือนเบอร์โทร — ฟังก์ชันรับแค่ buyerName ช่องเดียว', () => {
    // ด่านเชิงชนิด: ถ้าวันหนึ่งมีคนเติม fallback ไปใช้เบอร์ จะต้องเปลี่ยน signature ก่อน
    // ซึ่งจะทำให้เทสนี้ compile ไม่ผ่าน = มีคนถูกบังคับให้อ่านคอมเมนต์เรื่อง PII ก่อน
    const keys = Object.keys({ buyerName: null } satisfies Parameters<typeof receivableDisplayName>[0])
    expect(keys).toEqual(['buyerName'])
  })
})

describe('[blocker] นิยามยอดขายของแท็บนี้ต้องถูกเขียนให้ผู้ใช้เห็น (Hard Rule 16)', () => {
  it('ประโยคนิยามต้องพูดครบ 2 เรื่อง: เกณฑ์การนับ และความหมายของค้างรับ', () => {
    expect(RECEIVABLE_BASIS_NOTE).toContain('ยังไม่ถูกยกเลิก')
    expect(RECEIVABLE_BASIS_NOTE).toContain('ไม่ได้แปลว่าลูกค้าไม่จ่าย')
  })

  it('ต้องไม่อ้างว่าเป็นเกณฑ์เดียวกับหน้ากำไร — สองแท็บนับคนละชุดโดยเจตนา', () => {
    expect(RECEIVABLE_BASIS_NOTE).not.toContain('ยืนยันแล้ว')
  })
})
