import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// เหตุผลเดียวกับ shop-channel.service.test.ts (Messenger/IG): vi.mock ถูก hoist ขึ้นก่อน
// const declaration ปกติ — ต้องประกาศ mock ด้วย vi.hoisted กัน TDZ
const db = vi.hoisted(() => ({
  shopChannel: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

// (ส่วนขยาย 2026-08-12) ตัวตรวจสภาพ — mock ไว้เป็น "ไม่มีอะไรผิด" เป็นค่าตั้งต้น
// เทสที่สนใจเรื่องนี้จะ override เอง
const probe = vi.hoisted(() => ({
  probeLineToken: vi.fn().mockResolvedValue({ valid: true, expiresAt: null }),
  probeLineWebhook: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/line/health-probe', () => probe)

const lineClient = vi.hoisted(() => ({ lineApiRequest: vi.fn() }))
vi.mock('@/lib/line/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/line/client')>('@/lib/line/client')
  return { ...actual, lineApiRequest: lineClient.lineApiRequest }
})

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'b'.repeat(64)
})

import {
  connectLineChannel,
  updateLineChannelCredentials,
  verifyLineBotInfo,
} from '@/services/shop-channel.service'
import { LineApiError } from '@/lib/line/client'
import { decryptToken } from '@/lib/token-crypto'

const botInfoResponse = {
  userId: 'Uee65ad697de752be32ab09904219db5c',
  basicId: '@502sjent',
  displayName: 'Deep Chat & LIVE',
  pictureUrl: 'https://profile.line-scdn.net/xxx',
  chatMode: 'bot',
}

describe('shop-channel.service — LINE (S-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.shopChannel.findFirst.mockResolvedValue(null)
    db.shopChannel.findMany.mockResolvedValue([])
    db.shopChannel.update.mockResolvedValue({})
    probe.probeLineToken.mockResolvedValue({ valid: true, expiresAt: null })
    probe.probeLineWebhook.mockResolvedValue(null)
  })

  describe('verifyLineBotInfo', () => {
    it('token ถูกต้อง → คืน botInfo ที่ parse แล้ว', async () => {
      lineClient.lineApiRequest.mockResolvedValue(botInfoResponse)
      const info = await verifyLineBotInfo('token')
      expect(info).toEqual({
        externalId: botInfoResponse.userId,
        basicId: botInfoResponse.basicId,
        displayName: botInfoResponse.displayName,
        pictureUrl: botInfoResponse.pictureUrl,
        chatMode: 'bot',
      })
    })

    it('LINE ตอบ 401 → LineChannelServiceError(TOKEN_INVALID)', async () => {
      lineClient.lineApiRequest.mockRejectedValue(new LineApiError('unauthorized', 401))
      await expect(verifyLineBotInfo('bad')).rejects.toMatchObject({
        name: 'LineChannelServiceError',
        code: 'TOKEN_INVALID',
      })
    })

    it('LINE ตอบ 500 → LineChannelServiceError(LINE_UNAVAILABLE)', async () => {
      lineClient.lineApiRequest.mockRejectedValue(new LineApiError('server error', 500))
      await expect(verifyLineBotInfo('token')).rejects.toMatchObject({
        name: 'LineChannelServiceError',
        code: 'LINE_UNAVAILABLE',
      })
    })

    it('timeout/network error (status 0) → LINE_UNAVAILABLE', async () => {
      lineClient.lineApiRequest.mockRejectedValue(new LineApiError('เชื่อมต่อ LINE API ไม่สำเร็จ', 0))
      await expect(verifyLineBotInfo('token')).rejects.toMatchObject({ code: 'LINE_UNAVAILABLE' })
    })
  })

  describe('connectLineChannel', () => {
    it('verify ผ่าน → เข้ารหัส secret/token ก่อนเขียน DB ไม่เก็บ plaintext', async () => {
      lineClient.lineApiRequest.mockResolvedValue(botInfoResponse)
      db.shopChannel.create.mockResolvedValue({
        id: 'ch1',
        provider: 'LINE',
        externalId: botInfoResponse.userId,
        name: botInfoResponse.displayName,
        avatarUrl: botInfoResponse.pictureUrl,
        status: 'ACTIVE',
        basicId: botInfoResponse.basicId,
      })

      const result = await connectLineChannel({
        shopId: 'shop1',
        userId: 'user1',
        channelSecret: '0123456789abcdef0123456789abcdef',
        channelAccessToken: 'plain-access-token', webhookUrl: 'https://deepthailand.app/api/channels/line/webhook',
      })

      const created = db.shopChannel.create.mock.calls[0]![0].data
      expect(created.accessTokenEnc).not.toContain('plain-access-token')
      expect(created.channelSecretEnc).not.toContain('0123456789abcdef0123456789abcdef')
      expect(decryptToken(created.accessTokenEnc)).toBe('plain-access-token')
      expect(created.externalId).toBe(botInfoResponse.userId) // ต้องมาจาก LINE ไม่ใช่ client (BR-LINE-02)
      expect(result.warnings).toEqual([])
      expect(result.channel.basicId).toBe('@502sjent')
    })

    it('chatMode ไม่ใช่ bot → warnings มี CHAT_MODE_NOT_BOT แต่ยังเชื่อมสำเร็จ', async () => {
      lineClient.lineApiRequest.mockResolvedValue({ ...botInfoResponse, chatMode: 'chat' })
      db.shopChannel.create.mockResolvedValue({
        id: 'ch1', provider: 'LINE', externalId: botInfoResponse.userId,
        name: botInfoResponse.displayName, avatarUrl: null, status: 'ACTIVE', basicId: botInfoResponse.basicId,
      })

      const result = await connectLineChannel({
        shopId: 'shop1', userId: 'user1',
        channelSecret: '0123456789abcdef0123456789abcdef', channelAccessToken: 'tok', webhookUrl: 'https://deepthailand.app/api/channels/line/webhook',
      })

      expect(result.warnings).toEqual(['CHAT_MODE_NOT_BOT'])
    })

    it('token ผิด → ไม่เขียนแถวใด ๆ ลง DB (TC-02)', async () => {
      lineClient.lineApiRequest.mockRejectedValue(new LineApiError('unauthorized', 401))

      await expect(
        connectLineChannel({
          shopId: 'shop1', userId: 'user1',
          channelSecret: '0123456789abcdef0123456789abcdef', channelAccessToken: 'bad', webhookUrl: 'https://deepthailand.app/api/channels/line/webhook',
        }),
      ).rejects.toMatchObject({ code: 'TOKEN_INVALID' })
      expect(db.shopChannel.create).not.toHaveBeenCalled()
      expect(db.shopChannel.update).not.toHaveBeenCalled()
    })

    it('OA นี้ active อยู่กับร้านอื่น → CHANNEL_TAKEN 409 พก shopName กลับไป (TC-21)', async () => {
      lineClient.lineApiRequest.mockResolvedValue(botInfoResponse)
      db.shopChannel.findFirst.mockResolvedValue({ shop: { shopName: 'ร้านอื่น' } })

      await expect(
        connectLineChannel({
          shopId: 'shop1', userId: 'user1',
          channelSecret: '0123456789abcdef0123456789abcdef', channelAccessToken: 'tok', webhookUrl: 'https://deepthailand.app/api/channels/line/webhook',
        }),
      ).rejects.toMatchObject({ code: 'CHANNEL_TAKEN', shopName: 'ร้านอื่น' })
      expect(db.shopChannel.create).not.toHaveBeenCalled()
    })

    it('เชื่อมซ้ำร้านเดิม (reconnect) → reuse แถวเดิม ไม่สร้างใหม่ กัน Conversation orphan', async () => {
      lineClient.lineApiRequest.mockResolvedValue(botInfoResponse)
      db.shopChannel.findMany.mockResolvedValue([{ id: 'ch-old', _count: { contacts: 5 } }])
      db.shopChannel.update.mockResolvedValue({
        id: 'ch-old', provider: 'LINE', externalId: botInfoResponse.userId,
        name: botInfoResponse.displayName, avatarUrl: null, status: 'ACTIVE', basicId: botInfoResponse.basicId,
      })

      const result = await connectLineChannel({
        shopId: 'shop1', userId: 'user1',
        channelSecret: '0123456789abcdef0123456789abcdef', channelAccessToken: 'tok', webhookUrl: 'https://deepthailand.app/api/channels/line/webhook',
      })

      expect(db.shopChannel.create).not.toHaveBeenCalled()
      expect(db.shopChannel.update.mock.calls[0]![0].where).toEqual({ id: 'ch-old' })
      expect(result.channel.id).toBe('ch-old')
    })
  })

  describe('updateLineChannelCredentials', () => {
    it('ไม่พบ channel ของ shop นี้ → CHANNEL_NOT_FOUND_OR_FORBIDDEN (ownership guard)', async () => {
      db.shopChannel.findFirst.mockResolvedValue(null)

      await expect(
        updateLineChannelCredentials({ channelId: 'ch1', shopId: 'shop1', channelAccessToken: 'tok' }),
      ).rejects.toMatchObject({ code: 'CHANNEL_NOT_FOUND_OR_FORBIDDEN' })
      expect(db.shopChannel.update).not.toHaveBeenCalled()
    })

    it('userId ที่ verify ได้ไม่ตรงกับ externalId เดิม → LINE_ACCOUNT_MISMATCH (TC-22)', async () => {
      db.shopChannel.findFirst.mockResolvedValue({ id: 'ch1', externalId: 'U_OLD_ACCOUNT' })
      lineClient.lineApiRequest.mockResolvedValue({ ...botInfoResponse, userId: 'U_DIFFERENT_ACCOUNT' })

      await expect(
        updateLineChannelCredentials({ channelId: 'ch1', shopId: 'shop1', channelAccessToken: 'tok' }),
      ).rejects.toMatchObject({ code: 'LINE_ACCOUNT_MISMATCH' })
      expect(db.shopChannel.update).not.toHaveBeenCalled()
    })

    it('userId ตรงกับเดิม + สถานะ TOKEN_INVALID → กลับเป็น ACTIVE (TC-23)', async () => {
      db.shopChannel.findFirst.mockResolvedValue({ id: 'ch1', externalId: botInfoResponse.userId })
      lineClient.lineApiRequest.mockResolvedValue(botInfoResponse)
      db.shopChannel.update.mockResolvedValue({
        id: 'ch1', provider: 'LINE', externalId: botInfoResponse.userId,
        name: botInfoResponse.displayName, avatarUrl: botInfoResponse.pictureUrl,
        status: 'ACTIVE', basicId: botInfoResponse.basicId,
      })

      const result = await updateLineChannelCredentials({
        channelId: 'ch1', shopId: 'shop1', channelAccessToken: 'new-token',
      })

      const data = db.shopChannel.update.mock.calls[0]![0].data
      expect(data.status).toBe('ACTIVE')
      expect(decryptToken(data.accessTokenEnc)).toBe('new-token')
      expect(result.channel.status).toBe('ACTIVE')
    })

    it('ส่งแค่ channelSecret (ไม่มี token) → ไม่เรียก LINE API เลย แค่เข้ารหัสเก็บ', async () => {
      db.shopChannel.findFirst.mockResolvedValue({ id: 'ch1', externalId: botInfoResponse.userId })
      db.shopChannel.update.mockResolvedValue({
        id: 'ch1', provider: 'LINE', externalId: botInfoResponse.userId,
        name: 'x', avatarUrl: null, status: 'ACTIVE', basicId: null,
      })

      await updateLineChannelCredentials({
        channelId: 'ch1', shopId: 'shop1', channelSecret: 'fedcba9876543210fedcba9876543210',
      })

      expect(lineClient.lineApiRequest).not.toHaveBeenCalled()
      const data = db.shopChannel.update.mock.calls[0]![0].data
      expect(decryptToken(data.channelSecretEnc)).toBe('fedcba9876543210fedcba9876543210')
      expect(data.status).toBeUndefined() // ไม่แตะ status เมื่อไม่ได้ re-verify token
    })
  })
})

