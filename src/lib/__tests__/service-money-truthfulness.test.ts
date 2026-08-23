/**
 * ด่าน "หน้าจอเรื่องเงินของร้านบริการห้ามพูดสิ่งที่ไม่รู้ และห้ามพูดขัดกันเอง"
 *
 * user เจอเองบน prod 2026-08-23 · ยืนยันกับข้อมูลจริงของร้าน BT Premium แล้วทั้งสองข้อ
 *
 * ## ข้อ 1 — ป้ายสองใบขัดกันบนใบเดียว
 *
 * ใบ `DP256908CEB304D4`: `status=PENDING` · `paymentMethod='CASH'` · รับมัดจำ ฿900 เต็มจำนวน
 *
 *   · `resolveServiceOrderBadge` อ่าน `OrderPayment` → **"ชำระเงินแล้ว"** (เขียว)
 *   · `getPaymentBadge` อ่าน `Order.status` + `paymentMethod` เท่านั้น — **ไม่รู้จักตาราง
 *     `OrderPayment` เลย** → `CASH` ไม่อยู่ใน enum ที่มันรู้จัก ตกไป fallback
 *     **"ยังไม่ยืนยันการชำระ"** (เหลือง)
 *
 * ⇒ สองป้ายตอบ *คำถามเดียวกัน* ("ได้เงินหรือยัง") คนละคำตอบ วางติดกัน (HR16)
 *
 * ## ข้อ 2 — ตารางยืนยันสิ่งที่ไม่รู้
 *
 * ใบวันที่ 1 ส.ค. สถานะ `CONFIRMED` (งานปิดแล้ว) แต่ **ไม่มีแถว `OrderPayment` เลย**
 * ⇒ ตารางขึ้น "ค้างรับ ฿300" **สีส้ม** ซึ่งอ่านว่า "ลูกค้ายังไม่จ่าย"
 * ความจริงคือ *ไม่มีใครบันทึกไว้* — ร้านอาจเก็บสดแล้วไม่ได้กด
 *
 * (`partial-data-must-be-labeled-or-filled.md` — มีทางเลือก 2 ทางเท่านั้น: **บอก** หรือ
 * **เติมให้เต็ม** · เติมไม่ได้เพราะข้อมูลไม่มีอยู่จริง ⇒ ต้องบอก)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { computeOrderMoney } from '@/lib/order-payment'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const SUMMARY = 'src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderSummary.tsx'
const SHEET = 'src/app/(paces)/seller/(dashboard)/dashboard/components/SalesChartSheet.tsx'
const SERVICE = 'src/services/dashboard.service.ts'

describe('ป้ายเรื่องเงินบนใบเดียวห้ามขัดกันเอง', () => {
  it('[blocker] ใบจริงที่ user เจอ ต้องอ่านว่าจ่ายครบแล้ว', () => {
    /* ค่าจากฐาน prod ของใบ DP256908CEB304D4 (อ่านอย่างเดียว 2026-08-23) — ยึดค่าจริง
       ไม่ใช่ค่าที่แต่งเองตามข้อสันนิษฐานของโค้ด (`external-payload-schema.md`) */
    const money = computeOrderMoney({
      totalAmount: 900,
      depositAgreed: 900,
      payments: [{ kind: 'DEPOSIT', amount: 900, voidedAt: null }],
    })
    expect(money.fullyPaid, 'รับครบ 900/900 แล้ว').toBe(true)
  })

  it('[blocker] ป้ายของร้านบริการต้องกันป้ายเดิมไม่ให้ขึ้นคู่', () => {
    /**
     * 🛑 ต้องกันที่ **การ render** ไม่ใช่แก้ `getPaymentBadge` ให้รู้จัก `OrderPayment`
     * เพราะฟังก์ชันนั้นถูกใช้โดย vertical อื่นที่ยังไม่มีตารางนั้นเลย — แก้ตรงนั้น
     * = เปลี่ยนพฤติกรรมของร้านขายออนไลน์ทุกใบเพื่อแก้อาการของร้านบริการ
     */
    const code = stripComments(read(SUMMARY))
    expect(code, 'ต้องมี !serviceBadge คุมการ render ป้ายเดิม').toMatch(
      /!isCod && !serviceBadge && paymentBadge/,
    )
  })
})

