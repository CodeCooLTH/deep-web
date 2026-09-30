'use client'

/**
 * PnlReportCard — รายงานกำไรขาดทุน (P&L) — feature 00016
 *
 * v4 (2026-08-02, re-source ตาม safepay-ux): การ์ด 5 ใบ **ขนาดเท่ากันทั้งหมด**
 * Base: src/app/(paces)/seller/(dashboard)/products/page.tsx:181 (in-app precedent ที่ใช้ grid
 *   เดียวกับธีมเป๊ะ: `grid-cols-1 gap-1.25 md:grid-cols-2 lg:grid-cols-5`)
 * โครงการ์ด: _shared/PacesStatCard.tsx (copy จาก products/components/ProductStats.tsx)
 *   ใช้ร่วมกับ /sales — ก่อนหน้านี้สองหน้ามีการ์ดที่เขียนเองคนละตัวและตัดแถวทิ้งทั้งคู่
 *
 * v3 เคยทำการ์ด "พระเอก" ที่ใหญ่กว่าใบอื่น (`md:col-span-2 lg:row-span-2`) — **เป็นของที่ประดิษฐ์เอง
 * ไม่มีใน theme ที่ไหนเลย** และผลจริงคือเหลือพื้นที่ว่างครึ่งการ์ดกับกริดที่ไม่สมมาตร
 * ตอนนี้ "พระเอก" มาจาก **ลำดับการอ่าน** (กำไรสุทธิเป็นการ์ดแรก) ไม่ใช่ขนาดกล่อง
 *
 * ไม่ fetch เอง ไม่ถือ state ช่วงเวลาเอง — รับ report/expenses มาจาก ExpenseWorkspace
 * ไม่ใช้ CountUp — DESIGN.md §Motion ห้าม choreography ตอนโหลดฝั่ง product
 */
import { cn } from '@/utils/helpers'
import Icon from '@/components/wrappers/Icon'
import { formatBaht, profitDisplay, netProfitFormula, pctChangeVsPrev } from '@/lib/format-money'
import { EXPENSE_CATEGORY_LABEL_TH, groupExpensesByCategory } from '@/lib/expense'
import type { SerializedExpense } from '@/services/expense.service'
import type { PnlReport } from '@/services/pnl.service'
import PacesStatCard from '../../_shared/PacesStatCard'

/**
 * "ยืนยันแล้ว" ไม่ใช่ "ยืนยันรับของแล้ว" (2026-08-07) — ร้านคิวงาน/บ้านพักไม่มีของให้รับ
 * คำนี้ถูกกับทุก vertical จึงไม่ต้องแตกประโยคเป็นชุด ๆ และไม่ต้องมีสาขาที่เทียบสตริง
 * (ตรรกะ `noun === 'ออเดอร์' ? A : B` จะเงียบเมื่อมีประเภทร้านที่สี่ — บทเรียน 00028)
 */
const calcNote = (orderNoun: string, costNoun: string) =>
  `คิดจาก${orderNoun}ที่ลูกค้ายืนยันแล้วเท่านั้น · ${netProfitFormula(costNoun)}`

type Props = {
  report: PnlReport
  /** รายการในช่วงเดียวกัน — ใช้หา "หมวดที่จ่ายมากสุด" ของการ์ดค่าใช้จ่าย */
  expenses: SerializedExpense[]
  loading?: boolean
  /** ข้อความช่วงเวลาสั้น ๆ ต่อท้ายหัวข้อการ์ดแรก เช่น "30 วันล่าสุด" */
  rangeLabel: string
  /** ชื่อของ "ใบ" ที่นับ/เฉลี่ย ผันตามประเภทกิจการ (ORDER_VOCAB.noun) */
  orderNoun?: string
  /**
   * true = ข้อมูลยังไม่ครบ (ยังไม่ตั้งราคาทุน หรือยังไม่มีรายการค่าใช้จ่ายในช่วงนี้)
   * ⇒ ตัวเลขที่แสดงเป็น **เพดานบน** ต้องเปลี่ยนคำและสีตาม `profitDisplay(n, { capped })`
   * ห้ามเรียกว่า "กำไรสุทธิ" (feature 00067 FR-FIN-10)
   *
   * default `false` = พฤติกรรมเดิมทุกประการ — หน้า /expenses ของ vertical อื่นไม่ถูกแตะ
   */
  capped?: boolean
  /**
   * คำเรียกต้นทุนของประเภทกิจการนี้ (ORDER_VOCAB.costNoun) — ร้านบริการอ่านว่า "ต้นทุนอะไหล่"
   * default 'ต้นทุนสินค้า' = คำเดิม จึงไม่กระทบผู้เรียกที่ยังไม่ส่งค่านี้มา
   */
  costNoun?: string
}

