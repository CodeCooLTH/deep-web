'use client'

/**
 * FinancePanels — เนื้อหาแท็บ "กำไรขาดทุน" และ "ค่าใช้จ่าย" ในชีตการเงินบนหน้าหลัก
 * (feature 00067 FR-FIN-16)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/RevenueByLocation.tsx
 *   (แถวรายการ: จุดสี/ป้าย ซ้าย + ตัวเลขชิดขวา + เส้นประคั่น) ผ่าน precedent ในรีโป
 *   dashboard/components/SalesChartSheet.tsx::LegendCell ซึ่ง copy จากไฟล์เดียวกันมาก่อนแล้ว
 *
 * 🛑 **ตัวเลขกำไรที่นี่ต้องมาจาก `/api/expenses/report` เท่านั้น** = แหล่งเดียวกับหน้า
 * `/sales?tab=pnl` และการ์ด P&L ที่ `/expenses` เป๊ะ ๆ — ห้ามคำนวณเองจาก `series` ที่ชีตถืออยู่
 * เพราะ `series` คิดด้วยสูตรของหน้า `/sales` (ยอดขาย − ต้นทุน − ค่าส่ง) ซึ่ง **ไม่หักค่าใช้จ่ายร้าน**
 * ⇒ จะได้ตัวเลขที่เรียกตัวเองว่า "กำไร" ชุดที่สามของสิ่งเดียวกัน ซึ่งเป็นบั๊ก P0 เมื่อ 2026-08-08
 * และไม่มี gate อัตโนมัติตัวไหนจับได้เลย (Hard Rule 16)
 *
 * 🛑 โหลดตอนเปิดแท็บเท่านั้น (lazy) — คนที่เปิดชีตมาดูยอดเก็บเงินอย่างเดียวต้องไม่จ่ายค่า query นี้
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { formatNumberNoSymbol, profitDisplay, netProfitFormula } from '@/lib/format-money'
import { EXPENSE_CATEGORY_LABEL_TH, groupExpensesByCategory } from '@/lib/expense'
import { resolveDataCompleteness, shouldOfferCostSetup, shouldOfferExpenseSetup } from '@/lib/finance-tabs'
import type { SerializedExpense } from '@/services/expense.service'
import type { PnlReport } from '@/services/pnl.service'

type ReportPayload = PnlReport & {
  expenses: SerializedExpense[]
  coverage?: { soldItemCount: number; uncostedItemCount: number }
}

type Props = {
  tab: 'pnl' | 'expense'
  /** ช่วงเวลาที่ชีตกำลังแสดงอยู่ — รูปแบบ YYYY-MM-DD */
  start: string
  end: string
  /** คำเรียกต้นทุนของประเภทกิจการนี้ (ORDER_VOCAB.costNoun) */
  costNoun: string
}

