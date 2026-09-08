/**
 * TC-IAP-26 (+ เส้นทางที่เหลือของ route) — `POST /api/webhooks/apple-iap`
 *
 * เทสระดับ route จริง: เรียก `POST` ที่ export ออกมาโดยตรงแบบเดียวกับ
 * `tests/integration/media-asset-commit-route.test.ts` · ฐานเป็น Postgres จริง ไม่ mock prisma
 *
 * ## สิ่งเดียวที่ mock คือ **การตรวจลายเซ็น**
 *
 * ปลอมลายเซ็นของ Apple จริง ๆ ไม่ได้ (นั่นคือประเด็นทั้งหมดของ `jws.ts`) ⇒ mock
 * `verifyAppleJws` แล้วให้ token ที่ขึ้นต้นด้วย `BAD.` เป็นตัวแทนของ "ลายเซ็นไม่ผ่าน"
 *
 * 🛑 `decodeAppleJwsWithoutVerifying` **ไม่ mock** — ปล่อยของจริงทำงาน ⇒ token ในเทส
 * จึงต้องเป็น JWS ที่ถอด base64url ได้จริง ไม่ใช่สตริงมั่ว (ไม่งั้นเทสจะผ่านทั้งที่
 * ตัวถอดของจริงพัง)
 *
 * ต้องรันด้วย local Docker Postgres เท่านั้น (Hard Rule 13)
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { prisma, deleteTestData } from '../setup'
/* 🛑 route ใช้ singleton ตัวนี้ ไม่ใช่ client ของ tests/setup — จะ spy ให้โดนต้องอ้างตัวเดียวกับ
   ที่โค้ดจริง import (บทเรียนเดียวกับหัวไฟล์ media-asset-commit-route.test.ts) */
import { prisma as appPrisma } from '@/lib/prisma'
import { SELLER_APP_BUNDLE_ID, TIER_TO_APPLE_PRODUCT } from '@/lib/apple/product-ids'

/** token ปลอมที่ "ถอดได้จริง" — header.payload.signature ตามรูปแบบ JWS */
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const makeToken = (payload: unknown) => `${b64({ alg: 'ES256' })}.${b64(payload)}.sig`
/** ตัวแทนของ "ลายเซ็นไม่ผ่าน" — ยังถอดได้ เพื่อพิสูจน์ว่าเราไม่ได้เชื่อของที่ถอดได้เฉย ๆ */
const makeBadToken = (payload: unknown) => `BAD.${b64(payload)}.sig`

vi.mock('@/lib/apple/jws', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apple/jws')>()
  return {
    ...actual,
    verifyAppleJws: vi.fn((token: string) => {
      if (token.startsWith('BAD.')) return { ok: false as const, reason: 'BAD_SIGNATURE' as const }
      const [, payload] = token.split('.')
      return { ok: true as const, payload: JSON.parse(Buffer.from(payload, 'base64url').toString()) }
    }),
  }
})

/* spy ที่ **ยังเรียกของจริง** — นับจำนวนครั้งได้ โดยที่ผลลัพธ์ในฐานยังเป็นของจริงทุกบรรทัด */
const applySpy = vi.hoisted(() => ({ calls: 0 }))
vi.mock('@/services/apple-iap.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/apple-iap.service')>()
  return {
    ...actual,
    applyAppleNotification: vi.fn(async (...args: Parameters<typeof actual.applyAppleNotification>) => {
      applySpy.calls++
      return actual.applyAppleNotification(...args)
    }),
  }
})

import { POST } from '@/app/api/webhooks/apple-iap/route'

const userIds: string[] = []
const uuids: string[] = []

beforeEach(() => {
  applySpy.calls = 0
})