// ── ความทนของการเชื่อมต่อ (ส่วนขยาย 2026-08-12) ─────────────────────────────

describe('connectLineChannel — 1 ร้าน 1 LINE OA (D-CH-9 / AC-CH-26..28)', () => {
  const CONNECT = {
    shopId: 'shop-1',
    userId: 'user-1',
    channelSecret: 'a'.repeat(32),
    channelAccessToken: 'token',
    webhookUrl: 'https://deepthailand.app/api/channels/line/webhook',
  }

  beforeEach(() => {
    lineClient.lineApiRequest.mockResolvedValue(botInfoResponse)
  })

  it('[blocker] ร้านมี OA อื่นอยู่แล้ว → LINE_ALREADY_CONNECTED และห้ามเขียนแถวใหม่', async () => {
    // 🛑 กันที่ service ไม่ใช่แค่ซ่อนปุ่ม — ของเดิม "รองรับหลายใบครึ่งเดียว" (schema ให้ได้ แต่
    // โควตา/badge/rich menu สมมติว่ามีใบเดียว) ⇒ ใบที่สองจะทำให้ตัวเลขชี้ผิดใบโดยไม่มีอะไรฟ้อง
    // mutation: ลบบล็อก otherOa ออก → ข้อนี้แดง
    db.shopChannel.findFirst
      .mockResolvedValueOnce(null) // activeElsewhere (ร้านอื่นถือ OA นี้อยู่ไหม)
      .mockResolvedValueOnce({ name: 'BT สาขา สุขสวัสดิ์' }) // OA อื่นของร้านเราเอง
    await expect(connectLineChannel(CONNECT)).rejects.toMatchObject({
      code: 'LINE_ALREADY_CONNECTED',
      shopName: 'BT สาขา สุขสวัสดิ์',
    })
    expect(db.shopChannel.create).not.toHaveBeenCalled()
  })

  it('[blocker] เชื่อม OA ใบเดิมซ้ำ (externalId เดียวกัน) → ผ่าน ไม่ใช่ 409', async () => {
    // ด่านต้องกัน "เพิ่มใบใหม่" ไม่ใช่กัน "อัปเดต credential ของใบเดิม" ซึ่งเป็นเส้นทางกู้คืน
    // จาก TOKEN_INVALID ที่ร้านต้องใช้จริง — กันผิดข้อนี้ = ร้านที่ token ตายจะกู้ไม่ได้เลย
    db.shopChannel.findFirst.mockResolvedValue(null)
    db.shopChannel.findMany.mockResolvedValue([{ id: 'ch-1', _count: { contacts: 5 } }])
    db.shopChannel.update.mockResolvedValue({ id: 'ch-1', provider: 'LINE', status: 'ACTIVE', name: 'x' })
    await expect(connectLineChannel(CONNECT)).resolves.toBeTruthy()
  })
})

