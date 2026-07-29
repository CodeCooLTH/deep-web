/**
 * auto-reply-send.service.test.ts — unit tests ของจุดส่งข้อความอัตโนมัติ (feature 00023, S-06)
 *
 * งานนี้คือส่วนที่ Scope Baseline ทำเครื่องหมายว่าเสี่ยงที่สุดของ phase — test จึงเน้น
 * "เงื่อนไขที่ต้องไม่ส่ง" มากกว่า "ส่งได้"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { conversation: { findFirst: vi.fn() } },
}))

vi.mock('@/services/channel-chat.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/channel-chat.service')>(
    '@/services/channel-chat.service',
  )
  return {
    // getWindowState เป็น pure function — ใช้ของจริงเพื่อไม่ให้ test หลอกตัวเอง
    getWindowState: actual.getWindowState,
    sendOutboundMessage: vi.fn(),
  }
})

import { prisma } from '@/lib/prisma'
import { sendOutboundMessage } from '@/services/channel-chat.service'
import { sendAutoReply } from '@/services/auto-reply-send.service'

const findFirst = vi.mocked(prisma.conversation.findFirst)
const sendOutbound = vi.mocked(sendOutboundMessage)

const SHOP = 'shop-1'
const CONV = 'conv-1'

/** เธรดที่ทุกเงื่อนไขผ่าน — แต่ละ test ค่อย override เฉพาะช่องที่ต้องการทดสอบ */
function okConversation(over: Record<string, unknown> = {}) {
  return {
    id: CONV,
    isSpam: false,
    handoffAt: null,
    autoReplyPausedUntil: null,
    // ลูกค้าเพิ่งทักเมื่อกี้ -> หน้าต่าง 24 ชม. เปิด
    lastInboundAt: new Date(Date.now() - 60_000),
    shopChannel: { status: 'ACTIVE' },
    ...over,
  }
}

const baseParams = { conversationId: CONV, shopId: SHOP, text: 'ราคา 590 บาทค่ะ', isTest: false }

beforeEach(() => {
  vi.clearAllMocks()
  sendOutbound.mockResolvedValue({ id: 'msg-1' } as never)
})

describe('เงื่อนไขที่ต้องไม่ส่ง', () => {
  it('เธรดไม่อยู่ในร้านนี้ -> CONVERSATION_NOT_FOUND และไม่ยิง Send API', async () => {
    findFirst.mockResolvedValue(null as never)
    const r = await sendAutoReply(baseParams)
    expect(r).toMatchObject({ sent: false, reason: 'CONVERSATION_NOT_FOUND' })
    expect(sendOutbound).not.toHaveBeenCalled()
  })

  it('shopId ถูกใส่ใน where ตั้งแต่ชั้น query (กันยิงข้ามร้าน)', async () => {
    findFirst.mockResolvedValue(okConversation() as never)
    await sendAutoReply(baseParams)
    expect(findFirst.mock.calls[0]![0]!.where).toMatchObject({ id: CONV, shopId: SHOP })
  })

  it('เธรดสแปม -> ไม่ส่ง', async () => {
    findFirst.mockResolvedValue(okConversation({ isSpam: true }) as never)
    const r = await sendAutoReply(baseParams)
    expect(r).toMatchObject({ sent: false, reason: 'SPAM' })
    expect(sendOutbound).not.toHaveBeenCalled()
  })

  it('เธรดถูกส่งต่อพนักงานแล้ว -> ไม่ส่ง', async () => {
    findFirst.mockResolvedValue(okConversation({ handoffAt: new Date() }) as never)
    const r = await sendAutoReply(baseParams)
    expect(r).toMatchObject({ sent: false, reason: 'HANDED_OFF' })
    expect(sendOutbound).not.toHaveBeenCalled()
  })

  it('พนักงานเพิ่งตอบ (autoReplyPausedUntil ยังไม่หมด) -> ไม่ส่ง', async () => {
    findFirst.mockResolvedValue(
      okConversation({ autoReplyPausedUntil: new Date(Date.now() + 60_000) }) as never,
    )
    const r = await sendAutoReply(baseParams)
    expect(r).toMatchObject({ sent: false, reason: 'PAUSED_HUMAN_TAKEOVER' })
    expect(sendOutbound).not.toHaveBeenCalled()
  })

  it('ช่วงหยุดหมดอายุแล้ว -> ส่งได้ตามปกติ', async () => {
    findFirst.mockResolvedValue(
      okConversation({ autoReplyPausedUntil: new Date(Date.now() - 60_000) }) as never,
    )
    const r = await sendAutoReply(baseParams)
    expect(r.sent).toBe(true)
  })

  it('หน้าต่าง 24 ชม. ปิด -> ไม่ยิง Send API (ชั้นป้องกันสุดท้าย)', async () => {
    findFirst.mockResolvedValue(
      okConversation({ lastInboundAt: new Date(Date.now() - 25 * 3600_000) }) as never,
    )
    const r = await sendAutoReply(baseParams)
    expect(r).toMatchObject({ sent: false, reason: 'WINDOW_CLOSED' })
    expect(sendOutbound).not.toHaveBeenCalled()
  })

  it('channel ไม่ ACTIVE -> ไม่ยิง (กันเสีย round-trip ไป Graph)', async () => {
    findFirst.mockResolvedValue(
      okConversation({ shopChannel: { status: 'TOKEN_INVALID' } }) as never,
    )
    const r = await sendAutoReply(baseParams)
    expect(r).toMatchObject({ sent: false, reason: 'CHANNEL_INACTIVE' })
    expect(sendOutbound).not.toHaveBeenCalled()
  })
})

