'use client'

/**
 * ParcelTimeline — บล็อกพัสดุที่ผู้ซื้อเห็นบนหน้า `/o/[token]` (feature 00041, BR-BOE-12)
 *
 * Base: src/components/safepay/iship/ShipmentStatusView.tsx
 *   (หัวเรื่อง "โลโก้ขนส่ง + เลขพัสดุกดคัดลอก + ชื่อขนส่ง" และไทม์ไลน์ 4 ขั้นแบบไอคอนในวงกลม
 *   พร้อมเส้นเชื่อมซ้าย/ขวาที่โปร่งตรงหัว-ท้าย) — คือคอมโพเนนต์ฝั่งผู้ขายของเราเอง ไม่ใช่ของนอก
 *
 * 🛑 ยก **โครง/ภาษาการออกแบบ** มา แต่ **skin เป็นของ (marketing) = Vuexy/MUI**:
 * `(marketing)/layout.tsx` โหลด `marketing.css` ไม่ใช่ `@/assets/css/app.css` ⇒ utility ของ Paces
 * (`bg-primary` `text-default-900` `size-8`) **ไม่มีนิยามที่นี่** เขียนไปก็เงียบ ไม่มี error
 * ให้เห็น มีแต่กล่องไม่มีสี (docs/conventions/reference-vs-theme-source.md ข้อ "skin ตามธีมปัจจุบัน")
 *
 * 🛑 ป้ายทั้ง 4 ขั้นมาจาก `SHIPMENT_STAGES` และขั้นที่ไฮไลต์มาจาก `SHIPMENT_STAGE_DOT_INDEX`
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

import { useState } from 'react'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'

import { SHIPMENT_STAGES, describeProgress } from '@/lib/iship/status'
import { courierInitials, courierLogoUrl } from '@/lib/iship/courier'
import { SHIPMENT_STAGE_DOT_INDEX, SHIPPING_STAGE_LABEL, type ShippingStageKey } from '@/lib/order-stage'
import { VERIFIED_INK } from './TrustPill'

type Props = {
  stage: ShippingStageKey
  /**
   * สถานะล่าสุดจากขนส่ง — มีค่า = ใช้ `describeProgress()` **ตัวเดียวกับฝั่งร้าน** ตัดสิน
   * ขั้น/คำ/กล่องเตือน (BR-BOE-12 บังคับให้สองจอชี้จุดเดียวกัน) · null = ร้านแจ้งเลขเอง
   */
  carrierStatus?: string | null
  /**
   * มีพัสดุจริงไหม — ออเดอร์ที่จบโดยไม่เคยมีพัสดุ (รับเอง/บริการ) ได้ stage `DONE` เหมือนกัน
   * ถ้าไม่กันไว้จะวาดแถบเขียวครบ 4 จุดให้พัสดุที่ไม่มีอยู่จริง
   */
  hasShipment: boolean
  /**
   * ขนส่ง + เลขพัสดุ — บล็อกหัวเรื่องยกมาจาก `ShipmentStatusView`
   *
   * 🛑 `courierCode` มีเฉพาะพัสดุที่เปิดผ่าน iShip — ที่ร้านแจ้งเลขเอง (`ShipmentTracking`)
   * เก็บแต่ชื่อที่พิมพ์มา ไม่มีรหัส (docs/conventions/one-value-many-entry-points.md)
   * `courierLogoUrl` จับที่ระดับ *แบรนด์* จาก `${code} ${name}` จึงยังหาโลโก้เจอจากชื่อล้วน
   */
  tracking: { provider: string; trackingNo: string; courierCode?: string | null } | null
}

