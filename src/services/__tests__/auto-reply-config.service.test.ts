/**
 * auto-reply-config.service.test.ts — unit tests (feature 00023, S-03)
 *
 * mock prisma (test env ไม่มี DB จริง) ครอบ:
 * - TFR-001: lazy default (ร้านไม่มีแถว -> คืนค่าเริ่มต้นจากโค้ด ไม่สร้างแถว)
 * - GAP-04: pendingJobCount/failedJobCount แนบมากับ getConfig เสมอ + fail-soft เมื่อ count พัง
 * - upsertConfig: adsContextHours ต้องถูกบังคับเป็น null เมื่อไม่ใช่โหมด HOURS
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { configFindUnique, configUpsert, configFindMany, configUpdate, jobCount, notificationCreate } = vi.hoisted(
  () => ({
    configFindUnique: vi.fn(),
    configUpsert: vi.fn(),
    configFindMany: vi.fn(),
    configUpdate: vi.fn(),
    jobCount: vi.fn(),
    notificationCreate: vi.fn(),
  }),
)

vi.mock('@/lib/prisma', () => ({
  prisma: {
    autoReplyConfig: {
      findUnique: configFindUnique,
      upsert: configUpsert,
      findMany: configFindMany,
      update: configUpdate,
    },
    autoReplyJob: { count: jobCount },
    notification: { create: notificationCreate },
    $transaction: vi.fn((arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg)
      return (arg as (tx: unknown) => unknown)(undefined)
    }),
  },
}))

import { prisma } from '@/lib/prisma'
import {
  getConfig,
  upsertConfig,
  DEFAULT_AUTO_REPLY_CONFIG,
} from '@/services/auto-reply-config.service'

const SHOP = 'shop-1'
const USER = 'user-1'

beforeEach(() => {
  vi.clearAllMocks()
  jobCount.mockResolvedValue(0 as never)
})

describe('getConfig — lazy default (TFR-001)', () => {
  it('ร้านไม่มีแถว -> คืนค่าเริ่มต้นจากโค้ด (ไม่เรียก upsert/create ใด ๆ)', async () => {
    configFindUnique.mockResolvedValue(null as never)
    const result = await getConfig(SHOP)
    expect(result.isEnabled).toBe(false)
    expect(result).toMatchObject(DEFAULT_AUTO_REPLY_CONFIG)
    expect(configUpsert).not.toHaveBeenCalled()
  })

  it('AC-015-01: default isEnabled ต้องเป็น false เสมอ', () => {
    expect(DEFAULT_AUTO_REPLY_CONFIG.isEnabled).toBe(false)
  })

  it('ร้านมีแถวแล้ว -> คืนค่าจาก DB ตรง ๆ', async () => {
    configFindUnique.mockResolvedValue({
      isEnabled: true,
      testMode: false,
      testModeExpiresAt: null,
      humanTakeoverPauseMode: '30M',
      keywordCooldownSec: 60,
      maxRepliesPerConversation: 5,
      adsContextMode: 'HOURS',
      adsContextHours: 24,
      handoffPhrases: ['คุยกับแอดมิน'],
      updatedAt: new Date('2026-07-29T00:00:00Z'),
    } as never)
    const result = await getConfig(SHOP)
    expect(result.isEnabled).toBe(true)
    expect(result.adsContextHours).toBe(24)
  })
})

describe('getConfig — GAP-04 pendingJobCount/failedJobCount', () => {
  it('นับจาก AutoReplyJob.status PENDING/FAILED ที่ scope shopId', async () => {
    configFindUnique.mockResolvedValue(null as never)
    jobCount.mockResolvedValueOnce(3 as never).mockResolvedValueOnce(1 as never)
    const result = await getConfig(SHOP)
    expect(result.pendingJobCount).toBe(3)
    expect(result.failedJobCount).toBe(1)
    expect(jobCount).toHaveBeenCalledWith({ where: { shopId: SHOP, status: 'PENDING' } })
    expect(jobCount).toHaveBeenCalledWith({ where: { shopId: SHOP, status: 'FAILED' } })
  })

  it('query พัง -> fail-soft คืน 0 ไม่ throw', async () => {
    configFindUnique.mockResolvedValue(null as never)
    jobCount.mockRejectedValue(new Error('db down') as never)
    const result = await getConfig(SHOP)
    expect(result.pendingJobCount).toBe(0)
    expect(result.failedJobCount).toBe(0)
  })
})

describe('upsertConfig', () => {
  it('adsContextMode != HOURS -> adsContextHours ถูกบังคับเป็น null เสมอ', async () => {
    configUpsert.mockResolvedValue({
      isEnabled: true,
      testMode: false,
      testModeExpiresAt: null,
      humanTakeoverPauseMode: '2H',
      keywordCooldownSec: 300,
      maxRepliesPerConversation: 10,
      adsContextMode: 'UNTIL_RESOLVED',
      adsContextHours: null,
      handoffPhrases: [],
      updatedAt: new Date(),
    } as never)

    await upsertConfig(SHOP, USER, {
      isEnabled: true,
      humanTakeoverPauseMode: '2H',
      keywordCooldownSec: 300,
      maxRepliesPerConversation: 10,
      adsContextMode: 'UNTIL_RESOLVED',
      adsContextHours: 999, // ค่าค้างจากโหมดก่อนหน้า — ต้องถูกล้าง
      handoffPhrases: [],
    })

    const call = configUpsert.mock.calls[0][0]
    expect(call.update.adsContextHours).toBeNull()
    expect(call.create.adsContextHours).toBeNull()
    expect(call.update.updatedByUserId).toBe(USER)
    expect(call.where).toEqual({ shopId: SHOP })
  })

  it('adsContextMode = HOURS -> เก็บ adsContextHours ตามที่ส่งมา', async () => {
    configUpsert.mockResolvedValue({
      isEnabled: true,
      testMode: false,
      testModeExpiresAt: null,
      humanTakeoverPauseMode: '2H',
      keywordCooldownSec: 300,
      maxRepliesPerConversation: 10,
      adsContextMode: 'HOURS',
      adsContextHours: 24,
      handoffPhrases: [],
      updatedAt: new Date(),
    } as never)

    await upsertConfig(SHOP, USER, {
      isEnabled: true,
      humanTakeoverPauseMode: '2H',
      keywordCooldownSec: 300,
      maxRepliesPerConversation: 10,
      adsContextMode: 'HOURS',
      adsContextHours: 24,
      handoffPhrases: [],
    })

    const call = configUpsert.mock.calls[0][0]
    expect(call.update.adsContextHours).toBe(24)
  })
})

// 🛑 describe('setTestMode') / describe('expireTestMode') ถูกลบ 2026-07-29 —
// โหมดทดสอบไม่ใช่สวิตช์ระดับร้านอีกต่อไป ย้ายไปที่ AutoReplyKeyword.status + ตารางเธรดทดสอบรายกลุ่ม
