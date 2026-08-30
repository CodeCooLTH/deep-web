'use client'

/**
 * Order detail — Screen 1 (UX-Design-Spec §Screen 1), feature 00015 re-skin (2026-07-07)
 *
 * ทำไม: force-login gate (feature 00015) ทำให้ทุกคนที่เห็นหน้านี้ผ่าน session-verified ownership
 * แล้ว (resolveOrderAccess grant) — ไม่มี lock-screen/guest-phone อีกต่อไป. Re-skin ครั้งนี้เปลี่ยน
 * เฉพาะ layout/token (drop MobileFrame ตาม D1, ลบ hex → MUI theme palette tokens ตาม D2-D4)
 * คงฟังก์ชัน/logic ธุรกิจเดิมทั้งหมด (confirm/cancel/slip/review/tracking-copy/digital-access)
 *
 * Base:
 *   - Banner: `./ShopCover` — ปกใช้ร่วมกับจอ guest (เดิมเรียก `ProfileBanner` ตรง ๆ ที่ 140px
 *     ซึ่งเป็นคนละความสูงและคนละกติกา "ร้านใหม่" กับจอ guest ของออเดอร์ใบเดียวกัน)
 *   - Identity (avatar overlap + chips): pattern จาก `ProfileIdentityBar` ในไฟล์เดียวกัน — ปรับ avatar
 *     84px (แทน 112px), ตัด follow/chat actions ทิ้ง (ไม่มีใน order detail)
 *   - Items + totals: theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/orders/details/OrderDetailsCard.tsx
 *     (Card + totals-row label…value pattern — ตัด TanStack table ทิ้ง)
 *   - Status chip: ORDER_STATUS_META ผ่าน resolveOrderStatusBadge() — SSOT เดียวกับฝั่งร้าน (HR16)
 *   - Cancel dialog / CTA: theme/vuexy/typescript-version/full-version/src/components/dialogs/two-factor-auth/index.tsx
 *     (Dialog/Button variant='contained'/'tonal' pattern)
 *   - Timeline/payment/tracking/digital cards: bespoke Box/Card — recolor ผ่าน theme.palette.* เท่านั้น
 */

import { useEffect, useRef, useState } from 'react'

import Link from 'next/link'

import { canEditReview, formatEditWindowLeft } from '@/lib/review-window'
import { useRouter } from 'next/navigation'

import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Dialog from '@mui/material/Dialog'
import TextField from '@mui/material/TextField'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Divider from '@mui/material/Divider'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'

import CustomAvatar from '@core/components/mui/Avatar'

import {
  getOrderTimeline,
  getServiceTimeline,
  paymentMethodLabel,
  paymentMethodDetail,
  isFinalStepReady,
  isHttpUrl,
  showSlipZone,
  ORDER_STATUS_TONE_TO_MUI,
  getPaymentBadge,
} from '@/lib/order-display'
import { resolveOrderStatusBadge } from '@/lib/order-stage'
import { resolveServiceOrderBadge, shouldShowOrderOrigin } from '@/lib/order-display'
import { isRenderableChannel } from '@/views/pages/user-profile/v2/OfficialChannels'
import { formatDateTimeTH } from '@/lib/format-date'
import { formatOrderNo } from '@/lib/order-no'
import { formatBaht } from '@/lib/format-money'
import type { OrderStatus, TimelineState, TimelineStep } from '@/lib/order-display'
import { getTierColor, getTierLabel } from '@/lib/trust-tier'
import { resolveVerifyBadge } from '@/lib/verify-badge'
import { uploadFileId } from '@/lib/upload-client'
import { uploadMaxSize } from '@/lib/upload-policy'
import { needsPayoutAccount } from '@/lib/shop-payout'
import { isPickupOrder } from '@/lib/order-pickup'

import PublicProfileFooter from '@/views/pages/user-profile/v2/PublicProfileFooter'
import { cardBodySx, cardInlinePadSx, infoBoxSx } from './card-padding'
import { ORDER_TWO_COL_MQ, orderDetailWidthSx } from './content-width'
import CoverActions from './CoverActions'
import PayoutAccountCard from './PayoutAccountCard'
import PickupInfoCard from './PickupInfoCard'
import ShopCover from './ShopCover'
import { ShopChannels, ShopStats } from './ShopEvidence'
import TrustPill, { VERIFIED_INK } from './TrustPill'
import ReviewForm from './ReviewForm'
import SectionTitle from './SectionTitle'
// feature 00024 — การ์ดนัดหมาย (render เฉพาะออเดอร์ที่มีนัด)
import AppointmentCard, { type PublicAppointment } from './AppointmentCard'
import PaymentSummaryCard from './PaymentSummaryCard'
import { getChannelLabel } from '@/lib/chat-channel'

export type PublicOrderData = {
  publicToken: string
  /**
   * 🛑 ต้องเป็น `OrderStatus` ตัวเต็มจาก SSOT — **ห้ามพิมพ์รายชื่อค่าซ้ำที่นี่**
   *
   * ของเดิมเขียนไว้ 4 ค่า ขณะที่ SSOT มี 5 (feature 00056 เพิ่ม `RETURNED` เมื่อ 2026-08-24)
   * แล้ว `page.tsx` แปลงด้วย `order.status as PublicOrderData['status']` —
   * `Order.status` ในฐานเป็น `String` ไม่มี enum กั้น ⇒ **`'RETURNED'` เข้ามาถึงหน้านี้ได้จริง
   * แต่ TypeScript ถูกปิดตาด้วย cast** (`session-exists-is-not-identity.md`: cast คือสิ่งที่ปิดตา
   * ไม่ใช่ตัวช่วย — ชนิดถูก แต่ข้อสมมติผิด)
   *
   * ผลตอนนั้น: `getServiceTimeline` ไม่มีเคส `RETURNED` เลย ⇒ ใบที่คืนของแล้ว
   * ขึ้นรางว่า **"ยังเดินอยู่"** ซึ่งเป็นคำโกหกบนหน้าที่ผู้ซื้อใช้ตัดสินใจ
   * (prod ยังมี 0 ใบ — มันรออยู่เฉย ๆ เหมือนที่ `getOrderTimeline` เขียนเตือนไว้เอง)
   */
  status: OrderStatus
  // เพิ่ม SUBSCRIPTION (FR-UX-7.4 — bug fix: TYPE_LABEL ไม่ครอบคลุม)
  type: 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'SUBSCRIPTION'
  totalAmount: number
  createdAtIso: string
  hasReview: boolean
  review: {
    rating: number
    comment: string | null
    /** feature 00041 — fileId ของรูปแนบ (≤4) */
    images: string[]
    /** เวลาโพสต์ครั้งแรก — ฐานของหน้าต่างแก้ไข 24 ชม. ไม่ใช่เวลาที่แก้ล่าสุด */
    createdAtIso: string
    shopReply: { comment: string; repliedAtIso: string } | null
  } | null
  items: Array<{
    id: string
    name: string
    description: string | null
    qty: number
    price: number
    // thumbnail จาก Product.images[0] raw — T1 S-1; null เมื่อสินค้าไม่มีรูปหรือ item ไม่มี product
    imageUrl: string | null
  }>
  shop: {
    shopName: string
    /**
     * ปกที่ร้านอัปโหลดเอง (`Shop.coverImage` ผ่าน `toFileUrl` แล้ว) — `null` = ยังไม่ได้ตั้ง
     *
     * 🛑 ร้านตั้งปกเองได้มาตั้งแต่ feature 00035 (ตัวจัดหน้าร้าน) แต่หน้านี้
     * **ไม่เคยดึงมาใช้เลย** — วาดแต่ไล่สีตาม tier ⇒ ร้านที่อุตส่าห์ตั้งปกไว้
     * ปกนั้นไม่เคยโผล่บนหน้าที่ลูกค้าเปิดดูออเดอร์ (เจอ 2026-08-29)
     */
    coverImage: string | null
    /** feature 00062 — ที่อยู่ร้าน = จุดนัดรับ (ชุดเดียวกับที่ buildGuestOrderData ส่งก่อนล็อกอิน) */
    address: string | null
    user: {
      displayName: string
      username: string
      trustScore: number
      // raw avatar URL — T1 S-1; null เมื่อ shop owner ยังไม่ตั้ง avatar
      avatar: string | null
    }
  }
  /**
   * ── หลักฐานของร้าน (ชุดเดียวกับที่จอ guest แสดงอยู่แล้ว) ──
   *
   * user 2026-08-11: "ต้องเห็นทั้งคู่ครับ ทั้ง guest และ login"
   *
   * เดิมมีเฉพาะ `GuestOrderData` ⇒ ผู้ซื้อที่ล็อกอินแล้วไม่เคยเห็นสถิติร้านบนหน้านี้เลย
   * ทั้งที่เป็นจอเดียวกันของเรื่องเดียวกัน — ความต่างที่ไม่มีใครตั้งใจให้ต่าง
   *
   * 🛑 ทั้งหมดเป็นตัวเลขรวมของ "ร้าน" ไม่ใช่ของออเดอร์ใบนี้ จึงไม่ใช่ PII ของผู้ซื้อ และเป็น
   * ข้อมูลที่เปิดสาธารณะอยู่แล้วบนโปรไฟล์ร้าน — เอามาแสดงตรงนี้ไม่ได้เปิดอะไรใหม่
   *
   * 🛑 `null` ของ completedOrders/avgRating ไม่ใช่ `0` — 0 แปลว่า "นับแล้วได้ศูนย์"
   * ส่วน null แปลว่า "ยังไม่มีประวัติ จึงเลือกไม่แสดงบล็อกเลย" (ไม่ประจานร้านใหม่ด้วยเลข 0 ตัวโต)
   */
  completedOrders: number | null
  avgRating: number | null
  reviewCount: number
  /**
   * 🛑 5 คีย์นี้เท่านั้น — `ShopChannel` แถวเดียวกันมี `accessTokenEnc` (page access token)
   * และคอลัมน์ตั้งค่าตอบกลับอัตโนมัติของร้านอยู่ด้วย สคีมาเขียนกำกับไว้เองว่า "ห้ามส่งกลับ
   * client ทุกกรณี" — ไฟล์นี้เป็น `'use client'` ทุก field ที่ใส่ในนี้เดินทางข้าม RSC ไปโผล่ใน
   * payload ฝั่งเบราว์เซอร์เสมอ · การเข้ารหัสไว้ไม่ใช่ใบอนุญาตให้หลุดออกไป
   */
  channels: { provider: string; name: string; avatarUrl: string | null; externalId: string; followerCount: number | null }[]
  shipmentTracking: { provider: string; trackingNo: string } | null
  // fields ใหม่จาก frozen contract
  paymentMethod: string | null
  // contract field (page.tsx flatten) — ยังไม่ได้ render ใน detail; เก็บไว้ให้ contract ครบ
  fulfillmentMode: string
  maxVerifyLevel: number
  // ผู้เริ่มยกเลิก — derive copy ใน UI (S-13): 'seller'→"ร้านค้ายกเลิก" / 'buyer'→"คุณยกเลิก"
  cancelInitiator: 'seller' | 'buyer' | null
  // Phase 2 fields (S-2 frozen contract) — UI ใช้ใน S-8/S-9/S-10; type เพิ่มก่อน UI task
  slipFileId: string | null
  /** Shop.id — ใช้เป็นพารามิเตอร์ของ /messages/[shopId] (ยืนยันแล้วว่าเป็น id ไม่ใช่ userId) */
  shopId: string
  /** มีข้อพิพาทเปิดค้างอยู่ไหม — derive ที่ server ด้วย hasOpenDispute() ตัวเดียวกับ 00039 */
  hasOpenDispute: boolean
  disputeOpenedAtIso: string | null
  accessUrl: string | null
  // feature 00024 — วันเข้าใช้บริการ (FR-RSV-05) null = ออเดอร์นี้ไม่มีนัด → ไม่ render การ์ดเลย
  appointment: PublicAppointment | null
  /**
   * feature 00050 (AC-SQ-06) — เงินที่ร้าน **ยืนยันว่าได้รับแล้ว** ของใบนี้
   *
   * 🛑 ไม่ใช่ "สลิปที่แนบไว้" — ลูกค้าแนบสลิปแล้วยอดยังไม่ขยับจนกว่าร้านจะกดยืนยัน (BR-SQ-12)
   * คำบนจอจึงต้องพูดว่า "ร้านยืนยันรับแล้ว" ไม่ใช่ "จ่ายแล้ว" ไม่งั้นลูกค้าที่เพิ่งแนบสลิปจะ
   * เห็นเลขเดิมแล้วคิดว่าระบบไม่รับสลิป
   *
   * null = ยังไม่เคยมีการบันทึกรับเงิน **และ** ไม่มีมัดจำที่ตกลงไว้ → ไม่ render การ์ดเลย
   * (ออเดอร์ขายออนไลน์ทั่วไปไม่ต้องเห็นบล็อกนี้ — AC-SQ-07)
   */
  money: {
    totalAmount: number
    depositAgreed: number
    totalReceived: number
    outstanding: number
    fullyPaid: boolean
    hasDeposit: boolean
    /** รายการที่ร้านยืนยันแล้ว เรียงเก่า→ใหม่ · ไม่มีบันทึกภายในของร้านติดมา */
    entries: { kind: string; amount: number; method: string; receivedAtIso: string }[]
  } | null
  /**
   * feature 00050 (AC-SQ-06) — เพจ/ช่องทางที่ออเดอร์ใบนี้เกิดขึ้น · null = สร้างในระบบตรง ๆ
   *
   * ลูกค้าที่ทักมาจากเพจหนึ่งแล้วได้ลิงก์นี้ ต้องเห็นว่า "ใบนี้คือของที่คุยไว้กับเพจนั้น"
   * — ร้านหนึ่งผูกได้หลายเพจ และชื่อเพจมักไม่เหมือนชื่อร้าน
   */
  originPage: { channel: string; pageName: string | null; pageAvatarUrl: string | null } | null
  /**
   * ร้านนี้เป็นร้านบริการไหม — ใช้เลือก **คำ** บนจอ (ไม่ใช่เลือกว่าจะแสดงอะไร)
   *
   * 🛑 แยกจาก `money !== null` โดยตั้งใจ แม้วันนี้สองอันจะจริงพร้อมกันเสมอ:
   * `money` ตอบว่า *"มีเรื่องเงินให้พูดถึงไหม"* ส่วนตัวนี้ตอบว่า *"เรียกของในบิลว่าอะไร"*
   * วันที่ร้านบริการเปิดบิลเปล่า (ยอด 0 ไม่มีมัดจำ) `money` จะเป็น null แต่คำก็ยังต้องถูก
   * — ผูกคำไว้กับเงินคือบั๊กที่รอเกิด
   */
  isServiceShop: boolean
  /**
   * feature 00062 (TFR-009/TFR-010) — สำเนาบัญชีรับเงินของร้าน ณ เวลาสร้าง/แก้ไขออเดอร์ล่าสุด
   * (freeze) — ไม่ใช่ PII ของผู้ซื้อ ชุดเดียวกับที่ `GuestOrderData` ส่งให้ก่อนล็อกอิน (parity)
   * `null` = ร้านยังไม่ได้ตั้งบัญชี → UI ต้อง fallback (UX-Design-Spec §B7 Edge states)
   */
  payoutSnapshot: import('@/lib/shop-payout').PayoutSnapshot | null
  /** feature 00062 (TFR-007) — เวลาที่ร้านกด "ได้รับเงินแล้ว" เอง — input ที่ 4 ของ getPaymentBadge */
  paymentConfirmedAt: string | null
  /** feature 00062 — เวลาที่ร้านกด "มอบสินค้าแล้ว" (ISO) · `null` = ยังไม่ได้มอบ */
  handedOverAt: string | null
}

type Props = {
  order: PublicOrderData
  /** Action: buyer กด "ยืนยันคำสั่งซื้อ" — transitions PENDING|SHIPPED → CONFIRMED (terminal) */
  onConfirmAction: () => Promise<void>
  /**
   * Action: buyer กด "ยืนยันยกเลิก" — เรียก cancel API
   * render cancel button + dialog เฉพาะเมื่อ status==='PENDING' && onCancel มีค่า
   * parent ตัดสิน canCancel (เช่น เช็ค role / window ยกเลิก)
   */
  onCancel?: () => void | Promise<void>
}

// ── ป้ายสถานะออเดอร์: อ่านจาก SSOT เดียวกับฝั่งร้าน (feature 00041 / HR16) ──
// เดิมไฟล์นี้ประกาศ STATUS_LABEL/STATUS_COLOR ของตัวเองพร้อมคอมเมนต์ว่า "frozen ถ้าแก้ต้องแก้
// ทั้งคู่พร้อมกัน" — ซึ่งคือนิยามซ้ำที่ใช้วินัยคนคุมแทน SSOT และมันเพี้ยนจริง: SHIPPED เขียนว่า
// "จัดส่งแล้ว" ขณะที่ฝั่งร้านเขียน "กำลังจัดส่ง" ⇒ ออเดอร์ใบเดียวกันอ่านคนละคำสองหน้าจอ


// ── TimelineDot — render single dot ตาม state, สีผ่าน theme.palette.* เท่านั้น (ไม่มี hex) ──
/**
 * จุดบนราง — `stepNo` ใส่เลขขั้นให้จุดที่ยังไม่ถึง/กำลังทำ (ราง 4 ขั้นของร้านบริการ)
 * ไม่ส่ง = พฤติกรรมเดิมทุกประการ (ราง 3 ขั้นของร้านขายของ ไม่มีเลข)
 */