export default function ParcelTimeline({ stage, carrierStatus, hasShipment, tracking }: Props) {
  const [copied, setCopied] = useState(false)
  // ขนส่งบอกเองชนะกองงานที่ระบบจัดให้ — ดูเหตุผลเต็มที่ MiniShipmentTimeline ฝั่งร้าน
  const progress = carrierStatus != null ? describeProgress('CREATED', carrierStatus) : null
  const raw = progress ? progress.stage : SHIPMENT_STAGE_DOT_INDEX[stage]

  // ยังไม่มีพัสดุให้วาด / พัสดุถูกยกเลิก — ไม่ใช่ error แค่ไม่มีเส้นทางให้เล่า
  if (raw == null || raw < 0 || !hasShipment) return null
  const current = raw

  /**
   * สองกองที่อยู่ "นอกเส้นทางเดินหน้า" — ทั้งคู่ปักจุดรถแล้วบอกด้วยสี + กล่องเตือนใต้แถบ
   * ผู้ซื้อต้องเห็น "ตีกลับ" ด้วย ไม่ใช่แค่ "มีปัญหา": ของกำลังเดินทางกลับ/กลับถึงร้านแล้ว
   * ซึ่งเป็นข้อเท็จจริงที่เขาควรรู้ก่อนจะไปตามถามร้านว่าของอยู่ไหน · ข้อความในกล่องเตือนจึงไม่
   * ผูกกับ "กำลัง/แล้ว" (stage เดียวครอบทั้ง `return` และ `return_success` แยกไม่ได้จากตรงนี้)
   */
  const problem = progress ? progress.notice?.tone === 'danger' : stage === 'PROBLEM'
  const offTrack = progress ? Boolean(progress.notice) : stage === 'PROBLEM' || stage === 'RETURNED'
  const lastIndex = SHIPMENT_STAGES.length - 1

  /**
   * ขั้นที่ยืนอยู่ — `current` เป็น 4 ได้ (เลยจุดสุดท้ายไปแล้ว: ได้เงิน COD/จบงาน)
   * ต้อง clamp ก่อนเอาไปอ่านป้ายและก่อนตัดสินว่าป้ายไหนตัวหนา ไม่งั้นตอนจบงานจะไม่มีป้ายไหนเด่นเลย
   */
  const activeIndex = Math.min(current, lastIndex)

  /**
   * โทนของทั้งแถบ — ตามฝั่งร้าน: ถึงปลายทางแล้วเขียวทั้งแถบ ระหว่างทางเป็นสีหลักถึงจุดที่ไปถึง
   * "พัสดุมีปัญหา" **ไม่เปลี่ยนโทนทั้งแถบ** (ของยังเดินทางอยู่) — บอกด้วยจุดสีแดง + กล่องเตือน
   * ใต้แถบ เหมือน `progress.notice` ของ `ShipmentStatusView`
   */
  const delivered = current >= lastIndex
  const reachedFill = delivered ? VERIFIED_INK : 'primary.main'

  /** ขั้นสุดท้ายถูก override ได้ ("ส่งคืนสำเร็จ" ไม่ใช่ "จัดส่งสำเร็จ") — SSOT เดียวกับฝั่งร้าน */
  const stepLabel = (i: number) =>
    i === lastIndex ? (progress?.lastLabel ?? SHIPMENT_STAGES[i].label) : SHIPMENT_STAGES[i].label
  // คำมาจากชุดกลาง ห้ามพิมพ์เองที่นี่ (HR16)
  const currentLabel = progress
    ? stepLabel(activeIndex)
    : stage === 'PROBLEM' || stage === 'RETURNED'
      ? SHIPPING_STAGE_LABEL[stage]
      : SHIPMENT_STAGES[activeIndex].label

  const logo = tracking ? courierLogoUrl(tracking.courierCode, tracking.provider) : null

  const handleCopy = async () => {
    if (!tracking) return
    try {
      await navigator.clipboard.writeText(tracking.trackingNo)
      setCopied(true)
      toast.success('คัดลอกเลขพัสดุแล้ว')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard ต้องการ https — บนลิงก์ที่ไม่ใช่ https จะล้มเสมอ บอกทางออกที่ทำได้จริงบนมือถือ
      toast.error('คัดลอกไม่สำเร็จ — กดค้างที่เลขพัสดุเพื่อคัดลอกเองได้')
    }
  }

  return (
    <Box sx={{ mt: 1.5 }}>
      {tracking && (
        /* ── หัวเรื่อง: โลโก้ขนส่ง + เลขพัสดุ (กดคัดลอกได้) + ชื่อขนส่ง ──────────────
           เลขพัสดุเป็น "ปุ่มคัดลอก" ในตัวมันเอง ไม่ใช่ข้อความที่มีปุ่มแยกอยู่ข้าง ๆ — ตัวเลข
           คือสิ่งที่ตาไปหยุดและนิ้วไปแตะอยู่แล้ว (ยกท่าเดียวกับ ShipmentStatusView) */
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
          {logo ? (
            /* object-contain + เส้นขอบ: โลโก้พื้นขาวจะกลืนไปกับการ์ดขาวถ้าไม่มีขอบ
               (docs/conventions/user-supplied-image-assets.md)
               eslint-disable-next-line @next/next/no-img-element */
            <Box
              component='img'
              src={logo}
              /* alt ว่างโดยตั้งใจ: ชื่อขนส่งเป็นข้อความอยู่ติดกันแล้ว ใส่ alt ซ้ำ =
                 คนอ่านหน้าจอได้ยินชื่อขนส่งสองรอบ (โลโก้ตรงนี้ไม่ได้แบกข้อมูลเพิ่ม) */
              alt=''
              sx={{
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: 2,
                objectFit: 'contain',
                bgcolor: 'common.white',
                border: 1,
                borderColor: 'divider',
              }}
            />
          ) : (
            <Box
              aria-hidden
              sx={{
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'action.hover',
                color: 'text.secondary',
                fontSize: '0.8125rem',
                fontWeight: 700,
              }}
            >
              {courierInitials(tracking.provider, tracking.courierCode)}
            </Box>
          )}

          <Box sx={{ minWidth: 0, flex: 1 }}>
            <ButtonBase
              onClick={handleCopy}
              aria-label={`คัดลอกเลขพัสดุ ${tracking.trackingNo}`}
              sx={{
                maxWidth: '100%',
                gap: 0.75,
                px: 0.5,
                py: 0.25,
                ml: -0.5,
                borderRadius: 1,
                justifyContent: 'flex-start',
              }}
            >
              <Typography
                component='span'
                sx={{
                  // Title/h5 (1.125rem ≈ 18px) ของ ramp ใน DESIGN.md — ขั้นเดียวกับ `text-lg`
                  // ที่ ShipmentStatusView ใช้กับเลขพัสดุพอดี
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  lineHeight: 1.4,
                  fontVariantNumeric: 'tabular-nums',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {tracking.trackingNo}
              </Typography>
              <Box
                aria-hidden
                sx={{
                  width: 28,
                  height: 28,
                  flexShrink: 0,
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: copied ? VERIFIED_INK : 'action.hover',
                  color: copied ? 'common.white' : 'text.secondary',
                }}
              >
                <Icon icon={copied ? 'tabler-check' : 'tabler-copy'} fontSize={16} />
              </Box>
            </ButtonBase>
            <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
              {tracking.provider}
            </Typography>
          </Box>
        </Box>
      )}

      {/* role="img" + ชื่อ — วงกลม 4 วงสื่อความหมายด้วยสี/ไอคอน ผู้ใช้ screen reader
          จะไม่ได้ยินสถานะพัสดุเลยถ้าไม่มีชื่อกำกับ (ฝั่งร้านทำแบบนี้อยู่แล้ว) */}
      <Box
        component='ol'
        role='img'
        aria-label={`สถานะพัสดุ: ${currentLabel}`}
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          listStyle: 'none',
          m: 0,
          mt: tracking ? 2 : 0,
          p: 0,
        }}
      >
        {SHIPMENT_STAGES.map((step, i) => {
          const reached = i <= current
          const isCurrent = i === activeIndex
          // จุดที่ยืนอยู่ตอน "พัสดุมีปัญหา" เท่านั้นที่เป็นสีเตือน — จุดที่เดินผ่านมาแล้วยังเป็นปกติ
          const fill = offTrack && isCurrent ? (problem ? 'error.main' : 'warning.main') : reachedFill

          return (
            <Box
              component='li'
              key={step.label}
              sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                {/* เส้นเชื่อมซ้าย/ขวาของแต่ละจุด — ครึ่งซ้ายของจุดแรกและครึ่งขวาของจุดสุดท้าย
                    ต้องโปร่ง ไม่งั้นแถบจะยื่นเลยจุดปลายออกไปทั้งสองข้าง */}
                <Box
                  aria-hidden
                  sx={{
                    height: 2,
                    flex: 1,
                    bgcolor: i === 0 ? 'transparent' : reached ? reachedFill : 'divider',
                  }}
                />
                <Box
                  aria-hidden
                  sx={{
                    width: 32,
                    height: 32,
                    flexShrink: 0,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    // ขั้นที่ไปถึงแล้ว = วงทึบไอคอนขาว · ที่เหลือ = วงจางไอคอนเทา
                    bgcolor: reached ? fill : 'action.hover',
                    color: reached ? 'common.white' : 'text.secondary',
                  }}
                >
                  <Icon icon={step.icon} fontSize={18} />
                </Box>
                <Box
                  aria-hidden
                  sx={{
                    height: 2,
                    flex: 1,
                    bgcolor: i === lastIndex ? 'transparent' : i < current ? reachedFill : 'divider',
                  }}
                />
              </Box>
              <Typography
                variant='caption'
                sx={{
                  textAlign: 'center',
                  lineHeight: 1.3,
                  // 🛑 ไม่ใช้ text.disabled (2.30:1 — ตก AA ไปไกล) และไม่ตั้ง fontSize เอง
                  // ป้ายพวกนี้คือสถานะพัสดุ ไม่ใช่ของประดับ — ต้องอ่านออกบนมือถือกลางแดด
                  fontWeight: isCurrent ? 700 : 400,
                  color: isCurrent ? 'text.primary' : 'text.secondary',
                }}
              >
                {stepLabel(i)}
              </Typography>
            </Box>
          )
        })}
      </Box>

      {offTrack && (
        /* กล่องเตือนอยู่ "ใต้แถบ" ตำแหน่งเดียวกับ progress.notice ของ ShipmentStatusView —
           แถบบอกว่าของอยู่ไหน กล่องนี้บอกว่ามีอะไรผิดปกติ คนละคำถามกัน จึงไม่ยุบรวมเป็นบรรทัดเดียว
           สีตัวอักษรใช้ `.dark` (เฉดเดิม เข้มขึ้น) ไม่ใช่ `.main` บนพื้นจาง ซึ่งตก AA
           — docs/conventions/contrast-fix-keeps-hue.md */
        <Typography
          variant='caption'
          role='alert'
          sx={{
            mt: 2,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 0.75,
            px: 1.25,
            py: 1,
            borderRadius: 1,
            fontWeight: 600,
            color: problem ? 'error.dark' : 'warning.dark',
            bgcolor: problem
              ? 'rgb(var(--mui-palette-error-mainChannel) / 0.15)'
              : 'rgb(var(--mui-palette-warning-mainChannel) / 0.15)',
          }}
        >
          <Icon
            icon={problem ? 'tabler-alert-triangle' : 'tabler-arrow-back-up'}
            fontSize={16}
            style={{ flexShrink: 0, marginTop: 1 }}
          />
          {progress?.notice?.text ??
            (problem ? SHIPPING_STAGE_LABEL.PROBLEM : 'พัสดุถูกตีกลับไปยังร้านค้า')}
        </Typography>
      )}
    </Box>
  )
}
