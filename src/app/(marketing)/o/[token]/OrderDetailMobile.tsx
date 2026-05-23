'use client'

/**
 * Order detail — Shopee-style mobile layout (redesign 2026-05-23)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/orders/details/OrderDetailsCard.tsx
 *       (item list + totals row pattern)
 *       + theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/orders/details/OrderDetailHeader.tsx
 *       (status chip + date header pattern)
 *       + theme/vuexy/typescript-version/full-version/src/views/apps/invoice/preview/PreviewCard.tsx
 *       (Card+CardContent shell, bg-actionHover inset block)
 *       + compose-primitive: Box/Card/Chip/Button/Avatar/Typography/Divider/IconButton (MUI v9)
 *         Shopee layout ไม่มีใน Vuexy → exception ที่อนุญาต สำหรับ buyer page
 *       + ref: "Shopee Order Details" (user-provided reference)
 *
 * คงฟังก์ชัน/flow/props เดิมทุกอย่าง — เปลี่ยนเฉพาะ layout/visual
 */

import { useState } from 'react'

import Link from 'next/link'

import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'

import { getTierColor, getTierLabel } from '@/lib/trust-tier'

import ReviewForm from './ReviewForm'

export type PublicOrderData = {
  publicToken: string
  status: 'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED'
  // เพิ่ม SUBSCRIPTION (FR-UX-7.4 — bug fix: TYPE_LABEL ไม่ครอบคลุม)
  type: 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'SUBSCRIPTION'
  totalAmount: number
  createdAtIso: string
  hasReview: boolean
  review: { rating: number; comment: string | null } | null
  items: Array<{ id: string; name: string; description: string | null; qty: number; price: number }>
  shop: {
    shopName: string
    user: {
      displayName: string
      username: string
      trustScore: number
    }
  }
  shipmentTracking: { provider: string; trackingNo: string } | null
  // fields ใหม่จาก frozen contract
  paymentMethod: string | null
  // contract field (page.tsx flatten) — ยังไม่ได้ render ใน detail; เก็บไว้ให้ contract ครบ
  fulfillmentMode: string
  maxVerifyLevel: number
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

// TRUST_LEVEL/TRUST_COLOR เดิมลบออกแล้ว — ใช้ getTierLabel/getTierColor จาก @/lib/trust-tier แทน (SSOT)

const STATUS_LABEL: Record<PublicOrderData['status'], string> = {
  PENDING:   'รอดำเนินการ',
  SHIPPED:   'จัดส่งแล้ว',
  CONFIRMED: 'ยืนยันรับแล้ว',
  CANCELLED: 'ยกเลิกแล้ว',
}

// Shopee-style: สี bg ทึบเต็มแถบ (ไม่ใช่ chip สีอ่อน)
const STATUS_BG: Record<PublicOrderData['status'], string> = {
  PENDING:   'var(--mui-palette-warning-main)',
  SHIPPED:   'var(--mui-palette-info-main)',
  CONFIRMED: 'var(--mui-palette-success-main)',
  CANCELLED: 'var(--mui-palette-text-disabled)',
}

// hero copy ต่อ status (FR-UX-7)
const STATUS_HERO_COPY: Record<PublicOrderData['status'], { icon: string; body: string }> = {
  PENDING:   { icon: 'tabler-clock-hour-4',  body: 'รอการยืนยันจากคุณ กดยืนยันหลังได้รับสินค้า/บริการแล้ว' },
  SHIPPED:   { icon: 'tabler-truck',          body: 'สินค้าอยู่ระหว่างจัดส่ง กดยืนยันเมื่อได้รับพัสดุ' },
  CONFIRMED: { icon: 'tabler-circle-check',   body: 'คำสั่งซื้อเสร็จสมบูรณ์ ขอบคุณที่ใช้ Deep' },
  CANCELLED: { icon: 'tabler-circle-x',       body: 'คำสั่งซื้อนี้ถูกยกเลิก' },
}

const TYPE_LABEL: Record<PublicOrderData['type'], string> = {
  PHYSICAL:     'สินค้า',
  DIGITAL:      'สินค้าดิจิทัล',
  SERVICE:      'บริการ',
  SUBSCRIPTION: 'สมาชิกรายคาบ',
}

const baht = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 0,
})

