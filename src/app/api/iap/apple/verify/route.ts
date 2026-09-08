/**
 * POST /api/iap/apple/verify — ยืนยันการซื้อจากเครื่องผู้ใช้ แล้วเปิดสิทธิ์ (feature 00064)
 *
 * ## ทำไม "หน้าเว็บใน WebView" เป็นคนเรียก ไม่ใช่ native
 *
 * ผู้ขายล็อกอินในเว็บ — session อยู่ในรูป cookie ของ WebView · ฝั่ง native ไม่มี cookie
 * ยิงเองจะได้ 401 เสมอ ⇒ native ส่ง JWS กลับเข้าหน้าเว็บแล้วให้หน้าเว็บ `fetch` เอง
 * request จึงวิ่งออกจาก origin ของเว็บพร้อม cookie ครบ และมี `Origin` header ถูกต้อง
 * ผ่าน CSRF check ของ `proxy.ts` ตามปกติ (แพตเทิร์นเดียวกับ push token ที่ใช้อยู่แล้ว)
 *
 * ## 🛑 client ห้าม finishTransaction จนกว่าจะได้ 200
 *
 * ธุรกรรมที่ยังไม่ finish จะถูก StoreKit ส่งกลับมาใหม่ทุกครั้งที่เปิดแอป = กลไกกู้คืนในตัว
 * สำหรับเคส "จ่ายเงินสำเร็จแต่ server เรารับไม่ได้" (BR-IAP-11) ⇒ endpoint นี้ต้อง
 * **idempotent** เพราะจะถูกยิงซ้ำด้วยธุรกรรมเดิมจนกว่าจะสำเร็จ
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import * as v from 'valibot'

import { authOptions } from '@/lib/auth'
import { sessionUserId } from '@/lib/session-user'
import { verifyAppleJws } from '@/lib/apple/jws'
import { readAppleSubscription, type AppleTransactionPayload } from '@/lib/apple/transaction'
import { linkAppleSubscription } from '@/services/apple-iap.service'

/** ธุรกรรมที่เซ็นแล้วยาวได้หลาย KB — จำกัดไว้กันคนยิงก้อนใหญ่มาถล่ม */
const BodySchema = v.object({
  signedTransaction: v.pipe(v.string(), v.minLength(20), v.maxLength(20_000)),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  /* 🛑 "มี session" ≠ "รู้ว่าเป็นใคร" — ใช้ sessionUserId() ตามกติกาของโปรเจกต์
     (docs/conventions/session-exists-is-not-identity.md) */
  const ownerId = sessionUserId(session)
  if (!ownerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(BodySchema, body)
  if (!parsed.success) return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 400 })

  const verified = verifyAppleJws<AppleTransactionPayload>(parsed.output.signedTransaction)
  if (!verified.ok) {
    /* ส่งเหตุผลกลับไปด้วย — ฝั่งแอปต้องแยกได้ว่า "ลองใหม่ได้" (server เพี้ยน) กับ
       "ลองกี่ครั้งก็ไม่ผ่าน" (ธุรกรรมใช้ไม่ได้) ไม่งั้นจะวนยิงไม่รู้จบ */
    console.error('[iap/verify] ลายเซ็นไม่ผ่าน', { ownerId, reason: verified.reason })
    return NextResponse.json({ error: 'INVALID_SIGNATURE', reason: verified.reason }, { status: 400 })
  }

  const read = readAppleSubscription(verified.payload)
  if (!read.ok) {
    console.error('[iap/verify] ธุรกรรมใช้ไม่ได้', { ownerId, reason: read.reason })
    return NextResponse.json({ error: read.reason }, { status: 400 })
  }

  try {
    const result = await linkAppleSubscription(ownerId, read.facts)
    if (!result.ok) {
      /* 409 = ขัดแย้งเชิงสถานะ ไม่ใช่ข้อมูลผิด — ฝั่งแอปต้องไม่ลองซ้ำ */
      return NextResponse.json({ error: result.reason }, { status: 409 })
    }
    return NextResponse.json({
      status: 'ACTIVE',
      tier: result.tier,
      nextRenewalAt: result.expiresAt.toISOString(),
    })
  } catch (e) {
    console.error('[iap/verify] บันทึกไม่สำเร็จ', ownerId, e instanceof Error ? e.message : e)
    /* 500 โดยตั้งใจ — ฝั่งแอปต้อง **ไม่** finishTransaction แล้วลองใหม่รอบหน้า */
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