export default function PnlReportCard({
  report,
  expenses,
  loading = false,
  rangeLabel,
  orderNoun = 'ออเดอร์',
  capped = false,
  costNoun = 'ต้นทุนสินค้า',
}: Props) {
  const profit = profitDisplay(report.netProfit, { capped })
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
      <PacesStatCard
        icon={profit.icon}
        iconClass={
          capped
            ? profit.positive
              ? 'bg-warning/15 text-warning-ink'
              : 'bg-danger/15 text-danger-ink'
            : profit.positive
              ? 'bg-success/15 text-success-ink'
              : 'bg-danger/15 text-danger-ink'
        }
        title={`${profit.label} · ${rangeLabel}`}
        note={calcNote(orderNoun, costNoun)}
        text={profit.text}
        valueClass={profit.toneClass}
        changePercent={pctChangeVsPrev(report.netProfit, report.prevNetProfit)}
        bulletClass={capped ? (profit.positive ? 'text-warning' : 'text-danger') : profit.positive ? 'text-success' : 'text-danger'}
        metric="อัตรากำไรสุทธิ"
        /* ข้อมูลไม่ครบ = อัตราเป็นตัวเลขไม่ได้ — ร้านที่ไม่เคยตั้งต้นทุนเคยเห็น "100%" (user ทัก 2026-10-01) */
        metricValue={
          report.revenue <= 0
            ? 'ยังไม่มียอดขาย'
            : !capped
              ? pct((report.netProfit / report.revenue) * 100)
              : // บอกว่าขาดอะไร = บอกทางแก้ (ต้นทุนมาก่อน เพราะกระทบทั้งกำไรขั้นต้นและสุทธิ)
                report.hasMissingCost
                ? 'ตั้งต้นทุนไม่ครบ'
                : 'ยังไม่บันทึกค่าใช้จ่าย'
        }
      />
      <PacesStatCard
        icon="cash"
        iconClass="bg-success/15 text-success-ink"
        title="ยอดขายที่ยืนยันแล้ว"
        text={formatBaht(report.revenue)}
        valueClass="text-success-ink"
        changePercent={pctChangeVsPrev(report.revenue, report.prevRevenue)}
        bulletClass="text-success"
        metric={`จาก${orderNoun}สำเร็จ`}
        metricValue={`${report.orderCount.toLocaleString('th-TH')} ${orderNoun}`}
      />
      <PacesStatCard
        icon="package"
        iconClass="bg-default-200 text-default-700"
        title={costNoun}
        text={formatBaht(report.cogs)}
        valueClass="text-default-800"
        // ต้นทุนเพิ่มขึ้นไม่ใช่ข่าวดี — invert ทิศทางสีก่อนส่งเข้า badge
        changePercent={pctChangeVsPrev(report.cogs, report.prevCogs, true)}
        changeHint="เทียบช่วงก่อนหน้า — ต้นทุนลดลงคือดีขึ้น"
        bulletClass="text-default-700"
        metric={`เฉลี่ยต่อ${orderNoun}`}
        metricValue={report.orderCount > 0 ? formatBaht(report.cogs / report.orderCount) : `ยังไม่มี${orderNoun}`}
      />
      <PacesStatCard
        icon="calculator"
        iconClass="bg-info/15 text-info-ink"
        // ต้นทุนไม่ครบ = เพดานบน → คำ "ไม่เกิน" ชุดเดียวกับการ์ดกำไรสุทธิที่ capped และการ์ด /sales
        title={report.hasMissingCost && report.grossProfit >= 0 ? 'กำไรก่อนหักค่าใช้จ่ายไม่เกิน' : 'กำไรก่อนหักค่าใช้จ่าย'}
        text={formatBaht(report.grossProfit)}
        // ตั้งต้นทุนไม่ครบ = เพดานบน ห้ามเขียว (Verified-Means-Green) — สีเดียวกับการ์ดกำไรสุทธิที่ capped
        valueClass={report.grossProfit < 0 ? 'text-danger-ink' : report.hasMissingCost ? 'text-warning-ink' : 'text-success-ink'}
        changePercent={pctChangeVsPrev(report.grossProfit, report.prevGrossProfit)}
        bulletClass={report.hasMissingCost ? 'text-warning' : 'text-info'}
        metric="อัตรากำไรขั้นต้น"
        metricValue={
          report.revenue <= 0
            ? 'ยังไม่มียอดขาย'
            : report.hasMissingCost
              ? 'ตั้งต้นทุนไม่ครบ'
              : pct((report.grossProfit / report.revenue) * 100)
        }
      />
      <PacesStatCard
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

      {/* ค่าส่งขากลับของใบคืน (feature 00056) — อยู่ใน "ค่าใช้จ่าย" ข้างบนแล้ว แต่ไม่ได้อยู่ใน
          รายการที่ /expenses แสดง (มันคิดสดจากใบคืน ไม่ใช่แถว Expense) ⇒ ถ้าไม่บอกตรงนี้
          ร้านจะบวกรายการในตารางแล้วได้ไม่เท่ากับการ์ด แล้วเลิกเชื่อทั้งหน้า
          ขึ้นเฉพาะเมื่อมีจริง — ค่าตั้งต้นของระบบคือเงียบ */}
      {(report.returnShippingCost > 0 || report.returnShippingUnknownCount > 0) && (
        <p className="text-default-700 col-span-full mb-0 flex items-start gap-2 text-xs">
          <Icon icon="arrow-back-up" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
          <span>
            ในค่าใช้จ่ายรวมค่าส่งพัสดุขากลับของการคืนของ{' '}
            <span className="font-semibold">{formatBaht(report.returnShippingCost)}</span>
            {/* 🛑 ต้องบอกว่ายังไม่ครบ — ใบที่ยังไม่รู้ราคาถูกนับเป็น 0 ซึ่งหน้าตาเหมือน
                "ไม่มีค่าส่ง" ทุกประการ (partial-data-must-be-labeled-or-filled.md) */}
            {report.returnShippingUnknownCount > 0 && (
              <span className="text-warning-ink">
                {' '}
                · ยังไม่รู้ค่าส่งอีก {report.returnShippingUnknownCount} ใบ (รอขนส่งแจ้งราคา
                หรือกรอกเอง) ตัวเลขนี้จึงยังไม่ครบ
              </span>
            )}
          </span>
        </p>
      )}
    </div>
  )
}

