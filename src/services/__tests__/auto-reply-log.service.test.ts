/**
 * auto-reply-log.service.test.ts — unit tests ของ log service (feature 00023, S-05)
 *
 * mock prisma (test env ไม่มี DB จริง) ครอบ 3 เรื่องที่เป็นกฎเหล็กของ S-05:
 * - AC-024-02: decision != 'REPLIED' ต้องมี skipReason เสมอ (ไม่งั้น debug "ทำไมไม่ตอบ" ไม่ได้)
 * - PII: searchLogs ต้องไม่ปล่อยข้อความลูกค้าเต็ม ๆ / เนื้อ error ออกจาก server boundary
 * - AC-024-03: filter ต้องลงไปอยู่ใน WHERE ของ query ไม่ใช่กรองใน JS ทีหลัง
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    autoReplyLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  writeLog,
  searchLogs,
  getLogDetail,
  AutoReplyLogValidationError,
  LOG_PAGE_SIZE_MAX,
} from '@/services/auto-reply-log.service'

const create = vi.mocked(prisma.autoReplyLog.create)
const findMany = vi.mocked(prisma.autoReplyLog.findMany)
const findFirst = vi.mocked(prisma.autoReplyLog.findFirst)
const count = vi.mocked(prisma.autoReplyLog.count)

const SHOP = 'shop-1'
const CONV = 'conv-1'

beforeEach(() => {
  vi.clearAllMocks()
  create.mockResolvedValue({ id: 'log-1' } as never)
  findMany.mockResolvedValue([] as never)
  count.mockResolvedValue(0 as never)
})

describe('writeLog — บังคับ skipReason (AC-024-02)', () => {
  it('REPLIED ไม่ต้องมี skipReason', async () => {
    await expect(
      writeLog({ shopId: SHOP, conversationId: CONV, decision: 'REPLIED' }),
    ).resolves.toBeTruthy()
    expect(create).toHaveBeenCalledOnce()
  })

  it.each(['SKIPPED', 'HANDOFF', 'FAILED'] as const)(
    '%s ที่ไม่มี skipReason ต้องโยน error และห้ามเขียน DB',
    async (decision) => {
      await expect(writeLog({ shopId: SHOP, conversationId: CONV, decision })).rejects.toThrow(
        AutoReplyLogValidationError,
      )
      // สำคัญกว่าการ throw คือ "ต้องไม่มีแถวขยะถูกเขียนลงไป"
      expect(create).not.toHaveBeenCalled()
    },
  )

  it('SKIPPED ที่มี skipReason เขียนได้ และค่าถูกส่งลง DB ตรงตัว', async () => {
    await writeLog({
      shopId: SHOP,
      conversationId: CONV,
      decision: 'SKIPPED',
      skipReason: 'NOT_IN_TEST_ALLOWLIST',
    })
    expect(create.mock.calls[0]![0].data).toMatchObject({
      decision: 'SKIPPED',
      skipReason: 'NOT_IN_TEST_ALLOWLIST',
    })
  })

  it('isTest ไม่ระบุ = false (ค่าเริ่มต้นต้องปลอดภัย ไม่ใช่ถือว่าเป็นการทดสอบ)', async () => {
    await writeLog({ shopId: SHOP, conversationId: CONV, decision: 'REPLIED' })
    expect(create.mock.calls[0]![0].data.isTest).toBe(false)
  })
})

describe('searchLogs — กัน PII ออกจาก server boundary', () => {
  const longText = 'ก'.repeat(300)

  beforeEach(() => {
    findMany.mockResolvedValue([
      {
        id: 'log-1',
        createdAt: new Date('2026-07-29T00:00:00Z'),
        conversationId: CONV,
        decision: 'REPLIED',
        skipReason: null,
        resolutionLevel: 'KEYWORD_PAGE_AD',
        keywordId: 'kw-1',
        matchedPhrase: 'สนใจ',
        matchType: 'CONTAINS',
        shopChannelId: 'ch-1',
        adId: 'ad-1',
        productId: null,
        rawText: longText,
        replyText: 'ราคา 590 บาทค่ะ',
        isTest: false,
        durationMs: 120,
        errorMessage: 'connection reset by peer',
      },
    ] as never)
    count.mockResolvedValue(1 as never)
  })

  it('ไม่คืนข้อความลูกค้าเต็ม — ตัดสั้นเท่านั้น', async () => {
    const { items } = await searchLogs(SHOP)
    expect(items[0]!.messagePreview!.length).toBeLessThan(longText.length)
    // ต้องไม่มี field ชื่อ rawText หลุดออกไปในรูปที่ส่งข้าม boundary
    expect(items[0]).not.toHaveProperty('rawText')
  })

  it('ไม่คืนเนื้อ error ออกไป — บอกแค่ว่ามีหรือไม่มี', async () => {
    const { items } = await searchLogs(SHOP)
    expect(items[0]!.hasError).toBe(true)
    expect(items[0]).not.toHaveProperty('errorMessage')
    expect(JSON.stringify(items[0])).not.toContain('connection reset')
  })
})

describe('searchLogs — filter ต้องลงไปใน WHERE (AC-024-03)', () => {
  it('shopId อยู่ใน WHERE เสมอแม้ไม่ส่ง filter อะไรเลย', async () => {
    await searchLogs(SHOP)
    expect(findMany.mock.calls[0]![0]!.where).toMatchObject({ shopId: SHOP })
  })

  it.each([
    ['conversationId', { conversationId: 'c-9' }, { conversationId: 'c-9' }],
    ['adId', { adId: 'ad-9' }, { adId: 'ad-9' }],
    ['keywordId', { keywordId: 'kw-9' }, { keywordId: 'kw-9' }],
    ['decision', { decision: 'SKIPPED' as const }, { decision: 'SKIPPED' }],
    ['isTest', { isTest: true }, { isTest: true }],
  ])('filter %s ถูกส่งลง WHERE', async (_name, filter, expected) => {
    await searchLogs(SHOP, filter)
    expect(findMany.mock.calls[0]![0]!.where).toMatchObject({ shopId: SHOP, ...expected })
  })

  it('externalContactId กรองผ่าน relation ไม่ใช่ดึงมากรองใน JS', async () => {
    await searchLogs(SHOP, { externalContactId: 'ct-1' })
    expect(findMany.mock.calls[0]![0]!.where).toMatchObject({
      conversation: { externalContactId: 'ct-1' },
    })
  })

  it('hasError=true แปลงเป็นเงื่อนไข errorMessage not null', async () => {
    await searchLogs(SHOP, { hasError: true })
    expect(findMany.mock.calls[0]![0]!.where).toMatchObject({ errorMessage: { not: null } })
  })

  it('ช่วงวันที่ลงไปเป็น gte/lte', async () => {
    const from = new Date('2026-07-01T00:00:00Z')
    const to = new Date('2026-07-31T00:00:00Z')
    await searchLogs(SHOP, { from, to })
    expect(findMany.mock.calls[0]![0]!.where).toMatchObject({ createdAt: { gte: from, lte: to } })
  })

  it('pageSize ถูก clamp ไม่ให้ลากทั้งตาราง', async () => {
    await searchLogs(SHOP, { pageSize: 100000 })
    expect(findMany.mock.calls[0]![0]!.take).toBe(LOG_PAGE_SIZE_MAX)
  })

  it('page ต่ำกว่า 1 ถูกดันกลับเป็น 1 (skip ต้องไม่ติดลบ)', async () => {
    await searchLogs(SHOP, { page: -5 })
    expect(findMany.mock.calls[0]![0]!.skip).toBe(0)
  })
})

describe('getLogDetail — ownership อยู่ใน WHERE', () => {
  it('ใช้ findFirst ที่มี shopId ใน where ไม่ใช่ findUnique แล้วเช็คทีหลัง', async () => {
    findFirst.mockResolvedValue(null as never)
    await getLogDetail(SHOP, 'log-9')
    // findUnique + เช็คเจ้าของทีหลัง = ข้อมูลถูก serialize เข้า RSC flight ไปแล้วก่อน redirect
    expect(findFirst).toHaveBeenCalledOnce()
    expect(findFirst.mock.calls[0]![0]!.where).toMatchObject({ id: 'log-9', shopId: SHOP })
  })
})
