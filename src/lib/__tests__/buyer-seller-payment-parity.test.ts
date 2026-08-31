import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** ด่านต้องดู *โค้ด* ไม่ใช่คำอธิบาย — ไฟล์เหล่านี้เล่าเหตุผลไว้ยาวและมีชื่อสัญลักษณ์ในคอมเมนต์ */
const code = (rel: string) =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const BUYER_PAGE = 'src/app/(marketing)/o/[token]/page.tsx'
const MOBILE = 'src/app/(marketing)/o/[token]/OrderDetailMobile.tsx'
const GUEST = 'src/app/(marketing)/o/[token]/GuestOrderView.tsx'
const GUEST_DATA = 'src/app/(marketing)/o/[token]/guest-order-data.ts'

/**
 * บิลใบเดียวกันต้องตอบ "จ่ายครบยัง" ตรงกันทุกจอ (Hard Rule 16)
 *
 * จอที่พูดเรื่องนี้มี 3 จอ · ผู้ชม 3 แบบ:
 *   1. ร้าน        → `/orders/{token}` (Paces)
 *   2. ผู้ซื้อที่ล็อกอิน → `/o/{token}` → `OrderDetailMobile` (Vuexy)
 *   3. ผู้ถือลิงก์     → `/o/{token}` → `GuestOrderView` (Vuexy)
 *
 * 🛑 ป้ายทั้ง 3 จอ derive จาก `Order.status` ซึ่ง `CONFIRMED` แปลว่า *ผู้ซื้อยืนยันว่าได้รับ
 * บริการแล้ว* **ไม่ได้แปลว่าจ่ายเงินแล้ว** — ร้านบริการจ่ายมัดจำ → เข้ารับบริการ → เก็บส่วนที่เหลือ
 * ⇒ ใบที่ปิดงานแล้วแต่ยังค้างเงินเคยขึ้นเขียว "ชำระแล้ว" คู่กับตัวเลข "ค้าง ฿900" ในหน้าเดียวกัน
 *
 * 🛑 และ **แก้ข้างเดียวไม่ได้** — ถ้าแก้เฉพาะจอที่ล็อกอิน บิลใบเดียวกันจะขึ้นป้ายคนละอย่าง
 * ก่อน/หลังล็อกอิน ซึ่งเป็นความไม่ตรงกันชุดใหม่ (user เคาะ 2026-08-31: ให้จอ guest เห็นยอด
 * รับแล้ว/ค้างด้วย — ทางเลือก ก)
 */
describe('[blocker] จอผู้ซื้อ 2 แบบ ต้องตอบเรื่องเงินตรงกันเสมอ', () => {
  it('🛑 ตัวเลขคำนวณ **ครั้งเดียว** เหนือทั้งสองสาขา — ห้ามให้แต่ละสาขาคำนวณเอง', () => {
    const c = code(BUYER_PAGE)
    /* `const serviceMoney = …` ต้องอยู่เหนือ `if (!session || !viewerUserId)` ซึ่งเป็นจุดที่
       เส้นทางแยกเป็น guest / ล็อกอิน — คำนวณใต้จุดนั้นแปลว่ามีสองชุดที่เพี้ยนจากกันได้ */
    const declIdx = c.indexOf('const serviceMoney =')
    const branchIdx = c.indexOf('if (!session || !viewerUserId)')
    expect(declIdx, 'ไม่เจอการประกาศ serviceMoney').toBeGreaterThan(-1)
    expect(branchIdx, 'ไม่เจอจุดแยกสาขา guest/ล็อกอิน').toBeGreaterThan(-1)
    expect(declIdx, 'serviceMoney ต้องประกาศก่อนแยกสาขา').toBeLessThan(branchIdx)

    /* และต้องมีชุดเดียว — `computeOrderMoneyFromSerialized(` ห้ามถูกเรียกซ้ำในไฟล์นี้ */
    const calls = c.split('computeOrderMoneyFromSerialized(').length - 1
    expect(calls, `เรียก computeOrderMoneyFromSerialized ${calls} ครั้ง — ต้องเรียกครั้งเดียว`).toBe(1)
  })

  it('🛑 ทั้งสองสาขาต้องได้ชุดเดียวกัน', () => {
    const c = code(BUYER_PAGE)
    expect(c, 'สาขา guest ต้องรับ money').toMatch(/money: serviceMoney/)
    expect(c, 'สาขาล็อกอินต้องรับ serviceMoney').toMatch(/serviceMoney: serviceMoney/)
  })

  it('🛑 ป้ายของทั้งสองจอต้องกินบัญชีเงิน ไม่ใช่ `Order.status` ล้วน', () => {
    expect(code(MOBILE), 'จอล็อกอินต้องส่งชุดเงินเข้า getPaymentBadge').toMatch(
      /getPaymentBadge\([\s\S]{0,240}serviceMoney/,
    )
    expect(code(GUEST), 'จอ guest ต้องส่งชุดเงินเข้า getPaymentBadge').toMatch(
      /getPaymentBadge\([\s\S]{0,240}order\.money/,
    )
  })

  it('🛑 จอ guest ต้องเห็นยอดรับแล้ว/ค้าง (มติ ก) — ไม่งั้นป้ายตรงแต่ตัวเลขหาย', () => {
    const c = code(GUEST)
    expect(c).toMatch(/order\.money && \(/)
    expect(c).toMatch(/order\.money\.totalReceived/)
    expect(c).toMatch(/order\.money\.outstanding/)
  })

  it('🛑 allow-list ของ guest ต้องไม่ปล่อย `entries` ออกไป', () => {
    /* รายการรับเงินทีละก้อน (วิธีชำระ/เวลา/บันทึกภายในของร้าน) เป็นของฝั่งร้าน
       ผู้ถือลิงก์ต้องรู้แค่ "รับแล้วเท่าไร ค้างเท่าไร" ไม่ใช่ประวัติการเงินของร้าน */
    const c = code(GUEST_DATA)
    const moneyType = c.match(/money\??: \{[^}]*\}/g) ?? []
    expect(moneyType.length, 'ไม่เจอชนิดของ money ใน guest data').toBeGreaterThan(0)
    for (const t of moneyType) {
      expect(t, `guest ต้องไม่มี entries: ${t}`).not.toMatch(/entries/)
      expect(t, `guest ต้องไม่มี note: ${t}`).not.toMatch(/note/)
    }
  })

  it('🛑 การ์ดเงินของจอ guest ต้องกั้นด้วย `money` — ร้านขายออนไลน์ต้องไม่เห็นบล็อกใหม่ (AC-SQ-07)', () => {
    const c = code(BUYER_PAGE)
    /* `serviceMoney` เป็น null เมื่อ vertical ไม่ใช่ SERVICE_QUEUE ⇒ ทั้งป้ายและบล็อกเงียบเอง */
    expect(c).toMatch(/order\.shop\.vertical === 'SERVICE_QUEUE'\s*\?\s*computeOrderMoneyFromSerialized/)
  })
})
