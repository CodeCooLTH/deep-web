/**
 * ชนิดการ์ด/ข้อความของ Meta ที่ "เข้าระบบแล้วแต่แสดงไม่ได้" — รอบกวาดฐาน prod 2026-08-15
 *
 * ทุก payload ในไฟล์นี้ **คัดจากฐาน prod จริงคำต่อคำ** (query rawMessage) ไม่ได้แต่งขึ้นเอง —
 * เทสที่แต่งค่าเองตามข้อสันนิษฐานของโค้ด ยืนยันได้แค่ว่า "โค้ดทำตามที่คนเขียนคิด" ไม่ใช่ว่า
 * "คนเขียนคิดถูก" (docs/conventions/external-payload-schema.md)
 */
import { describe, it, expect } from 'vitest'
import {
  composeStructuredText,
  extractGenericCards,
  metaPriceToBaht,
  META_SERVICE_CARD_TEXT,
  CARD_PREFIX,
} from '../channel-chat.service'
import { parseMetaSystemNotice, parseMetaAiHandoffNotice } from '@/lib/meta-system-notice'

describe('[blocker] การ์ดสินค้าจากแคตตาล็อก — payload.product.elements', () => {
  // prod 2026-08-15 (ร้าน BT Premium, is_echo=true) — สังเกตว่า **ไม่มี template_type เลย**
  const productPayload = {
    product: {
      elements: [
        {
          title: 'โช๊คหลัง เวฟ 100',
          subtitle: '$390.00',
          image_url: 'https://scontent.xx.fbcdn.net/v/t45.5328-4/767796339_1956706458323559.png',
        },
      ],
    },
  }

  it('สกัดเป็นการ์ดจริงได้ (เดิมคืน null เพราะ template_type ไม่ใช่ generic)', () => {
    const cards = extractGenericCards('template', productPayload)
    expect(cards).toHaveLength(1)
    expect(cards![0].title).toBe('โช๊คหลัง เวฟ 100')
    expect(cards![0].imageUrl).toContain('fbcdn.net')
  })

  it('ราคาแปลงเป็นบาท ไม่ใช่ดอลลาร์ (user เคาะ 2026-08-15)', () => {
    expect(extractGenericCards('template', productPayload)![0].subtitle).toBe('฿390')
  })

  it('ข้อความสรุปก็เห็นสินค้า ไม่ตกไป placeholder', () => {
    const text = composeStructuredText('template', productPayload)
    expect(text).toContain('โช๊คหลัง เวฟ 100')
    expect(text).toContain('฿390')
  })
})

describe('[blocker] metaPriceToBaht — แปลงเฉพาะสตริงที่เป็นราคาล้วน', () => {
  it('$390.00 → ฿390 (ตัดสตางค์ศูนย์)', () => {
    expect(metaPriceToBaht('$390.00')).toBe('฿390')
  })
  it('เศษสตางค์จริงต้องคงไว้', () => {
    expect(metaPriceToBaht('$1,250.50')).toBe('฿1,250.50')
  })
  it('ประโยคที่บังเอิญมี $ ปนอยู่ ห้ามแตะ — เราไม่รู้ความหมายของมัน', () => {
    expect(metaPriceToBaht('Pay $390 now')).toBe('Pay $390 now')
    expect(metaPriceToBaht('Waiting for payment')).toBe('Waiting for payment')
  })
})

describe('[blocker] การ์ดปุ่มที่ร้านส่งเอง — template_type=button ไม่มี text', () => {
  // prod 2026-08-15 (7 ใบ ร้านส่งเองทุกใบ)
  const buttonPayload = {
    template_type: 'button',
    buttons: [{ type: 'postback', title: 'สั่งซื้อโช๊ค 590.-' }],
  }

  it('เห็นชื่อปุ่มที่ร้านส่งออกไป ไม่ตกไป placeholder', () => {
    const text = composeStructuredText('template', buttonPayload)
    expect(text).toContain('สั่งซื้อโช๊ค 590.-')
    expect(text?.startsWith(CARD_PREFIX)).toBe(true)
  })

  it('ขึ้นเป็นบรรทัดระบบ ไม่ใช่บับเบิลที่ดูเหมือนแอดมินพิมพ์เอง', () => {
    expect(parseMetaSystemNotice(composeStructuredText('template', buttonPayload))).not.toBeNull()
  })
})

describe('[blocker] กล่องบริการของ Meta — template ที่ไม่มีคีย์ payload เลย', () => {
  it('ได้ข้อความที่บอกตรง ๆ ว่าไม่มีอะไรให้ตาม (เดิมชวนให้ไปเปิด Messenger เก้อ)', () => {
    expect(composeStructuredText('template', undefined)).toBe(META_SERVICE_CARD_TEXT)
  })

  it('ห้ามชวนให้ไปเปิด Messenger — ตัวสลิปอยู่ในระบบเราแล้ว ไม่มีอะไรให้ไปดู', () => {
    expect(META_SERVICE_CARD_TEXT).not.toContain('เปิดดูใน')
  })

  it('ขึ้นเป็นบรรทัดระบบจาง ๆ ตามที่ user เคาะ ไม่ใช่บับเบิลของลูกค้า', () => {
    expect(parseMetaSystemNotice(META_SERVICE_CARD_TEXT)).not.toBeNull()
  })

  it('attachment ชนิดอื่นที่ไม่มี payload ยังคืน null เหมือนเดิม (ไม่เหมาว่าเป็นกล่องของ Meta)', () => {
    expect(composeStructuredText('image', undefined)).toBeNull()
    expect(composeStructuredText(undefined, undefined)).toBeNull()
  })
})

describe('[blocker] ประโยคระบบอังกฤษที่เคยขึ้นเป็นบับเบิลฝั่งร้าน', () => {
  // ทุกประโยคคัดจากฐาน prod 2026-08-15 คำต่อคำ (จำนวนที่พบกำกับไว้)
  const lines = [
    ['Messenger automatically created a transfer request. Learn more', 35],
    ['The calling window has been reset to 7 days from the end of the previous call.', 15],
    ['This message was automatically moved to spam.', 8],
  ] as const

  it.each(lines)('%s → บรรทัดระบบ', (line) => {
    expect(parseMetaSystemNotice(line)).not.toBeNull()
  })

  it('รูปสั้นของ AI handoff ต้องแปลไทย (รูปยาว 2 แบบดักไว้แล้วตั้งแต่ 08-08)', () => {
    const notice = parseMetaAiHandoffNotice('Your AI agent transferred this chat to you.')
    expect(notice).not.toBeNull()
    expect(notice!.text).toContain('เอเจนต์ AI')
  })

  it('ข้อความจริงของร้านต้องไม่ถูกกินเป็นบรรทัดระบบ', () => {
    expect(parseMetaSystemNotice('ได้ค่ะลูกค้า')).toBeNull()
    expect(parseMetaSystemNotice('The calling window is fine')).toBeNull()
  })
})
