/**
 * [blocker] ทุกเหตุผลยกเลิกที่โค้ดยอมรับ ต้องมีที่ยืนใน CHECK constraint ของฐานข้อมูลด้วย
 *
 * ที่มา: บั๊กบน prod 2026-08-12 — ร้านคิวงานกดยกเลิกแล้วได้ Postgres 23514
 * `new row for relation "Order" violates check constraint "Order_cancel_reason"`
 *
 * ต้นเหตุ: feature 00039 เพิ่ม `BUYER_NO_SHOW` (SERVICE_QUEUE) และ `BUYER_NO_PAYMENT`
 * (ONLINE_SALES) ที่ฝั่งโค้ด แต่ CHECK บนตาราง `Order` ยังเป็นชุด 4 ค่าของระบบจอง
 * ที่ `20260722000100_booking_fields_and_overlap` วางไว้ตั้งแต่ 2026-07-22 — ไม่มี migration
 * ตัวไหนแตะมันเลย และ `DATABASE.md` ของ 00039 เขียนไว้ว่า "ห้ามใส่ CHECK แบบระบุรายชื่อ"
 * ราวกับว่ายังไม่มี constraint อยู่ (เอกสารอ้างข้อเท็จจริงโดยไม่ยืนยันกับฐาน — HR16 ทิศกลับ)
 *
 * ทำไมไม่มี gate ไหนจับได้: `tsc`/build/เทส/grep ผ่านหมด เพราะค่าที่โค้ดส่งออกไป "ถูก"
 * ทุกตัวอักษร สิ่งที่ผิดคือ **ฝั่งฐานไม่รู้จักมัน** ซึ่งไม่มีอะไรในรีโปเชื่อมสองฝั่งเข้าหากัน
 * — เทสตัวนี้คือเส้นเชื่อมนั้น
 *
 * 🛑 แดง = ห้าม merge (เพิ่มค่าใหม่ใน CANCEL_REASONS_BY_VERTICAL แล้วต้องเขียน migration
 *    ต่อท้าย CHECK ด้วยเสมอ ดู docs/conventions/migration-check-constraint-additive.md)
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import { CANCEL_REASONS_BY_VERTICAL } from '../cancel-reasons'

const MIGRATIONS_DIR = join(process.cwd(), 'prisma/migrations')
const CONSTRAINT = 'Order_cancel_reason'

/** SQL ทุกไฟล์ที่พูดถึง constraint ตัวนี้ ต่อกันตามลำดับเวลา
 *
 *  อ่านทุกไฟล์ ไม่ใช่ไฟล์ล่าสุด — เพราะ migration เป็น additive (อ่านนิยามเดิมมาต่อท้าย)
 *  ค่าที่ยังใช้ได้จึงกระจายอยู่ในหลายไฟล์ตามรุ่นที่เพิ่มมันเข้ามา
 */
function constraintSql(): string {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((name) => {
      try {
        return readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8')
      } catch {
        return ''
      }
    })
    .filter((sql) => sql.includes(CONSTRAINT))
    .join('\n')
}

describe('Order.cancelReason — โค้ดกับ CHECK ของฐานต้องรู้จักค่าชุดเดียวกัน', () => {
  const sql = constraintSql()

  it('มี migration ที่นิยาม Order_cancel_reason อยู่จริง', () => {
    expect(sql).not.toBe('')
  })

  const values = [
    ...new Set(
      Object.values(CANCEL_REASONS_BY_VERTICAL).flatMap((options) => options.map((o) => o.value)),
    ),
  ].sort()

  it.each(values)('ค่า %s ปรากฏใน migration ของ CHECK', (value) => {
    expect(sql).toContain(`'${value}'`)
  })
})
