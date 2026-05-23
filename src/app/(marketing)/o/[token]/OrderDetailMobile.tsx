'use client'

/**
 * Order detail — mobile-first layout พร้อมปุ่ม "ยืนยันคำสั่งซื้อ" fixed bottom
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/invoice/preview/PreviewCard.tsx
 *       (Card+CardContent shell, item list + totals pattern)
 *       + theme/vuexy/typescript-version/full-version/src/components/dialogs/confirmation-dialog/index.tsx
 *       (Dialog/DialogContent/DialogActions cancel dialog)
 *       + compose-primitive: Avatar+Typography+Chip+IconButton+Box (Vuexy MUI primitives)
 *
 * Redesign 2026-05-23: Trust Hero Card + Status Hero Banner + Payment section +
 *   Tracking copy-button + Cancel dialog + tier SSOT helper
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
  CONFIRMED: 'ยืนยันแล้ว',
  CANCELLED: 'ยกเลิกแล้ว',
}

const STATUS_COLOR: Record<PublicOrderData['status'], 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  PENDING:   'warning',
  SHIPPED:   'info',
  CONFIRMED: 'success',
  CANCELLED: 'error',
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
  const isConfirmed = order.status === 'CONFIRMED'

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

  return (
    <div className='min-bs-[100dvh] bg-[var(--mui-palette-background-default)] flex flex-col'>
      {/* Scrollable body — pb สำหรับเว้นที่ให้ fixed bottom CTA */}
      <div className='flex-1 overflow-y-auto px-4 pt-4 pb-[calc(8rem+env(safe-area-inset-bottom,0px))] flex flex-col gap-4 max-w-xl mx-auto w-full'>

        {/* Trust Hero Card (FR-UX-2) — dim เมื่อ CANCELLED */}
        <Card className={isCancelled ? 'opacity-50' : ''}>
          <CardContent className='!p-4'>
            <div className='flex items-center gap-3'>
              {/* Avatar */}
              <Avatar sx={{ width: 52, height: 52 }} className='shrink-0 text-lg'>
                {avatarLetter}
              </Avatar>

              {/* ชื่อร้าน + @username + chips */}
              <div className='flex-1 min-w-0'>
                {/* shopName เป็น link ไปหน้า public profile (/u/{username}) */}
                {/* ไฟล์นี้เป็น client component — ใช้ next/link ได้โดยตรง (RSC rule ไม่ apply) */}
                <Link
                  href={`/u/${order.shop.user.username}`}
                  className='font-semibold text-[var(--mui-palette-text-primary)] hover:underline truncate block'
                >
                  {order.shop.shopName}
                </Link>
                <Typography color='text.secondary' className='text-xs truncate'>
                  @{order.shop.user.username}
                </Typography>
                {/* chips แถวล่าง: verified + tier */}
                <div className='flex items-center gap-1 mt-1.5 flex-wrap'>
                  {/* verified chip — แสดงเมื่อ maxVerifyLevel >= 1 */}
                  {order.maxVerifyLevel >= 1 && (
                    <Chip
                      size='small'
                      color='info'
                      icon={<i className='tabler-shield-check text-sm' />}
                      label='ยืนยันแล้ว'
                    />
                  )}
                  {/* tier chip — ใช้ helper SSOT (ห้าม hardcode) */}
                  <Chip size='small' color={tierColor} label={tierLabel} />
                </div>
              </div>

              {/* Trust Score ตัวเลข */}
              <div className='flex flex-col items-end shrink-0'>
                <Typography color='text.disabled' className='text-xs'>
                  Trust Score
                </Typography>
                <Typography
                  variant='h5'
                  color={`${tierColor}.main`}
                  className='!font-bold !leading-none'
                >
                  {trustScore}
                </Typography>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status Hero Banner (FR-UX-7) */}
        <Card>
          <CardContent className='!p-4'>
            <Box className='flex flex-col items-center text-center gap-2 py-2'>
              {/* icon — ใหญ่พิเศษเมื่อ CONFIRMED (success visual) */}
              <i
                className={`${heroCopy.icon} ${
                  isConfirmed
                    ? 'text-[3.5rem] text-[var(--mui-palette-success-main)]'
                    : isCancelled
                      ? 'text-[2.5rem] text-[var(--mui-palette-error-main)]'
                      : 'text-[2.5rem] text-[var(--mui-palette-warning-main)]'
                }`}
                style={order.status === 'SHIPPED' ? { color: 'var(--mui-palette-info-main)' } : undefined}
              />
              {/* status chip */}
              <Chip
                color={STATUS_COLOR[order.status]}
                label={STATUS_LABEL[order.status]}
                size='medium'
              />
              {/* hero body copy */}
              <Typography color='text.secondary' className='text-sm max-w-xs'>
                {heroCopy.body}
              </Typography>
              {/* token + วันที่ */}
              <Typography color='text.disabled' className='text-xs'>
                #{order.publicToken.slice(0, 8)} · {dateFmt.format(new Date(order.createdAtIso))}
              </Typography>
              {/* type chip */}
              <Chip size='small' variant='outlined' label={TYPE_LABEL[order.type]} />
            </Box>
          </CardContent>
        </Card>

        {/* Items table (base pattern: PreviewCard item list) */}
        <Card>
          <CardContent className='!p-4 flex flex-col gap-3'>
            <Typography className='font-semibold'>รายการสินค้า</Typography>
            {order.items.map((item, idx) => (
              <div key={item.id}>
                <div className='flex items-start justify-between gap-3'>
                  <div className='flex-1 min-w-0'>
                    <Typography className='text-sm font-medium'>{item.name}</Typography>
                    {item.description && (
                      <Typography color='text.secondary' className='text-xs mt-0.5'>
                        {item.description}
                      </Typography>
                    )}
                    <Typography color='text.disabled' className='text-xs mt-1'>
                      จำนวน {item.qty} × {baht.format(item.price)}
                    </Typography>
                  </div>
                  <Typography className='text-sm font-semibold shrink-0'>
                    {baht.format(item.qty * item.price)}
                  </Typography>
                </div>
                {idx < order.items.length - 1 && <Divider className='mt-3' />}
              </div>
            ))}
            <Divider />
            <div className='flex items-center justify-between'>
              <Typography className='font-medium'>ยอดรวม</Typography>
              <Typography variant='h6' className='!font-bold'>
                {baht.format(order.totalAmount)}
              </Typography>
            </div>
          </CardContent>
        </Card>

        {/* Payment section (FR-UX-3) — ซ่อนถ้า paymentMethod == null */}
        {order.paymentMethod !== null && (
          <Card>
            <CardContent className='!p-4'>
              <div className='flex items-center gap-2 mb-1'>
                <i className='tabler-cash text-xl text-[var(--mui-palette-text-secondary)]' />
                <Typography className='font-semibold'>วิธีชำระเงิน</Typography>
              </div>
              <Typography color='text.secondary' className='text-sm'>
                {order.paymentMethod}
              </Typography>
            </CardContent>
          </Card>
        )}

        {/* Tracking section (FR-UX-6) — เด่นตอน SHIPPED */}
        {order.shipmentTracking && (
          <Card className={order.status === 'SHIPPED' ? 'border-2 border-[var(--mui-palette-info-main)]' : ''}>
            <CardContent className='!p-4'>
              <div className='flex items-center gap-2 mb-2'>
                <i className='tabler-truck text-xl text-[var(--mui-palette-info-main)]' />
                <Typography className='font-semibold'>ข้อมูลการจัดส่ง</Typography>
              </div>
              <Typography color='text.secondary' className='text-sm mb-1'>
                {order.shipmentTracking.provider}
              </Typography>
              {/* tracking no + copy button */}
              <div className='flex items-center gap-2'>
                <Typography className='font-mono font-bold text-base flex-1 break-all'>
                  {order.shipmentTracking.trackingNo}
                </Typography>
                {/* ซ่อนปุ่ม copy ถ้า clipboard API ไม่ available (e.g. non-secure context) */}
                {typeof navigator !== 'undefined' && navigator?.clipboard && (
                  <IconButton
                    size='small'
                    onClick={() => handleCopyTracking(order.shipmentTracking!.trackingNo)}
                    aria-label='คัดลอกเลข tracking'
                  >
                    <i className={copied ? 'tabler-check text-[var(--mui-palette-success-main)]' : 'tabler-copy'} />
                  </IconButton>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Existing review */}
        {order.hasReview && order.review && (
          <Card>
            <CardContent className='!p-4 flex flex-col gap-2'>
              <Typography className='font-semibold'>รีวิวของคุณ</Typography>
              <div className='flex items-center gap-1 text-[var(--mui-palette-warning-main)]'>
                {Array.from({ length: 5 }).map((_, i) => (
                  <i
                    key={i}
                    className={
                      i < order.review!.rating
                        ? 'tabler-star-filled text-xl'
                        : 'tabler-star text-[var(--mui-palette-text-disabled)] text-xl'
                    }
                  />
                ))}
              </div>
              {order.review.comment && (
                <Typography className='text-sm whitespace-pre-wrap'>{order.review.comment}</Typography>
              )}
              <Typography color='text.disabled' className='text-xs'>
                ขอบคุณที่แชร์ประสบการณ์ของคุณ
              </Typography>
            </CardContent>
          </Card>
        )}

        {/* Review form (หลัง CONFIRMED/SHIPPED, ยังไม่มีรีวิว) */}
        {canReview && <ReviewForm token={order.publicToken} />}
      </div>

      {/* Fixed bottom CTA (FR-UX-8) — เฉพาะ PENDING/SHIPPED (canConfirm) */}
      {canConfirm && (
        <div
          className='fixed inset-x-0 bottom-0 z-30 border-t border-[var(--mui-palette-divider)] bg-[var(--mui-palette-background-paper)] shadow-[0_-4px_12px_rgba(0,0,0,0.06)]'
          style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
        >
          <div className='max-w-xl mx-auto px-4 pt-4 pb-4 flex flex-col gap-2'>
            {/* Primary CTA — ≥48px touch target (WCAG 2.5.5) */}
            <Button
              fullWidth
              variant='contained'
              size='large'
              disabled={submitting}
              onClick={handleConfirm}
              className='!min-h-[3rem]'
            >
              {submitting
                ? 'กำลังยืนยัน…'
                : order.status === 'SHIPPED'
                  ? 'ยืนยันรับสินค้า'
                  : 'ยืนยันคำสั่งซื้อ'}
            </Button>

            {/* sub-text (SMS flow: unlockedPhone='' → ซ่อน "เบอร์ ·") */}
            <Typography color='text.disabled' className='text-xs text-center'>
              {unlockedPhone
                ? `เบอร์ ${unlockedPhone} · แตะเพื่อยืนยันว่าได้รับสินค้า/บริการแล้ว`
                : 'แตะเพื่อยืนยันว่าได้รับสินค้า/บริการแล้ว'}
            </Typography>

            {/* Cancel button (FR-UX-5) — เฉพาะ PENDING + parent ส่ง onCancel */}
            {showCancel && (
              <Button
                fullWidth
                variant='text'
                color='error'
                size='medium'
                onClick={() => setCancelDialogOpen(true)}
                className='!min-h-[2.5rem]'
              >
                ยกเลิกคำสั่งซื้อ
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Cancel confirm dialog (FR-UX-5) — base: confirmation-dialog theme */}
      {showCancel && (
        <Dialog
          fullWidth
          maxWidth='xs'
          open={cancelDialogOpen}
          onClose={() => setCancelDialogOpen(false)}
          closeAfterTransition={false}
        >
          <DialogContent className='flex items-center flex-col text-center sm:pbs-16 sm:pbe-6 sm:pli-16 !pt-8 !pb-4 !px-6'>
            {/* icon เตือน — ไม่มี emoji ใน heading (NFR) */}
            <i className='tabler-alert-circle text-[72px] mb-4 text-[var(--mui-palette-error-main)]' />
            <Typography variant='h5' className='mb-2'>
              ยืนยันการยกเลิก?
            </Typography>
            <Typography color='text.secondary' className='text-sm'>
              การยกเลิกจะไม่สามารถเลิกทำได้
            </Typography>
          </DialogContent>
          <DialogActions className='justify-center !pb-8 !px-6 gap-2'>
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
              {cancelling ? 'กำลังยกเลิก…' : 'ยืนยันยกเลิก'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </div>
  )
}
