'use client'

/**
 * NextActionPickup — กล่องนัดรับสินค้าที่ร้านในกล่องขั้นถัดไป (00068 TFR-006, BR-BOP-12)
 *
 * 🛑 ห้ามสีเขียวเด็ดขาด — "ร้านแจ้งว่ามอบสินค้าให้แล้ว" เป็นคำบอกเล่าฝั่งร้านฝ่ายเดียว ยังไม่มีใครยืนยัน
 * ผู้ซื้อทักท้วงได้จนกว่าจะครบกำหนดปิดอัตโนมัติ (ไอคอนใช้สีกลาง)
 * ห้ามพิมพ์จำนวนชั่วโมงปิดอัตโนมัติเอง — คำนวณจาก `computeAutoConfirmDeadline` (ค่าอยู่ใน order-pickup.ts ที่เดียว)
 * ข้อความ "ร้านแจ้งว่ามอบ…" ขึ้นเฉพาะเมื่อ `handedOverAt` มีค่า — ไม่เดาจากสถานะ
 *
 * การ์ดตามติดแบบเดิม (กรณี hero เป็นกล่องโอน) ยังเป็น `PickupInfoCard` — ข้อความร่วมกันอยู่ใน `@/lib/order-pickup`
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/orders/details/OrderDetailsCard.tsx
 *   (Card + หัวเรื่อง) · ./PickupInfoCard.tsx (เนื้อหาจุดนัดรับ)
 */

import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { LinkButton } from '@/app/(marketing)/_components/mui-link'
import { formatDateTimeTH } from '@/lib/format-date'
import { computeAutoConfirmDeadline, PICKUP_CONTACT_COPY, PICKUP_NO_ADDRESS_COPY } from '@/lib/order-pickup'
import NextActionShell from './NextActionShell'

type Props = {
  shopId: string
  shopName: string
  shopAddress: string | null
  /** ISO — null = ร้านยังไม่ได้กดมอบสินค้า */
  handedOverAt: string | null
  /** เปิด dialog แจ้งปัญหาของ shell — ไม่ส่ง = ไม่มีปุ่ม */
  onReportProblem?: () => void
  disputeOpenedAtIso: string | null
}

export default function NextActionPickup({
  shopId,
  shopName,
  shopAddress,
  handedOverAt,
  onReportProblem,
  disputeOpenedAtIso,
}: Props) {
  if (handedOverAt) {
    const autoConfirmAt = computeAutoConfirmDeadline(new Date(handedOverAt))

    return (
      <NextActionShell
        emphasis='hero'
        title='ร้านแจ้งว่ามอบสินค้าให้แล้ว'
        icon='tabler-building-store'
        iconColor='var(--mui-palette-text-secondary)'
        disputeOpenedAtIso={disputeOpenedAtIso}
      >
        <Typography color='text.secondary'>เมื่อ {formatDateTimeTH(handedOverAt)}</Typography>
        <Typography color='text.secondary' sx={{ mt: 0.5, mb: onReportProblem ? 2.5 : 0 }}>
          ระบบจะปิดงานอัตโนมัติ {formatDateTimeTH(autoConfirmAt.toISOString())} หากคุณไม่ทักท้วง
        </Typography>
        {onReportProblem && (
          <Button fullWidth variant='outlined' color='secondary' onClick={onReportProblem} sx={{ minHeight: 48, fontWeight: 500 }}>
            แจ้งปัญหาคำสั่งซื้อ
          </Button>
        )}
      </NextActionShell>
    )
  }

  return (
    <NextActionShell emphasis='hero' title='รับสินค้าที่ร้าน' disputeOpenedAtIso={disputeOpenedAtIso}>
      <Typography sx={{ fontWeight: 500 }}>{shopName}</Typography>
      <Typography color='text.secondary' sx={{ mt: 0.25 }}>
        {shopAddress ?? PICKUP_NO_ADDRESS_COPY}
      </Typography>
      <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 1.5, mb: 2.5, fontSize: '0.8125rem' }}>
        {PICKUP_CONTACT_COPY}
      </Typography>
      <LinkButton
        href={`/messages/${shopId}`}
        fullWidth
        variant='contained'
        startIcon={<Icon icon='tabler-message-circle' fontSize={18} />}
        sx={{ minHeight: 48, fontWeight: 500 }}
      >
        แชทกับร้านเพื่อนัดรับ
      </LinkButton>
    </NextActionShell>
  )
}
