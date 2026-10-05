/**
 * LineReportsEntryRow — แถวทางเข้า "รายงานเข้ากลุ่ม LINE" ใต้ QuotaUsageCard (feature 00070, web-only)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card ใบเดียว)
 *   + src/app/(paces)/seller/(dashboard)/shop/components/ShopQuickLinks.tsx (แถวลิงก์: วงกลมไอคอน → ข้อความ → chevron)
 *   + theme/paces/.../ui/badges/page.tsx (badge bg-danger/15 text-danger-ink)
 *
 * ทำไม web-only: หน้า /business เด้งออกทุกเชลล์ที่ซ่อนการจ่ายเงิน ในแอปจึงไม่มาถึงหน้านี้ —
 * ทางเข้าบนมือถือ/แอปคือ ShopQuickLinks · แถวนี้เป็นทางลัดรองของคนที่อยู่หน้าแพ็กเกจบนเว็บ
 *
 * RSC ล้วน — ใช้ <Link> ตรง ๆ ไม่ใช้ component={Link} (rsc-mui-navigation)
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'

export default function LineReportsEntryRow({ alertCount }: { alertCount: number }) {
  return (
    <div className="card mb-base">
      <Link
        href="/business/line-reports"
        className="hover:bg-default-100 flex min-h-11 items-center gap-3 rounded-lg px-4 py-3"
      >
        <div className="bg-light flex size-10 shrink-0 items-center justify-center rounded-lg">
          <Icon icon="brand-line" className="text-xl" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-default-900 truncate text-sm font-medium">รายงานเข้ากลุ่ม LINE</p>
          <p className="text-default-400 truncate text-xs">ส่งสรุปยอดของทีมเข้ากลุ่ม LINE ตามเวลาที่ตั้งไว้</p>
        </div>
        {alertCount > 0 && (
          <span className="badge bg-danger/15 text-danger-ink shrink-0">{alertCount} กลุ่มต้องดูแล</span>
        )}
        <Icon icon="chevron-right" className="text-default-400 shrink-0" aria-hidden="true" />
      </Link>
    </div>
  )
}
