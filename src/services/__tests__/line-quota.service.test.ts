import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// (S-9, feature 00025 TFR-LINE-07/TD-006) — mock prisma แบบเดียวกับ channel-chat-line-outbound.test.ts
const db = vi.hoisted(() => ({
  shopChannel: { update: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const adapter = vi.hoisted(() => ({ fetchLineQuota: vi.fn() }))
vi.mock('@/lib/channels/line-adapter', () => ({ fetchLineQuota: adapter.fetchLineQuota }))

// accessTokenEnc ในเทสเป็นสตริงปลอม — mock decryptToken กันชน CHANNEL_TOKEN_MALFORMED
vi.mock('@/lib/token-crypto', () => ({ decryptToken: vi.fn().mockReturnValue('line-token-plain') }))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'd'.repeat(64)
})

import {
  getLineQuota,
  getLineQuotaByChannelId,
  noteLinePushConsumed,
  invalidateLineQuota,
} from '@/services/line-quota.service'
import { QUOTA_TTL_MS } from '@/lib/line/constants'

const now = 1_800_000_000_000

function channel(overrides: Partial<Parameters<typeof getLineQuota>[0]> = {}) {
  return {
    id: 'ch1',
    accessTokenEnc: 'enc',
    quotaValue: null as number | null,
    quotaUsed: null as number | null,
    quotaFetchedAt: null as Date | null,
    ...overrides,
  }
}

describe('getLineQuota (S-9, TFR-LINE-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.shopChannel.update.mockResolvedValue({})
    db.shopChannel.updateMany.mockResolvedValue({ count: 1 })
  })

  it('[blocker] TC-13: cache ยังไม่หมดอายุ → ไม่ยิง LINE ซ้ำ', async () => {
    const snap = await getLineQuota(
      channel({ quotaValue: 300, quotaUsed: 52, quotaFetchedAt: new Date(now - 60_000) }),
      { now },
    )
    expect(adapter.fetchLineQuota).not.toHaveBeenCalled()
    expect(snap).toMatchObject({ type: 'limited', total: 300, used: 52, remaining: 248, stale: false, level: 'OK' })
  })

  it('cache หมดอายุ → ยิง LINE ใหม่แล้วเขียนค่าลงแถว', async () => {
    adapter.fetchLineQuota.mockResolvedValue({ kind: 'LIMITED', total: 500, used: 450 })
    const snap = await getLineQuota(
      channel({ quotaValue: 300, quotaUsed: 52, quotaFetchedAt: new Date(now - QUOTA_TTL_MS - 1) }),
      { now },
    )
    expect(adapter.fetchLineQuota).toHaveBeenCalledTimes(1)
    expect(db.shopChannel.update).toHaveBeenCalledWith({
      where: { id: 'ch1' },
      data: { quotaValue: 500, quotaUsed: 450, quotaFetchedAt: new Date(now) },
    })
    expect(snap).toMatchObject({ total: 500, used: 450, remaining: 50, stale: false, level: 'LOW' })
  })

  it('แพ็กเกจไม่จำกัด → เก็บ quotaValue = null แต่ยังปั๊ม quotaFetchedAt (ต้องแยกจาก "ไม่เคยอ่าน")', async () => {
    adapter.fetchLineQuota.mockResolvedValue({ kind: 'UNLIMITED' })
    const snap = await getLineQuota(channel(), { now })
    expect(db.shopChannel.update).toHaveBeenCalledWith({
      where: { id: 'ch1' },
      data: { quotaValue: null, quotaUsed: null, quotaFetchedAt: new Date(now) },
    })
    expect(snap).toMatchObject({ type: 'unlimited', remaining: null, level: 'UNLIMITED', stale: false })
  })

  it('[blocker] อ่าน cache ที่เป็น "ไม่จำกัด" กลับมาถูก (quotaValue=null แต่มี quotaFetchedAt)', async () => {
    // mutation: ให้ readFromCache ตัดสินจาก quotaValue ตัวเดียว → ข้อนี้กลายเป็น UNKNOWN ทันที
    const snap = await getLineQuota(channel({ quotaFetchedAt: new Date(now - 1000) }), { now })
    expect(adapter.fetchLineQuota).not.toHaveBeenCalled()
    expect(snap).toMatchObject({ type: 'unlimited', level: 'UNLIMITED', stale: false })
  })

  it('[blocker] TC-14: LINE ล่ม + มีค่าเก่า → คืนค่าเก่าพร้อม stale:true (ไม่โยน error)', async () => {
    adapter.fetchLineQuota.mockRejectedValue(new Error('LINE 500'))
    const snap = await getLineQuota(
      channel({ quotaValue: 300, quotaUsed: 52, quotaFetchedAt: new Date(now - QUOTA_TTL_MS - 1) }),
      { now },
    )
    expect(snap).toMatchObject({ type: 'limited', remaining: 248, stale: true, level: 'OK' })
    expect(db.shopChannel.update).not.toHaveBeenCalled()
  })

  it('[blocker] TC-14: LINE ล่ม + ไม่เคยมีค่าเลย → unknown/stale ไม่ใช่ "โควตาหมด"', async () => {
    // mutation: ให้ catch คืน level 'EXHAUSTED' → ข้อนี้แดง (และการส่งจะถูกบล็อกทั้งระบบตอน LINE ล่ม)
    adapter.fetchLineQuota.mockRejectedValue(new Error('LINE 500'))
    const snap = await getLineQuota(channel(), { now })
    expect(snap).toMatchObject({ type: 'unknown', total: null, remaining: null, level: 'UNKNOWN', stale: true })
  })

  it('เขียน cache ไม่สำเร็จ ต้องไม่ทำให้การอ่านล้ม (เป็นงานบัญชีข้างเคียง)', async () => {
    adapter.fetchLineQuota.mockResolvedValue({ kind: 'LIMITED', total: 100, used: 10 })
    db.shopChannel.update.mockRejectedValue(new Error('db down'))
    await expect(getLineQuota(channel(), { now })).resolves.toMatchObject({ remaining: 90, stale: false })
  })

  it('forceRefresh ข้าม cache ที่ยังสด', async () => {
    adapter.fetchLineQuota.mockResolvedValue({ kind: 'LIMITED', total: 100, used: 1 })
    await getLineQuota(channel({ quotaValue: 300, quotaUsed: 52, quotaFetchedAt: new Date(now) }), {
      now,
      forceRefresh: true,
    })
    expect(adapter.fetchLineQuota).toHaveBeenCalledTimes(1)
  })
})

