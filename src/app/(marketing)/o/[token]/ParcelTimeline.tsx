'use client'

/**
 * ParcelTimeline — แถบ 4 จุดของสถานะพัสดุ ที่ผู้ซื้อเห็น (feature 00041, BR-BOE-12)
 *
 * Base: theme/vuexy/.../views/apps/ecommerce/orders/details/ShippingActivityCard.tsx
 *   (โครง timeline + จุด/เส้นเชื่อม) — ตัด dynamic list เหลือ 4 จุดคงที่
 *
 * 🛑 ลำดับ/ความหมายของ 4 จุดยกมาจาก MiniShipmentTimeline.tsx ฝั่งร้าน **1:1** และ stage
 * ปัจจุบันคำนวณด้วย deriveShippingStage() ตัวเดียวกัน — ห้ามสร้างตรรกะแบ่งขั้นของตัวเองที่นี่
 * ไม่งั้นผู้ซื้อกับผู้ขายจะเห็นพัสดุใบเดียวกันอยู่คนละขั้น (คลาสเดียวกับ HR16)
 *
 * แยกไฟล์เพราะถูกใช้ทั้ง GuestOrderView และ OrderDetailMobile — เขียนซ้ำสองที่คือจุดเริ่ม
 * ของการ drift แบบเดียวกับป้ายสถานะที่เพิ่งรวมไป (10 จุด)
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { Icon } from '@iconify/react'

import { ORDER_STAGE_META } from '@/lib/order-stage'

/** 4 จุดของ timeline พัสดุ — ลำดับเดียวกับ MiniShipmentTimeline ฝั่งร้าน (BR-BOE-12) */
const PARCEL_STEPS = [
  { key: 'PARCEL_CREATED', label: 'สร้างพัสดุ' },
  { key: 'LABEL_PRINTED', label: 'รับเข้าระบบแล้ว' },
  { key: 'SHIPPING', label: 'กำลังจัดส่ง' },
  { key: 'DELIVERED', label: 'จัดส่งสำเร็จ' },
] as const

export default function ParcelTimeline({ stage }: { stage: string }) {
  const problem = stage === 'PARCEL_PROBLEM'
  const idx = PARCEL_STEPS.findIndex((s) => s.key === stage)
  // stage ที่ไม่อยู่ในแถบนี้ (ORDERED/COMPLETED/CANCELLED) → ยังไม่เริ่มเดิน ไม่ใช่ error
  const current = idx === -1 ? (problem ? 2 : 0) : idx

  return (
    <Box>
      {problem && (
        <Typography
          variant='caption'
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'error.main', fontWeight: 700, mb: 1 }}
        >
          <Icon icon='tabler-alert-triangle' fontSize={15} />
          {ORDER_STAGE_META.PARCEL_PROBLEM.label}
        </Typography>
      )}
      <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
        {PARCEL_STEPS.map((step, i) => {
          const done = i < current
          const isCurrent = i === current && !problem
          return (
            <Box key={step.key} sx={{ flex: 1, textAlign: 'center', position: 'relative' }}>
              {i > 0 && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 6,
                    left: '-50%',
                    width: '100%',
                    height: 2,
                    // Verified-Means-Green: เขียวเฉพาะช่วงที่ "ผ่านไปแล้วจริง"
                    bgcolor: i <= current && !problem ? 'success.main' : 'divider',
                  }}
                />
              )}
              <Box
                sx={{
                  position: 'relative',
                  zIndex: 1,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  mx: 'auto',
                  mb: 0.75,
                  bgcolor: problem && i === current ? 'error.main' : done ? 'success.main' : isCurrent ? 'primary.main' : 'divider',
                  boxShadow: isCurrent ? (theme) => `0 0 0 4px ${theme.palette.primary.main}22` : 'none',
                }}
              />
              <Typography
                variant='caption'
                sx={{
                  display: 'block',
                  lineHeight: 1.35,
                  fontSize: '0.66rem',
                  fontWeight: isCurrent || done ? 700 : 400,
                  color: isCurrent ? 'primary.main' : done ? 'success.dark' : 'text.disabled',
                }}
              >
                {step.label}
              </Typography>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
