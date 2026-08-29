/**
 * 🛑 [blocker] ธงที่ `getOrderActionSet()` ใช้ตัดสินปุ่มหลัก ต้องถูก "ส่งเข้าไปจริง"
 *
 * ที่มา (บั๊กจริงบน prod ตั้งแต่ 2026-08-04 ถึง 2026-08-29): `OrderDetailClient.tsx` รับ prop
 * `isCodUnpaid` เข้ามาและ destructure ไว้เรียบร้อย **แต่ไม่เคยส่งเข้า `getOrderActionSet()` เลย**
 * ⇒ ค่าเป็น `undefined` เสมอ ⇒ `primary: isCodUnpaid ? ACTIONS.codReceived : null` คืน `null` ตลอด
 *
 * ผลที่ผู้ใช้เจอ: ปุ่ม "ได้รับเงินปลายทางแล้ว" **กดไม่ได้เลยบนมือถือ** เพราะปุ่มบนการ์ด
 * (`CodCard.tsx`) เป็น `hidden … lg:flex` โดยตั้งใจ (มือถือให้ใช้แถบ action ล่างจอแทน) แต่แถบนั้น
 * ไม่เคยได้ธงมา ⇒ ไม่มีทางเข้าไหนเลยต่ำกว่า 1024px สำหรับ COD ซึ่งเป็น 96% ของออเดอร์บน prod
 *
 * ไม่มี gate ไหนจับได้: `tsc` ผ่านเพราะ prop เป็น optional · เทสของ `order-action-set.ts` เขียว
 * เพราะมันทดสอบ *ฟังก์ชัน* ไม่ได้ทดสอบว่า *ผู้เรียกส่งค่ามาไหม* — คลาสเดียวกับ
 * `docs/conventions/rule-must-be-enforced-not-described.md` ("prop ที่ส่งมาแล้วไม่ถูกใช้ ไม่นับ")
 *
 * ด่านนี้สแกนซอร์สเพราะรีโปไม่มี jsdom/testing-library (vitest `environment: "node"`)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CLIENT = join(
  process.cwd(),
  'src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderDetailClient.tsx',
)

/** ตัดคอมเมนต์ก่อนสแกน — ไฟล์นี้เขียนคำเตือนของกฎนี้ไว้เอง ถ้าไม่ตัดจะ match คอมเมนต์ตัวเอง */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('[blocker] ธงของ getOrderActionSet ต้องถูกส่งเข้าไปจริง ไม่ใช่แค่รับ prop ไว้', () => {
  const body = stripComments(readFileSync(CLIENT, 'utf8'))
  const call = body.slice(body.indexOf('getOrderActionSet({'))
  const args = call.slice(0, call.indexOf('})') + 2)

  for (const flag of ['isCodUnpaid', 'isPickupPaymentUnpaid', 'isPickupHandedOver']) {
    it(`ส่ง ${flag} เข้า getOrderActionSet()`, () => {
      expect(args).toContain(flag)
    })
  }

  it('ทุกธงที่ประกาศใน props ถูกใช้จริง ไม่ใช่รับมาแล้วทิ้ง', () => {
    // ธงพวกนี้มีไว้ตัดสินปุ่มหลักเท่านั้น — ถ้าโผล่ใน props แต่ไม่โผล่ในอาร์กิวเมนต์ = dead prop
    const declared = ['isCodUnpaid', 'isPickupPaymentUnpaid', 'isPickupHandedOver'].filter((f) =>
      body.includes(`${f}:`),
    )
    const missing = declared.filter((f) => !args.includes(f))
    expect(missing, `ธงที่ประกาศแต่ไม่ได้ส่งเข้า getOrderActionSet: ${missing.join(', ')}`).toEqual([])
  })
})
