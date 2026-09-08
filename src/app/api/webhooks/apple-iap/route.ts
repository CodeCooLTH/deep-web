/**
 * POST /api/webhooks/apple-iap — App Store Server Notifications v2 (feature 00064)
 *
 * ผู้เรียก: **Apple** (server-to-server) · ไม่มี session · ไม่มี Origin header
 * ⇒ วางไว้ใต้ `/api/webhooks/` ซึ่ง `proxy.ts` ยกเว้น CSRF Origin-check ไว้แล้ว
 * (ไม่ต้องแก้ proxy — แพตเทิร์นเดียวกับ webhook ของ iShip)
 *
 * ความน่าเชื่อถือมาจาก **ลายเซ็นใน payload อย่างเดียว** ไม่มี secret ไม่มี IP allow-list
 *
 * ## 🛑 ลำดับที่ห้ามสลับ
 *
 *   1. บันทึกลงตารางก่อน (`notificationUUID` unique) — กันประมวลผลซ้ำ
 *   2. แล้วค่อยลงมือให้/ถอนสิทธิ์
 *
 * insert ทีหลัง = การยิงซ้ำที่มาถึงระหว่างที่รอบแรกยังทำงานอยู่จะลอดเข้าไปทำซ้ำได้
 * (บทเรียน 00038 Critical #3 — "จองแถวก่อนยิง")
 *
 * ## 🛑 ตอบ 200 เกือบทุกกรณี
 *
 * Apple ยิงซ้ำเมื่อไม่ได้ 2xx · การตอบ 5xx เพราะ "ข้อมูลไม่ถูกใจ" ทำให้ Apple ยิงซ้ำ
 * ไม่รู้จบโดยที่ผลลัพธ์ไม่มีวันเปลี่ยน ⇒ ตอบ 200 แล้วเก็บ `error` ไว้ในแถว
 * ให้ตัวเดินตรวจซ้ำ (BR-IAP-15) ตามเก็บแทน
 *
 * ยกเว้นกรณีเดียวที่ตอบ 5xx: **เขียนฐานไม่ได้** — นั่นคือเคสที่การยิงซ้ำช่วยได้จริง
 */
import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'

import { prisma } from '@/lib/prisma'
import { verifyAppleJws, decodeAppleJwsWithoutVerifying } from '@/lib/apple/jws'
import { readAppleSubscription, type AppleTransactionPayload } from '@/lib/apple/transaction'
import { readAppleGracePeriod, type AppleRenewalPayload } from '@/lib/apple/entitlement'
import { applyAppleNotification } from '@/services/apple-iap.service'

export const dynamic = 'force-dynamic'

const BodySchema = v.object({
  signedPayload: v.pipe(v.string(), v.minLength(20), v.maxLength(100_000)),
})

/** รูปร่าง responseBodyV2DecodedPayload เท่าที่เราใช้ */
interface NotificationPayload {
  notificationType?: unknown
  subtype?: unknown
  notificationUUID?: unknown
  data?: {
    environment?: unknown
    signedTransactionInfo?: unknown
    /** JWS **คนละก้อน** กับ signedTransactionInfo — ที่อยู่ของ `gracePeriodExpiresDate` */
    signedRenewalInfo?: unknown
  }
}