export default function FinancePanels({ tab, start, end, costNoun }: Props) {
  const [data, setData] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)

  /**
   * โครงเดียวกับ ExpenseWorkspace.tsx — setState อยู่ใน async function ที่ effect เรียก
   * ไม่ใช่ในตัว effect ตรง ๆ (กฎ react-hooks/set-state-in-effect) และยกเลิกด้วย AbortController
   * ซึ่งตัดคำขอจริง ไม่ใช่แค่ทิ้งผลลัพธ์เหมือนธง `cancelled`
   */
  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      setLoading(true)
      setFailed(false)
      try {
        const qs = new URLSearchParams({ range: 'custom', start, end })
        const res = await fetch(`/api/expenses/report?${qs.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(String(res.status))
        setData((await res.json()) as ReportPayload)
      } catch (e) {
        // ยกเลิกเองตอน unmount/เปลี่ยนช่วง ไม่ใช่ความล้มเหลว — ห้ามขึ้นจอ error ให้ผู้ใช้เห็น
        if ((e as Error)?.name !== 'AbortError') setFailed(true)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void run()
    return () => controller.abort()
  }, [start, end, retry])

  if (loading) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Icon icon="loader-2" className="text-default-400 size-6 animate-spin" aria-hidden="true" />
        <span className="sr-only">กำลังโหลด</span>
      </div>
    )
  }

  if (failed || !data) {
    return (
      <div className="py-10 text-center">
        <p className="text-default-700 mb-3 text-sm">โหลดข้อมูลไม่สำเร็จ</p>
        <button
          type="button"
          onClick={() => setRetry((v) => v + 1)}
          className="btn bg-light text-dark min-h-11"
        >
          ลองใหม่
        </button>
      </div>
    )
  }

  const completeness = resolveDataCompleteness({
    hasMissingCost: data.hasMissingCost,
    expenseCount: data.expenses.length,
    uncostedItemCount: data.coverage?.uncostedItemCount ?? 0,
    soldItemCount: data.coverage?.soldItemCount ?? 0,
  })

  return tab === 'pnl' ? (
    <PnlPanel data={data} completeness={completeness} costNoun={costNoun} />
  ) : (
    <ExpensePanel data={data} costNoun={costNoun} />
  )
}

function PnlPanel({
  data,
  completeness,
  costNoun,
}: {
  data: ReportPayload
  completeness: ReturnType<typeof resolveDataCompleteness>
  costNoun: string
}) {
  const capped = !completeness.complete
  const profit = profitDisplay(data.netProfit, { capped })
  const margin = data.revenue > 0 ? (data.netProfit / data.revenue) * 100 : null

  return (
    <>
      {/* ตัวเลขใหญ่ — โครงเดียวกับ hero เดิมของชีต (ข้อความเล็กบน + เลข text-3xl ล่าง) */}
      <div className="mb-3 text-center">
        <p className="text-default-700 text-xs">{profit.label}</p>
        <p className={`text-3xl font-bold tabular-nums ${profit.toneClass}`}>
          {capped ? '≤ ' : ''}
          {formatNumberNoSymbol(Math.abs(data.netProfit))}
        </p>
        {margin != null && !capped && (
          <p className="text-default-700 mt-0.5 text-sm">อัตรากำไรสุทธิ {margin.toFixed(1)}%</p>
        )}
      </div>

      {capped && (
        <div className="bg-warning/15 mb-4 rounded p-3">
          <p className="text-warning-ink flex items-start gap-1.5 text-xs font-semibold">
            <Icon icon="alert-triangle" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ตัวเลขนี้ยังไม่ใช่กำไรจริง — ยังหักไม่ครบ ค่าจริงจะน้อยกว่านี้
          </p>
        </div>
      )}

      {/* แถบสมการ — ผู้ขายเอานิ้วไล่ลบตามได้จริง (แพตเทิร์นเดียวกับแถบ legend ของแท็บยอดเก็บเงิน) */}
      <div className="border-default-200 mb-3 flex rounded border border-dashed">
        <Cell label="ยอดขายที่ยืนยันแล้ว" value={data.revenue} dot="bg-success" />
        <Cell label={costNoun} value={-data.cogs} dot="bg-warning" />
        <Cell label="ค่าใช้จ่ายร้าน" value={-data.totalExpense} dot="bg-danger" />
      </div>

      <p className="text-default-700 mb-4 text-center text-xs leading-relaxed">
        {netProfitFormula(costNoun)}
      </p>

      {(shouldOfferCostSetup(completeness) || shouldOfferExpenseSetup(completeness)) && (
        <div className="mb-4 flex flex-col gap-2">
          {shouldOfferCostSetup(completeness) && (
            <SetupLink
              href="/products?cost=missing"
              icon="box"
              tone="primary"
              title={`ตั้ง${costNoun}`}
              sub={`ยังไม่ได้ตั้ง ${completeness.uncostedItemCount} จาก ${completeness.soldItemCount} รายการ`}
            />
          )}
          {shouldOfferExpenseSetup(completeness) && (
            <SetupLink
              href="/sales?tab=expense"
              icon="receipt"
              tone="danger"
              title="บันทึกค่าใช้จ่ายของร้าน"
              sub="ค่าเช่า ค่าจ้าง โฆษณา ค่าน้ำ-ค่าไฟ"
            />
          )}
        </div>
      )}

      <Link
        href="/sales?tab=pnl"
        className="border-default-300 text-primary flex min-h-11 items-center justify-center gap-1 rounded border text-sm font-medium"
      >
        ดูรายละเอียดกำไรขาดทุน
        <Icon icon="chevron-right" className="size-4" aria-hidden="true" />
      </Link>
    </>
  )
}

function ExpensePanel({ data, costNoun }: { data: ReportPayload; costNoun: string }) {
  const byCategory = groupExpensesByCategory(data.expenses)
  const outflow = data.cogs + data.totalExpense

  return (
    <>
      <div className="mb-3 text-center">
        <p className="text-default-700 text-xs">จ่ายออกทั้งหมด</p>
        <p className="text-danger-ink text-3xl font-bold tabular-nums">{formatNumberNoSymbol(outflow)}</p>
      </div>

      <div className="border-default-200 mb-4 flex rounded border border-dashed">
        <Cell label={costNoun} value={data.cogs} dot="bg-warning" />
        <Cell label="ค่าใช้จ่ายร้าน" value={data.totalExpense} dot="bg-danger" />
      </div>

      {byCategory.length > 0 ? (
        <ul className="divide-default-200 border-default-200 mb-4 divide-y rounded border">
          {byCategory.map((c) => (
            <li key={c.category} className="px-4 py-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-default-700">{EXPENSE_CATEGORY_LABEL_TH[c.category]}</span>
                <span className="text-default-800 font-semibold tabular-nums">
                  {formatNumberNoSymbol(c.amount)}
                </span>
              </div>
              {/* แถบสัดส่วน — ตอบ "ก้อนไหนกินเงินมากสุด" ได้โดยไม่ต้องเทียบตัวเลขเอง
                  ที่ 390px อ่านสัดส่วนจากแถบง่ายกว่าวงกลม จึงไม่ทำ donut */}
              <div className="bg-default-100 mt-1.5 h-1 overflow-hidden rounded-full">
                <div className="bg-danger h-full rounded-full" style={{ width: `${c.percent}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-default-700 mb-4 text-center text-sm">ยังไม่มีรายการค่าใช้จ่ายในช่วงนี้</p>
      )}

      {/* 🛑 ต้องบอกว่าอะไรกรอกเอง อะไรระบบคิดให้ — ไม่งั้นร้านจะไปหาปุ่มแก้ต้นทุนในหน้าค่าใช้จ่าย */}
      <p className="text-default-700 mb-4 text-xs leading-relaxed">
        {costNoun}ระบบคิดให้เองจากราคาทุนที่ตั้งไว้ในแต่ละบริการ · ที่บันทึกเองคือค่าใช้จ่ายของร้านเท่านั้น
      </p>

      <Link
        href="/sales?tab=expense"
        className="border-default-300 text-primary flex min-h-11 items-center justify-center gap-1 rounded border text-sm font-medium"
      >
        บันทึก / แก้ไขค่าใช้จ่าย
        <Icon icon="chevron-right" className="size-4" aria-hidden="true" />
      </Link>
    </>
  )
}