describe('getLineQuotaByChannelId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.shopChannel.update.mockResolvedValue({})
  })

  it('[blocker] scope provider LINE ไว้ใน WHERE — ช่องทางอื่นไม่มีสิทธิ์เข้ามาถึงเส้นทางนี้', async () => {
    db.shopChannel.findFirst.mockResolvedValue({
      id: 'ch1',
      accessTokenEnc: 'enc',
      quotaValue: 300,
      quotaUsed: 52,
      quotaFetchedAt: new Date(now - 1000),
    })

    const snap = await getLineQuotaByChannelId('ch1', { now })

    expect(db.shopChannel.findFirst).toHaveBeenCalledWith({
      where: { id: 'ch1', provider: 'LINE' },
      select: { id: true, accessTokenEnc: true, quotaValue: true, quotaUsed: true, quotaFetchedAt: true },
    })
    expect(snap).toMatchObject({ remaining: 248, level: 'OK' })
  })

  it('ไม่พบแถว (หรือไม่ใช่ LINE) → null ไม่ throw', async () => {
    db.shopChannel.findFirst.mockResolvedValue(null)
    await expect(getLineQuotaByChannelId('ch-nope')).resolves.toBeNull()
  })
})

describe('noteLinePushConsumed / invalidateLineQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.shopChannel.update.mockResolvedValue({})
    db.shopChannel.updateMany.mockResolvedValue({ count: 1 })
  })

  it('[blocker] นับเพิ่มเฉพาะแถวที่เคยอ่านโควตาสำเร็จแล้ว (ห้ามสร้างตัวเลขขึ้นมาเอง)', async () => {
    await noteLinePushConsumed('ch1')
    expect(db.shopChannel.updateMany).toHaveBeenCalledWith({
      where: { id: 'ch1', quotaValue: { not: null }, quotaUsed: { not: null } },
      data: { quotaUsed: { increment: 1 } },
    })
  })

  it('นับไม่สำเร็จต้องไม่โยน error (ห้ามทำให้การส่งที่สำเร็จแล้วกลายเป็นล้มเหลว)', async () => {
    db.shopChannel.updateMany.mockRejectedValue(new Error('db down'))
    await expect(noteLinePushConsumed('ch1')).resolves.toBeUndefined()
  })

  it('[blocker] invalidate ล้างแค่ quotaFetchedAt ห้ามเดาตัวเลขใหม่เอง', async () => {
    await invalidateLineQuota('ch1')
    expect(db.shopChannel.update).toHaveBeenCalledWith({ where: { id: 'ch1' }, data: { quotaFetchedAt: null } })
  })

  it('invalidate ล้มเหลวต้องไม่โยน error', async () => {
    db.shopChannel.update.mockRejectedValue(new Error('db down'))
    await expect(invalidateLineQuota('ch1')).resolves.toBeUndefined()
  })
})
