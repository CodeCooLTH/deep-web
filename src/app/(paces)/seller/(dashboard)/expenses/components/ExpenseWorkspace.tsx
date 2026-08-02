'use client'

/**
 * ExpenseWorkspace — เจ้าของ state ทั้งหน้า /expenses (feature 00016 redesign)
 *
 * หัวใจของการ redesign รอบนี้: ช่วงเวลาและข้อมูลอยู่ที่เดียว
 * เดิม PnlReportCard fetch รายงานเอง (ผูกช่วง) ส่วนรายการมาจาก RSC (ไม่ผูกช่วง) — คนละฐานกัน
 * ตอนนี้ `/api/expenses/report` คืนทั้งรายงานและรายการที่ scope ด้วยช่วงเดียวกัน แล้วแจกให้
 * ทั้ง 4 ส่วน (P&L / แยกหมวด / สรุปเร็ว / รายการ) ตัวเลขจึงขัดกันเองไม่ได้ตามนิยาม
 *
 * ไม่มี 1:1 theme equivalent (domain composition) — ประกอบจาก component ที่ source มาจาก theme แล้ว
 *
 * Design Spec: docs/superpowers/specs/2026-08-02-expenses-redesign-design-spec.md §4.1–4.5
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import type { PnlReport } from '@/services/pnl.service'
import type { SerializedExpense } from '@/services/expense.service'
import type { DateRangePreset } from '@/lib/date-range'
import ExpenseToolbar from './ExpenseToolbar'
import PnlReportCard from './PnlReportCard'
import ExpenseBreakdownCard from './ExpenseBreakdownCard'
import ExpenseQuickStatsCard from './ExpenseQuickStatsCard'
import ExpenseList from './ExpenseList'
import ExpenseFormModal from './ExpenseFormModal'

const RANGE_LABEL: Record<DateRangePreset, string> = {
  today: 'วันนี้',
  '7d': '7 วันล่าสุด',
  '30d': '30 วันล่าสุด',
  month: 'เดือนนี้',
  custom: 'ช่วงที่เลือก',
}

const DAY_MS = 24 * 60 * 60 * 1000

/** จำนวนวันในช่วงที่รายงานคืนมา (label เป็น "YYYY-MM-DD" ทั้งคู่, inclusive ทั้งสองฝั่ง) */
function daysInRange(label: { start: string; end: string }): number {
  const s = Date.parse(label.start)
  const e = Date.parse(label.end)
  if (Number.isNaN(s) || Number.isNaN(e)) return 1
  return Math.max(1, Math.round((e - s) / DAY_MS) + 1)
}

type ModalState = { mode: 'create' } | { mode: 'edit'; editing: SerializedExpense }

type Props = {
  initialReport: PnlReport
  initialExpenses: SerializedExpense[]
  hasAnyExpenseEver: boolean
}

