import { describe, expect, it, vi } from 'vitest'

// seller-push.service import prisma ที่ระดับ module — เทสนี้แตะแต่ฟังก์ชันบริสุทธิ์ จึง mock ทิ้ง
// ไม่ให้ไปเปิด client จริง (Hard Rule 13: เทสห้ามแตะฐานข้อมูลโดยไม่จำเป็น)
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const { channelLine } = await import('@/services/seller-push.service')

/**
 * channelLine = บรรทัดกลางของ push notification (iOS subtitle) ที่ตอบว่า "ข้อความนี้เข้ามาทางเพจไหน"
 * user request 2026-08-08 — ต่อยอดจากที่เคยสั่งให้ใส่ชื่อเพจใน ChannelBadge เมื่อ 2026-07-23
 */
describe('channelLine', () => {
  it('มีเพจ → ชื่อเพจล้วน', () => {
    expect(channelLine('MESSENGER', 'BT Premium')).toBe('BT Premium')
    expect(channelLine('INSTAGRAM', 'bt.premium')).toBe('bt.premium')
  })

  it('[blocker] ห้ามมีชื่อช่องทางนำหน้าชื่อเพจ', () => {
    // เคยส่ง "Messenger · BT Premium…" ขึ้น prod แล้วถูกทักจากเครื่องจริงวันเดียวกัน
    // ("ทำไมมันมี Messenger มาด้านหน้า เสียพื้นที่") — 12 ตัวอักษรแรกดันชื่อเพจจนโดนตัด
    // ซึ่งหางของชื่อเพจคือที่ที่เพจของร้านเดียวกันต่างกัน แดงเมื่อไหร่ห้าม merge
    const line = channelLine('MESSENGER', 'BT Premium Auto Xenon คลองสวน')
    expect(line.startsWith('Messenger')).toBe(false)
    expect(line).not.toContain('·')
    expect(line).toBe('BT Premium Auto Xenon คลองสวน')
  })

  it('เธรด Deep (ไม่มีเพจ) → ถอยไปใช้ชื่อช่องทาง ห้ามคืนสตริงว่าง', () => {
    // ลูกค้าที่ทักผ่านแอป/เว็บของเราเองไม่มี shopChannel → getConversationToastPreview คืน
    // channelName เป็น null; บรรทัดว่างจะทำให้ iOS ดันเนื้อหาขึ้นชิดหัวเรื่อง = noti สองแบบสลับกัน
    expect(channelLine('DEEP', null)).toBe('Deep')
  })

  it('ชื่อเพจที่เป็นช่องว่างล้วน ถือว่าไม่มีชื่อ', () => {
    // ชื่อเพจมาจาก ShopChannel.name ที่ cache ไว้ตอนกดเชื่อม — ไม่มีอะไรการันตีว่าไม่ใช่ " "
    expect(channelLine('MESSENGER', '   ')).toBe('Messenger')
    expect(channelLine('MESSENGER', '')).toBe('Messenger')
  })

  it('ตัดช่องว่างหัว-ท้ายของชื่อเพจ', () => {
    expect(channelLine('MESSENGER', '  BT Premium  ')).toBe('BT Premium')
  })

  it('ช่องทางที่ไม่รู้จักไม่ทำให้บรรทัดพัง', () => {
    expect(channelLine('LINE', 'ร้านบีที')).toBe('ร้านบีที')
    expect(channelLine('LINE', null)).toBe('Deep')
  })
})