afterEach(async () => {
  /* 🛑 ห้ามใช้ `vi.restoreAllMocks()` ที่นี่ — มันล้าง implementation ของ vi.fn ที่อยู่ใน
     `vi.mock` factory ข้างบนไปด้วย ⇒ `verifyAppleJws` กลายเป็นฟังก์ชันคืน undefined
     แล้วเทสทุกตัวที่รันหลังจากนั้นจะพังเป็นแถวโดยหาสาเหตุยาก (เจอจริงตอนเขียนไฟล์นี้)
     spy ที่ตั้งในเทสไหน ให้เทสนั้น `mockRestore()` เอง */
  if (uuids.length > 0) {
    await prisma.appleIapNotification.deleteMany({ where: { notificationUUID: { in: uuids } } })
  }
  if (userIds.length > 0) {
    await prisma.businessPackageSubscription.deleteMany({ where: { ownerId: { in: userIds } } })
  }
  await deleteTestData({ userIds: [...userIds] })
  userIds.length = 0
  uuids.length = 0
})

/** ธุรกรรมที่ผ่านทุกด่านของ `readAppleSubscription` ได้จริง */
function txPayload(over: Record<string, unknown> = {}) {
  return {
    bundleId: SELLER_APP_BUNDLE_ID,
    productId: TIER_TO_APPLE_PRODUCT.GROWTH,
    originalTransactionId: '2000000900000260',
    transactionId: '2000000900000260-1',
    environment: 'Sandbox',
    type: 'Auto-Renewable Subscription',
    inAppOwnershipType: 'PURCHASED',
    expiresDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
    ...over,
  }
}

function notification(over: Record<string, unknown> = {}, data: Record<string, unknown> = {}) {
  const uuid = (over.notificationUUID as string) ?? `uuid-${Math.random().toString(36).slice(2)}`
  uuids.push(uuid)
  return makeToken({
    notificationType: 'DID_RENEW',
    notificationUUID: uuid,
    ...over,
    data: { environment: 'Sandbox', signedTransactionInfo: makeToken(txPayload()), ...data },
  })
}

const call = (body: unknown) =>
  POST(
    new NextRequest('https://seller.deepthailand.app/api/webhooks/apple-iap', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
  )

async function seedSubscriber(originalTransactionId: string, seed: string) {
  const user = await prisma.user.create({
    data: { phone: `07${seed}`, displayName: `ทดสอบ ${seed}`, username: `iapw${seed}` },
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

describe('TC-IAP-26 — Apple ยิงซ้ำใบเดิม', () => {
  it('🛑 `notificationUUID` ซ้ำ → ตอบ 200 และ **ไม่ประมวลผลซ้ำ**', async () => {
    const signedPayload = notification({ notificationUUID: 'dup-0001' })

    const first = await call({ signedPayload })
    expect(first.status).toBe(200)
    expect(applySpy.calls).toBe(1)

    const second = await call({ signedPayload })
    expect(second.status).toBe(200)
    expect(await second.json()).toMatchObject({ duplicate: true })
    /* หัวใจของเทสนี้ — ตอบ 200 เฉย ๆ ยังไม่พอ ต้องพิสูจน์ว่าไม่ได้ลงมือรอบสอง */
    expect(applySpy.calls, 'ประมวลผลซ้ำ = ให้สิทธิ์/ล็อกร้านซ้ำโดยไม่มีใครเห็น').toBe(1)

    expect(await prisma.appleIapNotification.count({ where: { notificationUUID: 'dup-0001' } })).toBe(1)
  })

  it('คนละ UUID แต่ธุรกรรมเดียวกัน → ประมวลผลทั้งสองใบ (ต่ออายุคนละรอบ)', async () => {
    await call({ signedPayload: notification({ notificationUUID: 'seq-0001' }) })
    await call({ signedPayload: notification({ notificationUUID: 'seq-0002' }) })
    expect(applySpy.calls).toBe(2)
  })
})

describe('ด่านหน้าประตู — ของที่ไม่ควรถูกบันทึกเลย', () => {
  it('body ผิดรูป → 400 และไม่มีแถวใหม่', async () => {
    const before = await prisma.appleIapNotification.count()
    const res = await call({ nope: true })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'VALIDATION_ERROR' })
    expect(await prisma.appleIapNotification.count()).toBe(before)
  })

  it('🛑 ลายเซ็นไม่ผ่าน → 401 และ **ห้ามบันทึกเป็นเหตุการณ์จริง**', async () => {
    const before = await prisma.appleIapNotification.count()
    const res = await call({ signedPayload: makeBadToken({ notificationUUID: 'evil-0001' }) })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'INVALID_SIGNATURE' })
    /* ตอบ 200 ให้คนยิงมั่ว = บอกว่า endpoint นี้รับของ · บันทึกไว้ = ปลอมประวัติได้ */
    expect(await prisma.appleIapNotification.count()).toBe(before)
  })

  it('ไม่มี `notificationUUID` → 400 (ไม่มีกุญแจกันซ้ำ = ทำงานต่อไม่ได้)', async () => {
    const token = makeToken({ notificationType: 'DID_RENEW', data: {} })
    const res = await call({ signedPayload: token })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'MISSING_UUID' })
  })
})

