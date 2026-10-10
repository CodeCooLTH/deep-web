/**
 * ShopQuickLinks — รายการลิงก์ "เรื่องของร้าน" ในหน้า /shop (มือถือเท่านั้น)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/users/profile/components/ProfileCard.tsx:43-51
 *   (div.space-y-3 > div.flex.items-center.gap-3 + วงกลม size-8 rounded-full bg-light ครอบ Icon
 *    + ข้อความ text-sm) — ของ theme เป็นแถวข้อมูลอ่านอย่างเดียว
 * Widgets adapted: ทำให้แต่ละแถวเป็น <Link> กดได้ + เพิ่ม chevron ขวาสุดบอกว่าไปต่อได้
 *   + ใช้ divide-y แทน space-y เพื่อให้เป็นรายการเดียวกันแบบ list ของแอป ไม่ใช่ก้อนลอย ๆ
 *
 * ทำไมต้องมี: bottom nav ของมือถือเรียกแท็บนี้ว่า "ร้านค้า" แต่หน้านี้มีแค่ฟอร์มแก้ข้อมูลร้าน
 * ส่วนเรื่องอื่นของร้านอีก 5 เรื่องอยู่ในเมนู sidebar ซึ่ง `.seller-mobile-shell` ซ่อนทิ้งบนจอ
 * <1024px (safepay-overrides.css) — ผลคือบนมือถือ **เข้าไม่ถึงเลย**:
 *   ยืนยันตน / โปรไฟล์สาธารณะ / แพ็กเกจของฉัน / พนักงาน / บัญชีที่เชื่อมต่อ
 * (เมนูลัด 8 ช่องบนหน้า /dashboard ก็ไม่มี 4 ใน 5 เรื่องนี้ — มีแต่ "ตั้งค่า" ที่ชี้ /settings)
 *
 * สำคัญ: label + icon + url ทั้งหมดคัดมาจาก `_seller-menu.ts` ซึ่งเป็น SSOT ของเมนู seller
 * ห้ามตั้งคำใหม่ที่นี่ — ไม่งั้นผู้ใช้จะเจอชื่อเรียกของสิ่งเดียวกันสองแบบระหว่างมือถือกับเดสก์ท็อป
 * (เดสก์ท็อปเห็นจาก sidebar, มือถือเห็นจากรายการนี้)
 *
 * server component — เป็นลิงก์ล้วน ไม่มี state/handler จึงไม่ต้อง 'use client'
 * (Icon ข้างในเป็น client component; server component import ได้ตามปกติใน Next.js 16)
 */

import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { shopQuickLinks } from '@/lib/role-nav'

interface ShopQuickLinksProps {
  /**
   * url ของเมนูที่ผู้ใช้เห็นจริง (flattenSellerMenu ของ resolveSellerMenuItems — กรองบทบาท/ประเภทร้าน/App Store แล้ว)
   * แถวที่ไม่อยู่ในชุดนี้ไม่ render (00071 S-16) · `/account` แสดงเสมอ
   * 🛑 บังคับส่ง ไม่มี default — ลืม = ไม่มีแถวเลย ให้ tsc บังคับทุก call site
   */
  visibleUrls: ReadonlySet<string>
  /**
   * เปิดจากในแอป iOS → ต้องไม่มีทางเข้าหน้าแพ็กเกจเลย (App Store Guideline 3.1.1)
   *
   * 🛑 **ห้ามให้ค่าเริ่มต้นเป็น false** — ผู้เรียกที่ลืมส่งจะกลายเป็น "โชว์ทุกอย่าง" เงียบ ๆ
   * ซึ่งคือรูปร่างของบั๊กที่ prop นี้ถูกสร้างมาแก้พอดี ให้ tsc บังคับให้ส่งทุก call site
   */
  hidePayments: boolean
  /**
   * มีหน้าซื้อในแอป (IAP) ไหม — iOS ใช่ · Android ไม่ใช่ (`shouldOfferIap()` · 2026-10-01)
   * 🛑 บังคับส่งเหมือน `hidePayments` — ค่าเริ่มต้นแบบใดก็พังหนึ่งแพลตฟอร์ม
   */
  offerIap: boolean
  /**
   * feature 00070 — แถว "รายงานเข้ากลุ่ม LINE" · null = ซ่อนแถว (ไม่ใช่ owner / ไม่ได้ login)
   * hasAlert = มีกลุ่มที่ alert ยังไม่รับทราบ → จุดแดง
   * 🛑 ไม่มี default — ผู้เรียกที่ลืมส่ง = แถวหายเงียบ ให้ tsc บังคับทุก call site (เหมือน hidePayments)
   */
  lineReports: { hasAlert: boolean } | null
}

