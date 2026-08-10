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
 *   - Banner: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx
 *     ใช้ `ProfileBanner` โดยตรง (adapted export ที่ src/views/pages/user-profile/UserProfileHeader.tsx)
 *     — getTierGradient() แทน getTierCover() (D3)
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

import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Divider from '@mui/material/Divider'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'

import CustomAvatar from '@core/components/mui/Avatar'

import { getOrderTimeline, isCODPayment, isHttpUrl, showSlipZone, ORDER_STATUS_TONE_TO_MUI } from '@/lib/order-display'
import { resolveOrderStatusBadge } from '@/lib/order-stage'
import { formatDateTimeTH } from '@/lib/format-date'
import { formatOrderNo } from '@/lib/order-no'
import type { TimelineState, TimelineStep } from '@/lib/order-display'
import { getTierColor, getTierLabel } from '@/lib/trust-tier'
import { ProfileBanner } from '@/views/pages/user-profile/UserProfileHeader'

import ReviewForm from './ReviewForm'
// feature 00024 — การ์ดนัดหมาย (render เฉพาะออเดอร์ที่มีนัด)
import AppointmentCard, { type PublicAppointment } from './AppointmentCard'

export type PublicOrderData = {
  publicToken: string
  status: 'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED'
  // เพิ่ม SUBSCRIPTION (FR-UX-7.4 — bug fix: TYPE_LABEL ไม่ครอบคลุม)
  type: 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'SUBSCRIPTION'
  totalAmount: number
  createdAtIso: string
  hasReview: boolean
  review: { rating: number; comment: string | null } | null
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
  accessUrl: string | null
  // feature 00024 — วันเข้าใช้บริการ (FR-RSV-05) null = ออเดอร์นี้ไม่มีนัด → ไม่ render การ์ดเลย
  appointment: import('./AppointmentCard').PublicAppointment | null
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
function TimelineDot({ state }: { state: TimelineState }) {
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
        <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: 'info.main' }} />
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
        width: 17,
        height: 17,
        borderRadius: '50%',
        bgcolor: 'background.paper',
        border: '2.5px solid',
        borderColor: 'divider',
        opacity: state === 'mute' ? 0.6 : 1,
      }}
    />
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

