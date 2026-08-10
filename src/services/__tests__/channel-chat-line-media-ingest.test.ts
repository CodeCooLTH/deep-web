import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Prisma } from '@prisma/client'

// (S-7) mock prisma แบบเดียวกับ channel-chat-line-ingest.test.ts (ของ S-6/text) — vi.hoisted กัน TDZ
const db = vi.hoisted(() => ({
  externalContact: { upsert: vi.fn(), findUnique: vi.fn() },
  conversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  chatMessage: { create: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

// mock ทั้ง fetchContactProfile (เหมือน S-6) และ downloadContent (ใหม่ของ S-7) — sendMessages ไม่ถูก
// ใช้ในเส้นทาง ingest เลย ใส่ vi.fn() เผื่อ import อื่นในไฟล์เดียวกันอ้างถึง
const lineAdapter = vi.hoisted(() => ({
  fetchContactProfile: vi.fn().mockResolvedValue({ name: 'คุณลูกค้า', avatarUrl: 'https://profile.line-scdn.net/x' }),
  downloadContent: vi.fn(),
}))
vi.mock('@/lib/channels/line-adapter', () => ({
  LineAdapter: {
    capabilities: { echo: false, readReceipt: false, freeWindowMs: 60_000, maxPartsPerRequest: 5 },
    fetchContactProfile: lineAdapter.fetchContactProfile,
    sendMessages: vi.fn(),
    downloadContent: lineAdapter.downloadContent,
  },
  buildLineExternalMessageId: (id: string) => `LINE:${id}`,
}))

// mirror ไปลง storage จริง — mock เฉพาะ saveFile (เหมือน channel-chat-image.test.ts) ให้
// mirrorMediaBuffer (ที่ ingestLineMediaMessage เรียกจริง ไม่ mock) วิ่งจนถึงจุดนี้แล้วค่อยหยุด
const { saveFile } = vi.hoisted(() => ({ saveFile: vi.fn() }))
vi.mock('@/lib/storage', () => ({ saveFile }))

import { ingestLineMediaMessage } from '@/services/channel-chat.service'

function p2002(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('unique constraint violation', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  })
}

// (S-7b) สติกเกอร์ mirror ผ่าน mirrorRemoteImage ซึ่งยิง fetch จริง (ต่างจาก image/video/audio/file
// ที่ผ่าน LineAdapter.downloadContent) — ต้อง stub global fetch เหมือน channel-chat-image.test.ts
// ไม่งั้นเทสที่ไม่ได้ mock fetch เอง (เช่น dedupe/replyToken) จะยิง network จริงออกไปที่ line-scdn.net
// ทำไมใช้ new Response(...) จริงแทน object ปลอม: mirrorRemoteImage อ่าน body ผ่าน
// res.body.getReader() (streaming) — ต้องมี body เป็น ReadableStream จริง
function fakeStickerResponse(body: Uint8Array | null, init: { status?: number; contentType?: string } = {}) {
  const headers: Record<string, string> = {}
  if (init.contentType) headers['content-type'] = init.contentType
  return new Response(body as BodyInit | null, { status: init.status ?? 200, headers })
}

const baseParams = {
  shopId: 'shop1',
  shopChannelId: 'ch1',
  accessToken: 'tok',
  externalUserId: 'U1',
  replyToken: 'reply-token-1',
  eventTimestamp: 1785000000000,
}

describe('ingestLineMediaMessage (S-7, TFR-LINE-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // ไม่ mockResolvedValue ไว้ default — เทสที่ไม่ได้ตั้งค่าเอง (dedupe/replyToken) เรียก fetch()
    // แล้วได้ undefined กลับมา mirrorRemoteImage อ่าน .ok ไม่ได้ → catch → คืน null (mirror ล้ม)
    // นี่คือพฤติกรรมที่ตั้งใจ ไม่ใช่ query จริงออกไปที่ line-scdn.net
    vi.stubGlobal('fetch', vi.fn())
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) => fn(db))
    db.externalContact.findUnique.mockResolvedValue(null)
    db.externalContact.upsert.mockResolvedValue({ id: 'ec1', name: 'คุณลูกค้า' })
    db.conversation.findUnique.mockResolvedValue(null)
    db.conversation.create.mockResolvedValue({ id: 'conv1' })
    db.conversation.update.mockResolvedValue({})
    db.chatMessage.create.mockResolvedValue({ id: 'm1' })
    lineAdapter.fetchContactProfile.mockResolvedValue({
      name: 'คุณลูกค้า',
      avatarUrl: 'https://profile.line-scdn.net/x',
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  describe('image/video/audio/file — mirror สำเร็จ (TC-08)', () => {
    it('image: ดาวน์โหลดสำเร็จ → mirror เข้า storage → ChatMessage type=IMAGE, imageUrl=fileId, body=null', async () => {
      lineAdapter.downloadContent.mockResolvedValue({
        url: null,
        content: { data: Buffer.from([1, 2, 3]), contentType: 'image/jpeg' },
      })
      saveFile.mockResolvedValue('line/2026/08/10/abc.jpg')

      const r = await ingestLineMediaMessage({
        ...baseParams,
        message: { type: 'image', id: 'msg-img-1' },
      })

      expect(r.status).toBe('STORED')
      const data = db.chatMessage.create.mock.calls[0]![0].data
      expect(data.type).toBe('IMAGE')
      expect(data.imageUrl).toBe('line/2026/08/10/abc.jpg')
      expect(data.body).toBeNull()
      expect(data.externalMessageId).toBe('LINE:msg-img-1')
      expect(data.senderRole).toBe('BUYER')
      expect(data.deliveryStatus).toBe('SENT')

      // downloadContent ต้องยิงด้วย externalMessageId = lineMessageId (ไม่มี URL สาธารณะให้ LINE ใช้)
      expect(lineAdapter.downloadContent).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'LINE', accessToken: 'tok' }),
        { externalMessageId: 'msg-img-1' },
      )
    })

    it('video: mirror สำเร็จ → type=VIDEO', async () => {
      lineAdapter.downloadContent.mockResolvedValue({
        url: null,
        content: { data: Buffer.from([1, 2, 3, 4]), contentType: 'video/mp4' },
      })
      saveFile.mockResolvedValue('line/x.mp4')
      const r = await ingestLineMediaMessage({ ...baseParams, message: { type: 'video', id: 'msg-vid-1' } })
      expect(r.status).toBe('STORED')
      expect(db.chatMessage.create.mock.calls[0]![0].data.type).toBe('VIDEO')
    })

    it('audio: mirror สำเร็จ → type=AUDIO', async () => {
      lineAdapter.downloadContent.mockResolvedValue({
        url: null,
        content: { data: Buffer.from([1, 2]), contentType: 'audio/mp4' },
      })
      saveFile.mockResolvedValue('line/x.m4a')
      const r = await ingestLineMediaMessage({ ...baseParams, message: { type: 'audio', id: 'msg-audio-1' } })
      expect(r.status).toBe('STORED')
      expect(db.chatMessage.create.mock.calls[0]![0].data.type).toBe('AUDIO')
    })

    it('file: mirror สำเร็จ → type=FILE, attachmentName/attachmentSize มาจาก LINE (ไม่ใช่ขนาด buffer)', async () => {
      lineAdapter.downloadContent.mockResolvedValue({
        url: null,
        content: { data: Buffer.from([1, 2, 3, 4, 5]), contentType: 'application/pdf' },
      })
      saveFile.mockResolvedValue('line/doc.pdf')
      const r = await ingestLineMediaMessage({
        ...baseParams,
        message: { type: 'file', id: 'msg-file-1', fileName: 'ใบเสร็จ.pdf', fileSize: 99999 },
      })
      expect(r.status).toBe('STORED')
      const data = db.chatMessage.create.mock.calls[0]![0].data
      expect(data.type).toBe('FILE')
      expect(data.attachmentName).toBe('ใบเสร็จ.pdf')
      expect(data.attachmentSize).toBe(99999)
    })

    it('file: fileSize ไม่มีมาจาก LINE → fallback เป็นขนาด buffer ที่ดาวน์โหลดมาจริง', async () => {
      lineAdapter.downloadContent.mockResolvedValue({
        url: null,
        content: { data: Buffer.from([1, 2, 3]), contentType: 'application/pdf' },
      })
      saveFile.mockResolvedValue('line/doc.pdf')
      const r = await ingestLineMediaMessage({
        ...baseParams,
        message: { type: 'file', id: 'msg-file-2', fileName: null, fileSize: null },
      })
      expect(r.status).toBe('STORED')
      expect(db.chatMessage.create.mock.calls[0]![0].data.attachmentSize).toBe(3)
    })
  })

  describe('mirror ล้มเหลว → placeholder ห้ามหายเงียบ (TC-09 [ห้ามข้าม])', () => {
    it('downloadContent คืน content:null (LINE Data API ตอบไม่ ok) → ยังเกิด ChatMessage type=TEXT พร้อม placeholder + log error', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      lineAdapter.downloadContent.mockResolvedValue({ url: null, content: null })

      const r = await ingestLineMediaMessage({ ...baseParams, message: { type: 'image', id: 'msg-fail-1' } })

      expect(r.status).toBe('STORED') // ข้อความยังถูกบันทึก ไม่ใช่ event ที่หายไป
      const data = db.chatMessage.create.mock.calls[0]![0].data
      expect(data.type).toBe('TEXT')
      expect(data.imageUrl).toBeNull()
      expect(data.body).toBe('ลูกค้าส่งรูปมา แต่ระบบดึงไฟล์ไม่สำเร็จ')
      expect(saveFile).not.toHaveBeenCalled()
      expect(errSpy).toHaveBeenCalled() // ต้อง log error เสมอ ห้ามหายเงียบ
      errSpy.mockRestore()
    })

    it('downloadContent throw (network/timeout) → ไม่ throw ทะลุออกไป ยังบันทึก placeholder', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      lineAdapter.downloadContent.mockRejectedValue(new Error('timeout'))

      const r = await ingestLineMediaMessage({ ...baseParams, message: { type: 'video', id: 'msg-fail-2' } })

      expect(r.status).toBe('STORED')
      expect(db.chatMessage.create.mock.calls[0]![0].data.body).toBe('ลูกค้าส่งวิดีโอมา แต่ระบบดึงไฟล์ไม่สำเร็จ')
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })

    it('ดาวน์โหลดสำเร็จแต่ saveFile (เขียน storage) ล้ม → placeholder เฉพาะชนิด audio', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      lineAdapter.downloadContent.mockResolvedValue({
        url: null,
        content: { data: Buffer.from([1, 2, 3]), contentType: 'audio/mp4' },
      })
      saveFile.mockRejectedValue(new Error('storage down'))

      const r = await ingestLineMediaMessage({ ...baseParams, message: { type: 'audio', id: 'msg-fail-3' } })

      expect(r.status).toBe('STORED')
      const data = db.chatMessage.create.mock.calls[0]![0].data
      expect(data.type).toBe('TEXT')
      expect(data.body).toBe('ลูกค้าส่งข้อความเสียงมา แต่ระบบดึงไฟล์ไม่สำเร็จ')
    })

    it('ไฟล์ใหญ่เกินเพดาน (25MB) → mirrorMediaBuffer ปฏิเสธ → placeholder ชนิด file', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      lineAdapter.downloadContent.mockResolvedValue({
        url: null,
        content: { data: Buffer.alloc(26 * 1024 * 1024), contentType: 'application/zip' },
      })

      const r = await ingestLineMediaMessage({
        ...baseParams,
        message: { type: 'file', id: 'msg-fail-big', fileName: 'big.zip', fileSize: 26 * 1024 * 1024 },
      })

      expect(r.status).toBe('STORED')
      expect(db.chatMessage.create.mock.calls[0]![0].data.body).toBe('ลูกค้าส่งไฟล์มา แต่ระบบดึงไฟล์ไม่สำเร็จ')
      expect(saveFile).not.toHaveBeenCalled()
    })
  })

  describe('sticker — mirror รูปจริงจาก LINE sticker CDN (S-7b, user เปลี่ยน scope 2026-08-10)', () => {
    it('mirror สำเร็จ → ไม่เรียก downloadContent (URL ประกอบจาก stickerId ล้วน ๆ ไม่ต้องใช้ token) ChatMessage type=IMAGE, imageUrl=fileId, body=null, metadata อยู่ใน rawMessage', async () => {
      ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        fakeStickerResponse(new Uint8Array(16), { contentType: 'image/png' }),
      )
      saveFile.mockResolvedValue('line-sticker/1988.png')

      const r = await ingestLineMediaMessage({
        ...baseParams,
        message: { type: 'sticker', id: 'msg-sticker-1', packageId: '446', stickerId: '1988', stickerResourceType: 'STATIC' },
      })

      expect(r.status).toBe('STORED')
      expect(lineAdapter.downloadContent).not.toHaveBeenCalled()
      // ยิง fetch ไปที่ URL ที่ประกอบจาก stickerId ตรง ๆ (de-facto CDN)
      expect(fetch).toHaveBeenCalledWith(
        'https://stickershop.line-scdn.net/stickershop/v1/sticker/1988/android/sticker.png',
        expect.anything(),
      )
      const data = db.chatMessage.create.mock.calls[0]![0].data
      expect(data.type).toBe('IMAGE')
      expect(data.body).toBeNull()
      expect(data.imageUrl).toBe('line-sticker/1988.png')
      const raw = data.rawMessage as {
        payload: { packageId: string; stickerId: string; stickerResourceType: string | null; mirrored: boolean }
      }
      expect(raw.payload.packageId).toBe('446')
      expect(raw.payload.stickerId).toBe('1988')
      expect(raw.payload.stickerResourceType).toBe('STATIC')
      expect(raw.payload.mirrored).toBe(true)
    })

    it('mirror ล้ม (CDN ตอบ 404/timeout) → ถอยเป็นข้อความอ่านออกเหมือนเดิม ไม่ได้บับเบิลรูปพัง + log error', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeStickerResponse(null, { status: 404 }))

      const r = await ingestLineMediaMessage({
        ...baseParams,
        message: { type: 'sticker', id: 'msg-sticker-2', packageId: '446', stickerId: 'not-exist', stickerResourceType: null },
      })

      expect(r.status).toBe('STORED')
      const data = db.chatMessage.create.mock.calls[0]![0].data
      expect(data.type).toBe('TEXT')
      expect(data.body).toBe('[สติกเกอร์ LINE]')
      expect(data.imageUrl).toBeNull()
      const raw = data.rawMessage as { payload: { mirrored: boolean } }
      expect(raw.payload.mirrored).toBe(false)
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })

    it('stickerResourceType เป็นค่าที่ไม่รู้จัก (LINE เพิ่มค่าใหม่โดยไม่ประกาศ) → ยัง mirror ตามปกติ ไม่ throw ไม่ skip', async () => {
      ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        fakeStickerResponse(new Uint8Array(8), { contentType: 'image/png' }),
      )
      saveFile.mockResolvedValue('line-sticker/x.png')

      const r = await ingestLineMediaMessage({
        ...baseParams,
        message: {
          type: 'sticker',
          id: 'msg-sticker-3',
          packageId: '446',
          stickerId: '9999',
          stickerResourceType: 'SOME_FUTURE_TYPE_NOT_IN_DOCS',
        },
      })

      expect(r.status).toBe('STORED')
      const data = db.chatMessage.create.mock.calls[0]![0].data
      expect(data.type).toBe('IMAGE')
      expect(data.imageUrl).toBe('line-sticker/x.png')
      const raw = data.rawMessage as { payload: { stickerResourceType: string | null } }
      expect(raw.payload.stickerResourceType).toBe('SOME_FUTURE_TYPE_NOT_IN_DOCS')
    })
  })

  describe('location — ไม่มี asset ให้ mirror เก็บเป็นข้อความอ่านออก (TC-25)', () => {
    it('location: ประกอบ title/address/พิกัด เป็นข้อความอ่านออก ไม่มีช่องว่าง', async () => {
      const r = await ingestLineMediaMessage({
        ...baseParams,
        message: {
          type: 'location',
          id: 'msg-loc-1',
          title: 'ร้านกาแฟ',
          address: '123 ถ.สุขุมวิท',
          latitude: 13.7563,
          longitude: 100.5018,
        },
      })

      expect(r.status).toBe('STORED')
      const data = db.chatMessage.create.mock.calls[0]![0].data
      expect(data.type).toBe('TEXT')
      expect(data.body).toBe('ร้านกาแฟ\n123 ถ.สุขุมวิท\n(13.7563, 100.5018)')
    })

    it('location: title/address เป็น null (LINE ไม่ได้บังคับส่งมาเสมอ) → ยังไม่ตกเป็นช่องว่าง มีแค่พิกัด', async () => {
      const r = await ingestLineMediaMessage({
        ...baseParams,
        message: { type: 'location', id: 'msg-loc-2', title: null, address: null, latitude: 1, longitude: 2 },
      })
      expect(r.status).toBe('STORED')
      expect(db.chatMessage.create.mock.calls[0]![0].data.body).toBe('(1, 2)')
    })
  })

  describe('redelivery (dedupe) — ไม่เกิดแถวซ้ำ', () => {
    it('P2002 บน externalMessageId → DUPLICATE ไม่ throw', async () => {
      lineAdapter.downloadContent.mockResolvedValue({
        url: null,
        content: { data: Buffer.from([1]), contentType: 'image/jpeg' },
      })
      saveFile.mockResolvedValue('line/x.jpg')
      db.chatMessage.create.mockRejectedValue(p2002(['externalMessageId']))

      const r = await ingestLineMediaMessage({ ...baseParams, message: { type: 'image', id: 'msg-dup-1' } })
      expect(r.status).toBe('DUPLICATE')
    })

    it('redelivery ของ sticker (fetch ไม่ถูก mock ค่าไว้ → mirror ล้ม ไปทาง TEXT) ก็ยัง dedupe ได้เหมือนกัน', async () => {
      db.chatMessage.create.mockRejectedValue(p2002(['externalMessageId']))
      const r = await ingestLineMediaMessage({
        ...baseParams,
        message: { type: 'sticker', id: 'msg-dup-sticker', packageId: '1', stickerId: '2', stickerResourceType: null },
      })
      expect(r.status).toBe('DUPLICATE')
    })

    it('ลูกค้าใหม่ส่งสื่อ 2 อันรัว ๆ → race สร้างเธรด (P2002 บน externalContactId) ยัง STORED', async () => {
      lineAdapter.downloadContent.mockResolvedValue({
        url: null,
        content: { data: Buffer.from([1]), contentType: 'image/jpeg' },
      })
      saveFile.mockResolvedValue('line/x.jpg')
      db.conversation.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'conv-winner' })
      db.conversation.create.mockRejectedValue(p2002(['shopChannelId', 'externalContactId']))

      const r = await ingestLineMediaMessage({ ...baseParams, message: { type: 'image', id: 'msg-race-1' } })
      expect(r.status).toBe('STORED')
      expect(r.conversationId).toBe('conv-winner')
    })
  })

  it('มี replyToken → เก็บ replyToken/replyTokenExpiresAt บน Conversation เหมือน text (TD-009)', async () => {
    const r = await ingestLineMediaMessage({
      ...baseParams,
      message: { type: 'sticker', id: 'msg-rt-1', packageId: '1', stickerId: '2', stickerResourceType: null },
    })
    expect(r.status).toBe('STORED')
    const updateData = db.conversation.update.mock.calls[0]![0].data
    expect(updateData.replyToken).toBe('reply-token-1')
    expect(updateData.replyTokenExpiresAt).toBeInstanceOf(Date)
  })
})
