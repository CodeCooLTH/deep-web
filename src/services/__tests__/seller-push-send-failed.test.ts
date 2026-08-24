// seller-push-send-failed.test.ts — [blocker] แจ้งเตือนเข้าแอปเมื่อข้อความของผู้ขาย "ส่งไม่ออก"
//
// 🛑 ทำไมเทสชุดนี้ถึงเป็น blocker: ก่อน CR คิวขาออก (2026-08-23) ความล้มเหลวถูกรายงานกลับใน
// response ของคำขอที่ผู้ขาย **นั่งรออยู่** — พอการยิงจริงย้ายไปหลังบ้าน มันกลายเป็นเหตุการณ์
// asynchronous ที่ไม่มีใครนั่งรอ. สมมติฐานทั้งหมดของงานคือ *ผู้ขายไม่ได้ดูจออยู่* (D-4) ⇒ ถ้าไม่มี
// ตัวแจ้ง ผู้ขายจะมีโอกาสรู้ว่าส่งไม่สำเร็จ **น้อยลงกว่าก่อนทำ CR** ซึ่งกลับทิศกับเจตนาของงาน
//
// 🛑 `describeSendFailure` **ไม่ถูก mock** โดยตั้งใจ — สิ่งที่ต้องรับประกันคือ "ผู้ขายได้อ่านถ้อยคำ
// ชุดเดียวกับที่บับเบิลในเธรดพูด" (HR16) ไม่ใช่ "โค้ดเรียกฟังก์ชันชื่อนี้" ⇒ เทียบกับ **ข้อความจริง**
import { beforeEach, describe, expect, it, vi } from 'vitest'

// seller-push.service import prisma ที่ระดับ module — เทสนี้ไม่แตะฐานข้อมูลจริงเลย จึง mock ทิ้ง
// (Hard Rule 13)
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

const { pushChatSendFailed, pushNewChatMessage } = await import('@/services/seller-push.service')
const { getConversationToastPreview } = await import('@/services/chat.service')
const { pushToUsers } = await import('@/services/app-push.service')
const { prisma } = await import('@/lib/prisma')

/** ดูเหตุผลเต็มที่ seller-push-page-title.test.ts — mock ของ Prisma มองไม่เห็น `select` */
const selected = <T,>(rows: T[]) => rows as never

function previewFor(conversationId: string) {
  return {
    conversationId,
    senderName: 'สมชาย',
    senderAvatarUrl: null,
    preview: 'สวัสดีครับ',
    channel: 'MESSENGER',
    channelName: 'BT Premium',
    lastMessageAt: new Date('2026-08-23T11:50:00.000Z'),
  }
}

beforeEach(() => {
  vi.mocked(pushToUsers).mockClear()
  vi.mocked(getConversationToastPreview).mockReset()
  vi.mocked(getConversationToastPreview).mockImplementation(async (conversationId: string) =>
    previewFor(conversationId),
  )
  vi.mocked(prisma.shopNotificationPref.findMany).mockResolvedValue(selected([]))
  vi.mocked(prisma.shopMember.findMany).mockResolvedValue(selected([]))
})

