'use client'

/**
 * SellerMobileHeader — topbar เดียวทุกหน้า mobile (render โดย layout T3)
 *
 * ทำไม: เดิม CommandTopBar อยู่ใน CommandCenter (page-level) → หน้าอื่น ๆ ไม่มี topbar
 * แก้ด้วยย้าย topbar ขึ้น layout slot → render ครอบทุกหน้า (T3 wire ที่ VerticalLayout)
 *
 * 2 mode แยกด้วย pathname:
 *   - /dashboard, /orders → คืน null: หน้าเหล่านี้มี header ของตัวเอง
 *     (SellerHeader ใน CommandCenter สำหรับ dashboard; search+filter+bell ใน
 *     OrdersList สำหรับ orders) → ไม่ต้องซ้อน topbar ที่นี่
 *   - อื่น ๆ → sub-page mode: back button + page title + bell
 *
 * Base: theme/paces/Admin/TS/src/layouts/components/TopBar/components/MenuToggler.tsx
 * Adapt: เปลี่ยนจาก hamburger toggle → dual-mode topbar (null-mode / sub-page mode)
 */

import { usePathname, useRouter } from 'next/navigation'

import Icon from '@/components/wrappers/Icon'

import { getSellerPageTitle } from './getSellerPageTitle'

type Props = {
  shopName: string
  avatarUrl: string | null
  /** Deep tier name ตาม SSOT เช่น "Deep Silver" */
  tierName: string
  /** Trust score 0–100 */
  trustScore: number
  /** ป้ายของ /orders ตามประเภทกิจการ — ต้องตรงกับ sidebar และแถบล่าง (คำนวณที่ layout) */
  orderLabel: string
}

const SellerMobileHeader = ({ orderLabel }: Props) => {
  const pathname = usePathname()
  const router = useRouter()

  // v8: /dashboard มี SellerHeader (น้ำเงิน) ของตัวเองใน CommandCenter (page content)
  // → layout topbar คืน null กัน header ซ้อน 2 อัน
  // /orders: หน้าเป็นเจ้าของ header เอง (search + filter + bell ใน OrdersList) → คืน null เช่นกัน
  // /products: เหมือน /orders (2026-08-06) — sticky header ของตัวเองใน ProductsListing
  // safe-area (2026-08-06, viewportFit:'cover'): หน้าเหล่านี้ไม่มี header ของ layout แต่เนื้อหา
  // เริ่มที่ขอบบนจอพอดี — /orders, /products มี header sticky ของตัวเองที่รับ inset ไปแล้ว
  // ส่วน /dashboard เป็นการ์ด hero ลอย ๆ ไม่มีใครรับ → คืน spacer สูงเท่า inset แทน null
  if (pathname === '/orders' || pathname === '/products') {
    return null
  }
  if (pathname === '/dashboard') {
    return <div aria-hidden="true" className="pt-[env(safe-area-inset-top)]" /> /* carve-out: safe-area ไม่มี token */
  }

  // ชื่อหน้ามาจาก longest-prefix match บน sellerMenuItems
  const pageTitle = getSellerPageTitle(pathname, orderLabel)

  // แท็บหลักใน bottom nav (orders/products/shop) = top-level destination → ไม่มีปุ่ม back/noti
  // back ไม่มีความหมายบนหน้าหลัก (สลับแท็บผ่าน bottom nav); noti เข้าได้จาก bell หน้า dashboard
  // หน้า drill-down (order detail, product edit ฯลฯ) ยังเป็น sub-page mode มี back ปกติ
  const PRIMARY_TABS = ['/orders', '/products', '/shop']
  const isPrimaryTab = PRIMARY_TABS.includes(pathname)

  /**
   * deep-link safe back:
   * กรณี user มาจาก deep-link โดยตรง (history.length === 1) → push /dashboard
   * แทน router.back() เพราะ back() จะออกแอปหรือไปหน้าอื่นที่ไม่ใช่ seller
   */
  const handleBack = () => {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push('/dashboard')
    }
  }

  return (
    /* sticky top + gradient fade ด้านล่าง (body-bg 80%→transparent) — flat บนพื้น body ไม่มี card ครอบ
       v8 fix: เดิม hardcode สี mist ของ Vuexy → ใช้ var(--color-body-bg) ของ Paces แทน */
    <header
      /* pt-[env(safe-area-inset-top)]: ตั้งแต่เปิด viewportFit:'cover' ที่ (paces)/layout.tsx
         (2026-08-06) webview กินพื้นที่ status bar ด้วย — หัวนี้ sticky top-0 จึงต้องเว้น inset
         เอง ไม่งั้นชื่อหน้าไปนอนใต้นาฬิกา. พื้นหลัง gradient ของ header เองเป็นตัวถมแถบนั้น */
      className="sticky top-0 z-20 pt-[env(safe-area-inset-top)]" /* carve-out: safe-area ไม่มี token */
      style={{ background: 'linear-gradient(180deg, var(--color-body-bg) 80%, transparent)' }}
      role="banner"
    >
      {/* flat flex row — ไม่มี card ครอบ ตาม v6 */}
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5">
        {/* Back button — เฉพาะ sub-page (drill-down); แท็บหลักไม่มี. w-11 h-11 = 44px touch */}
        {!isPrimaryTab && (
          <button
            type="button"
            className="w-11 h-11 rounded-lg inline-flex items-center justify-center shrink-0 text-default-700"
            aria-label="ย้อนกลับ"
            onClick={handleBack}
          >
            {/* arrow-left ชัดกว่า chevron สำหรับ "กลับ" semantic; text-xl (20px token) */}
            <Icon icon="arrow-left" className="text-xl" />
          </button>
        )}

        {/* Page title — แท็บหลัก: ชิดซ้ายตัวใหญ่ (app-style); sub-page: กึ่งกลาง (สมดุลกับ back+bell) */}
        <p
          className={`flex-1 min-w-0 truncate font-semibold text-default-900 ${
            isPrimaryTab ? 'text-left text-lg' : 'text-center text-md'
          }`}
        >
          {pageTitle}
        </p>

        {/* Bell — เฉพาะ sub-page; แท็บหลักไม่มี (noti เข้าได้จาก bell หน้า dashboard) */}
        {!isPrimaryTab && (
          <button
            type="button"
            className="w-11 h-11 rounded-lg relative inline-flex items-center justify-center shrink-0 text-default-700"
            aria-label="การแจ้งเตือน"
          >
            <Icon icon="bell" className="text-xl" />
            {/* dot bg-danger (token) + ring body-bg กัน dot ชน icon
                arbitrary size/offset: ตำแหน่ง+ขนาด dot 7px ไม่มี token แทน */}
            <span
              className="absolute w-[7px] h-[7px] rounded-full bg-danger ring-2 ring-[var(--color-body-bg)]" /* carve-out: จุดแจ้งเตือน 7px + ring สีพื้น body */
              style={{ top: '9px', right: '10px' }}
            />
          </button>
        )}
      </div>
    </header>
  )
}

export default SellerMobileHeader
