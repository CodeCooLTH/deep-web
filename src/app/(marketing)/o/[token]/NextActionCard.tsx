'use client'

/**
 * NextActionCard — กล่อง "ขั้นถัดไป" ของผู้ซื้อ: เปลือก + switch ตาม `action.primary` (00068 TFR-003..007, SDS §3.1)
 *
 * 🛑 รับ **ผลของ `resolveBuyerNextAction`** (`action`) จาก shell แล้วแสดงตามนั้น — ไม่เรียกฟังก์ชันนั้นเอง
 * ไม่มีเงื่อนไขกิ่งของตัวเองใน JSX (วิธีชำระ/สถานะ/โหมดส่งของ…) ทุกการเลือกอยู่ใน `buyer-next-action.ts`
 * (`planNextActionCards` วาง hero + การ์ดตามติด) — เขียนเงื่อนไขซ้ำที่นี่คือนิยามที่สองของ "กล่องไหนแสดง" (HR16)
 * ผู้เรียกต้องสร้าง `action` จาก state ปัจจุบัน (หลัง optimistic update) ไม่ใช่ prop ตั้งต้น
 *
 * การ์ดย่อยห้ามถือ `order:` เอง — shell เป็นเจ้าของ slot · ไม่มีอะไรเรนเดอร์ = คืน null (slot `:empty` ซ่อนเอง)
 *
 * Base: ./PayoutAccountCard.tsx (`<Card>` + หัวข้อ) · ./PickupInfoCard.tsx — sibling ที่ยกโครงมา ไม่ได้ port ตรงจากไฟล์ธีม
 */

import Box from '@mui/material/Box'

import { Icon } from '@iconify/react'

import { LinkButton } from '@/app/(marketing)/_components/mui-link'
import { planNextActionCards, resolveTransferAmount, type BuyerNextAction, type NextActionCardKind } from '@/lib/buyer-next-action'
import type { PaymentBadge } from '@/lib/order-display'
import type { PayoutSnapshot } from '@/lib/shop-payout'
import AppointmentCard, { type PublicAppointment } from './AppointmentCard'
import NextActionPickup from './NextActionPickup'
import NextActionShipment from './NextActionShipment'
import NextActionStatus from './NextActionStatus'
import NextActionTransfer from './NextActionTransfer'
import PayoutAccountCard from './PayoutAccountCard'
import PickupInfoCard from './PickupInfoCard'

/** ฟิลด์ของออเดอร์ที่กล่องนี้ใช้ — `PublicOrderData` เข้ากันได้ตรง ๆ (ส่ง order ทั้งก้อนได้) */
export type NextActionOrder = {
  publicToken: string
  shopId: string
  status: string
  totalAmount: number
  serviceMoney: { totalAmount: number; totalReceived: number; outstanding: number } | null
  paymentMethod: string | null
  paymentConfirmedAt: string | null
  fulfillmentMode: string
  payoutSnapshot: PayoutSnapshot | null
  slipFileId: string | null
  shipmentTracking: { provider: string; trackingNo: string; courierCode: string | null } | null
  carrierStatus: string | null
  problemAt: string | null
  returnStartedAt: string | null
  returnedAt: string | null
  returnDispatchedAt: string | null
  handedOverAt: string | null
  appointment: PublicAppointment | null
  /** ISO — มีค่า = ผู้ซื้อแจ้งปัญหาแล้ว (แถบใน hero) */
  disputeOpenedAtIso: string | null
  shop: { shopName: string; address: string | null }
}

type Props = {
  /** ผลของ `resolveBuyerNextAction` (คำนวณที่ shell) */
  action: BuyerNextAction
  order: NextActionOrder
  /** ป้ายการชำระเงินจาก `getPaymentBadge()` — ส่งต่อให้ PayoutAccountCard */
  paymentBadge: PaymentBadge
  /** ป้ายปุ่มยืนยันล่างจอ (ตัวแปรเดียวกับปุ่มจริง) */
  ctaLabel: string
  /** เปิด dialog แจ้งปัญหาของ shell */
  onReportProblem?: () => void
}

