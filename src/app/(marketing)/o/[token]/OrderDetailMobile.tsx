'use client'

/**
 * Order detail — V1 "Profile-consistent" mobile layout (2026-05-23)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx
 *   - Banner (tier cover image + frosted back button) → copied from ProfileBanner pattern
 *     in src/views/pages/user-profile/UserProfileHeader.tsx
 *   - Avatar overlap (mt: -40px, border 4px white, verify badge) → copied from ProfileLeftPanel pattern
 *   - Centered identity (shop name link, @handle, chip row) → copied from ProfileLeftPanel pattern
 *
 * S-8/S-9 slip upload zone (2026-05-23):
 * Base: docs/mockups/order-detail-scenarios.html .slip-empty (scenario 1) + .slip-done (scenario 2)
 *   - .slip-empty → Card with icon + "อัปโหลดสลิปการโอนเงิน" + dashed button "เลือกรูปสลิป"
 *   - .slip-done  → Card with thumb preview + "แนบสลิปแล้ว ✓" + filename + "เปลี่ยน" button
 *
 * S-10 digital access-link card (2026-05-23):
 * Base: docs/mockups/order-detail-scenarios.html .track block (scenario 8 "การเข้าถึง")
 *   - .track .pic (tabler-link icon) + .track .l "ลิงก์เข้าถึง" + .track .v (URL truncated)
 *   - .copy → MUI Button component="a" "เปิด" (opens accessUrl in new tab, noopener noreferrer)
 *
 * Widgets adapted (from theme pattern):
 *   - Banner height reduced 130px (vs 160 on profile — order detail shorter)
 *   - Avatar size 78px (vs 128 on profile — secondary focus)
 *   - Chips: ยืนยันแล้ว / tier / Trust score (same pattern, order-specific label)
 *   - Actions row removed (no Follow/Chat on order detail)
 *
 * Widgets composed from MUI primitives (no theme equivalent):
 *   - Status pill + meta line (order-specific)
 *   - Horizontal timeline 3-step (order-specific)
 *   - Items card, payment card, tracking card (order-specific)
 *   - Review zone (order-specific, uses ReviewForm child)
 *   - Cancel box (order-specific)
 *   - Fixed bottom CTA bar (order-specific)
 *   - Cancel confirm dialog (order-specific)
 *
 * คงฟังก์ชัน/flow/props เดิมทุกอย่าง — เปลี่ยนเฉพาะ layout/visual
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
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'

import { getOrderTimeline, getStatusPill, isCODPayment, isHttpUrl, showSlipZone } from '@/lib/order-display'
import { formatDateTimeTH } from '@/lib/format-date'
import type { TimelineState, TimelineStep } from '@/lib/order-display'
import { getTierColor, getTierCover, getTierLabel } from '@/lib/trust-tier'

import ReviewForm from './ReviewForm'
import MobileFrame from './MobileFrame'

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
}

type Props = {
  order: PublicOrderData
  unlockedPhone: string
  /** Action: buyer กด "ยืนยันคำสั่งซื้อ" — transitions PENDING|SHIPPED → CONFIRMED (terminal) */
  onConfirmAction: () => Promise<void>
  /**
   * Action: buyer กด "ยืนยันยกเลิก" — เรียก cancel API
   * render cancel button + dialog เฉพาะเมื่อ status==='PENDING' && onCancel มีค่า
   * parent ตัดสิน canCancel (เช่น เช็ค role / window ยกเลิก)
   */
  onCancel?: () => void | Promise<void>
}

// ── Design token สำหรับ timeline dot styles (ตาม mockup CSS variables) ──
const TL_CUR = '#2563EB'
const TL_DONE = '#0E9F6E'
const TL_UP = '#D5DCE6'

const baht = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 0,
})

// ── TimelineDot — render single dot ตาม state mockup spec ──
// ทำไม: แยก sub-component เพื่อ logic dot ไม่รกใน render หลัก
function TimelineDot({ state }: { state: TimelineState }) {
  // done: filled green + white check
  if (state === 'done') {
    return (
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: 17,
          height: 17,
          borderRadius: '50%',
          bgcolor: TL_DONE,
          border: `2.5px solid ${TL_DONE}`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon icon='tabler-check' style={{ fontSize: 9, color: '#fff', strokeWidth: 4 }} />
      </Box>
    )
  }
  // cur: blue ring, white center + blue inner dot, larger (27px)
  if (state === 'cur') {
    return (
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: 27,
          height: 27,
          borderRadius: '50%',
          bgcolor: '#fff',
          border: `3px solid ${TL_CUR}`,
          boxShadow: `0 0 0 5px #EFF4FF`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Box
          sx={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            bgcolor: TL_CUR,
          }}
        />
      </Box>
    )
  }
  // fin: large green + check, success glow
  if (state === 'fin') {
    return (
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: 27,
          height: 27,
          borderRadius: '50%',
          bgcolor: TL_DONE,
          border: `3px solid ${TL_DONE}`,
          boxShadow: '0 0 0 5px #E7F6F0',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon icon='tabler-check' style={{ fontSize: 11, color: '#fff', strokeWidth: 3.5 }} />
      </Box>
    )
  }
  // cx: red bg + red X
  if (state === 'cx') {
    return (
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: 25,
          height: 25,
          borderRadius: '50%',
          bgcolor: '#FEE2E2',
          border: '2.5px solid #EF4444',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Typography sx={{ color: '#EF4444', fontSize: 13, fontWeight: 800, lineHeight: 1 }}>
          ✕
        </Typography>
      </Box>
    )
  }
  // mute: gray faded hollow
  if (state === 'mute') {
    return (
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: 17,
          height: 17,
          borderRadius: '50%',
          bgcolor: '#fff',
          border: '2.5px solid #E5EAF1',
        }}
      />
    )
  }
  // up: gray hollow (default)
  return (
    <Box
      sx={{
        position: 'relative',
        zIndex: 1,
        width: 17,
        height: 17,
        borderRadius: '50%',
        bgcolor: '#fff',
        border: `2.5px solid ${TL_UP}`,
      }}
    />
  )
}

