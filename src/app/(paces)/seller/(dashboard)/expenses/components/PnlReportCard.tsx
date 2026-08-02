'use client'

/**
 * PnlReportCard — รายงานกำไรขาดทุน (P&L) — feature 00016 (redesign)
 *
 * เปลี่ยนจากเดิม 2 อย่าง:
 *   1. ไม่ fetch เอง ไม่ถือ state ช่วงเวลาเอง — รับ report/loading มาจาก ExpenseWorkspace
 *      (ช่วงเวลาคุมทั้งหน้าแล้ว ไม่ใช่ของการ์ดนี้คนเดียว)
 *   2. "กำไรสุทธิ" ถูกยกขึ้นเป็นตัวเลขเดี่ยวขนาดใหญ่ทางซ้าย แทนที่จะเป็น 1 ใน 5 ช่องเท่า ๆ กัน —
 *      มันคือคำตอบของหน้านี้ ส่วนอีก 4 ตัวคือที่มาของคำตอบ
 *
 * Base:
 *   - stat row + เส้นประคั่น: src/app/(paces)/seller/(dashboard)/dashboard/components/SalesReport.tsx:161-194
 *   - missing-cost warning banner: src/app/(paces)/seller/(dashboard)/inventory/components/PackageSelector.tsx
 *     (role="alert" border-{semantic}/20 bg-{semantic}/10)
 *
 * Design Spec: docs/superpowers/specs/2026-08-02-expenses-redesign-design-spec.md §1A, §1C
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatBaht, profitDisplay } from '@/lib/format-money'
import type { PnlReport } from '@/services/pnl.service'

/**
 * ไม่ใช้ CountUp กับตัวเลขในหน้านี้ — DESIGN.md §Motion ห้าม choreography ตอนโหลดในฝั่ง product
 * และที่สำคัญกว่า: ระหว่างที่มันไล่เลข 1 วินาที จอแสดง "จำนวนเงินที่ไม่เคยมีอยู่จริง" บนหน้าที่
 * ทั้งฟีเจอร์เดิมพันกับความแม่นของตัวเลข (ตอนขาดทุนยิ่งแย่ — เห็นเลขไหลลงเป็นแอนิเมชัน)
 */

type Props = {
  report: PnlReport
  loading?: boolean
  /** ข้อความช่วงเวลาสั้น ๆ ต่อท้ายหัวข้อ เช่น "30 วันล่าสุด" */
  rangeLabel: string
}

