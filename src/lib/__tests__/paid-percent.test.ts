import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { paidPercentOf } from '@/app/(marketing)/o/[token]/PaymentSummaryCard'

/**
 * [blocker] สัดส่วนที่ร้านยืนยันรับแล้ว — วงแหวนบนการ์ดเงินของหน้าออเดอร์ผู้ซื้อ
 *
 * 🛑 วงแหวนเป็น **ตัวช่วยอ่าน** ตัวเลขบาททั้ง 3 แถวข้าง ๆ คือของจริง — แต่ตัวช่วยอ่านที่
 * บอกผิดอันตรายกว่าไม่มี เพราะมันคือสิ่งที่ผู้ใช้กวาดตาเห็นก่อนตัวเลข
 */
describe('[blocker] paidPercentOf', () => {
  it('ยอดบิล 0 ต้องได้ 0% ไม่ใช่ 100%', () => {
    /* 🛑 บิลเปล่าที่ยังไม่ใส่รายการจะขึ้นวงแหวนเต็มสีเขียว = อ้างว่ามีธุรกรรมเกิดขึ้นทั้งที่ไม่มี
       กติกาเดียวกับที่ป้ายสถานะห้ามขึ้น "ชำระเงินแล้ว" กับบิลยอด 0 */
    expect(paidPercentOf({ totalAmount: 0, totalReceived: 0 })).toBe(0)
    // และถึงจะมีเงินเข้าโดยที่ยอดบิลยังเป็น 0 (ร้านรับมัดจำก่อนใส่รายการ) ก็ยังต้องเป็น 0
    expect(paidPercentOf({ totalAmount: 0, totalReceived: 500 })).toBe(0)
  })

  it('ยอดติดลบ/ค่าเพี้ยน ต้องไม่ทำให้วงแหวนพัง', () => {
    expect(paidPercentOf({ totalAmount: -100, totalReceived: 50 })).toBe(0)
    expect(paidPercentOf({ totalAmount: Number.NaN, totalReceived: 50 })).toBe(0)
  })

  it('รับเกินยอด ต้องหยุดที่ 100', () => {
    /* ร้านบันทึกรับเกินได้จริง (ลูกค้าโอนเกิน/ปัดเศษ) — วงแหวนที่เกิน 100 วาดทับตัวเอง
       จนอ่านไม่ออก ส่วนตัวเลขบาทข้าง ๆ ยังบอกความจริงเต็ม ๆ อยู่แล้ว */
    expect(paidPercentOf({ totalAmount: 100, totalReceived: 150 })).toBe(100)
  })

  it('เคสปกติ — ครึ่งหนึ่ง / ครบ / ยังไม่จ่าย', () => {
    expect(paidPercentOf({ totalAmount: 1200, totalReceived: 600 })).toBe(50)
    expect(paidPercentOf({ totalAmount: 1200, totalReceived: 1200 })).toBe(100)
    expect(paidPercentOf({ totalAmount: 1200, totalReceived: 0 })).toBe(0)
  })

  it('ปัดเศษเป็นจำนวนเต็มเสมอ — วงแหวนไม่มีที่ให้ทศนิยม', () => {
    expect(paidPercentOf({ totalAmount: 3, totalReceived: 1 })).toBe(33)
    expect(Number.isInteger(paidPercentOf({ totalAmount: 7, totalReceived: 2 }))).toBe(true)
  })

  it('[blocker] วงแหวนต้องไม่ใช่ที่เดียวที่มีข้อมูล — ต้องมี aria-hidden', () => {
    /* คนที่ใช้ screen reader ต้องได้ข้อมูลครบจาก **แถวตัวเลข** ถ้าวงแหวนถูกอ่านด้วยจะได้
       ตัวเลขซ้ำสองรอบในความหมายที่ต่างกัน (% กับ บาท) ซึ่งสับสนกว่าไม่อ่าน
       (`aria-name-requires-supporting-role.md`: กล่องที่ไม่มี role รองรับชื่อ อ่านออกมาไม่ได้อยู่แล้ว
       สิ่งที่ทำได้คือบอกให้ข้าม) */
    const src = readFileSync(
      join(process.cwd(), 'src/app/(marketing)/o/[token]/PaymentSummaryCard.tsx'),
      'utf8',
    )
    /* 🛑 ต้องหา `<CircularProgress` ไม่ใช่ `CircularProgress` เปล่า ๆ — ตัวหลังไปเจอ
       **บรรทัด import** ซึ่งอยู่หัวไฟล์ แล้วหน้าต่างที่ตัดมาจะเป็นคอมเมนต์หัวไฟล์
       (`rule-must-be-enforced-not-described.md`: เทสสแกนซอร์สต้องจับรูปการใช้งาน ไม่ใช่ชื่อ) */
    const at = src.indexOf('<CircularProgress')
    expect(at, 'ต้องมีวงแหวนใน JSX').toBeGreaterThan(-1)
    // กล่องที่ครอบวงแหวนต้องมี aria-hidden (อยู่ก่อนหน้าไม่เกินหนึ่งบล็อก)
    expect(src.slice(Math.max(0, at - 500), at)).toMatch(/aria-hidden='true'/)
  })

  it('[blocker] ยอดคงเหลือต้องมีเป็นแถวของตัวเอง ไม่ใช่อยู่แค่ในชิป', () => {
    /* 🛑 เดิมยอดค้างอยู่ในชิปเล็ก ๆ บนหัวการ์ดที่เดียว ทั้งที่เป็นตัวเลขที่ผู้ซื้อเปิดหน้านี้มาเพื่อดู
       ชิปมีไว้สรุปสถานะ ไม่ใช่ที่อยู่ของตัวเลขหลัก */
    const src = readFileSync(
      join(process.cwd(), 'src/app/(marketing)/o/[token]/PaymentSummaryCard.tsx'),
      'utf8',
    ).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, '')
    /* 🛑 ต้องเช็คว่า **ป้ายกับตัวเลขอยู่ในแถวเดียวกัน** ไม่ใช่เช็คแยกกันคนละที่ —
       `baht(money.outstanding)` มีอยู่ในชิปบนหัวการ์ดด้วย ⇒ ร่างแรกที่เช็คสองอย่างแยกกัน
       ยังเขียวแม้ถอดตัวเลขออกจากแถวไปแล้ว เพราะไปเจอตัวในชิปแทน
       (`mutation-silence-means-weak-corpus.md` — เจอซ้ำเป็นครั้งที่สองในงานเดียวกัน) */
    const at = src.search(/>\s*คงเหลือ\s*</)
    expect(at, 'ต้องมีป้าย "คงเหลือ" เป็นแถวของตัวเอง').toBeGreaterThan(-1)
    expect(
      src.slice(at, at + 500),
      'ตัวเลขคงเหลือต้องอยู่ในแถวเดียวกับป้าย ไม่ใช่แค่ในชิป',
    ).toMatch(/baht\(money\.outstanding\)/)
  })
})
