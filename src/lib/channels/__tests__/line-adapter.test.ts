import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LineAdapter, buildLineExternalMessageId } from '@/lib/channels/line-adapter'
import { API_BASE, DATA_API_BASE, MAX_PARTS, REPLY_WINDOW_MS } from '@/lib/line/constants'
import type { ChannelContext } from '@/lib/channels/adapter'

const okJson = (data: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) } as Response)
const failJson = (data: unknown, status = 400) =>
  Promise.resolve({ ok: false, status, json: () => Promise.resolve(data) } as Response)

const baseCtx: ChannelContext = {
  provider: 'LINE',
  accessToken: 'channel-access-token',
  recipientId: 'U0987654321',
}

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn())
  return fetch as unknown as ReturnType<typeof vi.fn>
}

describe('LineAdapter.capabilities', () => {
  it('ตรงตามสเปกทุกฟิลด์ และผูกกับ constants จริง (ไม่ใช่เลข hardcode ซ้ำ)', () => {
    expect(LineAdapter.capabilities).toEqual({
      echo: false,
      readReceipt: false,
      freeWindowMs: REPLY_WINDOW_MS,
      maxPartsPerRequest: MAX_PARTS,
    })
    // ยืนยันว่าอ้างค่าจริงจาก constants ไม่ใช่ตัวเลขที่บังเอิญเท่ากัน
    expect(LineAdapter.capabilities.freeWindowMs).toBe(60_000)
    expect(LineAdapter.capabilities.maxPartsPerRequest).toBe(5)
  })
})

describe('buildLineExternalMessageId (TD-005)', () => {
  it('ใส่ prefix LINE: เสมอ', () => {
    expect(buildLineExternalMessageId('468789577898262530')).toBe('LINE:468789577898262530')
  })
})

describe('LineAdapter.fetchContactProfile', () => {
  beforeEach(() => mockFetch())
  afterEach(() => vi.unstubAllGlobals())

  it('200 → คืน name/avatarUrl จาก displayName/pictureUrl', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      okJson({ userId: 'U1', displayName: 'คุณลูกค้า', pictureUrl: 'https://profile.line-scdn.net/x' }),
    )
    const result = await LineAdapter.fetchContactProfile(baseCtx, 'U1')
    expect(result).toEqual({ name: 'คุณลูกค้า', avatarUrl: 'https://profile.line-scdn.net/x' })
  })

  it('404 (ยังไม่แอดเพื่อน/บล็อกแล้ว) → คืน { name: null, avatarUrl: null } ไม่ throw', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(failJson({ message: 'Not found' }, 404))
    const result = await LineAdapter.fetchContactProfile(baseCtx, 'U-blocked').catch((e) => e)
    expect(result).toEqual({ name: null, avatarUrl: null })
  })

  it('error อื่น (เช่น LINE_UNAVAILABLE 500) → ก็ยังไม่ throw คืนค่าว่างเหมือนกัน', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(failJson({}, 500))
    const result = await LineAdapter.fetchContactProfile(baseCtx, 'U1').catch((e) => e)
    expect(result).toEqual({ name: null, avatarUrl: null })
  })

  it('ยิงไปที่ GET /v2/bot/profile/{userId}', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValue(okJson({}))
    await LineAdapter.fetchContactProfile(baseCtx, 'U999')
    const [url] = mock.mock.calls[0]! as [string]
    expect(url).toBe(`${API_BASE}/v2/bot/profile/U999`)
  })
})

