'use client'

/**
 * OrderSlip — ใบสลิปคำสั่งซื้อบนหน้า `/o/[token]` (feature 00068 · B4-L1 · TFR-008/009 · FR-BOP-10)
 *
 * หัว (noun · เลขเต็ม · วันที่ · คัดลอก/แชร์) · รายการ+รูป · ยอด · chip/3 บรรทัดร้านบริการ · ตราประทับ · ขอบฉีก
 *
 * 🛑 presentational ล้วน — เงินและป้ายทุกตัวมาจาก `buildSlipMoneyView` (prop `money`) · ไฟล์นี้ห้ามอ่าน
 * totalAmount/paymentConfirmedAt/status แล้วคิดเงื่อนไขเอง (เทส order-slip-source ดักไว้) ·
 * คำบนตราจาก `resolveStampLabel` · คำเอกสารจาก ORDER_VOCAB (ห้ามต่อสตริง — BR-BOP-03)
 *
 * 🛑 ขอบฉีก = `mask` ซึ่งตัด box-shadow ของ element ตัวเองทิ้ง (F6) ⇒ ห่อ 2 ชั้น:
 * ชั้นนอก `filter: drop-shadow` (ตามขอบฉีก) · ชั้นในใส่ `mask`. ขอบฉีกมีเฉพาะสลิปใบเดียวของหน้า
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/invoice/preview/PreviewCard.tsx (Card ใบเสร็จ)
 *   + SmsAutoEnter.tsx (mask ขอบฉีก)
 *   ขอบฉีกไม่มีในธีม — ท่า `mask` เดียวกับ SmsAutoEnter.tsx ที่ user อนุมัติ (ม็อกอัพ v5 `.slip`)
 */
import { useState } from 'react'

import Link from 'next/link'

import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'

import { buildSlipTotalLabel, resolveStampLabel, type SlipMoneyView } from '@/lib/buyer-order-summary'
import { formatDateTimeTH } from '@/lib/format-date'
import { formatBaht } from '@/lib/format-money'
import { resolveOrderVocab } from '@/lib/seller-menu'

import { cardBodySx } from './card-padding'
import ConfirmStamp from './ConfirmStamp'
import { ORDER_TWO_COL_MQ } from './content-width'
import TrustPill, { VERIFIED_INK } from './TrustPill'

export interface OrderSlipItem {
  id: string
  name: string
  description: string | null
  qty: number
  price: number
  imageUrl: string | null
}

export interface OrderSlipProps {
  /** เลขเต็มจาก `formatOrderNo()` */
  orderNo: string
  createdAtIso: string
  isServiceShop: boolean
  items: OrderSlipItem[]
  /** ใบที่ยกเลิก — รูปรายการจางลง */
  isCancelled: boolean
  /** จาก `buildSlipMoneyView` ตัวเดียว */
  money: SlipMoneyView
  /** ใบที่ปิดแล้ว — ตราประทับ · `null` = ยังไม่ปิด (ไม่จองโซนตรา) */
  confirmation: { byBuyer: boolean; atIso: string | null } | null
  /** พิลสถานะ — shell ส่งเฉพาะตอนไม่มี hero (ใบที่ปิดแล้ว) · `null` = ไม่แสดง */
  statusPill: { label: string; tierColor: string } | null
  /** ลิงก์ "ดูคำสั่งซื้อทั้งหมด" (แสดงเฉพาะ ≥861) · `null` = จอ guest ไม่มีบัญชี ไม่แสดง */
  allOrdersHref: string | null
}

/** รูปรายการ 56px รัศมี 8px (บันไดภาชนะของ DESIGN.md) · ไม่มีรูป = placeholder เดิม */
function ItemThumbnail({ imageUrl, name, grayscale }: { imageUrl: string | null; name: string; grayscale: boolean }) {
  return (
    <Avatar
      variant='rounded'
      src={imageUrl ?? undefined}
      alt={name}
      sx={{
        width: 56,
        height: 56,
        borderRadius: '8px',
        flexShrink: 0,
        bgcolor: 'action.hover',
        color: 'text.secondary',
        ...(grayscale ? { filter: 'grayscale(.4)', opacity: 0.75 } : {}),
      }}
    >
      <Icon icon='tabler-package' fontSize={24} />
    </Avatar>
  )
}

