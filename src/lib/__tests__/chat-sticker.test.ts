/**
 * [blocker] "ข้อความนี้เป็นสติกเกอร์ไหม" — ต้องจริงทั้งขาเข้าและขาออก
 *
 * ที่มา 2026-08-10: สติกเกอร์ LINE ที่ลูกค้าส่งมาแสดงใหญ่เท่ารูป (240px) + มีปุ่มบันทึกรูป
 * เพราะ UI เดาจากขนาดรูปจริง (Meta 100px ผ่านเกณฑ์ 240 แต่ LINE 320–370px ไม่ผ่าน)
 *
 * และตอนแก้ก็เกือบพลาดครึ่งเดียว: ฟีเจอร์ "ส่งสติกเกอร์ LINE ได้" (S-18a) ที่เพิ่งขึ้น main
 * เก็บข้อความขาออกเป็น `type='IMAGE'` โดย rawMessage เป็น `outbound-response` ซึ่ง **ไม่มี
 * marker ของขาเข้า** → ถ้าไม่ติด marker ให้ขาออกด้วย สติกเกอร์ที่ "ร้านส่งเอง" จะใหญ่
 * ขณะที่ของลูกค้าเล็ก บนจอเดียวกัน (คลาส `rebase-clean-is-not-safe`: สองฝั่งเขียนขนานกัน
 * git ผ่านสะอาด แต่แพตเทิร์นที่ควรเหมือนกันขาดไปข้างหนึ่ง)
 *
 * แดง = ขนาด/ปุ่มของสติกเกอร์จะเพี้ยนอีกฝั่งหนึ่ง ห้าม merge
 */

import { describe, it, expect } from 'vitest'
import { isStickerRawMessage } from '@/lib/chat-sticker'

describe('isStickerRawMessage', () => {
  it('ขาเข้า LINE (writeLineInboundMessage rawExtra.kind) → true', () => {
    expect(
      isStickerRawMessage({
        provider: 'LINE',
        source: 'webhook',
        payload: {
          lineMessageId: '123',
          kind: 'sticker',
          packageId: '11537',
          stickerId: '52002734',
          mirrored: true,
        },
      }),
    ).toBe(true)
  })

  it('ขาออก LINE (outbound-response ตอน params.sticker) → true', () => {
    expect(
      isStickerRawMessage({
        provider: 'LINE',
        source: 'outbound-response',
        payload: { ok: true, mid: 'm1', sendMethod: 'push', kind: 'sticker', attachmentKind: null },
      }),
    ).toBe(true)
  })

  it('ขาออก Meta (outbound-response ตอน params.sticker) → true', () => {
    expect(
      isStickerRawMessage({
        provider: 'facebook',
        source: 'outbound-response',
        payload: { ok: true, mid: 'm2', messageTag: null, kind: 'sticker', attachmentKind: null },
      }),
    ).toBe(true)
  })

  it('[blocker] ขาเข้า Messenger: ไลค์/สติกเกอร์มี sticker_id (ใน message หรือ attachment) → true', () => {
    const like = (message: Record<string, unknown>) => ({ provider: 'facebook', source: 'webhook', payload: { sender: { id: 'u' }, recipient: { id: 'p' }, message } })
    // รูปจริงจาก Messenger: sticker_id อยู่ทั้งสองที่
    expect(isStickerRawMessage(like({ mid: 'm1', sticker_id: 369239263222822, attachments: [{ type: 'image', payload: { url: 'https://x/l.png', sticker_id: 369239263222822 } }] }))).toBe(true)
    expect(isStickerRawMessage(like({ mid: 'm2', attachments: [{ type: 'image', payload: { url: 'https://x/s.png', sticker_id: '1234567' } }] }))).toBe(true)
    expect(isStickerRawMessage(like({ mid: 'm3', sticker_id: 369239383222810 }))).toBe(true)
  })

  it('Messenger รูปถ่ายปกติ (ไม่มี sticker_id / ค่าเพี้ยน) → false', () => {
    const msg = (message: Record<string, unknown>) => ({ provider: 'facebook', source: 'webhook', payload: { message } })
    expect(isStickerRawMessage(msg({ mid: 'm4', attachments: [{ type: 'image', payload: { url: 'https://x/p.jpg' } }] }))).toBe(false)
    expect(isStickerRawMessage(msg({ mid: 'm5', sticker_id: 0, attachments: [{ type: 'image', payload: { url: 'https://x/p.jpg', sticker_id: '' } }] }))).toBe(false)
    expect(isStickerRawMessage(msg({ mid: 'm6', attachments: 'junk' }))).toBe(false)
  })

  it('รูปที่ลูกค้าส่ง / ข้อความปกติ / ไฟล์แนบ → false', () => {
    expect(isStickerRawMessage({ provider: 'LINE', payload: { kind: 'image', mirrored: true } })).toBe(false)
    expect(isStickerRawMessage({ provider: 'LINE', payload: { lineMessageId: '1', text: 'สวัสดี' } })).toBe(false)
    expect(
      isStickerRawMessage({ provider: 'facebook', payload: { ok: true, attachmentKind: 'IMAGE' } }),
    ).toBe(false)
  })

  it('payload ที่ไม่รู้จัก/ไม่มี/ผิดรูป → false ไม่ throw (rawMessage เป็น JSON เสรี)', () => {
    expect(isStickerRawMessage(null)).toBe(false)
    expect(isStickerRawMessage(undefined)).toBe(false)
    expect(isStickerRawMessage({})).toBe(false)
    expect(isStickerRawMessage({ payload: null })).toBe(false)
    expect(isStickerRawMessage({ payload: 'sticker' })).toBe(false)
    expect(isStickerRawMessage({ payload: { kind: null } })).toBe(false)
    expect(isStickerRawMessage('sticker')).toBe(false)
    expect(isStickerRawMessage(42)).toBe(false)
  })

  it('marker ต้องอยู่ใน payload ไม่ใช่ระดับบนสุด (กัน false positive จากคีย์ชื่อซ้ำ)', () => {
    expect(isStickerRawMessage({ kind: 'sticker', payload: { text: 'hi' } })).toBe(false)
  })
})
