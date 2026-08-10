import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MetaAdapter } from '@/lib/channels/meta-adapter'
import type { ChannelContext } from '@/lib/channels/adapter'

// (S-18a regression) MetaAdapter ต้อง delegate ตรงไปยัง lib/facebook/graph.ts ทุกประการเหมือนเดิม —
// การเพิ่ม field `packageId` (OutboundMessagePart.sticker) และ `quoteToken` (ChannelContext/
// SendMessagesResult) แบบ additive สำหรับ LINE ต้อง "ไม่มีผล" กับ Meta เลย (scope baseline S-18a
// "ห้ามเปลี่ยนพฤติกรรม Messenger/Instagram แม้จุดเล็ก")
const graph = vi.hoisted(() => ({
  getContactProfile: vi.fn(),
  fetchAttachmentUrl: vi.fn(),
  sendTextMessage: vi.fn(),
  sendAttachmentMessage: vi.fn(),
  sendStickerMessage: vi.fn(),
}))
vi.mock('@/lib/facebook/graph', () => graph)

const baseCtx: ChannelContext = {
  provider: 'MESSENGER',
  accessToken: 'page-token',
  recipientId: 'PSID123',
}

describe('MetaAdapter.sendMessages — sticker (regression, S-18a)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sticker part (ไม่มี packageId เลย — Meta ไม่มีแนวคิดนี้) → เรียก sendStickerMessage ด้วย stickerId ตรง ๆ เหมือนเดิม', async () => {
    graph.sendStickerMessage.mockResolvedValue('mid-sticker-1')
    const result = await MetaAdapter.sendMessages(baseCtx, [{ kind: 'sticker', stickerId: '369239263222822' }])

    expect(graph.sendStickerMessage).toHaveBeenCalledWith(
      'page-token',
      'PSID123',
      '369239263222822',
      undefined,
      undefined,
    )
    expect(result).toEqual({ externalMessageId: 'mid-sticker-1' })
  })

  it('ส่ง packageId มาด้วย (เผื่อ caller ในอนาคตใส่มาเพราะ type รองรับ) → MetaAdapter ยังไม่อ่านค่านี้เลย ไม่กระทบการเรียก graph', async () => {
    graph.sendStickerMessage.mockResolvedValue('mid-sticker-2')
    await MetaAdapter.sendMessages(baseCtx, [
      { kind: 'sticker', stickerId: '369239263222822', packageId: 'ignored-by-meta' },
    ])
    expect(graph.sendStickerMessage).toHaveBeenCalledWith(
      'page-token',
      'PSID123',
      '369239263222822',
      undefined,
      undefined,
    )
  })

  it('ctx.quoteToken (แนวคิดของ LINE) มีค่ามาด้วย → MetaAdapter ไม่อ่าน ยังส่ง reply_to ตาม replyToExternalId ตามเดิม', async () => {
    graph.sendStickerMessage.mockResolvedValue('mid-sticker-3')
    const ctx: ChannelContext = { ...baseCtx, replyToExternalId: 'mid-original', quoteToken: 'should-be-ignored' }
    await MetaAdapter.sendMessages(ctx, [{ kind: 'sticker', stickerId: '369239263222822' }])
    expect(graph.sendStickerMessage).toHaveBeenCalledWith(
      'page-token',
      'PSID123',
      '369239263222822',
      'mid-original',
      undefined,
    )
  })

  it('SendMessagesResult ของ MetaAdapter ไม่มี quoteToken ติดมาเลย (undefined เสมอ)', async () => {
    graph.sendTextMessage.mockResolvedValue('mid-text-1')
    const result = await MetaAdapter.sendMessages(baseCtx, [{ kind: 'text', text: 'hi' }])
    expect(result).toEqual({ externalMessageId: 'mid-text-1' })
    expect('quoteToken' in result).toBe(false)
  })
})
