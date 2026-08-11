/**
 * [blocker] กันการ์ดสินค้าข้ามร้าน (FR-CTX-07)
 *
 * ที่มา 2026-08-11: ด่าน cross-shop ของการ์ดสินค้าอยู่ใน `chat.service.sendMessage()` มาตลอด ซึ่ง
 * ครอบเฉพาะช่องทาง **DEEP** — ช่องทางนอกไม่เคยต้องใช้เพราะ `type=PRODUCT` ถูกตอบ 400 ทิ้งก่อน
 * พอเปิดการ์ดสินค้าให้ LINE เส้นทางใหม่วิ่งผ่าน `sendOutboundMessage` ซึ่ง **ไม่ผ่าน sendMessage**
 * ด่านเดิมจึงไม่ครอบ ต้องมีด่านของตัวเองที่ route
 *
 * ทำไมต้องเป็นเทสอ่านซอร์ส: ถอดเงื่อนไข `product.shopId !== conv.shopId` ออกแล้ว **`tsc` ยังเขียว
 * และไม่มีเทสไหนแดงเลย** (พิสูจน์ด้วย mutation แล้ว) เพราะโค้ดยังถูกต้องตามชนิดทุกบรรทัด — สิ่งที่
 * หายไปคือ *ขอบเขตข้อมูล* ไม่ใช่รูปแบบ. รีโปนี้เจอคลาสนี้ซ้ำมาแล้วหลายรอบ
 * (`feedback_missing_guard_is_a_class` · `feedback_rsc_dal_authz`: scope ownership ใน WHERE)
 *
 * 🛑 แดง = การ์ดสินค้าส่งข้ามร้านได้ ห้าม merge
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROUTE = join(process.cwd(), 'src/app/api/chat/conversations/[id]/messages/route.ts')
const CHAT_SERVICE = join(process.cwd(), 'src/services/chat.service.ts')

describe('การ์ดสินค้าต้องเป็นของร้านในเธรดนั้นเสมอ', () => {
  it('[blocker] route (เส้นทางช่องทางนอก) ต้องเทียบ shopId ของสินค้ากับของบทสนทนา', () => {
    const src = readFileSync(ROUTE, 'utf8')
    expect(src).toMatch(/product\.shopId\s*!==\s*conv\?\.shopId/)
  })

  it('[blocker] chat.service (เส้นทาง DEEP) ต้องยังมีด่านเดิมอยู่ — ห้ามหายไประหว่างรีแฟกเตอร์', () => {
    const src = readFileSync(CHAT_SERVICE, 'utf8')
    expect(src).toMatch(/product\.shopId\s*!==\s*conversation\.shopId/)
    expect(src).toContain('PRODUCT_NOT_IN_SHOP')
  })

  it('ทั้งสองเส้นทางใช้ helper ตัวเดียวกันหาสินค้า (นิยาม "สินค้าของร้านนี้" ต้องมีชุดเดียว — HR16)', () => {
    expect(readFileSync(ROUTE, 'utf8')).toContain('getProductById(')
    expect(readFileSync(CHAT_SERVICE, 'utf8')).toContain('getProductById(')
  })
})
