/**
 * Public order page /o/[token] — feature 00015 (Order Claim & Forced Login) rebuild 2026-07-07
 *
 * Force-login gate (TFR-001/004-008, SDS §4.0/§4.2):
 *   ไม่มี session → redirect ไป sign-in ทันที (ไม่มี guest phone-unlock อีกต่อไป)
 *   มี session → resolveOrderAccess() ตัดสินว่า grant/ต้อง claim-OTP/บล็อก
 *
 * Discriminator ลำดับสำคัญ (LOCKED — คงเดิมจากเวอร์ชันก่อน feature 00015):
 *   1. UUID v4 → flow นี้ (force-login + resolveOrderAccess)
 *   2. 12-char short-code ([CHARSET]{12}) → redirect ไป GET /api/o/sms/{code}
 *      (route handler consume + redirect prefill/expired — ไม่ set cookie อีกต่อไป)
 *   3. 8-char permanent short-code → resolve แล้ว redirect เข้า flow UUID
 *   4. อื่น ๆ → redirect /o/link-invalid (RC-2 uniform)
 *
 * PII gate (NFR-Security, คงจาก S-1 เดิม): ต้อง early-return OrderAccessBlock/ClaimOtpPrompt
 * ก่อนสร้าง PublicOrderData เสมอ — ไม่ส่ง order detail ใด ๆ ลง RSC flight ให้ user ที่ยังไม่ผ่าน grant
 *
 * Base: ไฟล์นี้เป็น RSC orchestrator/redirect gate ล้วน (ไม่มี JSX ของตัวเอง — delegate ทั้งหมดไป
 * PublicOrderClient/ClaimOtpPrompt/OrderAccessBlock ซึ่งแต่ละไฟล์อ้าง Base ของตัวเองแล้ว)
 */
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { getOrderByToken } from '@/services/order.service'
import { resolveOrderAccess, guaranteeOrderLink } from '@/services/order-access.service'

import PublicOrderClient from './PublicOrderClient'
import OrderAccessBlock from './OrderAccessBlock'
import ClaimOtpPrompt from './ClaimOtpPrompt'
import PhoneVerifyPrompt from './PhoneVerifyPrompt'
import type { PublicOrderData } from './OrderDetailMobile'
// feature 00024 — ชนิดสถานะนัด (SSOT เดียวกับที่ service/UI ใช้)
import type { AppointmentStatus } from '@/lib/appointments'
import BookingGuestView from './BookingGuestView'

type Props = { params: Promise<{ token: string }> }

export const metadata: Metadata = { title: 'คำสั่งซื้อ' }

// UUID v4 pattern — ใช้ discriminate ก่อน (ลำดับ 1)
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// SMS short-code pattern — charset copy จาก src/services/sms-code.service.ts line 7 เป๊ะ
// CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" (ตัด 0/O/1/I ออก)
// 12 chars * 5 bit/char = 60-bit entropy (D1 spec)
const SMS_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/

// permanent short-code pattern — 8 ตัว charset เดียวกับ SMS code (length-disjoint จาก SMS 12-char)
const SHORT_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/

// mask เบอร์ก่อนส่งลง client component — '*'.repeat(len-4) + last4 (pattern เดียวกับ VerifyOtpCard.tsx)
function maskPhone(phone: string): string {
  return `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`
}