export default function NextActionCard({ action, order, paymentBadge, ctaLabel, onReportProblem }: Props) {
  const plan = planNextActionCards(action)
  const amountDue = resolveTransferAmount({
    totalAmount: order.totalAmount,
    outstanding: order.serviceMoney?.outstanding ?? null,
  })

  const transfer = (emphasis: 'hero' | 'follow') => (
    <NextActionTransfer
      key='TRANSFER'
      emphasis={emphasis}
      token={order.publicToken}
      shopId={order.shopId}
      amountDue={amountDue}
      totalReceived={order.serviceMoney?.totalReceived ?? 0}
      noAccount={action.transferNoAccount}
      payoutSnapshot={order.payoutSnapshot}
      paymentBadge={paymentBadge}
      status={order.status}
      paymentConfirmedAt={order.paymentConfirmedAt}
      initialSlipFileId={order.slipFileId}
      disputeOpenedAtIso={emphasis === 'hero' ? order.disputeOpenedAtIso : null}
    />
  )

  const appointment = (
    <AppointmentCard
      key='APPOINTMENT'
      token={order.publicToken}
      appointment={order.appointment!}
      orderCancelled={order.status === 'CANCELLED'}
    />
  )

  const heroByKind = {
    APPOINTMENT: appointment,
    TRANSFER: transfer('hero'),
    PICKUP: (
      <NextActionPickup
        key='PICKUP'
        shopId={order.shopId}
        shopName={order.shop.shopName}
        shopAddress={order.shop.address}
        handedOverAt={order.handedOverAt}
        onReportProblem={onReportProblem}
        disputeOpenedAtIso={order.disputeOpenedAtIso}
      />
    ),
    SHIPMENT: (
      <NextActionShipment
        key='SHIPMENT'
        status={order.status}
        paymentMethod={order.paymentMethod}
        fulfillmentMode={order.fulfillmentMode}
        shipmentTracking={order.shipmentTracking}
        carrierStatus={order.carrierStatus}
        problemAt={order.problemAt}
        returnStartedAt={order.returnStartedAt}
        returnedAt={order.returnedAt}
        returnDispatchedAt={order.returnDispatchedAt}
        ctaLabel={ctaLabel}
        disputeOpenedAtIso={order.disputeOpenedAtIso}
      />
    ),
    STATUS: action.statusVariant && (
      <NextActionStatus
        key='STATUS'
        variant={action.statusVariant}
        shopId={order.shopId}
        status={order.status}
        fulfillmentMode={order.fulfillmentMode}
        paymentMethod={order.paymentMethod}
        paymentConfirmedAt={order.paymentConfirmedAt}
        totalAmount={order.totalAmount}
        serviceMoney={order.serviceMoney}
        disputeOpenedAtIso={order.disputeOpenedAtIso}
      />
    ),
  } as const

  const followUpByKind: Record<NextActionCardKind, React.ReactNode> = {
    TRANSFER: transfer('follow'),
    // การ์ดบัญชีแบบสรุป (ถอด QR เมื่อ settled/ยกเลิก — ด่าน P0-2 อยู่ใน PayoutAccountCard เอง)
    PAYOUT: (
      <PayoutAccountCard
        key='PAYOUT'
        amountDue={amountDue}
        payoutSnapshot={order.payoutSnapshot}
        paymentBadge={paymentBadge}
        status={order.status}
        paymentConfirmedAt={order.paymentConfirmedAt}
        contactShopAction={
          <LinkButton
            href={`/messages/${order.shopId}`}
            fullWidth
            variant='tonal'
            color='primary'
            startIcon={<Icon icon='tabler-headset' fontSize={18} />}
            sx={{ minHeight: 44, fontWeight: 500 }}
          >
            ติดต่อร้านค้า
          </LinkButton>
        }
      />
    ),
    PICKUP: (
      <PickupInfoCard
        key='PICKUP'
        shopName={order.shop.shopName}
        shopAddress={order.shop.address}
        handedOverAt={order.handedOverAt}
        status={order.status}
      />
    ),
    APPOINTMENT: appointment,
  }

  if (plan.hero === null && plan.followUps.length === 0) return null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
      {plan.hero && heroByKind[plan.hero]}
      {plan.followUps.map(kind => followUpByKind[kind])}
    </Box>
  )
}