interface QuickLink {
  url: string
  label: string
  icon: string
  /** คำอธิบายสั้น — ช่วยให้คนที่ไม่รู้ว่าเมนูนี้คืออะไรตัดสินใจได้โดยไม่ต้องกดเข้าไปดู */
  hint: string
}

// คัดจาก _seller-menu.ts (SSOT) — เรียงตาม "ความถี่ที่ผู้ขายต้องใช้" ไม่ใช่ตามลำดับในเมนู
const LINKS: QuickLink[] = [
  // feature 00026 — วางไว้แรกสุด: เป็นของ "ตัวคน" ไม่ใช่ของร้าน คนที่มาหาการตั้งค่าตัวเอง
  // จะเจอทันทีโดยไม่ต้องกวาดสายตาผ่านรายการที่เป็นเรื่องร้านทั้งหมดก่อน
  { url: '/account', label: 'ข้อมูลส่วนตัว', icon: 'user-circle', hint: 'ชื่อ รูป และวิธีเข้าสู่ระบบ' },
  // ป้ายต้องตรงกับ seller-menu.ts เป๊ะ — ผู้ใช้เห็นทั้งสองที่บนอุปกรณ์คนละตัว คำต่างกันเมื่อไร
  // จะกลายเป็นคนละของทันที (เปลี่ยนพร้อมกัน 2026-08-04: ยืนยันตน→ระดับร้าน, โปรไฟล์สาธารณะ→ตั้งค่าหน้าร้าน)
  { url: '/verification', label: 'ระดับร้าน', icon: 'shield-check', hint: 'เพิ่มความน่าเชื่อถือให้ร้าน' },
  { url: '/public-profile', label: 'ตั้งค่าหน้าร้าน', icon: 'world', hint: 'เลือกสิ่งที่จะแสดงให้ลูกค้าเห็น' },
  { url: '/subscriptions', label: 'แพ็กเกจของฉัน', icon: 'crown', hint: 'แพ็กเกจธุรกิจและสต็อก' },
  { url: '/settings', label: 'การจัดส่ง', icon: 'truck-delivery', hint: 'เชื่อมต่อขนส่งและที่อยู่ผู้ส่ง' },
]

/**
 * 🛑 ทางเข้าหน้าจ่ายเงิน **ที่ไม่ผ่าน Apple** — ต้องหายทั้งแถวเมื่อเปิดจากในแอป (Guideline 3.1.1)
 *
 * ## ทำไมชุดนี้ว่างตั้งแต่ feature 00064
 *
 * เดิมมี `/subscriptions` อยู่ในนี้ เพราะตอนนั้นมันพาไปหน้าที่ **หักกระเป๋าเงิน** ซึ่งผิด 3.1.1
 * (บั๊กจริงที่หัวหน้าเจอ 2026-08-19: เมนูโผล่ในแอป กดแล้วเด้งกลับหน้าแรก)
 *
 * ตอนนี้ `/subscriptions` ในแอปเด้งไป `/business/subscribe` ที่ **ซื้อผ่าน Apple** ⇒ ถูกกฎแล้ว
 * และ **ต้องไม่กรองทิ้ง** เพราะการ์ดนี้คือเมนูฝั่งร้าน **เพียงทางเดียวบนมือถือ**
 * (sidebar เป็นของเดสก์ท็อป — call-site ครอบ `lg:hidden` ไว้) ⇒ กรองทิ้ง = แอป iOS
 * ไม่มีทางไปถึงหน้าซื้อเลย **รวมทั้งทีมรีวิวของ Apple** ซึ่งจะสรุปว่าเรายังไม่ได้ทำ IAP
 *
 * 🛑 กลไกยังอยู่โดยตั้งใจ — ลิงก์จ่ายเงินตัวใหม่ที่ **ไม่ผ่าน Apple** (เช่น เติมเงินกระเป๋า)
 * ต้องเติม url ลงชุดนี้เสมอ · ดู `iap-entry-point-in-app.test.ts` และ `no-payment-entry-in-app.test.ts`
 */
const PAYMENT_LINK_URLS = new Set<string>([])

/**
 * 🛑 ทางเข้าหน้าซื้อ **ผ่าน IAP** — มีปลายทางที่ถูกกฎเฉพาะแพลตฟอร์มที่มี IAP (iOS)
 *
 * Android ห้ามจ่ายเงินในแอปเหมือน iOS แต่ **ไม่มี IAP** (user สั่ง 2026-10-01) ⇒ แถวนี้บน Android
 * จะพาไปหน้าซื้อที่คุยกับ StoreKit ซึ่งไม่มีอยู่ (`/subscriptions` เด้งกลับหน้าแรกแล้ว) ⇒ ซ่อน
 * ส่วน iOS ต้องเก็บไว้ตามเหตุผลด้านบน — ทางเข้าพอดี 1 ทาง
 */
