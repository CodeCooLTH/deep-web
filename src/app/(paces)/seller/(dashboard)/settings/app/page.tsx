/**
 * /settings/app — "ตั้งค่าแอป" ของแอป Deep ผู้ขาย (feature 00088 · user เลือก 2026-11-02)
 *
 * เดิมเป็นหน้า native ในแอป ⇒ หัว/กระดิ่ง/แถบล่าง/ธีมไม่เหมือนหน้าอื่น — ย้ายมาเป็นหน้าเว็บใต้ (dashboard)
 * จึงได้ SellerMobileHeader + แถบล่างชุดเดียวกับทุกหน้า · ค่าโหมดแชทยังเก็บในเครื่อง (แอป) ผ่าน native-bridge
 * เปิดนอกแอป = การ์ดบอกว่าใช้ได้ในแอปเท่านั้น (ทางเข้าคือแถวท้าย "จัดการร้าน" ซึ่งเห็นเฉพาะในแอป)
 */
import type { Metadata } from 'next'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import ChatModeCard from './components/ChatModeCard'

export const metadata: Metadata = { title: 'ตั้งค่าแอป' }

export default function AppSettingsPage() {
  return (
    <>
      {/* breadcrumb เดสก์ท็อปเท่านั้น — มือถือ SellerMobileHeader แสดงชื่อหน้าแล้ว (เหมือน account/page.tsx) */}
      <div className="hidden lg:block">
        <PageBreadcrumb title="ตั้งค่าแอป" trail={[{ label: 'ร้านค้า', href: '/shop' }]} />
      </div>
      <ChatModeCard />
    </>
  )
}