function TimelineDot({
  state,
  stepNo,
  completed = false,
}: {
  state: TimelineState
  stepNo?: number
  /**
   * รางนี้เดินจนจบแล้วไหม (มีขั้น `fin` = ออเดอร์ถูกยืนยันปิดงาน)
   *
   * 🛑 เมื่อจบแล้ว **ขั้นที่ผ่านมาต้องเป็นเขียวทั้งราง** ไม่ใช่ม่วง-ม่วง-เขียว
   * หัวหน้าเห็นบนจอจริงแล้วบอกว่า "กลัวคนสับสน" (2026-08-29) — และถูก:
   * สองสีบนรางที่จบแล้วอ่านได้ว่าขั้นแรก ๆ *เป็นคนละเรื่อง* กับขั้นสุดท้าย
   * ทั้งที่ทุกขั้นสำเร็จเหมือนกันหมด
   *
   * ม่วงยังใช้อยู่ระหว่างทาง (ยังไม่จบ) ซึ่งตรงกับ Verified-Means-Green:
   * เขียว = "ยืนยันแล้ว" ⇒ ทาเขียวได้ก็ต่อเมื่อออเดอร์ถูกยืนยันปิดงานจริง
   */
  completed?: boolean
}) {
  /**
   * ขนาดจุด — **มือถือคงของเดิมทุกค่า · จอ ≥861px ขยายเป็น 44px ตามม็อกอัพ**
   *
   * 🛑 หัวหน้าบอกว่ารางบนจอกว้าง "ไม่สวยไม่เด่น" (2026-08-29) ต้นเหตุคือจุด 17–27px
   * ที่ลอยอยู่บนการ์ดกว้าง ~1160px ⇒ เล็กจนอ่านไม่ออกว่าเป็นแกนของหน้า
   * ม็อกอัพใช้ 44px พร้อมวงแหวนรอบจุด (`box-shadow: 0 0 0 6px`) ซึ่งเป็นสิ่งที่ทำให้มัน "เด่น"
   *
   * ขยายเฉพาะจอกว้างเพราะ WebView ของแอปใช้ความกว้างมือถือ และห้ามกระทบ
   */
  /**
   * 🛑 **ต้องรวมทุก override ของจอกว้างไว้ใน `[ORDER_TWO_COL_MQ]` ก้อนเดียว**
   *
   * ร่างแรกแยกเป็น 3 helper (`size` / `halo` / fontSize) แล้ว spread เข้า sx เดียวกัน —
   * ทั้งสามมีคีย์ `[ORDER_TWO_COL_MQ]` เหมือนกัน ⇒ **ตัวหลังเขียนทับตัวหน้าเงียบ ๆ**
   * ผลคือจุดโตเป็น 44px จริงแต่ **วงแหวนหายไปทั้งราง** โดยไม่มี tsc/eslint/เทสตัวไหนฟ้อง
   * (คลาสเดียวกับที่ `content-width.ts` เขียนเตือนไว้เรื่อง MUI ทิ้งคีย์เงียบ ๆ)
   * จับได้ตอนนับ `box-shadow:0 0 0 6px` ใน HTML ที่เสิร์ฟจริงแล้วได้ 0
   */
  const dot = (o: { mobile: number; ring?: string; font?: [string, string] }) => ({
    position: 'relative' as const,
    zIndex: 1,
    width: o.mobile,
    height: o.mobile,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    ...(o.ring ? { boxShadow: `0 0 0 4px ${o.ring}` } : {}),
    ...(o.font ? { fontSize: o.font[0] } : {}),
    [ORDER_TWO_COL_MQ]: {
      width: 44,
      height: 44,
      ...(o.ring ? { boxShadow: `0 0 0 6px ${o.ring}` } : {}),
      ...(o.font ? { fontSize: o.font[1] } : {}),
    },
  })

  /**
   * 🛑 **done = ม่วง · fin = เขียว** (ตามม็อกอัพ และตรงกับ DESIGN.md มากกว่าของเดิม)
   *
   * ของเดิมทาเขียวให้ทุกขั้นที่ผ่านแล้ว แต่ `Verified-Means-Green` สงวนเขียวไว้กับ
   * "ผ่านการยืนยันแล้ว" — ขั้นที่แค่ *เดินผ่านไปแล้ว* ไม่ใช่สิ่งที่ถูกยืนยัน
   * ⇒ เขียวเหลือเฉพาะขั้นสุดท้ายที่ปิดงานจริง ทำให้เขียวกลับมามีความหมาย
   * ม่วงยังอยู่ในเพดาน One Voice เพราะเป็นจุดเล็ก ๆ ไม่ใช่พื้นหลังของบล็อก
   */
  // done: ม่วงทึบ + เช็คขาว
  if (state === 'done') {
    return (
      <Box
        /* Icon ของ @iconify สืบ font-size จากพ่อ ⇒ คุมขนาดเช็คผ่าน `font` */
        sx={{
          ...dot({
            mobile: 17,
            ring: completed
              ? 'var(--mui-palette-success-lightOpacity)'
              : 'var(--mui-palette-primary-lightOpacity)',
            font: ['9px', '20px'],
          }),
          bgcolor: completed ? VERIFIED_INK : 'primary.main',
        }}
      >
        <Icon
          icon='tabler-check'
          style={{
            color: completed
              ? 'var(--mui-palette-success-contrastText)'
              : 'var(--mui-palette-primary-contrastText)',
          }}
        />
      </Box>
    )
  }
  // cur: วงแหวนม่วง พื้นขาว + เลขขั้น
  if (state === 'cur') {
    return (
      <Box
        sx={{
          ...dot({ mobile: 27, ring: 'var(--mui-palette-primary-lightOpacity)' }),
          bgcolor: 'background.paper',
          border: '2px solid',
          borderColor: 'primary.main',
          /* วงกระเพื่อมที่ขั้นปัจจุบัน (ม็อกอัพ `.step.cur .step-dot:after` + `@keyframes pulse`)
             🛑 ต้องหยุดเมื่อผู้ใช้ขอลดการเคลื่อนไหว — `DESIGN.md` ปฏิเสธ "อนิเมชั่นเร่งเร้า"
             และคนที่ตั้งค่านี้ไว้มักตั้งเพราะการเคลื่อนไหวทำให้เวียนหัวจริง ๆ
             วงนี้เป็น `::after` ที่ไม่มีเนื้อหา ⇒ ปิดไปก็ไม่มีข้อมูลใดหาย */
          '@media (prefers-reduced-motion: no-preference)': {
            '&::after': {
              content: '""',
              position: 'absolute',
              inset: -8,
              borderRadius: '50%',
              border: '1px solid',
              borderColor: 'primary.main',
              opacity: 0.35,
              animation: 'deepStepPulse 1.9s ease-out infinite',
            },
            '@keyframes deepStepPulse': {
              '0%': { transform: 'scale(0.9)', opacity: 0.5 },
              '70%': { transform: 'scale(1.18)', opacity: 0 },
              '100%': { opacity: 0 },
            },
          },
        }}
      >
        {/* เลขขั้นแทนจุดทึบเมื่อผู้เรียกส่งมา — ราง 4 ขั้นต้องบอกได้ว่า "นี่คือขั้นที่เท่าไร"
            ไม่งั้นขั้นกลางสองขั้นแยกจากกันด้วยข้อความอย่างเดียว (mockup 2026-08-28) */}
        {stepNo != null ? (
          <Typography
            sx={{ fontSize: '0.6875rem', [ORDER_TWO_COL_MQ]: { fontSize: '1rem' }, fontWeight: 700, color: 'primary.main', lineHeight: 1 }}
          >
            {stepNo}
          </Typography>
        ) : (
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: 'primary.main' }} />
        )}
      </Box>
    )
  }
  // fin: เขียวทึบ + เช็ค — ขั้นเดียวที่ได้เขียว
  if (state === 'fin') {
    return (
      <Box
        sx={{ ...dot({ mobile: 27, ring: 'var(--mui-palette-success-lightOpacity)', font: ['11px', '20px'] }), bgcolor: VERIFIED_INK }}
      >
        <Icon icon='tabler-check' style={{ color: 'var(--mui-palette-success-contrastText)' }} />
      </Box>
    )
  }
  // cx: แดงทึบ + กากบาทขาว (ม็อกอัพ `.step.cx` เป็นทึบ ไม่ใช่พื้นจาง)
  if (state === 'cx') {
    return (
      <Box
        sx={{ ...dot({ mobile: 25, ring: 'var(--mui-palette-error-lightOpacity)', font: ['13px', '20px'] }), bgcolor: 'error.main' }}
      >
        <Icon icon='tabler-x' style={{ color: 'var(--mui-palette-error-contrastText)' }} />
      </Box>
    )
  }
  // mute / up: กลวง — mute จางกว่า (ไม่ relevant หลัง cancel)
  return (
    <Box
      sx={{
        ...dot({ mobile: stepNo != null ? 23 : 17 }),
        bgcolor: 'background.paper',
        /* 🛑 `up` (ยังไม่ถึง) กับ `mute` (จะไม่เกิดขึ้นแล้ว) เคยต่างกันแค่ความจาง —
           ซึ่งเป็นการสื่อความหมายด้วยสีอย่างเดียว (WCAG 1.4.1) และบนจอสว่างแยกไม่ออกจริง
           เส้นประ = "ขั้นนี้ถูกข้ามไป" เป็นรูปร่างที่อ่านได้โดยไม่ต้องเทียบกับขั้นอื่น */
        border: '2px',
        borderStyle: state === 'mute' ? 'dashed' : 'solid',
        borderColor: 'divider',
        opacity: state === 'mute' ? 0.42 : 1,
      }}
    >
      {stepNo != null && (
        <Typography
          sx={{ fontSize: '0.6875rem', [ORDER_TWO_COL_MQ]: { fontSize: '1rem' }, fontWeight: 500, color: 'text.secondary', lineHeight: 1 }}
        >
          {stepNo}
        </Typography>
      )}
    </Box>
  )
}

// ── connector line color ตาม state ──
function connectorColor(state: TimelineState, completed = false): string {
  /* 🛑 เส้นต้องพูดภาษาเดียวกับจุด — ระหว่างทางจุด `done` เป็นม่วง เส้นจึงม่วง
     **แต่เมื่อรางจบแล้ว ทั้งเส้นทั้งจุดต้องเป็นเขียวพร้อมกัน** ไม่งั้นรางที่สำเร็จ
     จะมีสองสีคนละความหมายอยู่ในเส้นเดียว (หัวหน้าทัก 2026-08-29 ว่าสับสน) */
  if (state === 'fin') return 'var(--mui-palette-success-main)'
  if (state === 'done') return completed ? 'var(--mui-palette-success-main)' : 'var(--mui-palette-primary-main)'
  if (state === 'cur') return 'var(--mui-palette-primary-main)'
  if (state === 'cx') return 'var(--mui-palette-error-main)'
  return 'var(--mui-palette-divider)'
}

/**
 * สีป้ายตามสถานะขั้น — **กฎเดียว: ป้ายเป็นหมึก · สถานะอยู่ที่จุด**
 *
 * ## 🛑 ทำไมป้ายไม่ใช้สีตามสถานะอีกต่อไป
 *
 * วัดค่าจริงบนพื้น `background.paper` (#FFF) ด้วยสูตร WCAG แล้ว **4 ใน 5 กิ่งเดิมตก AA**:
 *
 *     cur   info.main    #00BAD1   2.35:1  ❌   ← แย่ที่สุด และเป็นคำที่บอก "ตอนนี้อยู่ขั้นไหน"
 *     fin   success.dark #24B364   2.72:1  ❌       ซึ่งเป็นเหตุผลทั้งหมดที่รางนี้มีอยู่
 *     cx    error.main   #FF4C51   3.28:1  ❌
 *     up    text.disabled          2.30:1  ❌
 *     done  text.primary          10.00:1  ✅
 *
 * เกณฑ์คือ 4.5:1 และป้ายพวกนี้อยู่ที่ 12px — ต่ำกว่าเกณฑ์อยู่แล้วก่อนพูดถึงขนาด
 * DESIGN.md ยังห้ามเขียวเป็นตัวหนังสือบนพื้นขาวไว้ตรงตัวด้วย (ต้องใช้ Verified Ink)
 *
 * ## ทางแก้ที่เลือก
 *
 * ป้าย = **ข้อความให้อ่าน** ⇒ ใช้หมึกที่อ่านออกเสมอ · สถานะแบกด้วย **จุด** (เช็ก/วงแหวน/กากบาท
 * ต่างกันด้วยรูปร่าง ไม่ใช่แค่สี — WCAG 1.4.1) + **น้ำหนักตัวอักษร**
 *
 * ไม่ใช่การ "สลับเฉด" ตามที่ `contrast-fix-keeps-hue.md` ห้าม — เฉดยังอยู่ครบที่จุด
 * สิ่งที่ย้ายคือ *ตัวแบกความหมาย* จากของที่อ่านไม่ออกไปยังของที่อ่านออก
 * (ท่าเดียวกับที่ชิปเวลาคิวงานเคยย้ายความหมายจาก "จุด 6px" ไปที่ "สีตัวหนังสือ" เมื่อ 2026-08-09)
 */
function labelColor(state: TimelineState): 'text.primary' | 'text.secondary' {
  // ขั้นที่เกิดขึ้นแล้ว/กำลังเกิด/จบแบบไม่ได้ทำ = ข้อเท็จจริงที่ต้องอ่านชัด
  if (state === 'cur' || state === 'fin' || state === 'cx' || state === 'done') return 'text.primary'
  // ยังมาไม่ถึง / ไม่เกี่ยวกับใบนี้ — ยังต้องอ่านออก (5.22:1) แค่เบากว่า
  return 'text.secondary'
}

/**
 * HorizontalTimeline — รางสถานะ กว้างเท่ากันทุกขั้น (ใช้ได้ทั้ง 3 และ 4 ขั้น)
 *
 * 🛑 ร้านบริการใช้ **4 ขั้น** ตั้งแต่ 2026-08-28 (`getServiceTimeline`) ⇒ แต่ละคอลัมน์เหลือ 25%
 * ของความกว้าง ซึ่งที่ 360px คือ ~78px ต่อขั้น และป้ายไทยยาวสุด ("ลูกค้ายืนยันนัด") ไม่มีช่องว่าง
 * ให้เบราว์เซอร์ตัดบรรทัดตามปกติ
 *
 * ทางแก้ของ mockup ต้นทางคือย่อฟอนต์ลงเหลือ **9px** ที่จอ ≤390 — ต่ำกว่าเพดานที่อ่านออกจริง
 * จึงคงคำเต็มไว้ตาม ref แล้วให้ **ตกบรรทัดที่ 11px** แทน (Hard Rule 6: เนื้อหาตาม ref ·
 * ตัวอักษร/เลย์เอาต์ตามธีมของเรา)
 *
 * `minWidth: 0` ที่คอลัมน์ — flex item มี `min-width:auto` เป็นค่าตั้งต้น ป้ายที่ยาวกว่าคอลัมน์
 * จะ **ดันรางให้กว้างเกินจอ** แทนที่จะตกบรรทัด (บทเรียน `flex-header-truncation.md`)
 */
/**
 * คำอธิบายสถานะของขั้น สำหรับ screen reader — ต้องครบทุกค่าของ `TimelineState`
 * (`Record` บังคับด้วย tsc ⇒ เพิ่มสถานะใหม่แล้วลืมเขียนคำ = คอมไพล์ไม่ผ่าน ไม่ใช่เงียบ)
 */


/**
 * แถวการกระทำในการ์ด "ต้องการความช่วยเหลือ?" — ท่าเดียวกับแถวออเดอร์ของ `/dashboard`
 *
 * โครง: แผ่นไอคอนสีอ่อน 44px → ชื่อ + คำอธิบาย → ลูกศรขวา · ทั้งแถวกดได้
 *
 * 🛑 แผ่นไอคอนใช้ `CustomAvatar skin='light'` ตัวเดียวกับที่ `/dashboard`, `/orders`
 * และการ์ดช่องทางชำระเงินบนหน้านี้ใช้อยู่ — ห้ามประกอบพื้นสี/รัศมีเอง ไม่งั้นได้แผ่น
 * ที่หน้าตาเกือบเหมือนแต่ไม่เท่ากัน ซึ่งเป็นสิ่งที่สายตาจับได้แต่บอกไม่ถูกว่าอะไรผิด
 *
 * Base: src/app/(marketing)/(buyer-app)/dashboard (แถว "คำสั่งซื้อล่าสุด")
 */
function HelpActionRow({
  icon,
  tone,
  title,
  desc,
  ...rest
}: {
  icon: string
  tone: 'primary' | 'warning'
  title: string
  desc: string
} & Record<string, unknown>) {
  return (
    <Box
      {...rest}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        inlineSize: '100%',
        /* 56 > 44 — ทั้งแถวเป็นพื้นที่แตะ ไม่ใช่แค่ตัวอักษร (`PRODUCT.md` §Accessibility) */
        minHeight: 56,
        px: 1.25,
        py: 1,
        borderRadius: 2,
        textAlign: 'start',
        /* 🛑 `'none'` ไม่ใช่ `0` — `border: 0` มีสตริง `order: 0` อยู่ข้างใน แล้วด่านที่
           สแกนหา `order:` ของคอลัมน์จะจับมาเป็น "ใบที่ลืมตั้ง order" (แก้ที่ด่านแล้ว
           แต่เลี่ยงการเขียนที่ชนคำไว้ด้วย จะได้ไม่ต้องพึ่ง lookbehind อย่างเดียว) */
        border: 'none',
        bgcolor: 'transparent',
        color: 'inherit',
        font: 'inherit',
        cursor: 'pointer',
        textDecoration: 'none',
        transition: 'background-color .15s ease',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <CustomAvatar skin='light' variant='rounded' color={tone} size={44}>
        <Icon icon={icon} fontSize={22} />
      </CustomAvatar>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant='body2' sx={{ fontWeight: 500, color: 'text.primary' }}>
          {title}
        </Typography>
        <Typography variant='caption' sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.5 }}>
          {desc}
        </Typography>
      </Box>
      {/* ลูกศรคือภาษาของ "ไปทำอะไรต่อ" — แถวที่ไม่มีมันอ่านเป็นข้อมูล ไม่ใช่ของที่กดได้ */}
      <Icon
        icon='tabler-chevron-right'
        fontSize={18}
        aria-hidden='true'
        style={{ flexShrink: 0, color: 'var(--mui-palette-text-secondary)' }}
      />
    </Box>
  )
}

const STEP_STATE_SR_TEXT: Record<TimelineState, string> = {
  done: 'ผ่านแล้ว',
  cur: 'ขั้นตอนปัจจุบัน',
  fin: 'เสร็จสมบูรณ์',
  cx: 'หยุดที่ขั้นนี้',
  mute: 'ข้ามขั้นนี้',
  up: 'ยังไม่ถึง',
}

function HorizontalTimeline({ steps, numbered = false }: { steps: TimelineStep[]; numbered?: boolean }) {
  /**
   * 🛑 แถวคำอธิบายต้องหายไปทั้งแถวเมื่อไม่มีขั้นไหนมี `note`
   *
   * `getOrderTimeline()` (ราง 3 ขั้นของร้านขายออนไลน์) **ไม่เคยตั้ง `note` เลยสักเคส** ⇒
   * ถ้าเรนเดอร์เสมอด้วย `minHeight` ออเดอร์ขายออนไลน์ **ทุกใบ** จะได้แถบว่าง ~27px
   * เต็มความกว้างใต้ราง เพราะโค้ดที่จองที่ให้ vertical อีกอันหนึ่ง
   *
   * `minHeight` ยังจำเป็นอยู่ **ภายในรางที่มี note จริง** (ให้ทุกคอลัมน์สูงเท่ากันแม้บางขั้น
   * ไม่มีคำอธิบาย) — เงื่อนไขนี้จึงเป็นระดับ "ราง" ไม่ใช่ระดับ "ขั้น"
   */
  const hasAnyNote = steps.some(s => s.note)
  /**
   * รางนี้จบแล้วไหม — มีขั้น `fin` แปลว่าออเดอร์ถูกยืนยันปิดงาน (`status === 'CONFIRMED'`)
   * 🛑 อ่านจาก **สถานะของขั้น** ไม่ใช่รับเป็น prop จากผู้เรียก — ผู้เรียกอาจส่งไม่ตรงกับ
   * รางที่ตัวเองส่งมา แล้วสีจะไปคนละทางกับจุด โดยไม่มีอะไรฟ้อง
   */
  const completed = steps.some(s => s.state === 'fin')
  return (
    /**
     * 🛑 รางนี้สื่อสถานะด้วย **สีกับรูปร่างของจุด** ล้วน ๆ — คนที่ใช้ screen reader จึงได้ยิน
     * แค่รายชื่อขั้นเรียงกัน ไม่มีทางรู้เลยว่าตอนนี้อยู่ขั้นไหน ทั้งที่นั่นคือคำถามเดียว
     * ที่หน้านี้มีไว้ตอบ ⇒ ประกาศเป็นรายการ + บอกสถานะเป็นข้อความคู่กับทุกขั้น
     * (`aria-name-requires-supporting-role.md`: `role` ที่รองรับชื่อเท่านั้นที่ label มีผล —
     * `list`/`listitem` รองรับ จึงใส่ได้จริง ไม่ใช่ `<div>` เปล่าที่ label ถูกทิ้ง)
     */
    <Box role='list' sx={{ display: 'flex', pb: 0.25 }}>
      {steps.map((step, i) => (
        <Box
          key={i}
          role='listitem'
          aria-current={step.state === 'cur' ? 'step' : undefined}
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          {/* dotbox — connector line ทำผ่าน ::before */}
          <Box
            sx={{
              height: 30,
              [ORDER_TWO_COL_MQ]: { height: 56 },
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              '&::before':
                i === 0
                  ? { display: 'none' }
                  : {
                      content: '""',
                      position: 'absolute',
                      top: '50%',
                      right: '50%',
                      width: '100%',
                      /* ม็อกอัพใช้เส้น 2px — เส้นหนาแข่งกับจุดจนรางอ่านเป็น "แถบ" ไม่ใช่ "ขั้น" */
                      height: 3,
                      [ORDER_TWO_COL_MQ]: { height: 2 },
                      bgcolor: connectorColor(step.state, completed),
                      transform: 'translateY(-50%)',
                      zIndex: 0,
                      borderRadius: 1,
                    },
            }}
          >
            <TimelineDot state={step.state} stepNo={numbered ? i + 1 : undefined} completed={completed} />
          </Box>
          {/* label */}
          <Typography
            variant='caption'
            sx={{
              fontWeight: step.state === 'cur' || step.state === 'fin' || step.state === 'cx' ? 700 : 500,
              color: labelColor(step.state),
              mt: 0.75,
              lineHeight: 1.25,
              /* 🛑 ขนาดต้องอยู่บน ramp ของ DESIGN.md — ค่าเดิม 0.6875rem (11px) เป็นขั้น
                 **dense-overlay** ซึ่ง DESIGN.md เขียนตรงตัวว่า "ใช้เฉพาะบนพื้นภาพเท่านั้น
                 ห้ามใช้เป็นข้อความบนพื้นสีเรียบ"

                 ผันตาม **จำนวนขั้น** ไม่ใช่ตาม breakpoint: ราง 3 ขั้นมีที่ว่างเหลือเฟือ
                 (~104px/คอลัมน์ ที่จอ 360) ไม่มีเหตุผลให้ย่อ — ย่อเพราะราง 4 ขั้นแน่นกว่า
                 แล้วลากร้านขายออนไลน์มาแบกด้วยคือการให้ vertical ที่ไม่ได้ขอปัญหานี้จ่ายแทน */
              fontSize: steps.length > 3 ? '0.75rem' : '0.8125rem',
              px: 0.25,
              maxWidth: '100%',
              /* เบราว์เซอร์สมัยใหม่ตัดบรรทัดไทยตามพจนานุกรมให้เอง — `break-word` เป็นตัวสำรอง
                 สำหรับเอนจินที่ไม่ตัด ไม่ให้ป้ายล้นออกนอกคอลัมน์ */
              wordBreak: 'break-word',
              /* ตรึงความสูงให้ทุกคอลัมน์เริ่มบรรทัดเดียวกัน ไม่ว่าป้ายไหนจะตก 1 หรือ 2 บรรทัด */
              minHeight: '2.5em',
            }}
          >
            {step.label}
          </Typography>

          {/* บรรทัดอธิบาย — มีเฉพาะขั้นที่มีอะไรจะบอก (`note` เป็น optional ที่ SSOT)
              🛑 จองที่ไว้ตายตัวแม้ไม่มีข้อความ เพื่อให้ทุกคอลัมน์เริ่มบรรทัดถัดไปตรงกัน
              ไม่งั้นแถวเวลาของแต่ละขั้นจะเหลื่อมกันตามความยาวของ note */}
          {/* ข้อความสถานะที่ตาไม่เห็นแต่ screen reader อ่าน — คู่กับสีของจุดเสมอ
              ใช้เทคนิค clip แทน `display:none` เพราะ `display:none` ถูกข้ามทั้งก้อน */}
          <Box
            component='span'
            sx={{
              position: 'absolute',
              /**
               * 🛑 **ต้องเป็นสตริง `'1px'` ไม่ใช่เลข `1`**
               *
               * ระบบ `sizing` ของ MUI ตีความเลข ≤ 1 ใน `width`/`height` เป็น **สัดส่วน**
               * ⇒ `width: 1` = `100%` ไม่ใช่ 1px · กล่องที่ตั้งใจให้เล็ก 1 พิกเซล
               * จึงกลายเป็นกล่องกว้างเต็มจอ **4 ใบ** วางซ้อนกันแบบ absolute
               * แล้วดันความกว้างของเอกสารจาก 1440 เป็น **1870** ⇒ ทั้งหน้าเลื่อนซ้ายขวาได้
               *
               * วัดด้วยเบราว์เซอร์จริงถึงเจอ — `tsc`/eslint/เทสผ่านหมด เพราะ `1` เป็นค่าที่
               * ถูกต้องตามชนิดทุกประการ สิ่งที่ผิดคือ *หน่วย* ที่ MUI เติมให้
               */
              width: '1px',
              height: '1px',
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
              whiteSpace: 'nowrap',
            }}
          >
            {STEP_STATE_SR_TEXT[step.state]}
          </Box>

          {hasAnyNote && (
            <Typography
              variant='caption'
              sx={{
                display: 'block',
                mt: 0.25,
                px: 0.25,
                /* 0.75rem = ขั้น Overline ที่มีอยู่จริงใน ramp ของ DESIGN.md
                   ค่าเดิม 0.625rem (10px) ไม่มีอยู่ใน ramp เลย และ DESIGN.md บันทึกบทเรียนไว้เองว่า
                   "หน้าร้านสาธารณะเคยมี 11 ขนาดในหน้าเดียว … อ่านออกว่าประกอบขึ้นมา" */
                fontSize: '0.75rem',
                lineHeight: 1.35,
                color: 'text.secondary',
                wordBreak: 'break-word',
                minHeight: '2.7em',
              }}
            >
              {step.note ?? ''}
            </Typography>
          )}

        </Box>
      ))}
    </Box>
  )
}

