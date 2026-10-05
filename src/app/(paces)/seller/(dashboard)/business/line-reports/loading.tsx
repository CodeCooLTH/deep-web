/**
 * loading.tsx — skeleton ของ /business/line-reports (สูงเท่าหน้าจริง กัน layout shift)
 *
 * Base: src/app/(paces)/seller/(dashboard)/shop/loading.tsx (PulseBar `animate-pulse` + mirror โครงหน้าจริง)
 * โครง: breadcrumb → การ์ดหัว (ชื่อ + ปุ่ม) → 3 แถว (ไอคอน size-10 + 2 บรรทัด) ตรงกับ ReportGroupList
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'

const PulseBar = ({ className }: { className?: string }) => (
  <span className={`bg-default-300 block animate-pulse rounded ${className ?? ''}`} />
)

export default function ReportsLoading() {
  return (
    <>
      <PageBreadcrumb title="รายงานเข้ากลุ่ม LINE" trail={[{ label: 'ธุรกิจ' }]} />
      <span className="sr-only">กำลังโหลด...</span>
      <div className="card mb-base">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <PulseBar className="h-4 w-40" />
          <PulseBar className="h-11 w-full sm:w-28 lg:h-8" />
        </div>
        <ul className="m-0 list-none p-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="border-default-200 flex items-center gap-3 border-b px-4 py-3 last:border-0">
              <span className="bg-default-300 size-10 shrink-0 animate-pulse rounded-lg" />
              <div className="flex-1 space-y-2">
                <PulseBar className="h-3.5 w-3/5" />
                <PulseBar className="h-3 w-2/5" />
                {/* <lg แถวจริงสูง ~130px (ป้ายสถานะ + บรรทัดสถานะ + ส่งล่าสุด) — กันหน้ากระตุกตอนโหลดเสร็จ */}
                <PulseBar className="h-5 w-20 lg:hidden" />
                <PulseBar className="h-3 w-1/2 lg:hidden" />
                <PulseBar className="h-3 w-2/5 lg:hidden" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