function ItemRow({ item, grayscale }: { item: OrderSlipItem; grayscale: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3 }}>
      <ItemThumbnail imageUrl={item.imageUrl} name={item.name} grayscale={grayscale} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500, lineHeight: 1.4 }}>{item.name}</Typography>
        {/* คำอธิบายตัดที่ 2 บรรทัด (AC-BOP-10-2) — ยาวเป็นย่อหน้าได้จริง */}
        {item.description && (
          <Typography
            color='text.secondary'
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              fontSize: '0.8125rem',
              lineHeight: 1.45,
            }}
          >
            {item.description}
          </Typography>
        )}
        <Typography color='text.secondary' sx={{ fontSize: '0.8125rem' }}>
          {item.qty} × {formatBaht(item.price)}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {formatBaht(item.qty * item.price)}
      </Typography>
    </Box>
  )
}

/** แถวเงินร้านบริการ: ป้ายซ้าย · ตัวเลขขวา */
function MoneyRow({
  label,
  amount,
  strong = false,
  tone = 'text.primary',
}: {
  label: string
  amount: number
  strong?: boolean
  tone?: string
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2 }}>
      <Typography sx={{ fontSize: '0.9375rem', fontWeight: strong ? 700 : 400, color: strong ? 'text.primary' : 'text.secondary' }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: strong ? '1.125rem' : '0.9375rem',
          fontWeight: strong ? 700 : 500,
          color: tone,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatBaht(amount)}
      </Typography>
    </Box>
  )
}

