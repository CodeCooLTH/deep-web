import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { SUBSCRIPTION_SOURCE } from '@/lib/subscription-source'
import { verifyAppleJws } from '@/lib/apple/jws'
import { readAppleSubscription, type AppleTransactionPayload } from '@/lib/apple/transaction'
import { readAppleGracePeriod, type AppleRenewalPayload } from '@/lib/apple/entitlement'
import { appleApiHost, buildAppleApiJwt, readSubscriptionStatus } from '@/lib/apple/server-api'
import { applyAppleNotification } from '@/services/apple-iap.service'

/** ถาม Apple ทีละใบ — ใบเยอะจะเกิน 10 วินาทีของ Hobby plan */
export const maxDuration = 60

/**
 * GET /api/cron/apple-iap-reconcile — ตัวเดินตรวจซ้ำ (feature 00064 · BR-IAP-15)
 *
 * ## ทำไมต้องมี — webhook หายได้จริง
 *
 * Apple ยิงข่าวตอนที่เราล่มหรือกำลัง deploy พอดี ข่าวนั้นหายไปเลย (Apple ยิงซ้ำจำกัดครั้ง)
 * การพึ่ง webhook อย่างเดียวแปลว่า **วันหนึ่งจะมีคนใช้ฟรีตลอดไปโดยไม่มีใครรู้** — และเป็น
 * ความผิดพลาดชนิดที่ไม่มีใครมาบ่น เพราะคนที่ได้ประโยชน์ไม่บ่น
 *
 * ## ถาม Apple เป็นความจริง ไม่ใช่เล่นข่าวเก่าซ้ำ
 *
 * ใบที่ค้างใน `AppleIapNotification` มี `signedPayload` เก็บไว้ก็จริง แต่มันคือ "ข่าว ณ
 * ตอนนั้น" ซึ่งอาจล้าสมัยไปแล้ว · ถาม `/inApps/v1/subscriptions/{id}` ได้สถานะ **ปัจจุบัน**
 * ซึ่งถูกต้องเสมอไม่ว่าจะพลาดข่าวไปกี่ใบ
 *
 * ## ยังตรวจลายเซ็นเหมือนเดิม
 *
 * ของที่ Apple ตอบมาก็เป็น JWS ⇒ เดินผ่าน `verifyAppleJws` + `readAppleSubscription`
 * ชุดเดียวกับ webhook — ไม่มีเส้นทางลัดที่เชื่อ Apple โดยไม่ตรวจ (ถ้ามีวันหนึ่งจะมีคน
 * ปลอม DNS หรือเรากดพิมพ์ host ผิดแล้วเชื่อของปลอม)
 *
 * Auth: `Authorization: Bearer {CRON_SECRET}` เท่านั้น — เหมือน cron ตัวอื่นทุกประการ
 */
export async function GET(request: Request) {
  /* 🛑 env ว่าง = ปฏิเสธทันที ห้ามปล่อยให้เทียบกับ `Bearer undefined` แล้วผ่าน */
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const keyId = process.env.APPLE_IAP_KEY_ID
  const issuerId = process.env.APPLE_IAP_ISSUER_ID
  const privateKeyPem = process.env.APPLE_IAP_PRIVATE_KEY
  if (!keyId || !issuerId || !privateKeyPem) {
    /* 🛑 503 ไม่ใช่ 200 — ตอบ 200 เงียบ ๆ ตอนตั้ง env ไม่ครบ = ตัวไล่เช็กไม่เคยทำงานเลย
       และไม่มีใครรู้จนกว่าจะมีคนใช้ฟรี · ต้องดังในหน้า cron ของ Vercel */
    console.error('[iap-reconcile] ยังไม่ได้ตั้ง env ของ App Store Server API')
    return NextResponse.json({ error: 'APPLE_IAP_KEYS_MISSING' }, { status: 503 })
  }

  const bundleId = 'com.deepthailand.seller'
  let token: string
  try {
    token = buildAppleApiJwt({ keyId, issuerId, bundleId, privateKeyPem })
  } catch (e) {
    console.error('[iap-reconcile] สร้างตั๋วไม่ได้ — กุญแจ .p8 อ่านไม่ออก', e)
    return NextResponse.json({ error: 'APPLE_IAP_KEY_INVALID' }, { status: 503 })
  }

  /**
   * ใบที่ควรถาม: ครบกำหนดต่ออายุไปแล้ว (เผื่อ 1 วันกันนาฬิกาคลาดกับรอบ cron)
   *
   * ใบที่ยังไม่ถึงกำหนดไม่ต้องถาม — ถ้ามีอะไรเปลี่ยน webhook จะบอกเอง และถ้าข่าวนั้นหาย
   * เราจะเจอตอนถึงกำหนดอยู่ดี · ถามทุกใบทุกวันคือยิง API ฟรีโดยไม่ได้อะไรเพิ่ม
   */
  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const rows = await prisma.businessPackageSubscription.findMany({
    where: {
      source: SUBSCRIPTION_SOURCE.APPLE_IAP,
      appleOriginalTransactionId: { not: null },
      nextRenewalAt: { lte: cutoff },
    },
    select: { appleOriginalTransactionId: true, appleEnvironment: true },
  })

  let checked = 0
  let updated = 0
  let failed = 0

  for (const row of rows) {
    const otid = row.appleOriginalTransactionId
    if (!otid) continue
    checked++
    try {
      const res = await fetch(
        `${appleApiHost(row.appleEnvironment)}/inApps/v1/subscriptions/${encodeURIComponent(otid)}`,
        { headers: { authorization: `Bearer ${token}` } },
      )
      if (!res.ok) {
        /* 404 = Apple ไม่รู้จักใบนี้แล้ว (เกิดได้กับ Sandbox ที่หมดอายุนานแล้ว)
           ไม่ใช่เหตุให้ล้มทั้งรอบ — นับไว้แล้วไปใบถัดไป */
        failed++
        console.warn('[iap-reconcile] Apple ตอบ', res.status, otid)
        continue
      }
      const status = readSubscriptionStatus(await res.json(), otid)
      if (!status) {
        failed++
        continue
      }

      /* 🛑 ยังตรวจลายเซ็นเหมือนเดิม — ไม่มีเส้นทางลัดที่เชื่อ Apple โดยไม่ตรวจ */
      const tx = verifyAppleJws<AppleTransactionPayload>(status.signedTransactionInfo)
      if (!tx.ok) {
        failed++
        console.error('[iap-reconcile] ลายเซ็นธุรกรรมไม่ผ่าน', otid, tx.reason)
        continue
      }
      const read = readAppleSubscription(tx.payload)
      if (!read.ok) {
        failed++
        console.error('[iap-reconcile] ธุรกรรมใช้ไม่ได้', otid, read.reason)
        continue
      }

      let grace: Date | null = null
      if (status.signedRenewalInfo) {
        const rn = verifyAppleJws<AppleRenewalPayload>(status.signedRenewalInfo)
        /* ลายเซ็น renewal info ไม่ผ่าน → ไม่ให้ช่วงผ่อนผัน แต่ยังเดินต่อ
           (กติกาเดียวกับ webhook — ดู readGracePeriod ที่นั่น) */
        if (rn.ok) grace = readAppleGracePeriod(rn.payload)
      }

      const outcome = await applyAppleNotification(read.facts, grace)
      if (outcome !== 'NOT_LINKED') updated++
    } catch (e) {
      failed++
      console.error('[iap-reconcile] ตรวจใบนี้ไม่สำเร็จ', otid, e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({ checked, updated, failed })
}
