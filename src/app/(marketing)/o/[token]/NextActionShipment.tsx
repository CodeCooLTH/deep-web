'use client'

/**
 * NextActionShipment — กล่องพัสดุในกล่องขั้นถัดไป (00068 TFR-005, TD-008, R-6)
 *
 * 🛑 หัวเรื่องและป้ายสถานะมาจาก `buyerShipmentStatus` ตัวเดียว (deriveShippingStage → resolveOrderStatusHeadline)
 * ⇒ "ส่งถึงแล้ว" คู่ "กำลังจัดส่ง" เกิดไม่ได้ (R-6) · แถบ 4 จุด/เลขพัสดุ/แถวขากลับ/กล่องเตือนเป็นของ
 * `ParcelTimeline` ตัวเดียวกับจอ guest — ห้ามวาดแถบหรือพิมพ์คำของ `SHIPMENT_STAGES` เองที่นี่ (rail-single-source)
 * ปุ่มคัดลอกเลข 44px อยู่ใน ParcelTimeline เอง
 *
 * Base: ./NextActionShell.tsx (เปลือกการ์ด) · ./ParcelTimeline.tsx
 *   (ParcelTimeline ยกมาจาก src/components/safepay/iship/ShipmentStatusView.tsx ฝั่งผู้ขายของเรา ไม่ใช่ ShippingActivityCard ของธีม)
 */

import Typography from '@mui/material/Typography'

import { buyerShipmentStatus } from '@/lib/buyer-next-action'
import NextActionShell from './NextActionShell'
import ParcelTimeline from './ParcelTimeline'

type Props = {
  status: string
  paymentMethod: string | null
  fulfillmentMode: string
  shipmentTracking: { provider: string; trackingNo: string; courierCode: string | null } | null
  carrierStatus: string | null
  problemAt: string | null
  returnStartedAt: string | null
  returnedAt: string | null
  returnDispatchedAt: string | null
  /** ป้ายปุ่มยืนยันล่างจอ (ผันตามประเภทงาน) — ตัวแปรเดียวกับปุ่มจริง */
  ctaLabel: string
  disputeOpenedAtIso: string | null
}

export default function NextActionShipment({
  status,
  paymentMethod,
  fulfillmentMode,
  shipmentTracking,
  carrierStatus,
  problemAt,
  returnStartedAt,
  returnedAt,
  returnDispatchedAt,
  ctaLabel,
  disputeOpenedAtIso,
}: Props) {
  const view = buyerShipmentStatus({
    status,
    carrierStatus,
    hasShipment: !!shipmentTracking,
    paymentMethod,
    fulfillmentMode,
    problemAt,
  })

  return (
    <NextActionShell emphasis='hero' title={view.headline} pill={view.statusPill} disputeOpenedAtIso={disputeOpenedAtIso}>
      {view.delivered && (
        <Typography color='text.secondary' sx={{ mb: 2 }}>
          ตรวจของให้ครบแล้วกด “{ctaLabel}”
        </Typography>
      )}
      {view.hasShipment && (
        <ParcelTimeline
          stage={view.stage}
          carrierStatus={carrierStatus}
          returnStartedAt={returnStartedAt}
          returnedAt={returnedAt}
          returnDispatchedAt={returnDispatchedAt}
          hasShipment
          tracking={shipmentTracking}
        />
      )}
    </NextActionShell>
  )
}
