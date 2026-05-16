/**
 * Sticky top header สำหรับ fullscreen overlay pages (seller)
 *
 * ไม่มี Paces fullscreen-overlay layout ตรง ๆ (Explore E2 ยืนยัน: theme/paces/Admin/TS/src/layouts/
 * มีแต่ Vertical/Horizontal/Main ซึ่งเป็น sidebar-shell ทั้งหมด ไม่มี fullscreen-overlay)
 *
 * Nearest structural ref:
 *   theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/page.tsx
 *   — PageBreadcrumb (title + subtitle) + bottom action-bar (flex gap-2.5 พร้อม Discard/Save/Publish)
 *
 * Pattern ที่ดัดแปลง: รวม title area กับ action buttons ไว้ใน sticky header แถวเดียว
 * (แทนที่จะมี PageBreadcrumb แยก + action-bar ด้านล่าง) เพราะ fullscreen overlay ไม่มี
 * sidebar context — header บนสุดจึงต้องแสดง title + actions พร้อมกันในแถวเดียว
 *
 * Server component — ใช้ next/link โดยตรง (ไม่ใช่ MUI component={Link})
 */
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'

export type FullscreenPageHeaderProps = {
  title: string
  subtitle?: string
  /** href ปุ่มยกเลิก — default: /dashboard (proxy rewrite ครอบบน seller subdomain) */
  cancelHref?: string
  saveLabel?: string
  saveFormId?: string
  disableSave?: boolean
}

export default function FullscreenPageHeader({
  title,
  subtitle,
  cancelHref = '/dashboard',
  saveLabel = 'บันทึก',
  saveFormId,
  disableSave,
}: FullscreenPageHeaderProps) {
  return (
    <div className="sticky top-0 z-10 bg-card -mx-4 px-4 md:-mx-8 md:px-8 pb-4 mb-6 border-b border-default-200">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-dark">{title}</h1>
          {subtitle && <p className="text-default-400 text-sm mt-0.5">{subtitle}</p>}
        </div>
        {/* action-bar pattern จาก product-add: Discard / Save — อยู่ฝั่งขวาใน header แทน bottom bar */}
        <div className="flex items-center gap-2">
          <Link
            href={cancelHref}
            className="btn border border-default-300 text-default-900 hover:bg-default-50 flex items-center gap-2 px-4 py-2"
          >
            <Icon icon="x" className="size-4" />
            <span>ยกเลิก</span>
          </Link>
          {saveFormId ? (
            <button
              type="submit"
              form={saveFormId}
              disabled={disableSave}
              className="btn bg-primary px-5 py-2 font-semibold text-white hover:bg-primary-hover inline-flex items-center gap-2 disabled:opacity-60"
            >
              <Icon icon="device-floppy" className="size-4" />
              <span>{saveLabel}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