describe('บันทึกก่อนลงมือ — ลำดับที่ห้ามสลับ', () => {
  it('เก็บ `originalTransactionId` ลงแถวไว้ค้นหา แม้เส้นทางให้สิทธิ์จะ verify ใหม่อยู่ดี', async () => {
    await call({ signedPayload: notification({ notificationUUID: 'idx-0001' }) })
    const row = await prisma.appleIapNotification.findUnique({ where: { notificationUUID: 'idx-0001' } })
    expect(row?.originalTransactionId).toBe('2000000900000260')
    expect(row?.notificationType).toBe('DID_RENEW')
    expect(row?.environment).toBe('Sandbox')
  })

  it('🛑 เขียนฐานไม่ได้ → 503 (เคสเดียวที่ให้ Apple ยิงซ้ำ) และไม่ลงมือ', async () => {
    /* 🛑 ห้าม `vi.spyOn` บนโมเดลของ Prisma — โมเดลเป็น proxy ⇒ spy ไปนิยาม own property ทับ
       แล้ว `mockRestore()` คืนของเดิมไม่ได้จริง `create` พังค้างยาวไปทั้งไฟล์ และเทสที่รันทีหลัง
       จะแดงเป็นแถวโดยชี้ไปผิดที่ (เจอจริงตอนเขียนไฟล์นี้ — 7 ตัวถัดไปแดงหมด)
       ⇒ สลับฟังก์ชันเองแล้วคืน reference เดิมตรง ๆ */
    const model = appPrisma.appleIapNotification as unknown as Record<string, unknown>
    const original = model.create
    model.create = async () => {
      throw new Error('db down')
    }
    try {
      const res = await call({ signedPayload: notification({ notificationUUID: 'dberr-0001' }) })
      expect(res.status).toBe(503)
      expect(await res.json()).toMatchObject({ error: 'STORE_FAILED' })
      expect(applySpy.calls).toBe(0)
    } finally {
      model.create = original
    }
  })
})

describe('คิวของตัวเดินตรวจซ้ำ — `processedAt` บอกว่าใบไหนยังค้าง', () => {
  it('ใบ `TEST` ที่ไม่มีธุรกรรมแนบมา → สำเร็จ ไม่ใช่ error', async () => {
    await call({ signedPayload: notification({ notificationType: 'TEST', notificationUUID: 'test-0001' }, { signedTransactionInfo: undefined }) })
    const row = await prisma.appleIapNotification.findUnique({ where: { notificationUUID: 'test-0001' } })
    expect(row?.error).toBeNull()
    expect(row?.processedAt).not.toBeNull()
  })

  it('ใบอื่นที่ไม่มีธุรกรรมแนบมา → ค้างคิวไว้ (`processedAt` ยังว่าง)', async () => {
    await call({ signedPayload: notification({ notificationUUID: 'notx-0001' }, { signedTransactionInfo: undefined }) })
    const row = await prisma.appleIapNotification.findUnique({ where: { notificationUUID: 'notx-0001' } })
    expect(row?.error).toBe('NO_TRANSACTION_INFO')
    expect(row?.processedAt).toBeNull()
  })

  it('ธุรกรรมลายเซ็นไม่ผ่าน → 200 (ห้ามให้ Apple ยิงไม่รู้จบ) แต่ค้างคิวไว้', async () => {
    const res = await call({
      signedPayload: notification({ notificationUUID: 'txbad-0001' }, { signedTransactionInfo: makeBadToken(txPayload()) }),
    })
    expect(res.status).toBe(200)
    const row = await prisma.appleIapNotification.findUnique({ where: { notificationUUID: 'txbad-0001' } })
    expect(row?.error).toBe('TX_BAD_SIGNATURE')
    expect(row?.processedAt).toBeNull()
  })

  it('ธุรกรรมของแอปอื่น → บันทึกเหตุผลไว้ ไม่ให้สิทธิ์', async () => {
    await call({
      signedPayload: notification({ notificationUUID: 'bundle-0001' }, {
        signedTransactionInfo: makeToken(txPayload({ bundleId: 'com.someoneelse.app' })),
      }),
    })
    const row = await prisma.appleIapNotification.findUnique({ where: { notificationUUID: 'bundle-0001' } })
    expect(row?.error).toBe('BUNDLE_MISMATCH')
  })
})