// ── connector line color ตาม state ──
function connectorColor(state: TimelineState): string {
  if (state === 'done' || state === 'fin' || state === 'cur') return TL_DONE
  if (state === 'cx') return '#FCA5A5'
  if (state === 'mute') return '#E5EAF1'
  return TL_UP
}

// ── label color ตาม state ──
function labelColor(state: TimelineState): string {
  if (state === 'cur') return TL_CUR
  if (state === 'fin') return '#059669'
  if (state === 'cx') return '#DC2626'
  if (state === 'done') return '#334155'
  if (state === 'mute') return '#CBD5E1'
  return TL_UP
}

// ── HorizontalTimeline — 3-step flat timeline ──
function HorizontalTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <Box sx={{ display: 'flex', padding: '4px 0 2px', mx: '-2px' }}>
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
          {/* dotbox — หน้าต่าง 30px ความสูง, connector line ทำผ่าน ::before */}
          <Box
            sx={{
              height: 30,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              // connector line สีตาม state ของ step นี้ (ลากจากซ้ายมาหา dot)
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
                      background: connectorColor(step.state),
                      transform: 'translateY(-50%)',
                      zIndex: 0,
                      borderRadius: 2,
                    },
            }}
          >
            <TimelineDot state={step.state} />
          </Box>
          {/* label */}
          <Typography
            sx={{
              fontSize: step.state === 'cur' || step.state === 'fin' ? 11.5 : 10.5,
              fontWeight:
                step.state === 'cur' || step.state === 'fin' || step.state === 'cx' ? 800 : 600,
              color: labelColor(step.state),
              mt: '7px',
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

// ── ItemThumbnail — รูปสินค้า + fallback placeholder (ห้าม <img src="">) ──
function ItemThumbnail({
  imageUrl,
  name,
  grayscale,
}: {
  imageUrl: string | null
  name: string
  grayscale: boolean
}) {
  if (!imageUrl) {
    // fallback: neutral box + icon เมื่อ imageUrl null
    return (
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: '9px',
          bgcolor: '#EEF2F7',
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          ...(grayscale ? { filter: 'grayscale(.4)', opacity: 0.75 } : {}),
        }}
        aria-label={name}
      >
        <Icon icon='tabler-package' style={{ fontSize: 20, color: '#94A3B8' }} />
      </Box>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={name}
      width={44}
      height={44}
      style={{
        width: 44,
        height: 44,
        borderRadius: 9,
        objectFit: 'cover',
        flexShrink: 0,
        ...(grayscale ? { filter: 'grayscale(.4)', opacity: 0.75 } : {}),
      }}
    />
  )
}

// ── isCODPayment + showSlipZone imported from @/lib/order-display (dedup) ──
// ทำไม: S-8/S-9 ลบ local fn + import canonical เพื่อหลีกเลี่ยง duplicate logic

export default function OrderDetailMobile({ order, unlockedPhone, onConfirmAction, onCancel }: Props) {
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
      // SMS flow: unlockedPhone==='' → server ใช้ cookie แทน — ไม่ต้องส่ง contact
      if (unlockedPhone) fd.append('contact', unlockedPhone)

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
  const tierCover = getTierCover(trustScore)
  const avatarLetter = order.shop.user.displayName.slice(0, 1)

  // display helpers จาก order-display.ts (T2/T3)
  const statusPill = getStatusPill(order.status, order.fulfillmentMode, order.paymentMethod)
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
    // Profile-consistent flat column ในกรอบ MobileFrame (desktop = phone device, mobile = เต็มจอ)
    <MobileFrame bg='#F3F5F8'>
      {/* ── Scrollable content ── */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* ── 1. Tier Cover Banner — pattern จาก ProfileBanner (UserProfileHeader.tsx) ── */}
        {/* ทำไม: banner + frosted back button = pattern เดียวกับ /u/[username] profile header */}
        <Box
          sx={{
            height: 130,
            position: 'relative',
            overflow: 'hidden',
            backgroundImage: `url(${tierCover})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            bgcolor: '#E2E8F0',
          }}
        >
          {/* frosted circle back button — pattern ตรงจาก ProfileBanner */}
          {/* ทำไม: client component ใช้ Link ได้โดยตรง — ไม่ผิด Hard Rule 2 */}
          <Link href='/' style={{ textDecoration: 'none' }}>
            <IconButton
              aria-label='กลับหน้าหลัก'
              title='กลับหน้าหลัก'
              sx={{
                position: 'absolute',
                top: 13,
                left: 13,
                zIndex: 3,
                width: 34,
                height: 34,
                borderRadius: '50%',
                bgcolor: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.6)',
                boxShadow: '0 2px 6px rgba(0,0,0,.12)',
                color: '#0F172A',
                '&:hover': { bgcolor: 'rgba(255,255,255,1)' },
              }}
            >
              <Icon icon='tabler-arrow-left' fontSize={18} />
            </IconButton>
          </Link>
        </Box>

        {/* ── 2. Hero section: Avatar overlap + Identity ── */}
        {/* ทำไม: overlap avatar + centered identity = pattern เดียวกับ ProfileLeftPanel */}
        <Box
          sx={{
            bgcolor: '#fff',
            // ดึง section ขึ้นให้ avatar ซ้อนทับ banner
            mt: '-40px',
            pt: 0,
            pb: '12px',
            textAlign: 'center',
          }}
        >
          {/* Avatar overlap — centered, -40px ดึงขึ้น banner */}
          {/* ทำไม: mt -40px (เทียบกับ -68px ของ profile) เพราะ avatar 78px เล็กกว่า 128px */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              // ทำ mt -40px ให้ avatar ชนกับ banner ข้างบน
              position: 'relative',
              mt: '-40px',
              mb: '8px',
            }}
          >
            <Box sx={{ position: 'relative', width: 78, height: 78 }}>
              <Avatar
                src={order.shop.user.avatar ?? undefined}
                alt={order.shop.user.displayName}
                sx={{
                  width: 78,
                  height: 78,
                  borderRadius: '50%',
                  border: '4px solid #fff',
                  boxShadow: '0 6px 14px rgba(15,23,42,.16)',
                  fontSize: '1.75rem',
                  fontWeight: 800,
                  bgcolor: '#E2E8F0',
                  color: '#475569',
                }}
              >
                {avatarLetter}
              </Avatar>
              {/* Verify badge มุมขวาล่าง — แสดงเมื่อ maxVerifyLevel >= 1 */}
              {/* ทำไม: pattern ตรงจาก ProfileLeftPanel verify badge */}
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
                    bgcolor: '#1D9BF0',
                    color: 'white',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '11px',
                    fontWeight: 900,
                    border: '3px solid white',
                    boxShadow: '0 1px 4px rgba(29,155,240,.4)',
                  }}
                >
                  ✓
                </Box>
              )}
            </Box>
          </Box>

          {/* Shop name — link → /u/[username] */}
          <Link
            href={`/u/${order.shop.user.username}`}
            style={{ textDecoration: 'none' }}
          >
            <Typography
              component='span'
              sx={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: '#0F172A',
                lineHeight: 1.2,
                display: 'block',
              }}
            >
              {order.shop.shopName}
            </Typography>
          </Link>

          {/* @handle */}
          <Typography
            sx={{ fontSize: 12, color: '#64748B', mt: '2px' }}
          >
            @{order.shop.user.username}
          </Typography>

          {/* Chips: verified / tier / Trust score — pattern จาก mockup .chips */}
          <Box
            sx={{
              display: 'flex',
              gap: '5px',
              justifyContent: 'center',
              mt: '7px',
              flexWrap: 'wrap',
              px: 2,
            }}
          >
            {/* verified chip — แสดงเฉพาะ maxVerifyLevel >= 1 */}
            {order.maxVerifyLevel >= 1 && (
              <Chip
                size='small'
                label='✓ ยืนยันแล้ว'
                sx={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  height: 22,
                  bgcolor: '#E5F4FE',
                  color: '#0C7DC2',
                  borderRadius: 999,
                  '& .MuiChip-label': { px: '9px' },
                }}
              />
            )}
            {/* tier chip — ใช้ getTierLabel SSOT */}
            <Chip
              size='small'
              color={tierColor}
              label={tierLabel}
              sx={{
                fontSize: '10.5px',
                fontWeight: 700,
                height: 22,
                borderRadius: 999,
                '& .MuiChip-label': { px: '9px' },
              }}
            />
            {/* Trust score chip */}
            <Chip
              size='small'
              label={`Trust ${trustScore}`}
              sx={{
                fontSize: '10.5px',
                fontWeight: 700,
                height: 22,
                bgcolor: '#EEF2F7',
                color: '#334155',
                borderRadius: 999,
                '& .MuiChip-label': { px: '9px' },
              }}
            />
          </Box>
        </Box>

        {/* ── 3. Status line — pill + meta ── */}
        <Box
          sx={{
            bgcolor: '#fff',
            px: '18px',
            py: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {/* Status pill ตาม getStatusPill palette */}
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: 13,
              fontWeight: 800,
              px: '13px',
              py: '6px',
              borderRadius: 999,
              bgcolor: statusPill.bg,
              color: statusPill.text,
            }}
          >
            {/* dot */}
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: statusPill.dot,
                flexShrink: 0,
              }}
            />
            {statusPill.label}
          </Box>
          {/* meta: #token + date — muted */}
          <Typography
            sx={{ fontSize: 11, color: '#94A3B8', ml: 'auto' }}
          >
            #{order.publicToken.slice(0, 8)} · {formatDateTimeTH(order.createdAtIso)}
          </Typography>
        </Box>

        {/* ── 4. Horizontal Timeline 3-step — flat (ไม่มี card รอบ) ── */}
        <Box sx={{ bgcolor: '#fff', px: '18px', pt: '8px', pb: '12px' }}>
          <Typography
            sx={{
              fontSize: 10,
              letterSpacing: '0.13em',
              textTransform: 'uppercase',
              color: '#94A3B8',
              mb: '9px',
            }}
          >
            ขั้นตอน
          </Typography>
          <HorizontalTimeline steps={timeline} />
        </Box>

        {/* ── 5. Cancel detail box (เมื่อ isCancelled) — S-13 ── */}
        {isCancelled && (
          <Box
            sx={{
              bgcolor: '#F8FAFC',
              borderRadius: '12px',
              mx: '0',
              px: '14px',
              py: '12px',
              boxShadow: '0 1px 2px rgba(15,23,42,.06)',
            }}
          >
            <Typography sx={{ fontSize: 10.5, color: '#94A3B8', mb: '2px' }}>
              เหตุผล
            </Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
              {cancelCopy}
            </Typography>
          </Box>
        )}

        {/* ── 6. Items card — flat white Card ── */}
        {/* ทำไม: flat card radius 12, shadow ตาม mockup .card token */}
        <Card
          elevation={0}
          sx={{
            borderRadius: '12px',
            boxShadow: '0 1px 2px rgba(15,23,42,.06)',
            overflow: 'hidden',
          }}
        >
          {/* section header */}
          <Box sx={{ px: '13px', pt: '11px', pb: '6px' }}>
            <Typography
              sx={{
                fontSize: 10,
                letterSpacing: '0.13em',
                textTransform: 'uppercase',
                color: '#94A3B8',
              }}
            >
              รายการสินค้า
            </Typography>
          </Box>

          {/* item rows */}
          {order.items.map((item, idx) => (
            <Box
              key={item.id}
              sx={{
                px: '13px',
                py: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                borderTop: idx === 0 ? 'none' : '1px solid #EEF2F7',
              }}
            >
              {/* thumbnail 44×44 — fallback placeholder เมื่อ null; grayscale เมื่อ CANCELLED */}
              <ItemThumbnail
                imageUrl={item.imageUrl}
                name={item.name}
                grayscale={isCancelled}
              />
              {/* item info */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                  {item.name}
                </Typography>
                <Typography sx={{ fontSize: 11, color: '#64748B', mt: '1px' }}>
                  {item.qty} × {baht.format(item.price)}
                </Typography>
              </Box>
              {/* line price */}
              <Typography sx={{ fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                {baht.format(item.qty * item.price)}
              </Typography>
            </Box>
          ))}

          {/* total row */}
          <Box
            sx={{
              px: '13px',
              py: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px solid #EEF2F7',
              bgcolor: '#FBFCFE',
            }}
          >
            <Typography sx={{ fontSize: 12, color: '#64748B' }}>{totalLabel}</Typography>
            <Typography sx={{ fontSize: 17, fontWeight: 800 }}>
              {baht.format(order.totalAmount)}
            </Typography>
          </Box>
        </Card>

        {/* ── 7. Payment method card (เมื่อ paymentMethod != null) ── */}
        {order.paymentMethod !== null && (
          <Card
            elevation={0}
            sx={{
              borderRadius: '12px',
              boxShadow: '0 1px 2px rgba(15,23,42,.06)',
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                px: '13px',
                py: '11px',
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
              }}
            >
              {/* icon box — green สำหรับ transfer, amber สำหรับ COD */}
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '9px',
                  bgcolor: isCOD ? '#FEF3E2' : '#E7F6F0',
                  display: 'grid',
                  placeItems: 'center',
                  color: isCOD ? '#B45309' : '#059669',
                  flexShrink: 0,
                }}
              >
                <Icon
                  icon={isCOD ? 'tabler-coin' : 'tabler-credit-card'}
                  fontSize={16}
                />
              </Box>
              <Box>
                <Typography sx={{ fontSize: 10.5, color: '#94A3B8' }}>
                  {isCOD ? 'ชำระเมื่อได้รับสินค้า' : 'โอนเข้าบัญชี'}
                </Typography>
                <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>
                  {order.paymentMethod}
                </Typography>
              </Box>
            </Box>
          </Card>
        )}

        {/* ── 8. Shipment tracking card (เมื่อ shipmentTracking != null) ── */}
        {order.shipmentTracking && (
          <Card
            elevation={0}
            sx={{
              borderRadius: '12px',
              boxShadow: '0 1px 2px rgba(15,23,42,.06)',
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                px: '12px',
                py: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {/* icon box */}
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '9px',
                  bgcolor: '#E7F1FE',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#2563EB',
                  flexShrink: 0,
                }}
              >
                <Icon icon='tabler-truck' fontSize={16} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 10.5, color: '#94A3B8' }}>
                  {order.shipmentTracking.provider}
                </Typography>
                {/* trackingNo — monospace ที่อนุญาต (ตาม Hard Rule 5 exception) */}
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                  }}
                >
                  {order.shipmentTracking.trackingNo}
                </Typography>
              </Box>
              {/* copy button — ซ่อนถ้า clipboard API ไม่ available */}
              {typeof navigator !== 'undefined' && navigator?.clipboard && (
                <Button
                  size='small'
                  onClick={() => handleCopyTracking(order.shipmentTracking!.trackingNo)}
                  aria-label='คัดลอกเลข tracking'
                  sx={{
                    flexShrink: 0,
                    ml: 'auto',
                    bgcolor: '#EFF4FF',
                    color: '#2563EB',
                    border: 'none',
                    borderRadius: '8px',
                    px: '11px',
                    py: '6px',
                    fontSize: 11.5,
                    fontWeight: 700,
                    minWidth: 0,
                    '&:hover': { bgcolor: '#DBEAFE' },
                  }}
                >
                  {copied ? (
                    <Icon icon='tabler-check' style={{ color: 'var(--mui-palette-success-main)', fontSize: 16 }} />
                  ) : (
                    'คัดลอก'
                  )}
                </Button>
              )}
            </Box>
          </Card>
        )}

        {/* ── 9. Review zone ── */}
        {/* scenario 6: hasReview + review → แสดง review card */}
        {order.hasReview && order.review && (
          <Card
            elevation={0}
            sx={{
              borderRadius: '12px',
              boxShadow: '0 1px 2px rgba(15,23,42,.06)',
              overflow: 'hidden',
            }}
          >
            <Box sx={{ px: '14px', py: '13px' }}>
              {/* section header */}
              <Typography
                sx={{
                  fontSize: 10,
                  letterSpacing: '0.13em',
                  textTransform: 'uppercase',
                  color: '#94A3B8',
                  mb: '10px',
                }}
              >
                รีวิวของคุณ
              </Typography>
              {/* head: stars + badge */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  mb: '8px',
                }}
              >
                {/* stars 5 ดาว filled ตาม rating */}
                <Box sx={{ display: 'flex', gap: '2px' }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Icon
                      key={i}
                      icon={i < order.review!.rating ? 'tabler-star-filled' : 'tabler-star'}
                      style={{
                        fontSize: 16,
                        color:
                          i < order.review!.rating
                            ? '#F59E0B'
                            : '#E2E8F0',
                        letterSpacing: 2,
                      }}
                    />
                  ))}
                </Box>
                {/* "✓ รีวิวแล้ว" badge */}
                <Typography
                  sx={{
                    ml: 'auto',
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: '#059669',
                    bgcolor: '#E7F6F0',
                    px: '9px',
                    py: '3px',
                    borderRadius: 999,
                  }}
                >
                  ✓ รีวิวแล้ว
                </Typography>
              </Box>
              {/* comment */}
              {order.review.comment && (
                <Typography
                  sx={{
                    fontSize: 13,
                    color: '#334155',
                    lineHeight: 1.5,
                    mb: '8px',
                  }}
                >
                  {order.review.comment}
                </Typography>
              )}
              {/* by-line */}
              <Typography sx={{ fontSize: 10.5, color: '#94A3B8' }}>
                คุณ · {formatDateTimeTH(order.createdAtIso)}
              </Typography>
            </Box>
          </Card>
        )}

        {/* scenario 5: canReview → ReviewForm ใน card */}
        {canReview && (
          <Card
            elevation={0}
            sx={{
              borderRadius: '12px',
              boxShadow: '0 1px 2px rgba(15,23,42,.06)',
              overflow: 'hidden',
            }}
          >
            <Box sx={{ px: '14px', py: '15px' }}>
              {/* section header */}
              <Typography
                sx={{
                  fontSize: 10,
                  letterSpacing: '0.13em',
                  textTransform: 'uppercase',
                  color: '#94A3B8',
                  mb: '10px',
                }}
              >
                รีวิวร้านค้า
              </Typography>
              {/* invite heading — mockup scenario 5: สินค้าถึงมือคุณแล้ว + sub muted */}
              {/* ทำไม: heading + sub ช่วย context ผู้ซื้อก่อนกรอก form — ไม่ใช้ emoji (NFR) */}
              <Typography
                sx={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: '#0F172A',
                  mb: '2px',
                  letterSpacing: '-0.01em',
                }}
              >
                สินค้าถึงมือคุณแล้ว
              </Typography>
              <Typography
                sx={{
                  fontSize: 12,
                  color: '#94A3B8',
                  mb: '14px',
                }}
              >
                ให้คะแนนร้านนี้เพื่อช่วยผู้ซื้อคนอื่น
              </Typography>
              <ReviewForm token={order.publicToken} />
            </Box>
          </Card>
        )}

        {/* ── S-8/S-9: Slip upload zone (OOS-1) ── */}
        {/* แสดงเฉพาะ PENDING + ไม่ใช่ COD (helper showSlipZone จาก order-display.ts) */}
        {/* Base: docs/mockups/order-detail-scenarios.html .slip-empty / .slip-done */}
        {showSlipZone(order.status, order.paymentMethod) && (
          <>
            {/* hidden file input — trigger ผ่าน slipInputRef.current?.click() */}
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
              <Card
                elevation={0}
                sx={{
                  borderRadius: '12px',
                  boxShadow: '0 1px 2px rgba(15,23,42,.06)',
                  overflow: 'hidden',
                  px: '14px',
                  py: '18px',
                  textAlign: 'center',
                }}
              >
                {/* section header */}
                <Typography
                  sx={{
                    fontSize: 10,
                    letterSpacing: '0.13em',
                    textTransform: 'uppercase',
                    color: '#94A3B8',
                    mb: '12px',
                    textAlign: 'left',
                  }}
                >
                  แนบสลิป
                </Typography>

                {/* upload icon box — ตาม mockup .slip-ic (42×42 bg:#EFF4FF color:#2563EB) */}
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: '12px',
                    bgcolor: '#EFF4FF',
                    color: '#2563EB',
                    display: 'grid',
                    placeItems: 'center',
                    mx: 'auto',
                    mb: '9px',
                  }}
                >
                  <Icon icon='tabler-camera' fontSize={20} />
                </Box>

                {/* title + hint — ตาม mockup .slip-t / .slip-h */}
                <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                  อัปโหลดสลิปการโอนเงิน
                </Typography>
                <Typography sx={{ fontSize: 10.5, color: '#94A3B8', mt: '3px' }}>
                  ไฟล์ภาพหรือ PDF ≤ 5MB
                </Typography>

                {/* dashed upload button — ตาม mockup .slip-btn */}
                <Button
                  fullWidth
                  disabled={uploadingSlip}
                  onClick={() => slipInputRef.current?.click()}
                  startIcon={<Icon icon='tabler-plus' fontSize={15} />}
                  sx={{
                    mt: '11px',
                    height: 40,
                    border: '1.5px dashed #C7D2E5',
                    borderRadius: '10px',
                    bgcolor: '#F8FAFE',
                    color: '#2563EB',
                    fontSize: 13,
                    fontWeight: 700,
                    textTransform: 'none',
                    '&:hover': { bgcolor: '#EFF4FF', borderColor: '#2563EB' },
                    '&.Mui-disabled': { bgcolor: '#F8FAFE', opacity: 0.6 },
                  }}
                >
                  {uploadingSlip ? 'กำลังอัปโหลด...' : 'เลือกรูปสลิป'}
                </Button>
              </Card>
            ) : (
              /* ── slip-done: แนบสลิปแล้ว ── */
              <Card
                elevation={0}
                sx={{
                  borderRadius: '12px',
                  boxShadow: '0 1px 2px rgba(15,23,42,.06)',
                  overflow: 'hidden',
                  px: '13px',
                  py: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '11px',
                }}
              >
                {/* thumbnail — preview object URL ถ้ามี, fallback icon */}
                {slipPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slipPreview}
                    alt='ตัวอย่างสลิป'
                    style={{
                      width: 46,
                      height: 62,
                      borderRadius: 7,
                      objectFit: 'cover',
                      flexShrink: 0,
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 1px 2px rgba(0,0,0,.05)',
                    }}
                  />
                ) : (
                  /* ไม่มี preview (slipFileId มาจาก server — buyer refresh) → icon แทน */
                  <Box
                    sx={{
                      width: 46,
                      height: 62,
                      borderRadius: '7px',
                      bgcolor: '#E7F6F0',
                      border: '1px solid #E2E8F0',
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      color: '#059669',
                      boxShadow: '0 1px 2px rgba(0,0,0,.05)',
                    }}
                  >
                    <Icon icon='tabler-file-check' fontSize={22} />
                  </Box>
                )}

                {/* info — filename + ok badge */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {slipName ?? 'สลิปที่แนบ'}
                  </Typography>
                  {/* "แนบสลิปแล้ว ✓" success line — ตาม mockup .slip-ok */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      mt: '2px',
                    }}
                  >
                    <Icon icon='tabler-check' style={{ fontSize: 12, color: '#059669' }} />
                    <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: '#059669' }}>
                      แนบสลิปแล้ว
                    </Typography>
                  </Box>
                </Box>

                {/* "เปลี่ยน" button — ตาม mockup .slip-change */}
                <Button
                  size='small'
                  disabled={uploadingSlip}
                  onClick={() => slipInputRef.current?.click()}
                  sx={{
                    flexShrink: 0,
                    border: '1px solid #D5DCE6',
                    borderRadius: '8px',
                    px: '11px',
                    py: '5px',
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: '#475569',
                    textTransform: 'none',
                    bgcolor: 'transparent',
                    '&:hover': { bgcolor: '#F1F5F9' },
                    '&.Mui-disabled': { opacity: 0.5 },
                  }}
                >
                  {uploadingSlip ? '...' : 'เปลี่ยน'}
                </Button>
              </Card>
            )}
          </>
        )}

        {/* ── S-10: Digital access-link card (OOS-2) ── */}
        {/* แสดงเฉพาะ NO_SHIPPING + accessUrl valid http/https — guard ป้องกัน javascript:/data: XSS */}
        {/* Base: docs/mockups/order-detail-scenarios.html scenario 8 .track block */}
        {order.fulfillmentMode === 'NO_SHIPPING' &&
          order.accessUrl != null &&
          isHttpUrl(order.accessUrl) && (
            <Card
              elevation={0}
              sx={{
                borderRadius: '12px',
                boxShadow: '0 1px 2px rgba(15,23,42,.06)',
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  px: '12px',
                  py: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                {/* icon box — ตาม mockup .track .pic (bg:#E7F1FE color:#2563EB) */}
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '9px',
                    bgcolor: '#E7F1FE',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#2563EB',
                    flexShrink: 0,
                  }}
                >
                  <Icon icon='tabler-link' fontSize={16} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {/* label — ตาม mockup .track .l */}
                  <Typography sx={{ fontSize: 10.5, color: '#94A3B8' }}>
                    ลิงก์เข้าถึง
                  </Typography>
                  {/* URL — truncate ellipsis; monospace ไม่ใช้ (ตาม Hard Rule 5 — URL ไม่ใช่ code block) */}
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {order.accessUrl}
                  </Typography>
                </Box>
                {/* "เปิด" button — MUI Button component="a" ใช้ได้ใน 'use client' component (Hard Rule 2 ไม่ apply) */}
                <Button
                  component='a'
                  href={order.accessUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  size='small'
                  sx={{
                    flexShrink: 0,
                    ml: 'auto',
                    bgcolor: '#EFF4FF',
                    color: '#2563EB',
                    border: 'none',
                    borderRadius: '8px',
                    px: '11px',
                    py: '6px',
                    fontSize: 11.5,
                    fontWeight: 700,
                    minWidth: 0,
                    textTransform: 'none',
                    '&:hover': { bgcolor: '#DBEAFE' },
                  }}
                >
                  เปิด
                </Button>
              </Box>
            </Card>
          )}

        {/* ── Footer — non-canConfirm states ── */}
        {!canConfirm && (
          <Box
            sx={{
              textAlign: 'center',
              py: '16px',
              px: '18px',
            }}
          >
            {/* S-13: CANCELLED → ghost "ติดต่อร้านค้า" button ตาม mockup scenario 7 .btn.ghost */}
            {/* ทำไม: disabled + tooltip "เร็ว ๆ นี้" ตาม pattern Follow/Chat ของ UserProfileHeader */}
            {/* disabled MUI button ต้องมี <span> wrapper ภายใน Tooltip เพื่อให้ pointer-events ทำงาน */}
            {isCancelled && (
              <Tooltip title='เร็ว ๆ นี้' placement='top'>
                <span style={{ display: 'block', marginBottom: '12px' }}>
                  <Button
                    disabled
                    fullWidth
                    sx={{
                      height: 48,
                      bgcolor: '#fff',
                      color: '#334155',
                      border: '1px solid #D5DCE6',
                      borderRadius: '13px',
                      fontSize: 14.5,
                      fontWeight: 700,
                      textTransform: 'none',
                      '&.Mui-disabled': {
                        bgcolor: '#fff',
                        color: '#334155',
                        border: '1px solid #D5DCE6',
                        opacity: 0.7,
                      },
                    }}
                  >
                    ติดต่อร้านค้า
                  </Button>
                </span>
              </Tooltip>
            )}
            {order.status === 'CONFIRMED' && (
              <Typography
                sx={{
                  fontSize: 10.5,
                  color: '#94A3B8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  mb: '4px',
                }}
              >
                <Icon icon='tabler-shield-check' style={{ color: '#818CF8', fontSize: 12 }} />
                ธุรกรรมนี้สำเร็จและบันทึกแล้ว
              </Typography>
            )}
            {/* info text ปัจจุบัน — คงไว้ทุก state */}
            <Typography sx={{ fontSize: 10.5, color: '#94A3B8' }}>
              {isCancelled
                ? 'คำสั่งซื้อนี้ถูกยกเลิกแล้ว ไม่สามารถดำเนินการต่อได้'
                : 'ปกป้องการซื้อขายโดย Deep'}
            </Typography>
          </Box>
        )}

      </Box>

      {/* ── Bottom CTA bar fixed — เฉพาะ canConfirm (PENDING/SHIPPED) ── */}
      {canConfirm && (
        <Box
          sx={{
            // sticky (ไม่ใช่ fixed) เพื่อให้เกาะก้น "กรอบ phone" บน desktop ไม่ใช่ก้น viewport
            position: 'sticky',
            bottom: 0,
            mt: 'auto',
            zIndex: 30,
            borderTop: '1px solid #E8EDF3',
            bgcolor: 'rgba(243,245,248,0.94)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            pb: 'max(0px, env(safe-area-inset-bottom))',
          }}
        >
          <Box
            sx={{
              maxWidth: 420,
              mx: 'auto',
              px: '16px',
              pt: '12px',
              pb: '15px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {/* Primary CTA — ink button ตาม mockup .btn (#0F172A) */}
            <Button
              fullWidth
              disabled={submitting}
              onClick={handleConfirm}
              sx={{
                height: 48,
                bgcolor: '#0F172A',
                color: '#fff',
                borderRadius: '13px',
                fontSize: 14.5,
                fontWeight: 800,
                textTransform: 'none',
                '&:hover': { bgcolor: '#1E293B' },
                '&.Mui-disabled': { bgcolor: 'rgba(15,23,42,0.4)', color: '#fff' },
              }}
            >
              {ctaLabel}
            </Button>

            {/* Cancel button — เฉพาะ PENDING + onCancel (mockup .cx) */}
            {showCancel && (
              <Button
                fullWidth
                onClick={() => setCancelDialogOpen(true)}
                sx={{
                  background: 'none',
                  border: 'none',
                  color: '#DC2626',
                  fontSize: 12,
                  fontWeight: 500,
                  textTransform: 'none',
                  py: '4px',
                  '&:hover': { bgcolor: 'rgba(220,38,38,0.04)' },
                }}
              >
                ยกเลิกคำสั่งซื้อ
              </Button>
            )}

            {/* Decorative CTAs (mockup เท่านั้น — ไม่มี handler ยัง) */}
            {/* ทำไม: disabled + tooltip "เร็ว ๆ นี้" ตาม pattern Follow/Chat ของ UserProfileHeader */}
            {order.status === 'SHIPPED' && (
              <Tooltip title='เร็ว ๆ นี้' placement='top'>
                <span>
                  <Button
                    disabled
                    fullWidth
                    sx={{
                      background: 'none',
                      border: 'none',
                      color: '#64748B',
                      fontSize: 11.5,
                      textTransform: 'none',
                      '&.Mui-disabled': { opacity: 1, color: '#94A3B8' },
                    }}
                  >
                    ยังไม่ได้รับสินค้า?
                  </Button>
                </span>
              </Tooltip>
            )}

            {/* sub-text: SMS flow — unlockedPhone==='' → suppress เบอร์ */}
            <Typography
              sx={{
                fontSize: '0.6875rem',
                textAlign: 'center',
                color: 'text.disabled',
              }}
            >
              {unlockedPhone
                ? `เบอร์ ${unlockedPhone} · แตะเพื่อยืนยันว่าได้รับสินค้า/บริการแล้ว`
                : 'แตะเพื่อยืนยันว่าได้รับสินค้า/บริการแล้ว'}
            </Typography>
          </Box>
        </Box>
      )}

      {/* ── Cancel confirm dialog (FR-UX-5) ── */}
      {/* base pattern: Dialog/DialogContent/DialogActions จาก Vuexy confirmation dialog */}
      {showCancel && (
        <Dialog
          fullWidth
          maxWidth='xs'
          open={cancelDialogOpen}
          onClose={() => setCancelDialogOpen(false)}
          closeAfterTransition={false}
          aria-labelledby='cancel-dialog-title'
        >
          <DialogContent
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              pt: 5,
              pb: 3,
              px: 4,
            }}
          >
            {/* icon เตือน */}
            <Icon
              icon='tabler-alert-circle'
              style={{
                fontSize: '4.5rem',
                marginBottom: '1rem',
                color: 'var(--mui-palette-error-main)',
              }}
            />
            <Typography id='cancel-dialog-title' variant='h5' sx={{ mb: 1 }}>
              ยืนยันการยกเลิก?
            </Typography>
            <Typography color='text.secondary' sx={{ fontSize: '0.875rem' }}>
              การยกเลิกจะไม่สามารถเลิกทำได้
            </Typography>
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'center', pb: 5, px: 4, gap: 1.5 }}>
            {/* "ไม่ยกเลิก" tonal secondary */}
            <Button
              variant='tonal'
              color='secondary'
              onClick={() => setCancelDialogOpen(false)}
              disabled={cancelling}
            >
              ไม่ยกเลิก
            </Button>
            {/* "ยืนยันยกเลิก" contained error */}
            <Button
              variant='contained'
              color='error'
              onClick={handleCancelConfirm}
              disabled={cancelling}
            >
              {cancelling ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </MobileFrame>
  )
}
