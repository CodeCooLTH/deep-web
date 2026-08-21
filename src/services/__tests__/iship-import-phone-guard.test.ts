/**
 * 🛑 [blocker] — ด่านรูปแบบเบอร์ผู้รับใน `importParcelAsOrder`
 *
 * ที่มา (ext 2026-08-21): `importParcelAsOrder` เรียก `createOrder()` **จากใน service ตรง ๆ**
 * จึงไม่ผ่าน `CreateOrderSchema` เหมือนทางที่เข้ามาจาก API route ⇒ เบอร์รูปแบบใดก็ได้
 * จากระบบภายนอกลง `Order.buyerContact` ได้โดยไม่มีด่านไหนขวาง ของเดิมเช็คแค่ว่า
 * "มีค่าไหม" (`findMissingReceiverFields`) ไม่ได้เช็ค *รูปแบบ*
 *
 * เทสนี้สแกนซอร์สเพราะการเรียกฟังก์ชันจริงต้องต่อ iShip API + Prisma
 * (`docs/conventions/rule-must-be-enforced-not-described.md`: กฎที่ "เขียนไว้"
 * ยังไม่ใช่กฎที่ "บังคับได้" — ต้องชี้ได้ว่าโค้ดบรรทัดไหนบังคับ และเทสตัวไหนแดงถ้าเอาออก)
 *
 * 🛑 สแกนต้องจับ **ตัวแปรปลายทางจริง** (`parcel.receiver.phone`) ไม่ใช่แค่ชื่อ regex —
 * ไม่งั้นบรรทัด `import` ก็ match และด่านที่ตรวจตัวแปรผิดตัวก็ผ่าน
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(process.cwd(), 'src/services/iship.service.ts'), 'utf8')

/** ตัวฟังก์ชัน `importParcelAsOrder` ตั้งแต่ประกาศจนจบไฟล์ (มันเป็นตัวท้าย ๆ) */
function importParcelBody(): string {
  const at = SRC.indexOf('export async function importParcelAsOrder')
  expect(at, 'หา importParcelAsOrder ไม่เจอ — ฟังก์ชันถูกเปลี่ยนชื่อ/ย้ายไฟล์?').toBeGreaterThan(-1)
  return SRC.slice(at)
}

/** ตัดคอมเมนต์ออกก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำอธิบายกฎไว้ด้วย */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('[blocker] importParcelAsOrder ต้องตรวจรูปแบบเบอร์ผู้รับก่อนสร้างออเดอร์', () => {
  it('มีด่านที่ทดสอบ parcel.receiver.phone ด้วย MOBILE_PHONE_RE', () => {
    const body = stripComments(importParcelBody())
    expect(body).toMatch(/MOBILE_PHONE_RE\.test\(\s*parcel\.receiver\.phone/)
  })

  it('ด่านต้องอยู่ "ก่อน" createOrder( — ไม่ใช่หลัง (ไม่งั้นออเดอร์ถูกสร้างไปแล้ว)', () => {
    const body = stripComments(importParcelBody())
    const guard = body.search(/MOBILE_PHONE_RE\.test\(\s*parcel\.receiver\.phone/)
    const create = body.indexOf('createOrder(')
    expect(guard).toBeGreaterThan(-1)
    expect(create).toBeGreaterThan(-1)
    expect(guard, 'ด่านอยู่หลัง createOrder — ออเดอร์ถูกสร้างไปแล้วก่อนตรวจ').toBeLessThan(create)
  })

  it('ด่านต้อง throw ไม่ใช่แค่ log/แก้ค่าให้เอง (มติ: backend validate อย่างเดียว)', () => {
    const body = stripComments(importParcelBody())
    const guard = body.search(/MOBILE_PHONE_RE\.test\(\s*parcel\.receiver\.phone/)
    // ช่วง 400 ตัวอักษรถัดจากด่าน ต้องมี throw และต้องไม่มีการเขียนค่ากลับ
    const after = body.slice(guard, guard + 400)
    expect(after).toMatch(/throw new IShipServiceError/)
    expect(after, 'พบการแก้ค่าเบอร์แทนผู้ใช้ — ห้าม normalize ที่ backend').not.toMatch(
      /parcel\.receiver\.phone\s*=/,
    )
  })

  it('ยังคงเช็ค "มีค่าไหม" ไว้ด้วย (ด่านใหม่ไม่ได้มาแทนของเดิม)', () => {
    const body = stripComments(importParcelBody())
    expect(body).toMatch(/findMissingReceiverFields\(/)
  })
})
