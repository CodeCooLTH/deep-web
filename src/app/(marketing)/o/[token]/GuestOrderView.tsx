/**
 * GuestOrderView — หน้าออเดอร์สำหรับผู้ที่ยังไม่ล็อกอิน (feature 00041, มติ D-1 ของ user)
 *
 * Base: src/app/(marketing)/o/[token]/OrderDetailMobile.tsx
 *   (hero + status line + การ์ดรายการสินค้า + โครง MUI ทั้งหมด)
 *   ยกโครงมาแล้วตัดทุกอย่างที่ต้องล็อกอินออก เหลือแค่ "อ่านอย่างเดียว"
 *   ส่วนที่สองจอต้องเหมือนกันเป๊ะถูกยกเป็นไฟล์ร่วมแล้ว: `ShopCover` · `ShopEvidence` ·
 *   `TrustPill` · `content-width` — แก้ที่นั่นที่เดียว ไม่ต้องไล่แก้สองที่ให้ตรงกันอีก
 *
 * ทำไมแยกไฟล์แทนใส่เงื่อนไขใน OrderDetailMobile (พันกว่าบรรทัด): ทั้งสองมุมมองต่างกันที่
 * **ชุดข้อมูลที่รับเข้ามา** ไม่ใช่แค่ปุ่มที่ซ่อน — guest รับ GuestOrderData ที่ mask แล้วและ
 * ไม่มีสลิป/ชื่อผู้ซื้อ/ลิงก์เข้าถึงอยู่ในนั้นเลย การยัดเข้าไฟล์เดียวจะทำให้ต้องมี field
 * optional เต็มไปหมดแล้วเผลอ render ของที่ guest ไม่ควรเห็นได้ง่ายมาก
 *
 * 🛑 ทุกปุ่มที่ผูกตัวตนที่นี่เป็น "ลิงก์ไปหน้า login" ไม่ใช่ปุ่มที่ยิง API — ห้ามมี mutation
 * ใด ๆ จากมุมมองนี้ (BR-BOE-06/07; ต่อให้มี server ก็ปฏิเสธอยู่แล้ว แต่ UI ต้องไม่หลอกให้กด)
 */

import Link from 'next/link'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import { Icon } from '@iconify/react'

import PublicProfileFooter from '@/views/pages/user-profile/v2/PublicProfileFooter'
import { getTierColor, getTierLabel } from '@/lib/trust-tier'
import { resolveVerifyBadge } from '@/lib/verify-badge'
import AuthPingLink from './AuthPingLink'
import SectionTitle from './SectionTitle'
import { formatOrderNo } from '@/lib/order-no'
import { formatDateTimeTH, formatTimeHM, formatTimeRangeHM, formatWeekdayDateTH } from '@/lib/format-date'
import { ORDER_STATUS_TONE_TO_MUI, getPaymentBadge } from '@/lib/order-display'
import { ORDER_VOCAB } from '@/lib/seller-menu'
import { deriveShippingStage, resolveOrderStatusBadge } from '@/lib/order-stage'
import { resolveOrderStatusHeadline } from '@/lib/order-status-headline'
import { needsPayoutAccount } from '@/lib/shop-payout'
import { isPickupOrder } from '@/lib/order-pickup'
import ParcelTimeline from './ParcelTimeline'
import PayoutAccountCard from './PayoutAccountCard'
import PickupInfoCard from './PickupInfoCard'
import { orderContentWidthSx } from './content-width'
import CoverActions from './CoverActions'
import ShopCover from './ShopCover'
import ShopEvidence from './ShopEvidence'
import TrustPill, { VERIFIED_BG, VERIFIED_INK } from './TrustPill'
import type { GuestOrderData } from './guest-order-data'


/**
 * เมตริกของแถบ CTA ล่างจอ — **ที่ว่างที่หน้าเว้นไว้ต้องคำนวณจากตัวเลขชุดเดียวกับที่แถบใช้จริง**
 *
 * 🛑 ของเดิมเป็นเลข `112` เขียนดิบไว้คนละที่กับแถบ ⇒ ทุกครั้งที่ปุ่ม/แคปชันเปลี่ยนความสูง
 * (ป้ายปุ่มยาวขึ้นจนตกบรรทัด · แคปชันตกบรรทัดบนจอ 320px) ตัวเลขนั้นจะขาดไปเงียบ ๆ แล้ว
 * ท้ายหน้าถูกแถบทับ โดยไม่มี `tsc`/build/เทสตัวไหนฟ้อง เพราะทั้งสองฝั่ง "ถูก" ในตัวเอง
 *
 * เผื่อแคปชัน 2 บรรทัดเสมอ — สองทิศไม่เท่ากัน: เผื่อเกิน = ช่องว่างท้ายหน้าที่ไม่มีใครเห็น
 * (footer อยู่เหนือมัน) · เผื่อขาด = เนื้อหาถูกทับ ซึ่งคือสิ่งที่กำลังแก้อยู่
 */
