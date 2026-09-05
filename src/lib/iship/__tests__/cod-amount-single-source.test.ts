/**
 * [blocker] ยอดเก็บปลายทางของพัสดุต้องมีคนตัดสินคนเดียว (2026-09-05)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🛑 ทำไมต้องมีด่านนี้
 *
 * บั๊กเงินบน prod (ออเดอร์ DP2569091C7BA99F ฿590, 4 ก.ย. 2569): ร้านคีย์ออเดอร์ในกล่องแชท
 * เป็น "โอนเงิน" แล้วกดสร้างพัสดุ iShip โดยปล่อยช่องยอดเก็บปลายทางว่าง — ฟอร์มจึงไม่ส่งคีย์
 * `codAmount` มาเลย แล้วเซิร์ฟเวอร์ตกไปใช้ค่าตั้งต้น **ระดับร้าน**:
 *
 *     override?.codAmount ?? (account.defaultCodEnabled ? Number(order.totalAmount) : 0)
 *
 * ค่าระดับร้านจึงชนะข้อมูลระดับใบที่เจาะจงกว่า ⇒ พัสดุถูกเปิดเป็นเก็บเงินปลายทางเท่ายอดบิล
 * แล้ว `resolvePaymentSync` เขียน `Order.paymentMethod = "COD"` ทับตามกติกา "พัสดุชนะ"
 * (กติกานั้นถูก — ของที่ผิดคือยอดบนพัสดุที่ไม่มีใครสั่งให้เกิด)
 *
 * ที่หลุดมาได้เพราะ **นิยามเดียวกันอยู่สองที่แล้วไม่ตรงกัน** (Hard Rule 16): ฝั่งฟอร์ม
 * (`ShipmentContext.codSuggested`) ตัดสินจากวิธีชำระของออเดอร์มาตลอด และมีคอมเมนต์เตือนไว้เอง
 * ว่า "ร้านอาจเปิด COD ไว้ แต่ใบนี้ลูกค้าโอนมาแล้ว — ถ้าเติมยอดให้จะกลายเป็นเก็บเงินซ้ำ"
 * แต่ฝั่งที่ยิงออกไปจริงไม่ได้ทำตามนั้น — `tsc`/build/เทสเดิมผ่านหมดเพราะทั้งสองนิยาม "ถูก"
 * ในตัวเอง
 *
 * แดง = ห้าม merge
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** ตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ทำถูกกฎคือไฟล์ที่เขียนคำอธิบายกฎนั้นไว้ด้วย */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

const SERVICE = 'src/services/iship.service.ts'
const FORM = 'src/components/safepay/iship/ShipmentCreateForm.tsx'

describe('ยอด COD ของพัสดุมาจาก resolveDefaultCodAmount ที่เดียว [blocker]', () => {
  it('iship.service.ts ต้องไม่อ่าน defaultCodEnabled อีกเลย', () => {
    const code = stripComments(read(SERVICE))
    // ถ้ามีคนเอาค่าตั้งต้นระดับร้านกลับเข้ามาตัดสินเงินของใบเดียว ด่านนี้ต้องแดงทันที
    expect(code).not.toContain('defaultCodEnabled')
  })

  it('ทั้งยอดที่ฟอร์มเห็น (codSuggested) และยอดที่ยิงจริง (codAmount) เรียกฟังก์ชันเดียวกัน', () => {
    const code = stripComments(read(SERVICE))
    const calls = code.match(/resolveDefaultCodAmount\(/g) ?? []
    // 2 จุด: codSuggested ใน getShipmentContext + fallback ใน createShipment
    expect(calls.length).toBe(2)
    // เลขที่ร้านเห็นบนฟอร์มต้องเป็นผลของฟังก์ชันนี้ ไม่ใช่เงื่อนไขที่เขียนซ้ำข้าง ๆ
    expect(code).toMatch(/codSuggested:\s*resolveDefaultCodAmount\(/)
    expect(code).toMatch(/override\?\.codAmount\s*\?\?\s*\n?\s*resolveDefaultCodAmount\(/)
  })

  it('ห้ามมีใครคำนวณยอด COD จากยอดบิลตรง ๆ ในไฟล์นี้', () => {
    const code = stripComments(read(SERVICE))
    // แพตเทิร์นของบั๊กเดิม: เอา totalAmount มาเป็นยอด COD ผ่านเงื่อนไขที่เขียนเอง
    expect(code).not.toMatch(/codAmount[^\n]*\?[^\n]*totalAmount/)
  })

  /**
   * ฝั่งฟอร์มต้องส่ง `codAmount` ทุกครั้ง แม้ช่องว่าง (= 0)
   *
   * ต้นเหตุจริงของบั๊กคือ conditional spread `...(x != null ? { codAmount: x } : {})` ซึ่งทำให้
   * "ช่องว่าง" กลายเป็น "ไม่ได้บอกอะไรมา" แล้วเซิร์ฟเวอร์ตัดสินแทน — ช่องว่างต้องแปลว่า
   * "ไม่เก็บเงินปลายทาง" อย่างเดียวเสมอ ไม่ใช่คำเชิญให้ระบบเดา
   */
  it('ฟอร์มสร้างพัสดุต้องส่ง codAmount เสมอ ห้ามละคีย์เมื่อช่องว่าง', () => {
    const code = stripComments(read(FORM))
    expect(code).toMatch(/\n\s*codAmount:\s*numOrUndefined\(codAmount\)\s*\?\?\s*0,/)
    // แพตเทิร์นเดิมที่ทำให้คีย์หายไปทั้งคีย์ — ห้ามกลับมา
    expect(code).not.toMatch(/\.\.\.\([^\n]*codAmount[^\n]*\{[^\n]*codAmount/)
  })
})
