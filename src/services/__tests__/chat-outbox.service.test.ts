// chat-outbox.service.test.ts — [blocker] วงจรชีวิตของแถวคิวส่งข้อความ
//
// 🛑 มีเทสหนึ่งข้อที่ **ห้าม mock ตัวยิงทิ้ง** (ข้อ "ตัวยิงถูกเรียกจริง") — บทเรียน 00038: เทสที่
// mock เพื่อนบ้านทิ้งทั้งตัวจะเขียวตลอดไม่ว่าเพื่อนบ้านทำอะไร รวมถึงกรณีที่ไม่เคยถูกเรียกเลย
//
// 🛑 `buildLineExternalMessageId` **ไม่ถูก mock** โดยตั้งใจ — เทส `[blocker]` ของ prefix `LINE:`
// ต้องวัดของจริง ไม่ใช่วัดความคิดของคนเขียนเทส (Ruling R-13)

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { UNCERTAIN_SEND_REASON } from '@/lib/chat-send-queue'

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

// ตัวแจ้งเตือนเข้าแอปผู้ขาย (Task 9) — mock ที่นี่เพื่อวัด "ถูกเรียกจากเส้นทางไหน ด้วยอะไร"
// ถ้อยคำ/ผู้รับ/throttle เป็นความรับผิดชอบของ seller-push-send-failed.test.ts (ของจริง ไม่ mock)
const pushChatSendFailed = vi.fn()
vi.mock('@/services/seller-push.service', () => ({
  pushChatSendFailed: (...a: unknown[]) => pushChatSendFailed(...a),
}))

