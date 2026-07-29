/**
 * auto-reply.service.test.ts — unit tests ของคิว + processor (feature 00023, S-07)
 *
 * นี่คือจุดที่ "ตอบซ้ำ" จะเกิดถ้าทำพลาด test จึงเน้น 3 เรื่อง:
 * - enqueue ต้องไม่ throw ทุกกรณี (พังแล้ว webhook ทั้ง batch ล้ม -> Meta retry -> บานปลาย)
 * - claim ต้องได้คนเดียวเมื่อแข่งกัน
 * - ลำดับ gate โดยเฉพาะ "โหมดทดสอบต้องอยู่ก่อนงานที่มีต้นทุน" (AC-021-09)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  autoReplyJob: { create: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  autoReplyKeyword: { findMany: vi.fn() },
  autoReplyRule: { findMany: vi.fn() },
  autoReplyLog: { findFirst: vi.fn() },
  chatMessage: { findUnique: vi.fn(), findFirst: vi.fn() },
  conversation: { findFirst: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

vi.mock('@/services/auto-reply-config.service', () => ({ getConfig: vi.fn() }))
vi.mock('@/services/auto-reply-log.service', () => ({ writeLog: vi.fn() }))
vi.mock('@/services/auto-reply-send.service', () => ({ sendAutoReply: vi.fn() }))
vi.mock('@/services/auto-reply-match.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/auto-reply-match.service')>(
    '@/services/auto-reply-match.service',
  )
  return { ...actual, matchKeywords: vi.fn(), resolveRule: vi.fn() }
})

import { invalidateShop } from '@/lib/auto-reply-cache'
import { getConfig } from '@/services/auto-reply-config.service'
import { writeLog } from '@/services/auto-reply-log.service'
import { sendAutoReply } from '@/services/auto-reply-send.service'
import { matchKeywords, resolveRule } from '@/services/auto-reply-match.service'
import {
  enqueueAutoReplyJob,
  claimJob,
  processJob,
  sweepStuckJobs,
} from '@/services/auto-reply.service'

const getConfigM = vi.mocked(getConfig)
const writeLogM = vi.mocked(writeLog)
const sendM = vi.mocked(sendAutoReply)
const matchM = vi.mocked(matchKeywords)
const resolveM = vi.mocked(resolveRule)

const JOB = 'job-1'
const SHOP = 'shop-1'
const CONV = 'conv-1'
const MSG = 'msg-1'

function config(over: Record<string, unknown> = {}) {
  return {
    isEnabled: true, testMode: false, testModeExpiresAt: null,
    keywordCooldownSec: 0, maxRepliesPerConversation: 10,
    pendingJobCount: 0, failedJobCount: 0, ...over,
  } as never
}

function conversation(over: Record<string, unknown> = {}) {
  return {
    id: CONV, isSpam: false, handoffAt: null, autoReplyEnabled: null,
    autoReplyTestEnabled: false, autoReplyPausedUntil: null, autoReplyCount: 0,
    shopChannelId: 'ch-1', contextProductId: null, referralAdId: null, ...over,
  }
}

/** ตั้งค่าให้ทุก gate ผ่านจนถึงการส่ง */
function happyPath() {
  db.autoReplyJob.updateMany.mockResolvedValue({ count: 1 })
  db.autoReplyJob.findUnique.mockResolvedValue({
    id: JOB, chatMessageId: MSG, conversationId: CONV, shopId: SHOP, attempts: 1,
  })
  db.chatMessage.findUnique.mockResolvedValue({ body: 'สนใจครับ', senderRole: 'BUYER', autoReplyKind: null })
  db.conversation.findFirst.mockResolvedValue(conversation())
  db.autoReplyKeyword.findMany.mockResolvedValue([])
  db.autoReplyRule.findMany.mockResolvedValue([])
  getConfigM.mockResolvedValue(config())
  matchM.mockReturnValue({
    winner: { keywordId: 'kw-1', keywordName: 'สนใจ', priority: 100, matchType: 'CONTAINS', matchedPhrase: 'สนใจ', matchedPhraseNormalized: 'สนใจ', matchedLength: 4, bestSpecificity: 0 },
    matchTrace: { winner: null, criterion: null, losers: [] },
  } as never)
  resolveM.mockReturnValue({
    rule: { id: 'r-1', replyText: 'ราคา 590 บาทค่ะ' }, resolutionLevel: 'KEYWORD_DEFAULT', fallbackFrom: [],
  } as never)
  sendM.mockResolvedValue({ sent: true, messageId: 'out-1', attempts: 1 })
  db.autoReplyJob.update.mockResolvedValue({})
  db.conversation.update.mockResolvedValue({})
}