// ── ItemThumbnail — รูปสินค้า + fallback placeholder ──
function ItemThumbnail({
  imageUrl,
  name,
  grayscale,
}: {
  imageUrl: string | null
  name: string
  grayscale: boolean
}) {
  return (
    <Avatar
      variant='rounded'
      src={imageUrl ?? undefined}
      alt={name}
      sx={{
        width: 44,
        height: 44,
        /* DESIGN.md §Shapes — ภาชนะ 8px · เดิม 2.25 (13.5px) เป็นค่าที่ไม่มีบนบันได
           ของเอกสาร (4/6/8/10 + full) เคยขึ้นทะเบียนไว้ในด่านว่า "media คนละคลาส"
           user เคาะ 2026-08-30 ให้ยึด DESIGN.md ทั้งหน้า จึงลงบันไดตามเอกสาร */
        borderRadius: '8px',
        flexShrink: 0,
        bgcolor: 'action.hover',
        color: 'text.secondary',
        ...(grayscale ? { filter: 'grayscale(.4)', opacity: 0.75 } : {}),
      }}
    >
      <Icon icon='tabler-package' fontSize={20} />
    </Avatar>
  )
}

export default function OrderDetailMobile({ order, onConfirmAction, onCancel }: Props) {
  const [submitting, setSubmitting] = useState(false)
  // state สำหรับ tracking copy icon (เปลี่ยน icon → tabler-check 2 วิ)
  const [copied, setCopied] = useState(false)
  /* 🛑 แยกจาก `copied` ของเลขพัสดุ — ใช้ตัวเดียวกันแล้วกดคัดลอกเลขงาน จะทำให้เช็กถูก
     ไปโผล่ที่ปุ่มคัดลอกเลขพัสดุด้วย (คนละก้อนคนละความหมาย อยู่บนจอเดียวกันได้พร้อมกัน) */
  const [copiedOrderNo, setCopiedOrderNo] = useState(false)
  // state สำหรับ cancel confirm dialog
  const router = useRouter()
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  // feature 00041 — แจ้งปัญหา (dispute). disputeOpened เก็บสถานะฝั่ง client หลังกดสำเร็จ
  // เพื่อสลับการ์ดเป็นแถบ "แจ้งปัญหาแล้ว" ทันทีโดยไม่ต้องรอ refresh
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false)
  const [disputeNote, setDisputeNote] = useState('')
  const [disputing, setDisputing] = useState(false)
  const [disputeOpened, setDisputeOpened] = useState(order.hasOpenDispute)
  const [disputeOpenedAt, setDisputeOpenedAt] = useState(order.disputeOpenedAtIso)
  // feature 00041 — โหมดแก้ไขรีวิว (BR-BOE-17)
  const [editingReview, setEditingReview] = useState(false)
  const [deletingReview, setDeletingReview] = useState(false)
  const [deleteReviewDialogOpen, setDeleteReviewDialogOpen] = useState(false)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

  /**
   * ความสูงจริงของแถบ CTA ล่างจอ — เอาไปกันที่ให้ท้ายหน้าเลื่อนพ้นแถบได้
   *
   * 🛑 วัดเอา ไม่ใช่ฮาร์ดโค้ด: แถบสูงไม่เท่ากันตามเบรกพอยต์ (บนจอกว้างปุ่มยกเลิกมีข้อความ
   * ไม่ใช่ไอคอนล้วน) และยังบวก `env(safe-area-inset-bottom)` ของเครื่องที่มี home indicator
   * ⇒ ตัวเลขคงที่ตัวเดียวจะผิดอย่างน้อยหนึ่งเคสเสมอ
   *
   * อาการที่วัดได้บนจอจริง 2026-08-30 (iPhone 390×844, เลื่อนสุดหน้าแล้ว):
   * แถบเริ่มที่ y=786 แต่บรรทัด "© 2569 Deep" จบที่ y=857 ⇒ ท้าย footer 71px
   * **เลื่อนลงไปดูไม่ได้เลย** เพราะหน้าเลื่อนสุดแล้ว — แถบ `fixed` ไม่กินที่ใน flow
   */
  const ctaBarRef = useRef<HTMLDivElement | null>(null)
  const [ctaBarHeight, setCtaBarHeight] = useState(0)


  /**
   * ลบรีวิว — เป็น soft delete ที่ฝั่ง server (แถวยังอยู่เพื่อกันการเขียนใหม่)
   * ผู้ใช้ไม่ต้องรู้เรื่องนั้น แต่ต้องรู้ว่า "ลบแล้วเขียนใหม่ไม่ได้" จึงบอกไว้ในกล่องยืนยัน
   */
  const handleDeleteReview = async () => {
    setDeletingReview(true)
    try {
      const res = await fetch(`/api/orders/${order.publicToken}/review`, { method: 'DELETE' })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        toast.error(data?.error ?? 'ลบรีวิวไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
        return
      }
      toast.success('ลบรีวิวแล้ว')
      setDeleteReviewDialogOpen(false)
      router.refresh()
    } catch {
      toast.error('ลบรีวิวไม่สำเร็จ กรุณาตรวจสัญญาณแล้วลองใหม่')
    } finally {
      setDeletingReview(false)
    }
  }


  /**
   * แจ้งปัญหา — เรียก endpoint เดิมของ 00039 ตรง ๆ ไม่แก้ business logic ใด ๆ
   * 409 = ออเดอร์ปิดจบไปแล้ว (เกิดได้ถ้าร้านเพิ่งกดยืนยันระหว่างที่โมดัลเปิดค้าง)
   */
  const handleDispute = async () => {
    setDisputing(true)
    try {
      const res = await fetch(`/api/orders/${order.publicToken}/dispute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(disputeNote.trim() ? { note: disputeNote.trim() } : {}),
      })
      const data = (await res.json().catch(() => null)) as { disputeOpenedAt?: string; error?: string } | null
      if (!res.ok) {
        toast.error(data?.error ?? 'แจ้งปัญหาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
        return
      }
      setDisputeOpened(true)
      setDisputeOpenedAt(data?.disputeOpenedAt ?? new Date().toISOString())
      setDisputeDialogOpen(false)
      toast.success('แจ้งปัญหาแล้ว ร้านค้าจะเห็นข้อความนี้')
    } catch {
      toast.error('แจ้งปัญหาไม่สำเร็จ กรุณาตรวจสัญญาณแล้วลองใหม่')
    } finally {
      setDisputing(false)
    }
  }

  const [cancelling, setCancelling] = useState(false)

  // ── S-8/S-9: slip upload state ──
  // ทำไม: slipFileId เริ่มจาก server (order.slipFileId) — buyer อัปโหลดใหม่ update local state
  const [slipFileId, setSlipFileId] = useState(order.slipFileId)
  // object URL สร้างใน session นี้เท่านั้น — ไม่ fetch กลับจาก server (guest ไม่มี auth)
  const [slipPreview, setSlipPreview] = useState<string | null>(null)
  const [slipName, setSlipName] = useState<string | null>(null)
  const [uploadingSlip, setUploadingSlip] = useState(false)
  // hidden file input ref — trigger ผ่าน handleSlipClick
  const slipInputRef = useRef<HTMLInputElement>(null)

  // confirm เมื่อ PENDING หรือ SHIPPED (ผู้ซื้อกดรับ = terminal CONFIRMED)
  const canConfirm = order.status === 'PENDING' || order.status === 'SHIPPED'

  /* ResizeObserver ไม่ใช่วัดครั้งเดียวตอน mount: ปุ่มยกเลิกเปลี่ยนจากไอคอนเป็นข้อความตอน
     หมุนจอ/ย่อหน้าต่าง แล้วแถบสูงขึ้น — ถ้าวัดครั้งเดียวที่ว่างจะขาดไปเงียบ ๆ */
  useEffect(() => {
    const el = ctaBarRef.current
    if (!el) {
      setCtaBarHeight(0)
      return
    }
    const sync = () => setCtaBarHeight(el.getBoundingClientRect().height)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [canConfirm])

  // review เมื่อ CONFIRMED หรือ SHIPPED (spec §3 public order gate)
  const canReview =
    !order.hasReview &&
    (order.status === 'CONFIRMED' || order.status === 'SHIPPED')
  /**
   * ป้ายสถานะที่จะแสดง — ร้านบริการได้ป้ายจากเงิน ที่เหลือได้ป้ายเดิม
   * (คำ/สี/โทน มาจาก SSOT ตัวเดียวทั้งคู่ ห้ามประกอบเองที่นี่ — HR16)
   */
  const statusBadge = order.money
    ? resolveServiceOrderBadge({
        status: order.status,
        money: order.money,
        hasAppointment: order.appointment !== null,
      })
    : resolveOrderStatusBadge(order.status)

  /**
   * feature 00062 (UX-Design-Spec §B8) — badge สถานะการ "ชำระเงิน" คนละแกนกับ `statusBadge`
   * ข้างบนซึ่งเป็นสถานะ "ออเดอร์" (PENDING/SHIPPED/CONFIRMED/…) — ใช้เฉพาะในหัวการ์ด
   * PayoutAccountCard เดียวกับที่จอ guest เรียก ตัวเดียวกันทั้งสองจอ (HR16)
   */
  const paymentBadge = getPaymentBadge(order.status, order.paymentMethod, order.slipFileId, order.paymentConfirmedAt)

  const isCancelled = order.status === 'CANCELLED'

  // แสดง cancel button เฉพาะ PENDING + onCancel มีค่า (parent ตัดสิน)
  const showCancel = order.status === 'PENDING' && !!onCancel

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await onConfirmAction()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ยืนยันไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopyTracking = async (trackingNo: string) => {
    try {
      await navigator.clipboard.writeText(trackingNo)
      setCopied(true)
      toast.success('คัดลอกเลข tracking แล้ว')
      // รีเซ็ต icon กลับหลัง 2 วินาที
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('คัดลอกไม่สำเร็จ — กดค้างที่เลขพัสดุเพื่อคัดลอกเองได้')
    }
  }

  const handleCancelConfirm = async () => {
    if (!onCancel) return
    setCancelling(true)
    try {
      await onCancel()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
      toast.error(message)
    } finally {
      setCancelling(false)
      setCancelDialogOpen(false)
    }
  }

  /**
   * เพดานสลิป — อ่านจากตัวเดียวกับที่ `/api/uploads/commit` บังคับจริง
   *
   * 🛑 เดิมมีเลข 3 ชุดที่ไม่ตรงกันสักชุด: จอเขียน "≤ 10MB" · client ตัดที่ 5MB · และเส้นทาง
   * จริงเป็น multipart ผ่าน body ของ API route ซึ่ง Vercel ตอบ 413 ที่ **4.5MB** ก่อนถึงโค้ดเรา
   * ด้วย body ที่ไม่ใช่ JSON ⇒ `res.json()` พัง ตกไปข้อความ "แนบสลิปไม่สำเร็จ" ซึ่งเชิญให้ผู้ใช้
   * กดวนสิ่งที่ไม่มีวันสำเร็จ — ตอนที่เขากำลังพยายามพิสูจน์ว่าโอนเงินไปแล้ว
   * (`docs/conventions/upload-body-size-limit.md`)
   */
  const SLIP_MAX_MB = Math.floor(uploadMaxSize('DOCUMENT') / (1024 * 1024))

  // ── S-8/S-9: slip upload handler ──
  // feature 00015 TD-004: ไม่ต้องส่ง contact อีกต่อไป — server ยืนยันด้วย session+ownership
  const handleSlipUpload = async (file: File) => {
    setUploadingSlip(true)
    try {
      // direct upload: ticket → PUT เข้า storage ตรง → commit
      // ห้ามกลับไปส่งไฟล์ผ่าน body ของ API route (ตัน 4.5MB — ดู SLIP_MAX_MB ข้างบน)
      // ข้อความ error ที่ uploadFileId โยนมาเป็นภาษาไทยพร้อมโชว์ และบอกขนาดจริงที่เกิน
      const fileId = await uploadFileId(file, 'DOCUMENT')

      const res = await fetch(`/api/orders/${order.publicToken}/slip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      })

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null
        toast.error(err?.error || 'แนบสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
        return
      }

      const data = (await res.json()) as { slipFileId: string }
      setSlipFileId(data.slipFileId)
      // object URL ใช้ใน session นี้เท่านั้น — revoke เมื่อ component unmount ไม่บังคับ (short-lived page)
      setSlipPreview(URL.createObjectURL(file))
      setSlipName(file.name)
      toast.success('แนบสลิปแล้ว')
    } catch (err) {
      // uploadFileId โยน Error ที่มีข้อความไทยบอกสาเหตุจริง (ไฟล์ใหญ่เกิน/ชนิดไม่รองรับ)
      // ใช้ก่อนข้อความกลางเสมอ — "ลองอีกครั้ง" กับไฟล์ที่ใหญ่เกินคือคำเชิญให้ทำสิ่งที่ไม่มีวันสำเร็จ
      toast.error(err instanceof Error ? err.message : 'แนบสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setUploadingSlip(false)
      // reset ค่า input เพื่อให้เลือกไฟล์เดิมได้อีกครั้ง (onChange จะไม่ fire ถ้า value ไม่เปลี่ยน)
      if (slipInputRef.current) slipInputRef.current.value = ''
    }
  }

  const trustScore = order.shop.user.trustScore
  // ใช้ SSOT helper จาก @/lib/trust-tier
  const tierLabel = getTierLabel(trustScore)
  const tierColor = getTierColor(trustScore)
  /* SSOT เดียวกับจอ guest — ห้าม hardcode เงื่อนไข/สีเอง (ดูหมายเหตุที่ชิป) */
  const verifyBadge = resolveVerifyBadge(order.maxVerifyLevel)
  const avatarLetter = order.shop.user.displayName.slice(0, 1)

  // timeline จาก order-display.ts (T2/T3) — status pill ใช้ SSOT ด้านบนแทน getStatusPill (freeze ตาม UX spec)
  /**
   * เส้นทางที่ลูกค้าเห็น — ร้านบริการใช้ชุดของตัวเอง (จองแล้ว → เข้ารับบริการ → ยืนยันแล้ว)
   *
   * 🛑 ชุดเดิมสำหรับ NO_SHIPPING เขียนว่า "ส่งมอบแล้ว" เป็นขั้นปัจจุบันตั้งแต่บิลยัง PENDING
   * ⇒ ลูกค้าที่ยังไม่ได้รับบริการเห็นคำที่อ้างสิ่งที่ยังไม่เกิด บนหน้าที่เขาใช้ตัดสินใจโอนเงิน
   */
  const timeline = order.isServiceShop
    ? getServiceTimeline({
        status: order.status,
        serviceStart: order.appointment?.startIso ?? null,
        /* เส้นแบ่ง "เลยเวลานัดแล้ว" ใช้ปลายนัด ไม่ใช่ต้นนัด — ระหว่างช่วงนัดคือ "ถึงเวลาแล้ว"
           ซึ่งเป็นคนละเรื่อง (เส้นเดียวกับด่านของ backend · ดู `isAppointmentPast`) */
        serviceEnd: order.appointment?.endIso ?? null,
        appointmentStatus: order.appointment?.status ?? null,
        /* 🛑 `hasAppointment` ต้องมาจาก "มีอ็อบเจกต์นัดไหม" ไม่ใช่ "มี startIso ไหม" —
           งาน walk-in ที่ร้านกด "เริ่มงานเลย" ก็ได้เวลาทั้งที่ไม่เคยมีการนัดหมาย
           ถ้าเดาจากเวลา ขั้น "ลูกค้ายืนยันนัด" จะไปค้างรอในใบที่ไม่มีนัดให้ยืนยัน */
        hasAppointment: order.appointment !== null,
        buyerConfirmedAt: order.appointment?.buyerConfirmedAt ?? null,
      })
    : getOrderTimeline(order.status, order.fulfillmentMode, order.paymentMethod)

  /**
   * ถึงเวลาที่ *ควร* กดปิดงานแล้วหรือยัง — ใช้ลดน้ำหนักปุ่ม **ไม่ใช่ปิดปุ่ม**
   * ร้านที่ไม่ใช่ร้านบริการไม่มีรางแบบนี้ ⇒ คงพฤติกรรมเดิมทุกประการ
   */
  const ctaReady = !order.isServiceShop || isFinalStepReady(timeline)

  /** เลขงานที่ผู้ใช้เห็น — คำนวณสดจาก token+วันที่ (ดู `formatOrderNo`) ใช้ทั้งหัวเรื่องและปุ่มคัดลอก */
  const orderNo = formatOrderNo(order.publicToken, order.createdAtIso)

  const handleCopyOrderNo = async () => {
    try {
      await navigator.clipboard.writeText(orderNo)
      setCopiedOrderNo(true)
      toast.success('คัดลอกเลขคำสั่งซื้อแล้ว')
      setTimeout(() => setCopiedOrderNo(false), 2000)
    } catch {
      /* ข้อความต้องบอก **ทางออกที่ทำได้จริง** ไม่ใช่ "ลองใหม่อีกครั้ง" ซึ่งกดกี่ครั้งก็เหมือนเดิม
         (เบราว์เซอร์ที่ปฏิเสธ clipboard จะปฏิเสธตลอด — ท่าเดียวกับปุ่มคัดลอกเลขพัสดุ) */
      toast.error('คัดลอกไม่สำเร็จ — กดค้างที่เลขคำสั่งซื้อเพื่อคัดลอกเองได้')
    }
  }

  /**
   * ป้ายปุ่มหลัก — บอก "สิ่งที่จะเกิดขึ้น" ไม่ใช่บริบทของการชำระเงิน
   *
   * 🛑 เดิมแตกตามวิธีจ่ายเงินแล้วได้ป้าย "ยืนยันการชำระเงิน" สำหรับออเดอร์ PENDING ที่โอนเข้าบัญชี
   * ซึ่ง **ไม่ตรงกับสิ่งที่ปุ่มทำเลย** — มันยิง POST /confirm ทำให้ออเดอร์เป็น CONFIRMED ถาวร
   * ป้อนเข้า Trust Score และซ่อนปุ่มแจ้งปัญหาทิ้ง. นี่คือช่องทางของสแกมที่ product นี้มีไว้กัน:
   * ร้านส่งลิงก์ก่อนส่งของ ผู้ซื้อเห็นปุ่มม่วงเต็มความกว้างเขียนว่า "ยืนยันการชำระเงิน"
   * แล้วกดด้วยความเข้าใจว่ากำลังยืนยัน *การโอนของตัวเอง* — ทางออกเดียวหายไปในหนึ่งแตะ
   * ทั้งสี่กรณีเรียก endpoint เดียวกันและได้ผลเหมือนกันทุกประการ ป้ายจึงต้องพูดเรื่องเดียวกัน
   * และต้องตรงกับ dialog ที่ถามว่า "ยืนยันว่าได้รับสินค้าแล้ว?"
   */
  const ctaLabel = submitting
    ? 'กำลังยืนยัน...'
    : order.isServiceShop
      // ร้านบริการ: ไม่มี "ของ" ให้รับ สิ่งที่ลูกค้ายืนยันคือ *ได้รับบริการแล้ว*
      ? 'ยืนยันว่ารับบริการแล้ว'
      : order.fulfillmentMode !== 'SHIPPED' // NO_SHIPPING (digital/subscription) — ไม่มีของให้ "รับ"
        ? 'ยืนยันว่าได้รับแล้ว'
        : 'ยืนยันรับสินค้า'

  // total label ตาม status
  /**
   * ป้ายยอดรวมของการ์ดรายการ
   *
   * 🛑 เมื่อมีการ์ดเงิน (`order.money`) ต้องเป็น **"ยอดรวม" เสมอ** ห้ามเป็น "ยอดที่ต้องชำระ"
   *
   * เพราะการ์ดเงินเป็นเจ้าของคำถาม "ต้องจ่ายอีกเท่าไร" และตอบด้วยแถว **คงเหลือ** ซึ่งหัก
   * เงินที่ร้านยืนยันรับแล้วออกไปแล้ว ⇒ ปล่อยไว้จะได้จอที่ขึ้นพร้อมกันว่า
   *   การ์ดเงิน:   คงเหลือ ฿1,000
   *   การ์ดรายการ: ยอดที่ต้องชำระ ฿1,500
   * **ตัวเลขที่ผู้ซื้อจะใช้พิมพ์ตอนโอนจริง ขัดกันเอง 2 ที่ ห่างกันหนึ่งการ์ด**
   *
   * ออเดอร์ที่ไม่มีการ์ดเงิน (ร้านขายออนไลน์ — `money` เป็น null) ยังได้คำเดิมทุกตัวอักษร
   */
  const totalLabel = order.status === 'PENDING' && !order.money ? 'ยอดที่ต้องชำระ' : 'ยอดรวม'

  // cancel copy ตาม cancelInitiator
  const cancelCopy =
    order.cancelInitiator === 'seller'
      ? 'ร้านค้ายกเลิกคำสั่งซื้อ'
      : order.cancelInitiator === 'buyer'
        ? 'คุณยกเลิกคำสั่งซื้อ'
        : 'คำสั่งซื้อนี้ถูกยกเลิก'

  return (
    // D1: ตัด MobileFrame ทิ้ง — plain column กลางจอ, page scroll ปกติ (ไม่มี "กรอบมือถือ" อีกต่อไป)
    <Box
      sx={{
        bgcolor: 'background.default',
        /**
         * ไล่สีม่วงจางมุมบน (ม็อกอัพ v5 `body{background: radial-gradient(...)}`)
         *
         * ม็อกอัพใช้ `rgba(115,103,240,.11)` และ `.06` ซึ่งคือ `--primary` ของมันเอง —
         * ค่าเดียวกับ `primary.main` ของธีมเรา (#7367F0) ⇒ เขียนผ่าน `color-mix` กับ token
         * ของธีม ไม่ hardcode hex (HR1) · พื้นหลังเรียบ ๆ ทำให้การ์ดขาวลอยอยู่บนเทาแบน
         * ซึ่งเป็นความต่างที่เห็นชัดที่สุดอย่างหนึ่งเมื่อเทียบกับม็อกอัพ
         */
        backgroundImage: [
          'radial-gradient(900px 420px at 5% -12%, color-mix(in srgb, var(--mui-palette-primary-main) 11%, transparent), transparent 58%)',
          'radial-gradient(620px 320px at 96% 2%, color-mix(in srgb, var(--mui-palette-primary-main) 6%, transparent), transparent 62%)',
        ].join(','),
        backgroundAttachment: 'fixed',
        /* หน้านี้ไม่มี shell ของตัวเอง (ไม่มี `layout.tsx`) ⇒ ต้องสูงเต็มจอเอง
           ไม่งั้นพื้นหลังจะจบตรงที่เนื้อหาจบ แล้วเหลือแถบขาวใต้ footer
           🛑 เคยลองห่อด้วย `FrontLayout` (แถบเมนู + footer เต็ม) แล้ว **หัวหน้าสั่งให้เอาออก**
           2026-08-30 — ถ้าวันหนึ่งมีคนเอา shell กลับมา ต้องปลดบรรทัดนี้ที่ ≥768 ด้วย
           ไม่งั้น footer ของ shell จะตกใต้ fold เสมอ */
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        /**
         * 🛑 ต้องอยู่ที่ **กล่องนอกสุด** ไม่ใช่กล่องเนื้อหาข้างใน
         *
         * ร่างก่อนหน้าใส่ไว้ที่กล่องเนื้อหา (ตัวที่มี `maxWidth`) แล้ว **หน้ายังเลื่อนซ้ายขวาได้อยู่**
         * (หัวหน้าส่งภาพหน้าจอที่เลื่อนไปทางขวาจนขั้นแรกของรางหลุดออกนอกจอ) เพราะการคลิป
         * ที่ชั้นในกันได้แค่ลูกของตัวเอง — สายที่ทำให้เอกสารกว้างเกินจอมีหลายชั้น
         * (กล่องเนื้อหา → กริด → คอลัมน์ → กล่องห่อ → การ์ด) และ **ทุกชั้นที่เป็น flex/grid item
         * มี `min-width: auto` เป็นค่าตั้งต้น** ⇒ ไล่ปิดทีละชั้นเป็นเกมที่แพ้ตลอด
         *
         * ปิดที่ชั้นนอกสุดครั้งเดียวได้ผลแน่นอน — และปลอดภัยเพราะหน้านี้ไม่มี `position: sticky`
         * สักจุด (ตรวจแล้ว) ซึ่งเป็นสิ่งเดียวที่ `overflow` ระดับนี้จะทำพัง
         * แถบ CTA เป็น `fixed` จึงไม่ถูกกระทบ
         *
         * ต้นเหตุจริงยังถูกแก้ที่กริดด้วย (`minmax(0,…)` + `minWidth: 0` ที่คอลัมน์) —
         * อันนี้คือกันไม่ให้เคสที่ยังไม่เจอกลายเป็น "ทั้งหน้าเลื่อนได้" อีก
         *
         * 🛑 **ต้องเป็น `clip` ไม่ใช่ `hidden`** — ใส่ `hidden` ไปแล้วรอบหนึ่งแล้ว
         * **หน้ายังลากซ้ายขวาได้อยู่** เพราะ `hidden` แปลว่า "ไม่แสดงแถบเลื่อน"
         * ไม่ใช่ "ห้ามเลื่อน" — กล่องยังเป็น scroll container ที่เลื่อนด้วยนิ้ว/trackpad
         * และด้วยสคริปต์ได้ตามปกติ · ซ้ำร้าย `overflow-x: hidden` ยังบังคับให้
         * `overflow-y` กลายเป็น `auto` ⇒ กล่องนี้กลายเป็นตัวเลื่อนแนวตั้งของตัวเองไปด้วย
         *
         * `clip` ตัดทิ้งจริงและ **ไม่สร้าง scroll container** ⇒ แกนตั้งยังเป็นของหน้าเหมือนเดิม
         */
        overflowX: 'clip',
        /* เว้นที่ให้แถบ CTA ที่เป็น `fixed` — ไม่งั้นมันทับท้ายหน้าตอนเลื่อนสุด
           ตัวเลขมาจากความสูงจริงของแถบ: ปุ่ม 38px (+ ปุ่มยกเลิกอีก 38 + gap 4 ถ้ามี)
           + padding บน-ล่างของแถบ 26 แล้วเผื่ออีกเล็กน้อย · safe-area บวกซ้ำที่นี่ด้วย
           เพราะแถบเองก็ดันตัวเองขึ้นด้วยค่าเดียวกัน */
        pb: canConfirm
          ? `calc(${showCancel ? 128 : 88}px + max(0px, env(safe-area-inset-bottom)))`
          : 0,
      }}
    >
      {/* FR-018 — เดิมเป็น maxWidth: 640 คงที่ทุกขนาดจอ ซึ่งคือต้นเหตุที่หน้านี้ "ไม่ responsive
          เลย" ไม่ใช่แค่จัดวางไม่สวย: บนจอ 1440 เหลือขอบขาวสองข้างข้างละ ~400px
          เพดานอยู่ที่ `orderContentWidthSx` จุดเดียว (ค่าที่เขียนไว้เดิมไม่เคยมีผลจริง — อ่านที่นั่น) */}
      <Box
        sx={{
          ...orderDetailWidthSx,
          width: '100%',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          /**
           * 🛑 ชิ้นที่สามของ "ชุดกันล้น" ตาม `flex-header-truncation.md` —
           * `minWidth: 0` ที่กล่อง + `maxWidth: 100%` ที่ลูก + `overflowX: hidden` ที่กล่องเลื่อน
           * **ต้องมาครบชุด** ไม่งั้นเนื้อหาที่ยาวผิดคาด (ชื่อเพจยาว · เลขบัญชี · URL)
           * จะดันกล่องกว้างเกินจอ แล้วทั้งหน้าเลื่อนซ้ายขวาได้
           *
           * ไม่ใช่การกลบปัญหา: ต้นเหตุถูกแก้ที่คอลัมน์กริดแล้ว (`minmax(0,…)` + `minWidth: 0`)
           * อันนี้คือกันชนไม่ให้เคสที่ยังไม่เจอกลายเป็น "ทั้งหน้าเลื่อนได้" ซึ่งเป็นอาการ
           * ที่ผู้ใช้เจอก่อนเราเสมอ (เคยเกิดบน prod มาแล้วกับชื่อเพจ 34 ตัวอักษร)
           *
           * 🛑 `clip` ไม่ใช่ `hidden` — ดูเหตุผลเต็มที่กล่องนอกสุด
           */
          overflowX: 'clip',
        }}
      >

          {/* ── การ์ดข้อมูลร้าน (เฉพาะจอกว้าง) ──
              🛑 เดิมส่วนนี้เป็นแผ่นขาวเต็มความกว้างติดขอบ ขณะที่ hero/ราง ด้านล่างเป็นการ์ด
              ⇒ บนจอกว้างอ่านเหมือน "สองดีไซน์ต่อกัน" (หัวหน้าเห็นแล้วบอกว่าไม่สวย 2026-08-29)
              ใช้ผิวการ์ดชุดเดียวกับอีกสองใบ · มือถือยังเป็นแผ่นเต็มความกว้างเหมือนเดิม */}
          <Card
            sx={{
              display: 'contents',
              [ORDER_TWO_COL_MQ]: {
                display: 'block',
                /**
                 * 🛑 **ถอดเพดาน 620px ออกแล้ว (2026-08-30)** — มันบีบกริด 3 คอลัมน์ของม็อกอัพ v5
                 * เหลือ `180px 148px 220px` ⇒ คอลัมน์กลางกว้าง **148px** ชื่อร้านตกบรรทัด
                 * ชิปตกบรรทัด อวตารเบียดจนอ่านเป็นคนละดีไซน์กับม็อกอัพ
                 * (หัวหน้าทัก 2026-08-30: "ไม่เห็นเหมือน html เลย" — วัดจากเบราว์เซอร์จริงแล้ว
                 * เจอ `gridTemplateColumns: 180px 148px 220px` กับ `maxWidth: 620px` ที่นี่)
                 *
                 * เหตุผลเดิมยังจริง (2026-08-29: เนื้อหาแคบลอยกลางการ์ดกว้าง 1160 ดูเป็นกล่องว่าง)
                 * — แต่ตอนนี้ **กริดเป็นตัวคุมความกว้างแทน**: คอลัมน์กลางถูกขนาบด้วยคอลัมน์ซ้าย
                 * 180px และ aside 220px อยู่แล้ว เนื้อหาจึงไม่มีทางลากเต็ม 1160
                 * ⇒ ถ้าเอาเพดานกลับมา ต้องเอากริดออกด้วย ห้ามมีทั้งคู่
                 */
                /* 🛑 ขอบ/เงา/รัศมี **มาจาก `<Card>` ของธีม Vuexy เท่านั้น** (skin `default` =
                   เงา `customShadows-md` ไม่มีขอบ) — ห้ามเขียนเอง (Hard Rule 1)
                   ร่างก่อนหน้าเขียน `border` + `customShadows-sm` + `borderRadius: 3` เองทั้งชุด
                   ซึ่งไม่ตรงกับการ์ดใบอื่นบนหน้าเดียวกันที่ใช้ `<Card>` อยู่แล้ว
                   (หัวหน้าทัก 2026-08-29: "ขอบต้องทำ ธีม Vuexy นะ")

                   `display: contents` บนมือถือ = ไม่เกิดกล่อง ⇒ เงา/รัศมีของ Card ไม่ถูกวาด
                   จอมือถือจึงยังเป็นแผ่นเต็มความกว้างเหมือนเดิมทุกพิกเซล

                   เหลือไว้เฉพาะสิ่งที่เป็น *เลย์เอาต์* ไม่ใช่ *ผิว*: */
                overflow: 'hidden',
                mx: 4.5,
                mb: 4.5,
              },
            }}
          >
        {/* ── 1. ปกไล่สีตาม tier — ตัวเดียวกับจอ guest (ShopCover) ──
            เดิมเรียก `ProfileBanner` ตรง ๆ ที่ 140px ขณะที่จอ guest ตั้ง 104px และ **ไม่เคย
            ส่ง isNewShop เลย** ⇒ ร้านที่ยังไม่มีออเดอร์จบสักใบได้ปกเทาก่อนล็อกอิน แล้วกลายเป็น
            ปกไล่สีที่หน้าตาเหมือนรางวัลทันทีที่ล็อกอินเสร็จ ทั้งที่เป็นร้านเดียวกันในนาทีเดียวกัน */}
        <ShopCover
          trustScore={trustScore}
          isNewShop={order.completedOrders == null}
          coverUrl={order.shop.coverImage}
          /* ม็อกอัพ v5 `.cover-actions` — ช่วยเหลือ + แชร์ มุมขวาบนของปก */
          actions={<CoverActions orderNo={orderNo} />}
        />

        {/* ── 2. Hero section: Avatar overlap + Identity ── */}
        {/**
         * ── หัวโปรไฟล์ = **คอลัมน์เดียวจัดกลาง** ทุกความกว้าง ──
         *
         * 🛑 เคยทำเป็นกริด 3 คอลัมน์ตามม็อกอัพ v5 (`180px | 1fr | 220px`) โดยเอาปุ่ม
         * "ติดต่อร้านค้า" กับ "ดูโปรไฟล์ร้าน" ไปคอลัมน์ขวา — **หัวหน้าสั่งให้เอาออก 2026-08-30**
         *
         * ท่านั้นไม่เวิร์กกับข้อมูลจริงของเรา: aside ของม็อกอัพเตี้ย (โลโก้กลม 36px ไม่มีชื่อ)
         * ของเราสูงกว่ามาก ⇒ คอลัมน์ขวาเหลือที่ว่างเป็นแถบใหญ่ใต้ปุ่มสองใบ
         * และ "ติดต่อร้านค้า" เป็น **ปุ่มซ้ำ** กับแถวในการ์ด "ต้องการความช่วยเหลือ?" อยู่แล้ว
         *
         * ตอนนี้: ตัวตนร้านอยู่กลางคอลัมน์เดียว · ทางเข้าโปรไฟล์เป็นลิงก์ใต้ชิป ·
         * การติดต่ออยู่ในการ์ดช่วยเหลือที่เดียว
         */}
        <Box
          sx={{
            bgcolor: 'background.paper',
            mt: '-42px',
            pb: 1.5,
            textAlign: 'center',
            [ORDER_TWO_COL_MQ]: { mt: 0, ...cardInlinePadSx },
          }}
        >
          {/* ══ คอลัมน์กลาง — ตัวตนร้าน (ใครคือคนที่คุณกำลังจะกดยืนยันด้วย) ══ */}
          <Box
            sx={{
              minWidth: 0,
              [ORDER_TWO_COL_MQ]: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                /* ครึ่งหนึ่งของอวตาร 116px — ดึงเฉพาะคอลัมน์นี้ให้ยื่นขึ้นไปคร่อมขอบปก */
                mt: '-58px',
              },
            }}
          >
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
            {/* v5 `.shop-avatar` = 116px บนจอกว้าง · 82px บนมือถือ — เราคง 84 ของเดิมไว้บนมือถือ
                (ต่างจาก 82 แค่ 2px แต่เป็นเลขที่จอ guest ใช้อยู่ ร้านเดียวกันต้องเท่ากันทั้งสองจอ) */}
            <Box
              sx={{
                position: 'relative',
                width: 84,
                height: 84,
                [ORDER_TWO_COL_MQ]: { width: 116, height: 116 },
              }}
            >
              <Avatar
                src={order.shop.user.avatar ?? undefined}
                alt={order.shop.user.displayName}
                sx={{
                  width: 84,
                  height: 84,
                  [ORDER_TWO_COL_MQ]: { width: 116, height: 116, fontSize: '2.25rem', borderWidth: '5px' },
                  border: '4px solid',
                  borderColor: 'background.paper',
                  /* customShadows.md ไม่ใช่ `boxShadow: 4` — ตัวหลังดึงจาก elevation array ของ
                     Material Design ซึ่งเป็นคนละตระกูลกับเงาที่การ์ดใบอื่นในหน้าเดียวกันใช้
                     (เหตุผลเดียวกับที่การ์ดสถานะบนจอ guest เลิกใช้ไปแล้ว) และต้องเป็นค่าเดียวกับ
                     โลโก้บนจอ guest — ร้านเดียวกัน ห่างกันไม่กี่วินาที ต้องดูเหมือนกัน */
                  boxShadow: 'var(--mui-customShadows-md)',
                  fontSize: '1.75rem',
                  /* 800 ที่นี่ไม่ขัด "ห้าม 800 กับข้อความ" (DESIGN.md §Strong step) — ตัวอักษรแทน
                     โลโก้ร้านทำหน้าที่เป็น **ภาพ** ไม่ใช่ข้อความ คลาสเดียวกับ Metric
                     (จอ guest เขียนเหตุผลนี้ไว้แล้ว ที่นี่เคยไม่มี จึงอ่านเหมือนหลุดกฎ) */
                  fontWeight: 800,
                  bgcolor: 'primary.lightOpacity',
                  color: 'primary.main',
                }}
              >
                {avatarLetter}
              </Avatar>
              {/* Verify badge มุมขวาล่าง — carve-out dingbat ✓ (Verified-Means-Green — design.json) */}
              {order.maxVerifyLevel >= 1 && (
                <Box
                  component='span'
                  title='ยืนยันแล้ว'
                  sx={{
                    position: 'absolute',
                    bottom: 1,
                    right: 1,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    bgcolor: VERIFIED_INK,
                    color: 'success.contrastText',
                    display: 'grid',
                    placeItems: 'center',
                    border: '3px solid',
                    borderColor: 'background.paper',
                  }}
                >
                  {/* DESIGN.md §Do's — "ใช้ icon จริงจาก @iconify/react ทุกจุดที่อยากได้สัญลักษณ์"
                      เดิมเป็นตัวอักษร ✓ ที่ต้องดัน fontWeight 900 (น้ำหนักที่ไม่มีใน vocab เลย)
                      ให้พอดูหนา — ไอคอนจริงได้รูปทรงที่ตั้งใจโดยไม่ต้องยืมน้ำหนักฟอนต์ */}
                  <Icon icon='tabler-check' fontSize={13} />
                </Box>
              )}
            </Box>
          </Box>

          {/**
           * ชื่อร้าน — **ข้อความ ไม่ใช่ลิงก์** (แก้ 2026-08-30)
           *
           * 🛑 เดิมเป็นลิงก์ไป `/u/[username]` ที่ `textDecoration: 'none'` + `color: 'text.primary'`
           * ⇒ **ลิงก์ล่องหน**: หน้าตาเหมือนหัวเรื่องทุกประการ แต่กดแล้วเด้งออกจากหน้าออเดอร์
           * ผู้ซื้อที่แตะโดนตอนเลื่อนหน้าจะหลุดไปหน้าอื่นโดยไม่รู้ว่าเพราะอะไร
           *
           * ตอนนี้มีทางเข้าโปรไฟล์ที่ **มองเห็นและมีป้ายบอก** อยู่ใต้ลงไปแล้ว ("ดูโปรไฟล์ร้าน ›")
           * ⇒ ลิงก์ล่องหนไม่ได้เพิ่มความสามารถอะไร มีแต่เพิ่มการกดโดยไม่ตั้งใจ
           *
           * กติกาของหน้านี้: **ทุกอย่างที่กดได้ต้องดูออกว่ากดได้ และบอกว่าจะเกิดอะไร**
           * (หัวหน้าสั่ง 2026-08-30: "ให้เขารู้แต่ละปุ่ม แต่ละที่ทำไร")
           */}
          <Typography
            component='h2'
            variant='h6'
            sx={{
              display: 'block',
              m: 0,
              color: 'text.primary',
              fontWeight: 700,
              /* ม็อกอัพ `.profile-center h1{font-size:23px;letter-spacing:-.035em}` —
                 บนจอกว้างชื่อร้านคือสิ่งที่ใหญ่ที่สุดในหัวการ์ด ไม่ใช่ขนาดเดียวกับหัวข้อ section */
              [ORDER_TWO_COL_MQ]: { fontSize: '1.4375rem', lineHeight: 1.25, letterSpacing: '-0.035em' },
            }}
          >
            {order.shop.shopName}
          </Typography>

          {/* @handle */}
          <Typography variant='body2' color='text.secondary' sx={{ mt: 0.25 }}>
            @{order.shop.user.username}
          </Typography>

          {/* ป้ายยืนยัน + tier — `TrustPill` ตัวเดียวกับจอ guest
              🛑 แก้ 2026-08-11 รอบสอง: รอบแรก (cc2c3b67) แก้ *เนื้อหา* ให้ตรงกันแล้ว (เดิมเป็น
              Chip `color='success'` label 'ยืนยันแล้ว' hardcode ⇒ เขียวเสมอทุกระดับ) แต่ยังเป็น
              MUI `Chip` อยู่ ขณะที่จอ guest ประกอบป้ายเอง ⇒ *หน้าตา* ยังคนละแบบ รอบนี้ยกทั้ง
              component มาใช้ร่วม ป้ายชุดนี้จึงเหมือนกันทั้งคำ สี และทรง

              ชิป `Trust {score}` ถูกถอดออก: ตัวเลขดิบไม่มีคำอธิบายว่าเต็มเท่าไรหรือดีแค่ไหน
              ส่วน `tierLabel` ที่อยู่ติดกันคือชื่อของช่วงคะแนนนั้นอยู่แล้ว = พูดเรื่องเดียวกัน
              สองครั้งโดยครั้งที่อ่านง่ายกว่าอยู่ข้าง ๆ กัน (จอ guest ไม่เคยมีชิปนี้) */}
          <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', mt: 1, flexWrap: 'wrap', px: 2 }}>
            {verifyBadge && (
              <TrustPill
                tone={verifyBadge.tone}
                icon={verifyBadge.icon}
                label={`${verifyBadge.label} (ระดับ ${order.maxVerifyLevel})`}
              />
            )}
            <TrustPill tone='tier' tierColor={tierColor} label={tierLabel} />
            </Box>

            {/**
             * ทางเข้าโปรไฟล์ร้าน — **ลิงก์ใต้ชิป ไม่ใช่ปุ่มในคอลัมน์ขวา**
             *
             * 🛑 ผ่านมา 5 ท่า หัวหน้าทักทุกท่า · บทเรียนที่ตกผลึก: มันเป็น **ทางเข้าไปดู
             * ข้อมูลเพิ่ม** ไม่ใช่การกระทำกับออเดอร์ใบนี้ ⇒ ต้องเบากว่าทุกปุ่มบนหน้า
             * และอยู่ติดกับ *ตัวตนร้าน* ที่มันขยายความ · ข้อความ + ลูกศร คือภาษาของ
             * "ไปที่อื่น" ที่ไม่ยืมรูปทรงจากปุ่มไหนเลย
             */}
            <Button
              component={Link}
              href={`/u/${order.shop.user.username}`}
              variant='text'
              color='primary'
              endIcon={<Icon icon='tabler-chevron-right' fontSize={16} />}
              sx={{ minHeight: 44, mt: 0.5, fontSize: '0.8125rem', fontWeight: 500, px: 1.5 }}
            >
              ดูโปรไฟล์ร้าน
            </Button>

            {/**
             * ── ช่องทางของร้าน = **โลโก้ล้วน** ใต้ตัวตนร้าน (ที่ 4 — หัวหน้าสั่ง 2026-08-30) ──
             *
             * 🛑 ผังก่อนหน้า 3 แบบถูกตีกลับหมด (คอลัมน์ขวา · ใต้สถิติ · แถวในการ์ดช่วยเหลือ)
             * ทั้งสามมีของเหมือนกันอย่างเดียว: **ชื่อเพจไทยยาว ๆ ที่ซ้ำกันแทบทุกตัวอักษร**
             * ⇒ ปัญหาไม่ใช่ "อยู่ตรงไหน" แต่คือ **แสดงอะไร** · เปลี่ยนวิธีแสดงแทนการย้ายที่อีกรอบ
             *
             * โลโก้ 2 วงเล็ก ๆ ใต้ชื่อร้านตอบคำถามที่ผู้ซื้อถามจริง ("ร้านนี้มีเพจที่ยืนยันแล้วไหม")
             * ในพื้นที่ 1 บรรทัด · ชื่อเต็ม + ยอดผู้ติดตาม + วิธียืนยัน ยังอยู่ครบใน tooltip
             * และ `aria-label` · เพจที่ออเดอร์ใบนี้เกิดขึ้นมีวงแหวนม่วงกำกับ
             */}
            <Box sx={{ mt: 1 }}>
              <ShopChannels
                channels={order.channels}
                originChannel={
                  order.originPage
                    ? { provider: order.originPage.channel, name: order.originPage.pageName }
                    : null
                }
                variant='logos'
              />
            </Box>

            {/**
             * ── สถิติร้าน (ม็อกอัพ v5 `.stats`) ──
             *
             * 🛑 **อยู่ข้างในคอลัมน์กลาง ไม่ใช่ grid item ของตัวเอง** — ลองมาแล้ว 2 ท่าและพังทั้งคู่:
             *   1. วางใต้กริด → aside ที่สูงกว่าดันความสูงของแถว ⇒ ช่องว่างเปล่า ~180px
             *   2. เป็น grid item `gridColumn: 2` → ยังอยู่ **แถวที่สอง** ⇒ ช่องว่างเท่าเดิม
             * ตัวที่กำหนดความสูงแถวคือ aside เสมอ ตราบใดที่สถิติไม่ได้อยู่ในกล่องเดียวกับชิป
             * (หัวหน้าเห็นบนจอจริง 2026-08-30 ทั้งสองรอบ)
             *
             * ม็อกอัพวางเป็นแถบเต็มความกว้างได้เพราะ aside ของมันเตี้ย (โลโก้กลม 36px ไม่มีชื่อ)
             * ของเราแสดงชื่อเพจ + ยอดผู้ติดตาม ซึ่งเป็นหลักฐานที่ตัดทิ้งไม่ได้
             */}
            <Box sx={{ width: '100%', ...cardInlinePadSx, [ORDER_TWO_COL_MQ]: { px: 0, mt: 1 } }}>
              <ShopStats
                completedOrders={order.completedOrders}
                avgRating={order.avgRating}
                reviewCount={order.reviewCount}
              />

            </Box>
          </Box>



        </Box>

        {/**
         * ── เพจต้นทางของออเดอร์ใบนี้ (feature 00050 · AC-SQ-06) ──
         *
         * ร้านหนึ่งผูกได้หลายเพจ และ **ชื่อเพจมักไม่เหมือนชื่อร้าน** — ลูกค้าที่ทักมาจากเพจหนึ่ง
         * แล้วได้ลิงก์นี้ ต้องเห็นว่า "ใบนี้คือของที่คุยไว้กับเพจนั้น" ไม่งั้นหน้าที่ขึ้นชื่อร้าน
         * ที่เขาไม่เคยได้ยิน บนหน้าที่กำลังจะให้เขาโอนเงิน อ่านได้ตรง ๆ ว่าเป็นลิงก์หลอก
         *
         * 🛑 ต่างจากบล็อก `ShopEvidence` ด้านบนซึ่งลิสต์ **ทุกเพจของร้าน** (หลักฐานว่าร้านมีตัวตน)
         * — อันนี้คือ *เพจเดียวที่ออเดอร์ใบนี้เกิดขึ้น* คนละคำถาม จึงอยู่คนละที่และห้ามยุบรวม
         *
         * ...**แต่ร้านที่มีเพจเดียว สองคำถามนั้นได้คำตอบเดียวกัน** ⇒ ชื่อเพจซ้ำสองบรรทัดติดกัน
         * `shouldShowOrderOrigin()` เป็นตัวตัดสิน (ฟังก์ชันบริสุทธิ์ + เทส `[blocker]` —
         * `ui-boolean-needs-a-testable-home.md`: เงื่อนไขที่ตัดสินว่า UI จะแสดงอะไร
         * ห้ามอยู่ในเทอร์นารีกลาง JSX เพราะเขียนกลับด้านแล้วไม่มีอะไรจับได้)
         */}
        {order.originPage &&
          shouldShowOrderOrigin(
            { provider: order.originPage.channel, name: order.originPage.pageName },
            /* 🛑 นับเฉพาะช่องทางที่ **แถบช่องทางวาดออกมาได้จริง** — ตัวที่ `PROVIDER`
               ไม่รู้จัก (เช่น LINE) ถูกทิ้งเงียบตอนเรนเดอร์ ⇒ ถ้านับจากข้อมูลดิบ
               ตัวกันจะเห็น 2 ช่องทางแล้วปล่อยผ่าน ทั้งที่บนจอมีใบเดียว
               แล้วผู้ซื้อเห็นชื่อเพจเดียวกันสองบรรทัดติดกัน (หัวหน้าเจอ 2026-08-29) */
            order.channels
              .filter((c) => isRenderableChannel(c.provider))
              .map((c) => ({ provider: c.provider, name: c.name })),
          ) && (
          <Box
            sx={{
              bgcolor: 'background.paper',
              ...cardInlinePadSx,
              pb: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              /* จัดกลางบนจอกว้างให้ตรงกับบล็อกอื่นในการ์ดเดียวกัน — ชิดซ้ายอยู่คนเดียว
                 ขณะที่ทุกอย่างจัดกลาง อ่านเป็นของที่หลุดมา ไม่ใช่ของที่อยู่ในชุด */
              [ORDER_TWO_COL_MQ]: { justifyContent: 'center' },
            }}
          >
            {order.originPage.pageAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={order.originPage.pageAvatarUrl}
                alt=''
                width={20}
                height={20}
                style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <Icon icon='tabler-message-circle' style={{ fontSize: 16, opacity: 0.6 }} />
            )}
            <Typography variant='caption' color='text.secondary' sx={{ minWidth: 0 }} noWrap>
              จากการคุยที่ {order.originPage.pageName ?? getChannelLabel(order.originPage.channel)}
            </Typography>
          </Box>
        )}
          </Card>


          {/**
           * ── ม็อกอัพห่อส่วนนี้เป็น "การ์ด" ไม่ใช่แผ่นขาวติดขอบจอ (`.hero` / `.timeline-card`) ──
           *
           * 🛑 **ทำเฉพาะจอ ≥861px** — บนมือถือยังเป็นแผ่นเต็มความกว้างเหมือนเดิมทุกพิกเซล
           * (WebView ของแอปเปิดหน้านี้อยู่ · กติกาเดียวกับโครง 2 คอลัมน์ด้านล่าง)
           * `display: contents` บนมือถือ ⇒ กล่องนี้ไม่เกิดขึ้นจริง ไม่มีอะไรเปลี่ยน
           *
           * 🛑 **ไม่เอาไล่สีม่วง + วงแหวนตกแต่งของม็อกอัพ** — `DESIGN.md` ปฏิเสธตรงตัวว่าเป็น
           * "เทมเพลต AI-SaaS โหลๆ (ไล่สีม่วง … gradient ตกแต่ง)" และ One Voice บังคับว่า
           * ม่วงคือ accent ของ *action* ≤10% ของจอ ไม่ใช่พื้นหลังของบล็อกที่ใหญ่ที่สุดในหน้า
           * (HR8: theme ชนะเรื่อง markup — Impeccable ชนะเรื่องสี) ⇒ ใช้ผิวการ์ดของธีมแทน
           */}
          <Card
            sx={{
              display: 'contents',
              [ORDER_TWO_COL_MQ]: {
                display: 'block',
                /* 🛑 ขอบ/เงา/รัศมี **มาจาก `<Card>` ของธีม Vuexy เท่านั้น** (skin `default` =
                   เงา `customShadows-md` ไม่มีขอบ) — ห้ามเขียนเอง (Hard Rule 1)
                   ร่างก่อนหน้าเขียน `border` + `customShadows-sm` + `borderRadius: 3` เองทั้งชุด
                   ซึ่งไม่ตรงกับการ์ดใบอื่นบนหน้าเดียวกันที่ใช้ `<Card>` อยู่แล้ว
                   (หัวหน้าทัก 2026-08-29: "ขอบต้องทำ ธีม Vuexy นะ")

                   `display: contents` บนมือถือ = ไม่เกิดกล่อง ⇒ เงา/รัศมีของ Card ไม่ถูกวาด
                   จอมือถือจึงยังเป็นแผ่นเต็มความกว้างเหมือนเดิมทุกพิกเซล

                   เหลือไว้เฉพาะสิ่งที่เป็น *เลย์เอาต์* ไม่ใช่ *ผิว*: */
                overflow: 'hidden',
                mx: 4.5,
                mb: 4.5,
              },
            }}
          >
        {/* ── 3. หัวเรื่องของ "ใบนี้" — เลขงาน + ปุ่มคัดลอก ──
            มาจาก mockup ที่หัวหน้าส่ง 2026-08-28 (`hero`) · เดิมเลขออเดอร์เป็นตัวจิ๋วสีจาง
            ชิดขวาแถวเดียวกับป้ายสถานะ ⇒ **เลขที่ลูกค้าต้องอ่านให้ร้านฟังทางโทรศัพท์
            เป็นข้อความที่เล็กที่สุดในหน้า** และคัดลอกไม่ได้เลย */}
        <Box
          sx={{
            bgcolor: 'background.paper',
            ...cardInlinePadSx,
            /* 24px เท่ากับขอบในของการ์ดใบอื่น — บล็อกนี้เป็น *บล็อกแรก* ของการ์ด
               ระยะบนของมันคือระยะบนของการ์ดในสายตาผู้ใช้ */
            pt: 6,
            [ORDER_TWO_COL_MQ]: {
              /* 24px = ระยะขอบในของการ์ดทั้งหน้า (`cardBodySx`) — บล็อกที่ซ้อนในการ์ดใบเดียว
                 ต้องเรียงขอบซ้าย-ขวาให้ตรงกับการ์ดใบอื่น ไม่งั้นอ่านเป็นเนื้อหาที่เยื้องกัน */
              px: 6,
            },
          }}
        >
          <Box sx={{ minWidth: 0 }}>
          {/**
           * ── หัวการ์ด: ป้ายซ้าย · ทางไปหน้ารวมขวา **แถวเดียวกัน** ──
           *
           * 🛑 เดิมลิงก์เป็น grid item คนละคอลัมน์ที่ `alignItems:'start'` ⇒ วัดได้
           * ป้ายอยู่ y=24 ส่วนลิงก์ y=26 สูง 44 **จุดกึ่งกลางคนละที่** อ่านเป็นของที่ลอย
           * อยู่ระหว่างป้ายกับเลขออเดอร์ ไม่ได้อยู่แถวไหนเลย (หัวหน้าเห็นบนจอจริง 2026-08-30)
           *
           * `/dashboard` วางหัวการ์ดแบบนี้ทุกใบ: ชื่อซ้าย · "ทั้งหมด ›" ขวา แถวเดียวกัน
           * ⇒ ยกท่านั้นมา แล้วกริด 2 คอลัมน์ก็ไม่จำเป็นอีก (ยุบทิ้งไปด้วย)
           */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant='caption' sx={{ display: 'block', color: 'text.secondary', fontWeight: 500 }}>
              {order.isServiceShop ? 'รายละเอียดคำสั่งบริการ' : 'รายละเอียดคำสั่งซื้อ'}
            </Typography>

            {/**
             * 🛑 จอแคบซ่อนลิงก์นี้ — แถวหัวการ์ดบนมือถือมีที่พอสำหรับของชิ้นเดียว
             * และที่นั่นเลขออเดอร์คือสิ่งเดียวที่ผู้ซื้อต้องอ่านออกเสียงให้ร้านฟัง
             * (จอ guest ไม่มีลิงก์นี้เลย เพราะยังไม่มีบัญชี ⇒ `/orders` จะเด้งไปหน้าล็อกอิน)
             */}
            <Button
              component={Link}
              href='/orders'
              variant='text'
              color='primary'
              endIcon={<Icon icon='tabler-chevron-right' fontSize={16} />}
              sx={{
                display: 'none',
                minHeight: 44,
                fontWeight: 500,
                fontSize: '0.8125rem',
                flexShrink: 0,
                [ORDER_TWO_COL_MQ]: { display: 'inline-flex' },
              }}
            >
              ดูคำสั่งซื้อทั้งหมด
            </Button>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, mb: 1 }}>
            <Typography
              component='h1'
              sx={{
                m: 0,
                fontSize: { xs: '1.375rem', sm: '1.625rem' },
                fontWeight: 700,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                minWidth: 0,
                wordBreak: 'break-all',
              }}
            >
              {orderNo}
            </Typography>
            {/* ปุ่มไอคอน — ข้อความ "คัดลอกรหัส" จะเบียดกับเลข 13 ตัวอักษรบนจอ 360
                44px = พื้นที่นิ้วขั้นต่ำที่ PRODUCT.md กำหนด (ก้อนไอคอนข้างในเล็กกว่านั้นได้) */}
            <Button
              onClick={handleCopyOrderNo}
              aria-label='คัดลอกเลขคำสั่งซื้อ'
              sx={{ minWidth: 44, width: 44, height: 44, p: 0, borderRadius: '50%', color: 'text.secondary', flexShrink: 0 }}
            >
              <Icon icon={copiedOrderNo ? 'tabler-check' : 'tabler-copy'} fontSize={18} />
            </Button>
          </Box>

        {/* ── 3b. แถวสถานะ + วันที่เปิดบิล — อยู่ในคอลัมน์ซ้ายเดียวกับเลขออเดอร์ ── */}
        <Box sx={{ pb: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {/* ป้ายสถานะใช้ `TrustPill` เหมือนจอ guest — คำ/สีมาจาก SSOT เดียวกันอยู่แล้ว
              (`resolveOrderStatusBadge`) ที่ต่างคือทรง ซึ่งไม่มีเหตุผลให้ต่าง */}
          {/**
            * ป้ายสถานะ — ร้านบริการใช้ป้ายที่ derive จาก **เงินที่รับจริง** (จอง / รอชำระ /
            * ชำระเงินแล้ว) แทน "รอดำเนินการ" ที่ไม่ได้บอกอะไรเลย
            *
            * 🛑 `order.money` เป็น null สำหรับ vertical อื่นเสมอ (กั้นไว้ที่ page.tsx)
            * ⇒ ร้านขายออนไลน์/บ้านพักได้ป้ายเดิมทุกตัวอักษร (AC-SQ-07)
            */}
          <TrustPill
            tone='tier'
            tierColor={ORDER_STATUS_TONE_TO_MUI[statusBadge.tone]}
            label={statusBadge.label}
          />
          {/* เลขออเดอร์ย้ายขึ้นไปเป็นหัวเรื่องแล้ว — ตรงนี้เหลือเฉพาะ "เปิดบิลเมื่อไร"
              ซึ่งเป็นข้อเท็จจริงประกอบ ไม่ใช่ตัวระบุที่ลูกค้าต้องอ่านให้ใครฟัง */}
          {/* 🛑 `ml:auto` ดันวันที่ไปสุดขอบขวา — บนมือถือ (กว้าง ~360) อ่านเป็นสองมุมของแถวเดียว
              แต่บนการ์ดกว้าง ~1160 มันกลายเป็นตัวหนังสือลอยเดี่ยวห่างจากป้ายสถานะเกือบเต็มจอ
              โดยไม่มีอะไรอยู่ตรงกลาง (หัวหน้าเห็นแล้วบอกว่าไม่สวย) ⇒ จอกว้างให้อยู่ติดกันเป็นชุดเดียว */}
          <Typography
            variant='caption'
            color='text.secondary'
            sx={{ ml: 'auto', [ORDER_TWO_COL_MQ]: { ml: 0 } }}
          >
            {formatDateTimeTH(order.createdAtIso)}
          </Typography>
        </Box>
          </Box>

        </Box>

          {/* 🛑 หัวเรื่องออเดอร์ + แถวสถานะ + ราง อยู่ใน **การ์ดใบเดียวกัน**
              เดิมแยกเป็น 2 ใบ ⇒ ใบบนบางมาก (มีแค่เลขออเดอร์กับวันที่) แล้วดูเป็นแถบลอย ๆ
              หัวหน้าสั่งให้เอาออกไปรวมที่อื่น 2026-08-29 — รวมกับรางเพราะทั้งสองส่วน
              ตอบคำถามเดียวกันว่า "ใบนี้คือใบไหน และตอนนี้ถึงไหนแล้ว" */}
        {/* ── 4. รางสถานะ — 4 ขั้นสำหรับร้านบริการ / 3 ขั้นสำหรับที่เหลือ ── */}
        {/* 🛑 `pb: 6` = 24px เท่ากับขอบในของการ์ด — บล็อกนี้เป็น **บล็อกสุดท้าย** ของการ์ด
            ระยะล่างของมันคือระยะล่างของการ์ดในสายตาผู้ใช้ · เดิม 6px ทำให้กล่องคำอธิบาย
            เกือบชนขอบล่าง ขณะที่ขอบบนเว้น 24px (หัวหน้าเห็นบนจอจริง 2026-08-30) */}
        <Box sx={{ bgcolor: 'background.paper', ...cardInlinePadSx, pt: 1, pb: 6 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5 }}>
            <SectionTitle>{order.isServiceShop ? 'สถานะงานบริการ' : 'ขั้นตอน'}</SectionTitle>
            {/* 🛑 กลับมาแสดง **ทุกจอ** — กล่อง `.order-info` ที่เคยพูดประโยคนี้แทนบนจอกว้าง
                ถูกถอดทิ้งแล้ว (หัวหน้าสั่ง 2026-08-30) ถ้ายังซ่อนไว้ จอกว้างจะไม่มีใครบอกเลย
                ว่ารางนี้อัปเดตจากอะไร */}
            <Typography variant='caption' color='text.secondary' sx={{ flexShrink: 0 }}>
              อัปเดตตามการดำเนินงานจริง
            </Typography>
          </Box>

          {/* เลขขั้นเฉพาะราง 4 ขั้น — ราง 3 ขั้นของร้านขายของไม่เคยมีเลข การใส่เพิ่มคือ
              เปลี่ยนหน้าตาของ vertical ที่ไม่ได้อยู่ในขอบเขตงานนี้ */}
          <HorizontalTimeline steps={timeline} numbered={order.isServiceShop} />

          {/**
            * 🛑 กล่องนี้คือ **ตัวกันความเสียหาย** ไม่ใช่ของประดับ
            *
            * ขั้น 2 กับขั้น 4 เป็นการ "ยืนยัน" ของลูกค้าทั้งคู่ แต่คนละเรื่องกันสิ้นเชิง:
            * ขั้น 2 บอกว่าจะมาตามนัด (ย้อนได้) · ขั้น 4 ปิดงาน (**ย้อนไม่ได้** + คะแนนร้านขยับ)
            *
            * ลูกค้าที่กดขั้น 4 ตั้งแต่ยังไม่ได้รับบริการ จะเสียทางออกทั้งหมดในหนึ่งแตะ —
            * ปุ่มแจ้งปัญหาหายไปพร้อมกัน (เงื่อนไข `status !== 'CONFIRMED'` ด้านล่าง)
            * นี่คือช่องทางสแกมแบบเดียวกับที่ `ctaLabel` เขียนอธิบายไว้ยาว ๆ แค่ย้ายมาอีกขั้น
            *
            * แสดงเฉพาะตอนที่ยังกดผิดได้ — ใบที่จบ/ยกเลิกแล้วอ่านแล้วสับสนเปล่า ๆ
            */}
          {order.isServiceShop && canConfirm && (
            <Box
              sx={{
                mt: 2,
                display: 'flex',
                gap: 1,
                alignItems: 'flex-start',
                /* 🛑 ไม่ใช้ม่วง — DESIGN.md §One Voice: *"Confident Violet ปรากฏ ≤ ~10%
                   ของพื้นที่จอใดๆ — มันคือ accent ของ **action** ไม่ใช่ของตกแต่ง"*
                   กล่องนี้เป็นคำอธิบาย ไม่ใช่ปุ่ม และเต็มความกว้าง ⇒ กลายเป็นก้อนม่วง
                   ที่ **ใหญ่กว่าปุ่มยืนยันซึ่งเป็น action ที่อันตรายที่สุดในหน้า**
                   ⇒ ม่วงเลิกแปลว่า "กดได้" แล้วปุ่มจริงก็เลิกเด่น */
                bgcolor: 'action.hover',
                borderRadius: 2,
                ...infoBoxSx,
              }}
            >
              <Icon
                icon='tabler-info-circle'
                style={{ fontSize: 16, flexShrink: 0, marginTop: 2, color: 'var(--mui-palette-text-secondary)' }}
                aria-hidden='true'
              />
              <Typography variant='caption' sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                <Box component='strong' sx={{ fontWeight: 700, color: 'text.primary' }}>
                  ยืนยันนัดหมาย
                </Box>{' '}
                คือยืนยันว่าคุณจะมาตามนัด ส่วน{' '}
                <Box component='strong' sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {ctaLabel}
                </Box>{' '}
                คือปิดงานหลังได้รับบริการจริง และย้อนกลับไม่ได้
              </Typography>
            </Box>
          )}
        </Box>
          </Card>

        {/**
         * ── โครง 2 คอลัมน์ตามม็อกอัพ v3 (`.content-grid`) ───────────────────────
         *
         * ม็อกอัพวางไว้ `minmax(0,1.45fr) minmax(330px,.75fr)` แล้วยุบเป็นคอลัมน์เดียวที่ ≤860px
         * เราใช้ **1200px** (= `lg` ของธีม) เป็นจุดแยกแทน เพราะที่ 860–1199 เนื้อหาคอลัมน์ขวา
         * (การ์ดเงินมีวงแหวน + ประวัติการชำระ) จะบีบจนอ่านยากกว่าเรียงลงมาตรง ๆ
         *
         * 🛑 **มือถือต้องไม่ขยับแม้แต่พิกเซลเดียว** — มี WebView ของแอป iOS/Android เปิดหน้านี้อยู่
         * จึงทำสองอย่างคู่กัน:
         *   1. กฎ grid ทั้งหมดอยู่ใน `@media (min-width:1200px)` — ต่ำกว่านั้นคือ flex column เดิมเป๊ะ
         *   2. กล่องคอลัมน์เป็น `display: contents` บนมือถือ ⇒ **ไม่มีกล่องเกิดขึ้นจริง**
         *      ลูกทุกใบยังเป็น flex item ของคอนเทนเนอร์เดิม แล้วใช้ `order` เรียงกลับเป็นลำดับเดิม
         *      (การย้าย DOM เฉย ๆ จะสลับลำดับบนมือถือทันที ซึ่งเป็นสิ่งที่ห้าม)
         *
         * `order` ของทั้งสองคอลัมน์เรียงจากน้อยไปมากตาม DOM อยู่แล้ว ⇒ ที่ ≥1200px ซึ่งกลับไป
         * เป็น flex ปกติ ลำดับในแต่ละคอลัมน์จึงเท่ากับ DOM ไม่ต้องรีเซ็ต `order`
         */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            /**
             * 🛑 **12px ไม่ใช่ 5px** (แก้ 2026-08-30 — หัวหน้าทัก "ระยะห่างแต่ละ card
             * มันแปลก ๆ") · วัดจากเบราว์เซอร์จริงได้ **5px** ระหว่างการ์ดทุกใบบนมือถือ
             * ขณะที่จอกว้างได้ 18px ⇒ ห่างกัน 3.6 เท่า อ่านเป็นการ์ดที่ "ติดกัน" จนเส้นแบ่ง
             * ระหว่างใบหายไป
             *
             * 12px = ค่าที่ม็อกอัพ v5 ใช้บนมือถือตรงตัว (`.stack{gap:12px}` ·
             * `@media(max-width:680px){.body-grid{gap:12px}}`) และเป็นครึ่งหนึ่งของ 18px
             * ที่จอกว้างใช้ ⇒ สัดส่วนเดียวกันทั้งสองจอ ไม่ใช่ค่าที่ตั้งลอย ๆ
             */
            gap: 3,
            px: 1.5,
            pt: 1.5,
            pb: 2,
            [ORDER_TWO_COL_MQ]: {
              display: 'grid',
              /* 🛑 คอลัมน์ขวาต้องเป็น `minmax(0,…)` ไม่ใช่ `minmax(330px,…)` —
                 ค่าพื้นแข็งทำให้กริดไม่มีทางแคบกว่า 330px+gap ไม่ว่ากล่องจะเหลือที่เท่าไร
                 จำกัดความกว้างขั้นต่ำด้วย `minWidth` ที่ตัวคอลัมน์แทน ซึ่งยอมหดเมื่อจำเป็น */
              gridTemplateColumns: 'minmax(0,1.45fr) minmax(0,0.75fr)',
              alignItems: 'start',
              /* 18px ตามม็อกอัพ — ธีมนี้ spacing ฐาน 0.25rem (4px) ไม่ใช่ 8px ⇒ 4.5 = 18px
                 (เขียน 2.25 ตอนแรกได้ 9px ซึ่งแน่นกว่าม็อกอัพเท่าตัว) */
              gap: 4.5,
              /* 24px = ระยะขอบในของการ์ดทั้งหน้า (`cardBodySx`) — บล็อกที่ซ้อนในการ์ดใบเดียว
                 ต้องเรียงขอบซ้าย-ขวาให้ตรงกับการ์ดใบอื่น ไม่งั้นอ่านเป็นเนื้อหาที่เยื้องกัน */
              px: 6,
              /* การ์ด hero/ราง ด้านบนถือระยะห่างท้ายของตัวเองด้วย `mb: 4.5` แล้ว
                 ถ้ายังมี `pt` ที่นี่จะกลายเป็นช่องว่างซ้อนสองชั้น (6px + 18px) */
              pt: 0,
            },
          }}
        >

          {/* ══ คอลัมน์ซ้าย (main) — เนื้อของงาน: นัดหมาย · รายการ · สิ่งที่ทำได้ ══ */}
          <Box sx={{
              display: 'contents',
              [ORDER_TWO_COL_MQ]: {
                display: 'flex',
                flexDirection: 'column',
                gap: 4.5,
                /* 🛑 **ต้องมี** — grid item มี `min-width: auto` เป็นค่าตั้งต้น ⇒ คอลัมน์
                   ไม่ยอมหดต่ำกว่าความกว้างขั้นต่ำของเนื้อหาข้างใน แล้วดันกริดให้กว้างเกินกล่อง
                   ⇒ **ทั้งหน้าเลื่อนซ้ายขวาได้** (หัวหน้าเจอบนจอจริง 2026-08-29)
                   คลาสเดียวกับ `flex-header-truncation.md`: `truncate`/`ellipsis` ที่ลูก
                   ไม่มีผลเลยถ้ากล่องแม่ไม่ยอมหด — ต้องมาเป็นชุดเสมอ */
                minWidth: 0,
              },
            }}>
          {/* ↳ เหตุผลที่ยกเลิก */}
          <Box sx={{ order: 1, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0, '&:empty': { display: 'none' } }}>
          {/* ── 5. Cancel detail box (เมื่อ isCancelled) — S-13 ── */}
          {isCancelled && (
            <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, ...infoBoxSx }}>
              <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 0.25 }}>
                เหตุผล
              </Typography>
              <Typography variant='body2' sx={{ fontWeight: 500, color: 'text.secondary' }}>
                {cancelCopy}
              </Typography>
            </Box>
          )}
          </Box>

          {/* ↳ การ์ดนัดหมาย */}
          <Box sx={{ order: 2, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0, '&:empty': { display: 'none' } }}>
          {/* ── feature 00024: การ์ดนัดหมาย ──
              วางก่อน "รายการสินค้า" โดยตั้งใจ — สำหรับออเดอร์ที่มีนัด "นัดวันไหน" คือข้อมูล
              ที่ลูกค้าต้องการที่สุดของหน้านี้ ตรงตาม user story ("ไม่ต้องเลื่อนหาในแชท")
              ออเดอร์ที่ไม่มีนัด → appointment เป็น null → ไม่มี DOM ส่วนนี้เลย หน้าจอเหมือนเดิม */}
          {order.appointment && (
            <AppointmentCard
              token={order.publicToken}
              appointment={order.appointment}
              orderCancelled={order.status === 'CANCELLED'}
            />
          )}
          </Box>

          {/* ↳ รายการบริการ */}
          <Box sx={{ order: 7, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0, '&:empty': { display: 'none' } }}>
          {/* ── 6. Items card ── */}
          <Card>
            {/* 🛑 หัวข้อ + ตัวนับ ขึ้นเฉพาะเมื่อ**มีรายการจริง** — ไม่งั้นได้ "รายการบริการ · 0 รายการ"
                คร่อมความว่างเปล่า ซึ่งอ่านว่า "ข้อมูลหาย" มากกว่า "ไม่มีรายการ"
                ห้ามกั้นทั้ง `<Card>` เพราะ **แถวยอดรวมอยู่ในใบเดียวกัน** — กั้นทั้งใบ
                = ยอดเงินหายไปด้วย ซึ่งแย่กว่าหัวข้อที่ว่างมาก
                (ฐาน local 2026-08-29: 0 จาก 335 ใบ — ยังไม่เคยเกิด กันไว้เพราะราคาถูกกว่าการเจอ) */}
            {order.items.length > 0 && (
              <Box
                sx={{
                  ...cardInlinePadSx,
                  pt: 6,
                  pb: 0.75,
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 1.5,
                }}
              >
                {/* ร้านบริการไม่ได้ขาย "สินค้า" — ลูกค้าที่จ้างล้างแอร์เห็นคำนี้แล้วสะดุด
                    (หัวหน้า 2026-08-15: "order detail ดูไม่รู้เรื่อง") */}
                <SectionTitle>{order.isServiceShop ? 'รายการบริการ' : 'รายการสินค้า'}</SectionTitle>
                {/* ตัวนับ (mockup 2026-08-28) — บอกว่าต้องเลื่อนดูอีกกี่รายการก่อนถึงยอดรวม
                    ห้ามนับจากตัวเลขที่พิมพ์เอง ต้องมาจาก `order.items` ตัวเดียวกับที่เรนเดอร์
                    ไม่งั้นจอบอก 3 แต่แสดง 2 (คลาสเดียวกับตัวนับที่เคยไม่ตรงใน `sibling-surface-parity`) */}
                <Typography variant='caption' color='text.secondary' sx={{ flexShrink: 0 }}>
                  {order.items.length} รายการ
                </Typography>
              </Box>
            )}

            {order.items.map((item, idx) => (
              <Box key={item.id}>
                {idx > 0 && <Divider />}
                <Box sx={{ ...cardBodySx, display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                  <ItemThumbnail imageUrl={item.imageUrl} name={item.name} grayscale={isCancelled} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant='body2' sx={{ fontWeight: 500 }}>
                      {item.name}
                    </Typography>
                    {/* คำอธิบายรายการ — ร้านบริการกรอกจริง (prod: 150 แถวจากทั้งหมด) และเป็น
                        ที่ที่ "รุ่น/สเปก/เงื่อนไข" ของงานอยู่ เช่น "Mitsubishi MSY-GR13VF"
                        เดิมถูกส่งเข้ามาใน `PublicOrderData.items[].description` แต่**ไม่เคยถูกแสดง
                        สักที่เลย** ⇒ ลูกค้าเห็นแค่ชื่อบริการลอย ๆ ทั้งที่ร้านพิมพ์รายละเอียดไว้แล้ว

                        ตัดที่ 2 บรรทัด — คำอธิบายบางรายการยาวเป็นย่อหน้า ปล่อยเต็มจะดันราคา
                        ตกบรรทัดและทำให้รายการที่เหลือถูกดันพ้นจอแรก */}
                    {item.description && (
                      <Typography
                        variant='caption'
                        color='text.secondary'
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          lineHeight: 1.45,
                        }}
                      >
                        {item.description}
                      </Typography>
                    )}
                    <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
                      {item.qty} × {formatBaht(item.price)}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.8125rem', flexShrink: 0 }}>
                    {formatBaht(item.qty * item.price)}
                  </Typography>
                </Box>
              </Box>
            ))}

            {/**
             * ── แถบยอดรวม (ม็อกอัพ v5 `.total-bar`) ──
             *
             * v5 เปลี่ยนจาก "แถวเทาติดขอบการ์ด" เป็น **กล่องผิวม่วงจางมีขอบ** และให้ตัวเลข
             * เป็นสี primary ⇒ ยอดเงินเลิกกลืนไปกับแถวรายการที่อยู่เหนือมัน
             *
             * 🛑 ม่วงตรงนี้ไม่ขัด One Voice (≤10%) — มันคือ *ตัวเลขที่หน้านี้มีไว้เพื่อ*
             * ไม่ใช่ของประดับ · ผิวใช้ `primary.lightOpacity` ของธีม ไม่ hardcode ไล่สีตามม็อกอัพ (HR1)
             * เส้นคั่นเดิมถูกถอด: ขอบของกล่องแยกบล็อกให้อยู่แล้ว มีทั้งคู่ = ขีดซ้อนขีด
             */}
            <Box sx={{ ...cardInlinePadSx, pb: 6, pt: 0.5 }}>
              <Box
                sx={{
                  ...infoBoxSx,
                  borderRadius: 2,
                  bgcolor: 'primary.lightOpacity',
                  border: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                <Typography variant='body2' color='text.secondary'>
                  {totalLabel}
                </Typography>
                <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: 'primary.main' }}>
                  {formatBaht(order.totalAmount)}
                </Typography>
              </Box>
            </Box>
          </Card>
          </Box>

          {/* ↳ ต้องการความช่วยเหลือ */}
          <Box sx={{ order: 12, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0, '&:empty': { display: 'none' } }}>
          {/* ── ต้องการความช่วยเหลือ? — ตำแหน่งที่ ux ตัดสิน (คำตอบของ SDS TD-001) ──
              🛑 การ์ดนี้ render "นอก" เงื่อนไข canConfirm/isCancelled โดยตั้งใจ
              ของเดิมปุ่ม "ติดต่อร้านค้า" อยู่ใน (!canConfirm && isCancelled) = โผล่เฉพาะออเดอร์
              ที่ยกเลิก และ "ยังไม่ได้รับสินค้า" อยู่ใน (canConfirm && status==='SHIPPED') =
              ไม่เคยโผล่ตอน PENDING เลย — เงื่อนไข render เดิมกลายเป็น business rule โดยไม่ตั้งใจ
              เพราะตอนออกแบบปุ่มยัง disabled ถาวร ตำแหน่งจึงไม่มีนัยอะไร ── */}
          <Card>
            <Box sx={cardBodySx}>
              <SectionTitle>ต้องการความช่วยเหลือ?</SectionTitle>

              {/**
               * ── สองทางออก = **แถวที่มีแผ่นไอคอน** (ธีมของ `/dashboard` และ `/orders`) ──
               *
               * 🛑 หัวหน้าทักการ์ดนี้มาแล้ว 4 รอบ ทุกรอบผมแก้ *ทรงของปุ่ม* (outlined → tonal →
               * เต็มแถว → พอดีตัว) ซึ่งไม่เคยแตะเรื่องที่ผิดจริงเลย: **หน้านี้ไม่ได้พูดภาษา
               * เดียวกับหน้าอื่นของผู้ซื้อ**
               *
               * ลายเซ็นของ `/dashboard` กับ `/orders` คือ **แถวที่มีแผ่นไอคอนสีอ่อนอยู่ซ้ายมือ**
               * (ทุกออเดอร์ · ทุกสถิติ · ทุกรายการรีวิว ใช้ท่านี้หมด) — ไม่ใช่ปุ่มลอยกลางการ์ด
               * ⇒ ยกท่านั้นมาทั้งชุด: แผ่นไอคอน + ชื่อ + คำอธิบาย + ลูกศรขวา
               *
               * ได้ของแถมสองอย่างที่ปุ่มเดิมให้ไม่ได้: พื้นที่แตะเต็มแถว (ไม่ใช่แค่ตัวปุ่ม)
               * และมีที่ให้เขียนว่ากดแล้วเกิดอะไร โดยไม่ต้องมีคำอธิบายลอยอยู่เหนือปุ่ม
               */}
              <Box sx={{ mt: 0.5 }}>
                {/* BR-BOE-16: ไม่มีเงื่อนไขสถานะ — ติดต่อร้านได้เสมอ */}
                <HelpActionRow
                  component={Link}
                  href={`/messages/${order.shopId}`}
                  icon='tabler-headset'
                  tone='primary'
                  title='ติดต่อร้านค้า'
                  desc='คุยกับร้านโดยตรงในแชทของ Deep'
                />

                {/* BR-BOE-13: แจ้งปัญหาได้เมื่อออเดอร์ยังไม่ปิดจบ */}
                {order.status !== 'CONFIRMED' && order.status !== 'CANCELLED' && !disputeOpened && (
                  <HelpActionRow
                    component='button'
                    onClick={() => setDisputeDialogOpen(true)}
                    icon='tabler-flag-3'
                    tone='warning'
                    title='แจ้งปัญหาคำสั่งซื้อ'
                    desc='ให้ Deep ตรวจสอบ — ร้านจะเห็นเรื่องนี้ด้วย'
                  />
                )}
              </Box>

              {/* มีเรื่องเปิดค้างแล้ว → แทนที่แถวด้วยสถานะที่กดไม่ได้ตั้งแต่โหลดหน้าแรก
                  ไม่ต้องรอให้ผู้ใช้กดแล้วเจอ 409 · โทน warning ไม่ใช่ error เพราะเป็น
                  "รอดำเนินการ" ไม่ใช่ "ผิดพลาด" */}
              {order.status !== 'CONFIRMED' && order.status !== 'CANCELLED' && disputeOpened && (
                <Box
                  sx={{
                    mt: 1,
                    bgcolor: 'warning.lightOpacity',
                    borderRadius: 2,
                    ...infoBoxSx,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <Icon icon='tabler-flag-3' style={{ fontSize: 17, color: 'var(--mui-palette-warning-main)' }} />
                  <Typography variant='body2' sx={{ fontWeight: 500, color: 'warning.main' }}>
                    แจ้งปัญหาแล้ว
                    {disputeOpenedAt ? ` เมื่อ ${formatDateTimeTH(disputeOpenedAt)}` : ''}
                  </Typography>
                </Box>
              )}
            </Box>
          </Card>
          </Box>

          </Box>

          {/* ══ คอลัมน์ขวา (aside) — เงิน · หลักฐาน · รีวิว ══ */}
          <Box sx={{
              display: 'contents',
              [ORDER_TWO_COL_MQ]: {
                display: 'flex',
                flexDirection: 'column',
                gap: 4.5,
                /* 🛑 **ต้องมี** — grid item มี `min-width: auto` เป็นค่าตั้งต้น ⇒ คอลัมน์
                   ไม่ยอมหดต่ำกว่าความกว้างขั้นต่ำของเนื้อหาข้างใน แล้วดันกริดให้กว้างเกินกล่อง
                   ⇒ **ทั้งหน้าเลื่อนซ้ายขวาได้** (หัวหน้าเจอบนจอจริง 2026-08-29)
                   คลาสเดียวกับ `flex-header-truncation.md`: `truncate`/`ellipsis` ที่ลูก
                   ไม่มีผลเลยถ้ากล่องแม่ไม่ยอมหด — ต้องมาเป็นชุดเสมอ */
                minWidth: 0,
              },
            }}>
          {/* ↳ การ์ดเงิน */}
          <Box sx={{ order: 3, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0, '&:empty': { display: 'none' } }}>
          {/**
           * การชำระเงิน (feature 00050 · AC-SQ-06)
           *
           * 🛑 อยู่ **นอก** เงื่อนไขของการ์ดนัดโดยตั้งใจ — งาน walk-in ที่ร้านยังไม่กด "เริ่มงาน"
           * ไม่มี `appointment` แต่มีเรื่องเงินอยู่แล้ว ถ้าเอาไปซ้อนในนั้นการ์ดจะหายไปทั้งที่
           * ลูกค้ากำลังจะโอนเงินอยู่พอดี (คลาสเดียวกับที่ FAB หายไปพร้อม SellerBottomNav)
           *
           * 🛑 วางไว้ **ใต้การ์ดนัด** ไม่ใช่เหนือ — คอมเมนต์ของ feature 00024 เหนือการ์ดนัด
           * ตัดสินไว้แล้วว่า *"นัดวันไหน คือข้อมูลที่ลูกค้าต้องการที่สุดของหน้านี้"* ร่างแรกของ
           * feature นี้วางเงินไว้เหนือมันโดยไม่ได้อ่านมติเดิม — ลำดับที่ถูกคือ
           * เมื่อไหร่ → จ่ายเท่าไหร่ → ทำอะไรบ้าง
           *
           * null = ไม่มีเรื่องเงินให้พูดถึง (ออเดอร์ขายออนไลน์ทั่วไป) → DOM เหมือนเดิมทุก node
           */}
          {order.money && <PaymentSummaryCard money={order.money} paymentMethod={order.paymentMethod} />}
          </Box>

          {/**
           * ── feature 00062 (จาก main): บัญชีรับเงิน + QR · จุดนัดรับ ──
           *
           * 🛑 สเปกบังคับให้อยู่ **ก่อนการ์ดรายการเสมอทั้งสองจอ** — บนโครง 2 คอลัมน์ของเรา
           * แปลว่าต้องได้ `order` ที่น้อยกว่าการ์ดรายการ (ซึ่งเป็น 7) · วางในคอลัมน์ขวา
           * รวมกับการ์ดเงิน เพราะทั้งคู่ตอบคำถามเดียวกันว่า "จ่ายยังไง"
           * (การ์ดเดียวกับที่จอ guest เรียก — `sibling-surface-parity`)
           */}
          <Box sx={{ order: 5, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0, '&:empty': { display: 'none' } }}>
          {needsPayoutAccount(order.paymentMethod) && (
            <PayoutAccountCard
              totalAmount={order.totalAmount}
              payoutSnapshot={order.payoutSnapshot}
              paymentBadge={paymentBadge}
              status={order.status}
              paymentConfirmedAt={order.paymentConfirmedAt}
              contactShopAction={
                <Button
                  component={Link}
                  href={`/messages/${order.shopId}`}
                  fullWidth
                  variant='tonal'
                  color='primary'
                  startIcon={<Icon icon='tabler-headset' fontSize={18} />}
                  sx={{ minHeight: 44, fontWeight: 500 }}
                >
                  ติดต่อร้านค้า
                </Button>
              }
            />
          )}
          </Box>

          <Box sx={{ order: 6, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0, '&:empty': { display: 'none' } }}>
          {isPickupOrder(order.fulfillmentMode) && (
            <PickupInfoCard
              shopName={order.shop.shopName}
              shopAddress={order.shop.address}
              handedOverAt={order.handedOverAt}
              status={order.status}
            />
          )}
          </Box>

          {/* ↳ แนบสลิป */}
          <Box sx={{ order: 4, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0, '&:empty': { display: 'none' } }}>
          {/* ── สลิป — 🛑 ต้องอยู่ "ก่อน" โซนรีวิวเสมอ (FR-010) ──
              เดิมอยู่ล่างสุดใต้ทุกอย่างรวมถึงรีวิว ซึ่งกลับลำดับของความเป็นจริง: การชำระเงิน
              เกิดก่อนการรับของ และการรีวิวเกิดหลังรับของ — ผู้ซื้อที่เพิ่งโอนเงินต้องเลื่อนผ่าน
              ทั้งหน้าเพื่อหาที่แนบสลิป ──

              🛑 ย้ายขึ้นมาติดการ์ดเงิน 2026-08-28 — การย้ายรอบก่อนแก้ได้แค่ครึ่งเดียว:
              มันยังอยู่ใต้การ์ดรายการ/วิธีชำระ/เลขพัสดุ ห่างจากการ์ดเงินราว 130 บรรทัด
              ขณะที่**การ์ดเงินเป็นตัวที่เขียนว่า "แนบสลิปไว้ได้เลย"** ⇒ ประโยคชวนให้ทำ
              กับตัวที่ให้ทำ อยู่คนละหน้าจอกัน · ยังอยู่ก่อนโซนรีวิวตาม FR-010 เหมือนเดิม ── */}
          {showSlipZone(order.status, order.paymentMethod) && (
            <>
              <input
                ref={slipInputRef}
                type='file'
                accept='image/*,application/pdf'
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleSlipUpload(file)
                }}
              />

              {slipFileId == null ? (
                /* ── slip-empty: ยังไม่แนบสลิป ── */
                <Card>
                  <Box sx={{ ...cardBodySx, textAlign: 'center' }}>
                    <SectionTitle>แนบสลิป</SectionTitle>

                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                      <CustomAvatar skin='light' variant='rounded' color='primary' size={42}>
                        <Icon icon='tabler-camera' fontSize={20} />
                      </CustomAvatar>
                    </Box>

                    <Typography variant='body2' sx={{ fontWeight: 700 }}>
                      อัปโหลดสลิปการโอนเงิน
                    </Typography>
                    <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.25 }}>
                      ไฟล์ภาพหรือ PDF ≤ {SLIP_MAX_MB}MB
                    </Typography>

                    <Button
                      fullWidth
                      variant='outlined'
                      color='primary'
                      disabled={uploadingSlip}
                      onClick={() => slipInputRef.current?.click()}
                      startIcon={<Icon icon='tabler-plus' fontSize={15} />}
                      sx={{ mt: 1.5, borderStyle: 'dashed', /* พื้นที่แตะ 44px ตาม `PRODUCT.md` — วัดจริงได้ต่ำกว่าเกณฑ์ (2026-08-30) */ minHeight: 44, }}
                    >
                      {uploadingSlip ? 'กำลังอัปโหลด...' : 'เลือกรูปสลิป'}
                    </Button>
                  </Box>
                </Card>
              ) : (
                /* ── slip-done: แนบสลิปแล้ว ── */
                <Card>
                  <Box sx={{ ...cardBodySx, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {slipPreview ? (
                      <Avatar
                        variant='rounded'
                        src={slipPreview}
                        alt='ตัวอย่างสลิป'
                        sx={{ width: 46, height: 62, borderRadius: 1.5, flexShrink: 0, border: '1px solid', borderColor: 'divider' }}
                      />
                    ) : (
                      <CustomAvatar skin='light' variant='rounded' color='success' sx={{ width: 46, height: 62, borderRadius: 1.5, flexShrink: 0 }}>
                        <Icon icon='tabler-file-check' fontSize={22} />
                      </CustomAvatar>
                    )}

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant='body2' sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {slipName ?? 'สลิปที่แนบ'}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                        <Icon icon='tabler-check' style={{ fontSize: 12, color: 'var(--mui-palette-success-main)' }} />
                        <Typography variant='caption' sx={{ fontWeight: 700, color: VERIFIED_INK }}>
                          แนบสลิปแล้ว
                        </Typography>
                      </Box>
                    </Box>

                    <Button
                      size='small'
                      variant='outlined'
                      color='secondary'
                      disabled={uploadingSlip}
                      onClick={() => slipInputRef.current?.click()}
                      sx={{ flexShrink: 0 }}
                    >
                      {uploadingSlip ? '...' : 'เปลี่ยน'}
                    </Button>
                  </Box>
                </Card>
              )}
            </>
          )}
          </Box>

          {/* ↳ ช่องทางชำระเงิน */}
          <Box sx={{ order: 8, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0, '&:empty': { display: 'none' } }}>
          {/* ── 7. Payment method card (COD/เงินสด — `needsPayoutAccount()` = false) ──
              feature 00062 (จาก main): TRANSFER/PROMPTPAY/อื่น ๆ ที่ต้องโอน ย้ายไป
              `PayoutAccountCard` ข้างบนแล้ว (มีบัญชี+QR ให้จริง) การ์ดนี้เหลือไว้เฉพาะกรณี
              "ไม่ต้องโอน" ซึ่งไม่มีอะไรให้บัญชี/QR แสดงอยู่แล้ว
              🛑 เงื่อนไขเดิมของเราคือ `!order.money` — **ต้องใช้ของ main แทน** เพราะ 00062
              ย้ายเคสโอนออกไปทั้งกลุ่ม ถ้าคงเงื่อนไขเดิมไว้ ออเดอร์โอนจะได้การ์ดสองใบพูดเรื่อง
              เดียวกัน (การ์ดบัญชีของ 00062 + การ์ดช่องทางของเรา) */}
          {/* D4: icon tonal info=โอนเงิน / warning=COD (ไม่ใช่ success — green สงวนไว้กับ verified) */}
          {order.paymentMethod !== null && !needsPayoutAccount(order.paymentMethod) && (
            <Card>
              <Box sx={cardBodySx}>
                {/* หัวข้อการ์ดตามม็อกอัพ v5 — ของเดิมมีแต่แถวเนื้อหาลอย ๆ ไม่มีอะไรบอกว่า
                    การ์ดใบนี้ตอบคำถามอะไร ต่างจากการ์ดใบอื่นในคอลัมน์เดียวกันที่มีหัวข้อครบ */}
                <SectionTitle>ช่องทางการชำระเงิน</SectionTitle>
                <Box
                  sx={{
                    display: 'flex',
                    gap: 1.25,
                    alignItems: 'center',
                    /* v5 `.payment-box` — กล่องมีขอบในการ์ด ไม่ใช่แถวลอย */
                    ...infoBoxSx,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'action.hover',
                  }}
                >
                  {/* การ์ดนี้ขึ้นเฉพาะ `!needsPayoutAccount()` (ปลายทาง/เงินสด) ⇒ ไม่มีเคสโอน
                      ที่นี่ ไอคอนจึงคงที่ ไม่ต้องแตกกิ่ง — ฝั่งโอนไปอยู่การ์ดบัญชีรับเงินแทน */}
                  <CustomAvatar skin='light' variant='rounded' color='warning' size={40}>
                    <Icon icon='tabler-coin' fontSize={20} />
                  </CustomAvatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant='body2' sx={{ fontWeight: 700 }}>
                      {paymentMethodLabel(order.paymentMethod)}
                    </Typography>
                    {/* ค่าดิบของร้านโชว์เฉพาะตอนที่มันบอกอะไรเกินกว่าป้าย — ไม่งั้นได้
                        "เงินสด / CASH" ซ้อนกันในกล่องเดียว (เห็นบนจอจริง 2026-08-30)
                        🛑 ต้อง short-circuit ทั้ง element ไม่ใช่ปล่อย null เข้าไปข้างใน:
                        `<Typography display='block'>` ที่ว่างยังกินความสูงหนึ่งบรรทัด
                        ⇒ ได้ที่ว่างโล่ง ๆ ใต้ป้ายเหมือนกรณี bio ในหน้า `/b/[slug]` */}
                    {paymentMethodDetail(order.paymentMethod) !== null && (
                      <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
                        {paymentMethodDetail(order.paymentMethod)}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            </Card>
          )}
          </Box>

          {/* ↳ เลขพัสดุ */}
          <Box sx={{ order: 9, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0, '&:empty': { display: 'none' } }}>
          {/* ── 8. Shipment tracking card (เมื่อ shipmentTracking != null) ── */}
          {order.shipmentTracking && (
            <Card>
              <Box sx={{ ...cardBodySx, display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <CustomAvatar skin='light' variant='rounded' color='info' size={32}>
                  <Icon icon='tabler-truck' fontSize={16} />
                </CustomAvatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
                    {order.shipmentTracking.provider}
                  </Typography>
                  {/* trackingNo — monospace ที่อนุญาต (Hard Rule 5 exception) */}
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '.04em', wordBreak: 'break-all' }}>
                    {order.shipmentTracking.trackingNo}
                  </Typography>
                </Box>
                {typeof navigator !== 'undefined' && navigator?.clipboard && (
                  <Button
                    size='small'
                    variant='tonal'
                    color='info'
                    onClick={() => handleCopyTracking(order.shipmentTracking!.trackingNo)}
                    aria-label='คัดลอกเลข tracking'
                    sx={{ flexShrink: 0, ml: 'auto', minWidth: 0 }}
                  >
                    {copied ? <Icon icon='tabler-check' fontSize={16} /> : 'คัดลอก'}
                  </Button>
                )}
              </Box>
            </Card>
          )}
          </Box>

          {/* ↳ โซนรีวิว */}
          <Box sx={{ order: 10, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0, '&:empty': { display: 'none' } }}>
          {/* ── โซนรีวิว (3 สถานะ — ดู SDS TD-002) ── */}
          {order.hasReview && order.review && editingReview && (
            <Card>
              <Box sx={cardBodySx}>
                <SectionTitle>แก้ไขรีวิว</SectionTitle>
                <ReviewForm
                  token={order.publicToken}
                  mode='edit'
                  initial={{
                    rating: order.review.rating,
                    comment: order.review.comment,
                    images: order.review.images,
                  }}
                  onCancel={() => setEditingReview(false)}
                />
              </Box>
            </Card>
          )}

          {order.hasReview && order.review && !editingReview && (
            <Card>
              <Box sx={cardBodySx}>
                <SectionTitle>รีวิวของคุณ</SectionTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Box sx={{ display: 'flex', gap: 0.25 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Icon
                        key={i}
                        icon={i < order.review!.rating ? 'tabler-star-filled' : 'tabler-star'}
                        style={{
                          fontSize: 16,
                          color: i < order.review!.rating ? 'var(--mui-palette-warning-main)' : 'var(--mui-palette-text-disabled)',
                        }}
                      />
                    ))}
                  </Box>
                  {/* 🛑 `TrustPill` ไม่ใช่ `Chip variant='tonal'` — tonal ของธีมนี้ให้ text =
                      `{semantic}.main` บนพื้นจาง = **1.94:1 ตก AA** (`TrustPill.tsx` เขียนเหตุผล
                      ไว้เองและถูกสร้างมาลบแพตเทิร์นนี้ทิ้ง) · ของเดิมก่อนงานนี้ แต่เก็บพร้อมกัน
                      เพราะจอเดียวกันเหลือ "ป้าย" 2 หน้าตาไม่ได้ */}
                  <Box sx={{ ml: 'auto' }}>
                    <TrustPill tone='green' label='รีวิวแล้ว' />
                  </Box>
                </Box>
                {order.review.comment && (
                  <Typography variant='body2' color='text.secondary' sx={{ lineHeight: 1.6, mb: 1 }}>
                    {order.review.comment}
                  </Typography>
                )}
                {/* รูปแนบ (BR-BOE-19) */}
                {order.review.images.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                    {order.review.images.map(fileId => (
                      <Box
                        key={fileId}
                        component='img'
                        src={`/api/files/${fileId}`}
                        alt=''
                        sx={{ width: 56, height: 56, borderRadius: 2, objectFit: 'cover', display: 'block' }}
                      />
                    ))}
                  </Box>
                )}

                <Typography variant='caption' color='text.secondary'>
                  คุณ · {formatDateTimeTH(order.review.createdAtIso)}
                </Typography>

                {/* แก้ไข/ลบได้ภายใน 24 ชม. จากเวลาโพสต์ครั้งแรก (BR-BOE-17)
                    หมดเวลาแล้ว → ปุ่มหายไปเฉย ๆ **ไม่ขึ้นข้อความว่า "หมดเวลาแล้ว"** —
                    รีวิวยังแสดงปกติ ไม่มีอะไรผิดพลาดที่ต้องแจ้ง */}
                {canEditReview(new Date(order.review.createdAtIso)) && (
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.5, mb: 1 }}>
                      <Icon icon='tabler-clock' style={{ fontSize: 14, color: 'var(--mui-palette-text-disabled)' }} />
                      <Typography variant='caption' color='text.secondary'>
                        {formatEditWindowLeft(order.review.createdAtIso)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button size='small' variant='outlined' color='primary' onClick={() => setEditingReview(true)}>
                        แก้ไขรีวิว
                      </Button>
                      <Button size='small' variant='text' color='secondary' onClick={() => setDeleteReviewDialogOpen(true)}>
                        ลบรีวิว
                      </Button>
                    </Box>
                  </>
                )}

                {/* คำตอบของร้าน (BR-BOE-21) — info tint ไม่ใช่เขียว: เป็นคำพูดของร้าน
                    ไม่ใช่ข้อเท็จจริงที่ระบบยืนยันได้ (Verified-Means-Green) */}
                {order.review.shopReply && (
                  <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, ...infoBoxSx, mt: 1.5 }}>
                    <Typography variant='caption' sx={{ fontWeight: 700, color: 'primary.main', display: 'block', mb: 0.25 }}>
                      ร้านค้าตอบกลับ
                    </Typography>
                    <Typography variant='body2' color='text.secondary' sx={{ lineHeight: 1.6 }}>
                      {order.review.shopReply.comment}
                    </Typography>
                    <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.5 }}>
                      {formatDateTimeTH(order.review.shopReply.repliedAtIso)}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Card>
          )}

          {/* สถานะที่ 3: เคยรีวิวแล้วแต่ลบทิ้ง — เบากว่าอีกสองสถานะโดยตั้งใจ
              ไม่มีกรอบแดง/ไอคอน error เพราะนี่คือ "ปิดจบแล้ว" ไม่ใช่ "ผิดพลาด" */}
          {order.hasReview && !order.review && (
            <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, px: 2, py: 3, textAlign: 'center' }}>
              <Icon
                icon='tabler-mood-sad'
                style={{ fontSize: 30, color: 'var(--mui-palette-text-disabled)' }}
              />
              <Typography variant='body2' sx={{ fontWeight: 500, color: 'text.secondary', mt: 1 }}>
                คุณลบรีวิวนี้ไปแล้ว
              </Typography>
              <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.5, lineHeight: 1.6 }}>
                รีวิวที่ลบแล้วไม่สามารถเขียนใหม่สำหรับคำสั่งซื้อนี้ได้อีก
              </Typography>
            </Box>
          )}

          {/**
           * รีวิวที่ยังไม่เปิด (mockup 2026-08-28 `review-lock`)
           *
           * 🛑 เดิมออเดอร์ที่ยัง `PENDING` **ไม่มี UI เรื่องรีวิวเลยสักชิ้น** ⇒ ผู้ซื้อไม่รู้ว่า
           * ระบบมีรีวิว ไม่รู้ว่ามันจะเปิดเมื่อไร และไม่รู้ว่าต้องทำอะไรถึงจะได้เขียน
           * — ทั้งที่ "รีวิว" คือสิ่งที่ทำให้ร้านถัดไปน่าเชื่อถือ ซึ่งเป็นเหตุผลที่ระบบนี้มีอยู่
           *
           * เงื่อนไข: ยังไม่เคยรีวิว **และ** ยังเขียนไม่ได้ **และ** ใบยังไม่ถูกยกเลิก
           * (ใบที่ยกเลิกจะไม่มีวันได้รีวิว — ขึ้นการ์ดนี้คือสัญญาสิ่งที่จะไม่เกิด)
           *
           * ดาวเป็น **สีจาง** ไม่ใช่สีเหลือง — เหลืองอ่านเป็น "มีคะแนนแล้ว"
           * และห้ามกดได้ ไม่งั้นผู้ซื้อกดแล้วไม่เกิดอะไร ซึ่งแย่กว่าไม่มีปุ่ม
           */}
          {!order.hasReview && !canReview && !isCancelled && (
            <Card>
              <Box sx={{ ...cardBodySx, textAlign: 'center' }}>
                <SectionTitle>รีวิวร้านค้า</SectionTitle>
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5, mb: 1 }} aria-hidden='true'>
                  {[0, 1, 2, 3, 4].map(i => (
                    <Icon
                      key={i}
                      icon='tabler-star-filled'
                      style={{ fontSize: 22, color: 'var(--mui-palette-action-disabled)' }}
                    />
                  ))}
                </Box>
                <Typography variant='body2' color='text.secondary' sx={{ lineHeight: 1.7 }}>
                  {/* อ้างคำบนปุ่มจริง ไม่พิมพ์ซ้ำ — วันที่คำบนปุ่มเปลี่ยน ประโยคนี้ต้องเปลี่ยนตาม
                      ไม่งั้นจะบอกให้กดปุ่มที่ไม่มีอยู่ (HR16 · เหตุผลเดียวกับกล่องอธิบายบนราง) */}
                  เขียนรีวิวได้หลังกด &ldquo;{ctaLabel}&rdquo;
                </Typography>
              </Box>
            </Card>
          )}

          {canReview && (
            <Card>
              <Box sx={cardBodySx}>
                <SectionTitle>รีวิวร้านค้า</SectionTitle>
                {/* คำผันตามประเภทร้าน — ร้านบริการไม่มี "สินค้า" ให้ "ถึงมือ"
                    (คลาสเดียวกับหัวข้อ "รายการบริการ" ที่แก้ไปแล้วเหนือขึ้นไป) */}
                <Typography variant='subtitle1' sx={{ fontWeight: 700, mb: 0.25 }}>
                  {order.isServiceShop ? 'รับบริการเรียบร้อยแล้ว' : 'สินค้าถึงมือคุณแล้ว'}
                </Typography>
                <Typography variant='body2' color='text.secondary' sx={{ mb: 1.75 }}>
                  ให้คะแนนร้านนี้เพื่อช่วยผู้ซื้อคนอื่น
                </Typography>
                <ReviewForm token={order.publicToken} />
              </Box>
            </Card>
          )}
          </Box>

          {/**
           * ── การ์ด "ช้อปกับ Deep มั่นใจได้" (ม็อกอัพ v5 `.trust-card`) ──
           *
           * 🛑 **คำในม็อกอัพถูกเขียนใหม่ทั้ง 3 บรรทัด** ของเดิมเป็นคำรับรองที่ตรวจสอบไม่ได้
           * ("ข้อมูลของคุณปลอดภัย · ติดตามสถานะได้ตลอด · มีทีมงานช่วยเหลือเสมอ") ซึ่ง
           * `OfficialChannels` เขียนกฎไว้เองว่า *"บนหน้าที่ทั้งหน้ามีไว้พิสูจน์ความน่าเชื่อถือ
           * คำรับรองที่ตรวจสอบไม่ได้มีค่าเท่ากับโฆษณา"* — และหน้านี้คือหน้านั้นพอดี
           *
           * ทั้ง 3 บรรทัดที่ใช้จริงเป็น **กลไกที่มีอยู่ในระบบ** ชี้ไปที่โค้ดได้ทุกข้อ:
           *   1. ประวัติออเดอร์ → `OrderEvent` บันทึกทุกการเปลี่ยนสถานะ
           *   2. แจ้งปัญหาได้จนกว่าจะปิดจบ → BR-BOE-13 (ตัวกั้นอยู่ในการ์ดช่วยเหลือใบนี้เอง)
           *   3. รายละเอียดเต็มต้องยืนยันเบอร์ → `resolveOrderAccess` + จอ guest ที่ปิดเบอร์/ที่อยู่
           *
           * ถ้าวันหนึ่งข้อไหนไม่จริงแล้ว ต้องลบบรรทัดนั้นทิ้ง ไม่ใช่แก้คำให้กำกวมลง
           */}
          <Box sx={{ order: 14, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0, '&:empty': { display: 'none' } }}>
            <Card sx={{ bgcolor: 'primary.lightOpacity' }}>
              <Box sx={cardBodySx}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
                  <Box
                    aria-hidden='true'
                    sx={{
                      width: 42,
                      height: 42,
                      flexShrink: 0,
                      borderRadius: 2,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: 'background.paper',
                      color: 'primary.main',
                    }}
                  >
                    <Icon icon='tabler-shield-check' fontSize={22} />
                  </Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>ซื้อผ่าน Deep มั่นใจได้</Typography>
                </Box>

                <Box sx={{ display: 'grid', gap: 0.75 }}>
                  {[
                    'ทุกความเคลื่อนไหวของออเดอร์ถูกบันทึกเป็นประวัติ',
                    'แจ้งปัญหาได้จนกว่าคุณจะกดยืนยันรับของ',
                    'รายละเอียดเต็มเปิดได้เฉพาะคนที่ยืนยันเบอร์ตรงกับออเดอร์',
                  ].map((line) => (
                    <Box key={line} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      {/* เขียวคือสีของ "ยืนยันแล้ว" ทั้งระบบ (Verified-Means-Green — design.json)
                          ใช้ที่นี่เพราะทั้ง 3 บรรทัดเป็นข้อเท็จจริงที่บังคับด้วยโค้ด ไม่ใช่คำโปรย */}
                      <Icon
                        icon='tabler-circle-check'
                        style={{ fontSize: 15, flexShrink: 0, marginTop: 3, color: VERIFIED_INK }}
                        aria-hidden='true'
                      />
                      <Typography variant='caption' sx={{ color: 'text.secondary', lineHeight: 1.55 }}>
                        {line}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Card>
          </Box>

          {/* ↳ ลิงก์ดิจิทัล */}
          <Box sx={{ order: 11, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0, '&:empty': { display: 'none' } }}>
          {/* ── S-10: Digital access-link card (OOS-2) ── */}
          {order.fulfillmentMode === 'NO_SHIPPING' &&
            order.accessUrl != null &&
            isHttpUrl(order.accessUrl) && (
              <Card>
                <Box sx={{ ...cardBodySx, display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  <CustomAvatar skin='light' variant='rounded' color='primary' size={32}>
                    <Icon icon='tabler-link' fontSize={16} />
                  </CustomAvatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
                      ลิงก์เข้าถึง
                    </Typography>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {order.accessUrl}
                    </Typography>
                  </Box>
                  {/* MUI Button component='a' — client component (ไม่ผิด Hard Rule 2 ซึ่งห้ามเฉพาะ server component) */}
                  <Button
                    component='a'
                    href={order.accessUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    size='small'
                    variant='tonal'
                    color='primary'
                    sx={{ flexShrink: 0, ml: 'auto', minWidth: 0 }}
                  >
                    เปิด
                  </Button>
                </Box>
              </Card>
            )}
          </Box>

          {/* ↳ ท้ายหน้า */}
          <Box sx={{ order: 13, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0, '&:empty': { display: 'none' } }}>
          {/* ── Footer — non-canConfirm states ── */}
          {!canConfirm && (
            <Box sx={{ textAlign: 'center', py: 2, ...cardInlinePadSx }}>
              {order.status === 'CONFIRMED' && (
                <Typography
                  variant='caption'
                  color='text.secondary'
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5 }}
                >
                  <Icon icon='tabler-shield-check' style={{ color: 'var(--mui-palette-primary-main)', fontSize: 12 }} />
                  ธุรกรรมนี้สำเร็จและบันทึกแล้ว
                </Typography>
              )}
              <Typography variant='caption' color='text.secondary'>
                {isCancelled
                  ? 'คำสั่งซื้อนี้ถูกยกเลิกแล้ว ไม่สามารถดำเนินการต่อได้'
                  : 'ปกป้องการซื้อขายโดย Deep'}
              </Typography>
            </Box>
          )}
          </Box>

          </Box>
        </Box>

        {/* ท้ายหน้าชุดเดียวกับหน้าโปรไฟล์ร้านสาธารณะ — ดูเหตุผลที่ `PublicProfileFooter` */}
        <PublicProfileFooter />

        {/* กันที่ให้แถบ CTA — แถบเป็น `fixed` จึงไม่กินที่ใน flow ถ้าไม่มีบล็อกนี้
            ท้าย footer จะจมอยู่ใต้แถบถาวร เลื่อนลงไปอ่านไม่ได้เลย (วัดได้ 71px บน 390×844) */}
        {canConfirm && <Box aria-hidden sx={{ height: ctaBarHeight }} />}
      </Box>

      {/* ── แถบ CTA ล่างจอ — เฉพาะ canConfirm (PENDING/SHIPPED) ──
          🛑 `fixed` ไม่ใช่ `sticky` + `mt:'auto'` เหมือนเดิม (จอ guest เป็น fixed อยู่แล้ว)
          `sticky bottom:0` ในคอลัมน์ flex แปลว่าแถบเป็น "ท้ายเนื้อหาที่บังเอิญเกาะขอบจอ" —
          มันอยู่ **หลัง** ท้ายหน้าใน flow จึงลอยทับ footer ตอนเลื่อน แล้วหลุดไปอยู่ใต้ footer
          ตอนเลื่อนสุด = ปุ่มหลักของหน้าหายไปตอนที่ผู้ใช้เลื่อนอ่านจนจบพอดี ซึ่งเป็นจังหวะ
          ที่เขาพร้อมจะกดที่สุด · fixed ทำให้แถบเป็น chrome ของจอจริง ๆ อยู่ตลอดเวลา */}
      {canConfirm && (
        <Box
          ref={ctaBarRef}
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 30,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            backdropFilter: 'blur(12px)',
            pb: 'max(0px, env(safe-area-inset-bottom))',
          }}
        >
          {/* แถบ CTA ล่างจอ — กว้างตามคอนเทนต์ ไม่ใช่ 420 คงที่ (บนแท็บเล็ตปุ่มเคยลอยแคบกลางจอ)
              🛑 ต้องใช้ `orderDetailWidthSx` ตัวเดียวกับคอลัมน์เนื้อหา ไม่ใช่ `orderContentWidthSx`
              ไม่งั้นพอเนื้อหาขยายเป็น 1200 บนจอกว้าง แถบนี้ยังค้างที่ 880 แล้วปุ่มจะไม่ตรงกับ
              ขอบของสิ่งที่มันกำลังยืนยันอยู่ (จอ guest ยังใช้ตัวเดิมเพราะเป็นคอลัมน์เดียว) */}
          <Box
            sx={{
              ...orderDetailWidthSx,
              px: 2,
              pt: 1.5,
              pb: 1.75,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
            }}
          >
            {/* Primary CTA — D2: contained primary แทน ink #0F172A */}
            {/* 🛑 เปิด dialog ก่อน ไม่ยิง handleConfirm ตรง ๆ
                การกดนี้ทำให้ออเดอร์เป็น CONFIRMED ถาวร ป้อนเข้า Trust Score และ **ซ่อนปุ่มแจ้งปัญหาทิ้ง**
                (เงื่อนไขที่บรรทัด ~1086) ซึ่งเป็นทางออกเดียวของผู้ซื้อที่ยังไม่ได้ของ
                — ก่อน 00041 ยังไม่มีปุ่มแจ้งปัญหาให้เสีย ตอนนี้มีแล้ว เดิมพันจึงสูงขึ้นจริง
                ขณะที่ "ยกเลิกคำสั่งซื้อ" ที่อยู่ห่างลงไป 5 บรรทัดกลับมี dialog มาตลอด */}
            {/* 🛑 `minHeight: 44` — PRODUCT.md §Accessibility + DESIGN.md §Do's ตั้ง tap target
                ≥44px เป็น baseline · MUI `size='medium'` ในธีมนี้ให้ ~37px
                ⇒ **ปุ่มที่กดแล้วย้อนไม่ได้ เล็กกว่าปุ่ม "ยืนยันนัด" ที่ย้อนได้** (44px)
                ซึ่งกลับหัวกลับหางกับความสำคัญ (`AppointmentCard` ใส่ค่านี้ไว้ถูกแล้ว) */}
            {/* 🛑 น้ำหนักปุ่มผันตามราง — ทึบเมื่อถึงเวลากดจริง · tonal ระหว่างที่ยังไม่ถึง
                ปุ่มนี้ย้อนกลับไม่ได้ ไม่ควรเป็นของที่เด่นที่สุดในจอตอนที่ยังไม่ควรกดที่สุด
                ยังกดได้อยู่ (ไม่ใช่ disabled) เพราะร้านอาจลืมกดปิดผลนัด แล้วลูกค้าที่ได้รับ
                บริการจริงจะปิดงานไม่ได้เลย — ดูเหตุผลเต็มที่ `isFinalStepReady` */}
            {/**
             * ── แถบล่าง = ยอดเงิน + ปุ่มยืนยัน (ม็อกอัพ v5 `.sticky-inner`) ──
             *
             * 🛑 **ปุ่มยกเลิกถูกถอดออกจากแถบนี้** ไปอยู่ในการ์ด "ต้องการความช่วยเหลือ?" ที่เดียว
             * ม็อกอัพมีทั้งสองที่ ซึ่งแปลว่าการกระทำที่ย้อนไม่ได้มี 2 ทางเข้าในจอเดียว —
             * ไม่ทำตามข้อนั้น · ที่ว่างที่ได้คืนเอาไปแสดง **ยอดที่ต้องชำระ** ซึ่ง v5 ขอมาเหมือนกัน
             * และมีค่ากว่า: มันคือตัวเลขที่ผู้ซื้อต้องเห็นตอนนิ้วอยู่บนปุ่มยืนยันพอดี
             *
             * มือถือซ่อนยอด (v5 `.sticky-total{display:none}`) — จอแคบต้องยกที่ทั้งหมดให้ปุ่ม
             */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ display: 'none', [ORDER_TWO_COL_MQ]: { display: 'block', flexShrink: 0 } }}>
                <Typography variant='caption' sx={{ display: 'block', color: 'text.secondary' }}>
                  {totalLabel}
                </Typography>
                <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.2 }}>
                  {formatBaht(order.totalAmount)}
                </Typography>
              </Box>

              <Button
                fullWidth
                variant={ctaReady ? 'contained' : 'tonal'}
                color='primary'
                disabled={submitting}
                onClick={() => setConfirmDialogOpen(true)}
                sx={{ minHeight: 44, [ORDER_TWO_COL_MQ]: { maxWidth: 420, marginInlineStart: 'auto' } }}
              >
                {ctaLabel}
              </Button>

              {/**
               * ── ยกเลิกคำสั่งซื้อในแถบล่าง (ม็อกอัพ v5 `.cancel`) ──
               *
               * 🛑 **หัวหน้าเคาะเอง 2026-08-30** ("bottombar ต้องมียกเลิกด้วยปะนะ") —
               * ผมเคยถอดออกโดยให้เหตุผลว่า "การกระทำที่ย้อนไม่ได้ไม่ควรมี 2 ทางเข้า"
               * แต่ม็อกอัพวางไว้ทั้งสองที่ตั้งแต่แรก และเจ้าของงานตัดสินแล้ว
               *
               * ความเสี่ยงที่เหลือถูกกันด้วย dialog ยืนยัน (มีมาตลอด) — กดพลาดยังถอยได้
               * มือถือเหลือเฉพาะไอคอน (v5 `.cancel{width:46px;font-size:0}`) เพราะต้อง
               * ยกที่ทั้งหมดให้ปุ่มยืนยันซึ่งเป็นงานหลักของหน้า
               */}
              {showCancel && (
                <Tooltip title='ยกเลิกคำสั่งซื้อ' enterTouchDelay={0}>
                  <Button
                    variant='outlined'
                    color='secondary'
                    onClick={() => setCancelDialogOpen(true)}
                    aria-label='ยกเลิกคำสั่งซื้อ'
                    sx={{
                      minHeight: 44,
                      minWidth: 46,
                      px: 0,
                      flexShrink: 0,
                      /* ข้อความโผล่เฉพาะจอที่มีที่ให้ — ไอคอนถังขยะสื่อ "ยกเลิก" ได้เองอยู่แล้ว
                         และ `aria-label` + tooltip พูดคำเต็มให้ทุกจอ */
                      '& .cancel-label': { display: 'none' },
                      [ORDER_TWO_COL_MQ]: {
                        px: 4,
                        '& .cancel-label': { display: 'inline' },
                      },
                      '&:hover': { color: 'error.main', borderColor: 'error.main' },
                    }}
                  >
                    <Icon icon='tabler-trash' fontSize={18} />
                    <Box component='span' className='cancel-label' sx={{ ml: 1 }}>
                      ยกเลิกคำสั่งซื้อ
                    </Box>
                  </Button>
                </Tooltip>
              )}
            </Box>


            {/* คำอธิบายใต้ปุ่มถูกถอดออก: ของเดิมเขียนว่า "แตะเพื่อยืนยันว่าได้รับสินค้า/บริการแล้ว"
                ซึ่งบรรยาย *ท่าทางที่ใช้กด* แทนผลลัพธ์ และพูดสิ่งเดียวกับป้ายปุ่มที่อยู่เหนือมัน 4px
                ส่วนผลที่ตามมา (แจ้งปัญหาไม่ได้อีก) ตอนนี้อยู่ใน dialog ซึ่งเป็นจุดที่ผู้ใช้
                กำลังตัดสินใจจริง — พูดครั้งเดียวตรงที่มันมีผล */}
          </Box>
        </Box>
      )}

      {/* ── แจ้งปัญหา (feature 00041) ──
          🛑 ไอคอนเทาและปุ่มยืนยันเป็น warning **ไม่ใช่ error** โดยตั้งใจ — น้ำหนักต้องตรงกับ
          สิ่งที่มันทำจริง: dispute คือ "ติดธงเตือนว่าคำสั่งซื้อนี้มีปัญหา" ซึ่งไม่ได้ยกเลิก
          ไม่ได้คืนเงิน ไม่ได้ลบอะไรเลย (Order.status ไม่เปลี่ยนด้วยซ้ำ — BR-BOE-15)
          ถ้าใช้แดงเท่ากับปุ่มยกเลิก ผู้ใช้จะลังเลที่จะกดสิ่งที่ควรกดได้อย่างสบายใจ ── */}
      {/* ── ยืนยันรับของ ── ไม่ใช่ error tone: การยืนยันคือเรื่องดี ไม่ใช่การทำลาย
          แต่ต้องบอกให้ครบว่ามันย้อนไม่ได้และแลกอะไรไป (ผู้ใช้กลุ่มนี้กลัวโดนโกงอยู่แล้ว
          การไม่บอกไม่ได้ทำให้เขาสบายใจขึ้น มันแค่ทำให้เขารู้ตอนที่สายไปแล้ว) ── */}
      <Dialog
        fullWidth
        maxWidth='xs'
        open={confirmDialogOpen}
        onClose={() => !submitting && setConfirmDialogOpen(false)}
        closeAfterTransition={false}
        aria-labelledby='confirm-dialog-title'
      >
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', pt: 5, pb: 2, px: 4 }}>
          <Icon icon='tabler-circle-check' style={{ fontSize: '3.5rem', marginBottom: '1rem', color: 'var(--mui-palette-success-main)' }} />
          {/* 🛑 ต้องผันคำเหมือน `ctaLabel` ของปุ่มที่เพิ่งกด — เดิมปุ่มเขียน "ยืนยันว่ารับบริการแล้ว"
              แต่ไดอะล็อกที่เด้งตามมาเขียน "ได้รับสินค้า" = คนละคำในการกดครั้งเดียว */}
          <Typography id='confirm-dialog-title' variant='h5' sx={{ mb: 1 }}>
            {order.isServiceShop ? 'ยืนยันว่ารับบริการแล้ว?' : 'ยืนยันว่าได้รับสินค้าแล้ว?'}
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            ยืนยันแล้วจะแจ้งปัญหากับคำสั่งซื้อนี้ไม่ได้อีก — ถ้ายังไม่ได้รับของ อย่าเพิ่งกดยืนยัน
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 5, px: 4, gap: 1.5 }}>
          <Button variant='tonal' color='secondary' onClick={() => setConfirmDialogOpen(false)} disabled={submitting}>
            ยังไม่ยืนยัน
          </Button>
          <Button
            variant='contained'
            color='success'
            disabled={submitting}
            onClick={() => {
              setConfirmDialogOpen(false)
              void handleConfirm()
            }}
          >
            {submitting ? 'กำลังยืนยัน...' : 'ได้รับแล้ว'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        fullWidth
        maxWidth='xs'
        open={disputeDialogOpen}
        onClose={() => !disputing && setDisputeDialogOpen(false)}
        closeAfterTransition={false}
        aria-labelledby='dispute-dialog-title'
      >
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', pt: 5, pb: 2, px: 4 }}>
          <Icon icon='tabler-flag-3' style={{ fontSize: '3.5rem', marginBottom: '1rem', color: 'var(--mui-palette-text-disabled)' }} />
          <Typography id='dispute-dialog-title' variant='h5' sx={{ mb: 1 }}>
            แจ้งปัญหาคำสั่งซื้อนี้
          </Typography>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
            บอกร้านค้าว่าเกิดอะไรขึ้น (ไม่บังคับ)
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={3}
            value={disputeNote}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisputeNote(e.target.value.slice(0, 500))}
            placeholder='เช่น ยังไม่ได้รับของ / ของไม่ตรงกับที่สั่ง'
            disabled={disputing}
          />
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 5, px: 4, gap: 1.5 }}>
          <Button variant='tonal' color='secondary' onClick={() => setDisputeDialogOpen(false)} disabled={disputing}>
            ยกเลิก
          </Button>
          <Button variant='contained' color='warning' onClick={handleDispute} disabled={disputing}>
            {disputing ? 'กำลังแจ้ง...' : 'แจ้งปัญหา'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── ยืนยันลบรีวิว (BR-BOE-18) ──
          🛑 ต้องบอกให้ชัดว่า "ลบแล้วเขียนใหม่ไม่ได้" — soft delete ฝั่งหลังบ้านกันไม่ให้ผู้ใช้
          ลบเพื่อรีเซ็ตหน้าต่าง 24 ชม.แล้วเขียนใหม่วนไปเรื่อย ๆ ถ้าไม่เขียนไว้ตรงนี้ ผู้ใช้จะกดลบ
          ด้วยความเข้าใจว่าเขียนใหม่ได้ แล้วเจอทางตันหลังกด ซึ่งย้อนกลับไม่ได้แล้ว */}
      <Dialog
        fullWidth
        maxWidth='xs'
        open={deleteReviewDialogOpen}
        onClose={() => !deletingReview && setDeleteReviewDialogOpen(false)}
        closeAfterTransition={false}
        aria-labelledby='delete-review-dialog-title'
      >
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', pt: 5, pb: 2, px: 4 }}>
          <Icon icon='tabler-trash' style={{ fontSize: '3.5rem', marginBottom: '1rem', color: 'var(--mui-palette-text-disabled)' }} />
          <Typography id='delete-review-dialog-title' variant='h5' sx={{ mb: 1 }}>
            ลบรีวิวนี้?
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            ลบแล้วจะเขียนรีวิวใหม่สำหรับคำสั่งซื้อนี้อีกไม่ได้
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 5, px: 4, gap: 1.5 }}>
          <Button variant='tonal' color='secondary' onClick={() => setDeleteReviewDialogOpen(false)} disabled={deletingReview}>
            ไม่ลบ
          </Button>
          <Button variant='contained' color='error' onClick={handleDeleteReview} disabled={deletingReview}>
            {deletingReview ? 'กำลังลบ...' : 'ลบรีวิว'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Cancel confirm dialog (FR-UX-5) — token-correct อยู่แล้ว คงไว้ ── */}
      {showCancel && (
        <Dialog
          fullWidth
          maxWidth='xs'
          open={cancelDialogOpen}
          onClose={() => setCancelDialogOpen(false)}
          closeAfterTransition={false}
          aria-labelledby='cancel-dialog-title'
        >
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', pt: 5, pb: 3, px: 4 }}>
            <Icon icon='tabler-alert-circle' style={{ fontSize: '4.5rem', marginBottom: '1rem', color: 'var(--mui-palette-error-main)' }} />
            <Typography id='cancel-dialog-title' variant='h5' sx={{ mb: 1 }}>
              ยืนยันการยกเลิก?
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              การยกเลิกจะไม่สามารถเลิกทำได้
            </Typography>
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'center', pb: 5, px: 4, gap: 1.5 }}>
            <Button variant='tonal' color='secondary' onClick={() => setCancelDialogOpen(false)} disabled={cancelling}>
              ไม่ยกเลิก
            </Button>
            <Button variant='contained' color='error' onClick={handleCancelConfirm} disabled={cancelling}>
              {cancelling ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  )
}
