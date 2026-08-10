import { describe, expect, it } from 'vitest'
import { shouldWarnQuoteUnavailable } from '../chat-quote-availability'

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