export default function PnlReportCard({ report, loading = false, rangeLabel }: Props) {
  const profit = profitDisplay(report.netProfit)

  /**
   * %เปลี่ยนแปลงเทียบช่วงก่อนหน้า — แสดงเมื่อ "เทียบแล้วอ่านรู้เรื่อง" เท่านั้น:
   *   - prevNetProfit == null → ช่วงก่อนหน้าไม่มีข้อมูลเลย ไม่มีฐานให้เทียบ
   *   - prevNetProfit <= 0 → ฐานติดลบ/ศูนย์ เปอร์เซ็นต์อ่านกลับหัว (ขาดทุนน้อยลงกลายเป็นติดลบ)
   * ทั้งสองกรณีซ่อนตัวชี้วัดไปเลย ดีกว่าโชว์ตัวเลขที่ตีความผิดได้
   */
  const prev = report.prevNetProfit
  const changePercent =
    prev != null && prev > 0 ? Math.round(((report.netProfit - prev) / prev) * 1000) / 10 : null

  return (
    <div className="card">
      {/* lg: 1 ส่วนให้ตัวเลขพระเอก, 2 ส่วนให้ที่มาของมัน — ใช้ grid-cols-3 + col-span (primitive)
          แทน grid-cols-[minmax()] ที่เป็น arbitrary value ตาม Hard Rule 7 */}
      <div className="grid lg:grid-cols-3">
        <div
          className={cn(
            'border-default-300 border-b border-dashed p-5 transition-opacity lg:border-b-0 lg:border-e',
            loading && 'opacity-50',
          )}
        >
          {/* ป้าย/ข้อความ/สี มาจาก profitDisplay() ตัวเดียวกับที่ชีตและการ์ดหน้าหลักใช้ —
              ติดลบพูดว่า "ขาดทุน N" ไม่ใช่ "กำไรสุทธิ −N" ที่บังคับให้ผู้ใช้ตีความเครื่องหมายลบเอง */}
          <p className="text-default-700 mb-0.5 text-xs">{profit.label} · {rangeLabel}</p>
          <h3 className={cn('text-3xl font-bold', profit.toneClass)}>{profit.text}</h3>
          {changePercent != null && (
            <span
              className={cn(
                'badge mt-2 inline-flex items-center gap-1',
                changePercent >= 0 ? 'bg-success/15 text-success-ink' : 'bg-danger/15 text-danger-ink',
              )}
            >
              <Icon icon={changePercent >= 0 ? 'trending-up' : 'trending-down'} className="size-3.5" aria-hidden="true" />
              {changePercent >= 0 ? '+' : ''}
              {changePercent}% จากช่วงก่อนหน้า
            </span>
          )}
        </div>

        <div className={cn('transition-opacity lg:col-span-2', loading && 'opacity-50')}>
          <div className="grid grid-cols-2 md:grid-cols-4">
            <StatCell icon="cash" label="รายได้" value={report.revenue} colorClass="text-success-ink" />
            <StatCell icon="package" label="ต้นทุนสินค้า" value={report.cogs} colorClass="text-default-800" />
            <StatCell
              icon="calculator"
              label="กำไรขั้นต้น"
              value={report.grossProfit}
              colorClass={report.grossProfit >= 0 ? 'text-success-ink' : 'text-danger-ink'}
            />
            <StatCell icon="receipt" label="ค่าใช้จ่าย" value={report.totalExpense} colorClass="text-danger-ink" last />
          </div>
        </div>
      </div>

      {/* นิยามของ "รายได้" ที่นี่ = ออเดอร์ที่ลูกค้ากดยืนยันรับของแล้วเท่านั้น ไม่ใช่ทุกออเดอร์ที่ขายได้
          ต้องเขียนไว้ ไม่งั้นร้านที่ขายวันนี้ 10 ออเดอร์แต่ลูกค้ายืนยัน 2 จะเห็นรายได้ต่ำกว่าที่รู้สึก
          แล้วสรุปว่าตัวเลขในแอปเชื่อไม่ได้ (Design Spec §0.2 — surface อื่นมีบรรทัดนี้แล้ว) */}
      <p className="text-default-700 border-default-300 border-t border-dashed px-5 py-2.5 text-xs">
        คิดจากออเดอร์ที่ลูกค้ายืนยันรับของแล้วเท่านั้น · กำไรสุทธิ = รายได้ − ต้นทุนสินค้า − ค่าใช้จ่าย
      </p>

      {report.hasMissingCost && (
        <div className="px-5 pb-5">
          <div
            role="alert"
            aria-live="polite"
            className="border-warning/20 bg-warning/10 text-warning-ink flex items-start gap-2 rounded-lg border px-4 py-3 text-start text-sm font-medium"
          >
            <Icon icon="alert-triangle" className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <span>
              กำไรอาจไม่สมบูรณ์ — มีสินค้าที่ยังไม่ตั้งต้นทุนในช่วงนี้{' '}
              <Link href="/products" className="font-semibold underline">
                ตั้งต้นทุนตอนนี้ →
              </Link>
            </span>
          </div>
        </div>
      )}

    </div>
  )
}

function StatCell({
  icon,
  label,
  value,
  colorClass,
  last = false,
}: {
  icon: string
  label: string
  value: number
  colorClass: string
  last?: boolean
}) {
  return (
    <div
      className={cn(
        'border-default-300 border-b border-dashed p-4 text-center md:border-b-0',
        !last && 'md:border-e',
      )}
    >
      <p className="text-default-700 mb-1 flex items-center justify-center gap-1.5 text-xs">
        <Icon icon={icon} className="hidden text-base lg:inline" aria-hidden="true" />
        {label}
      </p>
      <p className={cn('font-semibold', colorClass)}>
        {formatBaht(value)}
      </p>
    </div>
  )
}
