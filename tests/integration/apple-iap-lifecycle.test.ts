/**
 * TC-IAP-25 · 27 · 28 · 31 — วงจรชีวิตของใบที่จ่ายผ่าน Apple
 *
 * เดิมหมวดนี้อยู่ใน "รอ implement" ของ TestCase.md ด้วยเหตุผลว่า **แตะ prisma**
 * ⇒ ยกมาไว้ชั้น integration กับ local Postgres จริง ไม่ต้อง mock อะไรเลย
 *
 * 🛑 เทสชุดนี้เป็น characterization test — พิสูจน์ว่าโค้ดที่เขียนไว้แล้วทำตาม BRD จริง
 * (ต่างจาก TC-IAP-29 ที่เขียนเทสก่อนแล้วโค้ดค่อยตามมา เพราะตอนนั้นยังไม่มีของ)
 *
 * ต้องรันด้วย local Docker Postgres เท่านั้น (Hard Rule 13)
 */
import { describe, it, expect, afterEach } from 'vitest'

import { prisma, deleteTestData } from '../setup'
import { linkAppleSubscription, applyAppleNotification } from '@/services/apple-iap.service'
import type { AppleSubscriptionFacts } from '@/lib/apple/transaction'
import { TIER_TO_APPLE_PRODUCT } from '@/lib/apple/product-ids'

/* รหัสสินค้าจริงจาก product-ids.ts — ห้าม hardcode สตริงมั่ว เพราะเทสอื่นที่เดินผ่าน
   `readAppleSubscription` จะปฏิเสธทันทีถ้าสะกดไม่ตรง (fail-closed) */
const PRODUCT_ID = TIER_TO_APPLE_PRODUCT.GROWTH
const userIds: string[] = []

afterEach(async () => {
  if (userIds.length > 0) {
    await prisma.businessPackageSubscription.deleteMany({ where: { ownerId: { in: userIds } } })
  }
  await deleteTestData({ userIds: [...userIds] })
  userIds.length = 0
})

async function makeUser(seed: string) {
  const user = await prisma.user.create({
    data: { phone: `08${seed}`, displayName: `ทดสอบ ${seed}`, username: `iapl${seed}` },
  })
  userIds.push(user.id)
  return user
}

function facts(originalTransactionId: string, over: Partial<AppleSubscriptionFacts> = {}): AppleSubscriptionFacts {
  return {
    tier: 'GROWTH',
    productId: PRODUCT_ID,
    originalTransactionId,
    transactionId: `${originalTransactionId}-1`,
    environment: 'Sandbox',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    ...over,
  }
}

describe('TC-IAP-25 — 1 การสมัครของ Apple ผูกได้บัญชีเดียว (BR-IAP-04)', () => {
  it('🛑 `originalTransactionId` เดิม + เจ้าของใหม่ → ปฏิเสธ ไม่ย้ายสิทธิ์', async () => {
    const otid = '2000000900000025'
    const first = await makeUser('90000251')
    const second = await makeUser('90000252')

    const ok = await linkAppleSubscription(first.id, facts(otid))
    expect(ok.ok).toBe(true)

    const stolen = await linkAppleSubscription(second.id, facts(otid))
    expect(stolen.ok).toBe(false)
    if (!stolen.ok) expect(stolen.reason).toBe('TRANSACTION_OWNED_BY_ANOTHER_ACCOUNT')

    /* คนแรกต้องยังถือสิทธิ์อยู่ครบ — การถูกแย่งไม่ควรทำให้ของเดิมเสียหาย */
    const kept = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: first.id } })
    expect(kept?.appleOriginalTransactionId).toBe(otid)
    expect(await prisma.businessPackageSubscription.count({ where: { ownerId: second.id } })).toBe(0)
  })
})

describe('TC-IAP-31 — ยืนยันซ้ำได้เอง (BR-IAP-11)', () => {
  it('เรียกซ้ำด้วยธุรกรรมเดิม → ผลเดิม ไม่สร้างแถวใหม่ และ `activatedAt` ไม่ขยับ', async () => {
    const otid = '2000000900000031'
    const user = await makeUser('90000311')

    const first = await linkAppleSubscription(user.id, facts(otid))
    expect(first.ok).toBe(true)
    const after1 = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: user.id } })

    const second = await linkAppleSubscription(user.id, facts(otid))
    expect(second.ok).toBe(true)
    const after2 = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: user.id } })

    expect(after2!.id).toBe(after1!.id)
    /* cohort marker — ห้ามขยับตอนต่ออายุ/ยืนยันซ้ำ */
    expect(after2!.activatedAt.getTime()).toBe(after1!.activatedAt.getTime())
  })
})

describe('TC-IAP-27 — `DID_RENEW`: Apple เป็นเจ้าของวันหมดอายุ (BR-IAP-03)', () => {
  it('🛑 `nextRenewalAt` = `expiresDate` ของ Apple เป๊ะ ไม่ใช่ +30 วันที่เราคิดเอง', async () => {
    const otid = '2000000900000027'
    const user = await makeUser('90000271')
    await linkAppleSubscription(user.id, facts(otid))

    /* รอบใหม่ที่ Apple แจ้งมา — จงใจใช้ 41 วันเพื่อให้ต่างจาก 30 วันอย่างชัดเจน */
    const appleExpiry = new Date(Date.now() + 41 * 24 * 60 * 60 * 1000)
    const outcome = await applyAppleNotification(facts(otid, { expiresAt: appleExpiry }), null)

    expect(outcome).toBe('RENEWED')
    const row = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: user.id } })
    expect(row!.nextRenewalAt.getTime()).toBe(appleExpiry.getTime())
    expect(row!.status).toBe('ACTIVE')
  })
})

describe('TC-IAP-28 — `REFUND`: คืนเงินแล้วต้องถอนสิทธิ์', () => {
  it('🛑 มี `revocationDate` → ถอนสิทธิ์ทันที **แม้วันหมดอายุยังอยู่ในอนาคต**', async () => {
    const otid = '2000000900000028'
    const user = await makeUser('90000281')
    await linkAppleSubscription(user.id, facts(otid))

    const outcome = await applyAppleNotification(facts(otid, { revokedAt: new Date() }), null)

    expect(outcome).toBe('REVOKED')
    const row = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: user.id } })
    expect(row!.status).toBe('LOCKED_RENEWAL_FAILED')
    expect(row!.lockedAt).not.toBeNull()
  })

  it('🛑 คืนเงินแล้วยังอยู่ในช่วงผ่อนผัน → ก็ยังถอนสิทธิ์ (การคืนเงินชนะช่วงผ่อนผัน)', async () => {
    const otid = '2000000900000282'
    const user = await makeUser('90000282')
    await linkAppleSubscription(user.id, facts(otid))

    const graceEndsAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
    const outcome = await applyAppleNotification(facts(otid, { revokedAt: new Date() }), graceEndsAt)

    expect(outcome).toBe('REVOKED')
    const row = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: user.id } })
    expect(row!.status).toBe('LOCKED_RENEWAL_FAILED')
  })
})

describe('TC-IAP-26 (ส่วนบริการ) — ธุรกรรมที่ยังไม่มีใครผูก', () => {
  it('webhook มาถึงก่อนเครื่องผู้ใช้ยืนยัน → `NOT_LINKED` ไม่ใช่ error', async () => {
    const outcome = await applyAppleNotification(facts('2000000900000026'), null)
    expect(outcome).toBe('NOT_LINKED')
  })
})
