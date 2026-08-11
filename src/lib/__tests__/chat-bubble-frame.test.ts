/**
 * [blocker] กรอบบับเบิลของแต่ละข้อความในเธรด
 *
 * ทำไมถึงต้องมีเทส: เงื่อนไขนี้เคยเป็น OR ห้าก้อนคาอยู่กลาง JSX (`bareImage` ใน `ChatThread.tsx`)
 * เขียนกลับด้านหรือลืมเคสหนึ่งแล้ว `tsc`/build/theme-guard เขียวหมด เพราะเป็น boolean ที่ถูกต้อง
 * ตามชนิดทุกประการ — สิ่งที่ผิดคือ *ความหมาย* ไม่ใช่ *รูปแบบ*
 * (docs/conventions/ui-boolean-needs-a-testable-home.md)
 *
 * 🛑 แดง = การ์ดในเธรดซ้อนกรอบซ้ำ หรือ ข้อความเปล่าลอยไม่มีบับเบิล ห้าม merge
 */

import { describe, it, expect } from 'vitest'
import { isSelfContainedBubble, type ChatBubbleFrameInput } from '../chat-bubble-frame'

/** ข้อความ TEXT ธรรมดา — ทุกเคสด้านล่างต่อยอดจากตัวนี้ ไม่ให้เผลอผูกกับ default ที่มองไม่เห็น */
function msg(over: Partial<ChatBubbleFrameInput> = {}): ChatBubbleFrameInput {
  return {
    type: 'TEXT',
    hasBody: true,
    hasImageUrl: false,
    isMetaOrderCard: false,
    hasGenericCards: false,
    productCardsCount: 0,
    hasResolvedSoloCard: false,
    ...over,
  }
}

describe('isSelfContainedBubble', () => {
  it('ข้อความธรรมดาต้องมีบับเบิลครอบ', () => {
    expect(isSelfContainedBubble(msg())).toBe(false)
  })

  it('การ์ดออเดอร์/การ์ดคำขอชำระเงินของ Meta/carousel ขาเข้า = มีกรอบในตัว', () => {
    expect(isSelfContainedBubble(msg({ type: 'ORDER' }))).toBe(true)
    expect(isSelfContainedBubble(msg({ isMetaOrderCard: true }))).toBe(true)
    expect(isSelfContainedBubble(msg({ hasGenericCards: true }))).toBe(true)
  })

  /**
   * 🛑 หัวใจของ fix รอบ 2026-08-11 — ก่อนหน้านี้เคสนี้คืน false (โดนครอบซ้ำ) ขณะที่เคส carousel
   * ข้างล่างคืน true มาตลอด ทั้งที่เป็นการ์ดชนิดเดียวกันเป๊ะ ต่างกันแค่จำนวนใบ
   */
  it('[blocker] การ์ดสินค้าใบเดียวที่ยัง resolve ได้ ต้องไม่ถูกครอบบับเบิลซ้ำ', () => {
    expect(isSelfContainedBubble(msg({ type: 'PRODUCT', hasResolvedSoloCard: true }))).toBe(true)
  })

  it('[blocker] การ์ดสินค้าหลายใบ (carousel) ต้องไม่ถูกครอบบับเบิลซ้ำ', () => {
    expect(isSelfContainedBubble(msg({ type: 'PRODUCT', productCardsCount: 3 }))).toBe(true)
  })

  /**
   * 🛑 ข้อยกเว้นที่ห้ามหายไปพร้อมกับ fix ข้างบน: สินค้าถูกลบ → เรนเดอร์เป็นไอคอน+ข้อความเปล่า
   * ไม่มีกรอบในตัว ถ้าเผลอเหมารวมว่า "PRODUCT = ไม่ต้องมีบับเบิล" ข้อความจะลอยบนพื้นเธรด
   */
  it('[blocker] การ์ดสินค้าใบเดียวที่สินค้าถูกลบแล้ว ยังต้องมีบับเบิลครอบ', () => {
    expect(isSelfContainedBubble(msg({ type: 'PRODUCT', hasResolvedSoloCard: false }))).toBe(false)
  })

  it('carousel ที่บางใบถูกลบ ยังนับเป็นมีกรอบในตัว (ตัวการ์ดแต่ละใบคงกรอบ w-44 ไว้เองอยู่แล้ว)', () => {
    expect(
      isSelfContainedBubble(msg({ type: 'PRODUCT', productCardsCount: 2, hasResolvedSoloCard: false })),
    ).toBe(true)
  })

  it('รูป/วิดีโอที่ไม่มี caption = ตัวสื่อเป็นกรอบเอง แต่ถ้ามี caption ต้องมีบับเบิลอุ้มข้อความ', () => {
    expect(isSelfContainedBubble(msg({ type: 'IMAGE', hasImageUrl: true, hasBody: false }))).toBe(true)
    expect(isSelfContainedBubble(msg({ type: 'VIDEO', hasImageUrl: true, hasBody: false }))).toBe(true)
    expect(isSelfContainedBubble(msg({ type: 'IMAGE', hasImageUrl: true, hasBody: true }))).toBe(false)
    // ไม่มีไฟล์ให้แสดง (แถวเสีย/ยังอัปโหลดไม่เสร็จ) — ไม่มีอะไรทำหน้าที่กรอบ
    expect(isSelfContainedBubble(msg({ type: 'IMAGE', hasImageUrl: false, hasBody: false }))).toBe(false)
  })

  it('ชนิดใหม่ที่ยังไม่มีใครเขียนกฎรองรับ = มีบับเบิลครอบ (fail-safe ไม่ใช่ปล่อยลอย)', () => {
    expect(isSelfContainedBubble(msg({ type: 'STICKER_V2_SOMEDAY' }))).toBe(false)
  })
})