beforeEach(() => {
  vi.clearAllMocks()
  // cache ของ ruleSet อยู่บน globalThis และอยู่ข้าม test — ถ้าไม่ล้าง assertion อย่าง
  // "ต้องไม่โหลดกฎ" (AC-021-09) จะผ่านแบบหลอก ๆ เพราะ test ก่อนหน้าอุ่น cache ไว้ให้แล้ว
  invalidateShop(SHOP)
  db.autoReplyLog.findFirst.mockResolvedValue(null)
})

describe('enqueueAutoReplyJob — ห้าม throw ทุกกรณี (TD-008)', () => {
  const base = { chatMessageId: MSG, conversationId: CONV, shopId: SHOP, senderRole: 'BUYER', hasCustomerText: true }

  it('ข้อความปกติ -> สร้างงาน', async () => {
    db.autoReplyJob.create.mockResolvedValue({ id: JOB })
    await expect(enqueueAutoReplyJob(base)).resolves.toMatchObject({ enqueued: true, jobId: JOB })
  })

  it('ข้อความฝั่งร้าน -> ไม่สร้างงาน (BR-AR-22)', async () => {
    const r = await enqueueAutoReplyJob({ ...base, senderRole: 'SHOP' })
    expect(r).toMatchObject({ enqueued: false, reason: 'OUTBOUND_MESSAGE' })
    expect(db.autoReplyJob.create).not.toHaveBeenCalled()
  })

  it('[TD-007] ไม่มีข้อความจริงจากลูกค้า (รูป/สติกเกอร์/ตำแหน่ง) -> ไม่สร้างงาน', async () => {
    const r = await enqueueAutoReplyJob({ ...base, hasCustomerText: false })
    expect(r).toMatchObject({ enqueued: false, reason: 'NO_CUSTOMER_TEXT' })
    // ถ้าปล่อยผ่าน placeholder อย่าง "[ลูกค้าส่งรูปภาพ...]" จะไป match กลุ่มคำ "รูป" ของร้าน
    expect(db.autoReplyJob.create).not.toHaveBeenCalled()
  })

  it('ชน unique (Meta ส่งซ้ำ) -> ไม่ throw คืน DUPLICATE_JOB', async () => {
    db.autoReplyJob.create.mockRejectedValue(new Error('Unique constraint failed P2002'))
    await expect(enqueueAutoReplyJob(base)).resolves.toMatchObject({ enqueued: false, reason: 'DUPLICATE_JOB' })
  })

  it('DB ล่ม -> ยังไม่ throw (ไม่งั้น webhook ทั้ง batch ล้มแล้ว Meta retry ทั้งก้อน)', async () => {
    db.autoReplyJob.create.mockRejectedValue(new Error('P1001 connection refused'))
    await expect(enqueueAutoReplyJob(base)).resolves.toMatchObject({ enqueued: false, reason: 'ENQUEUE_FAILED' })
  })
})

describe('claimJob — atomic', () => {
  it('คว้าได้ -> true และใช้ conditional updateMany ที่มี status PENDING ใน where', async () => {
    db.autoReplyJob.updateMany.mockResolvedValue({ count: 1 })
    await expect(claimJob(JOB, 'after')).resolves.toBe(true)
    expect(db.autoReplyJob.updateMany.mock.calls[0]![0].where).toMatchObject({ id: JOB, status: 'PENDING' })
  })

  it('คนอื่นคว้าไปแล้ว (count=0) -> false', async () => {
    db.autoReplyJob.updateMany.mockResolvedValue({ count: 0 })
    await expect(claimJob(JOB, 'sweeper')).resolves.toBe(false)
  })

  it('คว้าไม่ได้ -> processJob ออกทันที ไม่แตะอะไรต่อ (กันตอบซ้ำจาก worker 2 ตัว)', async () => {
    db.autoReplyJob.updateMany.mockResolvedValue({ count: 0 })
    await processJob(JOB)
    expect(db.autoReplyJob.findUnique).not.toHaveBeenCalled()
    expect(sendM).not.toHaveBeenCalled()
  })
})