describe('ตารางรายวันห้ามยืนยันสิ่งที่ไม่รู้', () => {
  it('[blocker] service ต้องส่งชุด "ใบที่ยังไม่เคยบันทึกรับเงิน" มาด้วย', () => {
    /* ถ้าไม่มีชุดนี้ หน้าจอจะแยก "รู้ว่าค้าง" ออกจาก "ไม่รู้" ไม่ได้เลย แล้วก็ไม่มีทางเลือก
       นอกจากทาสีเตือนให้ทุกแถวที่ยังไม่มีเงินเข้า ซึ่งคือรูปร่างของบั๊กนี้ */
    const code = stripComments(read(SERVICE))
    expect(code, 'ต้องมี unrecordedValues').toMatch(/unrecordedValues/)
    expect(
      code,
      'ต้องนับจากจำนวนแถว payments ไม่ใช่จากยอดรวมเป็น 0 — บันทึกรับ ฿0 คือ "รู้" ไม่ใช่ "ไม่รู้"',
    ).toMatch(/payments\?\.length \?\? 0\) === 0/)
  })

  it('[blocker] สีเตือนของ "ค้างรับ" ต้องใช้เฉพาะตอนมีบันทึกรับเงินแล้วบางส่วน', () => {
    /**
     * 🛑 `r.received > 0` คือส่วนที่ขาดไปตอนแรก — ถ้าไม่มีเงื่อนไขนี้ แถวที่ยังไม่เคยบันทึก
     * รับเงินเลยจะได้สีส้มเหมือนแถวที่ *รู้แน่* ว่าเก็บไม่ครบ ⇒ จอยืนยันสิ่งที่ไม่รู้
     */
    const code = stripComments(read(SHEET))
    expect(code, 'ต้องมีเงื่อนไข received > 0 คู่กับสีเตือน').toMatch(
      /r\.value - r\.received > 0 && r\.received > 0[\s\S]{0,80}text-warning-ink/,
    )
  })

  it('[blocker] ต้องมีหมายเหตุบอกทั้งสองเรื่อง และขึ้นเฉพาะร้านบริการ', () => {
    /**
     * ตัวเลขอย่างเดียวปิดความเข้าใจผิดสองข้อนี้ไม่ได้:
     *   1. "มัดจำ" เป็นส่วนหนึ่งของ "รับจริง" ไม่ใช่ก้อนบวกเพิ่ม (ชีตนี้ออกแบบให้ไล่บวกลบตามได้)
     *   2. ยอดค้างรับที่มาจากใบที่ไม่เคยบันทึก = เพดานบน ไม่ใช่ยอดที่ยืนยันแล้ว
     *
     * 🛑 ต้องกั้น `isService` — ร้านขายออนไลน์ไม่มีคอลัมน์ "มัดจำ/รับจริง" เลย
     * ข้อความนี้บนจอเขาคือประโยคที่ไม่มีอะไรรองรับ (คำอธิบายที่อ้างของที่ไม่มีอยู่)
     */
    const code = read(SHEET)
    expect(code, 'ต้องบอกว่ามัดจำรวมอยู่ในรับจริงแล้ว').toContain('มัดจำนับรวมอยู่ใน')
    expect(code, 'ต้องบอกว่ายอดค้างรับเป็นเพดานบนเมื่อยังไม่ได้บันทึก').toContain(
      'บางรายการยังไม่ได้บันทึกการรับเงิน',
    )

    const at = code.indexOf('มัดจำนับรวมอยู่ใน')
    const before = code.slice(Math.max(0, at - 400), at)
    expect(before, 'หมายเหตุต้องอยู่ใต้เงื่อนไข isService').toContain('{isService && (')

    /* ประโยคที่สองต้องขึ้นเฉพาะเมื่อมีใบแบบนั้นจริง — ขึ้นตลอดเวลาจะกลายเป็นข้อความประจำ
       ที่ไม่มีใครอ่าน แล้ววันที่มันสำคัญจริงก็จะถูกมองข้ามไปด้วย */
    expect(stripComments(code), 'ต้องผูกกับ hasUnrecorded').toMatch(/\{hasUnrecorded && \(/)
  })
})