describe('pushChatSendFailed — throttle', () => {
  /**
   * 🛑 หัวใจของเทสข้อนี้: throttle key ต้องอยู่ **คนละ namespace** กับ noti "ข้อความใหม่"
   *
   * ถ้าใช้ `chat:${conversationId}` ร่วมกัน noti "ส่งไม่สำเร็จ" จะถูกกลืนทุกครั้งที่ห้องเดียวกัน
   * เพิ่งมีข้อความลูกค้าเข้ามาภายใน 25 วินาที — ซึ่งเป็น **สถานการณ์ปกติที่สุดของการคุยแชท**
   * (ลูกค้าทัก → ร้านตอบ → ตอบไม่ออก) ⇒ ตัวแจ้งจะเงียบพอดีในเคสที่มันถูกสร้างมาเพื่อแจ้ง
   * คลาสเดียวกับ docs/conventions/log-row-collides-with-the-guard-it-explains.md
   */
  it('[blocker] key ต้องไม่ชนกับ noti ข้อความใหม่ของห้องเดียวกัน', async () => {
    await pushNewChatMessage({ shopId: 's1', conversationId: 'c-throttle-1' })
    await pushChatSendFailed({
      shopId: 's1',
      conversationId: 'c-throttle-1',
      failureReason: 'CHANNEL_NOT_ACTIVE',
    })

    expect(vi.mocked(pushToUsers)).toHaveBeenCalledTimes(2)
    // วัด "ผลลัพธ์" ไม่ใช่แค่จำนวน — ใบที่สองต้องเป็นใบที่บอกว่าส่งไม่ออกจริง ๆ
    const [, , secondBody] = vi.mocked(pushToUsers).mock.calls[1]!
    expect(secondBody).toContain('ส่งไม่สำเร็จ')
  })

  it('[blocker] ล้มซ้ำในห้องเดิมติด ๆ กัน → รวบเหลือใบเดียว (ผู้ขายพิมพ์รัวแล้วล้มทั้งชุด)', async () => {
    await pushChatSendFailed({ shopId: 's1', conversationId: 'c-throttle-2', failureReason: 'WINDOW_CLOSED' })
    await pushChatSendFailed({ shopId: 's1', conversationId: 'c-throttle-2', failureReason: 'WINDOW_CLOSED' })

    expect(vi.mocked(pushToUsers)).toHaveBeenCalledTimes(1)
  })

  it('คนละห้อง = คนละใบ (throttle ต่อเธรด ไม่ใช่ต่อร้าน)', async () => {
    await pushChatSendFailed({ shopId: 's1', conversationId: 'c-throttle-3', failureReason: 'WINDOW_CLOSED' })
    await pushChatSendFailed({ shopId: 's1', conversationId: 'c-throttle-4', failureReason: 'WINDOW_CLOSED' })

    expect(vi.mocked(pushToUsers)).toHaveBeenCalledTimes(2)
  })
})

describe('pushChatSendFailed — ถ้อยคำ (HR16)', () => {
  /**
   * ผู้ขายต้องไม่เจอ "สองสำนวนสำหรับเรื่องเดียวกัน" — บับเบิลในเธรดกับ noti บนมือถือต้องพูดเหมือนกัน
   * ⇒ เทียบกับ **ข้อความจริง** ที่ `src/lib/chat-send-failure.ts` เขียนไว้ ไม่ใช่เทียบกับ
   * `describeSendFailure(...)` ซ้ำ (นั่นคือการเทียบของกับตัวมันเอง = เขียวไม่ว่าโค้ดทำอะไร)
   */
  it('[blocker] รหัสภายในต้องถูกแปลเป็นถ้อยคำชุดเดียวกับที่บับเบิลใช้', async () => {
    await pushChatSendFailed({
      shopId: 's1',
      conversationId: 'c-copy-1',
      failureReason: 'CHANNEL_NOT_ACTIVE',
    })

    // (clarify 2026-08-23) preview ของ fixture นี้เป็น MESSENGER ⇒ ได้ถ้อยคำสายเพจ และเป็น
    // **ฉบับย่อ** เพราะ noti ถูกระบบตัดหางทิ้ง (P0-1)
    const [, , body] = vi.mocked(pushToUsers).mock.calls[0]!
    expect(body).toBe('ส่งไม่สำเร็จ — การเชื่อมต่อกับ Facebook Page หมดอายุ — เชื่อมเพจใหม่')
  })

  it('[blocker] ข้อความดิบของ Meta ต้องถูกแปลไทย ไม่ยิงอังกฤษเข้าแอป', async () => {
    await pushChatSendFailed({
      shopId: 's1',
      conversationId: 'c-copy-2',
      failureReason: "(#551) This person isn't available right now.",
    })

    const [, , body] = vi.mocked(pushToUsers).mock.calls[0]!
    expect(body).toContain('ลูกค้าไม่พร้อมรับข้อความ')
    expect(body).not.toContain('available right now')
  })

  it('[blocker] รหัสภายในที่ยังไม่มีกฎรองรับ ต้องไม่หลุดเป็นอังกฤษดิบ (ตาข่ายของ chat-send-failure)', async () => {
    await pushChatSendFailed({
      shopId: 's1',
      conversationId: 'c-copy-3',
      failureReason: 'SOME_BRAND_NEW_CODE',
    })

    const [, , body] = vi.mocked(pushToUsers).mock.calls[0]!
    expect(body).not.toContain('SOME_BRAND_NEW_CODE')
    expect(body).toContain('ยังไม่รู้สาเหตุ')
  })

  it('ไม่มีเหตุผลติดมาเลย (null) → ยังต้องมีข้อความ ห้าม body ว่าง', async () => {
    await pushChatSendFailed({ shopId: 's1', conversationId: 'c-copy-4', failureReason: null })

    const [, , body] = vi.mocked(pushToUsers).mock.calls[0]!
    expect(body.trim().length).toBeGreaterThan(0)
    expect(body).toContain('ส่งไม่สำเร็จ')
  })
})