describe('LineAdapter.sendMessages', () => {
  beforeEach(() => mockFetch())
  afterEach(() => vi.unstubAllGlobals())

  it('มี ctx.replyToken → ยิง POST /v2/bot/message/reply พร้อม replyToken+messages', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValue(okJson({ sentMessages: [{ id: 'm1' }] }))
    const ctx: ChannelContext = { ...baseCtx, replyToken: 'reply-token-abc' }
    const result = await LineAdapter.sendMessages(ctx, [{ kind: 'text', text: 'สนใจรุ่นนี้ค่ะ' }])

    const [url, init] = mock.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/v2/bot/message/reply`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      replyToken: 'reply-token-abc',
      messages: [{ type: 'text', text: 'สนใจรุ่นนี้ค่ะ' }],
    })
    expect(result).toEqual({ externalMessageId: 'm1' })
  })

  it('ไม่มี ctx.replyToken → ยิง POST /v2/bot/message/push พร้อม to+messages', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValue(okJson({ sentMessages: [{ id: 'm2' }] }))
    const result = await LineAdapter.sendMessages(baseCtx, [{ kind: 'text', text: 'hello' }])

    const [url, init] = mock.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/v2/bot/message/push`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      to: 'U0987654321',
      messages: [{ type: 'text', text: 'hello' }],
    })
    expect(result).toEqual({ externalMessageId: 'm2' })
  })

  it('push โดยไม่มี recipientId → throw error อ่านออก', async () => {
    const ctx: ChannelContext = { provider: 'LINE', accessToken: 'tok' }
    await expect(LineAdapter.sendMessages(ctx, [{ kind: 'text', text: 'hi' }])).rejects.toThrow(/recipientId/)
  })

  it('parts เกิน MAX_PARTS (5) → throw ก่อนยิง fetch เลย', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    const parts = Array.from({ length: MAX_PARTS + 1 }, (_, i) => ({
      kind: 'text' as const,
      text: `part-${i}`,
    }))
    await expect(LineAdapter.sendMessages(baseCtx, parts)).rejects.toThrow(/เกิน|ไม่เกิน 5/)
    expect(mock).not.toHaveBeenCalled()
  })

  it('parts ว่างเปล่า → throw', async () => {
    await expect(LineAdapter.sendMessages(baseCtx, [])).rejects.toThrow()
  })

  it('แปลง attachment IMAGE เป็น { type: image, originalContentUrl, previewImageUrl }', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValue(okJson({ sentMessages: [{ id: 'm3' }] }))
    await LineAdapter.sendMessages(baseCtx, [
      { kind: 'attachment', attachmentKind: 'IMAGE', url: 'https://x/img.jpg' },
    ])
    const [, init] = mock.mock.calls[0]! as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0]).toEqual({
      // ไม่มี previewUrl มาด้วย → ถอยไปใช้ไฟล์เต็มเป็น preview (พฤติกรรมเดิม ห้ามกลายเป็น undefined
      // เพราะ LINE บังคับให้ field นี้มีค่าเสมอ ส่ง undefined = ข้อความตกทั้งใบ)
      type: 'image',
      originalContentUrl: 'https://x/img.jpg',
      previewImageUrl: 'https://x/img.jpg',
    })
  })

  it('[blocker] IMAGE ที่มี previewUrl → previewImageUrl ต้องเป็นรูปที่ย่อแล้ว ไม่ใช่ไฟล์เต็ม', async () => {
    // LINE จำกัด previewImageUrl ไว้ที่ 1MB ขณะที่ originalContentUrl ได้ถึง 10MB — ถ้าสองฟิลด์นี้
    // ชี้ไฟล์เดียวกัน รูปจากมือถือปกติ (2–5MB) จะเกินเพดาน preview ทุกใบ
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValue(okJson({ sentMessages: [{ id: 'm3b' }] }))
    await LineAdapter.sendMessages(baseCtx, [
      {
        kind: 'attachment',
        attachmentKind: 'IMAGE',
        url: 'https://x/img.jpg',
        previewUrl: 'https://x/thumb.jpg',
      },
    ])
    const [, init] = mock.mock.calls[0]! as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0]).toEqual({
      type: 'image',
      originalContentUrl: 'https://x/img.jpg',
      previewImageUrl: 'https://x/thumb.jpg',
    })
  })

  it('VIDEO ที่มี previewUrl → ใช้ภาพนิ่งที่ส่งมา (LINE ต้องการ jpeg/png ไม่ใช่ไฟล์วิดีโอ)', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValue(okJson({ sentMessages: [{ id: 'm3c' }] }))
    await LineAdapter.sendMessages(baseCtx, [
      {
        kind: 'attachment',
        attachmentKind: 'VIDEO',
        url: 'https://x/clip.mp4',
        previewUrl: 'https://x/thumb.jpg',
      },
    ])
    const [, init] = mock.mock.calls[0]! as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0]).toEqual({
      type: 'video',
      originalContentUrl: 'https://x/clip.mp4',
      previewImageUrl: 'https://x/thumb.jpg',
    })
  })

  it('แปลง attachment AUDIO เป็น { type: audio, originalContentUrl, duration }', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValue(okJson({ sentMessages: [{ id: 'm4' }] }))
    await LineAdapter.sendMessages(baseCtx, [
      { kind: 'attachment', attachmentKind: 'AUDIO', url: 'https://x/a.m4a' },
    ])
    const [, init] = mock.mock.calls[0]! as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0].type).toBe('audio')
    expect(body.messages[0].originalContentUrl).toBe('https://x/a.m4a')
    expect(typeof body.messages[0].duration).toBe('number')
  })

  it('แปลง attachment FILE เป็นข้อความ text ที่มีลิงก์ (LINE ไม่มี message type สำหรับไฟล์ทั่วไป)', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValue(okJson({ sentMessages: [{ id: 'm5' }] }))
    await LineAdapter.sendMessages(baseCtx, [
      { kind: 'attachment', attachmentKind: 'FILE', url: 'https://x/doc.pdf' },
    ])
    const [, init] = mock.mock.calls[0]! as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0]).toEqual({ type: 'text', text: 'https://x/doc.pdf' })
  })

  it('sticker ไม่มี packageId → throw (ไม่รู้จัก stickerId นี้) ไม่ยิง fetch (S-18a)', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    await expect(
      LineAdapter.sendMessages(baseCtx, [{ kind: 'sticker', stickerId: '52002734' }]),
    ).rejects.toThrow(/ไม่รู้จัก/)
    expect(mock).not.toHaveBeenCalled()
  })

  it('sticker มี packageId → ยิง { type: sticker, packageId, stickerId } (S-18a)', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValue(okJson({ sentMessages: [{ id: 'm6' }] }))
    await LineAdapter.sendMessages(baseCtx, [{ kind: 'sticker', stickerId: '1988', packageId: '446' }])
    const [, init] = mock.mock.calls[0]! as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0]).toEqual({ type: 'sticker', packageId: '446', stickerId: '1988' })
  })

  it('ctx.quoteToken → แปะ quoteToken เข้า message object ตัวแรก (S-18a quote reply)', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValue(okJson({ sentMessages: [{ id: 'm7' }] }))
    const ctx: ChannelContext = { ...baseCtx, quoteToken: 'quote-token-xyz' }
    await LineAdapter.sendMessages(ctx, [{ kind: 'text', text: 'ตอบกลับนะคะ' }])
    const [, init] = mock.mock.calls[0]! as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0]).toEqual({ type: 'text', text: 'ตอบกลับนะคะ', quoteToken: 'quote-token-xyz' })
  })

  it('ไม่มี ctx.quoteToken → ไม่มี field quoteToken ติดไปกับ message object เลย', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValue(okJson({ sentMessages: [{ id: 'm8' }] }))
    await LineAdapter.sendMessages(baseCtx, [{ kind: 'text', text: 'hello' }])
    const [, init] = mock.mock.calls[0]! as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0]).toEqual({ type: 'text', text: 'hello' })
  })

  it('response มี sentMessages[0].quoteToken → คืนใน SendMessagesResult.quoteToken (ให้ quote ต่อได้)', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValue(okJson({ sentMessages: [{ id: 'm9', quoteToken: 'sent-quote-token' }] }))
    const result = await LineAdapter.sendMessages(baseCtx, [{ kind: 'text', text: 'hi' }])
    expect(result).toEqual({ externalMessageId: 'm9', quoteToken: 'sent-quote-token' })
  })

  it('response ไม่มี quoteToken → SendMessagesResult.quoteToken เป็น undefined ไม่ throw', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValue(okJson({ sentMessages: [{ id: 'm10' }] }))
    const result = await LineAdapter.sendMessages(baseCtx, [{ kind: 'text', text: 'hi' }])
    expect(result).toEqual({ externalMessageId: 'm10', quoteToken: undefined })
  })
})

