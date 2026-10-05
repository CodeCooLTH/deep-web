'use client'

/**
 * NextActionStatus — กล่องสถานะล้วน (ไม่มีอะไรให้ผู้ซื้อกด) ในกล่องขั้นถัดไป (00068 TFR-006)
 * ใช้เมื่อ `primary === 'STATUS'`: COD · เงินสด · ดิจิทัล · ธรรมดา (รวมกรณีร้านแจ้งส่งแล้วแต่ไม่มีพัสดุ)
 *
 * หัวเรื่อง/บรรทัดรองมาจาก `buildStatusBoxView` ทั้งหมด (ป้ายวิธีชำระจาก `paymentMethodLabel` — เงินสดไม่ถูกเรียกว่า
 * "โอนเข้าบัญชี" และค่าดิบของร้านโชว์เฉพาะที่บอกเกินป้าย) — ไม่มีโอน/สลิป/QR ที่นี่ ไม่ import PayoutAccountCard
 * ลิงก์ดิจิทัล (`accessUrl` + isHttpUrl) ยังเป็นการ์ดตามติดใน shell ตาม SDS §3.2 ไม่ย้ายมาในรอบนี้
 *
 * Base: ./NextActionShell.tsx (เปลือกการ์ด) · การ์ด "ช่องทางการชำระเงิน" เดิมใน ./OrderDetailMobile.tsx
 */

import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { LinkButton } from '@/app/(marketing)/_components/mui-link'
import { buildStatusBoxView, type BuyerNextAction } from '@/lib/buyer-next-action'
import NextActionShell from './NextActionShell'

type Props = {
  /** `action.statusVariant` (non-null เมื่อ primary === 'STATUS') */
  variant: NonNullable<BuyerNextAction['statusVariant']>
  shopId: string
  status: string
  fulfillmentMode: string
  paymentMethod: string | null
  paymentConfirmedAt: string | null
  totalAmount: number
  serviceMoney: { totalAmount: number; totalReceived: number; outstanding: number } | null
  disputeOpenedAtIso: string | null
}

export default function NextActionStatus({ shopId, disputeOpenedAtIso, ...input }: Props) {
  const view = buildStatusBoxView(input)

  return (
    <NextActionShell emphasis='hero' title={view.headline} disputeOpenedAtIso={disputeOpenedAtIso}>
      {view.lines.map((line, i) => (
        <Typography key={line} color='text.secondary' sx={{ mt: i === 0 ? 0 : 0.5 }}>
          {line}
        </Typography>
      ))}
      {view.chatCta && (
        <LinkButton
          href={`/messages/${shopId}`}
          fullWidth
          variant='tonal'
          startIcon={<Icon icon='tabler-message-circle' fontSize={18} />}
          // ตัวอักษร tonal ใช้ primary.dark — primary.main บนพื้นจางได้ ~3.7:1 ตก AA ที่ 15px (UX §5)
          sx={{ mt: 2.5, minHeight: 48, fontWeight: 500, color: 'primary.dark' }}
        >
          แชทกับร้าน
        </LinkButton>
      )}
    </NextActionShell>
  )
}
