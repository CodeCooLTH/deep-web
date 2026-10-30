'use client'

/**
 * StaffExpenseCard — การ์ด "ค่าใช้จ่ายที่ฉันบันทึก" บนหน้าแรกของพนักงานร้านบริการ (00086 · BRD FR-018)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx
 *   (โครง .card + .card-header + ลิงก์ท้ายหัวการ์ด ยกจาก TodayJobs ข้างกัน — ตัวนั้นก็ยกจากธีมเดียวกัน)
 *   ปุ่มเพิ่มเปิด ExpenseFormModal ตัวเดียวกับหน้า /expenses (scope='mine' → /api/expenses/mine)
 *
 * 🛑 ผู้เรียก (page.tsx) ตัดสินด้วย showsStaffExpenseCard() แล้ว "ไม่ render" เท่านั้น — ห้าม mount ซ่อนด้วย CSS
 * 🛑 ไม่มียอดเงินบนการ์ดนี้โดยตั้งใจ — พนักงานไม่มี F1 เห็นได้แค่ "จำนวนรายการของตัวเอง"
 * ข้อความเป็นไทยตายตัวเหมือนแผงการเงินทั้งชุด (/expenses · ExpenseFormModal) — แปลต้องแปลพร้อมกันทั้งชุด
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import ExpenseFormModal from '../../expenses/components/ExpenseFormModal'

export default function StaffExpenseCard({ count, className = '' }: { count: number; className?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <div className={`card ${className}`}>
      <div className="card-header !py-3 flex items-center justify-between">
        <h4 className="card-title flex items-center gap-1.5">
          <Icon icon="tabler:receipt" className="size-4 text-primary" aria-hidden="true" />
          ค่าใช้จ่ายที่ฉันบันทึก
        </h4>
        <Link
          href="/expenses/mine"
          className="text-primary text-sm font-medium inline-flex items-center min-h-11 lg:min-h-0 gap-0.5"
        >
          ดูทั้งหมด
          <Icon icon="tabler:chevron-right" className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="card-body !p-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn bg-primary/15 text-primary-ink hover:bg-primary/25 inline-flex min-h-11 w-full items-center justify-center gap-1.5 font-semibold"
        >
          <Icon icon="tabler:plus" aria-hidden="true" />
          เพิ่มค่าใช้จ่าย
        </button>
        <p className="text-default-700 mt-2 text-center text-xs">{count} รายการ · เห็นเฉพาะของคุณ</p>
      </div>

      {open && (
        <ExpenseFormModal
          mode="create"
          scope="mine"
          onClose={() => setOpen(false)}
          // จำนวนรายการมาจาก RSC — refresh ให้ตัวเลขบนการ์ดตรงหลังบันทึก
          onMutated={() => router.refresh()}
        />
      )}
    </div>
  )
}