describe('การส่งและการติดป้าย', () => {
  beforeEach(() => findFirst.mockResolvedValue(okConversation() as never))

  it('ส่งปกติ -> ติดป้าย AUTO และส่ง systemShopId ไปให้ cross-check', async () => {
    const r = await sendAutoReply(baseParams)
    expect(r).toMatchObject({ sent: true, messageId: 'msg-1', attempts: 1 })
    expect(sendOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV,
        actorUserId: null,
        systemShopId: SHOP,
        autoReplyKind: 'AUTO',
      }),
    )
  })

  it('โหมดทดสอบ -> ติดป้าย AUTO_TEST (แยกจากของจริงในบันทึกได้)', async () => {
    await sendAutoReply({ ...baseParams, isTest: true })
    expect(sendOutbound.mock.calls[0]![0]).toMatchObject({ autoReplyKind: 'AUTO_TEST' })
  })

  it('ห้ามส่ง actorUserId เป็น user ปลอม — ต้องเป็น null เสมอบนเส้นทางระบบ', async () => {
    await sendAutoReply(baseParams)
    expect(sendOutbound.mock.calls[0]![0]!.actorUserId).toBeNull()
  })
})

describe('การลองซ้ำ (TD-001 ชั้นที่ 2)', () => {
  beforeEach(() => {
    findFirst.mockResolvedValue(okConversation() as never)
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('ล้มเหลวชั่วคราวแล้วสำเร็จรอบ 2 -> ไม่ต้องรอ sweeper', async () => {
    sendOutbound
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce({ id: 'msg-2' } as never)

    const p = sendAutoReply(baseParams)
    await vi.advanceTimersByTimeAsync(1000)
    const r = await p

    expect(r).toMatchObject({ sent: true, messageId: 'msg-2', attempts: 2 })
  })

  it('ล้มเหลวครบ 3 ครั้ง -> ยอมแพ้พร้อมบอกเหตุผล', async () => {
    sendOutbound.mockRejectedValue(new Error('ETIMEDOUT'))

    const p = sendAutoReply(baseParams)
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000)
    const r = await p

    expect(r).toMatchObject({ sent: false, reason: 'SEND_FAILED', attempts: 3 })
    expect(sendOutbound).toHaveBeenCalledTimes(3)
  })

  it('error ที่ลองใหม่ไปก็เหมือนเดิม (FORBIDDEN) -> ออกทันที ไม่เสียเวลา backoff', async () => {
    sendOutbound.mockRejectedValue(new Error('FORBIDDEN'))

    const r = await sendAutoReply(baseParams)

    expect(r).toMatchObject({ sent: false, attempts: 1 })
    expect(sendOutbound).toHaveBeenCalledOnce()
  })
})