const CTA_BAR_PT = 12
const CTA_BAR_PB = 12
/** ปักความสูงปุ่มไว้ ไม่ปล่อยให้ธีมตัดสิน — เลขข้างล่างจะได้ไม่ผูกกับค่า default ที่แก้ที่อื่นได้ */
const CTA_BUTTON_HEIGHT = 48
const CTA_CAPTION_GAP = 10
/** 1 บรรทัดของแคปชัน 13px ที่ lineHeight 1.7 (ไทยต้องการที่ให้สระบน-ล่าง) */
const CTA_CAPTION_LINE = 22
const CTA_BAR_RESERVE =
  CTA_BAR_PT + CTA_BUTTON_HEIGHT + CTA_CAPTION_GAP + CTA_CAPTION_LINE * 2 + CTA_BAR_PB

const baht = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export default function GuestOrderView({ order }: { order: GuestOrderData }) {
  const loginHref = `/auth/sign-in?callbackUrl=${encodeURIComponent(`/o/${order.publicToken}`)}`
  const tierLabel = getTierLabel(order.shop.user.trustScore)
  const tierColor = getTierColor(order.shop.user.trustScore)

  const stage = deriveShippingStage({
    status: order.status,
    carrierStatus: order.carrierStatus,
    hasShipment: !!order.shipmentTracking,
    paymentMethod: order.paymentMethod,
    codReceivedAt: null,
    fulfillmentMode: order.fulfillmentMode,
  })

  const verifyBadge = resolveVerifyBadge(order.maxVerifyLevel)

  /* แกนสถานะออเดอร์ (ดีล) กับแกนสถานะพัสดุ (กล่อง) เป็นคนละแกน — ตัวตัดสินว่าจะโชว์ทั้งคู่
     หรือตัวเดียว อยู่ใน src/lib/order-status-headline.ts พร้อมเทส [blocker] ไม่ใช่เทอร์นารีใน JSX
     (ui-boolean-needs-a-testable-home.md: เกณฑ์คือ "เขียนกลับด้านแล้วมีอะไรจับได้ไหม") */
  const statusHeadline = resolveOrderStatusHeadline({
    status: order.status,
    stage,
    hasShipment: !!order.shipmentTracking,
  })
  const statusColor = ORDER_STATUS_TONE_TO_MUI[resolveOrderStatusBadge(order.status, stage).tone]

  /**
   * feature 00062 (UX-Design-Spec §B8) — badge สถานะการชำระเงิน จาก SSOT เดียวกับฝั่งร้าน
   * (HR16) 🛑 guest ไม่มี `slipFileId` ใน allow-list (ไม่ใช่ PII ของผู้ซื้อ แต่ไฟล์นี้ยังไม่เปิด
   * ให้ตั้งใจ — เพิ่มเฉพาะ 2 ฟิลด์ที่ task นี้ระบุ) ⇒ ส่ง `undefined` แทน "ยังไม่รู้" ไม่ใช่เดา
   * เป็น false ซึ่งจะเบี่ยง badge จาก "รอตรวจสอบสลิป" ไปเป็น "รอชำระ" ถ้าลูกค้าคนอื่นที่ล็อกอิน
   * แล้วเคยแนบสลิปไว้ก่อนหน้า — คนละบั๊กกับ payoutSnapshot
   */
  const paymentBadge = getPaymentBadge(order.status, order.paymentMethod, undefined, order.paymentConfirmedAt)

  /* คำทั้งหน้าผันตามประเภทกิจการ — ร้านบริการ/บ้านพักต้องไม่เห็นคำว่า "สินค้า" ที่ไหนเลย
     ค่าที่ไม่รู้จักตกไป ONLINE_SALES (fail-safe เดียวกับ VERTICAL_VISIBLE_SLUGS ของ seller-menu) */
  const vocab = ORDER_VOCAB[order.shop.vertical] ?? ORDER_VOCAB.ONLINE_SALES

  const isClosed = order.status === 'CONFIRMED' || order.status === 'CANCELLED'
  const ctaLabel = isClosed
    ? `เข้าสู่ระบบเพื่อดูรายละเอียด${vocab.noun}`
    : `เข้าสู่ระบบเพื่อ${vocab.buyerConfirmLabel}`


  return (
    // 🛑 ต้องบวก env(safe-area-inset-bottom) ด้วย — แถบ CTA ล่างจอบวก inset เข้าไปในความสูงของ
    // ตัวเอง แต่ที่เผื่อไว้ตรงนี้เป็นค่าคงที่ ⇒ บน iPhone ที่มี home indicator (34px) เนื้อหา
    // ท้ายหน้าถูกแถบทับไป 34px พอดี (audit 2026-08-11)
    <Box sx={{ pb: `calc(${CTA_BAR_RESERVE}px + env(safe-area-inset-bottom))` }}>
      <Box sx={orderContentWidthSx}>
        {/* ══ โครงหน้า "ร้านนำแบบย่อ" (user เลือกแบบ ค จาก mockup 2026-08-11) ══════════════
            คงลำดับเดิม (ร้านก่อน สถานะทีหลัง) แต่บีบบล็อกร้านจาก ~370px เหลือ ~200px แล้วยก
            สถานะขึ้นเป็น "การ์ดที่เด่นที่สุดในหน้า" ด้วยขอบสี semantic + เงา แทนการย้ายตำแหน่ง

            ที่บีบได้โดยไม่เสียอะไร: avatar 84→64px · ตัดบรรทัด @username (ชื่อร้านคือสิ่งที่
            ผู้ซื้อจำได้ ไม่ใช่ slug) · ชื่อร้านลงมาอยู่ขั้น Title 18px ตาม ramp แทน h6 ที่ถูก
            บังคับน้ำหนัก 800 เอง

            🛑 แลกมาด้วย: สถานะยังไม่ได้อยู่บนสุดของจอ และ "ขอบสีบอกความสำคัญ" เป็นภาษาที่หน้าอื่น
            ฝั่งผู้ซื้อยังไม่ได้ใช้ที่ไหนเลย — user รับข้อแลกเปลี่ยนนี้แล้วตอนเลือกจาก mockup */}
        {/* 🛑 ส่ง isNewShop แยก ไม่ใช่ completionRate — ร้านที่ยังไม่มีออเดอร์จบต้องไม่ได้
            แบนเนอร์ไล่สีที่หน้าตาเหมือนรางวัล (ดูเหตุผลเต็มที่ prop ของ ShopCover) */}
        <ShopCover
          trustScore={order.shop.user.trustScore}
          isNewShop={order.completedOrders == null}
          /* จอนี้คือจอที่คนได้ลิงก์จากแชทเห็นก่อน — ปุ่ม "ช่วยเหลือ" ต้องมีที่นี่ยิ่งกว่าที่อื่น
             (คนที่สงสัยว่าโดนหลอก คือคนที่ยังไม่ได้ล็อกอิน) */
          actions={<CoverActions orderNo={formatOrderNo(order.publicToken, order.createdAtIso)} />}
        />

        {/* 🛑 `position: relative` ไม่ใช่ของประดับ — `ShopCover` เป็น element ที่ positioned
            ส่วนบล็อกนี้ไม่ใช่ ⇒ ตามลำดับการวาดของ CSS ปกจะถูกวาด **ทับ** ลูกทุกตัวของบล็อกนี้
            รวมโลโก้ร้านที่ยื่นขึ้นไป 32px (`mt: -32px`) ⇒ **โลโก้ถูกปกกินหายไปครึ่งใบ**
            ทั้งที่ CSS ทุกบรรทัดถูกต้องและไม่มี gate ไหนฟ้อง (user เจอเองจากรูปหน้าจอ 2026-08-16)
            จอหลังล็อกอินไม่เป็นเพราะที่นั่นห่อ avatar ด้วย `position: relative` อยู่แล้ว —
            ความต่างที่ไม่มีใครตั้งใจให้ต่าง */}
        <Box component='header' sx={{ position: 'relative', bgcolor: 'background.paper', px: 4, pb: 4, textAlign: 'center' }}>
          {/* ── ทำไมโลโก้ต้อง "ลอย" ออกจากปก ──
              การทับปกครึ่งใบ (`mt: -32px`) คงไว้ตามเดิม — สิ่งที่เปลี่ยนคือ **ความคมชัดของขอบ**
              ปกเป็นไล่สีตาม tier ซึ่งเปลี่ยนไปได้ทุกร้าน ⇒ โลโก้เข้มบนปกเทา/โลโก้อ่อนบนปกสว่าง
              จะกลืนกับพื้นหลังเป็นบางร้านโดยที่ไม่มีใครเห็นตอนพัฒนา (ร้านที่ใช้ทดสอบมีปกเดียว)
              ขอบขาวหนา 4px + เงา + **พื้นในเป็นขาว ไม่ใช่เทา** จึงเป็นสิ่งที่รับประกันว่าโลโก้
              ทุกแบบมีเส้นแบ่งกับปกเสมอ ไม่ใช่แค่ร้านที่บังเอิญสีตัดกัน
              (docs/conventions/user-supplied-image-assets.md — รูปที่ผู้ใช้อัปเองต้องมี ring)
              4px + customShadows.md = ชุดเดียวกับจอหลังล็อกอิน ร้านเดียวกันต้องดูเหมือนกัน */}
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              border: '4px solid',
              borderColor: 'background.paper',
              // พื้นขาว ไม่ใช่ `action.hover` (เทาจาง) — โลโก้โปร่งใส/ขอบอ่อนจะได้ไม่จมไปกับปก
              bgcolor: 'background.paper',
              boxShadow: 'var(--mui-customShadows-md)',
              mx: 'auto',
              mt: '-32px',
              display: 'grid',
              placeItems: 'center',
              fontSize: 25,
              // ตัวอักษรแทนรูปร้าน = ทำหน้าที่เป็น "ภาพ" ไม่ใช่ข้อความ จึงคง 800 ได้ (ไม่ใช่ Strong)
              fontWeight: 800,
              // 🛑 text.secondary ไม่ใช่ text.disabled — 0.4 ได้ 2.30:1 ตก AA (audit 2026-08-11)
              color: 'text.secondary',
              overflow: 'hidden',
            }}
          >
            {order.shop.user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={order.shop.user.avatar} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              order.shop.shopName.slice(0, 1)
            )}
          </Box>

          {/* 🛑 เป็น <h1> จริง — ทั้งหน้าเดิมไม่มี heading สักตัว (ชื่อร้านเป็น <a> จาก
              `Typography component={Link}`, หัว section เป็น overline บน <span>) ผู้ใช้
              screen reader จึงกระโดดตามหัวข้อไม่ได้เลยทั้งหน้า
              🛑 line-clamp 2 บรรทัด ไม่ใช่ noWrap+title — `title` ต้อง hover ซึ่งมือถือไม่มี
              (บทเรียนเดียวกับ aria-name-requires-supporting-role.md)
              18px = ขั้น Title ซึ่ง DESIGN.md ระบุ use case ว่า "หัวข้อย่อย, ชื่อร้าน" ตรงตัว */}
          <Typography
            component='h1'
            sx={{
              m: 0,
              mt: 1,
              fontSize: '1.125rem',
              // Strong (700) — ขั้นที่ประกาศใน DESIGN.md 2026-08-12; 800 สงวนให้ Metric เท่านั้น
              fontWeight: 700,
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {/* 🛑 ห้าม `component={Link}` ที่นี่ — ไฟล์นี้เป็น server component แล้ว การส่ง
                component เข้า <Box> (ซึ่งเป็น client component ของ MUI) = ส่งฟังก์ชันข้าม RSC
                boundary ⇒ "Functions cannot be passed directly to Client Components" ทั้งหน้า 500
                นี่คือ Hard Rule 2 ของโปรเจกต์ตรงตัว (docs/conventions/rsc-mui-navigation.md)
                <a> ธรรมดาพอสำหรับลิงก์ข้อความล้วน ไม่ต้องพึ่ง Box/Typography ของ MUI เลย */}
            <Link
              href={`/u/${order.shop.user.username}`}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {order.shop.shopName}
            </Link>
          </Typography>

          <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', mt: 1, flexWrap: 'wrap' }}>
            {/* 🛑 ป้ายบอก "ระดับที่ยืนยันถึง" ไม่ใช่คำว่ายืนยันแล้วลอย ๆ — ร้านที่ทำแค่ OTP
                ไม่ควรได้ป้ายเดียวกับร้านที่จดทะเบียนธุรกิจ บนจอที่ตัดสินว่าเงินจะโอนหรือไม่
                คำ+โทนมาจาก SSOT เดียวกับหน้า sign-in ที่ผู้ซื้อจะเห็นต่อในอีกไม่กี่วินาที */}
            {verifyBadge && (
              <TrustPill
                tone={verifyBadge.tone}
                icon={verifyBadge.icon}
                label={`${verifyBadge.label} (ระดับ ${order.maxVerifyLevel})`}
              />
            )}
            <TrustPill tone='tier' tierColor={tierColor} label={tierLabel} />
          </Box>

          {/* ── หลักฐานของร้าน — ใช้ร่วมกับจอหลังล็อกอิน (ShopEvidence) ── */}
          <ShopEvidence
            completedOrders={order.completedOrders}
            avgRating={order.avgRating}
            reviewCount={order.reviewCount}
            channels={order.channels}
            originChannel={order.originChannel}
          />

          {/* รีวิวจริงหนึ่งอัน — ข้อความจากคนซื้อจริงน่าเชื่อกว่าค่าเฉลี่ยลอย ๆ
              ไม่มีรีวิวที่เขียนข้อความ → ซ่อนบล็อก ไม่แต่งคำชมเอง */}
          {order.latestReview && (
            <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 1.5, mt: 2, textAlign: 'left' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                {/* carve-out HR12: typographic dingbat สีเดียว (★) ไม่ใช่ emoji */}
                <Box component='span' sx={{ color: 'warning.dark', fontSize: '0.8125rem', letterSpacing: '0.15em' }}>
                  {'★'.repeat(order.latestReview.rating)}
                </Box>
                {/* 🛑 พื้นอ่านจาก SSOT เดียวกับตัวอักษร — เดิม hardcode 'rgba(40,199,111,0.15)'
                    ทั้งที่ไฟล์นี้ import VERIFIED_INK จาก palette ตัวเดียวกันมาใช้อยู่แล้ว */}
                <Box
                  component='span'
                  sx={{
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: VERIFIED_INK,
                    bgcolor: VERIFIED_BG,
                    px: 0.75,
                    py: 0.25,
                    /* 6px = ค่าเล็กสุดในชุดรัศมีของหน้านี้ — เดิม 4.5px เป็นค่าที่ไม่มีที่อื่นใช้เลย
                       ป้ายเล็กชิ้นเดียวที่พูดคนละภาษากับทั้งหน้า */
                    borderRadius: 1,
                  }}
                >
                  ซื้อจริง
                </Box>
              </Box>
              <Typography
                variant='body2'
                color='text.secondary'
                sx={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {order.latestReview.comment}
              </Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, px: 4, pt: 4 }}>
          {/* ── สถานะ + พัสดุ — การ์ดที่เด่นที่สุดในหน้า ──
              ขอบ 1px สี semantic ตามสถานะ + เงาหนากว่าการ์ดอื่น (แบบ ค): ยกความสำคัญด้วย
              "น้ำหนักทางสายตา" แทนการย้ายตำแหน่งขึ้นบนสุด
              🛑 ขอบเป็น 1px รอบใบตาม One-Pixel Border Rule — ไม่ใช่แถบสีหนาฝั่งซ้าย ซึ่ง
              DESIGN.md ยกเว้นให้เฉพาะ `(paces)/**` เท่านั้น ฝั่ง buyer ห้ามตามเดิม
              สีบอกสถานะคู่กับข้อความเสมอ ไม่ใช่สีอย่างเดียว (WCAG 1.4.1) */}
          <Card
            component='section'
            aria-label='สถานะคำสั่งซื้อ'
            sx={{
              border: '1px solid',
              /* 🛑 ห้ามเป็น `(t) => alpha(t.palette[...].main, .5)` — ไฟล์นี้เป็น server component
                 แล้ว (ไม่มี 'use client') ฟังก์ชันใน sx จะถูกส่งข้าม RSC boundary เข้า <Card>
                 ซึ่งเป็น client component ⇒ "Functions cannot be passed directly to Client
                 Components" = ทั้งหน้าเป็น 500 (เกิดจริงบน prod 2026-08-12 digest 2095457049)
                 ใช้ CSS var + mainChannel แทน — เป็นสตริงล้วน serialize ได้
                 (docs: feedback_rsc_props_must_be_serializable) */
              borderColor: `rgb(var(--mui-palette-${statusColor}-mainChannel) / 0.5)`,
              // customShadows.lg = ขั้นที่ DESIGN.md ระบุ use case ว่า "modal, popover, แผงสำคัญ"
              // ไม่ใช่ `boxShadow: 4` ซึ่งดึงจาก array elevation ของ Material Design คนละตระกูลกับ
              // การ์ดใบอื่นในหน้าเดียวกันที่ได้ customShadows.md จาก MuiCard override
              boxShadow: 'var(--mui-customShadows-lg)',
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {statusHeadline.statusPill && (
                  <TrustPill tone='tier' tierColor={statusColor} label={statusHeadline.statusPill} />
                )}
                <Typography variant='caption' color='text.secondary' sx={{ ml: 'auto' }}>
                  {formatOrderNo(order.publicToken, order.createdAtIso)} · {formatDateTimeTH(order.createdAtIso)}
                </Typography>
              </Box>
              <Typography component='h2' sx={{ m: 0, mt: 1, fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.35 }}>
                {statusHeadline.headline}
              </Typography>
              {/* ── วันนัด — ข้อเท็จจริงที่ผู้ซื้อร้านบริการเปิดหน้านี้มาหา ──
                  🛑 ก่อนหน้านี้จอนี้ **ไม่บอกวันนัดเลยสักที่** ผู้ซื้อที่จองไว้เห็นแค่
                  "รอดำเนินการ" กับยอดเงิน แล้วต้องล็อกอินถึงจะรู้ว่าตัวเองนัดกี่โมง —
                  ทั้งที่ค่าถูกโหลดมากับออเดอร์ใบเดียวกันอยู่แล้ว (ไม่เพิ่ม query สักตัว)
                  วางไว้ใน "การ์ดที่เด่นที่สุดในหน้า" ไม่ใช่การ์ดใหม่ท้ายหน้า เพราะมันคือ
                  ส่วนหนึ่งของคำตอบว่า "ใบนี้ถึงไหนแล้ว" ไม่ใช่ข้อมูลประกอบ */}
              {order.serviceStartIso && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    mt: 2,
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'action.hover',
                  }}
                >
                  <Icon icon='tabler-calendar-event' fontSize={20} style={{ flexShrink: 0, color: VERIFIED_INK }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
                      วันนัด
                    </Typography>
                    {/* ไม่มีเวลาสิ้นสุด → แสดงเวลาเริ่มอย่างเดียว ไม่เดาช่วงให้ผู้ใช้
                        (formatTimeRangeHM คืน '—' เมื่อขาดฝั่งใดฝั่งหนึ่ง — '—' บนวันนัด
                        อ่านเป็น "ระบบไม่รู้" ซึ่งแย่กว่าการบอกเท่าที่รู้จริง) */}
                    <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, lineHeight: 1.5 }}>
                      {formatWeekdayDateTH(order.serviceStartIso)}
                      {' · '}
                      {order.serviceEndIso
                        ? `${formatTimeRangeHM(order.serviceStartIso, order.serviceEndIso)} น.`
                        : `${formatTimeHM(order.serviceStartIso)} น.`}
                    </Typography>
                  </Box>
                </Box>
              )}

              {/* บรรทัด "{provider} · {trackingNo}" ที่เคยอยู่ตรงนี้ถูกถอดออก — ParcelTimeline
                  แสดงทั้งคู่อยู่แล้ว (และเลขพัสดุที่นั่นกดคัดลอกได้) ปล่อยไว้ = ข้อมูลเดียวกัน
                  สองที่ ห่างกัน 8px โดยฝั่งบนกดไม่ได้ */}
              {order.shipmentTracking && (
                <ParcelTimeline
                  stage={stage}
                  carrierStatus={order.carrierStatus}
                  returnStartedAt={order.returnStartedAt}
                  returnedAt={order.returnedAt}
                  returnDispatchedAt={order.returnDispatchedAt}
                  hasShipment
                  tracking={order.shipmentTracking}
                />
              )}
            </CardContent>
          </Card>

          {/* ── feature 00062 (UX-Design-Spec §B7): บัญชีรับเงิน + QR พร้อมเพย์ ──
              ทันทีหลัง Status card ก่อน Items card โดยตั้งใจ — การ์ดนี้คือ "สิ่งที่ต้องทำต่อ"
              จากสถานะด้านบน และมี "ยอดที่ต้องโอน" ในตัวมันเอง (ทำหน้าที่เป็น payment summary)
              จึงไม่จำเป็นต้องอ่าน Items card ก่อน (ไม่ใช่ท้ายหน้าแบบช่องแนบสลิปเดิมที่ใช้จริง
              0/504 — PRD ระบุสาเหตุตรงนี้เอง)

              needsPayoutAccount() คือ SSOT เดียวที่ตัดสิน "ออเดอร์นี้ต้องโอนไหม" — COD/เงินสด
              ไม่ผ่านด่านนี้ จึงไม่มีการ์ดนี้เลย ตรงกับ Edge states ข้อแรกของสเปก */}
          {needsPayoutAccount(order.paymentMethod) && (
            <PayoutAccountCard
              totalAmount={order.totalAmount}
              payoutSnapshot={order.payoutSnapshot}
              paymentBadge={paymentBadge}
              status={order.status}
              paymentConfirmedAt={order.paymentConfirmedAt}
              contactShopAction={
                <AuthPingLink
                  href={loginHref}
                  publicToken={order.publicToken}
                  fullWidth
                  variant='outlined'
                  color='secondary'
                  startIcon={<Icon icon='tabler-headset' fontSize={18} />}
                  sx={{ minHeight: 44 }}
                >
                  ติดต่อร้านค้า
                </AuthPingLink>
              }
            />
          )}

          {/* ── feature 00062: จุดนัดรับ (เจอตอน browser QA 2026-08-29 ว่าไม่มีเลย) ──
              วางหลังการ์ดบัญชีรับเงิน = ลำดับที่ผู้ซื้ออ่านจริง: สถานะ → จ่ายยังไง → ไปรับที่ไหน
              เงื่อนไขคือ `isPickupOrder()` SSOT ตัวเดียวกับฝั่งร้าน ไม่ใช่เทียบสตริงเอง */}
          {isPickupOrder(order.fulfillmentMode) && (
            <PickupInfoCard
              shopName={order.shop.shopName}
              shopAddress={order.shop.address}
              handedOverAt={order.handedOverAt}
              status={order.status}
            />
          )}

          {/* ── รายการสินค้า ── */}
          <Card>
            <CardContent>
              <SectionTitle>{vocab.itemsLabel}</SectionTitle>
              {order.items.map((it) => (
                <Box key={it.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1 }}>
                  <Box
                    sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: 'action.hover', flex: 'none', overflow: 'hidden' }}
                  >
                    {it.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.imageUrl} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant='body2' sx={{ fontWeight: 600 }} noWrap>
                      {it.name}
                    </Typography>
                    <Typography variant='caption' color='text.secondary'>
                      x{it.qty}
                    </Typography>
                  </Box>
                  <Typography variant='body2' sx={{ fontWeight: 600, ml: 'auto', whiteSpace: 'nowrap' }}>
                    {baht.format(it.price * it.qty)}
                  </Typography>
                </Box>
              ))}
              <Divider sx={{ my: 1, borderStyle: 'dashed' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant='body2' color='text.secondary'>
                  ยอดรวม
                </Typography>
                <Typography variant='h6' sx={{ fontWeight: 700 }}>
                  {baht.format(order.totalAmount)}
                </Typography>
              </Box>
            </CardContent>
          </Card>

          {/* ── ข้อมูลผู้รับ (mask แล้วที่ server) ── */}
          {(order.maskedPhone || order.maskedShippingAddress) && (
            <Card>
              <CardContent>
                <SectionTitle>ข้อมูลผู้รับ</SectionTitle>
                {/* 🛑 จุดไข่ปลาที่ไม่มีคำอธิบาย อ่านได้ว่า "เว็บนี้ปิดบังอะไรอยู่" ไม่ใช่ "กำลังปกป้องฉัน"
                    ซึ่งกลับหัวกับเจตนาพอดี — คนที่เปิดหน้านี้คือคนที่กลัวโดนโกงอยู่แล้ว
                    บอกเหตุผล + บอกทางออกในประโยคเดียว เปลี่ยนสิ่งที่ดูน่าสงสัยที่สุดในหน้า
                    ให้กลายเป็นหลักฐานว่าระบบทำงานอยู่ */}
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mb: 1.25 }}>
                  <Icon icon='tabler-shield-lock' fontSize={15} style={{ marginTop: 2, flexShrink: 0, color: VERIFIED_INK }} />
                  <Typography variant='caption' color='text.secondary'>
                    ปกป้องข้อมูลของคุณ — แสดงบางส่วนจนกว่าจะเข้าสู่ระบบด้วยเบอร์ที่ใช้สั่งซื้อ
                  </Typography>
                </Box>
                {/* ไม่มีเบอร์ → ไม่ render แถวนี้เลย ไม่ใช่แสดงคำว่า "ไม่ระบุ" */}
                {order.maskedPhone && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
                    <Typography variant='body2' color='text.secondary'>
                      เบอร์ผู้รับ
                    </Typography>
                    <Typography variant='body2' sx={{ fontWeight: 600, letterSpacing: '.05em' }}>
                      {order.maskedPhone}
                    </Typography>
                  </Box>
                )}
                {order.maskedShippingAddress && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
                    <Typography variant='body2' color='text.secondary' sx={{ flex: 'none' }}>
                      ที่อยู่จัดส่ง
                    </Typography>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant='body2' sx={{ fontWeight: 600 }}>
                        จ.{order.maskedShippingAddress.province}
                      </Typography>
                      {/* 🛑 4 ท่อนที่ mask แยกกันถูกต่อด้วยช่องว่างเฉย ๆ ⇒ `••••ม่ 3 •งจิก ••••••••ช้าง`
                          อ่านเป็น "หน้าจอพัง" ไม่ใช่ "ระบบกำลังปกปิดให้อย่างมีเหตุผล" ทั้งที่มีแคปชัน
                          อธิบายอยู่ข้างบนแล้ว — ใส่ prefix ต./อ. ตามธรรมเนียมเดียวกับ `จ.` ที่บรรทัด
                          เหนือขึ้นไปใช้อยู่แล้ว ทำให้ท่อนที่อ่านไม่ออกยังบอกได้ว่ามันคืออะไร
                          เช็ค truthy ก่อนใส่ prefix — field ที่ mask คืน '' ต้องไม่เหลือ `ต.` ลอย ๆ */}
                      <Typography variant='caption' color='text.secondary' sx={{ display: 'block', letterSpacing: '.05em' }}>
                        {order.maskedShippingAddress.line1}
                      </Typography>
                      <Typography variant='caption' color='text.secondary' sx={{ display: 'block', letterSpacing: '.05em' }}>
                        {order.maskedShippingAddress.subdistrict && `ต.${order.maskedShippingAddress.subdistrict} `}
                        {order.maskedShippingAddress.district && `อ.${order.maskedShippingAddress.district} `}
                        {order.maskedShippingAddress.postcode}
                      </Typography>
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── ความช่วยเหลือ — ปุ่มพาไป login ทั้งคู่ (BR-BOE-16/13) ──
              "ติดต่อร้านค้า" แสดงทุกสถานะ · "ยังไม่ได้รับสินค้า" ซ่อนเมื่อออเดอร์ปิดจบแล้ว
              (ไม่ทิ้งปุ่มเทา disabled ไว้ — ไม่มีเหตุผลทางธุรกิจให้แจ้งปัญหาอีก) */}
          <Card>
            <CardContent>
              <SectionTitle>ต้องการความช่วยเหลือ?</SectionTitle>
              {/* 🛑 minHeight 44 ต้องมีทั้งสองปุ่ม — รอบก่อนผมแก้แค่ปุ่มล่างแล้วรายงานว่า
                  "tap target 44px เสร็จแล้ว" ทั้งที่ปุ่มบนยังสูง ~36-38px (outlined+medium =
                  padding 7px + line-box 22px) เป็นการปิดเคสทั้งคลาสจากการแก้ตัวอย่างเดียว */}
              <AuthPingLink
                href={loginHref}
                publicToken={order.publicToken}
                fullWidth
                variant='outlined'
                color='secondary'
                startIcon={<Icon icon='tabler-headset' fontSize={18} />}
                sx={{ minHeight: 44 }}
              >
                ติดต่อร้านค้า
              </AuthPingLink>
              {/* 🛑 เดิมเป็น `variant='text' size='small'` สูงราว 30px ซึ่งต่ำกว่าเกณฑ์ 44px ที่
                  PRODUCT.md ตั้งไว้เองสำหรับกลุ่มผู้สูงวัย/digital-literacy ต่ำ — และคำอธิบาย
                  ใต้ปุ่มเป็น text.disabled (2.30:1) ซึ่งตก AA. รวมสองบรรทัดเป็นปุ่มใบเดียวที่
                  สูงพอและอ่านออก แทนที่จะมีลิงก์จิ๋วคู่กับข้อความจางที่ดูเหมือนข้อความตาย */}
              {!isClosed && (
                <Box sx={{ mt: 2 }}>
                  <AuthPingLink
                    href={loginHref}
                    publicToken={order.publicToken}
                    fullWidth
                    variant='outlined'
                    color='secondary'
                    startIcon={<Icon icon='tabler-alert-circle' fontSize={18} />}
                    sx={{ minHeight: 44, justifyContent: 'flex-start' }}
                  >
                    {/* 🛑 เดิมเขียน "ยังไม่ได้รับสินค้า?" ตายตัว — ไฟล์นี้ผันคำทั้งหน้าด้วย
                        `vocab` อยู่แล้ว (หัวข้อรายการ · ป้ายปุ่มหลัก) แต่บรรทัดนี้หลุด ⇒
                        ร้านบริการ/บ้านพักได้คำว่า "สินค้า" โผล่มาที่เดียวในหน้า
                        ไม่ผันด้วย `noun` เพราะ `"ยังไม่ได้รับ" + noun` ได้ "ยังไม่ได้รับ
                        การเข้ารับบริการ" — เขียนใหม่ให้ไม่ต้องพึ่ง noun เลยแทน */}
                    มีปัญหากับรายการนี้? แจ้งร้านค้า
                  </AuthPingLink>
                </Box>
              )}
            </CardContent>
          </Card>

          <Typography variant='caption' color='text.secondary' sx={{ textAlign: 'center', py: 1 }}>
            ปกป้องการซื้อขายโดย Deep
          </Typography>
        </Box>

        {/* ท้ายหน้าชุดเดียวกับหน้าโปรไฟล์ร้านสาธารณะ — ดูเหตุผลที่ `PublicProfileFooter` */}
        <PublicProfileFooter />
      </Box>

      {/* ── CTA ล่างจอ — จุดเดียวที่พาไป login เป็นหลัก ── */}
      <Box
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
          px: 2,
          pt: `${CTA_BAR_PT}px`,
          // 🛑 (marketing)/layout.tsx ตั้ง viewportFit:'cover' แล้ว env() จึงคืนค่าจริงบนเส้นทางนี้
          // แถบ fixed ของจอที่ล็อกอินแล้วใส่ไว้ถูก แต่แถบนี้ (จอแรกที่ผู้ซื้อทุกคนเจอ) ไม่มีเลย
          // ⇒ บน iPhone ที่มีแถบ home indicator ปุ่มหลักไปนอนอยู่ใต้แถบนั้น
          pb: `calc(${CTA_BAR_PB}px + max(0px, env(safe-area-inset-bottom)))`,
          zIndex: 10,
        }}
      >
        <Box sx={orderContentWidthSx}>
          <AuthPingLink
            href={loginHref}
            publicToken={order.publicToken}
            fullWidth
            variant='contained'
            size='large'
            sx={{ minHeight: CTA_BUTTON_HEIGHT }}
          >
            {ctaLabel}
          </AuthPingLink>
          {/* 🛑 ระยะห่าง 10px + lineHeight 1.7 ไม่ใช่ 6px ที่ค่าเริ่มต้นให้ — ปุ่ม contained ของ
              Vuexy มีเงาสีม่วงแผ่ลงมาใต้กล่องตัวเอง และสระบนของไทย (ื ่ ) กินที่เหนือบรรทัด
              สองอย่างรวมกันทำให้บรรทัดนี้ดูเหมือนถูกปุ่มทับ ทั้งที่ระยะตามกล่องยังไม่ชนกัน */}
          <Typography
            variant='caption'
            color='text.secondary'
            sx={{
              display: 'block',
              textAlign: 'center',
              mt: `${CTA_CAPTION_GAP}px`,
              lineHeight: `${CTA_CAPTION_LINE}px`,
            }}
          >
            ต้องเข้าสู่ระบบก่อนยืนยัน แนบสลิป เขียนรีวิว หรือแจ้งปัญหา
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
