/**
 * [blocker] คอมเมนต์ที่ "มีรูป" กับ "เราไม่รู้ว่ามีอะไร" ต้องไม่ยุบเป็นสตริงเดียวกัน
 *
 * ที่มา (user เจอเองบน prod 2026-08-20 พร้อมภาพจาก Facebook):
 * ลูกค้าคอมเมนต์เป็น **รูปล้วน** แต่จอเราขึ้น `ขวัญดาว วงษ์สว่าง: (ไม่มีข้อความ)` ทั้งที่ payload
 * มี `attachmentUrl` เป็น URL fbcdn เต็ม ๆ — โค้ดทั้ง 2 จุด (แถวพรีวิว + บับเบิล) ไม่เคยดูฟิลด์นั้นเลย
 *
 * 🛑 และมันยุบ **2 สถานะที่ต่างกันโดยสิ้นเชิง** ให้เหลือคำเดียว: คำว่า "(ไม่มีข้อความ)" โกหกใน
 * สถานะที่ Meta ไม่เคยส่งเนื้อหามาเลย (18 แถวบน prod) เพราะมันอ้างว่า *เรารู้แล้ว* ว่าลูกค้าไม่ได้
 * พิมพ์อะไร — ผู้ขายที่อ่านแบบนั้นจะข้ามคอมเมนต์ไปเลย ทั้งที่อาจเป็นคนที่กำลังจะซื้อ
 */

import { describe, it, expect } from 'vitest'
import { commentContentState } from '../comment-content-state'

describe('[blocker] commentContentState', () => {
  it('มีข้อความ ⇒ TEXT (แม้จะมีรูปแนบมาด้วย)', () => {
    expect(commentContentState({ message: 'สนใจ', attachmentUrl: null })).toBe('TEXT')
    expect(commentContentState({ message: 'สนใจ', attachmentUrl: 'https://x/y.jpg' })).toBe('TEXT')
  })

  it('[blocker] ไม่มีข้อความ แต่มีรูป ⇒ ATTACHMENT_ONLY ไม่ใช่ "ไม่มีเนื้อหา"', () => {
    // เคสขวัญดาว: message = null แต่ attachmentUrl เป็น URL fbcdn จริง
    expect(commentContentState({ message: null, attachmentUrl: 'https://scontent.fbkk8-1.fna.fbcdn.net/x.jpg' })).toBe(
      'ATTACHMENT_ONLY',
    )
  })

  it('[blocker] ไม่มีทั้งข้อความและรูป ⇒ UNAVAILABLE = "เราไม่รู้" ไม่ใช่ "เขาไม่ได้พิมพ์"', () => {
    // เคส Sitipong: rawPayload จริงจาก Meta มีแค่ from/verb/ids ไม่มีคีย์เนื้อหาเลย
    expect(commentContentState({ message: null, attachmentUrl: null })).toBe('UNAVAILABLE')
  })

  it('whitespace ล้วนนับเป็นไม่มีข้อความ — ต้อง trim ทั้ง 2 จุดให้ตรงกัน', () => {
    // ของเดิมพรีวิวใช้ `?.trim() ||` ส่วนบับเบิลใช้ `??` เฉย ๆ ⇒ จอเดียวกันแสดงต่างกัน
    expect(commentContentState({ message: '   ', attachmentUrl: 'https://x/y.jpg' })).toBe('ATTACHMENT_ONLY')
    expect(commentContentState({ message: '\n\t ', attachmentUrl: null })).toBe('UNAVAILABLE')
  })

  it('รับ undefined ได้ (ฟิลด์หายจาก payload ≠ ค่าว่าง)', () => {
    expect(commentContentState({})).toBe('UNAVAILABLE')
    expect(commentContentState({ attachmentUrl: 'https://x/y.jpg' })).toBe('ATTACHMENT_ONLY')
  })
})