const asStr = (x: unknown) => (typeof x === 'string' && x.length > 0 ? x : null)

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(BodySchema, body)
  if (!parsed.success) return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 400 })
  const signedPayload = parsed.output.signedPayload

  const verified = verifyAppleJws<NotificationPayload>(signedPayload)
  if (!verified.ok) {
    /* ลายเซ็นไม่ผ่าน = ไม่ได้มาจาก Apple ⇒ **ห้ามบันทึกเป็นเหตุการณ์จริง** และห้ามตอบ 200
       (ตอบ 200 ให้คนยิงมั่วเท่ากับบอกว่า endpoint นี้รับของ) · 401 ชัดเจนกว่า 400 */
    console.error('[apple-iap webhook] ลายเซ็นไม่ผ่าน', verified.reason)
    return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 401 })
  }

  const p = verified.payload
  const notificationUUID = asStr(p.notificationUUID)
  const notificationType = asStr(p.notificationType) ?? 'UNKNOWN'
  if (!notificationUUID) {
    return NextResponse.json({ error: 'MISSING_UUID' }, { status: 400 })
  }

  /* ── 1) จองแถวก่อนลงมือ ────────────────────────────────────────────────── */
  try {
    await prisma.appleIapNotification.create({
      data: {
        notificationUUID,
        notificationType,
        subtype: asStr(p.subtype),
        environment: asStr(p.data?.environment),
        originalTransactionId: readOriginalTransactionId(p),
        signedPayload,
      },
    })
  } catch (e) {
    /* ชน unique = เคยรับใบนี้แล้ว ⇒ ตอบ 200 เฉย ๆ ห้ามทำงานซ้ำ
       (Apple ยิงซ้ำเป็นเรื่องปกติเมื่อเราตอบช้า ไม่ใช่ความผิดพลาด) */
    if (isUniqueViolation(e)) return NextResponse.json({ ok: true, duplicate: true })
    console.error('[apple-iap webhook] บันทึกไม่ได้', notificationUUID, e)
    /* เขียนฐานไม่ได้ = เคสเดียวที่ยิงซ้ำช่วยได้จริง */
    return NextResponse.json({ error: 'STORE_FAILED' }, { status: 503 })
  }

  /* ── 2) ลงมือ ─────────────────────────────────────────────────────────── */
  let outcome = 'SKIPPED'
  let error: string | null = null
  try {
    const signedTx = asStr(p.data?.signedTransactionInfo)
    if (!signedTx) {
      /* การแจ้งเตือนบางชนิด (เช่น TEST) ไม่มีธุรกรรมแนบมา — บันทึกไว้เฉย ๆ ถูกต้องแล้ว */
      error = notificationType === 'TEST' ? null : 'NO_TRANSACTION_INFO'
    } else {
      const tx = verifyAppleJws<AppleTransactionPayload>(signedTx)
      if (!tx.ok) {
        error = `TX_${tx.reason}`
      } else {
        const read = readAppleSubscription(tx.payload)
        if (!read.ok) error = read.reason
        else {
          /* ── ช่วงผ่อนผัน (BR-IAP-14) ────────────────────────────────────────
             ระหว่าง billing retry ของ Apple `expiresDate` เป็นอดีตไปแล้วแต่ผู้ใช้
             ยังต้องใช้งานได้ · ค่าที่บอกว่า "ได้ถึงเมื่อไร" อยู่ใน signedRenewalInfo
             ซึ่งเป็น JWS อีกก้อน ⇒ ต้อง verify แยกอีกครั้ง ห้ามถอดเฉย ๆ */
          const grace = readGracePeriod(p)
          if (grace.badSignature) error = 'RENEWAL_INFO_BAD_SIGNATURE'
          outcome = await applyAppleNotification(read.facts, grace.expiresAt)
        }
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    console.error('[apple-iap webhook] ประมวลผลล้ม', notificationUUID, e)
  }

  /* `processedAt` ตั้งเฉพาะตอนไม่มี error — ใบที่ยังเป็น NULL คือคิวของตัวเดินตรวจซ้ำ */
  await prisma.appleIapNotification
    .update({
      where: { notificationUUID },
      data: { processedAt: error ? null : new Date(), error },
    })
    .catch((e) => console.error('[apple-iap webhook] อัปเดตผลไม่ได้', notificationUUID, e))

  return NextResponse.json({ ok: true, outcome, error })
}

/**
 * อ่านช่วงผ่อนผันจาก `signedRenewalInfo` ของการแจ้งเตือนใบนี้
 *
 * 🛑 ลายเซ็นไม่ผ่าน → คืน `null` (ไม่ให้ช่วงผ่อนผัน) **ไม่ใช่** เชื่อค่าที่ถอดมาได้
 * ปล่อยผ่าน = ใครยัด `gracePeriodExpiresDate` ปี 2099 มาก็ใช้ฟรีตลอดชีพ
 * แต่ยังบอกคนเรียกว่า "ลายเซ็นเสีย" เพื่อให้ทำเครื่องหมายไว้ให้ตัวเดินตรวจซ้ำตามดู —
 * เพราะการล็อกร้านลูกค้าเพราะ renewal info เสียเป็นเรื่องที่ต้องมีคนเห็น ไม่ใช่เงียบไป
 */
function readGracePeriod(p: NotificationPayload): { expiresAt: Date | null; badSignature: boolean } {
  const signed = asStr(p.data?.signedRenewalInfo)
  /* ไม่มีมาด้วยเป็นเรื่องปกติ — การต่ออายุที่สำเร็จไม่มีช่วงผ่อนผัน */
  if (!signed) return { expiresAt: null, badSignature: false }

  const verified = verifyAppleJws<AppleRenewalPayload>(signed)
  if (!verified.ok) {
    console.error('[apple-iap webhook] renewal info ลายเซ็นไม่ผ่าน', verified.reason)
    return { expiresAt: null, badSignature: true }
  }
  return { expiresAt: readAppleGracePeriod(verified.payload), badSignature: false }
}

/** อ่าน originalTransactionId จากธุรกรรมที่แนบมา — **ไม่ตรวจลายเซ็น** ใช้เพื่อ index/ค้นหาเท่านั้น */
function readOriginalTransactionId(p: NotificationPayload): string | null {
  const signedTx = asStr(p.data?.signedTransactionInfo)
  if (!signedTx) return null
  const decoded = decodeAppleJwsWithoutVerifying<AppleTransactionPayload>(signedTx) /* carve-out: ใช้เป็น **ดัชนีค้นหา** ในตารางบันทึกเท่านั้น ไม่ได้ใช้ให้สิทธิ์ — เส้นทางที่ให้สิทธิ์อยู่ใน POST ข้างบนและตรวจ verifyAppleJws() ใหม่ทุกครั้ง · ค่าที่ปลอมมาจะทำได้แค่ทำให้คอลัมน์ค้นหาผิด ซึ่งเห็นได้จากแถวที่ error ไม่ว่าง */
  const id = decoded?.originalTransactionId
  return typeof id === 'string' && id.length > 0 ? id : null
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code?: unknown }).code === 'P2002'
  )
}
