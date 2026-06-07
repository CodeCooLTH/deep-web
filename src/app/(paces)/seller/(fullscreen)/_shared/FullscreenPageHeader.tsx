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
 * M0-a layout ใหม่ (mobile-first navigation):
 *   [back ซ้าย] [title flex-1] [Save ขวา]
 *   - ย้าย back button มาฝั่งซ้าย (history-aware /dashboard fallback) เหมือน SellerMobileHeader
 *   - เอา "ยกเลิก" ขวาออก: back ซ้ายอ่านชัดกว่าว่าเป็น navigation ไม่ใช่ discard
 *   - title: text-xl md:text-2xl + truncate กัน overflow บน mobile
 *   - Save: min-h-11 ≥44px touch target
 *
 * Server component — FullscreenBackButton เป็น client child ที่แยกไว้
 * (import client component เข้า server component ได้โดยตรงใน Next.js App Router)
 */
import Icon from '@/components/wrappers/Icon'
import FullscreenBackButton from './FullscreenBackButton'

export type FullscreenPageHeaderProps = {
  title: string
  subtitle?: string
  saveLabel?: string
  saveFormId?: string
  disableSave?: boolean
  /**
   * @deprecated ไม่ใช้แล้วหลัง M0-a — back button ซ้าย (history-aware) แทน "ยกเลิก" ขวา.
   * ยังรับ prop เพื่อกันพัง caller เดิมที่ยังส่งมา — ไม่ render
   */
  cancelHref?: string
}

export default function FullscreenPageHeader({
  title,
  subtitle,
  saveLabel = 'บันทึก',
  saveFormId,
  disableSave,
  // cancelHref ยังรับแต่ไม่ใช้ — deprecated (back button ซ้ายแทน)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cancelHref: _cancelHref,
}: FullscreenPageHeaderProps) {
  return (
    <div className="sticky top-0 z-10 bg-card -mx-4 px-4 md:-mx-8 md:px-8 pb-4 mb-6 border-b border-default-200">
      {/* layout M0-a: [back ซ้าย] [title flex-1 truncate] [Save ขวา]
          SellerMobileHeader pattern — แยก navigation (ซ้าย) กับ action (ขวา) ชัดเจน */}
      <div className="flex items-center gap-3">
        {/* Back button ซ้าย — client component (ต้องการ router.back()) */}
        <FullscreenBackButton />

        {/* Title block — flex-1 min-w-0 truncate กัน overflow บน mobile */}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-dark truncate">{title}</h1>
          {subtitle && <p className="text-default-400 text-sm mt-0.5 truncate">{subtitle}</p>}
        </div>

        {/* Save button ขวา — min-h-11 = 44px touch target */}
        {saveFormId ? (
          <button
            type="submit"
            form={saveFormId}
            disabled={disableSave}
            className="btn bg-primary px-5 py-2 font-semibold text-white hover:bg-primary-hover inline-flex items-center gap-2 min-h-11 shrink-0 disabled:opacity-60"
          >
            <Icon icon="device-floppy" className="size-4" />
            <span className="hidden sm:inline">{saveLabel}</span>
            <span className="sm:hidden">บันทึก</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