export default async function PublicOrderPage({ params }: Props) {
  const { token } = await params

  // ── Discriminator ลำดับ 1: UUID v4 → force-login gate + resolveOrderAccess ─────────
  if (UUID_V4_RE.test(token)) {
    const order = await getOrderByToken(token)
    if (!order) notFound()

    const session = await getServerSession(authOptions)

    // ไม่มี session เลย → บังคับ login ก่อน (TFR-001) — carry callbackUrl กลับมาหน้านี้
    if (!session) {
      redirect('/auth/sign-in?callbackUrl=' + encodeURIComponent('/o/' + token))
    }

    const sessionUser = session.user as { id: string; justAuthedViaPhoneOtp?: boolean }

    // session callback ไม่ include phone ดิบใน session.user (PII) → resolve แยกด้วย findUnique
    const me = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { phone: true },
    })

    const decision = resolveOrderAccess(
      {
        orderId: order.id,
        buyerUserId: order.buyerUserId,
        buyerContact: order.buyerContact,
        status: order.status,
      },
      {
        userId: sessionUser.id,
        phone: me?.phone ?? null,
        justAuthedViaPhoneOtp: !!sessionUser.justAuthedViaPhoneOtp,
      },
    )

    // ── บล็อก/ต้อง claim-OTP ก่อน — early-return ก่อนสร้าง PublicOrderData (PII gate) ──
    if (decision.kind === 'OTP_CLAIM_REQUIRED') {
      return (
        <ClaimOtpPrompt
          token={token}
          phone={decision.targetPhone}
          maskedPhone={maskPhone(decision.targetPhone)}
        />
      )
    }
    if (decision.kind === 'OWNER_MISMATCH') {
      return <OrderAccessBlock reason='owner-mismatch' />
    }
    // บัญชียังพิสูจน์ความเป็นเจ้าของไม่ได้ (ไม่มีเบอร์ผูก/เบอร์คนละตัว) — เดิมเป็นทางตัน
    // ตอนนี้ให้ยืนยันเบอร์ที่ใช้สั่งซื้อด้วย OTP ต่อได้ (S-2). ไม่ส่ง order data ใด ๆ ลงไป
    // เพราะยังไม่ผ่าน grant — component รับแค่ token ไว้ยิง API
    if (decision.kind === 'PHONE_VERIFY_REQUIRED') {
      return <PhoneVerifyPrompt token={token} />
    }
    if (decision.kind === 'LEGACY_NO_CLAIM') {
      return <OrderAccessBlock reason='legacy' />
    }
    // NO_SESSION ไม่ควรเกิด — ถูก redirect ไปแล้วข้างบนตั้งแต่ !session; defensive fallback
    if (decision.kind === 'NO_SESSION') {
      redirect('/auth/sign-in?callbackUrl=' + encodeURIComponent('/o/' + token))
    }

    // ── grant: OWNER_MATCH / PHONE_MATCH_AUTO_CLAIM ───────────────────────────────────
    await guaranteeOrderLink({ orderId: order.id, userId: sessionUser.id, phone: me?.phone ?? null })

    // query verificationRecord ของ shop owner หลัง order resolve
    const approvedVerifications = await prisma.verificationRecord.findMany({
      where: { userId: order.shop.userId, status: 'APPROVED' },
      select: { level: true },
    })
    const maxVerifyLevel = approvedVerifications.length
      ? Math.max(...approvedVerifications.map((v) => v.level))
      : 0

    // ── feature 00017: การจอง (type = BOOKING) ใช้หน้าคนละแบบ ─────────────────
    // flow ต่างจากออเดอร์สินค้าแทบทั้งหมด — ไม่มีของจัดส่ง ผู้จองยืนยันเองไม่ได้ (TFR-006)
    // และจบด้วยใบจองแทนการรับของ จึงแยก component ไม่ยัดเงื่อนไขเข้า OrderDetailMobile
    if (order.type === 'BOOKING') {
      const nights =
        order.checkIn && order.checkOut
          ? Math.round((order.checkOut.getTime() - order.checkIn.getTime()) / 86_400_000)
          : null
      return (
        <BookingGuestView
          booking={{
            token: order.publicToken,
            shortCode: order.shortCode,
            status: order.status as 'PENDING' | 'CONFIRMED' | 'CANCELLED',
            shopName: order.shop.shopName,
            roomName: order.room?.name ?? 'ห้องพัก',
            guestName: order.buyerName,
            // Date → 'YYYY-MM-DD' ที่ server boundary (Date ข้าม RSC ไม่ได้)
            checkIn: order.checkIn ? order.checkIn.toISOString().slice(0, 10) : null,
            checkOut: order.checkOut ? order.checkOut.toISOString().slice(0, 10) : null,
            nights,
            totalAmount: Number(order.totalAmount),
            depositAmount: Number(order.depositAmount ?? 0),
            slipFileId: order.slipFileId ?? null,
            // ไม่ส่ง cancelReason จริงให้ผู้จอง — เป็นบันทึกภายในของร้าน (BR-LODG-23)
            cancelReason: null,
          }}
        />
      )
    }

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
          // raw avatar URL — pattern เดียวกับ /u/[username]/page.tsx:109 (S-1 T1)
          avatar: order.shop.user.avatar ?? null,
        },
      },
      // feature 00022 — ลำดับความสำคัญ: สิ่งที่ร้าน "แจ้งเอง" มาก่อนเสมอ
      // แล้วค่อย fallback เป็นพัสดุ iShip ที่เปิดไว้ ผู้ซื้อจะได้เห็นเลขติดตาม
      // ตั้งแต่ร้านเปิดพัสดุ ไม่ต้องรอจนร้านกดแจ้งจัดส่งอีกที
      shipmentTracking: order.shipmentTracking
        ? {
            provider: order.shipmentTracking.provider,
            trackingNo: order.shipmentTracking.trackingNo,
          }
        : order.shipments?.[0]?.trackingNo
          ? {
              provider:
                order.shipments[0].courierName ?? order.shipments[0].courierCode ?? 'ขนส่ง',
              trackingNo: order.shipments[0].trackingNo,
            }
          : null,
      paymentMethod: order.paymentMethod ?? null,
      fulfillmentMode: order.fulfillmentMode,
      maxVerifyLevel,
      // cancelInitiator: derive copy ใน UI ว่าใครยกเลิก (S-13 T1)
      cancelInitiator: (order.cancelInitiator as 'seller' | 'buyer' | null) ?? null,
      slipFileId: order.slipFileId ?? null,
      accessUrl: order.accessUrl ?? null,
      // feature 00024 — วันเข้าใช้บริการ (FR-RSV-05) เติมที่จุดนี้เท่านั้น คือ "หลังผ่าน grant"
      // แล้ว ไม่แตะกลไกด่านของ feature 00015 เหนือบรรทัดนี้เลย
      // ออเดอร์ที่ไม่มีนัด → null → การ์ดไม่ถูก render เลย DOM เหมือนเดิมทุกประการ
      appointment:
        order.serviceStart && order.serviceEnd && order.serviceResource
          ? {
              resourceName: order.serviceResource.name,
              startIso: order.serviceStart.toISOString(),
              endIso: order.serviceEnd.toISOString(),
              // appointmentStatus เป็น String? ใน schema — ออเดอร์ที่มีนัดจะถูกตั้งเป็น
              // SCHEDULED ตั้งแต่ตอนสร้างเสมอ (attachAppointmentInTx) fallback ไว้กันข้อมูลเก่า
              status: (order.appointmentStatus ?? 'SCHEDULED') as AppointmentStatus,
              buyerConfirmedAt: order.buyerConfirmedAt?.toISOString() ?? null,
              rescheduleNote: order.rescheduleRequestNote ?? null,
            }
          : null,
    }

    return <PublicOrderClient order={data} />
  }

  // ── Discriminator ลำดับ 2: 12-char short-code → route handler consume ──────────
  // RSC redirect ไป GET /api/o/sms/{code} ซึ่งจะ: rate-limit (RC-1) → consume →
  // redirect prefill (/auth/sign-in?callbackUrl=...&prefillPhone=...) หรือ expired (TD-003)
  if (SMS_CODE_RE.test(token)) {
    redirect('/api/o/sms/' + token)
  }

  // ── Discriminator ลำดับ 3: 8-char permanent short-code → resolve + redirect UUID ──
  if (SHORT_CODE_RE.test(token)) {
    const matched = await prisma.order.findUnique({
      where: { shortCode: token },
      select: { publicToken: true },
    })
    // ไม่เจอ → uniform error เดียวกับ format ผิด (RC-2: ไม่ leak ว่า order มีจริงไหม)
    if (!matched) redirect('/o/link-invalid')
    redirect('/o/' + matched.publicToken)
  }

  // ── Discriminator ลำดับ 4: format ไม่ตรง → uniform error (RC-2) ─────────────────
  redirect('/o/link-invalid')
}
