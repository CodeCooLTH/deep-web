'use client'

/**
 * ParcelTimeline — แถบ 4 จุดของสถานะพัสดุ ที่ผู้ซื้อเห็น (feature 00041, BR-BOE-12)
 *
 * Base: theme/vuexy/.../views/apps/ecommerce/orders/details/ShippingActivityCard.tsx
 *   (โครง timeline + จุด/เส้นเชื่อม) — ตัด dynamic list เหลือ 4 จุดคงที่
 *
 * 🛑 ป้ายทั้ง 4 จุดมาจาก `SHIPMENT_STAGES` และจุดที่ไฮไลต์มาจาก `SHIPMENT_STAGE_DOT_INDEX`
 * ตัวเดียวกับที่ `MiniShipmentTimeline.tsx` ฝั่งร้านใช้ — ห้ามเขียนรายชื่อขั้นหรือตรรกะแบ่งขั้น
 * ของตัวเองที่นี่ ไม่งั้นผู้ซื้อกับผู้ขายจะเห็นพัสดุใบเดียวกันอยู่คนละขั้น (HR16)
 *
 * 🛑 ไฟล์นี้เคยเขียนคอมเมนต์ข้างบนไว้แล้ว **แต่ทำตรงข้าม**: มันไล่หา stage ในรายชื่อ key
 * ของตัวเอง (`PARCEL_CREATED`/`LABEL_PRINTED`/`DELIVERED`) ซึ่งเป็นค่าของ `OrderStageKey`
 * คนละชุดกับ `ShippingStageKey` ที่ `deriveShippingStage()` คืนมาจริง ⇒ ตัดกันแค่ `SHIPPING`
 * ค่าเดียว: พัสดุที่ส่งถึงแล้วไฮไลต์ "สร้างพัสดุ", จุด "จัดส่งสำเร็จ" ไม่มีทางติด, และแถบเตือน
 * "พัสดุมีปัญหา" (เทียบกับ `'PARCEL_PROBLEM'` ที่ไม่มีวันตรงกับ `'PROBLEM'`) ไม่เคยขึ้นเลย
 * ตั้งแต่วันแรก. ไม่มี gate ไหนจับได้เพราะ prop ประกาศเป็น `stage: string` — ตอนนี้พิมพ์เป็น
 * `ShippingStageKey` แล้ว ค่าที่ไม่มีในตารางจึงเป็น compile error ไม่ใช่จุดแรกเงียบ ๆ
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { Icon } from '@iconify/react'

import { SHIPMENT_STAGES } from '@/lib/iship/status'
import { ORDER_STAGE_META, SHIPMENT_STAGE_DOT_INDEX, type ShippingStageKey } from '@/lib/order-stage'

type Props = {
  stage: ShippingStageKey
  /**
   * มีพัสดุจริงไหม — ออเดอร์ที่จบโดยไม่เคยมีพัสดุ (รับเอง/บริการ) ได้ stage `DONE` เหมือนกัน
   * ถ้าไม่กันไว้จะวาดแถบเขียวครบ 4 จุดให้พัสดุที่ไม่มีอยู่จริง
   */
  hasShipment: boolean
}

export default function ParcelTimeline({ stage, hasShipment }: Props) {
  const current = SHIPMENT_STAGE_DOT_INDEX[stage]

  // ยังไม่มีพัสดุให้วาด — ไม่ใช่ error แค่ยังไม่ถึงเวลา
  if (current == null || !hasShipment) return null

  const problem = stage === 'PROBLEM'

  // ป้ายของจุดที่ยืนอยู่ — current เป็น 4 ได้ (เลยจุดสุดท้าย) จึง clamp ก่อนอ่านป้าย
  const currentLabel = problem
    ? ORDER_STAGE_META.PARCEL_PROBLEM.label
    : SHIPMENT_STAGES[Math.min(current, SHIPMENT_STAGES.length - 1)].label

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
      {/* role="img" + ชื่อ — จุดสี 4 จุดสื่อความหมายด้วยสีล้วน ผู้ใช้ screen reader
          จะไม่ได้ยินสถานะพัสดุเลยถ้าไม่มีชื่อกำกับ (ฝั่งร้านทำแบบนี้อยู่แล้ว) */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start' }} role='img' aria-label={`สถานะพัสดุ: ${currentLabel}`}>
        {SHIPMENT_STAGES.map((step, i) => {
          const done = i < current
          const isCurrent = i === current && !problem

          return (
            <Box key={step.label} sx={{ flex: 1, textAlign: 'center', position: 'relative' }}>
              {i > 0 && (
                <Box
                  aria-hidden
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
                aria-hidden
                sx={{
                  position: 'relative',
                  zIndex: 1,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  mx: 'auto',
                  mb: 0.75,
                  bgcolor:
                    problem && i === current
                      ? 'error.main'
                      : done
                        ? 'success.main'
                        : isCurrent
                          ? 'primary.main'
                          : 'divider',
                  boxShadow: isCurrent ? (theme) => `0 0 0 4px ${theme.palette.primary.main}22` : 'none',
                }}
              />
              <Typography
                variant='caption'
                sx={{
                  display: 'block',
                  lineHeight: 1.35,
                  fontWeight: isCurrent || done ? 700 : 400,
                  // 🛑 ไม่ใช่ text.disabled (2.30:1 — ต่ำกว่าเกณฑ์ AA มาก) และไม่ตั้ง fontSize เอง
                  // ของเดิมเป็น 0.66rem (~10.5px) ซึ่งไม่มีอยู่ใน type ramp ของ DESIGN.md เลย
                  // ป้ายพวกนี้คือสถานะพัสดุ ไม่ใช่ของประดับ — ต้องอ่านออกบนมือถือกลางแดด
                  color: isCurrent ? 'primary.main' : done ? 'success.dark' : 'text.secondary',
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
