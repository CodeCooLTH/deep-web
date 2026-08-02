'use client'

/**
 * PacesStatCard — การ์ดสถิติ 3 แถวตามธีม Paces ใช้ร่วมกันทั้ง /expenses และ /sales
 *
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductStats.tsx
 *   ซึ่ง copy มาจาก theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products/
 *   components/ProductStats.tsx อีกที
 *   แถว 1 หัวข้อ · แถว 2 chip กลม size-9 + <h3 text-xl> + badge %change ชิดขวา
 *   แถว 3 จุดสี (circle-filled) + ชื่อ metric ... ค่า metric ชิดขวา
 *
 * ทำไมไม่ import `ProductStats` ตรง ๆ: prop `change` ของมันเป็น `number` บังคับ (แสดง badge เสมอ)
 * แต่รายงานการเงินมีกรณี "ไม่มีฐานให้เทียบ" ที่ต้องซ่อน badge ทั้งก้อน ไม่ใช่โชว์ 0% หลอกตา
 * — โครง markup ทุกแถวยังเหมือนต้นฉบับเป๊ะ ต่างแค่ `change` เป็น nullable
 *
 * ก่อนหน้านี้มีการ์ดที่เขียนเองซ้ำกัน 2 ตัว (`StatCard` ใน PnlReportCard และ `SummaryCard`
 * ใน SalesChart) ทั้งคู่ตัดแถว 3 กับ badge ทิ้ง — รวมเหลือตัวเดียวที่นี่ (2026-08-02)
 *
 * สี chip/จุดสี **ไม่ไล่ตามลำดับของธีม** — ธีม demo ไล่สี primary/secondary/success/info/warning
 * เพื่อแยกการ์ดด้วยตาเฉย ๆ ไม่มีความหมายผูกกับตัวเลข แต่รายงานการเงินมีความหมายจริง
 * (เขียว = เงินเข้า, แดง = เงินออก, เทา = เป็นกลาง, ฟ้า = ค่าที่คำนวณมา)
 * ทาสีตามลำดับเมื่อไหร่ = สีสื่อความหมายผิดทันที — Impeccable ชนะธีมในเรื่องสี
 */
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'

export type PacesStatCardProps = {
  icon: string
  /** คลาสพื้น+สีของ chip เช่น 'bg-success/15 text-success-ink' */
  iconClass: string
  title: string
  /** คำอธิบายเพิ่ม — โผล่เป็นไอคอน (i) ข้างหัวข้อ อ่านตอน hover/แตะค้าง
   *  ไม่ใช้ toggle กางข้อความ เพราะการ์ดต้องสูงเท่ากันทั้งแถว กางเมื่อไหร่จะดันทั้งแถว */
  note?: string
  /** ค่าที่ format แล้ว (เงิน/จำนวน/เปอร์เซ็นต์) — component นี้ไม่ format ให้ */
  text: string
  valueClass: string
  /** null = ไม่มีฐานให้เทียบ → ซ่อน badge ทั้งก้อน ไม่โชว์ 0% หลอกตา */
  changePercent: number | null
  /** อธิบายทิศทาง badge เมื่อใบนั้น invert — กัน "-5%" ที่แปลได้สองทาง */
  changeHint?: string
  bulletClass: string
  metric: string
  metricValue: string
}

export default function PacesStatCard({
  icon,
  iconClass,
  title,
  note,
  text,
  valueClass,
  changePercent,
  changeHint,
  bulletClass,
  metric,
  metricValue,
}: PacesStatCardProps) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="mb-2 flex items-center gap-1.5">
          <h5 className="card-title text-sm" title={title}>
            {title}
          </h5>
          {note && (
            <span className="text-default-700 shrink-0" title={note} aria-label={note}>
              <Icon icon="info-circle" className="text-base" />
            </span>
          )}
        </div>

        <div className="my-5 flex items-center gap-2.5">
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', iconClass)}>
            <Icon icon={icon} className="text-2xl" />
          </div>
          <h3 className={cn('text-xl font-semibold', valueClass)}>{text}</h3>
          {changePercent != null && (
            <span
              title={changeHint ?? 'เทียบช่วงก่อนหน้า'}
              className={cn(
                'badge ms-auto shrink-0 py-0 text-xs font-medium',
                changePercent >= 0 ? 'bg-success/15 text-success-ink' : 'bg-danger/15 text-danger-ink',
              )}
            >
              {changePercent >= 0 ? '+' : ''}
              {changePercent}%
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1">
            <span className={cn('flex items-center', bulletClass)}>
              <Icon icon="circle-filled" className="align-middle" />
            </span>
            <span className="text-default-700 truncate text-sm">{metric}</span>
          </span>
          <span className="shrink-0 font-semibold">{metricValue}</span>
        </div>
      </div>
    </div>
  )
}