export default function ExpenseWorkspace({ initialReport, initialExpenses, hasAnyExpenseEver }: Props) {
  const router = useRouter()
  const [range, setRange] = useState<DateRangePreset>('today')
  const [customDates, setCustomDates] = useState<[string, string] | null>(null)
  const [report, setReport] = useState<PnlReport>(initialReport)
  const [expenses, setExpenses] = useState<SerializedExpense[]>(initialExpenses)
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState<ModalState | null>(null)
  // นับขึ้นทุกครั้งที่ mutate สำเร็จ — ใช้เป็น trigger ให้ effect ด้านล่าง refetch ช่วงเดิม
  const [mutationCount, setMutationCount] = useState(0)
  // SSR ส่งข้อมูลของ range='today' มาให้แล้ว (ตรงกับ default) — ไม่ต้องยิงซ้ำตอน mount
  const isFirstRun = useRef(true)

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      if (mutationCount === 0) return
    }
    if (range === 'custom' && !customDates) return // ยังไม่เลือกช่วง "กำหนดเอง" — รอผู้ใช้เลือกก่อน

    const controller = new AbortController()
    const run = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ range })
        if (range === 'custom' && customDates) {
          params.set('start', customDates[0])
          params.set('end', customDates[1])
        }
        const res = await fetch(`/api/expenses/report?${params.toString()}`, { signal: controller.signal })
        if (!res.ok) throw new Error('fetch failed')
        const data: PnlReport & { expenses: SerializedExpense[] } = await res.json()
        setReport(data)
        setExpenses(data.expenses ?? [])
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          // ค้างข้อมูลเดิมไว้ ไม่ล้างตัวเลข — ล้างแล้วผู้ใช้จะเข้าใจว่าข้อมูลหาย
          pacesToast.error('โหลดรายงานไม่สำเร็จ กรุณาลองใหม่')
        }
      } finally {
        setLoading(false)
      }
    }
    run()
    return () => controller.abort()
  }, [range, customDates, mutationCount])

  const handleMutated = () => {
    setMutationCount((v) => v + 1)
    // sync ส่วนอื่นของ layout ที่อ่านค่าใช้จ่ายจาก RSC (เช่นการ์ดยอดขายบนหน้าหลัก)
    router.refresh()
  }

  const handleCustomChange = (selectedDates: Date[]) => {
    if (selectedDates.length === 2) {
      setCustomDates([
        selectedDates[0].toISOString().slice(0, 10),
        selectedDates[1].toISOString().slice(0, 10),
      ])
    }
  }

  const openCreate = () => setModal({ mode: 'create' })

  return (
    <div className="flex flex-col gap-5">
      <ExpenseToolbar
        range={range}
        onRangeChange={setRange}
        onCustomChange={handleCustomChange}
        onAdd={openCreate}
      />

      <PnlReportCard report={report} loading={loading} rangeLabel={RANGE_LABEL[range]} />

      {expenses.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ExpenseBreakdownCard expenses={expenses} loading={loading} />
          </div>
          <ExpenseQuickStatsCard
            expenses={expenses}
            revenue={report.revenue}
            days={daysInRange(report.range)}
            loading={loading}
          />
        </div>
      )}

      <ExpenseList
        expenses={expenses}
        hasAnyExpenseEver={hasAnyExpenseEver}
        loading={loading}
        onEdit={(expense) => setModal({ mode: 'edit', editing: expense })}
        onAdd={openCreate}
        onMutated={handleMutated}
      />

      {/* ปุ่มหลักบนมือถือ — fixed เหนือ SellerBottomNav (ดู carve-out ในคอมเมนต์ด้านล่าง) */}
      <div
        className="bg-card border-default-200 fixed inset-x-0 z-20 border-t px-4 py-3 sm:hidden"
        /* carve-out safe-area + ความสูงเมนูล่าง (Hard Rule 7): SellerBottomNav เป็น fixed สูง 4rem
           ทับพอดีตำแหน่งนี้ ต้องยกตัวเองพ้น + เผื่อ home indicator ของเครื่อง
           precedent: shop/components/ShopForm.tsx (z-20 ต่ำกว่า SellerBottomNav z-30 จึงไม่บังเมนู) */
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={openCreate}
          className="btn bg-primary hover:bg-primary-hover inline-flex w-full items-center justify-center gap-2 py-3 text-white"
        >
          <Icon icon="plus" aria-hidden="true" />
          เพิ่มค่าใช้จ่าย
        </button>
      </div>
      {/* กันแถบปุ่มด้านบนบังท้ายรายการ — มือถือเท่านั้น */}
      <div className="h-16 sm:hidden" aria-hidden="true" />

      {modal && (
        <ExpenseFormModal
          mode={modal.mode}
          editing={modal.mode === 'edit' ? modal.editing : null}
          onClose={() => setModal(null)}
          onMutated={handleMutated}
        />
      )}
    </div>
  )
}
