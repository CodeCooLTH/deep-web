import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  chunkProductCards,
  describeProductSelection,
  maxSelectableProducts,
  productCardMessageCount,
  productCardsPerMessage,
  productSendButtonLabel,
} from '@/lib/chat-product-card-batch'

describe('เพดานการ์ดสินค้าต่อข้อความ', () => {
  it('ตัวเลขตรงกับข้อจำกัดจริงของแต่ละปลายทาง', () => {
    expect(productCardsPerMessage('MESSENGER')).toBe(10)
    expect(productCardsPerMessage('INSTAGRAM')).toBe(10)
    expect(productCardsPerMessage('LINE')).toBe(12)
  })

  it('[blocker] DEEP = 1 เพราะแอปผู้ซื้อวาดการ์ดได้ใบเดียว', () => {
    // ตั้งเกิน 1 เมื่อไหร่ = ลูกค้าในแอปเราได้สินค้าชิ้นแรกชิ้นเดียว ที่เหลือหายเงียบ
    // (แอปผู้ซื้ออ่าน `msg.productCard` ซึ่งเป็นใบเดียว) — ยกเลขนี้ได้ก็ต่อเมื่อฝั่งนั้นวาด carousel ได้แล้ว
    expect(productCardsPerMessage('DEEP')).toBe(1)
  })

  it('ค่าที่ไม่รู้จักตกไป DEEP (fail-safe ไปทางที่ลูกค้าไม่มีทางเสียของ)', () => {
    expect(productCardsPerMessage('TIKTOK')).toBe(1)
  })

  it('เลือกได้มากสุด = 3 ข้อความต่อการกดส่งหนึ่งครั้ง', () => {
    expect(maxSelectableProducts('MESSENGER')).toBe(30)
    expect(maxSelectableProducts('LINE')).toBe(36)
    expect(maxSelectableProducts('DEEP')).toBe(3)
  })
})

describe('chunkProductCards', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

  it('ไม่ถึงเพดาน → ชุดเดียว', () => {
    expect(chunkProductCards(ids(4), 10)).toEqual([['p1', 'p2', 'p3', 'p4']])
  })

  it('พอดีเพดาน → ยังเป็นชุดเดียว ไม่ใช่สองชุดที่ชุดหลังว่าง', () => {
    expect(chunkProductCards(ids(10), 10)).toHaveLength(1)
  })

  it('เกินเพดาน → แบ่งตามลำดับเดิม ไม่สลับ', () => {
    expect(chunkProductCards(ids(12), 10)).toEqual([ids(10), ['p11', 'p12']])
  })

  it('[blocker] ว่าง → ไม่มีชุดเลย (ห้ามคืน [[]] = ยิงข้อความเปล่า 1 ใบ)', () => {
    expect(chunkProductCards([], 10)).toEqual([])
  })

  it('จำนวนที่แบ่งได้ต้องเท่ากับที่หน้าจอสัญญาไว้เสมอ', () => {
    for (const n of [1, 9, 10, 11, 20, 21, 30]) {
      expect(chunkProductCards(ids(n), 10)).toHaveLength(productCardMessageCount(n, 10))
    }
  })
})

describe('คำบนหน้าจอ', () => {
  it('ครอบทั้ง 3 สถานะ — ตัวกลาง (พอดีเพดาน) ต้องเตือนล่วงหน้า', () => {
    expect(describeProductSelection(0, 10).text).toBe('แตะสินค้าเพื่อเลือก')
    expect(describeProductSelection(4, 10).text).toBe('เลือกแล้ว 4 รายการ')
    expect(describeProductSelection(10, 10).text).toContain('สูงสุดต่อการ์ด 10 ชิ้น')
    expect(describeProductSelection(12, 10).text).toContain('แบ่งส่งเป็น 2 ข้อความ')
  })

  it('[blocker] ธง exceedsPerMessage ต้องตรงกับจำนวนข้อความจริง', () => {
    expect(describeProductSelection(10, 10).exceedsPerMessage).toBe(false)
    expect(describeProductSelection(11, 10).exceedsPerMessage).toBe(true)
    expect(describeProductSelection(11, 10).messageCount).toBe(2)
  })

  it('[blocker] ปุ่มส่งต้องบอกจำนวนข้อความเมื่อจะถูกแบ่ง (มติ user — ห้ามแบ่งเงียบ)', () => {
    expect(productSendButtonLabel(0, 10)).toBe('ส่งการ์ดสินค้า')
    expect(productSendButtonLabel(3, 10)).toBe('ส่งการ์ดสินค้า (3)')
    expect(productSendButtonLabel(12, 10)).toBe('ส่ง 2 ข้อความ (12 รายการ)')
    // DEEP: 2 ชิ้น = 2 ข้อความ — ปุ่มต้องบอก ไม่ใช่เขียนว่า "ส่งการ์ดสินค้า (2)"
    expect(productSendButtonLabel(2, 1)).toBe('ส่ง 2 ข้อความ (2 รายการ)')
  })
})

/**
 * [blocker] หน้าจอกับ route ต้องใช้สูตรเดียวกัน
 *
 * ป้ายบนหน้าจอสัญญากับผู้ขายว่า "จะแบ่งเป็น N ข้อความ" ถ้า route แบ่งด้วยเลขอื่น ผู้ขายจะเลิกเชื่อป้าย
 * นั้นถาวร และไม่มี tsc/build ตัวไหนจับได้เพราะเลขทั้งสองฝั่งถูกในตัวเอง (HR16) — ด่านนี้ตรวจว่า
 * route ยังเรียกฟังก์ชันกลางอยู่ ไม่ได้แอบเขียนสูตรของตัวเอง
 */
const ROUTE = join(process.cwd(), 'src/app/api/chat/conversations/[id]/messages/route.ts')

describe('[blocker] route ใช้ SSOT เดียวกับหน้าจอ', () => {
  const src = readFileSync(ROUTE, 'utf8')

  it('แบ่งชุดด้วย chunkProductCards + อ่านเพดานจาก productCardsPerMessage', () => {
    expect(src).toContain('chunkProductCards(')
    expect(src).toContain('productCardsPerMessage(')
  })

  it('บังคับเพดานรวมที่ server ด้วย ไม่เชื่อว่า UI กันมาแล้ว', () => {
    expect(src).toContain('maxSelectableProducts(')
  })

  it('ไม่มีการ hardcode เลข 10/12 เป็นเพดานในไฟล์ route', () => {
    // เลขต้องมาจาก lib เท่านั้น — hardcode ซ้ำคือจุดที่สองฝั่งจะเพี้ยนจากกันในอนาคต
    expect(src).not.toMatch(/perMessage\s*=\s*\d+/)
  })
})
