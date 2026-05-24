/**
 * Public order page /o/[token] — UX ใหม่ 2026-04-18
 *
 * Sequence 3 ขั้น:
 *   1. Lock screen — PhoneUnlock (กรอกเบอร์ตรงกับ order.buyerContact)
 *   2. Order detail — mobile-first + fixed bottom "ยืนยันคำสั่งซื้อ"
 *   3. Confirm — buyer กดปุ่ม → /api/orders/[token]/confirm → status CREATED→CONFIRMED
 *
 * Server component fetches order + ส่งให้ PublicOrderClient จัดการ stage
 * ต่อใน client. Base layouts:
 *   - PhoneUnlock → theme/vuexy/.../views/pages/auth/TwoStepsV1.tsx
 *   - OrderDetailMobile → composed mobile-first shape (scrollable body + fixed CTA)
 *
 * T13 (Phase 4 B5 — rework): รองรับ SMS short-code (/o/{12-char-code}) นอกเหนือจาก UUID
 * Discriminator ลำดับสำคัญ (LOCKED):
 *   1. UUID v4 → flow เดิม + อ่าน signed SMS unlock cookie (server-verified)
 *   2. 12-char short-code ([CHARSET]{12}) → redirect ไป GET /api/o/sms/{code}
 *      (route handler consume + set cookie + redirect /o/{uuid})
 *   3. อื่น ๆ → redirect /o/link-invalid (RC-2 uniform)
 *
 * Security fix (DESIGN-MUST-CHANGE):
 *   - ลบ ?unlocked=1 query trust ทิ้ง — client-trusted = auth bypass
 *   - ใช้ HMAC signed cookie (verifySmsUnlock) แทน — server-decided เท่านั้น
 *   - consumeSmsCode ย้ายไป route handler แล้ว (reload-safe, set cookie ได้)
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { getServerSession } from 'next-auth'

import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { getOrderByToken } from '@/services/order.service'
import { verifySmsUnlock, SMS_UNLOCK_COOKIE } from '@/lib/sms-unlock-cookie'

import PublicOrderClient from './PublicOrderClient'
import OrderAccessBlock from './OrderAccessBlock'
import type { PublicOrderData } from './OrderDetailMobile'

type Props = { params: Promise<{ token: string }> }

export const metadata: Metadata = { title: 'คำสั่งซื้อ' }

// UUID v4 pattern — ใช้ discriminate ก่อน (ลำดับ 1)
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// SMS short-code pattern — charset copy จาก src/services/sms-code.service.ts line 7 เป๊ะ
// CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" (ตัด 0/O/1/I ออก)
// 12 chars * 5 bit/char = 60-bit entropy (D1 spec)
const SMS_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/

export default async function PublicOrderPage({ params }: Props) {
  const { token } = await params

  // ── Discriminator ลำดับ 1: UUID v4 → flow เดิม + cookie verify ─────────────────
  if (UUID_V4_RE.test(token)) {
    const order = await getOrderByToken(token)
    if (!order) notFound()

    // ── Session-aware phone check (T3) ──────────────────────────────────────────
    // session callback ใน auth.ts ไม่ include phone ใน select (id/displayName/username/
    // avatar/isShop/isAdmin/trustScore เท่านั้น) → ต้อง resolve phone แยกด้วย findUnique
    // รวม getServerSession + findUnique ได้ใน 1 call คู่ (acceptable overhead per spec)
    const session = await getServerSession(authOptions)
    let sessionPhone: string | undefined
    if (session) {
      const me = await prisma.user.findUnique({
        where: { id: (session.user as { id: string }).id },
        select: { phone: true },
      })
      sessionPhone = me?.phone ?? undefined
    }

    // pendingUnclaimed: order ยังไม่มี buyerContact และยังเป็น PENDING
    // → ถือว่า "ยังไม่มีเจ้าของ" ไม่ต้องบล็อกใคร (แม้แต่ logged-in user)
    const phoneMatches = !!sessionPhone && sessionPhone === order.buyerContact
    const pendingUnclaimed = order.buyerContact == null && order.status === 'PENDING'
    const blockedByMismatch =
      !!sessionPhone && !phoneMatches && !pendingUnclaimed

    // ⚠️ security must-fix: บล็อก "ก่อน" สร้าง PublicOrderData → ไม่ส่ง order PII ใด ๆ
    // ลง RSC flight ไปยัง user ที่เบอร์ไม่ตรง (block UI render ฝั่ง server, ไม่มี order data)
    if (blockedByMismatch) {
      return <OrderAccessBlock />
    }

    // query verificationRecord ของ shop owner หลัง order resolve
    // shop.userId: field โดยตรงบน Shop model (ไม่ต้องไป user.id)
    // ส่งแค่ maxVerifyLevel: number ข้าม RSC boundary — ไม่ leak PII
    const approvedVerifications = await prisma.verificationRecord.findMany({
      where: { userId: order.shop.userId, status: 'APPROVED' },
      select: { level: true },
    })
    const maxVerifyLevel = approvedVerifications.length
      ? Math.max(...approvedVerifications.map((v) => v.level))
      : 0

    // อ่าน signed SMS unlock cookie (server-side only — ไม่เปิดเผยสู่ client)
    // verifySmsUnlock: fail-closed → false ทุก error; ไม่ throw
    const cookieStore = await cookies()
    const cookieVal = cookieStore.get(SMS_UNLOCK_COOKIE)?.value
    const smsUnlocked = verifySmsUnlock(cookieVal, order.id)

    // Flatten Prisma → plain object ที่ข้าม RSC→client ได้ (Decimal/Date → plain)
    const data: PublicOrderData = {
      publicToken: order.publicToken,
      status: order.status as PublicOrderData['status'],
      type: order.type as 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'SUBSCRIPTION',
      totalAmount: Number(order.totalAmount),
      createdAtIso: order.createdAt.toISOString(),
      hasReview: !!order.review,
      review: order.review
        ? { rating: order.review.rating, comment: order.review.comment }
        : null,
      items: order.items.map((it) => ({
        id: it.id,
        name: it.name,
        description: it.description,
        qty: it.qty,
        price: Number(it.price),
        // raw URL ไม่ผ่าน /api/files/ — pattern เดียวกับ /u/[username]/page.tsx:98 (S-1 T1)
        imageUrl: (it.product?.images as string[] | undefined)?.[0] ?? null,
      })),
      shop: {
        shopName: order.shop.shopName,
        user: {
          displayName: order.shop.user.displayName,
          username: order.shop.user.username,
          trustScore: order.shop.user.trustScore,
          // เพิ่ม avatar — raw URL เหมือน /u/[username]/page.tsx:109 (S-1 T1)
          avatar: order.shop.user.avatar ?? null,
        },
      },
      shipmentTracking: order.shipmentTracking
        ? {
            provider: order.shipmentTracking.provider,
            trackingNo: order.shipmentTracking.trackingNo,
          }
        : null,
      // 3 fields ใหม่จาก frozen contract (T1)
      paymentMethod: order.paymentMethod ?? null,
      fulfillmentMode: order.fulfillmentMode,
      maxVerifyLevel,
      // cancelInitiator: derive copy ใน UI ว่าใครยกเลิก (S-13 T1)
      cancelInitiator: (order.cancelInitiator as 'seller' | 'buyer' | null) ?? null,
      // Phase 2 fields (S-2) — getOrderByToken ใช้ include ไม่มี top-level select จำกัด scalar
      // Prisma คืน slipFileId/accessUrl อัตโนมัติ หลัง migration เพิ่ม column แล้ว
      slipFileId: order.slipFileId ?? null,
      accessUrl: order.accessUrl ?? null,
    }

    // ส่ง smsUnlocked ให้ client — server-decided ไม่ใช่ client-trusted
    // initialUnlocked: ข้าม PhoneUnlock ทันที (SMS flow พิสูจน์แล้ว)
    // smsUnlocked: บอก handleConfirm ว่าไม่ต้องส่ง contact ใน body (RC-8)
    //
    // canPromptAccount: S-8 — SMS-unlock แต่ยังไม่มี session → เสนอสร้างบัญชี opt-in
    // ทำไม: buyer ที่ unlock ผ่าน SMS link และไม่ได้ login ควรได้รับโอกาสสร้างบัญชี
    // โดยไม่บังคับ — guest flow ยังทำงานได้ถ้า dismiss
    const canPromptAccount = smsUnlocked && !sessionPhone

    return (
      <PublicOrderClient
        order={data}
        initialUnlocked={smsUnlocked}
        smsUnlocked={smsUnlocked}
        // logged-in user เบอร์ตรง → ข้าม lock + ใช้เบอร์นี้ใน confirm (S-9 returning skip)
        sessionUnlockedPhone={phoneMatches ? sessionPhone : undefined}
        canPromptAccount={canPromptAccount}
      />
    )
  }

  // ── Discriminator ลำดับ 2: 12-char short-code → route handler consume ──────────
  // RSC redirect ไป GET /api/o/sms/{code} ซึ่งจะ:
  //   rate-limit (RC-1) → consume → set signed cookie → redirect /o/{uuid}
  // แยกออกมาเป็น route handler เพราะ RSC set cookie ไม่ได้ใน Next.js 16
  if (SMS_CODE_RE.test(token)) {
    redirect('/api/o/sms/' + token)
  }

  // ── Discriminator ลำดับ 3: format ไม่ตรง → uniform error (RC-2) ─────────────────
  redirect('/o/link-invalid')
}
