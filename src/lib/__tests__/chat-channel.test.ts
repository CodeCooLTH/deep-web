import { describe, expect, it } from 'vitest'

import { getChannelLabel, resolveChatChannel } from '@/lib/chat-channel'

/**
 * ทำไมต้องมีเทสให้ไฟล์ที่ดูเหมือนแค่ตาราง 3 แถว: นับจาก 2026-08-08 คำเรียกช่องทางถูกใช้ 2 ที่ที่
 * "คนละ runtime" — ChannelBadge ในกล่องแชท (client) และ subtitle ของ push notification (server)
 * ถ้าใครแก้คำที่ไฟล์เดียวแล้วอีกฝั่งไม่ตาม ผู้ขายจะเห็นช่องทางเดียวกันถูกเรียกคนละชื่อบนสองหน้าจอ
 * โดยไม่มี tsc/build ตัวไหนฟ้อง (มันเป็นสตริงที่ถูกต้องทั้งคู่) — Hard Rule 16
 */
describe('resolveChatChannel', () => {
  it('คืนค่าเดิมสำหรับ 3 ช่องทางที่รองรับ', () => {
    expect(resolveChatChannel('DEEP')).toBe('DEEP')
    expect(resolveChatChannel('MESSENGER')).toBe('MESSENGER')
    expect(resolveChatChannel('INSTAGRAM')).toBe('INSTAGRAM')
  })

  it('fail-safe: ค่าที่ไม่รู้จัก/ว่าง → DEEP ไม่ throw', () => {
    // ช่องทางใหม่ที่ยังไม่รองรับ (LINE/TikTok) ต้องไม่ทำให้ push ทั้งใบล้ม —
    // seller-push เป็น best-effort ที่ถูกเรียกจาก webhook ของ Meta, throw = Meta retry ทั้ง batch
    expect(resolveChatChannel('LINE')).toBe('DEEP')
    expect(resolveChatChannel('')).toBe('DEEP')
    expect(resolveChatChannel('messenger')).toBe('DEEP') // case-sensitive โดยตั้งใจ (ค่าใน DB เป็นตัวใหญ่)
  })
})

describe('getChannelLabel', () => {
  it('ให้คำที่ผู้ใช้เห็น ตรงกับที่ ChannelBadge แสดงในกล่องแชท', () => {
    expect(getChannelLabel('DEEP')).toBe('Deep')
    expect(getChannelLabel('MESSENGER')).toBe('Messenger')
    expect(getChannelLabel('INSTAGRAM')).toBe('Instagram')
  })

  it('ค่าที่ไม่รู้จักได้คำของ DEEP ไม่ใช่ undefined', () => {
    // undefined หลุดไปถึง subtitle จะกลายเป็นคำว่า "undefined" บนหน้าจอผู้ใช้จริง
    expect(getChannelLabel('LINE')).toBe('Deep')
  })
})