describe('LineAdapter.downloadContent', () => {
  beforeEach(() => mockFetch())
  afterEach(() => vi.unstubAllGlobals())

  it('ไม่มี externalMessageId → คืน { url: null } ทันที ไม่ยิง fetch', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    const result = await LineAdapter.downloadContent(baseCtx, {})
    expect(result).toEqual({ url: null })
    expect(mock).not.toHaveBeenCalled()
  })

  it('ยิง GET {DATA_API_BASE}/v2/bot/message/{id}/content ด้วย token เสมอ (ไม่ใช้ ref.url เลย)', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValue(
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
      } as unknown as Response),
    )
    const result = await LineAdapter.downloadContent(baseCtx, {
      url: 'https://should-not-be-used.example/x.jpg',
      externalMessageId: '468789577898262530',
    })
    const [url, init] = mock.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe(`${DATA_API_BASE}/v2/bot/message/468789577898262530/content`)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer channel-access-token')
    expect(result.url).toBeNull()
    expect(result.content).toEqual({ data: Buffer.from([1, 2, 3]), contentType: 'image/jpeg' })
  })

  it('ดาวน์โหลดล้มเหลว (ไม่ ok) → คืน { url: null, content: null } ไม่ throw', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValue(Promise.resolve({ ok: false, status: 410 } as unknown as Response))
    const result = await LineAdapter.downloadContent(baseCtx, { externalMessageId: 'expired-id' })
    expect(result).toEqual({ url: null, content: null })
  })
})
