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

import { useRef, useState } from 'react'

import Link from 'next/link'

import { canEditReview, formatEditWindowLeft } from '@/lib/review-window'
import { useRouter } from 'next/navigation'

import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import TextField from '@mui/material/TextField'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'

import CustomAvatar from '@core/components/mui/Avatar'

import { getOrderTimeline, getServiceTimeline, isCODPayment, isHttpUrl, showSlipZone, ORDER_STATUS_TONE_TO_MUI } from '@/lib/order-display'
import { resolveOrderStatusBadge } from '@/lib/order-stage'
import { resolveServiceOrderBadge } from '@/lib/order-display'
import { formatDateTimeTH } from '@/lib/format-date'
import { formatOrderNo } from '@/lib/order-no'
import type { TimelineState, TimelineStep } from '@/lib/order-display'
import { getTierColor, getTierLabel } from '@/lib/trust-tier'
import { resolveVerifyBadge } from '@/lib/verify-badge'
import { uploadFileId } from '@/lib/upload-client'
import { uploadMaxSize } from '@/lib/upload-policy'

import PublicProfileFooter from '@/views/pages/user-profile/v2/PublicProfileFooter'
import { orderContentWidthSx } from './content-width'
import ShopCover from './ShopCover'
import ShopEvidence from './ShopEvidence'
import TrustPill from './TrustPill'
import ReviewForm from './ReviewForm'
import SectionTitle from './SectionTitle'
// feature 00024 — การ์ดนัดหมาย (render เฉพาะออเดอร์ที่มีนัด)
import AppointmentCard, { type PublicAppointment } from './AppointmentCard'
import PaymentSummaryCard from './PaymentSummaryCard'
import { getChannelLabel } from '@/lib/chat-channel'

export type PublicOrderData = {
  publicToken: string
  status: 'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED'
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

const baht = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 0,
})

// ── TimelineDot — render single dot ตาม state, สีผ่าน theme.palette.* เท่านั้น (ไม่มี hex) ──
/**
 * จุดบนราง — `stepNo` ใส่เลขขั้นให้จุดที่ยังไม่ถึง/กำลังทำ (ราง 4 ขั้นของร้านบริการ)
 * ไม่ส่ง = พฤติกรรมเดิมทุกประการ (ราง 3 ขั้นของร้านขายของ ไม่มีเลข)
 */
function TimelineDot({ state, stepNo }: { state: TimelineState; stepNo?: number }) {
  // done: filled success + white check
  if (state === 'done') {
    return (
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: 17,
          height: 17,
          borderRadius: '50%',
          bgcolor: 'success.main',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon icon='tabler-check' style={{ fontSize: 9, color: 'var(--mui-palette-success-contrastText)' }} />
      </Box>
    )
  }
  // cur: info ring, white center + info inner dot (ใหญ่กว่า)
  if (state === 'cur') {
    return (
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: 27,
          height: 27,
          borderRadius: '50%',
          bgcolor: 'background.paper',
          border: '3px solid',
          borderColor: 'info.main',
          boxShadow: '0 0 0 5px var(--mui-palette-info-lightOpacity)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {/* เลขขั้นแทนจุดทึบเมื่อผู้เรียกส่งมา — ราง 4 ขั้นต้องบอกได้ว่า "นี่คือขั้นที่เท่าไร"
            ไม่งั้นขั้นกลางสองขั้นแยกจากกันด้วยข้อความอย่างเดียว (mockup 2026-08-28) */}
        {stepNo != null ? (
          <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: 'info.main', lineHeight: 1 }}>
            {stepNo}
          </Typography>
        ) : (
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: 'info.main' }} />
        )}
      </Box>
    )
  }
  // fin: large success + check, success glow
  if (state === 'fin') {
    return (
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: 27,
          height: 27,
          borderRadius: '50%',
          bgcolor: 'success.main',
          boxShadow: '0 0 0 5px var(--mui-palette-success-lightOpacity)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon icon='tabler-check' style={{ fontSize: 11, color: 'var(--mui-palette-success-contrastText)' }} />
      </Box>
    )
  }
  // cx: error tonal bg + error X
  if (state === 'cx') {
    return (
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: 25,
          height: 25,
          borderRadius: '50%',
          bgcolor: 'error.lightOpacity',
          border: '2.5px solid',
          borderColor: 'error.main',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon icon='tabler-x' style={{ fontSize: 13, color: 'var(--mui-palette-error-main)' }} />
      </Box>
    )
  }
  // mute / up: hollow — mute จางกว่า (ไม่ relevant หลัง cancel)
  return (
    <Box
      sx={{
        position: 'relative',
        zIndex: 1,
        width: stepNo != null ? 23 : 17,
        height: stepNo != null ? 23 : 17,
        borderRadius: '50%',
        bgcolor: 'background.paper',
        border: '2.5px solid',
        borderColor: 'divider',
        opacity: state === 'mute' ? 0.6 : 1,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {stepNo != null && (
        <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: 'text.disabled', lineHeight: 1 }}>
          {stepNo}
        </Typography>
      )}
    </Box>
  )
}