const updateMany = vi.fn()
const findMany = vi.fn()
const update = vi.fn()
const groupBy = vi.fn()
const create = vi.fn()
const conversationUpdate = vi.fn()
const conversationFindMany = vi.fn()
vi.mock('@/lib/prisma', () => ({
  prisma: {
    chatMessage: {
      updateMany: (...a: unknown[]) => updateMany(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      groupBy: (...a: unknown[]) => groupBy(...a),
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
  pushChatSendFailed.mockReset()
  pushChatSendFailed.mockResolvedValue(undefined)
  updateMany.mockReset()
  findMany.mockReset()
  groupBy.mockReset()
  update.mockReset()
  create.mockReset()
  conversationUpdate.mockReset()
  conversationFindMany.mockReset()
  conversationFindMany.mockResolvedValue([])
  resolveOutboundContext.mockResolvedValue({
    id: 'c1',
    channel: 'MESSENGER',
    shopId: 's1',
    shopChannel: { status: 'ACTIVE' },
    externalContact: { isBlocked: false },
  })
  create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: 'new1',
    createdAt: new Date('2026-08-23T10:00:00Z'),
    ...args.data,
  }))
  update.mockResolvedValue({})
  findMany.mockResolvedValue([])
  groupBy.mockResolvedValue([])
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

/**
 * คำสั่งเขียนของ `closeRow` — แยกจากคำสั่ง claim ด้วย **รูปร่างของ where** ไม่ใช่ลำดับการเรียก
 *
 * ทั้งคู่เป็น `updateMany` ตั้งแต่ R-F (closeRow ต้อง conditional ด้วย `deliveryStatus: 'QUEUED'`
 * ไม่งั้น worker ที่วิ่งเกินเพดานเวลาจะเขียน SENT ทับแถวที่ถูกปิดเป็น FAILED ไปแล้ว) — claim มี
 * `sendLockedAt: null` ใน where ส่วนการปิดแถวมี `deliveryStatus: 'QUEUED'`
 */
const closeCalls = () =>
  updateMany.mock.calls.filter(
    (c) => (c[0] as { where?: Record<string, unknown> })?.where?.deliveryStatus === 'QUEUED',
  )

const OK = {
  externalMessageId: 'mid_1',
  outboundResponse: {},
  failureReason: null,
  sendMethod: null,
  sendBatchId: null,
}

describe('deliverRoom', () => {
  it('[blocker] claim ด้วยเงื่อนไข sendLockedAt: null เสมอ — นี่คือสิ่งเดียวที่กันข้อความซ้ำ', async () => {
    findMany.mockResolvedValueOnce([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue(OK)

    await deliverRoom('c1', 'after')

    const claimArgs = updateMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }
    expect(claimArgs.where).toMatchObject({ id: 'm1', sendLockedAt: null })
  })

  it('[blocker] claim ไม่ติด (คนอื่นชิงไปแล้ว) → ต้องไม่ยิงเลย', async () => {
    findMany.mockResolvedValueOnce([queued()])
    updateMany.mockResolvedValue({ count: 0 })

    await deliverRoom('c1', 'cron')

    expect(transmitOutbound).not.toHaveBeenCalled()
  })

  it('[blocker] ยิงสำเร็จ → เขียน SENT + mid และ **ไม่เคลียร์ sendLockedBy** (ตัววัด §9)', async () => {
    findMany.mockResolvedValueOnce([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue({ ...OK, outboundResponse: { ok: true } })

    await deliverRoom('c1', 'cron')

    const data = (closeCalls()[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({ deliveryStatus: 'SENT', externalMessageId: 'mid_1' })
    // R-6: ต้องเป็น "ไม่มีคีย์นี้ในคำสั่งเขียน" — `not.toHaveProperty(k, null)` ผ่านได้ทั้งตอนคีย์หาย
    // และตอนค่าต่าง = ไม่ได้ล็อกอะไรเลย
    expect(data.sendLockedBy).toBeUndefined()
  })

  it('[blocker] ปลายทางปฏิเสธ → FAILED + failureReason ดิบ และห้ามยิงซ้ำในรอบเดียวกัน', async () => {
    findMany.mockResolvedValueOnce([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue({
      ...OK,
      externalMessageId: null,
      failureReason: '(#10) outside of allowed window',
    })

    await deliverRoom('c1', 'after')

    expect(transmitOutbound).toHaveBeenCalledTimes(1)
    const data = (closeCalls()[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({ deliveryStatus: 'FAILED', failureReason: '(#10) outside of allowed window' })
  })

  it('[blocker] หัวคิวถูก claim ค้างอยู่ → ห้ามข้ามไปยิงใบถัดไป', async () => {
    findMany.mockResolvedValueOnce([
      queued({ id: 'head', sendLockedAt: new Date('2026-08-23T10:00:01Z') }),
      queued({ id: 'next', createdAt: new Date('2026-08-23T10:00:05Z') }),
    ])

    await deliverRoom('c1', 'cron')

    expect(transmitOutbound).not.toHaveBeenCalled()
  })

  it('[blocker] ตัวยิงถูกเรียกจริง ด้วย conversation ที่ resolve มา — ไม่ใช่แค่ไม่พัง', async () => {
    // ข้อนี้จงใจตรวจ "ถูกเรียกจริงไหม" ไม่ใช่ "ผลลัพธ์ถูกไหม" — เทสที่ mock ตัวยิงทิ้งแล้วดูแต่
    // ผลลัพธ์จะเขียวเท่ากันทั้งกรณีที่เรียกและกรณีที่ลืมเรียก (บทเรียน 00038)
    findMany.mockResolvedValueOnce([queued({ sendPayload: { text: 'ทัก', actorUserId: 'u1' } })])
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
    findMany.mockResolvedValueOnce([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue({ ...OK, externalMessageId: '468789577898262530', sendMethod: 'REPLY' })

    await deliverRoom('c1', 'after')

    const data = (closeCalls()[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data.externalMessageId).toBe('LINE:468789577898262530')
    expect(data).toMatchObject({ sendMethod: 'REPLY' })
  })

  it('[blocker] MESSENGER: ห้ามเติม prefix ให้ mid ของ Meta', async () => {
    findMany.mockResolvedValueOnce([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue({ ...OK, externalMessageId: 'm_abc' })

    await deliverRoom('c1', 'after')

    const data = (closeCalls()[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data.externalMessageId).toBe('m_abc')
  })

  it('[blocker] sendPayload อ่านไม่ออก (deploy คนละ shape) → ปิดแถวเป็น FAILED ห้าม throw ทั้ง worker (E-7)', async () => {
    findMany.mockResolvedValueOnce([queued({ sendPayload: 'ข้อความเก่าที่ไม่ใช่อ็อบเจกต์' })])
    updateMany.mockResolvedValue({ count: 1 })

    await expect(deliverRoom('c1', 'cron')).resolves.toBe(1)

    expect(transmitOutbound).not.toHaveBeenCalled()
    const data = (closeCalls()[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data.deliveryStatus).toBe('FAILED')
    expect(typeof data.failureReason).toBe('string')
  })

  it('ด่าน ownership ล้มหลัง claim (เพจถูกถอด/สิทธิ์หาย) → FAILED ไม่ปล่อยแถวค้าง', async () => {
    findMany.mockResolvedValueOnce([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    resolveOutboundContext.mockRejectedValue(new Error('CONVERSATION_NOT_FOUND'))

    await expect(deliverRoom('c1', 'cron')).resolves.toBe(1)

    const data = (closeCalls()[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({ deliveryStatus: 'FAILED', failureReason: 'CONVERSATION_NOT_FOUND' })
  })

  it('echo ของ Meta ชิงเขียน mid ไปก่อน (P2002) → ยังต้องเป็น SENT ไม่ใช่ค้างคิว (E-17)', async () => {
    findMany.mockResolvedValueOnce([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue(OK)
    const dup = Object.assign(new Error('dup'), { code: 'P2002', meta: { target: ['externalMessageId'] } })
    // ลำดับ: claim (สำเร็จ) → ปิดแถวครั้งแรก (ชนกับ echo) → ปิดแถวซ้ำโดยไม่แตะ externalMessageId
    updateMany.mockReset()
    updateMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(dup).mockResolvedValue({ count: 1 })

    await expect(deliverRoom('c1', 'after')).resolves.toBe(1)

    const second = (closeCalls()[1]?.[0] as { data: Record<string, unknown> }).data
    expect(second.deliveryStatus).toBe('SENT')
    expect(second.externalMessageId).toBeUndefined()
  })

  it('ห้องว่าง (ไม่มีแถว QUEUED) → คืน 0 และไม่แตะอะไรเลย', async () => {
    findMany.mockResolvedValueOnce([])

    await expect(deliverRoom('c1', 'cron')).resolves.toBe(0)
    expect(updateMany).not.toHaveBeenCalled()
    expect(transmitOutbound).not.toHaveBeenCalled()
  })

  it('ส่งสำเร็จโดยคน → บอทต้องหลบ (D-7 pauseForHumanTakeover ทำที่ "สำเร็จ" ไม่ใช่ตอนเข้าคิว)', async () => {
    findMany.mockResolvedValueOnce([queued({ sendPayload: { actorUserId: 'u1' } })])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue(OK)

    await deliverRoom('c1', 'after')

    expect(pauseForHumanTakeover).toHaveBeenCalledTimes(1)
  })

  it('บอทเป็นผู้ส่ง (autoReplyKind) → ห้ามสั่งบอทหลบตัวเอง', async () => {
    findMany.mockResolvedValueOnce([queued({ sendPayload: { actorUserId: null, autoReplyKind: 'AUTO' } })])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue(OK)

    await deliverRoom('c1', 'cron')

    expect(pauseForHumanTakeover).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════════════
// ฐานข้อมูลจำลองเล็ก ๆ ของ "หนึ่งห้อง" — ใช้กับเทสที่ต้องวนหลายรอบ
//
// 🛑 ต้องเป็นของจำลองที่ *ประพฤติเหมือนฐานจริง* (แถวที่จบแล้วออกจากคิว · claim ซ้ำไม่ติด)
// ไม่ใช่ mockResolvedValueOnce เรียงตามลำดับ — ไม่งั้น mutation ที่เปลี่ยน break เป็น continue
// จะให้ผลเหมือนเดิมทุกประการ แล้วเทสจะเขียวทั้งที่โค้ดผิด (mutation-silence-means-weak-corpus)
// ══════════════════════════════════════════════════════════════════════════
type FakeRow = {
  id: string
  conversationId: string
  createdAt: Date
  deliveryStatus: string | null
  sendLockedAt: Date | null
  sendPayload: unknown
}

function makeRows(n: number, conversationId = 'c1'): FakeRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${conversationId}:r${i + 1}`,
    conversationId,
    createdAt: new Date(Date.parse('2026-08-23T10:00:00Z') + i * 1000),
    deliveryStatus: 'QUEUED',
    sendLockedAt: null,
    sendPayload: { text: `a${i + 1}`, actorUserId: 'u1' },
  }))
}

/** `stolen` = id ที่ "worker อื่นชิง claim ไปแล้วและทำเสร็จ" — claim ของเราจะได้ count 0 */
function installStore(store: FakeRow[], stolen: Set<string> = new Set()) {
  findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
    const where = (args?.where ?? {}) as Record<string, unknown>
    if (!where.conversationId) return []
    return store
      .filter((r) => r.deliveryStatus === 'QUEUED' && r.conversationId === where.conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  })
  /**
   * `updateMany` รับ 2 บทบาทตั้งแต่ R-F (claim / closeRow) — **จำลอง `WHERE` ของจริง
   * ไม่ใช่เดาบทบาทจากรูปร่างคำสั่ง**
   *
   * 🛑 ของเดิมแยกบทบาทด้วย `args.where.deliveryStatus === 'QUEUED'` ซึ่ง **ทำให้ guard ของ R-F
   * กลายเป็นสิ่งที่ mock ใช้ตัดสินใจเสียเอง**: mutation ที่ถอด `deliveryStatus: 'QUEUED'` ออกจาก
   * `closeRow` ทำให้คำสั่งตกไปเข้ากิ่ง claim แล้วคืน `count: 0` ⇒ แถวไม่ถูกเขียนทับ ⇒ เทส
   * "ห้ามเขียน SENT ทับ" **เขียว** ทั้งที่ guard หายไปแล้ว (ที่แดงคือเทสอื่นซึ่งแดงเพราะรูปร่าง
   * คำสั่งเปลี่ยน = แดงด้วยเหตุผลที่ผิด และจะพาคนที่มาเจอในอนาคตวินิจฉัยผิดทาง)
   *
   * ตอนนี้ทุกคีย์ใน `where` ถูกเทียบกับค่าปัจจุบันของแถวเหมือน Postgres ทำ ⇒ guard ที่หายไป
   * แปลว่าเงื่อนไขหายไปจริง ๆ แล้วแถวถูกเขียนทับจริง ๆ = เทสข้อนั้นเองแดง
   */
  updateMany.mockImplementation(
    async (args: { where: Record<string, unknown>; data?: Record<string, unknown> }) => {
      const where = args.where ?? {}
      const id = where.id
      if (typeof id !== 'string') return { count: 0 }
      const row = store.find((r) => r.id === id)
      if (!row) return { count: 0 }

      // `stolen` = สถานการณ์ที่ fixture จำลอง ("worker อื่นชิง claim ไปแล้วและทำจนจบ") ไม่ใช่กฎ
      // ที่กำลังถูกทดสอบ — ผูกกับ **คำสั่ง claim** ซึ่งเป็นคำสั่งเดียวที่มี `sendLockedAt` ใน where
      if ('sendLockedAt' in where && stolen.has(id)) {
        row.sendLockedAt = new Date()
        row.deliveryStatus = 'SENT'
        return { count: 0 }
      }

      // WHERE: ทุกคีย์ที่ระบุต้องตรงกับค่าปัจจุบันของแถว ไม่ตรง = 0 แถวถูกแตะ
      for (const [key, want] of Object.entries(where)) {
        if (key === 'id') continue
        if ((row as unknown as Record<string, unknown>)[key] !== want) return { count: 0 }
      }

      // SET: เขียนเฉพาะคอลัมน์ที่แถวจำลองมีจริง
      const data = args.data ?? {}
      if (typeof data.deliveryStatus === 'string') row.deliveryStatus = data.deliveryStatus
      if ('sendLockedAt' in data) row.sendLockedAt = (data.sendLockedAt as Date | null) ?? null
      return { count: 1 }
    },
  )
  // `update` (ไม่มีเงื่อนไข) — เขียนทับเสมอ. ไม่มีโค้ดเส้นไหนควรเรียกตัวนี้แล้ว แต่ต้องคง
  // พฤติกรรม "เขียนทับได้" ไว้ ไม่งั้นเทสของ R-F จะเขียวทั้งที่ใครกลับไปใช้ `update` เปล่า
  update.mockImplementation(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = store.find((r) => r.id === args.where.id)
    if (row && typeof args.data.deliveryStatus === 'string') row.deliveryStatus = args.data.deliveryStatus
    return {}
  })
  return store
}

const sentTexts = () => transmitOutbound.mock.calls.map((c) => (c[1] as { text?: string }).text)

describe('closeRow — conditional เสมอ (R-F)', () => {
  /**
   * 🛑 นี่คือทางเกิดข้อความซ้ำ **ทางเดียวที่เหลืออยู่** ในดีไซน์นี้:
   *
   * worker ที่ยิงช้ากว่า `STALE_CLAIM_MS` (3 นาที) จะถูกตัวกวาดปิดแถวเป็น FAILED "ไม่แน่ใจว่าส่ง
   * ไปหรือยัง" ไปก่อน — ผู้ขายเห็นบับเบิลแดง (นานพอที่จะกดส่งซ้ำ) แล้วถ้า worker ตัวเดิมกลับมา
   * เขียน SENT ทับได้ มันจะกลายเป็นเขียวทีหลังโดยที่ลูกค้าได้ข้อความไปแล้ว 2 ใบ
   *
   * เทสนี้จงใจวัด **ผลลัพธ์บนแถว** ไม่ใช่รูปร่างของคำสั่ง — ถ้าใครกลับไปใช้ `update` เปล่า
   * (ซึ่งเขียนทับได้เสมอ) แถวจะจบเป็น SENT แล้วข้อนี้แดงทันที
   */
  it('[blocker] แถวถูกปิดเป็น FAILED ระหว่างที่เรากำลังยิง → ห้ามเขียน SENT ทับ', async () => {
    const store = installStore(makeRows(1))
    resolveOutboundContext.mockResolvedValue({ id: 'c1', channel: 'MESSENGER', shopId: 's1' })
    transmitOutbound.mockImplementation(async () => {
      // ตัวกวาดปิดแถวนี้ไปแล้วระหว่างที่เรารอปลายทางตอบ (claim ค้างเกินเพดาน)
      store[0]!.deliveryStatus = 'FAILED'
      return OK
    })

    await deliverRoom('c1', 'after')

    expect(store[0]!.deliveryStatus).toBe('FAILED')
  })
})

describe('deliverRoom — ระบายคิวทั้งห้อง', () => {
  it('[blocker] ห้องมี 3 แถว → เรียกครั้งเดียวต้องระบายครบ เรียงเก่า→ใหม่ (ใบที่ 2 ห้ามค้างรอตัวกวาด)', async () => {
    installStore(makeRows(3))
    transmitOutbound.mockResolvedValue(OK)

    await expect(deliverRoom('c1', 'after')).resolves.toBe(3)

    expect(transmitOutbound).toHaveBeenCalledTimes(3)
    expect(sentTexts()).toEqual(['a1', 'a2', 'a3'])
  })

  it('[blocker] แพ้ race กลางคัน → หยุดทันที ห้ามข้ามไปยิงใบถัดไป (D-3 ลำดับของลูกค้า)', async () => {
    // r2 ถูก worker อื่นชิงไปและทำเสร็จ ⇒ ถ้าโค้ดเรา `continue` แทนที่จะ `break` มันจะเห็น r3
    // เป็นหัวคิวรอบถัดไปแล้วยิงต่อ = แข่งระบายห้องเดียวกันกับอีก worker
    installStore(makeRows(3), new Set(['c1:r2']))
    transmitOutbound.mockResolvedValue(OK)

    await expect(deliverRoom('c1', 'after')).resolves.toBe(1)

    expect(transmitOutbound).toHaveBeenCalledTimes(1)
    expect(sentTexts()).toEqual(['a1'])
  })

  it('[blocker] ใบที่ส่งไม่ผ่านต้องไม่ขังใบถัดไปไว้ทั้งห้อง', async () => {
    installStore(makeRows(2))
    transmitOutbound
      .mockResolvedValueOnce({ ...OK, externalMessageId: null, failureReason: '(#10) window closed' })
      .mockResolvedValue(OK)

    await expect(deliverRoom('c1', 'cron')).resolves.toBe(2)

    expect(sentTexts()).toEqual(['a1', 'a2'])
  })

  it('[blocker] เพดานรอบต่อการเรียกหนึ่งครั้ง — ครบแล้วหยุด ปล่อยให้ตัวกวาดรับช่วง', async () => {
    installStore(makeRows(25))
    transmitOutbound.mockResolvedValue(OK)

    await expect(deliverRoom('c1', 'after')).resolves.toBe(20)

    expect(transmitOutbound).toHaveBeenCalledTimes(20)
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

  // ── (R-21) ด่านที่ตรวจล่วงหน้าได้จริง ต้องอยู่ใน POST ไม่ใช่รอไปล้มหลังบ้าน ──
  it('[blocker] เพจถูกถอดการเชื่อมต่อ (status ≠ ACTIVE) → โยน CHANNEL_NOT_ACTIVE ตั้งแต่ตอนกด ไม่เข้าคิว', async () => {
    resolveOutboundContext.mockResolvedValue({
      id: 'c1',
      channel: 'MESSENGER',
      shopId: 's1',
      shopChannel: { status: 'TOKEN_INVALID' },
      externalContact: { isBlocked: false },
    })

    await expect(enqueueOutbound({ conversationId: 'c1', actorUserId: 'u1', text: 'x' })).rejects.toThrow(
      'CHANNEL_NOT_ACTIVE',
    )
    expect(create).not.toHaveBeenCalled()
  })

  it('[blocker] LINE + ลูกค้าปิดรับข้อความ → CONTACT_BLOCKED **มาก่อน** CHANNEL_NOT_ACTIVE (ลำดับเดิมของ LINE)', async () => {
    // จริงทั้งคู่พร้อมกัน — ต้องได้ error ตัวเดียวกับที่ `transmitLineMessage` เคยโยน (:3213 มาก่อน :3216)
    resolveOutboundContext.mockResolvedValue({
      id: 'c1',
      channel: 'LINE',
      shopId: 's1',
      shopChannel: { status: 'TOKEN_INVALID' },
      externalContact: { isBlocked: true },
    })

    await expect(enqueueOutbound({ conversationId: 'c1', actorUserId: 'u1', text: 'x' })).rejects.toThrow(
      'CONTACT_BLOCKED',
    )
    expect(create).not.toHaveBeenCalled()
  })

  it('[blocker] Meta ไม่มีด่าน isBlocked — ธงนี้มีผู้เขียนคือ LINE เท่านั้น (BR-LINE-15)', async () => {
    // ถ้าเอา isBlocked ไปกั้น Meta ด้วย = ด่านใหม่ที่ไม่เคยมี บนธงที่ฝั่ง Meta ไม่เคยตั้ง
    // และผู้ขายจะได้อ่านข้อความที่พูดถึง "LINE OA" ในห้อง Messenger
    resolveOutboundContext.mockResolvedValue({
      id: 'c1',
      channel: 'MESSENGER',
      shopId: 's1',
      shopChannel: { status: 'ACTIVE' },
      externalContact: { isBlocked: true },
    })

    await enqueueOutbound({ conversationId: 'c1', actorUserId: 'u1', text: 'x' })

    expect(create).toHaveBeenCalledTimes(1)
  })

  it('ด่าน ownership ยังอยู่ที่เดิม — resolveOutboundContext โยน = ไม่เขียนแถวเลย', async () => {
    resolveOutboundContext.mockRejectedValue(new Error('FORBIDDEN'))

    await expect(enqueueOutbound({ conversationId: 'c1', actorUserId: 'u1', text: 'x' })).rejects.toThrow('FORBIDDEN')
    expect(create).not.toHaveBeenCalled()
  })
})

describe('sweepOutbox', () => {
  // ห้องหนึ่งใน groupBy — `_min.createdAt` ต้องมีเสมอ เพราะขั้นคัด "หัวคิวหยิบได้" (R-A) เทียบค่านี้
  const room = (conversationId: string, min = new Date('2026-08-23T10:00:00Z')) => ({
    conversationId,
    _min: { createdAt: min },
  })

  it('[blocker] แถวที่ claim ค้างเกินเพดาน → ปิดเป็น FAILED พร้อมเหตุผลที่พูดความจริงว่าไม่รู้ผล (E-1)', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000)
    // findMany = รอบสแกน claim ค้าง · groupBy = รอบหาห้องที่ยังมีแถวหยิบได้ (ไม่มี)
    findMany.mockResolvedValueOnce([queued({ id: 'stuck', sendLockedAt: old })])
    updateMany.mockResolvedValue({ count: 1 })
    conversationFindMany.mockResolvedValue([{ id: 'c1', shopId: 's1' }])

    const res = await sweepOutbox({ owner: 'cron' })

    expect(res.stale).toBe(1)
    const args = updateMany.mock.calls[0]?.[0] as { where: Record<string, unknown>; data: Record<string, unknown> }
    // R-B: ปิดทีละแถว (id เดี่ยว) ไม่ใช่ `id: { in: [...] }` — ต้องรู้ให้ได้ว่าแถวไหนถูกปิดจริง
    expect(args.where).toMatchObject({ id: 'stuck', deliveryStatus: 'QUEUED' })
    expect(args.data.deliveryStatus).toBe('FAILED')
    // ผูกกับค่าคงที่ ไม่ก็อปสตริง — ถ้อยคำถูกปรับใน fix round 1 ของ /impeccable clarify แล้วเทส
    // ที่ฝังคำไว้แดงด้วยเหตุผลที่ไม่เกี่ยวกับสิ่งที่มันตรวจ (สิ่งที่ตรวจคือ "เขียนเหตุผลตัวนี้ลงแถว")
    expect(args.data.failureReason).toBe(UNCERTAIN_SEND_REASON)
  })

  // 🛑 (R-B) เคส "ไม่แน่ใจว่าส่งไปหรือยัง" คือเคสที่ต้องบอกผู้ขายที่สุดในทั้งฟีเจอร์ — และมันเป็น
  // เส้นทางเดียวที่ **ไม่ผ่าน `deliverHead`** ⇒ ถ้าคืนแค่ตัวเลข ตัวแจ้งเตือนที่แขวนไว้ที่นั่นจะ
  // ไม่มีทางรู้เลยว่าต้องแจ้งใคร ห้องไหน
  it('[blocker] คืนแถวที่ปิดไปเป็นรายแถวพร้อม conversationId/shopId ให้ผู้เรียกแจ้งผู้ขายได้', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000)
    findMany.mockResolvedValueOnce([queued({ id: 'stuck', conversationId: 'cX', sendLockedAt: old })])
    updateMany.mockResolvedValue({ count: 1 })
    conversationFindMany.mockResolvedValue([{ id: 'cX', shopId: 'shop9' }])

    const res = await sweepOutbox({ owner: 'cron' })

    expect(res.staleRows).toEqual([{ id: 'stuck', conversationId: 'cX', shopId: 'shop9' }])
  })

  it('[blocker] worker เจ้าของ claim ปิดแถวเองทันพอดี (count=0) → ห้ามนับเป็น stale ห้ามแจ้ง', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000)
    findMany.mockResolvedValueOnce([queued({ id: 'stuck', sendLockedAt: old })])
    updateMany.mockResolvedValue({ count: 0 })
    conversationFindMany.mockResolvedValue([{ id: 'c1', shopId: 's1' }])

    const res = await sweepOutbox({ owner: 'cron' })

    expect(res.stale).toBe(0)
    expect(res.staleRows).toEqual([])
  })

  // 🛑 (R-C) ขั้นนี้รันทุกนาทีและไม่เคยยิงข้อความเลย — ห้ามดึงทั้งตาราง ห้ามลาก `sendPayload`
  // (params ทั้งก้อน รวม Flex/Generic carousel) มาด้วย ทั้งที่ `isStaleClaim` ใช้แค่ 2 คอลัมน์
  it('[blocker] รอบสแกน claim ค้างต้องมี take และต้องไม่ select sendPayload', async () => {
    await sweepOutbox({ owner: 'cron' })

    const args = findMany.mock.calls[0]?.[0] as {
      take?: number
      select?: Record<string, unknown>
      orderBy?: Record<string, unknown>
    }
    expect(typeof args.take).toBe('number')
    expect(args.take).toBeGreaterThan(0)
    expect(args.select).not.toHaveProperty('sendPayload')
    // claim เก่าสุดก่อน — ตัวที่ค้างจริงต้องถูกหยิบก่อนเสมอแม้ take ไม่พอ
    expect(args.orderBy).toMatchObject({ sendLockedAt: 'asc' })
  })

  it('[blocker] แถวที่เพิ่ง claim (ยังไม่เกินเพดาน) ห้ามถูกปิดทิ้ง', async () => {
    findMany.mockResolvedValueOnce([queued({ id: 'fresh', sendLockedAt: new Date() })])

    const res = await sweepOutbox({ owner: 'cron' })

    expect(res.stale).toBe(0)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('[blocker] เพดานจำนวนห้องต้องถูกส่งเข้า query (F3 — distinct ทำให้ Prisma ตัด LIMIT ทิ้ง)', async () => {
    // ของเดิมใช้ findMany + distinct ซึ่ง Prisma ทำ distinct ในหน่วยความจำแล้ว **ตัด LIMIT ทิ้งทั้งดุ้น**
    // (พิสูจน์ด้วย query log จริง — ดูรายงาน) ⇒ ดึงแถวที่หยิบได้ทั้งตารางทุกรอบก่อนตัดเหลือ N ห้อง
    await sweepOutbox({ owner: 'cron', limit: 7 })

    const args = groupBy.mock.calls[0][0] as { by: string[]; take?: number }
    expect(args).toMatchObject({ by: ['conversationId'] })
    // เพดานต้องมีจริงและผูกกับ limit — over-fetch ได้ (R-A ต้องคัดห้องที่ "หัวคิวหยิบได้" ทีหลัง)
    // แต่ต้องไม่ใช่ "ไม่มีเพดาน" ซึ่งเป็นบั๊กที่ F3 เพิ่งถอดออกไป
    expect(typeof args.take).toBe('number')
    expect(args.take).toBeGreaterThanOrEqual(7)
    expect(args.take).toBeLessThanOrEqual(7 * 10)
  })

  it('ไม่ส่ง limit มา → ใช้ค่าตั้งต้น 50 (ยังต้องเป็นเพดานที่ถูกส่งเข้า query จริง)', async () => {
    await sweepOutbox({ owner: 'cron' })

    const take = (groupBy.mock.calls[0][0] as { take?: number }).take
    expect(take).toBeGreaterThanOrEqual(50)
    expect(take).toBeLessThanOrEqual(500)
  })

  // 🛑 (R-A) `headOfRoom` คืน null ถ้า **ใบเก่าสุด** ถูก claim อยู่ (D-3) — ห้องแบบนั้นถูกเลือกมา
  // แล้ว return 'NONE' ทันที = กินสล็อตฟรี. ตอนเกิดเหตุจริง (after() ตายเป็นแถบ) ห้องแบบนี้คือ
  // ห้องส่วนใหญ่ ⇒ สล็อตถูกกินหมดโดยห้องที่ระบายไม่ได้ ห้องที่ระบายได้อดตายทุกนาที
  it('[blocker] ห้องที่หัวคิวถูก claim ค้างอยู่ ต้องไม่กินสล็อตของห้องที่ระบายได้', async () => {
    const head = new Date('2026-08-23T10:00:00Z')
    const later = new Date('2026-08-23T10:00:05Z')
    groupBy
      // ผู้สมัคร: ห้อง BLOCKED มีแถวหยิบได้ (แต่เป็นใบที่ 2) · ห้อง OPEN หัวคิวหยิบได้
      .mockResolvedValueOnce([room('BLOCKED', later), room('OPEN', head)])
      // หัวคิวจริงของแต่ละห้อง (ไม่กรอง sendLockedAt) — ของ BLOCKED เก่ากว่าใบที่หยิบได้
      .mockResolvedValueOnce([room('BLOCKED', head), room('OPEN', head)])
    conversationFindMany.mockResolvedValue([{ id: 'OPEN', shopChannelId: 'page1' }])
    installStore(makeRows(1, 'OPEN'))
    transmitOutbound.mockResolvedValue(OK)
    resolveOutboundContext.mockImplementation(async (p: { conversationId: string }) => ({
      id: p.conversationId,
      channel: 'MESSENGER',
      shopId: 's1',
    }))

    const res = await sweepOutbox({ owner: 'cron' })

    expect(res.rooms).toBe(1)
    expect(conversationFindMany.mock.calls[0]?.[0]).toMatchObject({ where: { id: { in: ['OPEN'] } } })
  })

  it('[blocker] มีเพดานจำนวนกลุ่มที่ระบายพร้อมกัน — ห้าม Promise.all ทุกกลุ่มรวด (R-D)', async () => {
    // 12 เพจ เพจละ 1 ห้อง: ถ้าไม่มีเพดานรวม ทั้ง 12 จะยิงพร้อมกัน ⇒ pool หมด ⇒ แถวค้าง claim
    // ⇒ อีก 3 นาทีกลายเป็น "ไม่แน่ใจว่าส่งไปหรือยัง" = แปลง throughput เป็นความล้มเหลวที่ผู้ขายเห็น
    const ids = Array.from({ length: 12 }, (_, i) => `R${i}`)
    const rooms = ids.map((id) => room(id))
    groupBy.mockResolvedValue(rooms)
    conversationFindMany.mockResolvedValue(ids.map((id) => ({ id, shopChannelId: `page-${id}` })))
    installStore(ids.flatMap((id) => makeRows(1, id)))
    resolveOutboundContext.mockImplementation(async (p: { conversationId: string }) => ({
      id: p.conversationId,
      channel: 'MESSENGER',
      shopId: 's1',
    }))

    let inFlight = 0
    let peak = 0
    transmitOutbound.mockImplementation(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 3))
      inFlight -= 1
      return OK
    })

    const res = await sweepOutbox({ owner: 'cron' })

    expect(res.sent).toBe(12)
    expect(peak).toBeGreaterThan(1) // ยังต้องขนานได้จริง ไม่ใช่แก้ด้วยการทำทีละห้องทั้งระบบ
    expect(peak).toBeLessThanOrEqual(6)
  })

  it('[blocker] หมดงบเวลา → หยุดเองอย่างสุภาพ ห้ามปล่อยให้ maxDuration ฆ่ากลาง claim (R-E)', async () => {
    const ids = Array.from({ length: 6 }, (_, i) => `T${i}`)
    groupBy.mockResolvedValue(ids.map((id) => room(id)))
    conversationFindMany.mockResolvedValue(ids.map((id) => ({ id, shopChannelId: `page-${id}` })))
    installStore(ids.flatMap((id) => makeRows(1, id)))
    resolveOutboundContext.mockImplementation(async (p: { conversationId: string }) => ({
      id: p.conversationId,
      channel: 'MESSENGER',
      shopId: 's1',
    }))
    transmitOutbound.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 12))
      return OK
    })

    // งบ 0 = หมดตั้งแต่ก่อนห้องแรก ⇒ ต้องไม่ยิงเลยสักใบ (และต้องไม่ค้างรอ)
    // 🛑 ห้ามใช้ค่าน้อย ๆ อย่าง 1ms เป็นเกณฑ์: ตอนรันจริงเวลาอาจยังไม่ทันขยับ ⇒ เทสจะวัด
    // "เครื่องเร็วแค่ไหน" แทนที่จะวัดว่ามีด่านงบเวลาอยู่จริง (เคสนี้เกิดจริงตอนเขียนเทสข้อนี้)
    const res = await sweepOutbox({ owner: 'cron', budgetMs: 0 })

    expect(res.sent).toBe(0)
    expect(transmitOutbound).not.toHaveBeenCalled()
  })

  // 🛑 ข้อนี้แยกจากข้อ "หลายห้อง" โดยตั้งใจ: ห้องเดียวที่มีคิวยาวคือเคสที่ **เฉพาะ** ด่านใน
  // `drainRoom` เท่านั้นที่จับได้ (ด่านระดับลูปห้องไม่มีวันถูกเรียกซ้ำเลยภายในห้องเดียว)
  // ถ้าไม่มีข้อนี้ การถอดด่านใน drainRoom ทิ้งจะไม่ทำให้อะไรแดงเลย
  it('[blocker] งบเวลาหมดกลางห้องเดียว → หยุดที่ใบถัดไป ไม่ระบายจนหมดคิว (R-E)', async () => {
    groupBy.mockResolvedValue([room('SOLO')])
    conversationFindMany.mockResolvedValue([{ id: 'SOLO', shopChannelId: 'page1' }])
    installStore(makeRows(8, 'SOLO'))
    resolveOutboundContext.mockImplementation(async (p: { conversationId: string }) => ({
      id: p.conversationId,
      channel: 'MESSENGER',
      shopId: 's1',
    }))
    transmitOutbound.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10))
      return OK
    })

    const res = await sweepOutbox({ owner: 'cron', budgetMs: 25 })

    expect(res.sent).toBeGreaterThan(0)
    expect(res.sent).toBeLessThan(8)
  })

  it('[blocker] งบเวลาหมดกลางคัน → หยุดที่ห้องถัดไป ไม่ใช่ทำต่อจนครบทุกห้อง (R-E)', async () => {
    const ids = Array.from({ length: 8 }, (_, i) => `U${i}`)
    groupBy.mockResolvedValue(ids.map((id) => room(id)))
    // เพจเดียวกันทั้งหมด ⇒ ระบายทีละห้องเรียงกัน (E-8) เวลาจึงเดินสะสมจนหมดงบแน่นอน
    conversationFindMany.mockResolvedValue(ids.map((id) => ({ id, shopChannelId: 'page1' })))
    installStore(ids.flatMap((id) => makeRows(1, id)))
    resolveOutboundContext.mockImplementation(async (p: { conversationId: string }) => ({
      id: p.conversationId,
      channel: 'MESSENGER',
      shopId: 's1',
    }))
    transmitOutbound.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10))
      return OK
    })

    const res = await sweepOutbox({ owner: 'cron', budgetMs: 25 })

    expect(res.sent).toBeGreaterThan(0)
    expect(res.sent).toBeLessThan(8)
  })

  /**
   * 🛑 สองข้อถัดไปกันด่านงบเวลาของ **ขั้นที่ 1** ซึ่งเดิมไม่มีเลย — `deadline` ถูกคิดตั้งแต่ต้น
   * ฟังก์ชันแต่ถูกใช้ครั้งแรกใน `drainRoom` ⇒ ขั้นปิดแถวค้างทำได้ถึง `STALE_SCAN_LIMIT` = 200 แถว
   * แบบไม่มีเพดาน (แต่ละแถว = `updateMany` + noti ที่ await ทีละใบและมี HTTP ไป Expo ข้างใน)
   *
   * สถานการณ์ที่ทำให้ตัวเลขนี้โตคือ "ปลายทางล่ม" ซึ่งเป็นสถานการณ์เดียวกับที่ R-D/R-E ถูกสร้างมา
   * รับมือพอดี ⇒ รอบนั้น cron หมด 60 วินาทีไปกับการปิดแถว/ยิง noti โดยไม่ได้ระบายอะไรเลยสักห้อง
   *
   * 🛑 **แยกเป็นสองข้อโดยตั้งใจ** — ด่านสองตัวหยุดคนละอย่าง: ข้อแรกทำให้ *การปิดแถว* ช้า
   * (noti เร็ว) ข้อที่สองทำให้ *noti* ช้า (การปิดแถวเร็ว) ⇒ ถอดด่านตัวไหนออกก็มีเทสของตัวเอง
   * แดง ไม่มีตัวไหนพึ่งอีกตัวบังให้
   */
  it('[blocker] ขั้นปิดแถวค้างกินงบเวลาจนหมด → หยุดที่แถวถัดไป ไม่ปิดจนครบ 200 แถว (R-E ขั้น 1)', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000)
    const rows = Array.from({ length: 8 }, (_, i) =>
      queued({ id: `stuck${i}`, conversationId: `cv${i}`, sendLockedAt: old }),
    )
    findMany.mockResolvedValueOnce(rows)
    conversationFindMany.mockResolvedValue(rows.map((r) => ({ id: r.conversationId, shopId: 's1' })))
    // การ "ปิดแถว" คือสิ่งที่ช้าในเทสนี้ — noti เร็ว เพื่อให้ด่านที่ถูกวัดเป็นด่านของลูปปิดแถวเท่านั้น
    updateMany.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10))
      return { count: 1 }
    })

    const res = await sweepOutbox({ owner: 'cron', budgetMs: 25 })

    expect(res.stale, 'ไม่มีด่าน = ปิดครบทุกแถวไม่ว่างบเวลาจะหมดไปนานแค่ไหน').toBeLessThan(8)
    expect(res.stale).toBeGreaterThan(0)
    expect(res.timedOut).toBe(true)
    // แถวที่ยังไม่ได้ปิดยังเป็น QUEUED + claim ค้าง ⇒ รอบถัดไปเห็นแน่นอน (เลื่อนจริง ไม่ใช่ตกหล่น)
    expect(res.staleRows).toHaveLength(res.stale)
  })

  it('[blocker] ขั้นยิง noti กินงบเวลาจนหมด → หยุดยิง แต่แถวต้องถูกปิดครบแล้ว + นับของที่ตกหล่น', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000)
    const rows = Array.from({ length: 8 }, (_, i) =>
      queued({ id: `stuck${i}`, conversationId: `cv${i}`, sendLockedAt: old }),
    )
    findMany.mockResolvedValueOnce(rows)
    conversationFindMany.mockResolvedValue(rows.map((r) => ({ id: r.conversationId, shopId: 's1' })))
    // ปิดแถวเร็ว (ลูปแรกจบครบแน่นอน) — ตัวที่กินเวลาคือ noti ซึ่งมี HTTP ไป Expo ในของจริง
    updateMany.mockResolvedValue({ count: 1 })
    pushChatSendFailed.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    const res = await sweepOutbox({ owner: 'cron', budgetMs: 25 })

    // ลูปปิดแถวต้องจบครบ — ถ้าข้อนี้ไม่เป็น 8 แปลว่าเรากำลังวัดด่านผิดตัว
    expect(res.stale, 'การปิดแถวเร็ว ⇒ ลูปแรกต้องจบครบ ไม่งั้นเทสนี้ไปทับกับข้อบน').toBe(8)
    expect(pushChatSendFailed.mock.calls.length).toBeGreaterThan(0)
    expect(
      pushChatSendFailed.mock.calls.length,
      'ไม่มีด่าน = ยิง noti ครบ 8 ใบไม่ว่างบเวลาหมดไปแล้วแค่ไหน',
    ).toBeLessThan(8)
    expect(res.timedOut).toBe(true)
    // 🛑 ของที่ข้ามตรงนี้ตกหล่นถาวร (แถวไม่ใช่ QUEUED แล้ว รอบหน้าไม่เห็นอีก) ⇒ ต้องนับ ไม่ใช่กลืน
    expect(res.staleUnnotified).toBe(8 - pushChatSendFailed.mock.calls.length)
    expect(res.staleUnnotified).toBeGreaterThan(0)
  })

  it('[blocker] หมดงบเวลาตั้งแต่ขั้น 1 → ไม่เดินต่อขั้น 2 (rooms ต้องไม่โกหกว่าระบายไปกี่ห้อง)', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000)
    // 3 แถว × 15ms กับงบ 20ms ⇒ **ลูปปิดแถว** เป็นตัวที่หมดเวลาเอง (ไม่ต้องพึ่งด่านของลูป noti)
    // ⇒ ข้อนี้วัดเฉพาะ "หมดเวลาแล้วต้องไม่เดินต่อขั้น 2" ไม่ไปทับกับสองข้อบน
    const rows = Array.from({ length: 3 }, (_, i) =>
      queued({ id: `stuck${i}`, conversationId: `cv${i}`, sendLockedAt: old }),
    )
    findMany.mockResolvedValueOnce(rows)
    conversationFindMany.mockResolvedValue(rows.map((r) => ({ id: r.conversationId, shopId: 's1' })))
    updateMany.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 15))
      return { count: 1 }
    })
    groupBy.mockResolvedValue([room('X'), room('Y')])

    const res = await sweepOutbox({ owner: 'cron', budgetMs: 20 })

    expect(res.timedOut).toBe(true)
    expect(res.rooms, 'นับห้องที่ไม่ได้ระบายเลยว่า "ระบายแล้ว" = ตัวเลขที่โกหกใน log ของ §10').toBe(0)
    expect(res.sent).toBe(0)
  })

  it('[blocker] ห้องของเพจเดียวกันต้องยิงทีละห้อง — ห้ามยิงพร้อมกัน (E-8 rate limit ของ Meta)', async () => {
    const store = [...makeRows(1, 'A'), ...makeRows(1, 'B')]
    installStore(store)
    groupBy.mockResolvedValue([room('A'), room('B')])
    conversationFindMany.mockResolvedValue([
      { id: 'A', shopChannelId: 'page1' },
      { id: 'B', shopChannelId: 'page1' },
    ])

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

// ══════════════════════════════════════════════════════════════════════════
// Task 9 — แจ้งเตือนเข้าแอปเมื่อข้อความส่งไม่ออก
//
// 🛑 มี **2 เส้นทาง** ที่ทำให้แถวกลายเป็น FAILED และมันไม่เรียกหากันเลย:
//   (1) `deliverHead`/`closeRow` — ปลายทางปฏิเสธ (มีเหตุผลจริงจากปลายทาง)
//   (2) stale-close ใน `sweepOutbox` — claim ค้างเกินเพดาน ปิดด้วย UNCERTAIN_SEND_REASON
//
// เส้นที่ (2) **ไม่ผ่าน `deliverHead` เลยสักบรรทัด** ⇒ ตัวแจ้งที่แขวนไว้ที่นั่นอย่างเดียวจะเงียบสนิท
// สำหรับเคสนี้ ซึ่งเป็น **เคสที่ต้องบอกผู้ขายที่สุดในทั้งฟีเจอร์**: เราไม่รู้ว่าข้อความออกไปหรือยัง
// ถ้าเขาไม่รู้ เขาจะพิมพ์ส่งใหม่ แล้วลูกค้าได้ข้อความซ้ำ — ความเสียหายเดียวที่ดีไซน์นี้ยอมไม่ได้
//
// ⇒ เทสสองกลุ่มด้านล่างต้อง **แดงแยกกัน** เมื่อถอด push ออกจากเส้นใดเส้นหนึ่ง
// ══════════════════════════════════════════════════════════════════════════

describe('แจ้งเตือนผู้ขาย — เส้นที่ 1: ปลายทางปฏิเสธ (deliverHead/closeRow)', () => {
  it('[blocker] ปลายทางปฏิเสธ → ต้องแจ้งผู้ขาย ด้วยห้อง/ร้าน/เหตุผลชุดเดียวกับที่เขียนลงแถว', async () => {
    findMany.mockResolvedValueOnce([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue({
      ...OK,
      externalMessageId: null,
      failureReason: '(#10) outside of allowed window',
    })

    await deliverRoom('c1', 'after')

    expect(pushChatSendFailed).toHaveBeenCalledTimes(1)
    expect(pushChatSendFailed.mock.calls[0][0]).toEqual({
      shopId: 's1',
      conversationId: 'c1',
      failureReason: '(#10) outside of allowed window',
    })
  })

  it('[blocker] ตัวยิงโยน exception → ก็ต้องแจ้ง (ล้มถาวรเหมือนกัน คนละรูปร่างเท่านั้น)', async () => {
    findMany.mockResolvedValueOnce([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockRejectedValue(new Error('TOKEN_INVALID'))

    await deliverRoom('c1', 'cron')

    expect(pushChatSendFailed).toHaveBeenCalledTimes(1)
    expect(pushChatSendFailed.mock.calls[0][0]).toMatchObject({ failureReason: 'TOKEN_INVALID' })
  })

  it('[blocker] ส่งสำเร็จ → ห้ามแจ้ง (ไม่งั้น noti กลายเป็นเสียงรบกวนที่ผู้ขายเรียนรู้ที่จะเมิน)', async () => {
    findMany.mockResolvedValueOnce([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue(OK)

    await deliverRoom('c1', 'after')

    expect(pushChatSendFailed).not.toHaveBeenCalled()
  })

  it('[blocker] ปิดแถวไม่ทัน (ตัวกวาดปิดไปก่อนแล้ว) → ห้ามแจ้งซ้ำด้วยเหตุผลของตัวเอง', async () => {
    // worker ที่วิ่งเกินเพดานเวลา: ตัวกวาดปิดแถวเป็น "ไม่แน่ใจว่าส่งออกไปหรือยัง" + แจ้งไปแล้ว
    // ถ้าตัวนี้แจ้งซ้ำ ผู้ขายจะได้สองใบที่บอกคนละเรื่องสำหรับข้อความใบเดียว
    const store = installStore(makeRows(1))
    resolveOutboundContext.mockResolvedValue({ id: 'c1', channel: 'MESSENGER', shopId: 's1' })
    transmitOutbound.mockImplementation(async () => {
      store[0]!.deliveryStatus = 'FAILED'
      return { ...OK, externalMessageId: null, failureReason: '(#551) not available' }
    })

    await deliverRoom('c1', 'after')

    expect(pushChatSendFailed).not.toHaveBeenCalled()
  })

  it('[blocker] ล้มก่อนรู้ว่าเป็นร้านไหน (sendPayload เสีย) → ต้องหา shopId ของห้องมาแจ้งให้ได้', async () => {
    // เส้นนี้ล้ม **ก่อน** `resolveOutboundContext` ⇒ ไม่มี conversation ให้อ่าน shopId
    // ถ้าปล่อยผ่านเพราะ "ไม่รู้ว่าร้านไหน" เคสนี้จะเงียบทั้งคลาสโดยไม่มีอะไรฟ้อง
    findMany.mockResolvedValueOnce([queued({ sendPayload: null })])
    updateMany.mockResolvedValue({ count: 1 })
    conversationFindMany.mockResolvedValue([{ id: 'c1', shopId: 'shopZ' }])

    await deliverRoom('c1', 'cron')

    expect(pushChatSendFailed).toHaveBeenCalledTimes(1)
    expect(pushChatSendFailed.mock.calls[0][0]).toMatchObject({ shopId: 'shopZ', conversationId: 'c1' })
  })

  it('ตัวแจ้งพัง → ห้ามพาการระบายคิวล้มตาม (best-effort)', async () => {
    findMany.mockResolvedValueOnce([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue({ ...OK, externalMessageId: null, failureReason: 'boom' })
    pushChatSendFailed.mockRejectedValue(new Error('expo ล่ม'))

    await expect(deliverRoom('c1', 'after')).resolves.toBe(1)
  })
})

describe('แจ้งเตือนผู้ขาย — เส้นที่ 2: claim ค้างเกินเพดาน (stale-close ใน sweepOutbox)', () => {
  it('[blocker] แถวที่ถูกปิดเพราะ claim ค้าง → ต้องแจ้ง (เส้นนี้ไม่ผ่าน deliverHead เลย)', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000)
    findMany.mockResolvedValueOnce([queued({ id: 'stuck', conversationId: 'cX', sendLockedAt: old })])
    updateMany.mockResolvedValue({ count: 1 })
    conversationFindMany.mockResolvedValue([{ id: 'cX', shopId: 'shop9' }])

    await sweepOutbox({ owner: 'cron' })

    expect(pushChatSendFailed).toHaveBeenCalledTimes(1)
    const arg = pushChatSendFailed.mock.calls[0][0] as { conversationId: string; shopId: string; failureReason: string }
    expect(arg.conversationId).toBe('cX')
    expect(arg.shopId).toBe('shop9')
    // 🛑 เหตุผลต้องเป็นตัวที่เขียนลงแถวจริง (`UNCERTAIN_SEND_REASON`) ไม่ใช่คำกลาง ๆ ว่า
    // "ส่งไม่สำเร็จ" — คำกลาง ๆ ชวนให้กดส่งซ้ำทันทีโดยไม่ตรวจ ซึ่งเป็นทางเดียวที่เหลืออยู่ที่จะ
    // ทำให้ลูกค้าได้ข้อความซ้ำ (E-1)
    expect(arg.failureReason).toBe(UNCERTAIN_SEND_REASON)
  })

  it('[blocker] worker เจ้าของ claim ปิดแถวเองทันพอดี (count=0) → ห้ามแจ้ง (ไม่ใช่ stale จริง)', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000)
    findMany.mockResolvedValueOnce([queued({ id: 'stuck', sendLockedAt: old })])
    updateMany.mockResolvedValue({ count: 0 })
    conversationFindMany.mockResolvedValue([{ id: 'c1', shopId: 's1' }])

    await sweepOutbox({ owner: 'cron' })

    expect(pushChatSendFailed).not.toHaveBeenCalled()
  })

  it('[blocker] แถวที่ยังไม่เกินเพดาน → ไม่ถูกปิด จึงต้องไม่แจ้ง', async () => {
    findMany.mockResolvedValueOnce([queued({ id: 'fresh', sendLockedAt: new Date() })])
    updateMany.mockResolvedValue({ count: 1 })

    await sweepOutbox({ owner: 'cron' })

    expect(pushChatSendFailed).not.toHaveBeenCalled()
  })

  it('หา shopId ของห้องไม่เจอ → ไม่แจ้ง และห้ามพาการกวาดล้ม', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000)
    findMany.mockResolvedValueOnce([queued({ id: 'stuck', conversationId: 'cGhost', sendLockedAt: old })])
    updateMany.mockResolvedValue({ count: 1 })
    conversationFindMany.mockResolvedValue([])

    const res = await sweepOutbox({ owner: 'cron' })

    expect(res.stale).toBe(1)
    expect(pushChatSendFailed).not.toHaveBeenCalled()
  })
})

describe('แจ้งเตือนผู้ขาย — ตอนเข้าคิวยังไม่ใช่ความล้มเหลว', () => {
  it('[blocker] enqueueOutbound สำเร็จ → ห้ามแจ้ง (แถวยัง QUEUED ยังไม่มีอะไรล้ม)', async () => {
    await enqueueOutbound({ conversationId: 'c1', actorUserId: 'u1', text: 'สวัสดี' })

    expect(pushChatSendFailed).not.toHaveBeenCalled()
  })

  it('[blocker] ด่านตอนกดส่งปฏิเสธ (เพจถูกถอด) → ห้ามแจ้ง ผู้ขายเห็น error ตรงหน้าอยู่แล้ว', async () => {
    // noti มีไว้สำหรับความล้มเหลวที่เกิด **หลังจากผู้ขายเดินจากจอไปแล้ว** — ยิงตอนที่เขายังถือมือถือ
    // อยู่และเพิ่งเห็นข้อความ error เต็ม ๆ คือการสอนให้เขาเมิน noti ชนิดนี้
    resolveOutboundContext.mockResolvedValue({
      id: 'c1',
      channel: 'MESSENGER',
      shopId: 's1',
      shopChannel: { status: 'REVOKED' },
      externalContact: { isBlocked: false },
    })

    await expect(
      enqueueOutbound({ conversationId: 'c1', actorUserId: 'u1', text: 'สวัสดี' }),
    ).rejects.toThrow()
    expect(pushChatSendFailed).not.toHaveBeenCalled()
  })
})