// ── HorizontalTimeline — 3-step flat timeline ──
function HorizontalTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <Box sx={{ display: 'flex', pb: 0.25 }}>
      {steps.map((step, i) => (
        <Box
          key={i}
          sx={{
            flex: 1,
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
            <TimelineDot state={step.state} />
          </Box>
          {/* label */}
          <Typography
            variant='caption'
            sx={{
              fontWeight: step.state === 'cur' || step.state === 'fin' || step.state === 'cx' ? 700 : 500,
              color: labelColor(step.state),
              mt: 0.75,
              lineHeight: 1.2,
            }}
          >
            {step.label}
          </Typography>
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
  // state สำหรับ cancel confirm dialog
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
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
  const isCancelled = order.status === 'CANCELLED'

  // แสดง cancel button เฉพาะ PENDING + onCancel มีค่า (parent ตัดสิน)
  const showCancel = order.status === 'PENDING' && !!onCancel

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await onConfirmAction()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ยืนยันไม่สำเร็จ'
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
      toast.error('คัดลอกไม่สำเร็จ')
    }
  }

  const handleCancelConfirm = async () => {
    if (!onCancel) return
    setCancelling(true)
    try {
      await onCancel()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ยกเลิกไม่สำเร็จ'
      toast.error(message)
    } finally {
      setCancelling(false)
      setCancelDialogOpen(false)
    }
  }

  // ── S-8/S-9: slip upload handler ──
  // feature 00015 TD-004: ไม่ต้องส่ง contact อีกต่อไป — server ยืนยันด้วย session+ownership
  const handleSlipUpload = async (file: File) => {
    // client-side guard — ≤5MB ก่อน upload เพื่อ UX ดี (server ก็ตรวจอีกชั้น)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('ไฟล์ใหญ่เกิน 5MB กรุณาเลือกไฟล์ขนาดเล็กลง')
      return
    }
    setUploadingSlip(true)
    try {
      const fd = new FormData()
      fd.append('file', file)

      const res = await fetch(`/api/orders/${order.publicToken}/slip`, {
        method: 'POST',
        body: fd,
      })

      if (!res.ok) {
        toast.error('แนบสลิปไม่สำเร็จ')
        return
      }

      const data = (await res.json()) as { slipFileId: string }
      setSlipFileId(data.slipFileId)
      // object URL ใช้ใน session นี้เท่านั้น — revoke เมื่อ component unmount ไม่บังคับ (short-lived page)
      setSlipPreview(URL.createObjectURL(file))
      setSlipName(file.name)
      toast.success('แนบสลิปแล้ว')
    } catch {
      // network error / res.json() พัง → ต้องมี feedback (review must-fix)
      toast.error('แนบสลิปไม่สำเร็จ กรุณาลองอีกครั้ง')
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
  const avatarLetter = order.shop.user.displayName.slice(0, 1)

  // timeline จาก order-display.ts (T2/T3) — status pill ใช้ SSOT ด้านบนแทน getStatusPill (freeze ตาม UX spec)
  const timeline = getOrderTimeline(order.status, order.fulfillmentMode, order.paymentMethod)

  // CTA label ตาม status + paymentMethod
  const isCOD = isCODPayment(order.paymentMethod)
  const ctaLabel = submitting
    ? 'กำลังยืนยัน...'
    : order.status === 'SHIPPED'
      ? 'ยืนยันรับสินค้า'
      : order.fulfillmentMode !== 'SHIPPED' // NO_SHIPPING (digital/service/subscription) PENDING — ยืนยันรับของส่งมอบ (scenario 8)
        ? 'ยืนยันว่าได้รับแล้ว'
        : isCOD
          ? 'ยืนยันคำสั่งซื้อ'
          : 'ยืนยันการชำระเงิน'

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
    <Box sx={{ bgcolor: 'background.default', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ width: '100%', maxWidth: 640, mx: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* ── 1. Tier gradient banner — ProfileBanner โดยตรง (D3: gradient แทน cover image) ── */}
        <ProfileBanner data={{ trustScore }} bannerHeight={140} />

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
                  boxShadow: 4,
                  fontSize: '1.75rem',
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
            sx={{ display: 'block', textDecoration: 'none', color: 'text.primary', fontWeight: 800 }}
          >
            {order.shop.shopName}
          </Typography>

          {/* @handle */}
          <Typography variant='body2' color='text.secondary' sx={{ mt: 0.25 }}>
            @{order.shop.user.username}
          </Typography>

          {/* Chips: verified / tier / Trust score */}
          <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', mt: 1, flexWrap: 'wrap', px: 2 }}>
            {order.maxVerifyLevel >= 1 && (
              <Chip
                size='small'
                variant='tonal'
                color='success'
                icon={<Icon icon='tabler-rosette-discount-check-filled' fontSize={14} />}
                label='ยืนยันแล้ว'
              />
            )}
            <Chip size='small' variant='tonal' color={tierColor} label={tierLabel} />
            <Chip size='small' variant='tonal' color='default' label={`Trust ${trustScore}`} />
          </Box>
        </Box>

        {/* ── 3. Status line — pill + meta ── */}
        <Box sx={{ bgcolor: 'background.paper', px: 2.25, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            size='small'
            variant='tonal'
            color={ORDER_STATUS_TONE_TO_MUI[resolveOrderStatusBadge(order.status).tone]}
            label={resolveOrderStatusBadge(order.status).label}
          />
          <Typography variant='caption' color='text.disabled' sx={{ ml: 'auto' }}>
            {formatOrderNo(order.publicToken, order.createdAtIso)} · {formatDateTimeTH(order.createdAtIso)}
          </Typography>
        </Box>

        {/* ── 4. Horizontal Timeline 3-step — flat (ไม่มี card รอบ) ── */}
        <Box sx={{ bgcolor: 'background.paper', px: 2.25, pt: 1, pb: 1.5 }}>
          <Typography variant='overline' color='text.disabled' sx={{ display: 'block', mb: 1, lineHeight: 1 }}>
            ขั้นตอน
          </Typography>
          <HorizontalTimeline steps={timeline} />
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

          {/* ── 6. Items card ── */}
          <Card>
            <Box sx={{ px: 1.75, pt: 1.5, pb: 0.75 }}>
              <Typography variant='overline' color='text.disabled' sx={{ lineHeight: 1 }}>
                รายการสินค้า
              </Typography>
            </Box>

            {order.items.map((item, idx) => (
              <Box key={item.id}>
                {idx > 0 && <Divider />}
                <Box sx={{ px: 1.75, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  <ItemThumbnail imageUrl={item.imageUrl} name={item.name} grayscale={isCancelled} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant='body2' sx={{ fontWeight: 600 }}>
                      {item.name}
                    </Typography>
                    <Typography variant='caption' color='text.secondary'>
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
              <Typography sx={{ fontSize: '1.0625rem', fontWeight: 800 }}>
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
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, fontFamily: 'monospace', wordBreak: 'break-all' }}>
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

          {/* ── 9. Review zone ── */}
          {order.hasReview && order.review && (
            <Card>
              <Box sx={{ px: 1.75, py: 1.75 }}>
                <Typography variant='overline' color='text.disabled' sx={{ display: 'block', mb: 1.25 }}>
                  รีวิวของคุณ
                </Typography>
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
                <Typography variant='caption' color='text.disabled'>
                  คุณ · {formatDateTimeTH(order.createdAtIso)}
                </Typography>
              </Box>
            </Card>
          )}

          {canReview && (
            <Card>
              <Box sx={{ px: 1.75, py: 2 }}>
                <Typography variant='overline' color='text.disabled' sx={{ display: 'block', mb: 1.25 }}>
                  รีวิวร้านค้า
                </Typography>
                <Typography variant='subtitle1' sx={{ fontWeight: 800, mb: 0.25 }}>
                  สินค้าถึงมือคุณแล้ว
                </Typography>
                <Typography variant='body2' color='text.disabled' sx={{ mb: 1.75 }}>
                  ให้คะแนนร้านนี้เพื่อช่วยผู้ซื้อคนอื่น
                </Typography>
                <ReviewForm token={order.publicToken} />
              </Box>
            </Card>
          )}

          {/* ── S-8/S-9: Slip upload zone (OOS-1) ── */}
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
                    <Typography variant='overline' color='text.disabled' sx={{ display: 'block', mb: 1.5, textAlign: 'left' }}>
                      แนบสลิป
                    </Typography>

                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                      <CustomAvatar skin='light' variant='rounded' color='primary' size={42}>
                        <Icon icon='tabler-camera' fontSize={20} />
                      </CustomAvatar>
                    </Box>

                    <Typography variant='body2' sx={{ fontWeight: 700 }}>
                      อัปโหลดสลิปการโอนเงิน
                    </Typography>
                    <Typography variant='caption' color='text.disabled' sx={{ display: 'block', mt: 0.25 }}>
                      ไฟล์ภาพหรือ PDF ≤ 5MB
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

          {/* ── Footer — non-canConfirm states ── */}
          {!canConfirm && (
            <Box sx={{ textAlign: 'center', py: 2, px: 2.25 }}>
              {/* S-13: CANCELLED → ghost "ติดต่อร้านค้า" button (disabled + tooltip "เร็ว ๆ นี้") */}
              {isCancelled && (
                <Tooltip title='เร็ว ๆ นี้' placement='top'>
                  <span style={{ display: 'block', marginBottom: 12 }}>
                    <Button disabled fullWidth variant='outlined' color='secondary'>
                      ติดต่อร้านค้า
                    </Button>
                  </span>
                </Tooltip>
              )}
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
      </Box>

      {/* ── Bottom CTA bar sticky — เฉพาะ canConfirm (PENDING/SHIPPED) ── */}
      {canConfirm && (
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            mt: 'auto',
            zIndex: 30,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            backdropFilter: 'blur(12px)',
            pb: 'max(0px, env(safe-area-inset-bottom))',
          }}
        >
          <Box sx={{ maxWidth: 420, mx: 'auto', px: 2, pt: 1.5, pb: 1.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {/* Primary CTA — D2: contained primary แทน ink #0F172A */}
            <Button fullWidth variant='contained' color='primary' disabled={submitting} onClick={handleConfirm}>
              {ctaLabel}
            </Button>

            {showCancel && (
              <Button fullWidth variant='text' color='error' onClick={() => setCancelDialogOpen(true)}>
                ยกเลิกคำสั่งซื้อ
              </Button>
            )}

            {order.status === 'SHIPPED' && (
              <Tooltip title='เร็ว ๆ นี้' placement='top'>
                <span>
                  <Button disabled fullWidth variant='text' color='secondary' sx={{ fontSize: '0.71875rem' }}>
                    ยังไม่ได้รับสินค้า?
                  </Button>
                </span>
              </Tooltip>
            )}

            {/* Q1: retire unlockedPhone footer branch — sub-text เดียวเสมอ (force-login = ไม่มี guest phone อีกต่อไป) */}
            <Typography variant='caption' sx={{ textAlign: 'center', color: 'text.disabled' }}>
              แตะเพื่อยืนยันว่าได้รับสินค้า/บริการแล้ว
            </Typography>
          </Box>
        </Box>
      )}

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
            <Typography color='text.secondary' sx={{ fontSize: '0.875rem' }}>
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
