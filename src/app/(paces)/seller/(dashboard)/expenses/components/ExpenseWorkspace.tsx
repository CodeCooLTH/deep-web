'use client'

/**
 * ExpenseWorkspace — เจ้าของ state ทั้งหน้า /expenses (feature 00016 redesign)
 *
 * หัวใจของการ redesign รอบนี้: ช่วงเวลาและข้อมูลอยู่ที่เดียว
 * เดิม PnlReportCard fetch รายงานเอง (ผูกช่วง) ส่วนรายการมาจาก RSC (ไม่ผูกช่วง) — คนละฐานกัน
 * ตอนนี้ `/api/expenses/report` คืนทั้งรายงานและรายการที่ scope ด้วยช่วงเดียวกัน แล้วแจกให้
 * ทั้ง 3 ส่วน (P&L / แยกหมวด / รายการ) ตัวเลขจึงขัดกันเองไม่ได้ตามนิยาม
 *
 * ไม่มี 1:1 theme equivalent (domain composition) — ประกอบจาก component ที่ source มาจาก theme แล้ว
 *
 * Design Spec: docs/superpowers/specs/2026-08-02-expenses-redesign-design-spec.md §4.1–4.5
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import type { PnlReport } from '@/services/pnl.service'
import type { SerializedExpense } from '@/services/expense.service'
import type { DateRangePreset } from '@/lib/date-range'
import ExpenseToolbar from './ExpenseToolbar'
import PnlReportCard from './PnlReportCard'
import ExpenseBreakdownCard from './ExpenseBreakdownCard'
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
  /** ช่วงเวลาที่ RSC resolve มาแล้วจาก ?range= — เป็นค่าเดียวกับที่ initialReport ถูกคำนวณด้วย */
  initialRange: DateRangePreset
  initialCustom: [string, string] | null
  initialReport: PnlReport
  initialExpenses: SerializedExpense[]
  hasAnyExpenseEver: boolean
  /** ชื่อของ "ใบ" ที่เอามาเฉลี่ย/นับ ผันตามประเภทกิจการ (ORDER_VOCAB.noun) */
  orderNoun?: string
}

