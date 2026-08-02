'use client'

/**
 * PnlReportCard — รายงานกำไรขาดทุน (P&L) — feature 00016
 *
 * v3 (2026-08-02): แตกจาก "การ์ดเดียวคั่นเส้นประ" เป็น **การ์ดแยกใบ** แบบหน้าสินค้า
 * และย้ายคำอธิบายสูตรจากบล็อกข้อความท้ายการ์ด → ไอคอน (i) ข้างหัวข้อ (hover บนเดสก์ท็อป /
 * แตะกางบนมือถือ) เหตุผล: บล็อกข้อความกินพื้นที่ถาวรทั้งที่ผู้ใช้อ่านครั้งเดียวก็พอ
 *
 * ไม่ fetch เอง ไม่ถือ state ช่วงเวลาเอง — รับ report/loading มาจาก ExpenseWorkspace
 * ไม่ใช้ CountUp — DESIGN.md §Motion ห้าม choreography ตอนโหลดฝั่ง product และระหว่างไล่เลข
 * จอจะแสดงจำนวนเงินที่ไม่เคยมีอยู่จริงบนหน้าที่เดิมพันกับความแม่นของตัวเลข
 *
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductStats.tsx
 *   (card > card-body > card-title text-sm + แถว icon chip กลม size-9 + <h3 text-xl> + badge ms-auto)
 *   เหตุผลที่ตัดแถว 3 ของ ProductStats ออก อยู่ใน comment เหนือ StatCard ด้านล่าง
 * missing-cost banner: src/app/(paces)/seller/(dashboard)/inventory/components/PackageSelector.tsx
 */
import { useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatBaht, profitDisplay, NET_PROFIT_FORMULA, pctChangeVsPrev } from '@/lib/format-money'
import type { PnlReport } from '@/services/pnl.service'

const CALC_NOTE = `คิดจากออเดอร์ที่ลูกค้ายืนยันรับของแล้วเท่านั้น · ${NET_PROFIT_FORMULA}`

type Props = {
  report: PnlReport
  loading?: boolean
  /** ข้อความช่วงเวลาสั้น ๆ ต่อท้ายหัวข้อ เช่น "30 วันล่าสุด" */
  rangeLabel: string
}

export default function PnlReportCard({ report, loading = false, rangeLabel }: Props) {
  const profit = profitDisplay(report.netProfit)
  const [noteOpen, setNoteOpen] = useState(false)

  /**
   * %เปลี่ยนแปลงเทียบช่วงก่อนหน้า — แสดงเมื่อ "เทียบแล้วอ่านรู้เรื่อง" เท่านั้น:
   *   - prevNetProfit == null → ช่วงก่อนหน้าไม่มีข้อมูลเลย ไม่มีฐานให้เทียบ
   *   - prevNetProfit <= 0 → ฐานติดลบ/ศูนย์ เปอร์เซ็นต์อ่านกลับหัว (ขาดทุนน้อยลงกลายเป็นติดลบ)
   */
  const changePercent = pctChangeVsPrev(report.netProfit, report.prevNetProfit)

  return (
    <div className={cn('grid gap-1.25 transition-opacity md:grid-cols-2 lg:grid-cols-4', loading && 'opacity-50')}>
      {/* การ์ดพระเอก — กินสองช่องบนจอกว้าง ให้ตัวเลขคำตอบเด่นกว่าที่มาของมัน */}
      <div className="card md:col-span-2 lg:row-span-2">
        <div className="card-body">
          <div className="mb-2 flex items-center gap-1.5">
            <h5 className="card-title text-sm">
              {profit.label} · {rangeLabel}
            </h5>
            {/* (i) — เดสก์ท็อป hover อ่านจาก title; มือถือแตะเพื่อกาง (จอสัมผัส hover ไม่ได้) */}
            <button
              type="button"
              onClick={() => setNoteOpen((v) => !v)}
              title={CALC_NOTE}
              aria-expanded={noteOpen}
              aria-label="วิธีคำนวณกำไรสุทธิ"
              className="text-default-700 hover:text-primary inline-flex"
            >
              <Icon icon="info-circle" className="text-base" />
            </button>
          </div>

          <div className="my-5 flex items-center gap-2.5">
            <div
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full',
                profit.positive ? 'bg-success/15 text-success-ink' : 'bg-danger/15 text-danger-ink',
              )}
            >
              <Icon icon={profit.positive ? 'trending-up' : 'trending-down'} className="text-2xl" />
            </div>
            <h3 className={cn('text-2xl font-bold', profit.toneClass)}>{profit.text}</h3>
            {changePercent != null && (
              <span
                className={cn(
                  'badge ms-auto py-0 text-xs font-medium',
                  changePercent >= 0 ? 'bg-success/15 text-success-ink' : 'bg-danger/15 text-danger-ink',
                )}
              >
                {changePercent >= 0 ? '+' : ''}
                {changePercent}%
              </span>
            )}
          </div>

          {noteOpen && (
            <p className="text-default-700 border-default-300 border-t border-dashed pt-2.5 text-xs">{CALC_NOTE}</p>
          )}

          {report.hasMissingCost && (
            <div
              role="alert"
              aria-live="polite"
              className="border-warning/20 bg-warning/10 text-warning-ink mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-start text-xs font-medium"
            >
              <Icon icon="alert-triangle" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                กำไรที่แสดงสูงกว่าความจริง — มีสินค้าที่ยังไม่ได้ใส่ต้นทุนในช่วงนี้{' '}
                <Link href="/products" className="font-semibold underline">
                  ใส่ต้นทุนตอนนี้ →
                </Link>
              </span>
            </div>
          )}
        </div>
      </div>

      <StatCard
        icon="cash"
        iconClass="bg-success/15 text-success-ink"
        title="ยอดขายที่ยืนยันแล้ว"
        value={report.revenue}
        valueClass="text-success-ink"
        changePercent={pctChangeVsPrev(report.revenue, report.prevRevenue)}
      />
      <StatCard
        icon="package"
        iconClass="bg-default-200 text-default-700"
        title="ต้นทุนสินค้า"
        value={report.cogs}
        valueClass="text-default-800"
        changePercent={pctChangeVsPrev(report.cogs, report.prevCogs)}
      />
      <StatCard
        icon="calculator"
        iconClass="bg-info/15 text-info-ink"
        title="กำไรก่อนหักค่าใช้จ่าย"
        value={report.grossProfit}
        valueClass={report.grossProfit >= 0 ? 'text-success-ink' : 'text-danger-ink'}
        changePercent={pctChangeVsPrev(report.grossProfit, report.prevGrossProfit)}
      />
      <StatCard
        icon="receipt"
        iconClass="bg-danger/15 text-danger-ink"
        title="ค่าใช้จ่าย"
        value={report.totalExpense}
        valueClass="text-danger-ink"
        changePercent={pctChangeVsPrev(report.totalExpense, report.prevExpense)}
      />
    </div>
  )
}

