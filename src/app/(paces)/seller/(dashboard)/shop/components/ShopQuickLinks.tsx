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

interface ShopQuickLinksProps {
  /** ประเภทร้านที่กำลังเปิดอยู่ — ใช้ตัดสินว่าจะโชว์เมนู "พนักงาน" ไหม */
  shopKind: 'PERSONAL' | 'BUSINESS'
  /** บทบาทใน active shop */
  shopRole: 'OWNER' | 'ADMIN'
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
  { url: '/verification', label: 'ยืนยันตน', icon: 'shield-check', hint: 'เพิ่มความน่าเชื่อถือให้ร้าน' },
  { url: '/public-profile', label: 'โปรไฟล์สาธารณะ', icon: 'world', hint: 'หน้าร้านที่ลูกค้าเห็น' },
  { url: '/subscriptions', label: 'แพ็กเกจของฉัน', icon: 'crown', hint: 'แพ็กเกจธุรกิจและสต็อก' },
  { url: '/settings', label: 'การจัดส่ง', icon: 'truck-delivery', hint: 'เชื่อมต่อขนส่งและที่อยู่ผู้ส่ง' },
]

// เมนู "พนักงาน" เห็นเฉพาะ owner ของร้าน BUSINESS — เงื่อนไขเดียวกับ applyStaffMenu()
// ใน _seller-menu.ts เป๊ะ (ซ่อน ไม่ใช่ disable เพราะ role อื่นไม่มี use-case ให้เห็นเลย)
const STAFF_LINK: QuickLink = {
  url: '/admins',
  label: 'พนักงาน',
  icon: 'users-group',
  hint: 'เชิญและจัดการทีมงาน',
}

export default function ShopQuickLinks({ shopKind, shopRole }: ShopQuickLinksProps) {
  const links = shopKind === 'BUSINESS' && shopRole === 'OWNER' ? [...LINKS, STAFF_LINK] : LINKS

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
            <Icon icon="chevron-right" className="text-default-400 shrink-0" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  )
}