// ── connector line color ตาม state ──
function connectorColor(state: TimelineState): string {
  if (state === 'done' || state === 'fin' || state === 'cur') return 'var(--mui-palette-success-main)'
  if (state === 'cx') return 'var(--mui-palette-error-light)'
  return 'var(--mui-palette-divider)'
}

// ── label color ตาม state ──
function labelColor(state: TimelineState): 'info.main' | 'success.dark' | 'error.main' | 'text.primary' | 'text.disabled' {
  if (state === 'cur') return 'info.main'
  if (state === 'fin') return 'success.dark'
  if (state === 'cx') return 'error.main'
  if (state === 'done') return 'text.primary'
  return 'text.disabled'
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
function HorizontalTimeline({ steps, numbered = false }: { steps: TimelineStep[]; numbered?: boolean }) {
  return (
    <Box sx={{ display: 'flex', pb: 0.25 }}>
      {steps.map((step, i) => (
        <Box
          key={i}
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
                      height: 3,
                      bgcolor: connectorColor(step.state),
                      transform: 'translateY(-50%)',
                      zIndex: 0,
                      borderRadius: 1,
                    },
            }}
          >
            <TimelineDot state={step.state} stepNo={numbered ? i + 1 : undefined} />
          </Box>
          {/* label */}
          <Typography
            variant='caption'
            sx={{
              fontWeight: step.state === 'cur' || step.state === 'fin' || step.state === 'cx' ? 700 : 500,
              color: labelColor(step.state),
              mt: 0.75,
              lineHeight: 1.25,
              /* พื้น 11px — ต่ำกว่านี้อ่านภาษาไทยไม่ออกบนมือถือจริง (ดูหัวฟังก์ชัน) */
              fontSize: { xs: '0.6875rem', sm: '0.75rem' },
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
          <Typography
            variant='caption'
            sx={{
              display: 'block',
              mt: 0.25,
              px: 0.25,
              fontSize: '0.625rem',
              lineHeight: 1.35,
              color: 'text.secondary',
              wordBreak: 'break-word',
              minHeight: '2.7em',
            }}
          >
            {step.note ?? ''}
          </Typography>

          {/* เวลา — เรนเดอร์เฉพาะขั้นที่ **มีเวลาจริง** ห้ามใส่ขีดแทน
              ขั้น "ร้านให้บริการ" ไม่มีคอลัมน์เก็บเวลาในระบบเลย ⇒ ขีดที่ขึ้นทุกใบตลอดไป
              คือสัญญาณว่างเปล่าที่กินที่ ไม่ใช่ข้อมูล (เหตุผลเต็มที่ `TimelineStep.atIso`) */}
          {step.atIso && (
            <Typography
              variant='caption'
              sx={{ display: 'block', mt: 0.25, px: 0.25, fontSize: '0.5625rem', lineHeight: 1.3, color: 'text.disabled' }}
            >
              {formatDateTimeTH(step.atIso)}
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
        borderRadius: 2.25,
        flexShrink: 0,
        bgcolor: 'action.hover',
        color: 'text.disabled',
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
        appointmentStatus: order.appointment?.status ?? null,
        /* 🛑 `hasAppointment` ต้องมาจาก "มีอ็อบเจกต์นัดไหม" ไม่ใช่ "มี startIso ไหม" —
           งาน walk-in ที่ร้านกด "เริ่มงานเลย" ก็ได้เวลาทั้งที่ไม่เคยมีการนัดหมาย
           ถ้าเดาจากเวลา ขั้น "ลูกค้ายืนยันนัด" จะไปค้างรอในใบที่ไม่มีนัดให้ยืนยัน */
        hasAppointment: order.appointment !== null,
        buyerConfirmedAt: order.appointment?.buyerConfirmedAt ?? null,
        createdAtIso: order.createdAtIso,
      })
    : getOrderTimeline(order.status, order.fulfillmentMode, order.paymentMethod)

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

  // ใช้กับแถว "วิธีชำระเงิน" ด้านล่าง — จงใจไม่เกี่ยวกับป้ายปุ่มหลักอีกต่อไป (ดูเหตุผลถัดไป)
  const isCOD = isCODPayment(order.paymentMethod)

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
  const totalLabel = order.status === 'PENDING' ? 'ยอดที่ต้องชำระ' : 'ยอดรวม'

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
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
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
          ...orderContentWidthSx,
          width: '100%',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >

        {/* ── 1. ปกไล่สีตาม tier — ตัวเดียวกับจอ guest (ShopCover) ──
            เดิมเรียก `ProfileBanner` ตรง ๆ ที่ 140px ขณะที่จอ guest ตั้ง 104px และ **ไม่เคย
            ส่ง isNewShop เลย** ⇒ ร้านที่ยังไม่มีออเดอร์จบสักใบได้ปกเทาก่อนล็อกอิน แล้วกลายเป็น
            ปกไล่สีที่หน้าตาเหมือนรางวัลทันทีที่ล็อกอินเสร็จ ทั้งที่เป็นร้านเดียวกันในนาทีเดียวกัน */}
        <ShopCover trustScore={trustScore} isNewShop={order.completedOrders == null} />

        {/* ── 2. Hero section: Avatar overlap + Identity ── */}
        <Box sx={{ bgcolor: 'background.paper', mt: '-42px', pb: 1.5, textAlign: 'center' }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
            <Box sx={{ position: 'relative', width: 84, height: 84 }}>
              <Avatar
                src={order.shop.user.avatar ?? undefined}
                alt={order.shop.user.displayName}
                sx={{
                  width: 84,
                  height: 84,
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
                    bgcolor: 'success.main',
                    color: 'success.contrastText',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '11px',
                    fontWeight: 900,
                    border: '3px solid',
                    borderColor: 'background.paper',
                  }}
                >
                  ✓
                </Box>
              )}
            </Box>
          </Box>

          {/* Shop name — link → /u/[username] */}
          <Typography
            component={Link}
            href={`/u/${order.shop.user.username}`}
            variant='h6'
            sx={{ display: 'block', textDecoration: 'none', color: 'text.primary', fontWeight: 700 }}
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

          {/* ── หลักฐานของร้าน — ตัวเดียวกับจอ guest (ShopEvidence) ──
              🛑 เดิมบล็อกนี้มีเฉพาะจอ guest ⇒ ผู้ซื้อที่เพิ่งล็อกอินเสร็จ *เสีย* หลักฐานที่
              เพิ่งเห็นเมื่อสิบวินาทีก่อนไปทั้งชุด ทั้งที่นี่คือวินาทีที่เขากำลังจะกดปุ่มที่
              ย้อนไม่ได้ (user 2026-08-11 "ต้องเห็นทั้งคู่ครับ")
              ข้อมูลถูกยิงให้ branch นี้แล้วตั้งแต่ 61c208ac — ที่ขาดคือคนเรนเดอร์ */}
          <Box sx={{ px: 2.25 }}>
            <ShopEvidence
              completedOrders={order.completedOrders}
              avgRating={order.avgRating}
              reviewCount={order.reviewCount}
              channels={order.channels}
            />
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
         */}
        {order.originPage && (
          <Box
            sx={{
              bgcolor: 'background.paper',
              px: 2.25,
              pb: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
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

        {/* ── 3. หัวเรื่องของ "ใบนี้" — เลขงาน + ปุ่มคัดลอก ──
            มาจาก mockup ที่หัวหน้าส่ง 2026-08-28 (`hero`) · เดิมเลขออเดอร์เป็นตัวจิ๋วสีจาง
            ชิดขวาแถวเดียวกับป้ายสถานะ ⇒ **เลขที่ลูกค้าต้องอ่านให้ร้านฟังทางโทรศัพท์
            เป็นข้อความที่เล็กที่สุดในหน้า** และคัดลอกไม่ได้เลย */}
        <Box sx={{ bgcolor: 'background.paper', px: 2.25, pt: 1.5, pb: 0.5 }}>
          <Typography variant='caption' sx={{ display: 'block', color: 'text.secondary', fontWeight: 500 }}>
            {order.isServiceShop ? 'รายละเอียดคำสั่งบริการ' : 'รายละเอียดคำสั่งซื้อ'}
          </Typography>
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
        </Box>

        {/* ── 3b. แถวสถานะ + วันที่เปิดบิล ── */}
        <Box sx={{ bgcolor: 'background.paper', px: 2.25, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
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
          <Typography variant='caption' color='text.secondary' sx={{ ml: 'auto' }}>
            {formatDateTimeTH(order.createdAtIso)}
          </Typography>
        </Box>

        {/* ── 4. รางสถานะ — 4 ขั้นสำหรับร้านบริการ / 3 ขั้นสำหรับที่เหลือ ── */}
        <Box sx={{ bgcolor: 'background.paper', px: 2.25, pt: 1, pb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5 }}>
            <SectionTitle>{order.isServiceShop ? 'สถานะงานบริการ' : 'ขั้นตอน'}</SectionTitle>
            <Typography variant='caption' color='text.secondary' sx={{ mb: 2, flexShrink: 0 }}>
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
                bgcolor: 'primary.lightOpacity',
                borderRadius: 2,
                px: 1.5,
                py: 1.25,
              }}
            >
              <Icon
                icon='tabler-info-circle'
                style={{ fontSize: 16, flexShrink: 0, marginTop: 2, color: 'var(--mui-palette-primary-main)' }}
                aria-hidden='true'
              />
              <Typography variant='caption' sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                <Box component='strong' sx={{ fontWeight: 600, color: 'text.primary' }}>
                  ยืนยันนัดหมาย
                </Box>{' '}
                คือยืนยันว่าคุณจะมาตามนัด ส่วน{' '}
                <Box component='strong' sx={{ fontWeight: 600, color: 'text.primary' }}>
                  {ctaLabel}
                </Box>{' '}
                คือปิดงานหลังได้รับบริการจริง และย้อนกลับไม่ได้
              </Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, px: 1.5, pt: 1.5, pb: 2 }}>

          {/* ── 5. Cancel detail box (เมื่อ isCancelled) — S-13 ── */}
          {isCancelled && (
            <Box sx={{ bgcolor: 'action.hover', borderRadius: 3, px: 1.75, py: 1.5 }}>
              <Typography variant='caption' color='text.disabled' sx={{ display: 'block', mb: 0.25 }}>
                เหตุผล
              </Typography>
              <Typography variant='body2' sx={{ fontWeight: 600, color: 'text.secondary' }}>
                {cancelCopy}
              </Typography>
            </Box>
          )}

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
          {order.money && <PaymentSummaryCard money={order.money} />}

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
                  <Box sx={{ px: 1.75, py: 2.25, textAlign: 'center' }}>
                    <SectionTitle>แนบสลิป</SectionTitle>

                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                      <CustomAvatar skin='light' variant='rounded' color='primary' size={42}>
                        <Icon icon='tabler-camera' fontSize={20} />
                      </CustomAvatar>
                    </Box>

                    <Typography variant='body2' sx={{ fontWeight: 700 }}>
                      อัปโหลดสลิปการโอนเงิน
                    </Typography>
                    <Typography variant='caption' color='text.disabled' sx={{ display: 'block', mt: 0.25 }}>
                      ไฟล์ภาพหรือ PDF ≤ {SLIP_MAX_MB}MB
                    </Typography>

                    <Button
                      fullWidth
                      variant='outlined'
                      color='primary'
                      disabled={uploadingSlip}
                      onClick={() => slipInputRef.current?.click()}
                      startIcon={<Icon icon='tabler-plus' fontSize={15} />}
                      sx={{ mt: 1.5, borderStyle: 'dashed' }}
                    >
                      {uploadingSlip ? 'กำลังอัปโหลด...' : 'เลือกรูปสลิป'}
                    </Button>
                  </Box>
                </Card>
              ) : (
                /* ── slip-done: แนบสลิปแล้ว ── */
                <Card>
                  <Box sx={{ px: 1.75, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
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
                      <Typography variant='body2' sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {slipName ?? 'สลิปที่แนบ'}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                        <Icon icon='tabler-check' style={{ fontSize: 12, color: 'var(--mui-palette-success-main)' }} />
                        <Typography variant='caption' sx={{ fontWeight: 700, color: 'success.main' }}>
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


          {/* ── 6. Items card ── */}
          <Card>
            <Box
              sx={{
                px: 1.75,
                pt: 1.5,
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
              <Typography variant='caption' color='text.secondary' sx={{ mb: 2, flexShrink: 0 }}>
                {order.items.length} รายการ
              </Typography>
            </Box>

            {order.items.map((item, idx) => (
              <Box key={item.id}>
                {idx > 0 && <Divider />}
                <Box sx={{ px: 1.75, py: 1.5, display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                  <ItemThumbnail imageUrl={item.imageUrl} name={item.name} grayscale={isCancelled} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant='body2' sx={{ fontWeight: 600 }}>
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
                      {item.qty} × {baht.format(item.price)}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.8125rem', flexShrink: 0 }}>
                    {baht.format(item.qty * item.price)}
                  </Typography>
                </Box>
              </Box>
            ))}

            <Divider />
            {/* total row — pattern จาก OrderDetailsCard.tsx totals-row (label…value, bold final) */}
            <Box sx={{ px: 1.75, py: 1.5, display: 'flex', justifyContent: 'space-between', bgcolor: 'action.hover' }}>
              <Typography variant='body2' color='text.secondary'>{totalLabel}</Typography>
              <Typography sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                {baht.format(order.totalAmount)}
              </Typography>
            </Box>
          </Card>

          {/* ── 7. Payment method card (เมื่อ paymentMethod != null) ── */}
          {/* D4: icon tonal info=โอนเงิน / warning=COD (ไม่ใช่ success — green สงวนไว้กับ verified) */}
          {order.paymentMethod !== null && (
            <Card>
              <Box sx={{ px: 1.75, py: 1.5, display: 'flex', gap: 1.25, alignItems: 'center' }}>
                <CustomAvatar skin='light' variant='rounded' color={isCOD ? 'warning' : 'info'} size={32}>
                  <Icon icon={isCOD ? 'tabler-coin' : 'tabler-credit-card'} fontSize={16} />
                </CustomAvatar>
                <Box>
                  <Typography variant='caption' color='text.disabled' sx={{ display: 'block' }}>
                    {isCOD ? 'ชำระเมื่อได้รับสินค้า' : 'โอนเข้าบัญชี'}
                  </Typography>
                  <Typography variant='body2' sx={{ fontWeight: 700 }}>
                    {order.paymentMethod}
                  </Typography>
                </Box>
              </Box>
            </Card>
          )}

          {/* ── 8. Shipment tracking card (เมื่อ shipmentTracking != null) ── */}
          {order.shipmentTracking && (
            <Card>
              <Box sx={{ px: 1.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <CustomAvatar skin='light' variant='rounded' color='info' size={32}>
                  <Icon icon='tabler-truck' fontSize={16} />
                </CustomAvatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant='caption' color='text.disabled' sx={{ display: 'block' }}>
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

          {/* ── โซนรีวิว (3 สถานะ — ดู SDS TD-002) ── */}
          {order.hasReview && order.review && editingReview && (
            <Card>
              <Box sx={{ px: 1.75, py: 2 }}>
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
              <Box sx={{ px: 1.75, py: 1.75 }}>
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
                  <Chip size='small' variant='tonal' color='success' label='รีวิวแล้ว' sx={{ ml: 'auto' }} />
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

                <Typography variant='caption' color='text.disabled'>
                  คุณ · {formatDateTimeTH(order.review.createdAtIso)}
                </Typography>

                {/* แก้ไข/ลบได้ภายใน 24 ชม. จากเวลาโพสต์ครั้งแรก (BR-BOE-17)
                    หมดเวลาแล้ว → ปุ่มหายไปเฉย ๆ **ไม่ขึ้นข้อความว่า "หมดเวลาแล้ว"** —
                    รีวิวยังแสดงปกติ ไม่มีอะไรผิดพลาดที่ต้องแจ้ง */}
                {canEditReview(new Date(order.review.createdAtIso)) && (
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.5, mb: 1 }}>
                      <Icon icon='tabler-clock' style={{ fontSize: 14, color: 'var(--mui-palette-text-disabled)' }} />
                      <Typography variant='caption' color='text.disabled'>
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
                  <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, px: 1.5, py: 1.25, mt: 1.5 }}>
                    <Typography variant='caption' sx={{ fontWeight: 700, color: 'primary.main', display: 'block', mb: 0.25 }}>
                      ร้านค้าตอบกลับ
                    </Typography>
                    <Typography variant='body2' color='text.secondary' sx={{ lineHeight: 1.6 }}>
                      {order.review.shopReply.comment}
                    </Typography>
                    <Typography variant='caption' color='text.disabled' sx={{ display: 'block', mt: 0.5 }}>
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
            <Box sx={{ bgcolor: 'action.hover', borderRadius: 3, px: 2, py: 3, textAlign: 'center' }}>
              <Icon
                icon='tabler-mood-sad'
                style={{ fontSize: 30, color: 'var(--mui-palette-text-disabled)' }}
              />
              <Typography variant='body2' sx={{ fontWeight: 600, color: 'text.secondary', mt: 1 }}>
                คุณลบรีวิวนี้ไปแล้ว
              </Typography>
              <Typography variant='caption' color='text.disabled' sx={{ display: 'block', mt: 0.5, lineHeight: 1.6 }}>
                รีวิวที่ลบแล้วไม่สามารถเขียนใหม่สำหรับคำสั่งซื้อนี้ได้อีก
              </Typography>
            </Box>
          )}

          {canReview && (
            <Card>
              <Box sx={{ px: 1.75, py: 2 }}>
                <SectionTitle>รีวิวร้านค้า</SectionTitle>
                {/* คำผันตามประเภทร้าน — ร้านบริการไม่มี "สินค้า" ให้ "ถึงมือ"
                    (คลาสเดียวกับหัวข้อ "รายการบริการ" ที่แก้ไปแล้วเหนือขึ้นไป) */}
                <Typography variant='subtitle1' sx={{ fontWeight: 700, mb: 0.25 }}>
                  {order.isServiceShop ? 'รับบริการเรียบร้อยแล้ว' : 'สินค้าถึงมือคุณแล้ว'}
                </Typography>
                <Typography variant='body2' color='text.disabled' sx={{ mb: 1.75 }}>
                  ให้คะแนนร้านนี้เพื่อช่วยผู้ซื้อคนอื่น
                </Typography>
                <ReviewForm token={order.publicToken} />
              </Box>
            </Card>
          )}

          {/* ── S-10: Digital access-link card (OOS-2) ── */}
          {order.fulfillmentMode === 'NO_SHIPPING' &&
            order.accessUrl != null &&
            isHttpUrl(order.accessUrl) && (
              <Card>
                <Box sx={{ px: 1.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  <CustomAvatar skin='light' variant='rounded' color='primary' size={32}>
                    <Icon icon='tabler-link' fontSize={16} />
                  </CustomAvatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant='caption' color='text.disabled' sx={{ display: 'block' }}>
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

          {/* ── ต้องการความช่วยเหลือ? — ตำแหน่งที่ ux ตัดสิน (คำตอบของ SDS TD-001) ──
              🛑 การ์ดนี้ render "นอก" เงื่อนไข canConfirm/isCancelled โดยตั้งใจ
              ของเดิมปุ่ม "ติดต่อร้านค้า" อยู่ใน (!canConfirm && isCancelled) = โผล่เฉพาะออเดอร์
              ที่ยกเลิก และ "ยังไม่ได้รับสินค้า" อยู่ใน (canConfirm && status==='SHIPPED') =
              ไม่เคยโผล่ตอน PENDING เลย — เงื่อนไข render เดิมกลายเป็น business rule โดยไม่ตั้งใจ
              เพราะตอนออกแบบปุ่มยัง disabled ถาวร ตำแหน่งจึงไม่มีนัยอะไร ── */}
          <Card>
            <Box sx={{ px: 1.75, py: 1.75 }}>
              <SectionTitle>ต้องการความช่วยเหลือ?</SectionTitle>

              {/* BR-BOE-16: ไม่มีเงื่อนไขสถานะ — ติดต่อร้านได้เสมอ */}
              <Button
                component={Link}
                href={`/messages/${order.shopId}`}
                fullWidth
                variant='outlined'
                color='secondary'
                startIcon={<Icon icon='tabler-headset' fontSize={18} />}
              >
                ติดต่อร้านค้า
              </Button>

              {/* BR-BOE-13: แจ้งปัญหาได้เมื่อออเดอร์ยังไม่ปิดจบ */}
              {order.status !== 'CONFIRMED' && order.status !== 'CANCELLED' && (
                <Box sx={{ mt: 1.5 }}>
                  {disputeOpened ? (
                    /* มีเรื่องเปิดค้างแล้ว → แทนที่ปุ่มด้วยแถบสถานะที่กดไม่ได้ตั้งแต่โหลดหน้าแรก
                       ไม่ต้องรอให้ผู้ใช้กดแล้วเจอ 409 · โทน warning ไม่ใช่ error เพราะเป็น
                       "รอดำเนินการ" ไม่ใช่ "ผิดพลาด" */
                    <Box
                      sx={{
                        bgcolor: 'warning.lightOpacity',
                        borderRadius: 2,
                        px: 1.5,
                        py: 1.25,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <Icon icon='tabler-flag-3' style={{ fontSize: 17, color: 'var(--mui-palette-warning-main)' }} />
                      <Typography variant='body2' sx={{ fontWeight: 600, color: 'warning.main' }}>
                        แจ้งปัญหาแล้ว
                        {disputeOpenedAt ? ` เมื่อ ${formatDateTimeTH(disputeOpenedAt)}` : ''}
                      </Typography>
                    </Box>
                  ) : (
                    <>
                      {/* น้ำหนักเบากว่า "ติดต่อร้านค้า" โดยตั้งใจ และอยู่ต่ำกว่าเสมอ —
                          ทางแก้ที่เบากว่ามาก่อน ทางที่หนักกว่ามาทีหลัง (ไม่ชวนกดพลาด) */}
                      <Button
                        variant='text'
                        color='secondary'
                        size='small'
                        onClick={() => setDisputeDialogOpen(true)}
                      >
                        {/* เขียนให้ไม่ต้องพึ่งคำนาม แทนการผัน — จอ guest ใช้ประโยคเดียวกันนี้
                            ("ยังไม่ได้รับ" + noun ได้ "ยังไม่ได้รับการเข้ารับบริการ") */}
                        มีปัญหากับรายการนี้?
                      </Button>
                      <Typography variant='caption' color='text.disabled' sx={{ display: 'block' }}>
                        แจ้งร้านค้าว่าคำสั่งซื้อนี้มีปัญหา
                      </Typography>
                    </>
                  )}
                </Box>
              )}
            </Box>
          </Card>

          {/* ── Footer — non-canConfirm states ── */}
          {!canConfirm && (
            <Box sx={{ textAlign: 'center', py: 2, px: 2.25 }}>
              {order.status === 'CONFIRMED' && (
                <Typography
                  variant='caption'
                  color='text.disabled'
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5 }}
                >
                  <Icon icon='tabler-shield-check' style={{ color: 'var(--mui-palette-primary-main)', fontSize: 12 }} />
                  ธุรกรรมนี้สำเร็จและบันทึกแล้ว
                </Typography>
              )}
              <Typography variant='caption' color='text.disabled'>
                {isCancelled
                  ? 'คำสั่งซื้อนี้ถูกยกเลิกแล้ว ไม่สามารถดำเนินการต่อได้'
                  : 'ปกป้องการซื้อขายโดย Deep'}
              </Typography>
            </Box>
          )}

        </Box>

        {/* ท้ายหน้าชุดเดียวกับหน้าโปรไฟล์ร้านสาธารณะ — ดูเหตุผลที่ `PublicProfileFooter` */}
        <PublicProfileFooter />
      </Box>

      {/* ── แถบ CTA ล่างจอ — เฉพาะ canConfirm (PENDING/SHIPPED) ──
          🛑 `fixed` ไม่ใช่ `sticky` + `mt:'auto'` เหมือนเดิม (จอ guest เป็น fixed อยู่แล้ว)
          `sticky bottom:0` ในคอลัมน์ flex แปลว่าแถบเป็น "ท้ายเนื้อหาที่บังเอิญเกาะขอบจอ" —
          มันอยู่ **หลัง** ท้ายหน้าใน flow จึงลอยทับ footer ตอนเลื่อน แล้วหลุดไปอยู่ใต้ footer
          ตอนเลื่อนสุด = ปุ่มหลักของหน้าหายไปตอนที่ผู้ใช้เลื่อนอ่านจนจบพอดี ซึ่งเป็นจังหวะ
          ที่เขาพร้อมจะกดที่สุด · fixed ทำให้แถบเป็น chrome ของจอจริง ๆ อยู่ตลอดเวลา */}
      {canConfirm && (
        <Box
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
          {/* แถบ CTA ล่างจอ — กว้างตามคอนเทนต์ ไม่ใช่ 420 คงที่ (บนแท็บเล็ตปุ่มเคยลอยแคบกลางจอ) */}
          <Box
            sx={{
              ...orderContentWidthSx,
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
            <Button
              fullWidth
              variant='contained'
              color='primary'
              disabled={submitting}
              onClick={() => setConfirmDialogOpen(true)}
            >
              {ctaLabel}
            </Button>

            {showCancel && (
              <Button fullWidth variant='text' color='error' onClick={() => setCancelDialogOpen(true)}>
                ยกเลิกคำสั่งซื้อ
              </Button>
            )}


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
