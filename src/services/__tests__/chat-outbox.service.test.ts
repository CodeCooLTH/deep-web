// chat-outbox.service.test.ts — [blocker] วงจรชีวิตของแถวคิวส่งข้อความ
//
// 🛑 มีเทสหนึ่งข้อที่ **ห้าม mock ตัวยิงทิ้ง** (ข้อ "ตัวยิงถูกเรียกจริง") — บทเรียน 00038: เทสที่
// mock เพื่อนบ้านทิ้งทั้งตัวจะเขียวตลอดไม่ว่าเพื่อนบ้านทำอะไร รวมถึงกรณีที่ไม่เคยถูกเรียกเลย
//
// 🛑 `buildLineExternalMessageId` **ไม่ถูก mock** โดยตั้งใจ — เทส `[blocker]` ของ prefix `LINE:`
// ต้องวัดของจริง ไม่ใช่วัดความคิดของคนเขียนเทส (Ruling R-13)

import { describe, expect, it, vi, beforeEach } from 'vitest'

const transmitOutbound = vi.fn()
const resolveOutboundContext = vi.fn()
const mirrorRemoteImage = vi.fn()
vi.mock('@/services/channel-chat.service', () => ({
  transmitOutbound: (...a: unknown[]) => transmitOutbound(...a),
  resolveOutboundContext: (...a: unknown[]) => resolveOutboundContext(...a),
  mirrorRemoteImage: (...a: unknown[]) => mirrorRemoteImage(...a),
  // helper ที่เป็น "รูปแบบข้อมูล/ถ้อยคำ" ล้วน — สตับให้เหมือนของจริงพอที่จะยืนยัน shape ได้
  toRawMessage: (provider: string, payload: unknown, source: string) => ({ provider, source, payload }),
  stickerMirrorFailedText: (channel: string) => `[สติกเกอร์ — เปิดดูใน ${channel}]`,
  buildLineStickerImageUrl: (id: string) => `https://stickershop.example/${id}.png`,
  isUniqueViolationOn: (e: unknown, field: string) =>
    !!e && typeof e === 'object' && (e as { code?: string }).code === 'P2002' &&
    ((e as { meta?: { target?: string[] } }).meta?.target ?? []).includes(field),
}))

const pauseForHumanTakeover = vi.fn()
vi.mock('@/services/auto-reply-takeover.service', () => ({
  pauseForHumanTakeover: (...a: unknown[]) => pauseForHumanTakeover(...a),
}))

const updateMany = vi.fn()
const findMany = vi.fn()
const update = vi.fn()
const create = vi.fn()
const conversationUpdate = vi.fn()
const conversationFindMany = vi.fn()
vi.mock('@/lib/prisma', () => ({
  prisma: {
    chatMessage: {
      updateMany: (...a: unknown[]) => updateMany(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      update: (...a: unknown[]) => update(...a),
    },
    conversation: {
      findMany: (...a: unknown[]) => conversationFindMany(...a),
    },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      await fn({
        chatMessage: { create: (...a: unknown[]) => create(...a) },
        conversation: { update: (...a: unknown[]) => conversationUpdate(...a) },
      }),
  },
}))

const { deliverRoom, enqueueOutbound, sweepOutbox } = await import('../chat-outbox.service')

beforeEach(() => {
  transmitOutbound.mockReset()
  resolveOutboundContext.mockReset()
  mirrorRemoteImage.mockReset()
  pauseForHumanTakeover.mockReset()
  updateMany.mockReset()
  findMany.mockReset()
  update.mockReset()
  create.mockReset()
  conversationUpdate.mockReset()
  conversationFindMany.mockReset()
  resolveOutboundContext.mockResolvedValue({ id: 'c1', channel: 'MESSENGER', shopId: 's1' })
  create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: 'new1',
    createdAt: new Date('2026-08-23T10:00:00Z'),
    ...args.data,
  }))
  update.mockResolvedValue({})
  pauseForHumanTakeover.mockResolvedValue(undefined)
})

