import { describe, expect, it, vi } from 'vitest'

// seller-push.service import prisma ที่ระดับ module — เทสนี้แตะแต่ฟังก์ชันบริสุทธิ์ จึง mock ทิ้ง
// ไม่ให้ไปเปิด client จริง (Hard Rule 13: เทสห้ามแตะฐานข้อมูลโดยไม่จำเป็น)
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const { channelLine } = await import('@/services/seller-push.service')

/**
 * channelLine = บรรทัดกลางของ push notification (iOS subtitle) ที่ตอบว่า "ข้อความนี้เข้ามาทางไหน"
 * user request 2026-08-08 — ต่อยอดจากที่เคยสั่งให้ใส่ชื่อเพจใน ChannelBadge เมื่อ 2026-07-23
 */
describe('channelLine', () => {
  it('มีเพจ → "ช่องทาง · ชื่อเพจ"', () => {
    expect(channelLine('MESSENGER', 'BT Premium')).toBe('Messenger · BT Premium')
    expect(channelLine('INSTAGRAM', 'bt.premium')).toBe('Instagram · bt.premium')
  })

  it('เธรด Deep (ไม่มีเพจ) → เหลือชื่อช่องทางล้วน ห้ามมี " · " ค้างท้าย', () => {
    // ลูกค้าที่ทักผ่านแอป/เว็บของเราเองไม่มี shopChannel → getConversationToastPreview คืน
    // channelName เป็น null; ถ้าต่อสตริงดื้อ ๆ ผู้ใช้จะเห็น "Deep · " ซึ่งดูเหมือนข้อมูลโหลดไม่ครบ
    expect(channelLine('DEEP', null)).toBe('Deep')
  })

  it('ชื่อเพจที่เป็นช่องว่างล้วน ถือว่าไม่มีชื่อ', () => {
    // ชื่อเพจมาจาก ShopChannel.name ที่ cache ไว้ตอนกดเชื่อม — ไม่มีอะไรการันตีว่าไม่ใช่ " "
    expect(channelLine('MESSENGER', '   ')).toBe('Messenger')
    expect(channelLine('MESSENGER', '')).toBe('Messenger')
  })

  it('ตัดช่องว่างหัว-ท้ายของชื่อเพจ', () => {
    expect(channelLine('MESSENGER', '  BT Premium  ')).toBe('Messenger · BT Premium')
  })

  it('ช่องทางที่ไม่รู้จักไม่ทำให้บรรทัดพัง', () => {
    expect(channelLine('LINE', 'ร้านบีที')).toBe('Deep · ร้านบีที')
  })
})
