'use client'

/**
 * Order detail — mobile-first layout พร้อมปุ่ม "ยืนยันคำสั่งซื้อ" fixed bottom
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/invoice/preview/PreviewCard.tsx
 *       (item table + totals pattern)
 *       + theme/vuexy/.../views/pages/user-profile/UserProfileHeader.tsx
 *       (seller hero row)
 *
 * UX ใหม่ 2026-04-18 — mobile-first เท่านั้น, scrollable body + fixed bottom CTA
 */
import { useState } from 'react'

import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

import { toast } from 'react-toastify'

import ReviewForm from './ReviewForm'

export type PublicOrderData = {
  publicToken: string
  status: 'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED'
  type: 'PHYSICAL' | 'DIGITAL' | 'SERVICE'
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
}

type Props = {
  order: PublicOrderData
  unlockedPhone: string
  /** Action: buyer กด "ยืนยันคำสั่งซื้อ" — transitions PENDING|SHIPPED → CONFIRMED (terminal) */
  onConfirmAction: () => Promise<void>
}

const STATUS_LABEL: Record<PublicOrderData['status'], string> = {
  PENDING:   'รอดำเนินการ',
  SHIPPED:   'จัดส่งแล้ว',
  CONFIRMED: 'สำเร็จ',
  CANCELLED: 'ยกเลิก',
}

const STATUS_COLOR: Record<PublicOrderData['status'], 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  PENDING:   'warning',
  SHIPPED:   'info',
  CONFIRMED: 'success',
  CANCELLED: 'error',
}

const TYPE_LABEL: Record<PublicOrderData['type'], string> = {
  PHYSICAL: 'สินค้า',
  DIGITAL: 'สินค้าดิจิทัล',
  SERVICE: 'บริการ',
}

const TRUST_COLOR = (score: number): 'success' | 'info' | 'warning' | 'error' => {
  if (score >= 80) return 'success'
  if (score >= 60) return 'info'
  if (score >= 40) return 'warning'
  return 'error'
}

const TRUST_LEVEL = (score: number): string => {
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B+'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  return 'D'
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

export default function OrderDetailMobile({ order, unlockedPhone, onConfirmAction }: Props) {
  const [submitting, setSubmitting] = useState(false)

  // confirm เมื่อ PENDING หรือ SHIPPED (ผู้ซื้อกดรับ = terminal CONFIRMED)
  const canConfirm = order.status === 'PENDING' || order.status === 'SHIPPED'
  // review เมื่อ CONFIRMED หรือ SHIPPED (spec §3 public order gate)
  const canReview =
    !order.hasReview &&
    (order.status === 'CONFIRMED' || order.status === 'SHIPPED')
  const isCancelled = order.status === 'CANCELLED'

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

  const trustScore = order.shop.user.trustScore
  const trustColor = TRUST_COLOR(trustScore)
  const trustLevel = TRUST_LEVEL(trustScore)
  const avatarLetter = order.shop.user.displayName.slice(0, 1)

  return (
    <div className='min-bs-[100dvh] bg-[var(--mui-palette-background-default)] flex flex-col'>
      {/* Scrollable body — pb สำหรับเว้นที่ให้ fixed bottom CTA */}
      <div className='flex-1 overflow-y-auto px-4 pt-4 pb-[calc(8rem+env(safe-area-inset-bottom,0px))] flex flex-col gap-4 max-w-xl mx-auto w-full'>
        {/* Seller hero */}
        <Card>
          <CardContent className='flex items-center gap-4 !p-4'>
            <Avatar sx={{ width: 48, height: 48 }} className='shrink-0'>{avatarLetter}</Avatar>
            <div className='flex-1 min-w-0'>
              <Typography className='font-semibold truncate'>{order.shop.user.displayName}</Typography>
              <Typography color='text.secondary' className='text-sm truncate'>
                {order.shop.shopName}
              </Typography>
            </div>
            <div className='flex flex-col items-end shrink-0'>
              <Typography color='text.disabled' className='text-xs'>
                Trust
              </Typography>
              <div className='flex items-center gap-1'>
                <Typography variant='h6' color={`${trustColor}.main`} className='!font-bold !leading-none'>
                  {trustScore}
                </Typography>
                <Chip size='small' color={trustColor} label={trustLevel} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order header meta */}
        <Card>
          <CardContent className='!p-4 flex flex-col gap-3'>
            <div className='flex items-start justify-between gap-3'>
              <div className='flex-1 min-w-0'>
                <Typography variant='h6'>คำสั่งซื้อ</Typography>
                <Typography color='text.secondary' className='text-xs'>
                  #{order.publicToken.slice(0, 8)} · {dateFmt.format(new Date(order.createdAtIso))}
                </Typography>
              </div>
              <Chip size='medium' color={STATUS_COLOR[order.status]} label={STATUS_LABEL[order.status]} />
            </div>
            <div className='flex items-center gap-2'>
              <Chip size='small' variant='outlined' label={TYPE_LABEL[order.type]} />
            </div>
          </CardContent>
        </Card>

        {/* Items */}
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

        {/* Shipment tracking (SHIPPED only) */}
        {order.shipmentTracking && (
          <Card>
            <CardContent className='!p-4'>
              <Typography className='font-semibold mb-1'>ข้อมูลการจัดส่ง</Typography>
              <Typography color='text.secondary' className='text-sm'>
                {order.shipmentTracking.provider} — {order.shipmentTracking.trackingNo}
              </Typography>
            </CardContent>
          </Card>
        )}

        {/* Cancelled notice */}
        {isCancelled && (
          <Card>
            <CardContent className='!p-4 flex items-center gap-2'>
              <i className='tabler-alert-circle text-lg text-[var(--mui-palette-error-main)]' />
              <Typography color='error.main'>คำสั่งซื้อนี้ถูกยกเลิกแล้ว</Typography>
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

        {/* Review form (after CONFIRMED, no existing review) */}
        {canReview && <ReviewForm token={order.publicToken} />}
      </div>

      {/* Fixed bottom CTA — เฉพาะ PENDING/SHIPPED (canConfirm) */}
      {canConfirm && (
        <div
          className='fixed inset-x-0 bottom-0 z-30 border-t border-[var(--mui-palette-divider)] bg-[var(--mui-palette-background-paper)] shadow-[0_-4px_12px_rgba(0,0,0,0.06)]'
          style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
        >
          <div className='max-w-xl mx-auto px-4 pt-4 pb-4'>
            <Button
              fullWidth
              variant='contained'
              size='large'
              disabled={submitting}
              onClick={handleConfirm}
              className='!min-h-[3.5rem]'
            >
              {submitting ? 'กำลังยืนยัน…' : 'ยืนยันคำสั่งซื้อ'}
            </Button>
            <Typography color='text.disabled' className='text-xs text-center mt-2'>
              เบอร์ {unlockedPhone} · แตะเพื่อยืนยันว่าได้รับสินค้า/บริการแล้ว
            </Typography>
          </div>
        </div>
      )}
    </div>
  )
}