export default function ExpenseWorkspace({
  initialRange,
  initialCustom,
  initialReport,
  initialExpenses,
  hasAnyExpenseEver,
  orderNoun = 'ออเดอร์',
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  // seed จาก URL ที่ RSC อ่านมาแล้ว — ไม่ hardcode ค่าเริ่มต้นซ้ำที่นี่ ไม่งั้นสองที่หลุดจากกันได้
  const [range, setRange] = useState<DateRangePreset>(initialRange)
  const [customDates, setCustomDates] = useState<[string, string] | null>(initialCustom)
  const [report, setReport] = useState<PnlReport>(initialReport)
  const [expenses, setExpenses] = useState<SerializedExpense[]>(initialExpenses)
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState<ModalState | null>(null)
  // นับขึ้นทุกครั้งที่ mutate สำเร็จ — ใช้เป็น trigger ให้ effect ด้านล่าง refetch ช่วงเดิม
  const [mutationCount, setMutationCount] = useState(0)
  // โหลดล้ม = ค้างข้อมูลเก่าไว้ + โชว์แถบลองใหม่ (toast อย่างเดียวหายไปเองแล้วผู้ใช้ไม่รู้ว่าเลขเก่า)
  const [loadFailed, setLoadFailed] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  // SSR ส่งข้อมูลของช่วงที่อยู่ใน URL มาให้แล้ว (ตรงกับ initialRange) — ไม่ต้องยิงซ้ำตอน mount
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
        setLoadFailed(false)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          // ค้างข้อมูลเดิมไว้ ไม่ล้างตัวเลข — ล้างแล้วผู้ใช้จะเข้าใจว่าข้อมูลหาย
          // แต่ต้องมีร่องรอยค้างไว้ด้วย (แถบลองใหม่) ไม่ใช่มีแค่ toast ที่หายไปเองใน 3 วินาที
          // แล้วเหลือตัวเลขเก่าบนจอโดยผู้ใช้ไม่รู้ว่ามันเก่า
          setLoadFailed(true)
          pacesToast.error('โหลดรายงานไม่สำเร็จ กรุณาลองใหม่')
        }
      } finally {
        setLoading(false)
      }
    }
    run()
    return () => controller.abort()
  }, [range, customDates, mutationCount, retryCount])

  const handleMutated = () => {
    setMutationCount((v) => v + 1)
    // sync ส่วนอื่นของ layout ที่อ่านค่าใช้จ่ายจาก RSC (เช่นการ์ดยอดขายบนหน้าหลัก)
    router.refresh()
  }

  /** เขียนช่วงเวลาลง URL ด้วย replace — กด back ควรออกจากหน้านี้ ไม่ใช่ไล่ย้อนทุกช่วงที่เคยกด */
  const syncUrl = (next: DateRangePreset, dates: [string, string] | null) => {
    const params = new URLSearchParams({ range: next })
    if (next === 'custom' && dates) {
      params.set('start', dates[0])
      params.set('end', dates[1])
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const handleRangeChange = (next: DateRangePreset) => {
    setRange(next)
    syncUrl(next, customDates)
  }

  const handleCustomChange = (selectedDates: Date[]) => {
    if (selectedDates.length === 2) {
      const next: [string, string] = [
        selectedDates[0].toISOString().slice(0, 10),
        selectedDates[1].toISOString().slice(0, 10),
      ]
      setCustomDates(next)
      syncUrl('custom', next)
    }
  }

  const openCreate = () => setModal({ mode: 'create' })

  return (
    <div className="flex flex-col gap-5">
      <ExpenseToolbar
        range={range}
        onRangeChange={handleRangeChange}
        onCustomChange={handleCustomChange}
        onAdd={openCreate}
      />

      {loadFailed && (
        <div
          role="alert"
          className="border-danger/20 bg-danger/10 text-danger-ink flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-medium"
        >
          <span>ตัวเลขที่เห็นอาจไม่ใช่ล่าสุด — โหลดข้อมูลรอบล่าสุดไม่สำเร็จ</span>
          <button
            type="button"
            onClick={() => setRetryCount((v) => v + 1)}
            disabled={loading}
            className="btn btn-sm bg-card text-default-800 border-default-300 min-h-11 border disabled:opacity-60"
          >
            ลองใหม่
          </button>
        </div>
      )}

      {/* แถบเตือนต้นทุนขาด — ย้ายออกจากในการ์ดมาเป็นแถบเต็มความกว้างเหนือกริด เพราะการ์ด 5 ใบ
          ต้องสูงเท่ากัน ใส่แถบไว้ในใบเดียวจะดันความสูงทั้งแถว
          โครงเดียวกับแถบ "โหลดข้อมูลไม่สำเร็จ" ด้านบน ต่างแค่ tone */}
      {report.hasMissingCost && (
        <div
          role="alert"
          aria-live="polite"
          className="border-warning/20 bg-warning/10 text-warning-ink flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-medium"
        >
          <span className="flex items-start gap-2">
            <Icon icon="alert-triangle" className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            กำไรที่แสดงสูงกว่าความจริง — มีสินค้าที่ยังไม่ได้ใส่ต้นทุนในช่วงนี้
          </span>
          <Link href="/products" className="font-semibold underline min-h-11 lg:min-h-0">
            ใส่ต้นทุนตอนนี้ →
          </Link>
        </div>
      )}

      <PnlReportCard report={report} expenses={expenses} loading={loading} rangeLabel={RANGE_LABEL[range]} orderNoun={orderNoun} />

      {expenses.length > 0 && (
        <ExpenseBreakdownCard
          expenses={expenses}
          revenue={report.revenue}
          days={daysInRange(report.range)}
          loading={loading}
        />
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