/**
 * ลำดับ 3 บรรทัดของ noti (user สั่งเอง 2026-08-08 หลังแก้ 3 รอบในวันเดียว — ห้ามสลับ):
 *
 *   [ ชื่อเพจ ] · [ ชื่อคู่สนทนา ] · [ ข้อความ ]
 *
 * ใบนี้ "ชื่อคนส่ง" = ลูกค้าที่เราส่งหาไม่สำเร็จ — เป็นตัวระบุห้องแบบเดียวกับ noti ข้อความใหม่
 * ผู้ขายจึงอ่าน noti สองชนิดด้วยสายตาชุดเดียวกัน ไม่ต้องเรียนรู้รูปแบบใหม่
 */
describe('pushChatSendFailed — ลำดับบรรทัด', () => {
  it('[blocker] เพจอยู่ title · คู่สนทนาอยู่ subtitle · เหตุผลอยู่ body', async () => {
    vi.mocked(getConversationToastPreview).mockResolvedValueOnce({
      conversationId: 'c-line-1',
      senderName: 'ศิริพงศ์ชาวด์ แอนด์มิวสิค',
      senderAvatarUrl: null,
      preview: 'เปลี่ยนเลนใหม่ด้วยใช่มั้ยครับ',
      channel: 'MESSENGER',
      channelName: 'BT Premium Auto Xenon คลอง4 ธัญบุรี',
      lastMessageAt: new Date('2026-08-23T11:50:00.000Z'),
    })

    await pushChatSendFailed({ shopId: 's1', conversationId: 'c-line-1', failureReason: 'WINDOW_CLOSED' })

    const [, title, body, data, options] = vi.mocked(pushToUsers).mock.calls[0]!
    expect(title).toBe('BT Premium Auto Xenon คลอง4 ธัญบุรี')
    expect(options?.subtitle).toBe('ศิริพงศ์ชาวด์ แอนด์มิวสิค')
    // ฉบับย่อของ WINDOW_CLOSED (P0-1) — บับเบิลยังได้ประโยคเต็มเหมือนเดิม
    expect(body).toContain('หมดเวลาที่ Meta ให้ส่ง')
    // กด noti แล้วต้องเปิดห้องที่ส่งไม่ออก ไม่ใช่หน้ารวม — ผู้ขายต้องเห็นบับเบิลแดงใบนั้นทันที
    expect(data).toMatchObject({ url: '/inbox/c-line-1' })
  })

  it('เธรด Deep (ไม่มีเพจ) → title ถอยไปใช้ชื่อช่องทาง ห้ามว่าง', async () => {
    vi.mocked(getConversationToastPreview).mockResolvedValueOnce({
      ...previewFor('c-line-2'),
      channel: 'DEEP',
      channelName: null,
    })

    await pushChatSendFailed({ shopId: 's1', conversationId: 'c-line-2', failureReason: null })

    const [, title] = vi.mocked(pushToUsers).mock.calls[0]!
    expect(title).toBe('Deep')
  })
})

