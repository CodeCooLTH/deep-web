import { describe, it, expect } from 'vitest'
import { extractGraphCards, isAllowedMirrorUrl } from '@/services/channel-chat.service'
import type { GraphThreadAttachment } from '@/lib/facebook/graph'

/**
 * bug จริง prod 2026-08-10 (user report + ภาพจาก Messenger): การ์ดโฆษณาขึ้นเป็นข้อความบรรทัดเดียว
 * "[การ์ดจาก Facebook] ราคานี้ฟรีปลายทาง — แจ้งที่อยู่คุณได้เลย" ทั้งที่ใน Messenger เป็นการ์ดรูปเต็มใบ
 *
 * ต้นเหตุ: การ์ดเข้าระบบได้ 2 ทางคนละโครง — ตอนทำ carousel (2026-08-09) แก้เฉพาะทาง webhook
 * ทาง Graph backfill (ซึ่งเป็นทางเดียวที่การ์ด "ตอบกลับอัตโนมัติของโฆษณา" เข้ามาได้ เพราะ Meta
 * ไม่ยิง echo ให้ระบบตัวเอง) ไม่เคยเขียนคอลัมน์ `cards` เลย — 132 ข้อความบน prod ตั้งแต่ 2026-01-19
 *
 * ค่าในไฟล์นี้คัดจาก `ChatMessage.rawMessage` บน prod ไม่ได้แต่งขึ้น
 */
function att(over: Partial<GraphThreadAttachment>): GraphThreadAttachment {
  return {
    kind: 'template',
    title: null,
    subtitle: null,
    mediaUrl: null,
    isSticker: false,
    name: null,
    mimeType: null,
    size: null,
    ...over,
  }
}

const AD_IMAGE_URL =
  'https://www.facebook.com/ads/image/?d=AQKmvxpqyLvm526NunpjLX5WCJESafogM2wx5qagOJnq1l11VzXFGtfCKnd3icimjeY6a34eWqnbZLH8y8-jAv_28Oj35SXdwoLt5tWvjm2erPVs2GtCagWG1rT95ZZEEUuh96Lq5X6icuxrwRWJb8hy'

describe('extractGraphCards — การ์ดที่มาทาง Graph backfill', () => {
  it('[blocker] การ์ดโฆษณาที่มีรูป → เป็นการ์ด ไม่ใช่ข้อความบรรทัดเดียว', () => {
    const out = extractGraphCards([
      att({ title: 'ราคานี้ฟรีปลายทาง', subtitle: 'แจ้งที่อยู่คุณได้เลย', mediaUrl: AD_IMAGE_URL }),
    ])
    expect(out).toEqual([
      { title: 'ราคานี้ฟรีปลายทาง', subtitle: 'แจ้งที่อยู่คุณได้เลย', imageUrl: AD_IMAGE_URL },
    ])
  })

  it('[blocker] การ์ดคำขอชำระเงิน (ไม่มีรูปตั้งแต่ต้นทาง) → null ต้องคงเป็นบรรทัดระบบเหมือนเดิม', () => {
    // ถ้าปล่อยผ่าน จะได้กล่องรูปเทาว่างเปล่าแทนบรรทัดระบบสะอาด ๆ = แย่ลงกว่าเดิม
    expect(extractGraphCards([att({ title: '฿360.00 order', subtitle: 'Waiting for payment' })])).toBeNull()
    expect(
      extractGraphCards([att({ title: 'Transfer requested', subtitle: 'Bangkok Bank\nAccount number 078-420-4331' })]),
    ).toBeNull()
  })

  it('[blocker] ไฟล์แนบธรรมดา (รูป/วิดีโอ) ไม่ใช่การ์ด → null (ต้องไปทางเดิมคือ mirror เป็นรูปเดี่ยว)', () => {
    expect(
      extractGraphCards([
        att({ kind: 'image', mediaUrl: 'https://scontent.xx.fbcdn.net/v/t45.5328-4/1.jpg', title: null }),
      ]),
    ).toBeNull()
    expect(extractGraphCards([])).toBeNull()
  })

  it('การ์ดที่ไม่มีรูปในชุดที่มีรูป → ยังนับทั้งชุด (imageUrl null รายใบ ไม่ทิ้งทั้งการ์ด)', () => {
    const out = extractGraphCards([
      att({ title: 'ใบที่มีรูป', mediaUrl: AD_IMAGE_URL }),
      att({ title: 'ใบที่ไม่มีรูป' }),
    ])
    expect(out).toHaveLength(2)
    expect(out![1]).toEqual({ title: 'ใบที่ไม่มีรูป', subtitle: null, imageUrl: null })
  })

  it('ตัดที่ 10 ใบ — เพดานเดียวกับฝั่ง webhook', () => {
    const many = Array.from({ length: 14 }, (_, i) => att({ title: `ใบ ${i}`, mediaUrl: AD_IMAGE_URL }))
    expect(extractGraphCards(many)).toHaveLength(10)
  })
})

describe('isAllowedMirrorUrl — allow-list ของ host ที่ยอมให้ยิง fetch ออกไป', () => {
  it('[blocker] www.facebook.com เปิดเฉพาะ /ads/image/ ไม่ใช่ทั้งโฮสต์', () => {
    expect(isAllowedMirrorUrl(new URL(AD_IMAGE_URL))).toBe(true)
    // path อื่นบนโฮสต์เดียวกันต้องไม่ผ่าน — ไม่งั้น URL ที่ปลอมมากับ payload ชี้ไปไหนก็ได้บน www
    expect(isAllowedMirrorUrl(new URL('https://www.facebook.com/me'))).toBe(false)
    expect(isAllowedMirrorUrl(new URL('https://www.facebook.com/ads/other'))).toBe(false)
    // subdomain อื่นของ facebook.com ไม่ได้เปิดตาม
    expect(isAllowedMirrorUrl(new URL('https://evil.facebook.com/ads/image/?d=x'))).toBe(false)
  })

  it('[blocker] ของเดิมยังผ่าน และโฮสต์ปลอมที่ลงท้ายคล้ายกันยังไม่ผ่าน', () => {
    expect(isAllowedMirrorUrl(new URL('https://scontent-atl3-3.xx.fbcdn.net/v/t45/1.jpg'))).toBe(true)
    expect(isAllowedMirrorUrl(new URL('https://graph.facebook.com/123/picture'))).toBe(true)
    expect(isAllowedMirrorUrl(new URL('https://evil-fbcdn.net/x.jpg'))).toBe(false)
    expect(isAllowedMirrorUrl(new URL('http://169.254.169.254/latest/meta-data/'))).toBe(false)
  })
})
