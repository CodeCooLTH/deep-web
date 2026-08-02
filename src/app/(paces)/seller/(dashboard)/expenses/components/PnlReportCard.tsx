'use client'

/**
 * PnlReportCard — รายงานกำไรขาดทุน (P&L) — feature 00016
 *
 * v4 (2026-08-02, re-source ตาม safepay-ux): การ์ด 5 ใบ **ขนาดเท่ากันทั้งหมด**
 * Base: src/app/(paces)/seller/(dashboard)/products/page.tsx:181 (in-app precedent ที่ใช้ grid
 *   เดียวกับธีมเป๊ะ: `grid-cols-1 gap-1.25 md:grid-cols-2 lg:grid-cols-5`)
 * โครงการ์ด: src/app/(paces)/seller/(dashboard)/products/components/ProductStats.tsx
 *   แถว 1 หัวข้อ · แถว 2 chip + <h3 text-xl> + badge %change ชิดขวา · แถว 3 จุดสี + metric + ค่า
 *
 * v3 เคยทำการ์ด "พระเอก" ที่ใหญ่กว่าใบอื่น (`md:col-span-2 lg:row-span-2`) — **เป็นของที่ประดิษฐ์เอง
 * ไม่มีใน theme ที่ไหนเลย** และผลจริงคือเหลือพื้นที่ว่างครึ่งการ์ดกับกริดที่ไม่สมมาตร
 * ตอนนี้ "พระเอก" มาจาก **ลำดับการอ่าน** (กำไรสุทธิเป็นการ์ดแรก) ไม่ใช่ขนาดกล่อง
 *
 * ไม่ fetch เอง ไม่ถือ state ช่วงเวลาเอง — รับ report/expenses มาจาก ExpenseWorkspace
 * ไม่ใช้ CountUp — DESIGN.md §Motion ห้าม choreography ตอนโหลดฝั่ง product
 */
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatBaht, profitDisplay, NET_PROFIT_FORMULA, pctChangeVsPrev } from '@/lib/format-money'
import { EXPENSE_CATEGORY_LABEL_TH, groupExpensesByCategory } from '@/lib/expense'
import type { SerializedExpense } from '@/services/expense.service'
import type { PnlReport } from '@/services/pnl.service'

const CALC_NOTE = `คิดจากออเดอร์ที่ลูกค้ายืนยันรับของแล้วเท่านั้น · ${NET_PROFIT_FORMULA}`

type Props = {
  report: PnlReport
  /** รายการในช่วงเดียวกัน — ใช้หา "หมวดที่จ่ายมากสุด" ของการ์ดค่าใช้จ่าย */
  expenses: SerializedExpense[]
  loading?: boolean
  /** ข้อความช่วงเวลาสั้น ๆ ต่อท้ายหัวข้อการ์ดแรก เช่น "30 วันล่าสุด" */
  rangeLabel: string
}