describe('pushChatSendFailed — ผู้รับ', () => {
  /**
   * 🛑 ต้องผ่าน `shopAudience()` ไม่ใช่ยิงตรงไปที่ทุกคนที่ดูแลร้าน — สวิตช์ "ปิดแจ้งเตือนร้านนี้"
   * (user สั่ง 2026-08-08) ครอบ noti ของ **แชท** ทั้งหมด และใบนี้ก็คือ noti ของแชทใบหนึ่ง
   * (ต่างจาก `pushChannelDisconnected` ซึ่งเป็น "ข่าวสถานะระบบ" และตั้งใจข้ามสวิตช์ — D-CH-8)
   */
  it('[blocker] คนที่ปิดแจ้งเตือนของร้านนี้ ต้องถูกหักออกจากผู้รับ', async () => {
    vi.mocked(prisma.shopMember.findMany).mockResolvedValue(selected([{ userId: 'staff1' }, { userId: 'staff2' }]))
    vi.mocked(prisma.shopNotificationPref.findMany).mockResolvedValue(selected([{ userId: 'staff1' }]))

    await pushChatSendFailed({ shopId: 's1', conversationId: 'c-aud-1', failureReason: 'WINDOW_CLOSED' })

    const [audience] = vi.mocked(pushToUsers).mock.calls[0]!
    expect(audience).toContain('owner1')
    expect(audience).toContain('staff2')
    expect(audience).not.toContain('staff1')
  })

  it('[blocker] ปิดกันหมดทั้งร้าน → ต้องไม่เรียก pushToUsers ทิ้งไว้ยิงเปล่า', async () => {
    vi.mocked(prisma.shopNotificationPref.findMany).mockResolvedValue(selected([{ userId: 'owner1' }]))

    await pushChatSendFailed({ shopId: 's1', conversationId: 'c-aud-2', failureReason: 'WINDOW_CLOSED' })

    expect(vi.mocked(pushToUsers)).not.toHaveBeenCalled()
  })

  it('[blocker] เธรดไม่ใช่ของร้านนี้ (preview = null) → ห้ามยิง', async () => {
    // ownership อยู่ใน WHERE ของ getConversationToastPreview ({ id, shopId }) — คืน null = ไม่ใช่ของเรา
    vi.mocked(getConversationToastPreview).mockResolvedValueOnce(null)

    await pushChatSendFailed({ shopId: 's1', conversationId: 'c-aud-3', failureReason: 'WINDOW_CLOSED' })

    expect(vi.mocked(pushToUsers)).not.toHaveBeenCalled()
  })

  it('[blocker] best-effort — ปลายทางพังต้องไม่ throw ออกไปพาการส่งข้อความล้มตาม', async () => {
    // call site อยู่ในเส้นทางส่งข้อความ (chat-outbox) ถ้า throw จะทำให้แถวค้าง claim แล้วถูกกวาด
    // เป็น "ไม่แน่ใจว่าส่งไปหรือยัง" ทั้งที่รู้ผลแน่ชัดแล้ว
    vi.mocked(getConversationToastPreview).mockRejectedValueOnce(new Error('DB ล่ม'))

    await expect(
      pushChatSendFailed({ shopId: 's1', conversationId: 'c-aud-4', failureReason: 'WINDOW_CLOSED' }),
    ).resolves.toBeUndefined()
  })
})

/**
 * (impeccable clarify 2026-08-23 P0-1 / P0-2) — ถ้อยคำที่เขียนไว้สำหรับ *บับเบิล* ถูกยกมาเป็น body
 * ของ push โดยตรง
 *
 * 🛑 iOS ย่อ body เหลือราว 2 บรรทัด (~100 ตัวอักษร) แล้ว **ตัดหางทิ้ง** — หางคือส่วนหลัง `—`
 * ซึ่งเป็นส่วนที่บอกว่าต้องทำอะไรต่อ. ถ้อยคำที่ยาวที่สุดในตารางคือ 189 ตัวอักษร ⇒ ผู้ขายจะได้อ่าน
 * แต่คำบรรยายปัญหา โดยไม่มีทางออกติดมาเลย (บทเรียนเดิม 2026-08-08: ลำดับบรรทัดของ noti ถูกแก้
 * 3 รอบในวันเดียว เพราะมีคน **ประเมินที่ว่างโดยไม่ได้วัด**)
 */
