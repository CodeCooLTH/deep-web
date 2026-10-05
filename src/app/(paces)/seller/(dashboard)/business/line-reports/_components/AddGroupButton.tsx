/**
 * AddGroupButton — ปุ่ม "เพิ่มกลุ่ม" (ใช้ทั้งหัวรายการและหน้าว่าง) · RSC
 *
 * Base: src/app/(paces)/seller/(dashboard)/business/components/QuotaUsageCard.tsx (ปุ่ม "สร้างธุรกิจใหม่": Link เมื่อกดได้ / ไม่ได้ใช้ button disabled แทน span aria-disabled เพราะ span ไม่มี role รองรับ)
 * ← theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (btn btn-sm bg-primary hover:bg-primary-hover text-white)
 *
 * disabled = ไม่ซ่อน แต่ชี้เหตุด้วย aria-describedby (เหตุมาจาก `createBlockedReason`)
 * ต่ำกว่า sm เต็มกว้าง (นิ้วโป้ง) · ≥ sm ชิดขวาตามหัวการ์ด
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'

export const CREATE_BLOCKED_ID = 'line-report-create-blocked'

export default function AddGroupButton({ canCreate, label = 'เพิ่มกลุ่ม' }: { canCreate: boolean; label?: string }) {
  return canCreate ? (
    <Link
      href="/business/line-reports/new"
      className="btn btn-sm bg-primary hover:bg-primary-hover inline-flex w-full items-center justify-center gap-1.5 text-white sm:w-auto"
    >
      <Icon icon="plus" className="text-base" aria-hidden="true" />
      {label}
    </Link>
  ) : (
    <button
      type="button"
      disabled
      aria-describedby={CREATE_BLOCKED_ID}
      className="btn btn-sm bg-light text-default-700 inline-flex w-full cursor-not-allowed items-center justify-center gap-1.5 opacity-60 sm:w-auto"
    >
      <Icon icon="plus" className="text-base" aria-hidden="true" />
      {label}
    </button>
  )
}