const queued = (o: Record<string, unknown> = {}) => ({
  id: 'm1',
  conversationId: 'c1',
  createdAt: new Date('2026-08-23T10:00:00Z'),
  deliveryStatus: 'QUEUED',
  sendLockedAt: null,
  sendPayload: {},
  body: 'สวัสดีครับ',
  ...o,
})

const OK = {
  externalMessageId: 'mid_1',
  outboundResponse: {},
  failureReason: null,
  sendMethod: null,
  sendBatchId: null,
}

describe('deliverRoom', () => {
  it('[blocker] claim ด้วยเงื่อนไข sendLockedAt: null เสมอ — นี่คือสิ่งเดียวที่กันข้อความซ้ำ', async () => {
    findMany.mockResolvedValue([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue(OK)

    await deliverRoom('c1', 'after')

    const claimArgs = updateMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }
    expect(claimArgs.where).toMatchObject({ id: 'm1', sendLockedAt: null })
  })

  it('[blocker] claim ไม่ติด (คนอื่นชิงไปแล้ว) → ต้องไม่ยิงเลย', async () => {
    findMany.mockResolvedValue([queued()])
    updateMany.mockResolvedValue({ count: 0 })

    await deliverRoom('c1', 'cron')

    expect(transmitOutbound).not.toHaveBeenCalled()
  })

  it('[blocker] ยิงสำเร็จ → เขียน SENT + mid และ **ไม่เคลียร์ sendLockedBy** (ตัววัด §9)', async () => {
    findMany.mockResolvedValue([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue({ ...OK, outboundResponse: { ok: true } })

    await deliverRoom('c1', 'cron')

    const data = (update.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({ deliveryStatus: 'SENT', externalMessageId: 'mid_1' })
    // R-6: ต้องเป็น "ไม่มีคีย์นี้ในคำสั่งเขียน" — `not.toHaveProperty(k, null)` ผ่านได้ทั้งตอนคีย์หาย
    // และตอนค่าต่าง = ไม่ได้ล็อกอะไรเลย
    expect(data.sendLockedBy).toBeUndefined()
  })

  it('[blocker] ปลายทางปฏิเสธ → FAILED + failureReason ดิบ และห้ามยิงซ้ำในรอบเดียวกัน', async () => {
    findMany.mockResolvedValue([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue({
      ...OK,
      externalMessageId: null,
      failureReason: '(#10) outside of allowed window',
    })

    await deliverRoom('c1', 'after')

    expect(transmitOutbound).toHaveBeenCalledTimes(1)
    const data = (update.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({ deliveryStatus: 'FAILED', failureReason: '(#10) outside of allowed window' })
  })

  it('[blocker] หัวคิวถูก claim ค้างอยู่ → ห้ามข้ามไปยิงใบถัดไป', async () => {
    findMany.mockResolvedValue([
      queued({ id: 'head', sendLockedAt: new Date('2026-08-23T10:00:01Z') }),
      queued({ id: 'next', createdAt: new Date('2026-08-23T10:00:05Z') }),
    ])

    await deliverRoom('c1', 'cron')

    expect(transmitOutbound).not.toHaveBeenCalled()
  })

  it('[blocker] ตัวยิงถูกเรียกจริง ด้วย conversation ที่ resolve มา — ไม่ใช่แค่ไม่พัง', async () => {
    // ข้อนี้จงใจตรวจ "ถูกเรียกจริงไหม" ไม่ใช่ "ผลลัพธ์ถูกไหม" — เทสที่ mock ตัวยิงทิ้งแล้วดูแต่
    // ผลลัพธ์จะเขียวเท่ากันทั้งกรณีที่เรียกและกรณีที่ลืมเรียก (บทเรียน 00038)
    findMany.mockResolvedValue([queued({ sendPayload: { text: 'ทัก', actorUserId: 'u1' } })])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue(OK)

    await deliverRoom('c1', 'after')

    expect(transmitOutbound).toHaveBeenCalledTimes(1)
    expect(transmitOutbound.mock.calls[0][0]).toMatchObject({ id: 'c1' })
    // เจตนาการส่งต้องเดินทางมาจาก sendPayload ครบ ไม่ใช่ประกอบใหม่จากคอลัมน์
    expect(transmitOutbound.mock.calls[0][1]).toMatchObject({
      conversationId: 'c1',
      actorUserId: 'u1',
      text: 'ทัก',
    })
  })

  it('[blocker] LINE: mid ที่เขียนลง DB ต้องผ่าน buildLineExternalMessageId (prefix "LINE:") — R-13', async () => {
    // ถ้าเขียน mid ดิบลงไป จะไม่ชนกับ echo ที่มี prefix ⇒ ข้อความเดียวขึ้นสองบับเบิล และ quote
    // หาต้นทางไม่เจอ — ไม่มี error ให้ใครเห็นเลยสักบรรทัด
    resolveOutboundContext.mockResolvedValue({ id: 'c1', channel: 'LINE', shopId: 's1' })
    findMany.mockResolvedValue([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue({ ...OK, externalMessageId: '468789577898262530', sendMethod: 'REPLY' })

    await deliverRoom('c1', 'after')

    const data = (update.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data.externalMessageId).toBe('LINE:468789577898262530')
    expect(data).toMatchObject({ sendMethod: 'REPLY' })
  })

  it('[blocker] MESSENGER: ห้ามเติม prefix ให้ mid ของ Meta', async () => {
    findMany.mockResolvedValue([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue({ ...OK, externalMessageId: 'm_abc' })

    await deliverRoom('c1', 'after')

    const data = (update.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data.externalMessageId).toBe('m_abc')
  })

  it('[blocker] sendPayload อ่านไม่ออก (deploy คนละ shape) → ปิดแถวเป็น FAILED ห้าม throw ทั้ง worker (E-7)', async () => {
    findMany.mockResolvedValue([queued({ sendPayload: 'ข้อความเก่าที่ไม่ใช่อ็อบเจกต์' })])
    updateMany.mockResolvedValue({ count: 1 })

    await expect(deliverRoom('c1', 'cron')).resolves.toBe(1)

    expect(transmitOutbound).not.toHaveBeenCalled()
    const data = (update.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data.deliveryStatus).toBe('FAILED')
    expect(typeof data.failureReason).toBe('string')
  })

  it('ด่าน ownership ล้มหลัง claim (เพจถูกถอด/สิทธิ์หาย) → FAILED ไม่ปล่อยแถวค้าง', async () => {
    findMany.mockResolvedValue([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    resolveOutboundContext.mockRejectedValue(new Error('CONVERSATION_NOT_FOUND'))

    await expect(deliverRoom('c1', 'cron')).resolves.toBe(1)

    const data = (update.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({ deliveryStatus: 'FAILED', failureReason: 'CONVERSATION_NOT_FOUND' })
  })

  it('echo ของ Meta ชิงเขียน mid ไปก่อน (P2002) → ยังต้องเป็น SENT ไม่ใช่ค้างคิว (E-17)', async () => {
    findMany.mockResolvedValue([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue(OK)
    const dup = Object.assign(new Error('dup'), { code: 'P2002', meta: { target: ['externalMessageId'] } })
    update.mockRejectedValueOnce(dup).mockResolvedValue({})

    await expect(deliverRoom('c1', 'after')).resolves.toBe(1)

    const second = (update.mock.calls[1]?.[0] as { data: Record<string, unknown> }).data
    expect(second.deliveryStatus).toBe('SENT')
    expect(second.externalMessageId).toBeUndefined()
  })

  it('ห้องว่าง (ไม่มีแถว QUEUED) → คืน 0 และไม่แตะอะไรเลย', async () => {
    findMany.mockResolvedValue([])

    await expect(deliverRoom('c1', 'cron')).resolves.toBe(0)
    expect(updateMany).not.toHaveBeenCalled()
    expect(transmitOutbound).not.toHaveBeenCalled()
  })

  it('ส่งสำเร็จโดยคน → บอทต้องหลบ (D-7 pauseForHumanTakeover ทำที่ "สำเร็จ" ไม่ใช่ตอนเข้าคิว)', async () => {
    findMany.mockResolvedValue([queued({ sendPayload: { actorUserId: 'u1' } })])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue(OK)

    await deliverRoom('c1', 'after')

    expect(pauseForHumanTakeover).toHaveBeenCalledTimes(1)
  })

  it('บอทเป็นผู้ส่ง (autoReplyKind) → ห้ามสั่งบอทหลบตัวเอง', async () => {
    findMany.mockResolvedValue([queued({ sendPayload: { actorUserId: null, autoReplyKind: 'AUTO' } })])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue(OK)

    await deliverRoom('c1', 'cron')

    expect(pauseForHumanTakeover).not.toHaveBeenCalled()
  })
})

describe('enqueueOutbound', () => {
  it('[blocker] แถวที่เขียนต้องเป็น QUEUED + ยังไม่มี mid + พก sendPayload ไปให้ตัวยิง', async () => {
    await enqueueOutbound({ conversationId: 'c1', actorUserId: 'u1', text: 'สวัสดี' })

    const data = (create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({
      conversationId: 'c1',
      senderRole: 'SHOP',
      senderUserId: 'u1',
      type: 'TEXT',
      body: 'สวัสดี',
      deliveryStatus: 'QUEUED',
      externalMessageId: null,
    })
    expect(data.sendPayload).toMatchObject({ conversationId: 'c1', actorUserId: 'u1', text: 'สวัสดี' })
    expect(transmitOutbound).not.toHaveBeenCalled()
  })

  it('[blocker] create + snapshot ต้องอยู่ทรานแซกชันเดียวกัน (M-2, schema.prisma:933)', async () => {
    await enqueueOutbound({ conversationId: 'c1', actorUserId: 'u1', text: 'สวัสดี' })

    // ทั้งคู่ถูกเรียกผ่าน tx ที่ $transaction ส่งให้ — ถ้าใครย้ายออกไปเขียนนอกทรานแซกชัน
    // จะไปเรียก prisma.chatMessage.* / prisma.conversation.* ตัวนอกแทน แล้ว mock คู่นี้จะไม่ถูกเรียก
    expect(create).toHaveBeenCalledTimes(1)
    expect(conversationUpdate).toHaveBeenCalledTimes(1)
    const snap = conversationUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(snap.data).toMatchObject({ lastMessagePreview: 'สวัสดี', lastSenderRole: 'SHOP' })
  })

  it('การ์ดออเดอร์: body=null + type=ORDER แต่ข้อความลิงก์ยังอยู่ใน sendPayload (ไม่งั้นลูกค้าไม่ได้อะไร)', async () => {
    await enqueueOutbound({
      conversationId: 'c1',
      actorUserId: 'u1',
      text: 'ดูคำสั่งซื้อ https://deepthailand.app/o/tok',
      orderRefToken: 'tok',
    })

    const data = (create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({ type: 'ORDER', body: null, orderRefToken: 'tok' })
    expect((data.sendPayload as Record<string, unknown>).text).toBe('ดูคำสั่งซื้อ https://deepthailand.app/o/tok')
  })

  it('การ์ดสรุปนัดเก็บ body จริง ต่างจากการ์ดออเดอร์ (2026-08-12)', async () => {
    await enqueueOutbound({
      conversationId: 'c1',
      actorUserId: 'u1',
      text: 'สรุปนัด 10:00',
      orderRefToken: 'tok',
      isAppointmentCard: true,
    })

    const data = (create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({ type: 'ORDER', body: 'สรุปนัด 10:00' })
    const snap = conversationUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(snap.data.lastMessagePreview).toBe('[สรุปนัด]')
  })

  it('สติกเกอร์ที่ mirror ไม่ผ่าน ต้องมีคำแทนเสมอ (ห้ามได้บับเบิลว่าง)', async () => {
    mirrorRemoteImage.mockResolvedValue(null)

    await enqueueOutbound({
      conversationId: 'c1',
      actorUserId: 'u1',
      sticker: { id: '369239263222822', imageUrl: 'https://scontent.example/s.png' },
    })

    const data = (create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data.type).toBe('IMAGE')
    expect(data.imageUrl).toBeNull()
    expect(typeof data.body).toBe('string')
    expect(data.body).not.toBe('')
  })

  it('ด่าน ownership ยังอยู่ที่เดิม — resolveOutboundContext โยน = ไม่เขียนแถวเลย', async () => {
    resolveOutboundContext.mockRejectedValue(new Error('FORBIDDEN'))

    await expect(enqueueOutbound({ conversationId: 'c1', actorUserId: 'u1', text: 'x' })).rejects.toThrow('FORBIDDEN')
    expect(create).not.toHaveBeenCalled()
  })
})

describe('sweepOutbox', () => {
  const room = (conversationId: string) => ({ conversationId })

  it('[blocker] แถวที่ claim ค้างเกินเพดาน → ปิดเป็น FAILED พร้อมเหตุผลที่พูดความจริงว่าไม่รู้ผล (E-1)', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000)
    findMany
      // รอบแรก: แถวที่ถูก claim ค้าง
      .mockResolvedValueOnce([queued({ id: 'stuck', sendLockedAt: old })])
      // รอบสอง: ห้องที่ยังมีแถวหยิบได้ (ไม่มี)
      .mockResolvedValueOnce([])
    updateMany.mockResolvedValue({ count: 1 })

    const res = await sweepOutbox({ owner: 'cron' })

    expect(res.stale).toBe(1)
    const args = updateMany.mock.calls[0]?.[0] as { where: Record<string, unknown>; data: Record<string, unknown> }
    expect(args.where).toMatchObject({ id: { in: ['stuck'] }, deliveryStatus: 'QUEUED' })
    expect(args.data.deliveryStatus).toBe('FAILED')
    expect(args.data.failureReason).toContain('ไม่แน่ใจว่าส่งออกไปหรือยัง')
  })

  it('[blocker] แถวที่เพิ่ง claim (ยังไม่เกินเพดาน) ห้ามถูกปิดทิ้ง', async () => {
    findMany.mockResolvedValueOnce([queued({ id: 'fresh', sendLockedAt: new Date() })]).mockResolvedValueOnce([])

    const res = await sweepOutbox({ owner: 'cron' })

    expect(res.stale).toBe(0)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('[blocker] ห้องของเพจเดียวกันต้องยิงทีละห้อง — ห้ามยิงพร้อมกัน (E-8 rate limit ของ Meta)', async () => {
    findMany.mockImplementation(async (args: { where?: Record<string, unknown>; distinct?: unknown }) => {
      const where = (args?.where ?? {}) as Record<string, unknown>
      // รอบหยิบหัวคิวของห้องหนึ่ง
      if (where.conversationId) return [queued({ id: `h-${String(where.conversationId)}` })]
      // รอบหาห้องที่ยังมีแถวหยิบได้
      if (args?.distinct) return [room('A'), room('B')]
      // รอบสแกน claim ค้าง
      return []
    })
    conversationFindMany.mockResolvedValue([
      { id: 'A', shopChannelId: 'page1' },
      { id: 'B', shopChannelId: 'page1' },
    ])
    updateMany.mockResolvedValue({ count: 1 })

    const events: string[] = []
    transmitOutbound.mockImplementation(async (c: { id: string }) => {
      events.push(`start:${c.id}`)
      await new Promise((r) => setTimeout(r, 5))
      events.push(`end:${c.id}`)
      return OK
    })
    resolveOutboundContext.mockImplementation(async (p: { conversationId: string }) => ({
      id: p.conversationId,
      channel: 'MESSENGER',
      shopId: 's1',
    }))

    await sweepOutbox({ owner: 'cron' })

    // ห้องเดียวกันเพจเดียวกัน = ต้องไม่ซ้อนกัน (start A → end A → start B → end B)
    expect(events).toEqual(['start:A', 'end:A', 'start:B', 'end:B'])
  })
})