describe('pushChatSendFailed — ความยาว body (P0-1)', () => {
  /** เพดานที่ iOS ย่อ body ลงเหลือ ก่อนผู้ใช้กดกางเอง */
  const IOS_BODY_BUDGET = 100

  async function bodyOf(conversationId: string, failureReason: string, channel = 'MESSENGER') {
    vi.mocked(getConversationToastPreview).mockResolvedValueOnce({
      ...previewFor(conversationId),
      channel,
    })
    await pushChatSendFailed({ shopId: 's1', conversationId, failureReason })
    const call = vi.mocked(pushToUsers).mock.calls.at(-1)!
    return call[2]
  }

  it('[blocker] เหตุผลที่ยาวที่สุดต้องยังอยู่ในโควตา และ **ทางออกต้องไม่ถูกตัด**', async () => {
    // QUOTA_EXCEEDED = ถ้อยคำที่ยาวที่สุดในตาราง (189 ตัวอักษร) ⇒ เดิมโดนตัดตรงกลางประโยคพอดี
    const body = await bodyOf('c-len-1', 'QUOTA_EXCEEDED', 'LINE')
    expect(body.length).toBeLessThanOrEqual(IOS_BODY_BUDGET)
    // ทางออกอยู่หลัง `—` — ถ้าโดนตัด ผู้ขายจะเหลือแต่ "โควตาเต็ม" โดยไม่รู้ว่าทำอะไรได้
    expect(body.split('—').length).toBeGreaterThanOrEqual(3)
    expect(body).toContain('LINE OA Manager')
  })

  it.each([
    'QUOTA_EXCEEDED',
    'CONTACT_BLOCKED',
    'TOKEN_INVALID',
    'CHANNEL_NOT_ACTIVE',
    'WINDOW_CLOSED',
    'FORBIDDEN',
    "(#551) This person isn't available right now.",
    "(#100) Cannot tag messages with 'HUMAN_AGENT' without prior approval.",
    '(#10) Message failed to send because another app is controlling this thread now.',
  ])('[blocker] body ของ %s ต้องไม่เกินโควตาที่ iOS ย่อ', async (reason) => {
    const body = await bodyOf(`c-len-${encodeURIComponent(reason).slice(0, 12)}`, reason)
    expect(`${reason} → ${body.length}`).toBe(`${reason} → ${Math.min(body.length, IOS_BODY_BUDGET)}`)
  })

  /**
   * 🛑 mutation ที่ต้องจับให้ได้: เปลี่ยน `.shortMessage` กลับเป็น `.message`
   * เทียบกับ **สตริงเต็มที่เขียนไว้จริง** ไม่ใช่เรียก describeSendFailure ซ้ำ (เทียบของกับตัวมันเอง)
   */
  it('[blocker] ต้องเป็นฉบับย่อ ไม่ใช่ประโยคเต็มของบับเบิล', async () => {
    const body = await bodyOf('c-len-short', 'CONTACT_BLOCKED', 'LINE')
    expect(body).toBe('ส่งไม่สำเร็จ — ลูกค้าปิดรับข้อความจากบัญชีนี้ — ต้องรอลูกค้าเปิดรับอีกครั้ง')
    expect(body).not.toContain('ครั้งล่าสุดที่ส่งข้อความหาลูกค้ารายนี้ไม่สำเร็จ')
  })
})

/**
 * (P0-2) `CHANNEL_NOT_ACTIVE` ถูกโยนจากกิ่ง LINE ด้วย — push ต้องส่งช่องทางของเธรดเข้าไป
 * ไม่งั้นผู้ขาย LINE ได้ noti ที่สั่งให้ไปเชื่อม Facebook Page ซึ่งไม่มีในบัญชีของเขาเลย
 */
describe('pushChatSendFailed — ถ้อยคำต้องตรงช่องทาง (P0-2)', () => {
  it('[blocker] เธรด LINE ต้องไม่ได้ noti ที่พูดถึง Facebook', async () => {
    vi.mocked(getConversationToastPreview).mockResolvedValueOnce({
      ...previewFor('c-ch-line'),
      channel: 'LINE',
      channelName: 'ร้านทดสอบ LINE OA',
    })
    await pushChatSendFailed({ shopId: 's1', conversationId: 'c-ch-line', failureReason: 'CHANNEL_NOT_ACTIVE' })

    const [, , body] = vi.mocked(pushToUsers).mock.calls[0]!
    expect(body).not.toContain('Facebook')
    expect(body).toContain('ตั้งค่าช่องทาง')
  })

  it('[blocker] เธรด Messenger ยังชี้ไปที่เพจเหมือนเดิม (ไม่ใช่เปลี่ยนทุกคนเป็นคำกลาง)', async () => {
    await pushChatSendFailed({ shopId: 's1', conversationId: 'c-ch-fb', failureReason: 'CHANNEL_NOT_ACTIVE' })

    const [, , body] = vi.mocked(pushToUsers).mock.calls[0]!
    expect(body).toContain('Facebook Page')
  })

  it('ช่องทางที่ไม่รู้จักในข้อมูล → ตกไปถ้อยคำกลาง ห้ามเดาว่าเป็นเจ้าใดเจ้าหนึ่ง', async () => {
    vi.mocked(getConversationToastPreview).mockResolvedValueOnce({
      ...previewFor('c-ch-unknown'),
      channel: 'SOME_FUTURE_CHANNEL',
    })
    await pushChatSendFailed({
      shopId: 's1',
      conversationId: 'c-ch-unknown',
      failureReason: 'CHANNEL_NOT_ACTIVE',
    })

    const [, , body] = vi.mocked(pushToUsers).mock.calls[0]!
    expect(body).not.toContain('Facebook')
    expect(body).not.toContain('LINE')
  })
})
