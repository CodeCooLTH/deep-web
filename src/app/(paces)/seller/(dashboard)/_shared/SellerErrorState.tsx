/**
 * SellerErrorState — แสดงเมื่อโหลดข้อมูลไม่สำเร็จ (ใช้แทน error boundary ใน unit นี้)
 *
 * Base (multi-source):
 *   - RecentOrder.tsx L148-155 (empty state pattern ที่ promote)
 *   - theme/paces/Admin/TS/src/app/(admin)/ui/placeholders/page.tsx (card primitive)
 *   - theme/paces/Admin/TS/src/assets/css/custom/_card.css (.card-overlay, card structure)
 *
 * pure presentational — ไม่มี state, ไม่มี client directive
 * icon alert-triangle สีแดง แยกออกจาก SellerEmptyState ชัดเจน
 * retryHref เป็น optional — ถ้าไม่มีไม่ต้องแสดงปุ่ม (ตาม spec: defer window.location.reload)
 */
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'

type SellerErrorStateProps = {
  /** ข้อความหัว (default: 'โหลดข้อมูลไม่สำเร็จ') */
  title?: string
  /** ข้อความรอง (default: 'เกิดข้อผิดพลาดชั่วคราว ลองโหลดใหม่อีกครั้ง') */
  message?: string
  /** ถ้ามี → แสดงปุ่ม "ลองใหม่" เป็น Link; ถ้าไม่มี → ไม่แสดงปุ่ม */
  retryHref?: string
}

const SellerErrorState = ({
  title = 'โหลดข้อมูลไม่สำเร็จ',
  message = 'เกิดข้อผิดพลาดชั่วคราว ลองโหลดใหม่อีกครั้ง',
  retryHref,
}: SellerErrorStateProps) => {
  return (
    <div className="card max-w-2xl mx-auto">
      <div className="card-body">
        {/* โครงเดียวกับ SellerEmptyState แต่ icon เป็น alert-triangle สีแดง */}
        <div className="flex flex-col items-center justify-center text-center py-20">
          {/* สีแดง (text-danger) เพื่อแยกแยะออกจาก empty state ที่ใช้ opacity-40 */}
          <Icon icon="alert-triangle" className="text-[56px] mb-4 text-danger opacity-70" />

          <p className="font-semibold text-default-700 text-base mb-1">{title}</p>

          <p className="text-sm text-default-400 mt-1 max-w-xs">{message}</p>

          {/* แสดงปุ่ม "ลองใหม่" เฉพาะเมื่อ retryHref มีค่า — ใช้ next/link ตาม Paces convention */}
          {retryHref && (
            <Link
              href={retryHref}
              className="btn border border-danger text-danger hover:bg-danger hover:text-white rounded-full px-6 mt-5 text-sm font-medium"
            >
              ลองใหม่
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

export default SellerErrorState
