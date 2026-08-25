import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * ด่านกัน "เส้นทางสร้างออเดอร์ที่ลืมเขียน `orderNo`" (CR 2026-08-25)
 *
 * 🛑 ทำไมสำคัญ: หน้าจอ **คำนวณเลขคำสั่งซื้อสดทุกครั้ง** จาก `publicToken`+`createdAt`
 * (`formatOrderNo`) ⇒ ออเดอร์ที่คอลัมน์ `orderNo` เป็น NULL **ยังมีเลขให้ผู้ขายเห็นบนจอปกติ**
 * ความผิดพลาดจึงมองไม่เห็นเลยจนกว่าจะมีคนค้นด้วยเลขนั้นแล้วไม่เจอ — ซึ่งเป็นบั๊กคลาสเดียวกับ
 * ที่ 00058 เพิ่งแก้ไปในทิศตรงข้าม (ค้นเบอร์ไม่เจอเพราะเทียบกับค่าที่ปิดบัง)
 *
 * ตอนพบ (2026-08-25) มี 2 เส้นทางที่ไม่เขียนเลย: ชนะประมูล + สร้างการจอง
 * prod ยังไม่มีแถว NULL เพราะสองเส้นทางนั้นยังไม่เคยถูกใช้จริง — ปิดก่อนมีใครใช้
 *
 * สแกนซอร์สเพราะเป็นเรื่อง "โครงสร้างโค้ด" ไม่ใช่ "ผลลัพธ์ runtime" — เทสพฤติกรรมจับไม่ได้
 * ถ้าไม่มีใครเรียกเส้นทางนั้นในเทส
 */

/** ทุกไฟล์ที่สร้างแถว `Order` — ถ้ามีเส้นทางใหม่ ต้องมาเพิ่มที่นี่พร้อมกับเขียน orderNo */
const CREATE_SITES = [
  'src/services/order.service.ts',
  'src/services/auction.service.ts',
  'src/services/booking.service.ts',
]

const read = (f: string) => readFileSync(f, 'utf8')
/** ตัดคอมเมนต์ออกก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำอธิบายกฎนี้ไว้ด้วย */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('ทุกเส้นทางที่สร้างออเดอร์ต้องเขียน orderNo', () => {
  it.each(CREATE_SITES)('[blocker] %s เขียน orderNo หลังสร้างแถว', (file) => {
    const src = stripComments(read(file))
    // ต้องเรียกตัวสร้างเลขจริง ไม่ใช่แค่ import ไว้เฉย ๆ
    expect(src).toMatch(/formatOrderNo\s*\(/)
    // และต้องเอาผลไปเขียนลงคอลัมน์ ไม่ใช่คำนวณทิ้ง
    // รับทั้ง `data: { orderNo }` (shorthand) และ `orderNo: <expr>`
    expect(src).toMatch(/orderNo\s*[:,}]/)
  })

  it('[blocker] ไม่มีไฟล์อื่นนอกลิสต์ที่สร้างแถว Order', () => {
    /**
     * ถ้าเทสนี้แดง แปลว่ามีเส้นทางสร้างออเดอร์ใหม่เกิดขึ้น — ให้ไปดูว่ามันเขียน `orderNo` ไหม
     * แล้วค่อยเพิ่มเข้า `CREATE_SITES` **ห้ามเพิ่มชื่อไฟล์เข้าลิสต์เพื่อให้เทสเขียวอย่างเดียว**
     */
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const out = execSync(
      `grep -rlE "(tx|prisma)\\.order\\.create\\(" src "--include=*.ts" || true`,
      { encoding: 'utf8' },
    )
    /**
     * 🛑 ต้องตัดคอมเมนต์ก่อนตัดสิน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนี้ไว้ด้วย
     * (`order-return.service.ts` มีสตริง `prisma.order.create(` อยู่ในคอมเมนต์ที่เขียนว่า
     * "ห้ามมี `prisma.order.create(` ในไฟล์นี้เด็ดขาด" — ด่านรุ่นแรกจับมันเป็นผู้ต้องหา)
     * คลาสเดียวกับ grep gate ของ HR9 ที่แดงค้างจากคำเตือนตัวเองเมื่อ 2026-08-02
     */
    const found = out
      .split('\n')
      .filter(Boolean)
      .filter((f) => /(tx|prisma)\.order\.create\(/.test(stripComments(read(f))))
      .sort()
    expect(found).toEqual([...CREATE_SITES].sort())
  })
})
