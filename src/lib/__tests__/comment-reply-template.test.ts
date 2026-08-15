import { describe, it, expect } from 'vitest'
import {
  COMMENT_NAME_PLACEHOLDER,
  hasNamePlaceholder,
  renderCommentReplyText,
} from '@/lib/comment-reply-template'

describe('renderCommentReplyText', () => {
  it('ไม่มี placeholder -> คืนข้อความเดิมทุกตัวอักษร', () => {
    const t = 'แอดมินขออนุญาติทักไปให้ข้อมูลทางข้อความนะคะ'
    expect(renderCommentReplyText(t, 'Jiravut Sungkakul')).toBe(t)
  })

  it('แทนชื่อได้ และแทนทุกจุดที่ปรากฏ', () => {
    expect(renderCommentReplyText('สวัสดีค่ะ {ชื่อ} — {ชื่อ} สนใจรุ่นไหนคะ', 'หมา นำทาง')).toBe(
      'สวัสดีค่ะ หมา นำทาง — หมา นำทาง สนใจรุ่นไหนคะ',
    )
  })

  it('ชื่อมีช่องว่างหัวท้ายติดมา -> ตัดก่อนแทน', () => {
    expect(renderCommentReplyText('คุณ{ชื่อ} ครับ', '  Rightdown Theline \n')).toBe(
      'คุณRightdown Theline ครับ',
    )
  })

  // [blocker] ไม่มีชื่อ = ห้ามให้ลูกค้าเห็นคำว่า {ชื่อ} โผล่ในคอมเมนต์สาธารณะ (ดูเหมือนระบบพัง)
  // คอมเมนต์ที่ดึงย้อนหลังผ่าน Graph ไม่มี from ติดมาเลย — เคสนี้เกิดจริงได้เสมอ
  it('[blocker] ไม่มีชื่อ -> ตัด placeholder ทิ้ง ห้ามหลุดออกไปเป็นตัวหนังสือ', () => {
    for (const name of [null, undefined, '', '   ']) {
      const out = renderCommentReplyText('สวัสดีค่ะ {ชื่อ} สนใจสอบถามได้เลยนะคะ', name)
      expect(out).not.toContain(COMMENT_NAME_PLACEHOLDER)
      expect(out).toBe('สวัสดีค่ะ สนใจสอบถามได้เลยนะคะ')
    }
  })

  it('[blocker] ไม่มีชื่อ + placeholder ติดตัวหนังสือทั้งสองข้าง -> ไม่เหลือช่องว่างแทรก', () => {
    expect(renderCommentReplyText('แอดมิน{ชื่อ}ขออนุญาติทัก', null)).toBe('แอดมินขออนุญาติทัก')
  })

  it('ไม่มีชื่อ + placeholder อยู่ต้นข้อความ -> ไม่เหลือช่องว่างนำหน้า', () => {
    expect(renderCommentReplyText('{ชื่อ} สนใจสอบถามได้เลยครับ', null)).toBe('สนใจสอบถามได้เลยครับ')
  })

  // [blocker] ข้อความจริงของร้านเป็น 2 ย่อหน้าคั่นด้วยบรรทัดว่างโดยตั้งใจ — ถ้าเก็บกวาดช่องว่าง
  // ด้วย \s (ซึ่งกิน \n) ย่อหน้าจะถูกยุบรวมกันทันทีที่ลูกค้าไม่มีชื่อ
  it('[blocker] ไม่มีชื่อ -> ต้องไม่ยุบบรรทัดว่างระหว่างย่อหน้า', () => {
    const t = 'แอดมิน {ชื่อ} ขออนุญาติทักไปให้ข้อมูลนะคะ\n\nหรือ แอดไลน์ https://lin.ee/AmpQXN2'
    expect(renderCommentReplyText(t, null)).toBe(
      'แอดมิน ขออนุญาติทักไปให้ข้อมูลนะคะ\n\nหรือ แอดไลน์ https://lin.ee/AmpQXN2',
    )
  })

  // [blocker] เคสที่แยก `[ \t]` ออกจาก `\s` ได้จริง — placeholder อยู่ **ติดกับ \n** ทั้งสองข้าง
  // ถ้าใช้ `\s` ตัว regex จะกลืนบรรทัดใหม่ทั้งคู่แล้วคืนช่องว่างเดียว = ข้อความ 3 บรรทัดยุบเหลือ
  // บรรทัดเดียวเงียบ ๆ (เทสที่ placeholder มีแต่ space ขนาบ จับความต่างนี้ไม่ได้)
  it('[blocker] ไม่มีชื่อ + placeholder อยู่บรรทัดของตัวเอง -> ห้ามยุบบรรทัดรอบข้าง', () => {
    expect(renderCommentReplyText('สวัสดีค่ะ\n{ชื่อ}\nสนใจสอบถามได้เลย', null)).toBe(
      'สวัสดีค่ะ\n\nสนใจสอบถามได้เลย',
    )
  })

  it('มีชื่อ -> บรรทัดว่างระหว่างย่อหน้าก็ต้องอยู่ครบเช่นกัน', () => {
    const t = 'แอดมิน {ชื่อ} ขออนุญาติทักนะคะ\n\nสอบถาม 084-249-2878'
    expect(renderCommentReplyText(t, 'Sompit Meesab')).toBe(
      'แอดมิน Sompit Meesab ขออนุญาติทักนะคะ\n\nสอบถาม 084-249-2878',
    )
  })

  it('ข้อความที่มีแต่ placeholder + ไม่มีชื่อ -> ว่างเปล่า (ผู้เรียกต้องไม่ส่งต่อ)', () => {
    expect(renderCommentReplyText('{ชื่อ}', null)).toBe('')
  })
})

describe('hasNamePlaceholder', () => {
  it('ตรวจได้ทั้งมี/ไม่มี/null', () => {
    expect(hasNamePlaceholder('สวัสดี {ชื่อ}')).toBe(true)
    expect(hasNamePlaceholder('สวัสดีครับ')).toBe(false)
    expect(hasNamePlaceholder(null)).toBe(false)
  })
})
