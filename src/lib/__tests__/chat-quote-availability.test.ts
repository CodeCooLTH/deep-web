import { describe, expect, it } from 'vitest'
import { shouldWarnQuoteUnavailable, quoteJumpTargetId } from '../chat-quote-availability'

describe('[blocker] shouldWarnQuoteUnavailable — เตือนเฉพาะ LINE + ข้อความร้าน + quote ไม่ติดจริง', () => {
  it('[blocker] LINE + ข้อความร้าน + quotable=false → เตือน', () => {
    expect(shouldWarnQuoteUnavailable({ channel: 'LINE', quotable: false, carrierIsShop: true })).toBe(true)
  })

  it('[blocker] LINE + ข้อความร้าน + quotable=true → ไม่เตือน (quote ติดจริง)', () => {
    // ถ้าสลับเป็น `quotable !== true` (ตรงข้าม) เคสนี้จะพังเป็น true ทันที — พิสูจน์ว่าเงื่อนไข
    // ผูกกับ `quotable === false` ไม่ใช่ negation ของ true
    expect(shouldWarnQuoteUnavailable({ channel: 'LINE', quotable: true, carrierIsShop: true })).toBe(false)
  })

  it('[blocker] LINE + ข้อความร้าน + quotable=undefined (ยังไม่รู้/ข้อความเก่าก่อน server คำนวณให้) → ไม่เตือน', () => {
    expect(shouldWarnQuoteUnavailable({ channel: 'LINE', quotable: undefined, carrierIsShop: true })).toBe(false)
  })

  it('[blocker] LINE + ข้อความร้าน + quotable=null → ไม่เตือน', () => {
    expect(shouldWarnQuoteUnavailable({ channel: 'LINE', quotable: null, carrierIsShop: true })).toBe(false)
  })

  it('[blocker] channel gate: MESSENGER + ข้อความร้าน + quotable=false → ไม่เตือน (ยังไม่เปลี่ยนพฤติกรรม Meta รอบนี้)', () => {
    expect(shouldWarnQuoteUnavailable({ channel: 'MESSENGER', quotable: false, carrierIsShop: true })).toBe(false)
  })

  it('[blocker] channel gate: INSTAGRAM + ข้อความร้าน + quotable=false → ไม่เตือน', () => {
    expect(shouldWarnQuoteUnavailable({ channel: 'INSTAGRAM', quotable: false, carrierIsShop: true })).toBe(false)
  })

  it('[blocker] channel gate: DEEP + ข้อความร้าน + quotable=false → ไม่เตือน (แชท DEEP ไม่มีแนวคิด quote token)', () => {
    expect(shouldWarnQuoteUnavailable({ channel: 'DEEP', quotable: false, carrierIsShop: true })).toBe(false)
  })

  it('[blocker] mine gate: LINE + ข้อความลูกค้า (mine=false) + quotable=false → ไม่เตือน (ไม่ใช่ของที่ร้านทำอะไรได้)', () => {
    expect(shouldWarnQuoteUnavailable({ channel: 'LINE', quotable: false, carrierIsShop: false })).toBe(false)
  })

  it('[blocker] ทุกเงื่อนไขผ่านพร้อมกันเท่านั้นจึงเตือน — สลับลำดับ input ไม่มีผล', () => {
    // ยืนยันว่าไม่ได้มีเงื่อนไขแอบแฝงที่ผูกกับลำดับ key ของ object (สร้าง object คนละลำดับ key)
    expect(shouldWarnQuoteUnavailable({ carrierIsShop: true, quotable: false, channel: 'LINE' })).toBe(true)
  })
})

describe('[blocker] quoteJumpTargetId — กล่อง quote กดไปหาข้อความต้นทางได้เมื่อไร', () => {
  it('[blocker] id จริงจาก server → คืน id นั้น (กล่อง quote กดได้)', () => {
    expect(quoteJumpTargetId('7f1c2d3e-0000-4000-8000-000000000001')).toBe(
      '7f1c2d3e-0000-4000-8000-000000000001',
    )
  })

  it('[blocker] id ของบับเบิล optimistic (local-…) → null (ยังไม่มีแถวจริงใน DOM ให้กระโดดไปหา)', () => {
    expect(quoteJumpTargetId('local-3-1754899200000')).toBeNull()
    expect(quoteJumpTargetId('local-s7-1754899200000')).toBeNull()
  })

  it('[blocker] ไม่มี id เลย (quote ของข้อความเก่าก่อนระบบส่งฟิลด์นี้) → null', () => {
    // 🛑 เคสนี้คือเหตุผลที่ฟิลด์ `id` เป็น optional — ถ้าเผลอเขียนให้คืน id เสมอ กล่อง quote ของ
    // ข้อความเก่าจะกลายเป็นปุ่มที่กดแล้วไม่เกิดอะไร (affordance ปลอม)
    expect(quoteJumpTargetId(undefined)).toBeNull()
    expect(quoteJumpTargetId(null)).toBeNull()
    expect(quoteJumpTargetId('')).toBeNull()
  })

  it('[blocker] id ที่แค่ "มีคำว่า local" อยู่ตรงกลาง ไม่ใช่ขึ้นต้น → ยังกดได้', () => {
    // กันการเผลอเปลี่ยนเป็น .includes('local-') ซึ่งจะตัด id จริงที่บังเอิญมีสตริงนั้นทิ้ง
    expect(quoteJumpTargetId('abc-local-9')).toBe('abc-local-9')
  })
})
