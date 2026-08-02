/**
 * SellerEmptyState — empty state สำหรับ seller routes
 *
 * Base (multi-source):
 *   - RecentOrder.tsx L148-155 (empty pattern: flex flex-col items-center py-12 text-center)
 *   - theme/paces/Admin/TS/src/app/(admin)/ui/placeholders/page.tsx (card primitive)
 *   - theme/paces/Admin/TS/src/app/(admin)/ui/spinners/page.tsx (card wrapper pattern)
 *
 * pure presentational — ไม่มี state, ไม่มี client directive
 * Paces ใช้ next/link ตรง (ไม่ใช่ MUI component={Link}) → Hard Rule 2 ไม่ทับ
 */
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'

type SellerEmptyStateProps = {
  /** icon name ไม่มี prefix — ส่งเข้า Icon wrapper ที่เติม tabler: อัตโนมัติ (default: 'inbox') */
  icon?: string
  /** ข้อความหัว (required) */
  title: string
  /** ข้อความรอง */
  description?: string
  /** ปุ่ม action — ถ้ามีจะแสดง Link สไตล์ Paces pricing button */
  action?: { label: string; href: string }
  /**
   * compact mode — true: ใช้ใน card-body (py-12)
   * false (default): full-page card max-w-2xl mx-auto py-20
   */
  compact?: boolean
}

const SellerEmptyState = ({
  icon = 'inbox',
  title,
  description,
  action,
  compact = false,
}: SellerEmptyStateProps) => {
  const inner = (
    // pattern จาก RecentOrder empty state: flex flex-col items-center justify-center text-center
    <div
      className={`flex flex-col items-center justify-center text-center text-default-400 ${
        compact ? 'py-12' : 'py-20'
      }`}
    >
      {/* ไอคอนขนาดใหญ่ ~56px, opacity-40 — บอกประเภทของ empty state */}
      <Icon icon={icon} className="size-14 mb-4 opacity-40" />

      <p className="font-semibold text-default-700 text-base mb-1">{title}</p>

      {description && (
        <p className="text-sm text-default-400 mt-1 max-w-xs">{description}</p>
      )}

      {action && (
        // Paces pricing button style: bg-primary text-white rounded-full
        <Link
          href={action.href}
          className="btn bg-primary hover:bg-primary-hover text-white rounded-full px-6 mt-5 text-sm font-medium"
        >
          {action.label}
        </Link>
      )}
    </div>
  )

  if (compact) {
    // compact — caller ครอบ card เอง; ส่ง inner กลับเปล่า ๆ
    return inner
  }

  // full-page — ครอบด้วย card เพื่อให้ดูดีบน page ว่าง
  return (
    <div className="card max-w-2xl mx-auto">
      <div className="card-body">{inner}</div>
    </div>
  )
}

export default SellerEmptyState
