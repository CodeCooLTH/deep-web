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
import { toFileUrl } from '@/lib/file-url'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { getOrderByToken } from '@/services/order.service'
import { resolveOrderAccess, guaranteeOrderLink } from '@/services/order-access.service'
import { hasOpenDispute } from '@/services/order-dispute.service'
import {
  approvedVerificationWhere,
  businessScope,
  type VerificationReadScope,
} from '@/lib/verification-scope'

import PublicOrderClient from './PublicOrderClient'
import OrderAccessBlock from './OrderAccessBlock'
import ClaimOtpPrompt from './ClaimOtpPrompt'
import PhoneVerifyPrompt from './PhoneVerifyPrompt'
import type { PublicOrderData } from './OrderDetailMobile'
// feature 00024 — ชนิดสถานะนัด (SSOT เดียวกับที่ service/UI ใช้)
import type { AppointmentStatus } from '@/lib/appointments'
import { computeOrderMoneyFromSerialized, hasMoneyStory } from '@/lib/order-payment'
import BookingGuestView from './BookingGuestView'
import GuestOrderView from './GuestOrderView'
import { buildGuestOrderData } from './guest-order-data'
import { sessionUserId } from '@/lib/session-user'

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

    /* 🛑 "ระดับยืนยันของร้านนี้" มีนิยามเดียวทั้งระบบที่ src/lib/verification-scope.ts (FR-2.7)
       ประกาศไว้ตรงนี้ครั้งเดียวแล้วใช้ทั้ง 2 สาขาข้างล่าง (guest / ล็อกอินแล้ว) เพราะสองสาขานั้น
       เคยเขียน where ของตัวเองแยกกันคนละบรรทัด — จอเดียวกัน ผู้ซื้อคนเดียวกัน ต้องไม่มีทางตอบต่างกัน

       เดิมทั้งคู่เขียน `{ userId: order.shop.userId }` ลอย ๆ ไม่มีเงื่อนไข shopId ⇒ เอกสาร L2/L3
       ที่เจ้าของอัปให้ร้าน **อื่น** ของตัวเองจะไหลมานับเป็นระดับของร้านที่กำลังเปิดใบสั่งซื้ออยู่
       (บน prod มีเจ้าของที่ถือ 4 ร้าน) — เป็นการอ้างความน่าเชื่อถือที่ยังไม่จริง บนหน้าที่ผู้ซื้อ
       ใช้ตัดสินใจโอนเงิน ซึ่งอันตรายกว่าบั๊กทิศตรงข้ามที่แก้ไปใน 413cafb3 (นับน้อยไป) มาก

       ยังไม่เคยระเบิดเพราะทั้งฐานยังไม่มีแถว L2/L3 เลยสักแถว (ตรวจ 2026-08-11: 6 แถวเป็น L1
       shopId=null ล้วน) — ไม่ใช่เพราะโค้ดถูก แต่เพราะยังไม่มีใครเดินผ่านเส้นทางนั้น */
    const verifyScope: VerificationReadScope =
      order.shop.kind === 'BUSINESS'
        ? businessScope(order.shop.id, order.shop.userId)
        : { kind: 'personal', userId: order.shop.userId }

    const session = await getServerSession(authOptions)

    /**
     * 🛑 "มี session" ไม่ได้แปลว่า "รู้ว่าเป็นใคร" — session callback ใน `lib/auth.ts` เติม
     * `user.id` ให้เฉพาะตอน `token.userId` resolve เป็นแถว User ได้จริงเท่านั้น
     * (`if (token.userId)` + `if (user)`) โทเคนที่ออกก่อนมีฟิลด์นั้น หรือผู้ใช้ที่ถูกลบ/purge
     * ไปแล้ว จะได้ object session ที่ไม่เป็น null แต่ `user.id` เป็น undefined
     *
     * ของเดิมเขียน `session.user as { id: string }` แล้วยิง prisma ด้วยค่านั้นทันที —
     * TypeScript เชื่อ cast ทุกตัวอักษร แต่ runtime ได้ `where: { id: undefined }` ซึ่ง Prisma
     * โยน PrismaClientValidationError ⇒ **ทั้งหน้าเป็น 500** (user เจอบน prod 2026-08-11,
     * digest 3758181775). cast คือสิ่งที่ปิดตาไม่ให้เห็นเคสนี้ตั้งแต่ต้น
     *
     * ตกลงไปทาง guest แทนการพัง: จอ guest แสดงออเดอร์ใบเดียวกันได้อยู่แล้วและไม่ต้องรู้ตัวตน
     * ส่วน action ที่ผูกตัวตน (ยืนยันรับของ/รีวิว) อยู่หลังด่าน login เหมือนเดิมทุกประการ
     */
    const viewerUserId = sessionUserId(session)

    // ── ไม่มี session → guest view (feature 00041, มติ D-1 ของ user) ────────────────
    // เดิมบรรทัดนี้ redirect ไป sign-in ทันที ซึ่งเป็นมติของ feature 00015 — ผลจริงบน prod คือ
    // 0/73 ใบมีผู้ซื้อเข้ามาเลย (00015 เขียนความเสี่ยงนี้ไว้เองว่ารุนแรงสูง แล้วมันเกิดจริง 100%)
    //
    // 🛑 สิ่งที่ **ไม่** เปลี่ยน: ทุก action ที่ผูกตัวตนยังบังคับ login เหมือนเดิมทุกประการ —
    // กติกา ownership/claim ของ 00015 อยู่ใต้บรรทัดนี้ทั้งหมดและไม่ถูกแตะเลย
    // ที่เปลี่ยนคือ "ก่อน login เห็นอะไรได้บ้าง" เท่านั้น
    if (!session || !viewerUserId) {
      // BOOKING ยังคง redirect เหมือนเดิม — flow การจองไม่อยู่ในขอบเขตรอบนี้ (SRS §1.2)
      if (order.type === 'BOOKING') {
        redirect('/auth/sign-in?callbackUrl=' + encodeURIComponent('/o/' + token))
      }

      // ── หลักฐานร้านที่ guest เห็น ──
      // ยิงพร้อมกันทั้งชุด ไม่ใช่ต่อคิว — เป็น round trip เดียวเพิ่มจากเดิม
      // ตรรกะทั้งหมดเหมือน getOrderSummaryForSignIn() แต่ inline เพราะเรียกตัวนั้นตรง ๆ
      // จะกลายเป็น findUnique ของออเดอร์ใบเดิมรอบที่สองโดยไม่ได้อะไรเพิ่ม
      const [guestVerifications, statusGroups, ratingAgg, latestReview, channels] = await Promise.all([
        prisma.verificationRecord.findMany({
          where: approvedVerificationWhere(verifyScope),
          select: { level: true },
        }),
        prisma.order.groupBy({
          by: ['status'],
          where: { shopId: order.shopId },
          _count: { _all: true },
        }),
        prisma.review.aggregate({
          where: { order: { shopId: order.shopId }, deletedAt: null },
          _avg: { rating: true },
          _count: { _all: true },
        }),
        prisma.review.findFirst({
          where: { order: { shopId: order.shopId }, deletedAt: null, comment: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { rating: true, comment: true },
        }),
        prisma.shopChannel.findMany({
          where: { shopId: order.shopId, status: 'ACTIVE' },
          /* allow-list 5 คีย์ — เหตุผลเต็มอยู่ที่ branch authenticated ในไฟล์เดียวกัน
             (แถวนี้มี accessTokenEnc อยู่ด้วย) · ต้องเป็นชุดเดียวกับที่นั่นเป๊ะ ไม่งั้นสองจอ
             จะ select คนละชุดแล้วกลายเป็นความต่างใหม่ที่ไม่มีเหตุผลอีกจุด */
          select: { provider: true, name: true, avatarUrl: true, externalId: true, followerCount: true },
          take: 3,
        }),
      ])

      const guestMaxVerifyLevel = guestVerifications.length
        ? Math.max(...guestVerifications.map((v) => v.level))
        : 0

      const confirmedCount = statusGroups.find((g) => g.status === 'CONFIRMED')?._count._all ?? 0
      const reviewCount = ratingAgg._count._all

      return (
        <GuestOrderView
          order={buildGuestOrderData(order, guestMaxVerifyLevel, {
            // 🛑 `null` ไม่ใช่ `0` — 0 แปลว่า "นับแล้วได้ศูนย์" ซึ่งเป็นข้อเท็จจริงที่ต้องบอก
            // แต่เราเลือกไม่แสดงบล็อกเลยเมื่อยังไม่มีประวัติ (ไม่ประจานร้านใหม่ด้วยเลข 0 ตัวโต)
            completedOrders: confirmedCount > 0 ? confirmedCount : null,
            avgRating: ratingAgg._avg.rating != null ? Math.round(ratingAgg._avg.rating * 10) / 10 : null,
            reviewCount,
            channels,
            latestReview: latestReview?.comment
              ? { rating: latestReview.rating, comment: latestReview.comment }
              : null,
          })}
        />
      )
    }

    const sessionUser = session.user as { justAuthedViaPhoneOtp?: boolean }

    // session callback ไม่ include phone ดิบใน session.user (PII) → resolve แยกด้วย findUnique
    const me = await prisma.user.findUnique({
      where: { id: viewerUserId },
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
        userId: viewerUserId,
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
    await guaranteeOrderLink({ orderId: order.id, userId: viewerUserId, phone: me?.phone ?? null })

    /* query verificationRecord ของ shop owner หลัง order resolve
       + หลักฐานร้านชุดเดียวกับที่ guest branch ยิงอยู่แล้ว (user 2026-08-11 "ต้องเห็นทั้งคู่")

       🛑 ยิงพร้อมกันใน Promise.all เดียว ไม่ใช่ต่อคิวทีละตัว — จอนี้ query หนักอยู่แล้ว
       (order + user + guaranteeOrderLink มาก่อนหน้านี้) การเพิ่ม 3 ตัวแบบ sequential
       จะยืดเวลาโหลดจริงตามจำนวน round trip ส่วนแบบขนานเสียเท่าตัวที่ช้าที่สุดตัวเดียว */
    const [approvedVerifications, statusGroups, ratingAgg, channels] = await Promise.all([
      prisma.verificationRecord.findMany({
        where: approvedVerificationWhere(verifyScope),
        select: { level: true },
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: { shopId: order.shopId },
        _count: { _all: true },
      }),
      prisma.review.aggregate({
        where: { order: { shopId: order.shopId }, deletedAt: null },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      prisma.shopChannel.findMany({
        where: { shopId: order.shopId, status: 'ACTIVE' },
        /* 🛑 allow-list 5 คีย์ ห้ามใช้ include หรือเพิ่มคีย์โดยไม่อ่านสคีมาก่อน — แถวเดียวกันนี้มี
           `accessTokenEnc` (page access token) และคอลัมน์ตั้งค่าตอบกลับอัตโนมัติของร้านอยู่ด้วย
           ซึ่งสคีมาเขียนกำกับไว้เองว่า "ห้ามส่งกลับ client ทุกกรณี" · ปลายทางเป็น client component
           ทุกคีย์ที่ใส่จะถูก serialize ลง flight payload ให้อ่านได้จาก view-source */
        select: { provider: true, name: true, avatarUrl: true, externalId: true, followerCount: true },
        take: 3,
      }),
    ])
    const maxVerifyLevel = approvedVerifications.length
      ? Math.max(...approvedVerifications.map((v) => v.level))
      : 0

    const confirmedCount = statusGroups.find((g) => g.status === 'CONFIRMED')?._count._all ?? 0

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
      // 🛑 hasReview ตั้งใจไม่กรอง deletedAt — ต้องคง "true" ไว้แม้รีวิวถูกลบแล้ว
      // เพราะมันคือสิ่งที่บอก UI ว่า "ห้ามเปิดฟอร์มเขียนรีวิวใหม่" (createReview จะปฏิเสธอยู่ดี
      // เพราะแถว tombstone ยังอยู่ — ถ้า UI เปิดฟอร์มให้กรอกจนเสร็จแล้วค่อยปฏิเสธ คือ UX ที่แย่
      // กว่าไม่มีฟอร์มเลย). ส่วน review เป็น null = ไม่แสดงการ์ดคะแนน → UI ได้สถานะที่ 3
      // "คุณลบรีวิวนี้ไปแล้ว" จากคู่ (hasReview=true, review=null) — SDS TD-002
      hasReview: !!order.review,
      review:
        order.review && !order.review.deletedAt
          ? {
              rating: order.review.rating,
              comment: order.review.comment,
              /* คอลัมน์เดียวกับ `Product.images` — เก็บ key เหมือนกัน ต้องแปลงเหมือนกัน
                 (ฐาน local ยังไม่มีรีวิวที่แนบรูป จึงไม่มีใครเจอ — แต่รออยู่) */
              images: ((order.review.images as string[] | null) ?? [])
                .map((k) => toFileUrl(k))
                .filter((u): u is string => u != null),
              // createdAt ของใบแรกเสมอ — ห้ามใช้ updatedAt เป็นฐานของหน้าต่าง 24 ชม.
              // ไม่งั้นแก้ทีละนิดจะยืดเวลาไปได้ไม่รู้จบ (BR-BOE-17)
              createdAtIso: order.review.createdAt.toISOString(),
              shopReply:
                order.review.shopReplyComment && order.review.shopRepliedAt
                  ? {
                      comment: order.review.shopReplyComment,
                      repliedAtIso: order.review.shopRepliedAt.toISOString(),
                    }
                  : null,
            }
          : null,
      items: order.items.map((it) => ({
        id: it.id,
        name: it.name,
        description: it.description,
        qty: it.qty,
        price: Number(it.price),
        // raw URL ไม่ผ่าน /api/files/ — pattern เดียวกับ /u/[username]/page.tsx:98 (S-1 T1)
        /* 🛑 `Product.images` เก็บเป็น storage key เหมือน `Shop.logo` — ส่งดิบ ๆ ได้ 404
           แล้วรูปสินค้าหายทั้งใบโดยเงียบ (ตรวจฐาน 2026-08-29: `2026/08/08/uuid.jpg`) */
        imageUrl: toFileUrl((it.product?.images as string[] | undefined)?.[0]),
      })),
      shop: {
        shopName: order.shop.shopName,
        /* ปกที่ร้านตั้งเอง — เก็บเป็น storage key เหมือน `logo` จึงต้องผ่าน `toFileUrl` เช่นกัน */
        coverImage: toFileUrl(order.shop.coverImage),
        user: {
          displayName: order.shop.user.displayName,
          username: order.shop.user.username,
          trustScore: order.shop.user.trustScore,
          /* raw URL — ลำดับเดียวกับ /u/[username]/page.tsx: โลโก้ร้านมาก่อนรูปส่วนตัวเจ้าของ
             (เหตุผลเต็มอยู่ที่ guest-order-data.ts จุดเดียวกัน — ทั้งสองจอต้องเลือกรูปด้วยกฎ
             เดียวกัน ไม่งั้นก่อนล็อกอินกับหลังล็อกอินจะเห็นคนละรูปของร้านเดียวกัน) */
          /**
           * 🛑 `Shop.logo` เก็บเป็น **storage key** (`2026/08/04/uuid.jpeg`) ไม่ใช่ URL —
           * ส่งดิบ ๆ ให้ `<img src>` เบราว์เซอร์จะตีความเป็น path สัมพัทธ์ของหน้าปัจจุบัน
           * ⇒ ยิงไปที่ `/o/2026/08/04/uuid.jpeg` แล้วได้ **404** · รูปร้านตกไปเป็นตัวอักษรย่อ
           *
           * **ทุกร้านที่อัปโหลดโลโก้ได้รับผลกระทบ** และเงียบสนิท เพราะ Avatar มี fallback
           * เป็นตัวอักษรอยู่แล้ว — หน้าตาเลย "ดูปกติ" (เจอจาก 404 ใน console 2026-08-29)
           *
           * `avatar` ของ OAuth เป็น URL เต็มอยู่แล้ว — `toFileUrl` คืนค่าเดิมให้ จึงครอบได้ทั้งสองแบบ
           * (นี่คือเหตุผลที่ `file-url.ts` มีอยู่: "เขียนแสดงรูปโดยลืมแปลง key เป็นความผิดพลาด
           * ที่เกิดซ้ำมาแล้วหลายที่")
           */
          avatar: toFileUrl(order.shop.logo) ?? toFileUrl(order.shop.user.avatar) ?? null,
        },
      },
      /* หลักฐานร้าน — เกณฑ์ null/0 ต้องตรงกับ guest branch ทุกตัว ไม่งั้นร้านเดียวกันจะขึ้น
         บล็อกนี้ก่อนล็อกอินแต่หายไปหลังล็อกอิน (หรือกลับกัน) โดยไม่มีใครตั้งใจให้ต่าง */
      completedOrders: confirmedCount > 0 ? confirmedCount : null,
      avgRating: ratingAgg._avg.rating != null ? Math.round(ratingAgg._avg.rating * 10) / 10 : null,
      reviewCount: ratingAgg._count._all,
      channels,
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
      // feature 00041 — /messages/[shopId] รับ Shop.id (ยืนยันจาก
      // (buyer-app)/messages/[shopId]/page.tsx ที่ findUnique ด้วย { id: shopId })
      // ถ้าส่ง shop.userId ไปแทน ปุ่ม "ติดต่อร้านค้า" จะพาไปหน้า not-found ทุกใบ
      shopId: order.shopId,
      // derive ที่ server ด้วย SSOT ตัวเดียวกับ 00039 — UI จะได้ไม่เขียนเงื่อนไข
      // "ไม่ null และยังไม่ resolve" ซ้ำเป็นชุดที่สอง
      hasOpenDispute: hasOpenDispute(order),
      disputeOpenedAtIso: order.disputeOpenedAt?.toISOString() ?? null,
      // feature 00024 — วันเข้าใช้บริการ (FR-RSV-05) เติมที่จุดนี้เท่านั้น คือ "หลังผ่าน grant"
      // แล้ว ไม่แตะกลไกด่านของ feature 00015 เหนือบรรทัดนี้เลย
      // ออเดอร์ที่ไม่มีนัด → null → การ์ดไม่ถูก render เลย DOM เหมือนเดิมทุกประการ
      /**
       * feature 00050 (AC-SQ-06) — เงินที่ร้านยืนยันแล้ว + ยอดค้าง
       *
       * 🛑 render เฉพาะเมื่อ "มีเรื่องเงินให้พูดถึงจริง" (เคยรับเงิน หรือ ตกลงมัดจำไว้) —
       * ออเดอร์ขายออนไลน์ทั่วไปจะได้ `null` แล้วหน้าเดิมไม่เปลี่ยนแม้แต่ node เดียว (AC-SQ-07)
       * ตัวเลขทุกตัวมาจาก `computeOrderMoney` ตัวเดียวกับฝั่งร้าน — ห้ามบวกเองที่นี่ (HR16)
       */
      money: (() => {
    /**
     * 🛑 กั้นด้วย **vertical** ไม่ใช่แค่ "มีมัดจำไหม" (AC-SQ-07)
     *
     * เกณฑ์เดิม (`hasDeposit || totalReceived > 0`) ปลอดภัยวันนี้เพราะ **ข้อมูลบังเอิญเป็นแบบนั้น**
     * — ONLINE_SALES 269 ใบบน prod ไม่มีมัดจำเลยสักใบ และยังไม่มีร้านบ้านพัก
     * แต่บ้านพัก **เก็บมัดจำเป็นปกติ** (`booking.service.ts` เขียน `depositAmount` ทุกใบ)
     * ⇒ วันแรกที่มีร้านบ้านพักเปิดใช้ การ์ดนี้จะโผล่บนจอที่ไม่ได้ขอ โดยไม่มีอะไรฟ้อง
     * "ปลอดภัยเพราะยังไม่มีใครเดินผ่านเส้นทางนั้น" ไม่ใช่ด่าน
     */
    if (order.shop.vertical !== 'SERVICE_QUEUE') return null
        const m = computeOrderMoneyFromSerialized({
          totalAmount: order.totalAmount.toFixed(2),
          depositAmount: order.depositAmount ? order.depositAmount.toFixed(2) : null,
          payments: order.payments.map((p) => ({
            kind: p.kind,
            amount: p.amount.toFixed(2),
            voidedAt: p.voidedAt ? p.voidedAt.toISOString() : null,
          })),
        })
        if (!hasMoneyStory(m)) return null
        return {
          totalAmount: m.totalAmount,
          depositAgreed: m.depositAgreed,
          totalReceived: m.totalReceived,
          outstanding: m.outstanding,
          fullyPaid: m.fullyPaid,
          hasDeposit: m.hasDeposit,
          entries: order.payments.map((p) => ({
            kind: p.kind,
            amount: Number(p.amount),
            method: p.method,
            receivedAtIso: p.receivedAt.toISOString(),
          })),
        }
      })(),
      /* feature 00050 (AC-SQ-06) — เพจต้นทาง · relation select ไว้แล้วเป็น allow-list 3 คีย์
         (แถว ShopChannel มี accessTokenEnc อยู่ด้วย ห้าม include) */
      // คำบนจอผันตามประเภทร้าน — แยกจากด่าน `money` ที่ตอบคนละคำถาม
      isServiceShop: order.shop.vertical === 'SERVICE_QUEUE',
      originPage: order.shopChannel
        ? {
            channel: order.shopChannel.provider,
            pageName: order.shopChannel.name,
            pageAvatarUrl: order.shopChannel.avatarUrl,
          }
        : null,
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