/**
 * StatCard — Base: products/components/ProductStats.tsx (แถว 2: chip + <h3 text-xl> + badge ms-auto)
 *
 * แถว 1 (ไอคอน external-link) และแถว 3 (จุดสี+metric+ค่า) ของ ProductStats ถูกตัดทั้ง 4 ใบเท่ากัน
 * ตาม precedent ของ ProductStats ในแอปเองที่ตัดแถว 1 ทิ้งด้วยเหตุผลเดียวกัน ("ไม่มี destination
 * ที่ชัดเจน") — เหตุผลที่ตัดแถว 3: ไม่มี metric รองที่ไม่ซ้ำข้อมูลอื่นบนหน้าเดียวกันครบทั้ง 4 ใบ
 * (เช่นการ์ด "ค่าใช้จ่าย" → เฉลี่ยต่อวัน/สัดส่วนต่อรายได้ ซ้ำกับท้าย ExpenseBreakdownCard ที่อยู่
 * ในสายตาเดียวกัน) ตัดทั้งกลุ่มเท่ากันดีกว่ามีบางใบ — การ์ดในกลุ่มเดียวกันต้องหน้าตาเหมือนกัน
 */
function StatCard({
  icon,
  iconClass,
  title,
  value,
  valueClass,
  changePercent,
}: {
  icon: string
  iconClass: string
  title: string
  value: number
  valueClass: string
  /** null = ไม่มีฐานให้เทียบ → ซ่อน badge ทั้งก้อน ไม่โชว์ 0% หลอกตา */
  changePercent: number | null
}) {
  return (
    <div className="card">
      <div className="card-body">
        <h5 className="card-title text-sm" title={title}>
          {title}
        </h5>
        <div className="mt-4 flex items-center gap-2.5">
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', iconClass)}>
            <Icon icon={icon} className="text-2xl" />
          </div>
          <h3 className={cn('text-xl font-semibold', valueClass)}>{formatBaht(value)}</h3>
          {changePercent != null && (
            <span
              className={cn(
                'badge ms-auto py-0 text-xs font-medium',
                changePercent >= 0 ? 'bg-success/15 text-success-ink' : 'bg-danger/15 text-danger-ink',
              )}
            >
              {changePercent >= 0 ? '+' : ''}
              {changePercent}%
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