describe('connectLineChannel — warning สภาพการเชื่อมต่อ (FR-CH-01/03)', () => {
  const CONNECT = {
    shopId: 'shop-1',
    userId: 'user-1',
    channelSecret: 'a'.repeat(32),
    channelAccessToken: 'token',
    webhookUrl: 'https://deepthailand.app/api/channels/line/webhook',
  }

  beforeEach(() => {
    lineClient.lineApiRequest.mockResolvedValue(botInfoResponse)
    db.shopChannel.findMany.mockResolvedValue([{ id: 'ch-1', _count: { contacts: 0 } }])
    db.shopChannel.update.mockResolvedValue({ id: 'ch-1', provider: 'LINE', status: 'ACTIVE', name: 'x' })
  })

  it('[blocker] token 30 วัน → warning TOKEN_SHORT_LIVED และเก็บวันหมดอายุลงแถว', async () => {
    const expiresAt = new Date('2026-09-08T00:00:00.000Z')
    probe.probeLineToken.mockResolvedValue({ valid: true, expiresAt })
    const { warnings } = await connectLineChannel(CONNECT)
    expect(warnings).toContain('TOKEN_SHORT_LIVED')
    expect(db.shopChannel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lineTokenExpiresAt: expiresAt }) }),
    )
  })

  it('[blocker] token ไม่หมดอายุ (long-lived) → ไม่มี warning และเก็บ null', async () => {
    probe.probeLineToken.mockResolvedValue({ valid: true, expiresAt: null })
    const { warnings } = await connectLineChannel(CONNECT)
    expect(warnings).not.toContain('TOKEN_SHORT_LIVED')
  })

  it('[blocker] webhook ยังไม่ตั้ง / ปิดสวิตช์ / ชี้ที่อื่น → warning ตรงสาเหตุ ไม่ใช่ก้อนเดียว', async () => {
    probe.probeLineWebhook.mockResolvedValue({ endpoint: null, active: false, matchesUs: false })
    expect((await connectLineChannel(CONNECT)).warnings).toContain('WEBHOOK_NOT_SET')

    probe.probeLineWebhook.mockResolvedValue({ endpoint: 'https://x.example/h', active: true, matchesUs: false })
    expect((await connectLineChannel(CONNECT)).warnings).toContain('WEBHOOK_POINTS_ELSEWHERE')

    probe.probeLineWebhook.mockResolvedValue({
      endpoint: 'https://deepthailand.app/api/channels/line/webhook',
      active: false,
      matchesUs: true,
    })
    expect((await connectLineChannel(CONNECT)).warnings).toContain('WEBHOOK_INACTIVE')
  })

  it('[blocker] อ่านสภาพ webhook ไม่ได้ (null) → เงียบ ห้ามกล่าวหาว่าตั้งผิด', async () => {
    // 🛑 "อ่านไม่ได้" ≠ "ตั้งผิด" — ถ้าเน็ตเราสะดุดแล้วขึ้นเตือนว่าร้านตั้ง webhook ผิด
    // ร้านจะไปรื้อคอนโซล LINE ที่ไม่ได้พัง
    probe.probeLineWebhook.mockResolvedValue(null)
    const { warnings } = await connectLineChannel(CONNECT)
    expect(warnings.filter((w) => w.startsWith('WEBHOOK_'))).toHaveLength(0)
  })

  it('[blocker] ตรวจสภาพล้มทั้งก้อน → การเชื่อมต่อยังสำเร็จ (AC-CH-03)', async () => {
    // /v2/bot/info ผ่านแล้ว = token ใช้ได้จริง สองอย่างนี้เป็นข้อมูลเสริม
    // mutation: เอา try/catch ใน inspectLineConnection ออก → ข้อนี้แดง
    probe.probeLineToken.mockRejectedValue(new Error('boom'))
    await expect(connectLineChannel(CONNECT)).resolves.toBeTruthy()
  })
})
