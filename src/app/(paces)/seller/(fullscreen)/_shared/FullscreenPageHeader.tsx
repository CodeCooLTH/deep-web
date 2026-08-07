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
import type { ReactNode } from 'react'

import Icon from '@/components/wrappers/Icon'
import FullscreenBackButton from './FullscreenBackButton'

export type FullscreenPageHeaderProps = {
  title: string
  subtitle?: string
  saveLabel?: string
  saveFormId?: string
  disableSave?: boolean
  /** ปลายทางปุ่ม back ตายตัว (เช่น "/orders") — ไม่ส่ง = history-aware (back()/dashboard fallback) */
  backHref?: string
  /**
   * feature 00035 — ยังไม่บันทึก: กดปุ่มย้อนกลับต้องเด้งยืนยันก่อนออกจากหน้า (เหมือนปุ่ม "ยกเลิก")
   * ไม่ส่ง/false = พฤติกรรมเดิม (ออกทันที) — caller เดิมทั้งหมดไม่ต้องแก้อะไร
   */
  isDirty?: boolean
  /**
   * feature 00035 — เครื่องมือเพิ่มเติมที่วางระหว่าง title กับปุ่ม Save (desktop เท่านั้น)
   * ใช้กับหน้าที่ toolbar มีของมากกว่า [back][title][save] เช่นตัวจัดหน้าร้าน
   * optional — caller เดิมทั้งหมดไม่ต้องแก้อะไร
   */
  toolbarExtra?: ReactNode
  /**
   * feature 00035 — เครื่องมือที่ต้องอยู่ชิดซ้ายถัดจากชื่อหน้า (ก่อนช่องว่าง) ต่างจาก toolbarExtra
   * ที่ไปกองฝั่งขวาก่อนปุ่ม Save · optional — caller เดิมไม่ต้องแก้
   */
  toolbarLeading?: ReactNode
  /**
   * feature 00035 (รื้อ canvas 2026-08-07 รอบสอง) — แถวเพิ่มเติมใต้แถวหลัก อยู่ใน sticky wrapper
   * เดียวกัน (bg-card/shadow เดียวกัน) ใช้กับ DraftDirtyBar ของตัวจัดหน้าร้าน — เดิมแยกเป็น sibling
   * นอก header คนละกล่องแล้วทับกัน 32px บน prod (คนละ box ที่ "ควรจะ" เรียงต่อกันพอดีแต่ไม่พอดีจริง)
   * ย้ายเข้ามาเป็นกล่องเดียวกันตัดปัญหาที่ต้นเหตุ · optional — caller เดิมไม่ต้องแก้
   */
  belowContent?: ReactNode
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
  backHref,
  isDirty,
  toolbarExtra,
  toolbarLeading,
  belowContent,
  // cancelHref ยังรับแต่ไม่ใช้ — deprecated (back button ซ้ายแทน)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cancelHref: _cancelHref,
}: FullscreenPageHeaderProps) {
  return (
    // fixed-feel: -mt-* ดึง header ชิด top ของ <main> (cancel container pt) → sticky top-0 ไม่กระตุก;
    // shadow (Paces .app-header elevation) แทน border เดิม
    <div className="sticky top-0 z-10 bg-card -mx-4 px-4 md:-mx-8 md:px-8 -mt-4 md:-mt-8 pt-4 md:pt-8 pb-4 shadow">
      {/* layout M0-a: [back ซ้าย] [title flex-1 truncate] [Save ขวา]
          SellerMobileHeader pattern — แยก navigation (ซ้าย) กับ action (ขวา) ชัดเจน */}
      <div className="flex items-center gap-3">
        {/* Back button ซ้าย — client component (ต้องการ router.push/back()) */}
        <FullscreenBackButton backHref={backHref} isDirty={isDirty} />

        {/* Title block — flex-1 min-w-0 truncate กัน overflow บน mobile
            feature 00035: ห่อ title + toolbarLeading ไว้ในกล่อง flex-1 เดียวกัน เพื่อให้เครื่องมือที่
            ต้องอยู่ "ชิดซ้ายถัดจากชื่อหน้า" (เช่นช่องลิงก์ร้านของตัวจัดหน้าร้าน ตาม mockup) ไม่ถูก
            flex-1 ของ title ดันไปกองรวมกับปุ่มฝั่งขวา — caller ที่ไม่ส่ง toolbarLeading ได้ layout เดิมเป๊ะ */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-dark leading-tight truncate">{title}</h1>
            {subtitle && <p className="text-default-700 text-sm mt-0.5 truncate">{subtitle}</p>}
          </div>
          {toolbarLeading ? <div className="hidden shrink-0 items-center gap-2 lg:flex">{toolbarLeading}</div> : null}
        </div>

        {/* feature 00035 — ช่องเสียบเครื่องมือเพิ่มเติมระหว่าง title กับ Save (ลิงก์ร้าน+คัดลอก,
            สวิตช์เผยแพร่, ปุ่มดูหน้าร้านจริง ของตัวจัดหน้าร้าน) optional จึงไม่กระทบ caller เดิม
            ที่ไม่ส่ง prop นี้มาสักตัว — ไม่ render อะไรเลยเมื่อไม่ส่ง */}
        {toolbarExtra ? <div className="hidden shrink-0 items-center gap-3 lg:flex">{toolbarExtra}</div> : null}

        {/* Save button ขวา — desktop เท่านั้น (hidden lg:inline-flex): บนมือถือ (<lg) ทุกหน้าที่ส่ง saveFormId
            (products/orders) มี sticky bottom save อยู่แล้ว → เลี่ยงปุ่มบันทึกซ้ำ 2 ที่ (mockup A). min-h-11 = 44px */}
        {saveFormId ? (
          <button
            type="submit"
            form={saveFormId}
            disabled={disableSave}
            className="btn bg-primary px-5 py-2 font-semibold text-white hover:bg-primary-hover hidden lg:inline-flex items-center gap-2 min-h-11 shrink-0 disabled:opacity-60"
          >
            <Icon icon="device-floppy" className="size-4" />
            <span className="hidden sm:inline">{saveLabel}</span>
            <span className="sm:hidden">บันทึก</span>
          </button>
        ) : null}
      </div>
      {/* feature 00035 — แถวเสริมใต้แถวหลัก ยังอยู่ใน sticky wrapper เดียวกัน (ดู comment prop
          belowContent ด้านบน) — optional จึงไม่กระทบ caller เดิมที่ไม่ส่งมา */}
      {belowContent}
    </div>
  )
}