describe('ช่วงผ่อนผัน ผ่าน webhook จริง (BR-IAP-14) — ปลายทางถึงฐานข้อมูล', () => {
  const OTID = '2000000900000290'

  it('🛑 หมดอายุแล้วแต่มี `gracePeriodExpiresDate` ใน renewal info → ร้านไม่ถูกล็อก', async () => {
    const user = await seedSubscriber(OTID, '90002901')
    const expired = txPayload({ originalTransactionId: OTID, expiresDate: Date.now() - 60 * 60 * 1000 })

    await call({
      signedPayload: notification({ notificationType: 'DID_FAIL_TO_RENEW', subtype: 'GRACE_PERIOD', notificationUUID: 'grace-0001' }, {
        signedTransactionInfo: makeToken(expired),
        signedRenewalInfo: makeToken({ gracePeriodExpiresDate: Date.now() + 15 * 24 * 60 * 60 * 1000 }),
      }),
    })

    const row = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: user.id } })
    expect(row?.status).toBe('ACTIVE')
    expect(row?.lockedAt).toBeNull()
  })

  it('ไม่มี renewal info แนบมา → พฤติกรรมเดิม (หมดอายุ = ล็อก)', async () => {
    const user = await seedSubscriber(OTID, '90002902')
    const expired = txPayload({ originalTransactionId: OTID, expiresDate: Date.now() - 60 * 60 * 1000 })

    await call({
      signedPayload: notification({ notificationType: 'EXPIRED', notificationUUID: 'grace-0002' }, {
        signedTransactionInfo: makeToken(expired),
      }),
    })

    const row = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: user.id } })
    expect(row?.status).toBe('LOCKED_RENEWAL_FAILED')
  })

  it('🛑 renewal info ลายเซ็นไม่ผ่าน → **ไม่ให้ช่วงผ่อนผัน** และทำเครื่องหมายไว้ให้คนตามดู', async () => {
    const user = await seedSubscriber(OTID, '90002903')
    const expired = txPayload({ originalTransactionId: OTID, expiresDate: Date.now() - 60 * 60 * 1000 })

    await call({
      signedPayload: notification({ notificationUUID: 'grace-0003' }, {
        signedTransactionInfo: makeToken(expired),
        /* ยัด grace ยาว ๆ มากับลายเซ็นปลอม — ถ้าเชื่อ = ใช้ฟรีถึงปี 2099 */
        signedRenewalInfo: makeBadToken({ gracePeriodExpiresDate: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
      }),
    })

    const sub = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: user.id } })
    expect(sub?.status).toBe('LOCKED_RENEWAL_FAILED')
    const row = await prisma.appleIapNotification.findUnique({ where: { notificationUUID: 'grace-0003' } })
    expect(row?.error).toBe('RENEWAL_INFO_BAD_SIGNATURE')
    expect(row?.processedAt, 'ต้องค้างคิวไว้ให้ตัวเดินตรวจซ้ำตามดู').toBeNull()
  })
})

describe('ธุรกรรมที่ยังไม่มีใครผูก', () => {
  it('webhook มาก่อนเครื่องผู้ใช้ยืนยัน → 200 · `NOT_LINKED` · ไม่ใช่ error', async () => {
    const res = await call({ signedPayload: notification({ notificationUUID: 'nolink-0001' }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ outcome: 'NOT_LINKED', error: null })
    const row = await prisma.appleIapNotification.findUnique({ where: { notificationUUID: 'nolink-0001' } })
    expect(row?.processedAt).not.toBeNull()
  })
})
