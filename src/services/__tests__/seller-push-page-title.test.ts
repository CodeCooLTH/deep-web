import { beforeEach, describe, expect, it, vi } from 'vitest'

// seller-push.service import prisma ที่ระดับ module — เทสนี้ไม่แตะฐานข้อมูลจริงเลย จึง mock ทิ้ง
// (Hard Rule 13: เทสห้ามแตะฐานข้อมูลโดยไม่จำเป็น)
vi.mock('@/lib/prisma', () => ({
  prisma: {
    shop: { findUnique: vi.fn(async () => ({ userId: 'owner1' })) },
    shopMember: { findMany: vi.fn(async () => []) },
    // ไม่มีแถว = ทุกคนเปิดแจ้งเตือนอยู่ (กติกา opt-out ของ ShopNotificationPref)
    shopNotificationPref: { findMany: vi.fn(async () => [] as { userId: string }[]) },
  },
}))
vi.mock('@/services/chat.service', () => ({ getConversationToastPreview: vi.fn() }))
vi.mock('@/services/app-push.service', () => ({ pushToUsers: vi.fn() }))

const { pageTitle, pushNewChatMessage } = await import('@/services/seller-push.service')
const { getConversationToastPreview } = await import('@/services/chat.service')
const { pushToUsers } = await import('@/services/app-push.service')
const { prisma } = await import('@/lib/prisma')

/**
 * Prisma type ของ findMany อ้างอิง "แถวเต็ม" เสมอ แต่ service เรียกด้วย `select` จึงได้ subset
 * ของคอลัมน์เท่านั้น — TypeScript มองไม่เห็นความต่างนี้ผ่าน mock. cast ไว้ที่เดียวพร้อมเหตุผล
 * ดีกว่าโปรย `as any` กระจายทั้งไฟล์แล้วกลืน type error จริงไปด้วยโดยไม่รู้ตัว
 */
const selected = <T,>(rows: T[]) => rows as never

/** preview มาตรฐานที่ใช้ซ้ำ — เทสที่สนใจ "ใครได้รับ" ไม่ได้สนใจเนื้อหา */
function previewFor(conversationId: string) {
  return {
    conversationId,
    senderName: 'สมชาย',
    senderAvatarUrl: null,
    preview: 'สวัสดีครับ',
    channel: 'MESSENGER',
    channelName: 'BT Premium',
    lastMessageAt: new Date('2026-08-08T11:50:00.000Z'),
  }
}

/**
 * pageTitle = หัวเรื่องของ push notification = ชื่อเพจที่ลูกค้าทักเข้ามา
 * user request 2026-08-08 — ต่อยอดจากที่เคยสั่งให้ใส่ชื่อเพจใน ChannelBadge เมื่อ 2026-07-23
 */
