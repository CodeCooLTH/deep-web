/**
 * TC-IAP-29 — `DID_FAIL_TO_RENEW` + `GRACE_PERIOD` ต้องยังใช้งานได้จนพ้นช่วงผ่อนผัน
 *
 * ระดับ integration เพราะ `applyAppleNotification` แตะ prisma จริง — จุดที่เคยไม่มีเทสเลย
 * (TestCase.md หมวด 3 "รอ implement")
 *
 * ต้องรันด้วย local Docker Postgres เท่านั้น (Hard Rule 13):
 *   npx dotenv -e .env -- env DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" \
 *     DIRECT_URL="..." STORAGE_DRIVER=local npx vitest run tests/integration/apple-iap-grace-period.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'

import { prisma, deleteTestData } from '../setup'
import { applyAppleNotification } from '@/services/apple-iap.service'
import type { AppleSubscriptionFacts } from '@/lib/apple/transaction'
import { TIER_TO_APPLE_PRODUCT } from '@/lib/apple/product-ids'

const userIds: string[] = []

afterEach(async () => {
  if (userIds.length > 0) {
    await prisma.businessPackageSubscription.deleteMany({ where: { ownerId: { in: userIds } } })
  }
  await deleteTestData({ userIds: [...userIds] })
  userIds.length = 0
})

/** ผู้ขายหนึ่งรายที่จ่ายผ่าน Apple อยู่แล้ว และตอนนี้สิทธิ์ยังใช้งานได้ */
async function seedAppleSubscriber(originalTransactionId: string) {
  const suffix = originalTransactionId.slice(-8)
  const user = await prisma.user.create({
    data: {
      phone: `09${suffix}`,
      displayName: `ทดสอบ ${suffix}`,
      username: `iaptest${suffix}`,
    },
  })
  userIds.push(user.id)

  await prisma.businessPackageSubscription.create({
    data: {
      ownerId: user.id,
      tier: 'GROWTH',
      status: 'ACTIVE',
      source: 'APPLE_IAP',
      appleOriginalTransactionId: originalTransactionId,
      appleProductId: TIER_TO_APPLE_PRODUCT.GROWTH,
      appleEnvironment: 'Sandbox',
      activatedAt: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      nextRenewalAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  })
  return user
}

/** ธุรกรรมที่ "หมดอายุไปแล้ว" — สภาพจริงตอน Apple เก็บเงินไม่สำเร็จ */
function expiredFacts(originalTransactionId: string): AppleSubscriptionFacts {
  return {
    tier: 'GROWTH',
    productId: TIER_TO_APPLE_PRODUCT.GROWTH,
    originalTransactionId,
    transactionId: `${originalTransactionId}-1`,
    environment: 'Sandbox',
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // หมดอายุเมื่อวาน
    revokedAt: null,
  }
}

describe('applyAppleNotification — ช่วงผ่อนผันของ Apple', () => {
  it('🛑 หมดอายุแล้วแต่ยังอยู่ในช่วงผ่อนผัน → ร้านต้อง**ไม่**ถูกล็อก', async () => {
    const otid = '2000000900000029'
    const user = await seedAppleSubscriber(otid)
    const graceEndsAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)

    await applyAppleNotification(expiredFacts(otid), graceEndsAt)

    const row = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: user.id } })
    expect(row?.status).toBe('ACTIVE')
    expect(row?.lockedAt).toBeNull()
  })

  it('พ้นช่วงผ่อนผันแล้ว → ล็อกด้วยเหตุต่ออายุไม่สำเร็จ', async () => {
    const otid = '2000000900000030'
    const user = await seedAppleSubscriber(otid)
    const graceEndedAt = new Date(Date.now() - 60 * 60 * 1000)

    await applyAppleNotification(expiredFacts(otid), graceEndedAt)

    const row = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: user.id } })
    expect(row?.status).toBe('LOCKED_RENEWAL_FAILED')
    expect(row?.lockedAt).not.toBeNull()
  })

  it('ไม่มีช่วงผ่อนผันเลย → พฤติกรรมเดิมทุกประการ (ล็อกทันทีที่หมดอายุ)', async () => {
    const otid = '2000000900000031'
    const user = await seedAppleSubscriber(otid)

    await applyAppleNotification(expiredFacts(otid), null)

    const row = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: user.id } })
    expect(row?.status).toBe('LOCKED_RENEWAL_FAILED')
  })
})
