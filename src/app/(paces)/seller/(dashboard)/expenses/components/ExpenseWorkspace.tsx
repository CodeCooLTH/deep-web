'use client'

/**
 * ExpenseWorkspace — client wrapper ถือ state ร่วมของ PnlReportCard + ExpenseForm + ExpenseList
 * (feature 00016 Expense & Cost Tracking, Unit 5A)
 *
 * ไม่มี 1:1 theme equivalent (domain composition component) — ประกอบจาก 3 component ที่ source มาจาก
 * theme แล้ว (PnlReportCard/ExpenseForm/ExpenseList — ดู Base comment ในแต่ละไฟล์)
 *
 * Design decision (UX-Design-Spec.md §A "Design decisions"): P&L report "ไม่ auto-refetch เมื่อบันทึก
 * expense ใหม่" ด้วยตัวเอง — ExpenseWorkspace ต้อง trigger PnlReportCard refetch หลัง create/edit/delete
 * สำเร็จ ผ่าน prop `refreshSignal` (เลขที่เพิ่มทุกครั้งที่ mutate) แทนการ remount ทั้ง component —
 * เพื่อคง date-range ที่ผู้ใช้เลือกไว้ใน PnlReportCard (remount ด้วย key จะรีเซ็ตกลับ 'today' ทุกครั้ง)
 *
 * expense list ใช้ router.refresh() (RSC re-fetch จาก page.tsx) แทน local array state — list เล็ก
 * (บันทึกมือทีละรายการ ตาม design decision "ไม่ทำ filter/search") ไม่คุ้มทำ optimistic update ซับซ้อน
 */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PnlReport } from '@/services/pnl.service'
import type { SerializedExpense } from '@/services/expense.service'
import PnlReportCard from './PnlReportCard'
import ExpenseForm from './ExpenseForm'
import ExpenseList from './ExpenseList'

type Props = {
  initialReport: PnlReport
  initialExpenses: SerializedExpense[]
}

export default function ExpenseWorkspace({ initialReport, initialExpenses }: Props) {
  const router = useRouter()
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [editing, setEditing] = useState<SerializedExpense | null>(null)
  const formAnchorRef = useRef<HTMLDivElement>(null)

  // เรียกหลัง create/edit/delete สำเร็จ — trigger PnlReportCard refetch (คง range เดิม) + refresh list (RSC)
  const handleMutated = () => {
    setRefreshSignal((v) => v + 1)
    router.refresh()
  }

  const handleEdit = (expense: SerializedExpense) => {
    setEditing(expense)
    formAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex flex-col gap-5">
      <PnlReportCard initialReport={initialReport} refreshSignal={refreshSignal} />

      <div ref={formAnchorRef}>
        <ExpenseForm
          mode={editing ? 'edit' : 'create'}
          editingId={editing?.id}
          initialValues={editing}
          onCancelEdit={() => setEditing(null)}
          onSuccess={() => {
            setEditing(null)
            handleMutated()
          }}
        />
      </div>

      <ExpenseList expenses={initialExpenses} onEdit={handleEdit} onDeleted={handleMutated} />
    </div>
  )
}