describe('pageTitle', () => {
  it('มีเพจ → ชื่อเพจล้วน', () => {
    expect(pageTitle('MESSENGER', 'BT Premium')).toBe('BT Premium')
    expect(pageTitle('INSTAGRAM', 'bt.premium')).toBe('bt.premium')
  })

  it('[blocker] ห้ามมีชื่อช่องทางนำหน้าชื่อเพจ', () => {
    // เคยส่ง "Messenger · BT Premium…" ขึ้น prod แล้วถูกทักจากเครื่องจริงวันเดียวกัน
    // ("ทำไมมันมี Messenger มาด้านหน้า เสียพื้นที่") — 12 ตัวอักษรแรกดันชื่อเพจจนโดนตัด
    // ซึ่งหางของชื่อเพจคือที่ที่เพจของร้านเดียวกันต่างกัน แดงเมื่อไหร่ห้าม merge
    const line = pageTitle('MESSENGER', 'BT Premium Auto Xenon คลองสวน')
    expect(line.startsWith('Messenger')).toBe(false)
    expect(line).not.toContain('·')
    expect(line).toBe('BT Premium Auto Xenon คลองสวน')
  })

  it('เธรด Deep (ไม่มีเพจ) → ถอยไปใช้ชื่อช่องทาง ห้ามคืนสตริงว่าง', () => {
    // ลูกค้าที่ทักผ่านแอป/เว็บของเราเองไม่มี shopChannel → getConversationToastPreview คืน
    // channelName เป็น null; ค่านี้เป็น `title` ของ noti ถ้าว่าง iOS จะดันบรรทัดอื่นขึ้นมาแทน
    expect(pageTitle('DEEP', null)).toBe('Deep')
  })

  it('ชื่อเพจที่เป็นช่องว่างล้วน ถือว่าไม่มีชื่อ', () => {
    // ชื่อเพจมาจาก ShopChannel.name ที่ cache ไว้ตอนกดเชื่อม — ไม่มีอะไรการันตีว่าไม่ใช่ " "
    expect(pageTitle('MESSENGER', '   ')).toBe('Messenger')
    expect(pageTitle('MESSENGER', '')).toBe('Messenger')
  })

  it('ตัดช่องว่างหัว-ท้ายของชื่อเพจ', () => {
    expect(pageTitle('MESSENGER', '  BT Premium  ')).toBe('BT Premium')
  })

  it('LINE เป็นช่องทางที่ระบบรู้จักแล้ว (feature 00025) → ถอยไปใช้ชื่อ "LINE" ไม่ใช่ "Deep"', () => {
    // เดิมเทสนี้ใช้ 'LINE' เป็นตัวอย่างของ "ค่าที่ไม่รู้จัก" เพราะตอนนั้น ChatChannel ยังไม่มี LINE
    // พอ S-14a เพิ่ม LINE เข้า union จริง เทสเดิมจึงขัดกับพฤติกรรมที่ถูกต้อง — ไม่ใช่ regression
    // 🛑 ห้ามเอาค่าที่ "กำลังจะรองรับ" มาเป็นตัวแทนของ "ค่าที่ไม่รู้จัก" ในเทส เพราะวันที่รองรับจริง
    // เทสจะแดงโดยที่โค้ดถูก แล้วคนอ่านจะแยกไม่ออกว่าพังจริงหรือเทสล้าสมัย
    expect(pageTitle('LINE', 'ร้านบีที')).toBe('ร้านบีที')
    expect(pageTitle('LINE', null)).toBe('LINE')
  })

  it('ช่องทางที่ไม่รู้จักไม่ทำให้บรรทัดพัง', () => {
    // ใช้ค่าที่ระบบยังไม่รองรับจริง ๆ (TikTok = feature 00020 ที่ยังค้าง gate ของ TikTok อยู่)
    expect(pageTitle('TIKTOK', 'ร้านบีที')).toBe('ร้านบีที')
    expect(pageTitle('TIKTOK', null)).toBe('Deep')
  })
})

/**
 * ลำดับ 3 บรรทัดของ noti — user เขียนโครงมาให้ตรง ๆ 2026-08-08:
 *
 *   [ ชื่อเพจ ] · [ ชื่อคนส่งข้อความ ] · [ ข้อความ ]
 *
 * ลำดับนี้ถูกแก้ 3 รอบในวันเดียว (ชื่อคนส่งขึ้นก่อน → เติมชื่อช่องทาง → สลับให้เพจขึ้นก่อน)
 * จึงผูกเป็นสัญญาไว้ ไม่ให้ใครสลับกลับโดยไม่ตั้งใจ
 *
 * throttle เป็น in-memory ต่อ conversationId — แต่ละเคสใช้ id ไม่ซ้ำกัน ไม่งั้นใบที่สองจะถูกกลืน
 */
describe('pushNewChatMessage — ลำดับบรรทัด', () => {
  beforeEach(() => vi.mocked(pushToUsers).mockClear())

  it('[blocker] เพจอยู่ title · คนส่งอยู่ subtitle · ข้อความอยู่ body', async () => {
    vi.mocked(getConversationToastPreview).mockResolvedValueOnce({
      conversationId: 'c-order-1',
      senderName: 'ศิริพงศ์ชาวด์ แอนด์มิวสิค',
      senderAvatarUrl: null,
      preview: 'เปลี่ยนเลนใหม่ด้วยใช่มั้ยครับ',
      channel: 'MESSENGER',
      channelName: 'BT Premium Auto Xenon คลอง4 ธัญบุรี',
      lastMessageAt: new Date('2026-08-08T11:50:00.000Z'),
    })

    await pushNewChatMessage({ shopId: 'shop1', conversationId: 'c-order-1' })

    const [, title, body, , options] = vi.mocked(pushToUsers).mock.calls[0]!
    expect(title).toBe('BT Premium Auto Xenon คลอง4 ธัญบุรี')
    expect(options?.subtitle).toBe('ศิริพงศ์ชาวด์ แอนด์มิวสิค')
    expect(body).toBe('เปลี่ยนเลนใหม่ด้วยใช่มั้ยครับ')
  })

  it('ข้อความที่ไม่มีตัวหนังสือ (รูป/การ์ด) ต้องมีคำแทน ไม่ปล่อย body ว่าง', async () => {
    vi.mocked(getConversationToastPreview).mockResolvedValueOnce({
      conversationId: 'c-order-2',
      senderName: 'สมชาย',
      senderAvatarUrl: null,
      preview: null,
      channel: 'DEEP',
      channelName: null,
      lastMessageAt: new Date('2026-08-08T11:50:00.000Z'),
    })

    await pushNewChatMessage({ shopId: 'shop1', conversationId: 'c-order-2' })

    const [, title, body, , options] = vi.mocked(pushToUsers).mock.calls[0]!
    expect(title).toBe('Deep') // ไม่มีเพจ → ถอยไปใช้ชื่อช่องทาง
    expect(options?.subtitle).toBe('สมชาย')
    expect(body).toBe('ส่งข้อความถึงคุณ')
  })
})

