import { describe, expect, it } from 'vitest'
import { isChatThreadPath } from './chat-chrome'

const sp = (q: string) => new URLSearchParams(q)

/**
 * เกณฑ์นี้เป็น symbol เดียวที่ทั้งแถบบนของแอปและแถบแท็บอ่านเพื่อซ่อนตัวเองบนมือถือ — ตอบผิด
 * ด้านไหนก็เสียทั้งจอ: ตอบ true เกินไป = หน้ารายการไม่มีทางออก (ไม่มีโลโก้/ค้นหา/สลับร้าน)
 * ตอบ false เกินไป = เธรดเสีย chrome ไป 2 แถบเปล่า ๆ ซึ่งเป็นบั๊กที่ user เจอเอง 2026-08-20
 */
describe('[blocker] isChatThreadPath', () => {
  it('เธรดแชท = เต็มจอ', () => {
    expect(isChatThreadPath('/inbox/abc123')).toBe(true)
  })

  it('หน้ารายการแชท = ไม่เต็มจอ', () => {
    expect(isChatThreadPath('/inbox')).toBe(false)
  })

  it('รายการความคิดเห็น (ยังไม่เปิดเธรด) = ไม่เต็มจอ — ต้องเห็นแถบบนตามปกติ', () => {
    expect(isChatThreadPath('/inbox/comments')).toBe(false)
    expect(isChatThreadPath('/inbox/comments', sp(''))).toBe(false)
    // query อื่นที่ไม่ใช่ post ต้องไม่ทำให้ chrome หาย
    expect(isChatThreadPath('/inbox/comments', sp('channel=ig'))).toBe(false)
  })

  it('เธรดความคิดเห็น (?post=) = เต็มจอเหมือนห้องแชท', () => {
    expect(isChatThreadPath('/inbox/comments', sp('post=p1'))).toBe(true)
    expect(isChatThreadPath('/inbox/comments', sp('channel=ig&post=p1'))).toBe(true)
  })

  it('post= ค่าว่าง ไม่นับว่าเปิดเธรด (URL ที่ถูกตัดมาครึ่ง ๆ ต้องไม่ทำให้ chrome หาย)', () => {
    expect(isChatThreadPath('/inbox/comments', sp('post='))).toBe(false)
  })

  it('🛑 `/inbox/comments` ต้องไม่ถูกจับด้วย regex ของเธรดแชท — เคยเป็นบั๊กจริง 2026-08-04', () => {
    // ถ้าใครถอด branch ของ comments ออก regex `^/inbox/[^/]+$` จะเหมาเอาหน้ารายการไปด้วย
    // แล้วมือถือจะไม่มีทั้งโลโก้/ช่องค้นหา/ปุ่มร้าน ทั้งที่ยังอยู่หน้ารายการ
    expect(isChatThreadPath('/inbox/comments')).toBe(false)
  })

  it('ค่าว่าง/null ไม่พัง', () => {
    expect(isChatThreadPath(null)).toBe(false)
    expect(isChatThreadPath(undefined)).toBe(false)
    expect(isChatThreadPath('')).toBe(false)
  })
})