export default function OrderSlip({
  orderNo,
  createdAtIso,
  isServiceShop,
  items,
  isCancelled,
  money,
  confirmation,
  statusPill,
  allOrdersHref,
}: OrderSlipProps) {
  // เฉพาะสถานะ UI ของปุ่มคัดลอก (ไอคอนติ๊ก 2 วิ) — ไม่ใช่สถานะของออเดอร์
  const [copied, setCopied] = useState(false)
  const noun = resolveOrderVocab(isServiceShop ? 'SERVICE_QUEUE' : 'ONLINE_SALES').noun
  const count = items.length
  const totalLabel = buildSlipTotalLabel(money.totalLabel, count)
  const lines = money.serviceLines

  const copyOrderNo = async () => {
    try {
      await navigator.clipboard.writeText(orderNo)
      setCopied(true)
      toast.success(`คัดลอกเลข${noun}แล้ว`)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // บอกทางออกที่ทำได้จริง — เบราว์เซอร์ที่ปฏิเสธ clipboard จะปฏิเสธตลอด
      toast.error(`คัดลอกไม่สำเร็จ — กดค้างที่เลข${noun}เพื่อคัดลอกเองได้`)
    }
  }

  const shareLink = async () => {
    const url = window.location.href

    // ผู้ใช้กดยกเลิกแผงแชร์ = AbortError ไม่ใช่ความล้มเหลว — ห้ามขึ้นข้อความ
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Deep', text: orderNo, url })
      } catch {
        /* ยกเลิก */
      }

      return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success(`คัดลอกลิงก์${noun}แล้ว`)
    } catch {
      toast.error('คัดลอกลิงก์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    }
  }

  const iconButtonSx = { minWidth: 44, width: 44, height: 44, p: 0, borderRadius: '50%', color: 'text.secondary', flexShrink: 0 } as const

  return (
    // ชั้นนอก: drop-shadow ตามขอบฉีก — ค่าเงาพิเศษที่ธีมไม่มี token (หมึก #2F2B3D จาง ไม่ใช้ดำสนิท)
    <Box sx={{ filter: 'drop-shadow(0 2px 6px rgb(47 43 61 / 0.14))' }}>
      <Card
        sx={{
          borderRadius: '12px 12px 0 0',
          boxShadow: 'none', // shadow ของ Card ถูก mask ตัดอยู่แล้ว — เงาจริงอยู่ชั้นนอก
          pb: 3,
          // ขอบฉีก: ค่าพิเศษที่ธีมไม่มี (ท่าเดียวกับ SmsAutoEnter) — ครึ่งวงกลมซ้ำตามแนวนอนที่ขอบล่าง
          WebkitMask: 'radial-gradient(circle at 8px 100%, transparent 6.5px, #000 7px) 0 0 / 16px 100% repeat-x',
          mask: 'radial-gradient(circle at 8px 100%, transparent 6.5px, #000 7px) 0 0 / 16px 100% repeat-x',
        }}
      >
        {/* ── หัวสลิป ── */}
        <Box sx={{ ...cardBodySx, pb: 3, borderBottom: '1.5px dashed', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Typography component='h2' sx={{ fontSize: '0.9375rem', fontWeight: 500 }}>
              {noun}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <Typography color='text.secondary' sx={{ fontSize: '0.8125rem', textAlign: 'right' }}>
                {formatDateTimeTH(createdAtIso)}
              </Typography>
              {allOrdersHref && (
                <Button
                  component={Link}
                  href={allOrdersHref}
                  variant='text'
                  endIcon={<Icon icon='tabler-chevron-right' fontSize={16} />}
                  sx={{ display: 'none', minHeight: 44, fontWeight: 500, fontSize: '0.8125rem', flexShrink: 0, [ORDER_TWO_COL_MQ]: { display: 'inline-flex' } }}
                >
                  ดูคำสั่งซื้อทั้งหมด
                </Button>
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
            <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', wordBreak: 'break-all', minWidth: 0 }}>
              {orderNo}
            </Typography>
            <Button onClick={copyOrderNo} aria-label={`คัดลอกเลข${noun}`} sx={iconButtonSx}>
              <Icon icon={copied ? 'tabler-check' : 'tabler-copy'} fontSize={18} aria-hidden='true' />
            </Button>
            <Button onClick={shareLink} aria-label={`แชร์ลิงก์${noun}`} sx={iconButtonSx}>
              <Icon icon='tabler-share-2' fontSize={18} aria-hidden='true' />
            </Button>
            {statusPill && <TrustPill tone='tier' tierColor={statusPill.tierColor} label={statusPill.label} />}
          </Box>
        </Box>

        {/* ── รายการ (0 ชิ้น = ไม่มีข้อความ "ไม่มีรายการ" แสดงหัวกับยอดเลย) ── */}
        {count > 0 && (
          <Box sx={{ ...cardBodySx, pb: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {items.map((item, idx) => (
              <Box key={item.id}>
                {idx > 0 && <Divider sx={{ mb: 3 }} />}
                <ItemRow item={item} grayscale={isCancelled} />
              </Box>
            ))}
          </Box>
        )}

        {/* ── ยอด ── */}
        <Box sx={{ ...cardBodySx, pt: count > 0 ? 0 : 5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {count > 0 && <Divider sx={{ mb: 1.5 }} />}
          {lines ? (
            <>
              <MoneyRow label={totalLabel} amount={lines.total} />
              {lines.deposit && (
                <MoneyRow
                  label={lines.deposit.label}
                  amount={lines.deposit.amount}
                  tone={lines.deposit.received ? VERIFIED_INK : 'text.secondary'}
                />
              )}
              {lines.settled ? (
                // ชำระครบ: ป้ายอย่างเดียว + ไอคอนติ๊ก ไม่พิมพ์ ฿0 (R-9) · เขียวเพราะร้านยืนยันรับครบจริง
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: VERIFIED_INK }}>
                  <Icon icon='tabler-circle-check' fontSize={20} aria-hidden='true' />
                  <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: 'inherit' }}>{lines.outstandingLabel}</Typography>
                </Box>
              ) : (
                <MoneyRow label={lines.outstandingLabel} amount={lines.outstanding} strong />
              )}
            </>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Typography color='text.secondary' sx={{ fontSize: '0.9375rem' }}>
                {totalLabel}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {/* ป้ายรับเงินจาก getPaymentBadge-เงื่อนไขเดียวกัน (โทน info) — ห้ามคำว่า "ชำระแล้ว" */}
                {money.paidChip && <TrustPill tone='tier' tierColor='info' label={money.paidChip} />}
                <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatBaht(money.total)}
                </Typography>
              </Box>
            </Box>
          )}
        </Box>

        {/* ── โซนตราประทับ — จองที่เฉพาะเมื่อปิดแล้ว · ตราชิดขวา ไม่ absolute ทับเนื้อหา · ซ้ายว่างโดยตั้งใจ ── */}
        {confirmation && (
          <Box role='status' sx={{ minHeight: 96, display: 'flex', alignItems: 'flex-end' }}>
            <Box sx={{ flex: 1 }}>
              <ConfirmStamp label={resolveStampLabel(confirmation.byBuyer, isServiceShop)} atIso={confirmation.atIso} />
            </Box>
          </Box>
        )}
      </Card>
    </Box>
  )
}