/** ช่องหนึ่งของแถบสมการ — มิเรอร์ LegendCell ของชีต (จุดสี + ป้าย + ตัวเลข) */
function Cell({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="border-default-300 flex-1 border-e border-dashed px-1 py-2.5 text-center last:border-e-0">
      <p className="text-default-700 flex items-start justify-center gap-1 text-xs leading-tight">
        <span className={`mt-1 size-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
        <span className="text-balance">{label}</span>
      </p>
      <p className="text-default-800 mt-0.5 font-bold tabular-nums">{formatNumberNoSymbol(value)}</p>
    </div>
  )
}

function SetupLink({
  href,
  icon,
  tone,
  title,
  sub,
}: {
  href: string
  icon: string
  tone: 'primary' | 'danger'
  title: string
  sub: string
}) {
  return (
    <Link
      href={href}
      className="border-default-200 hover:border-primary flex min-h-11 items-center gap-3 rounded border px-3 py-2.5"
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
          tone === 'primary' ? 'bg-primary/15' : 'bg-danger/15'
        }`}
      >
        <Icon
          icon={icon}
          className={`text-lg ${tone === 'primary' ? 'text-primary-ink' : 'text-danger-ink'}`}
          aria-hidden="true"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-default-800 block text-sm font-medium">{title}</span>
        <span className="text-default-700 block text-xs">{sub}</span>
      </span>
      <Icon icon="chevron-right" className="text-default-400 size-4 shrink-0" aria-hidden="true" />
    </Link>
  )
}
