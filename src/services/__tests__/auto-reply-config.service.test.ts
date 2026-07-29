/**
 * auto-reply-config.service.test.ts — unit tests (feature 00023, S-03)
 *
 * mock prisma (test env ไม่มี DB จริง) ครอบ:
 * - TFR-001: lazy default (ร้านไม่มีแถว -> คืนค่าเริ่มต้นจากโค้ด ไม่สร้างแถว)
 * - GAP-04: pendingJobCount/failedJobCount แนบมากับ getConfig เสมอ + fail-soft เมื่อ count พัง
 * - upsertConfig: adsContextHours ต้องถูกบังคับเป็น null เมื่อไม่ใช่โหมด HOURS
 * - setTestMode: ปิดโหมดทดสอบต้องล้าง testModeExpiresAt/testModeEnabledByUserId
 * - GAP-03: expireTestMode ต้องสร้าง Notification ต่อร้านที่หมดอายุ
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
      // expireTestMode ใช้ $transaction([...]) แบบ array (batch) — ไม่ใช่ callback form
      if (Array.isArray(arg)) return Promise.all(arg)
      return (arg as (tx: unknown) => unknown)(undefined)
    }),
  },
}))

import { prisma } from '@/lib/prisma'
import {
  getConfig,
  upsertConfig,
  setTestMode,
  expireTestMode,
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

describe('setTestMode', () => {
  it('เปิดโหมดทดสอบ -> เซ็ต testModeEnabledByUserId = userId', async () => {
    configUpsert.mockResolvedValue({
      isEnabled: false,
      testMode: true,
      testModeExpiresAt: new Date('2026-07-30T00:00:00Z'),
      humanTakeoverPauseMode: '2H',
      keywordCooldownSec: 300,
      maxRepliesPerConversation: 10,
      adsContextMode: 'UNTIL_RESOLVED',
      adsContextHours: null,
      handoffPhrases: [],
      updatedAt: new Date(),
    } as never)

    const expiresAt = new Date('2026-07-30T00:00:00Z')
    await setTestMode(SHOP, USER, { testMode: true, testModeExpiresAt: expiresAt })

    const call = configUpsert.mock.calls[0][0]
    expect(call.update.testMode).toBe(true)
    expect(call.update.testModeExpiresAt).toBe(expiresAt)
    expect(call.update.testModeEnabledByUserId).toBe(USER)
  })

  it('ปิดโหมดทดสอบ -> ล้าง testModeExpiresAt และ testModeEnabledByUserId เป็น null', async () => {
    configUpsert.mockResolvedValue({
      isEnabled: false,
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

    await setTestMode(SHOP, USER, { testMode: false, testModeExpiresAt: new Date() })

    const call = configUpsert.mock.calls[0][0]
    expect(call.update.testMode).toBe(false)
    expect(call.update.testModeExpiresAt).toBeNull()
    expect(call.update.testModeEnabledByUserId).toBeNull()
  })
})

describe('expireTestMode — GAP-03 (AC-021-08)', () => {
  it('ไม่มีร้านหมดอายุ -> ไม่แตะ update/notification', async () => {
    configFindMany.mockResolvedValue([] as never)
    const result = await expireTestMode(new Date('2026-07-29T12:00:00Z'))
    expect(result.expiredShopIds).toEqual([])
    expect(configUpdate).not.toHaveBeenCalled()
    expect(notificationCreate).not.toHaveBeenCalled()
  })

  it('ร้านหมดอายุ -> ปิด testMode + สร้าง Notification ให้เจ้าของร้าน (shop.userId)', async () => {
    configFindMany.mockResolvedValue([
      { id: 'cfg-1', shopId: SHOP, shop: { userId: 'owner-1' } },
    ] as never)

    const result = await expireTestMode(new Date('2026-07-29T12:00:00Z'))

    expect(result.expiredShopIds).toEqual([SHOP])
    expect(configUpdate).toHaveBeenCalledWith({
      where: { id: 'cfg-1' },
      data: { testMode: false, testModeExpiresAt: null, testModeEnabledByUserId: null },
    })
    expect(notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'owner-1', refId: SHOP }),
    })
  })

  it('WHERE ต้อง scope testMode=true และ testModeExpiresAt <= now (ไม่ post-filter)', async () => {
    configFindMany.mockResolvedValue([] as never)
    const now = new Date('2026-07-29T12:00:00Z')
    await expireTestMode(now)
    expect(configFindMany).toHaveBeenCalledWith({
      where: { testMode: true, testModeExpiresAt: { lte: now } },
      select: expect.any(Object),
    })
  })
})

// sanity: import ที่ไม่ได้ใช้ตรง ๆ แต่ยืนยันว่า module โหลดได้ไม่พัง (กัน dead import)
void prisma
