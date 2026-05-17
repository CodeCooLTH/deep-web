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

import { getOrderByToken } from '@/services/order.service'
import { verifySmsUnlock, SMS_UNLOCK_COOKIE } from '@/lib/sms-unlock-cookie'

import PublicOrderClient from './PublicOrderClient'
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

    // อ่าน signed SMS unlock cookie (server-side only — ไม่เปิดเผยสู่ client)
    // verifySmsUnlock: fail-closed → false ทุก error; ไม่ throw
    const cookieStore = await cookies()
    const cookieVal = cookieStore.get(SMS_UNLOCK_COOKIE)?.value
    const smsUnlocked = verifySmsUnlock(cookieVal, order.id)

    // Flatten Prisma → plain object ที่ข้าม RSC→client ได้ (Decimal/Date → plain)
    const data: PublicOrderData = {
      publicToken: order.publicToken,
      status: order.status as PublicOrderData['status'],
      type: order.type as PublicOrderData['type'],
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
      })),
      shop: {
        shopName: order.shop.shopName,
        user: {
          displayName: order.shop.user.displayName,
          username: order.shop.user.username,
          trustScore: order.shop.user.trustScore,
        },
      },
      shipmentTracking: order.shipmentTracking
        ? {
            provider: order.shipmentTracking.provider,
            trackingNo: order.shipmentTracking.trackingNo,
          }
        : null,
    }

    // ส่ง smsUnlocked ให้ client — server-decided ไม่ใช่ client-trusted
    // initialUnlocked: ข้าม PhoneUnlock ทันที (SMS flow พิสูจน์แล้ว)
    // smsUnlocked: บอก handleConfirm ว่าไม่ต้องส่ง contact ใน body (RC-8)
    return (
      <PublicOrderClient
        order={data}
        initialUnlocked={smsUnlocked}
        smsUnlocked={smsUnlocked}
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
