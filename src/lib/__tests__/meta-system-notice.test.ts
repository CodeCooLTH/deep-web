import { describe, it, expect } from 'vitest'
import { parseMetaSystemNotice } from '@/lib/meta-system-notice'

// ข้อความจริงที่เจอบน prod 2026-07-30 (เธรด 842dd8e1) — ตัด URL ให้สั้นลงพอทดสอบ
const REAL =
  'คุณกำลังตอบกลับความคิดเห็นของผู้ใช้ต่อโพสต์บนเพจของคุณ ดูความคิดเห็น(https://facebook.com/story.php?story_fbid=pfbid0w2q&id=61554820684661&comment_id=1431929899077432)'

describe('parseMetaSystemNotice', () => {
  it('ข้อความระบบจริงจาก Meta → แยกข้อความ/ป้ายลิงก์/URL ได้', () => {
    const r = parseMetaSystemNotice(REAL)
    expect(r?.text).toBe('คุณกำลังตอบกลับความคิดเห็นของผู้ใช้ต่อโพสต์บนเพจของคุณ')
    expect(r?.linkLabel).toBe('ดูความคิดเห็น')
    expect(r?.url).toContain('comment_id=1431929899077432')
  })

  it('รูปแบบเดียวกันแต่เป็นภาษาอังกฤษ → ต้องจับได้ด้วย (เพจตั้งภาษาต่างกันได้)', () => {
    const r = parseMetaSystemNotice(
      'You are replying to a comment on your post. See comment(https://www.facebook.com/story.php?id=1)',
    )
    expect(r?.linkLabel).toBe('comment')
    expect(r?.text).toBe('You are replying to a comment on your post. See')
  })

  describe('บรรทัดบอกสถานะที่ไม่มีลิงก์ (user report 2026-07-30 รอบสอง)', () => {
    it('"<ชื่อ> replied to an ad." → เป็นข้อความระบบ ไม่มีลิงก์', () => {
      const r = parseMetaSystemNotice('ปวรุจน์ ณ.ปางคิ้มอด replied to an ad.')
      expect(r?.text).toBe('ปวรุจน์ ณ.ปางคิ้มอด replied to an ad.')
      expect(r?.linkLabel).toBeNull()
      expect(r?.url).toBeNull()
    })

    it('ชื่ออื่นก็ต้องจับได้ (ส่วนหน้าคือชื่อคน เปลี่ยนทุกคน)', () => {
      expect(parseMetaSystemNotice('อานนท์ เจริญมโนพร replied to an ad.')).not.toBeNull()
    })

    it('ไม่มีจุดท้ายประโยคก็ยังจับได้', () => {
      expect(parseMetaSystemNotice('John Doe replied to an ad')).not.toBeNull()
    })

    it('ประโยคที่แค่มีคำว่า ad อยู่กลาง ๆ ต้องไม่จับ', () => {
      expect(parseMetaSystemNotice('ลูกค้าถามว่า ad นี้ยังมีของไหม')).toBeNull()
    })
  })

  describe('ต้องไม่จับข้อความจริงของร้านผิด', () => {
    it('ข้อความธรรมดาไม่มีลิงก์', () => {
      expect(parseMetaSystemNotice('สวัสดีค่า สนใจรุ่นไหนคะ')).toBeNull()
    })

    it('ลิงก์นอกโดเมน Meta (เช่นร้านส่งลิงก์ร้านตัวเอง)', () => {
      expect(
        parseMetaSystemNotice('ดูสินค้าที่นี่(https://deepthailand.app/u/shop)'),
      ).toBeNull()
    })

    it('หลายบรรทัด — ข้อความคนพิมพ์ที่มีลิงก์มักขึ้นบรรทัดใหม่', () => {
      expect(
        parseMetaSystemNotice('โปรโมชัน\nดูเพิ่ม(https://facebook.com/promo)'),
      ).toBeNull()
    })

    it('URL ลอย ๆ ไม่มีวงเล็บ', () => {
      expect(parseMetaSystemNotice('ดูที่ https://facebook.com/xxx')).toBeNull()
    })

    it('ป้ายลิงก์ยาวผิดปกติ = regex ไปคว้าคำท้ายประโยคธรรมดา ไม่ใช่ป้ายลิงก์', () => {
      const long = 'ข้อความ ' + 'ก'.repeat(50) + '(https://facebook.com/x)'
      expect(parseMetaSystemNotice(long)).toBeNull()
    })

    it('ค่าว่าง/null', () => {
      expect(parseMetaSystemNotice('')).toBeNull()
      expect(parseMetaSystemNotice(null)).toBeNull()
      expect(parseMetaSystemNotice(undefined)).toBeNull()
    })
  })
})