/**
 * ตั้งค่าแจ้งเตือนรายร้าน (user สั่ง 2026-08-08: "ตั้งค่าทีละร้านได้")
 *
 * ทดสอบผ่าน pushNewChatMessage เพราะ shopAudience เป็นฟังก์ชันภายใน — และที่สำคัญกว่าคือ
 * สิ่งที่ต้องรับประกันจริง ๆ ไม่ใช่ "ฟังก์ชันคืนอาร์เรย์อะไร" แต่คือ **คนที่กดปิดต้องไม่ได้รับ push**
 */
describe('pushNewChatMessage — ตั้งค่าแจ้งเตือนรายร้าน', () => {
  beforeEach(() => {
    vi.mocked(pushToUsers).mockClear()
    vi.mocked(prisma.shopNotificationPref.findMany).mockResolvedValue(selected([]))
    vi.mocked(prisma.shopMember.findMany).mockResolvedValue(selected([]))
  })

  it('ไม่มีแถวใน ShopNotificationPref = เปิดอยู่ → ยังได้รับตามปกติ', async () => {
    // กติกา opt-out: ผู้ใช้เดิมทุกคนและร้านที่เพิ่งสร้างต้องได้ noti โดยไม่ต้องมีใครไปสร้างแถวให้
    vi.mocked(getConversationToastPreview).mockResolvedValueOnce(previewFor('c-pref-1'))

    await pushNewChatMessage({ shopId: 'shop1', conversationId: 'c-pref-1' })

    const [audience] = vi.mocked(pushToUsers).mock.calls[0]!
    expect(audience).toEqual(['owner1'])
  })

  it('[blocker] คนที่ปิดแจ้งเตือนของร้านนี้ ต้องถูกหักออกจากผู้รับ', async () => {
    vi.mocked(prisma.shopNotificationPref.findMany).mockResolvedValue(selected([{ userId: 'owner1' }]))
    vi.mocked(getConversationToastPreview).mockResolvedValueOnce(previewFor('c-pref-2'))

    await pushNewChatMessage({ shopId: 'shop1', conversationId: 'c-pref-2' })

    // ไม่เหลือผู้รับเลย → ต้องไม่เรียก pushToUsers ทิ้งไว้ให้ยิงเปล่า
    expect(vi.mocked(pushToUsers)).not.toHaveBeenCalled()
  })

  it('ปิดของคนหนึ่ง ต้องไม่กระทบพนักงานคนอื่นในร้านเดียวกัน', async () => {
    // เส้นแบ่งสำคัญ: ค่านี้เป็นความชอบของ "คน" ไม่ใช่การตั้งค่าของ "ร้าน"
    vi.mocked(prisma.shopMember.findMany).mockResolvedValue(selected([{ userId: 'staff1' }, { userId: 'staff2' }]))
    vi.mocked(prisma.shopNotificationPref.findMany).mockResolvedValue(selected([{ userId: 'staff1' }]))
    vi.mocked(getConversationToastPreview).mockResolvedValueOnce(previewFor('c-pref-3'))

    await pushNewChatMessage({ shopId: 'shop1', conversationId: 'c-pref-3' })

    const [audience] = vi.mocked(pushToUsers).mock.calls[0]!
    expect(audience).toContain('owner1')
    expect(audience).toContain('staff2')
    expect(audience).not.toContain('staff1')
  })
})