describe('ลำดับ gate (PRD §4.3)', () => {
  beforeEach(happyPath)

  it('ร้านปิด -> SHOP_DISABLED ไม่ส่ง', async () => {
    getConfigM.mockResolvedValue(config({ isEnabled: false }))
    await processJob(JOB)
    expect(sendM).not.toHaveBeenCalled()
    expect(writeLogM.mock.calls[0]![0]).toMatchObject({ decision: 'SKIPPED', skipReason: 'SHOP_DISABLED' })
  })

  it('เธรดปิดเอง แม้ร้านเปิด -> CONVERSATION_DISABLED', async () => {
    db.conversation.findFirst.mockResolvedValue(conversation({ autoReplyEnabled: false }))
    await processJob(JOB)
    expect(writeLogM.mock.calls[0]![0]).toMatchObject({ skipReason: 'CONVERSATION_DISABLED' })
  })

  it('[AC-021-09] โหมดทดสอบ + เธรดนอก allowlist -> หยุดก่อนโหลดกฎและก่อน match', async () => {
    getConfigM.mockResolvedValue(config({ testMode: true }))
    await processJob(JOB)

    expect(writeLogM.mock.calls[0]![0]).toMatchObject({ skipReason: 'NOT_IN_TEST_ALLOWLIST' })
    // ต้นทุนที่ต้องไม่ถูกจ่าย
    expect(db.autoReplyKeyword.findMany).not.toHaveBeenCalled()
    expect(matchM).not.toHaveBeenCalled()
    expect(sendM).not.toHaveBeenCalled()
  })

  it('โหมดทดสอบ + เธรดอยู่ใน allowlist -> ไปต่อและติดธง isTest', async () => {
    getConfigM.mockResolvedValue(config({ testMode: true }))
    db.conversation.findFirst.mockResolvedValue(conversation({ autoReplyTestEnabled: true }))
    await processJob(JOB)
    expect(sendM.mock.calls[0]![0]).toMatchObject({ isTest: true })
  })

  it('เธรดสแปม -> SPAM', async () => {
    db.conversation.findFirst.mockResolvedValue(conversation({ isSpam: true }))
    await processJob(JOB)
    expect(writeLogM.mock.calls[0]![0]).toMatchObject({ skipReason: 'SPAM' })
  })

  it('พนักงานเพิ่งตอบ -> PAUSED_HUMAN_TAKEOVER', async () => {
    db.conversation.findFirst.mockResolvedValue(
      conversation({ autoReplyPausedUntil: new Date(Date.now() + 60_000) }),
    )
    await processJob(JOB)
    expect(writeLogM.mock.calls[0]![0]).toMatchObject({ skipReason: 'PAUSED_HUMAN_TAKEOVER' })
    expect(sendM).not.toHaveBeenCalled()
  })

  it('ครบเพดานต่อเธรด -> ส่งต่อพนักงาน (ไม่ใช่แค่เงียบ)', async () => {
    db.conversation.findFirst.mockResolvedValue(conversation({ autoReplyCount: 10 }))
    await processJob(JOB)
    expect(db.conversation.update.mock.calls[0]![0].data).toMatchObject({ handoffReason: 'MAX_REPLIES_REACHED' })
    expect(writeLogM.mock.calls[0]![0]).toMatchObject({ decision: 'HANDOFF' })
  })

  it('cooldown กลุ่มคำเดิม -> KEYWORD_COOLDOWN', async () => {
    getConfigM.mockResolvedValue(config({ keywordCooldownSec: 300 }))
    db.autoReplyLog.findFirst.mockResolvedValue({ id: 'prev' })
    await processJob(JOB)
    expect(writeLogM.mock.calls[0]![0]).toMatchObject({ skipReason: 'KEYWORD_COOLDOWN' })
    expect(sendM).not.toHaveBeenCalled()
  })

  it('ไม่ match กลุ่มคำใด -> HANDOFF ไม่เดาคำตอบ (BR-AR-08)', async () => {
    matchM.mockReturnValue({ winner: null, matchTrace: { winner: null, criterion: null, losers: [] } } as never)
    resolveM.mockReturnValue({ rule: null, resolutionLevel: 'NONE', fallbackFrom: [] } as never)
    await processJob(JOB)
    expect(sendM).not.toHaveBeenCalled()
    expect(writeLogM.mock.calls[0]![0]).toMatchObject({ decision: 'HANDOFF', skipReason: 'NO_KEYWORD_MATCH' })
  })
})