export default function PnlReportCard({ report, expenses, loading = false, rangeLabel }: Props) {
  const profit = profitDisplay(report.netProfit)
  const topCategory = groupExpensesByCategory(expenses)[0]
  const pct = (v: number) => `${v.toFixed(1)}%`

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-1.25 transition-opacity md:grid-cols-2 lg:grid-cols-5',
        loading && 'opacity-50',
      )}
    >
      {/* การ์ดแรก = คำตอบของหน้า — เด่นด้วยลำดับการอ่าน ไม่ใช่ขนาด */}
      <StatCard
        icon={profit.positive ? 'trending-up' : 'trending-down'}
        iconClass={profit.positive ? 'bg-success/15 text-success-ink' : 'bg-danger/15 text-danger-ink'}
        title={`${profit.label} · ${rangeLabel}`}
        note={CALC_NOTE}
        text={profit.text}
        valueClass={profit.toneClass}
        changePercent={pctChangeVsPrev(report.netProfit, report.prevNetProfit)}
        bulletClass={profit.positive ? 'text-success' : 'text-danger'}
        metric="อัตรากำไรสุทธิ"
        metricValue={report.revenue > 0 ? pct((report.netProfit / report.revenue) * 100) : 'ยังไม่มียอดขาย'}
      />
      <StatCard
        icon="cash"
        iconClass="bg-success/15 text-success-ink"
        title="ยอดขายที่ยืนยันแล้ว"
        text={formatBaht(report.revenue)}
        valueClass="text-success-ink"
        changePercent={pctChangeVsPrev(report.revenue, report.prevRevenue)}
        bulletClass="text-success"
        metric="จากออเดอร์สำเร็จ"
        metricValue={`${report.orderCount.toLocaleString('th-TH')} ออเดอร์`}
      />
      <StatCard
        icon="package"
        iconClass="bg-default-200 text-default-700"
        title="ต้นทุนสินค้า"
        text={formatBaht(report.cogs)}
        valueClass="text-default-800"
        // ต้นทุนเพิ่มขึ้นไม่ใช่ข่าวดี — invert ทิศทางสีก่อนส่งเข้า badge
        changePercent={pctChangeVsPrev(report.cogs, report.prevCogs, true)}
        changeHint="เทียบช่วงก่อนหน้า — ต้นทุนลดลงคือดีขึ้น"
        bulletClass="text-default-700"
        metric="เฉลี่ยต่อออเดอร์"
        metricValue={report.orderCount > 0 ? formatBaht(report.cogs / report.orderCount) : 'ยังไม่มีออเดอร์'}
      />
      <StatCard
        icon="calculator"
        iconClass="bg-info/15 text-info-ink"
        title="กำไรก่อนหักค่าใช้จ่าย"
        text={formatBaht(report.grossProfit)}
        valueClass={report.grossProfit >= 0 ? 'text-success-ink' : 'text-danger-ink'}
        changePercent={pctChangeVsPrev(report.grossProfit, report.prevGrossProfit)}
        bulletClass="text-info"
        metric="อัตรากำไรขั้นต้น"
        metricValue={report.revenue > 0 ? pct((report.grossProfit / report.revenue) * 100) : 'ยังไม่มียอดขาย'}
      />
      <StatCard
        icon="receipt"
        iconClass="bg-danger/15 text-danger-ink"
        title="ค่าใช้จ่าย"
        text={formatBaht(report.totalExpense)}
        valueClass="text-danger-ink"
        // ค่าใช้จ่ายเพิ่มขึ้นไม่ใช่ข่าวดีเช่นกัน
        changePercent={pctChangeVsPrev(report.totalExpense, report.prevExpense, true)}
        changeHint="เทียบช่วงก่อนหน้า — ค่าใช้จ่ายลดลงคือดีขึ้น"
        bulletClass="text-danger"
        metric="หมวดที่จ่ายมากสุด"
        metricValue={topCategory ? EXPENSE_CATEGORY_LABEL_TH[topCategory.category] : 'ยังไม่มีรายการ'}
      />
    </div>
  )
}

/**
 * StatCard — โครง 3 แถวของ ProductStats.tsx ครบทุกแถว
 *
 * สี chip/จุดสี **ไม่ทำตามธีมตรง ๆ** — ธีม demo ไล่สี primary/secondary/success/info/warning
 * เพื่อแยกการ์ดด้วยตาเฉย ๆ ไม่มีความหมายผูกกับตัวเลข แต่ของเรามีความหมายจริง
 * (เขียว = เงินเข้า, แดง = เงินออก, เทา = เป็นกลาง, ฟ้า = ค่าที่คำนวณมา)
 * ทาสีตามลำดับของธีมเมื่อไหร่ = สีสื่อความหมายผิดทันที — Impeccable ชนะธีมในเรื่องสี
 */
function StatCard({
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
}: {
  icon: string
  iconClass: string
  title: string
  /** คำอธิบายเพิ่ม — โผล่เป็นไอคอน (i) ข้างหัวข้อ อ่านตอน hover/แตะค้าง
   *  ไม่ใช้ toggle กางข้อความแล้ว เพราะการ์ดต้องสูงเท่ากันทั้งแถว กางเมื่อไหร่จะดันทั้งแถว */
  note?: string
  text: string
  valueClass: string
  /** null = ไม่มีฐานให้เทียบ → ซ่อน badge ทั้งก้อน ไม่โชว์ 0% หลอกตา */
  changePercent: number | null
  /** อธิบายทิศทาง badge เมื่อใบนั้น invert — กัน "-5%" ที่แปลได้สองทาง */
  changeHint?: string
  bulletClass: string
  metric: string
  metricValue: string
}) {
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