const dateFmt = new Intl.DateTimeFormat('th-TH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

export default function OrderDetailMobile({ order, unlockedPhone, onConfirmAction, onCancel }: Props) {
  const [submitting, setSubmitting] = useState(false)
  // state สำหรับ tracking copy icon (เปลี่ยน icon → tabler-check 2 วิ)
  const [copied, setCopied] = useState(false)
  // state สำหรับ cancel confirm dialog
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

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

  const trustScore = order.shop.user.trustScore
  // ใช้ SSOT helper จาก @/lib/trust-tier (ลบ TRUST_LEVEL/TRUST_COLOR เดิมทิ้ง)
  const tierLabel = getTierLabel(trustScore)
  const tierColor = getTierColor(trustScore)
  const avatarLetter = order.shop.user.displayName.slice(0, 1)

  const heroCopy = STATUS_HERO_COPY[order.status]
  // จำนวน safe-area padding ที่ bottom bar ใช้ (ใช้ซ้ำใน content pb ด้วย)
  // pb ของ body กัน content ถูก fixed bottom bar บัง: canConfirm มี bar (~8rem+safe-area), อื่น ๆ ไม่มี bar (1.5rem พอ)
  const bottomBarHeight = canConfirm ? 'calc(8rem + env(safe-area-inset-bottom, 0px))' : '1.5rem'

  return (
    // พื้นหลังเทาอ่อน — Shopee-style flat section layout
    <Box
      sx={{ minHeight: '100dvh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}
    >
      {/* ── 1. Header bar (sticky, ขาว) ── */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1.5,
        }}
      >
        {/* ปุ่ม back — ไฟล์นี้ client component ใช้ Link ตรงได้ (RSC rule ไม่ apply) */}
        <Link href='/' aria-label='กลับหน้าหลัก'>
          <IconButton size='small' sx={{ mr: 0.5 }}>
            <Icon icon='tabler-arrow-left' />
          </IconButton>
        </Link>
        <Typography variant='h6' component='h1' sx={{ fontWeight: 600, fontSize: '1rem' }}>
          รายละเอียดคำสั่งซื้อ
        </Typography>
      </Box>

      {/* ── Scrollable body ── */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          pb: bottomBarHeight,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,        // gap เล็กระหว่าง section (Shopee ใช้ gap บาง ๆ ไม่ใช่ shadow หนา)
          maxWidth: 480, // mobile-first max width
          mx: 'auto',
          width: '100%',
        }}
      >
        {/* ── 2. Status Banner (เต็มกว้าง สีทึบตาม status) ── */}
        <Box
          sx={{
            bgcolor: STATUS_BG[order.status],
            px: 3,
            py: 2.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
          }}
        >
          {/* icon + label หลัก */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Icon
              icon={heroCopy.icon}
              style={{ fontSize: '2rem', color: '#fff', flexShrink: 0 }}
            />
            <Typography
              variant='h5'
              sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.2, fontSize: '1.25rem' }}
            >
              {STATUS_LABEL[order.status]}
            </Typography>
          </Box>

          {/* sub-copy ตาม status */}
          <Typography sx={{ color: 'rgba(255,255,255,0.88)', fontSize: '0.8125rem' }}>
            {heroCopy.body}
          </Typography>

          {/* เลขที่ + วันที่ + type */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.25 }}>
            <Typography sx={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.75rem' }}>
              #{order.publicToken.slice(0, 8)}
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.75rem' }}>
              {dateFmt.format(new Date(order.createdAtIso))}
            </Typography>
            <Chip
              size='small'
              label={TYPE_LABEL[order.type]}
              sx={{
                bgcolor: 'rgba(255,255,255,0.18)',
                color: '#fff',
                fontSize: '0.6875rem',
                height: 20,
                '& .MuiChip-label': { px: 1 },
              }}
            />
          </Box>
        </Box>

        {/* ── 3. ข้อมูลการจัดส่ง (แสดงเฉพาะเมื่อมี shipmentTracking) ── */}
        {order.shipmentTracking && (
          <Card elevation={0} sx={{ borderRadius: 0 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              {/* หัว section */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Icon
                  icon='tabler-truck-delivery'
                  style={{ fontSize: '1.25rem', color: 'var(--mui-palette-success-main)', flexShrink: 0 }}
                />
                <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>
                  ข้อมูลการจัดส่ง
                </Typography>
              </Box>

              {/* provider */}
              <Typography color='text.secondary' sx={{ fontSize: '0.8125rem', mb: 0.5 }}>
                {order.shipmentTracking.provider}
              </Typography>

              {/* "พัสดุถูกจัดส่งแล้ว" badge */}
              <Typography
                sx={{
                  color: 'success.main',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  mb: 1,
                }}
              >
                พัสดุถูกจัดส่งแล้ว
              </Typography>

              {/* tracking no + ปุ่ม copy */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  bgcolor: 'action.hover',
                  borderRadius: 1.5,
                  px: 1.5,
                  py: 1,
                }}
              >
                <Typography
                  sx={{
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    fontSize: '0.9375rem',
                    flex: 1,
                    wordBreak: 'break-all',
                  }}
                >
                  {order.shipmentTracking.trackingNo}
                </Typography>
                {/* ซ่อนปุ่ม copy ถ้า clipboard API ไม่ available (e.g. non-secure context) */}
                {typeof navigator !== 'undefined' && navigator?.clipboard && (
                  <IconButton
                    size='small'
                    onClick={() => handleCopyTracking(order.shipmentTracking!.trackingNo)}
                    aria-label='คัดลอกเลข tracking'
                    sx={{ flexShrink: 0 }}
                  >
                    <Icon
                      icon={copied ? 'tabler-check' : 'tabler-copy'}
                      style={{
                        color: copied
                          ? 'var(--mui-palette-success-main)'
                          : 'var(--mui-palette-text-secondary)',
                      }}
                    />
                  </IconButton>
                )}
              </Box>
            </CardContent>
          </Card>
        )}

        {/* ── 4. ผู้รับ section (แสดงเมื่อมี buyerContact หรือ buyerName) ── */}
        {/* buyerContact = unlockedPhone; buyerName ไม่มีใน data เราโดยตรง — ใช้ unlockedPhone */}
        {unlockedPhone && (
          <Card elevation={0} sx={{ borderRadius: 0 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <Icon
                  icon='tabler-map-pin'
                  style={{
                    fontSize: '1.25rem',
                    color: 'var(--mui-palette-text-secondary)',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                />
                <Box>
                  <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 0.25 }}>
                    ข้อมูลผู้รับ
                  </Typography>
                  <Typography color='text.secondary' sx={{ fontSize: '0.8125rem' }}>
                    {unlockedPhone}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* ── 5. ร้าน + สินค้า section (Deep trust signal) ── */}
        <Card elevation={0} sx={{ borderRadius: 0 }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            {/* แถวร้าน: Avatar + ชื่อ + tier chip + verified chip + trust score */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                mb: 2,
                opacity: isCancelled ? 0.6 : 1,
              }}
            >
              <Avatar sx={{ width: 44, height: 44, fontSize: '1.125rem', flexShrink: 0 }}>
                {avatarLetter}
              </Avatar>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                {/* shopName link → public profile */}
                <Link
                  href={`/u/${order.shop.user.username}`}
                  style={{
                    fontWeight: 600,
                    fontSize: '0.9375rem',
                    color: 'var(--mui-palette-text-primary)',
                    textDecoration: 'none',
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {order.shop.shopName}
                </Link>

                {/* chips แถวล่าง: verified + tier */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
                  {/* verified chip — แสดงเมื่อ maxVerifyLevel >= 1 */}
                  {order.maxVerifyLevel >= 1 && (
                    <Chip
                      size='small'
                      color='info'
                      icon={<Icon icon='tabler-shield-check' style={{ fontSize: '0.875rem' }} />}
                      label='ยืนยันแล้ว'
                      sx={{ fontSize: '0.6875rem', height: 22 }}
                    />
                  )}
                  {/* tier chip — ใช้ helper SSOT (ห้าม hardcode) */}
                  <Chip
                    size='small'
                    color={tierColor}
                    label={tierLabel}
                    sx={{ fontSize: '0.6875rem', height: 22 }}
                  />
                </Box>
              </Box>

              {/* Trust Score เล็ก ๆ ขวาสุด — anti-scam signal ของ Deep */}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                <Typography color='text.disabled' sx={{ fontSize: '0.6875rem' }}>
                  Trust Score
                </Typography>
                <Typography
                  variant='h6'
                  color={`${tierColor}.main`}
                  sx={{ fontWeight: 700, lineHeight: 1 }}
                >
                  {trustScore}
                </Typography>
              </Box>
            </Box>

            <Divider sx={{ mb: 2 }} />

            {/* รายการสินค้า (pattern จาก OrderDetailsCard item list) */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {order.items.map((item, idx) => (
                <Box key={item.id}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                        {item.name}
                      </Typography>
                      {item.description && (
                        <Typography color='text.secondary' sx={{ fontSize: '0.75rem', mt: 0.25 }}>
                          {item.description}
                        </Typography>
                      )}
                      {/* x qty — Shopee-style */}
                      <Typography color='text.disabled' sx={{ fontSize: '0.75rem', mt: 0.5 }}>
                        x{item.qty}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
                        {baht.format(item.qty * item.price)}
                      </Typography>
                      {item.qty > 1 && (
                        <Typography color='text.disabled' sx={{ fontSize: '0.6875rem' }}>
                          {baht.format(item.price)} / ชิ้น
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  {idx < order.items.length - 1 && <Divider sx={{ mt: 1.5 }} />}
                </Box>
              ))}
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* ยอดรวม — Shopee-style เน้น */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                รวมคำสั่งซื้อ
              </Typography>
              <Typography variant='h6' sx={{ fontWeight: 700, color: 'error.main' }}>
                {baht.format(order.totalAmount)}
              </Typography>
            </Box>
          </CardContent>
        </Card>

        {/* ── 6. วิธีชำระเงิน (เมื่อ paymentMethod != null) ── */}
        {order.paymentMethod !== null && (
          <Card elevation={0} sx={{ borderRadius: 0 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Icon
                  icon='tabler-cash'
                  style={{
                    fontSize: '1.25rem',
                    color: 'var(--mui-palette-text-secondary)',
                    flexShrink: 0,
                  }}
                />
                <Box>
                  <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 0.25 }}>
                    วิธีชำระเงิน
                  </Typography>
                  <Typography color='text.secondary' sx={{ fontSize: '0.8125rem' }}>
                    {order.paymentMethod}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* ── รีวิวที่มีอยู่แล้ว ── */}
        {order.hasReview && order.review && (
          <Card elevation={0} sx={{ borderRadius: 0 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1.5 }}>
                รีวิวของคุณ
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'warning.main', mb: 1 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Icon
                    key={i}
                    icon={i < order.review!.rating ? 'tabler-star-filled' : 'tabler-star'}
                    style={{
                      fontSize: '1.25rem',
                      color:
                        i < order.review!.rating
                          ? 'var(--mui-palette-warning-main)'
                          : 'var(--mui-palette-text-disabled)',
                    }}
                  />
                ))}
              </Box>
              {order.review.comment && (
                <Typography sx={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
                  {order.review.comment}
                </Typography>
              )}
              <Typography color='text.disabled' sx={{ fontSize: '0.75rem', mt: 1 }}>
                ขอบคุณที่แชร์ประสบการณ์ของคุณ
              </Typography>
            </CardContent>
          </Card>
        )}

        {/* ── 8. Review form (CONFIRMED/SHIPPED ยังไม่มีรีวิว) ── */}
        {canReview && (
          <Card elevation={0} sx={{ borderRadius: 0 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <ReviewForm token={order.publicToken} />
            </CardContent>
          </Card>
        )}
      </Box>

      {/* ── 7. Bottom bar fixed — เฉพาะ PENDING/SHIPPED (canConfirm) ── */}
      {canConfirm && (
        <Box
          sx={{
            position: 'fixed',
            insetInline: 0,
            bottom: 0,
            zIndex: 30,
            borderTop: '1px solid',
            borderColor: 'divider',
            // frosted glass effect — Shopee bottom bar style
            bgcolor: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
            pb: 'max(0px, env(safe-area-inset-bottom))',
          }}
        >
          <Box
            sx={{
              maxWidth: 480,
              mx: 'auto',
              px: 2,
              pt: 1.5,
              pb: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {/* แถว 2 ปุ่ม — Shopee bottom bar style */}
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              {/* ปุ่ม "ยกเลิกคำสั่งซื้อ" — เฉพาะ PENDING + onCancel */}
              {showCancel && (
                <Button
                  variant='outlined'
                  color='error'
                  fullWidth
                  onClick={() => setCancelDialogOpen(true)}
                  sx={{ minHeight: 48, fontWeight: 600 }}
                >
                  ยกเลิกคำสั่งซื้อ
                </Button>
              )}

              {/* ปุ่ม primary CTA — สีแบรนด์ Deep (primary ไม่ใช่ tier color) */}
              <Button
                variant='contained'
                color='primary'
                fullWidth
                disabled={submitting}
                onClick={handleConfirm}
                sx={{ minHeight: 48, fontWeight: 600 }}
              >
                {submitting
                  ? 'กำลังยืนยัน...'
                  : order.status === 'SHIPPED'
                    ? 'ยืนยันรับสินค้า'
                    : 'ยืนยันคำสั่งซื้อ'}
              </Button>
            </Box>

            {/* sub-text เล็กใต้ปุ่ม (SMS flow: unlockedPhone='' → ซ่อนเบอร์) */}
            <Typography
              color='text.disabled'
              sx={{ fontSize: '0.6875rem', textAlign: 'center' }}
            >
              {unlockedPhone
                ? `เบอร์ ${unlockedPhone} · แตะเพื่อยืนยันว่าได้รับสินค้า/บริการแล้ว`
                : 'แตะเพื่อยืนยันว่าได้รับสินค้า/บริการแล้ว'}
            </Typography>
          </Box>
        </Box>
      )}

      {/* ── Cancel confirm dialog (FR-UX-5) ── */}
      {/* base pattern: theme/vuexy/.../dialogs/confirmation-dialog (Dialog/DialogContent/DialogActions) */}
      {showCancel && (
        <Dialog
          fullWidth
          maxWidth='xs'
          open={cancelDialogOpen}
          onClose={() => setCancelDialogOpen(false)}
          closeAfterTransition={false}
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
            {/* icon เตือน — ไม่มี emoji ใน heading (NFR) */}
            <Icon
              icon='tabler-alert-circle'
              style={{
                fontSize: '4.5rem',
                marginBottom: '1rem',
                color: 'var(--mui-palette-error-main)',
              }}
            />
            <Typography variant='h5' sx={{ mb: 1 }}>
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
    </Box>
  )
}
