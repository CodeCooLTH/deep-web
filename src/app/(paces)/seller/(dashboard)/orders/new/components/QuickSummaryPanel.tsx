'use client'

/**
 * QuickSummaryPanel — footer sticky สรุปยอด (quick create < lg) collapsible
 * Base: mockup 2026-07-06-quick-create-order.html (frame footer .foot/.total) — ย่อ default, จิ้มกาง breakdown
 * HR7: fixed inset-x-0 bottom-0 = viewport-lock (precedent AuctionConsoleActionBar/QuickForm T3)
 */

import { useState } from 'react'
import { useWatch } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import type { FormValues } from './OrderCreateForm'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

interface Props {
  /** ชื่อของสิ่งนั้นตามประเภทกิจการ (feature 00030) — ไม่ส่ง = คำของ ONLINE_SALES */
  orderNoun?: string

  control: Control<FormValues>
  subtotal: number
  total: number
  formId?: string
  /** compact = ใช้ในโมดัลสร้างคำสั่งซื้อ (feature 00018): footer ติดล่างของโมดัล (sticky ในกล่อง scroll)
   *  แทน fixed viewport-bottom + แสดงทุกขนาดจอ (ไม่ lg:hidden) เพราะโมดัลบังคับ layout มือถือทุกจอ */
  compact?: boolean
}

export default function QuickSummaryPanel({ control, subtotal, total, formId, compact = false, orderNoun = 'คำสั่งซื้อ' }: Props) {
  const [expanded, setExpanded] = useState(false)
  const discount = (useWatch({ control, name: 'discount' }) as number | undefined) ?? 0
  const vatRate = (useWatch({ control, name: 'vatRate' }) as number | undefined) ?? 0
  const vatAmount = vatRate > 0 ? Math.round((subtotal - discount) * (vatRate / 100) * 100) / 100 : 0

  /**
   * guard ต้องเท่ากับฝั่งเดสก์ท็อป (CartPanel) — เดิมปุ่มนี้ไม่มี disabled เลย
   * ทำให้ guard ของอีกฝั่งแทบไม่มีความหมาย เพราะทั้งคู่อยู่ใน DOM พร้อมกันเสมอ
   * predicate ตรงกับ Yup transform (OrderCreateForm.tsx:167-169) — ห้ามเขียนกฎซ้ำ
   */
  const items = (useWatch({ control, name: 'items' }) ?? []) as {
    productId?: string | null
    name?: string
  }[]
  const filledCount = items.filter(
    (it) => it?.productId != null || (it?.name ?? '').toString().trim() !== '',
  ).length

  return (
    <div
      className={
        compact
          ? 'bg-card sticky bottom-0 z-40 border-t border-default-200 p-3'
          : 'fixed inset-x-0 bottom-0 z-40 border-t border-default-200 bg-card p-3 lg:hidden'
      }
    >
      {expanded && (
        <div className="mb-2 space-y-1 border-b border-default-100 pb-2 text-sm">
          <div className="flex justify-between text-default-500">
            <span>ยอดสินค้า</span>
            <span className="tabular-nums">{formatThb(subtotal)}</span>
          </div>
          <div className="flex justify-between text-default-500">
            <span>ส่วนลด</span>
            <span className="tabular-nums">-{formatThb(discount)}</span>
          </div>
          <div className="flex justify-between text-default-500">
            <span>VAT {vatRate > 0 ? `(${vatRate}%)` : ''}</span>
            <span className="tabular-nums">{formatThb(vatAmount)}</span>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mb-2 flex w-full items-center justify-between"
      >
        <span className="text-sm text-default-500">รวมทั้งสิ้น</span>
        <span className="inline-flex items-center gap-1.5 text-base font-bold text-default-900 tabular-nums">
          {formatThb(total)}
          <Icon icon={expanded ? 'chevron-up' : 'chevron-down'} className="size-4 text-default-400" />
        </span>
      </button>
      {/* min-h-11 = 44px touch target */}
      <button
        type="submit"
        form={formId}
        disabled={filledCount === 0}
        className="btn inline-flex min-h-11 w-full items-center justify-center gap-2 bg-primary font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
      >
        <Icon icon="device-floppy" className="text-lg" />
        บันทึก{orderNoun}
      </button>
    </div>
  )
}