describe('ส่งสำเร็จ / ล้มเหลว', () => {
  beforeEach(happyPath)

  it('ส่งสำเร็จ -> นับเพิ่มและบันทึก REPLIED', async () => {
    await processJob(JOB)
    expect(db.conversation.update.mock.calls[0]![0].data).toMatchObject({ autoReplyCount: { increment: 1 } })
    expect(writeLogM.mock.calls[0]![0]).toMatchObject({ decision: 'REPLIED', outboundMessageId: 'out-1' })
  })

  it('ส่งไม่สำเร็จแต่ยังไม่ครบโควตา -> คืนงานเป็น PENDING ให้ชั้นถัดไปรับต่อ', async () => {
    db.autoReplyJob.findUnique.mockResolvedValue({ id: JOB, chatMessageId: MSG, conversationId: CONV, shopId: SHOP, attempts: 1 })
    sendM.mockResolvedValue({ sent: false, reason: 'SEND_FAILED', error: 'ETIMEDOUT', attempts: 3 })
    await processJob(JOB)
    expect(db.autoReplyJob.update.mock.calls.at(-1)![0].data).toMatchObject({ status: 'PENDING' })
  })

  it('ล้มเหลวครบโควตา -> FAILED + ส่งต่อพนักงาน (AC-023-04)', async () => {
    db.autoReplyJob.findUnique.mockResolvedValue({ id: JOB, chatMessageId: MSG, conversationId: CONV, shopId: SHOP, attempts: 3 })
    sendM.mockResolvedValue({ sent: false, reason: 'SEND_FAILED', error: 'ETIMEDOUT', attempts: 3 })
    await processJob(JOB)
    expect(db.autoReplyJob.update.mock.calls.at(-1)![0].data).toMatchObject({ status: 'FAILED' })
    expect(db.conversation.update).toHaveBeenCalled()
  })
})

describe('sweepStuckJobs — ห้ามทำให้ตอบซ้ำ (AC-017-03)', () => {
  it('งานค้าง PROCESSING ที่ส่งไปแล้ว -> ปิดเป็น DONE ไม่ประมวลผลซ้ำ', async () => {
    db.autoReplyJob.findMany.mockResolvedValue([
      { id: JOB, status: 'PROCESSING', conversationId: CONV, lockedAt: new Date(Date.now() - 10 * 60_000) },
    ])
    db.chatMessage.findFirst.mockResolvedValue({ id: 'already-sent' })
    db.autoReplyJob.update.mockResolvedValue({})

    const r = await sweepStuckJobs({ shopId: SHOP })

    expect(r.closedAlreadySent).toBe(1)
    expect(db.autoReplyJob.update.mock.calls[0]![0].data).toMatchObject({ status: 'DONE' })
    // สำคัญ: ต้องไม่พยายามส่งใหม่
    expect(sendM).not.toHaveBeenCalled()
  })

  it('งานค้าง PROCESSING ที่ยังไม่ได้ส่ง -> คืนเป็น PENDING แล้วประมวลผลใหม่', async () => {
    db.autoReplyJob.findMany.mockResolvedValue([
      { id: JOB, status: 'PROCESSING', conversationId: CONV, lockedAt: new Date(Date.now() - 10 * 60_000) },
    ])
    db.chatMessage.findFirst.mockResolvedValue(null)
    db.autoReplyJob.update.mockResolvedValue({})
    db.autoReplyJob.updateMany.mockResolvedValue({ count: 0 }) // claim ไม่ได้ในรอบนี้ ไม่เป็นไร

    const r = await sweepStuckJobs({})

    expect(db.autoReplyJob.update.mock.calls[0]![0].data).toMatchObject({ status: 'PENDING' })
    expect(r.recovered).toBe(1)
  })
})
