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
   * ปุ่มบันทึก "กดได้เสมอ" — ไม่ผูก disabled กับความครบของฟอร์ม (user report prod 2026-08-07:
   * "ปุ่มบันทึกกดไม่ได้ มัน disabled ตลอด")
   *
   * เดิมปิดปุ่มเมื่อยังไม่มีรายการสินค้า ซึ่งกลายเป็นทางตัน: ผู้ใช้ที่ยังไม่รู้ว่าต้องแตะแถว
   * สินค้าก่อน จะเห็นปุ่มหลักสีจางกดไม่ได้ โดยไม่มีอะไรบอกว่าขาดอะไร — และข้อความ
   * "ต้องมีสินค้าอย่างน้อย 1 รายการ" ที่ render ไว้แล้วทั้ง 2 ฝั่ง (QuickForm/CartPanel)
   * ไม่มีทางถูกเห็นเลย เพราะมันเกิดตอน validate ซึ่งต้องกด submit ก่อน
   *
   * ฟิลด์บังคับอื่นทุกตัวในฟอร์มนี้ (ชื่อ/เบอร์ลูกค้า/ที่อยู่จัดส่ง) ใช้แพตเทิร์น validate-แล้ว-บอก
   * อยู่แล้ว (toast + ช่องแดง + accordion กางเอง) — items เป็นตัวเดียวที่ทำต่างออกไป
   *
   * กดซ้ำรัว ๆ ไม่ต้องกัน: SubmitStatusSheet เป็น overlay เต็มจอทันทีที่เริ่มส่ง
   */

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
            <span>ยอดรวมรายการ</span>
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
        className="btn inline-flex min-h-11 w-full items-center justify-center gap-2 bg-primary font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
      >
        <Icon icon="device-floppy" className="text-lg" />
        บันทึก{orderNoun}
      </button>
    </div>
  )
}