const IAP_LINK_URLS = new Set<string>(['/subscriptions'])

// เมนู "พนักงาน" — สิทธิ์ตัดสินที่ applyCapabilityMenu (เจ้าของร้านธุรกิจเท่านั้น) แถวนี้แค่ตามเมนู
const STAFF_LINK: QuickLink = {
  url: '/admins',
  label: 'พนักงาน',
  icon: 'users-group',
  hint: 'เชิญและจัดการทีมงาน',
}

// feature 00070 — label/icon/url ตรง seller-menu.ts slug `seller:line-reports` เป๊ะ
// 🛑 ไม่อยู่ใน LINKS/PAYMENT_LINK_URLS/IAP_LINK_URLS โดยตั้งใจ: แถวนี้ไม่มีทางจ่ายเงิน (ถูก 3.1.1 ทุกเชลล์)
// จึงต้องไม่ถูกกรองด้วย hidePayments/offerIap — แทรกแบบมีเงื่อนไข lineReports !== null แทน
const LINE_REPORTS_LINK: QuickLink = {
  url: '/business/line-reports',
  label: 'รายงานเข้ากลุ่ม LINE',
  icon: 'brand-line',
  hint: 'สรุปยอดเข้ากลุ่ม LINE ของทีม',
}

const BY_URL = new Map<string, QuickLink>(
  [...LINKS, LINE_REPORTS_LINK, STAFF_LINK].map((l) => [l.url, l]),
)

export default function ShopQuickLinks({ visibleUrls, hidePayments, offerIap, lineReports }: ShopQuickLinksProps) {
  // ลำดับ + สิทธิ์มาจาก shopQuickLinks (เมนูที่เห็นจริง) · ชั้น App Store เดิมยังกรองซ้ำเป็นเข็มขัดนิรภัย
  // แถวรายงาน LINE ต้องผ่านทั้งเมนูและ lineReports (ผู้เรียกบอกว่าเป็นเจ้าของ/มีกลุ่ม) — null = ซ่อน
  const shown = shopQuickLinks(visibleUrls)
    .filter((u) => u !== LINE_REPORTS_LINK.url || lineReports !== null)
    .map((u) => BY_URL.get(u)!)
    .filter((l) => !hidePayments || (!PAYMENT_LINK_URLS.has(l.url) && (offerIap || !IAP_LINK_URLS.has(l.url))))
  const links = [LINKS[0], ...shown]

  return (
    /* -mx-4: edge-to-edge เท่ากับการ์ดอื่นในหน้านี้ (หักล้าง gutter 16px ของ shell)
       call-site ครอบ lg:hidden ไว้แล้ว — การ์ดนี้ไม่มีบนเดสก์ท็อป (sidebar ทำหน้าที่นี้แทน) */
    <div className="card mt-4 -mx-4">
      <div className="card-header">
        <h5 className="bg-light/15 border-default-300 flex w-full items-center justify-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium">
          จัดการร้าน
        </h5>
      </div>

      {/* divide-y: เส้นคั่นระหว่างแถว ทำให้อ่านเป็น "รายการ" ไม่ใช่ปุ่มลอย ๆ
          ไม่ใส่ card-body เพราะอยากให้แถวกินความกว้างเต็มการ์ด (แตะง่ายขึ้นบนมือถือ)
          padding ไปอยู่ที่แต่ละแถวแทน */}
      <div className="divide-default-200 divide-y">
        {links.map((link) => (
          <Link
            key={link.url}
            href={link.url}
            /* py-3 + ไอคอน size-8 → สูงราว 56px เกินเกณฑ์ tap target 44px ของโปรเจกต์ */
            className="hover:bg-default-100 flex items-center gap-3 px-4 py-3"
          >
            <div className="bg-light flex size-8 shrink-0 items-center justify-center rounded-full">
              <Icon icon={link.icon} className="text-lg" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-default-900 truncate text-sm font-medium">{link.label}</p>
              <p className="text-default-400 truncate text-xs">{link.hint}</p>
            </div>
            {lineReports?.hasAlert && link.url === LINE_REPORTS_LINK.url && (
              <>
                <span aria-hidden="true" className="bg-danger size-2.5 shrink-0 rounded-full" />
                <span className="sr-only">มีกลุ่มที่ต้องดูแล</span>
              </>
            )}
            <Icon icon="chevron-right" className="text-default-400 shrink-0" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  )
}
