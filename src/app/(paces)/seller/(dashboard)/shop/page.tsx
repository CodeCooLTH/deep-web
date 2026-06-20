/**
 * ตั้งค่าร้านค้า — Seller Shop Settings Page
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/settings/page.tsx
 *
 * โครงสร้าง: copy จาก Paces settings/page.tsx (stepper card layout)
 * ปรับ: โหลด shop จริงของ seller ผ่าน getShopByUserId, ส่ง prop ไป ShopForm
 * Strip: breadcrumb subtitle เปลี่ยนเป็นไทย, header icon คงไว้จาก version เดิม
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getShopByUserId } from '@/services/shop.service'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import ShopForm from './components/ShopForm'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { formatDateTime } from '@/lib/format-date'

export const metadata: Metadata = { title: 'ตั้งค่าร้าน' }

// แปลงอายุร้านเป็นข้อความไทยที่อ่านง่าย
function formatShopAge(createdAt: Date): string {
  const now = new Date()
  const diff = now.getTime() - new Date(createdAt).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return 'เปิดร้านวันนี้'
  if (days < 30) return `เปิดร้านมา ${days} วัน`
  if (days < 365) {
    const months = Math.floor(days / 30)
    return `เปิดร้านมา ${months} เดือน`
  }
  const years = Math.floor(days / 365)
  const remainMonths = Math.floor((days % 365) / 30)
  return remainMonths > 0
    ? `เปิดร้านมา ${years} ปี ${remainMonths} เดือน`
    : `เปิดร้านมา ${years} ปี`
}

export default async function ShopSettingsPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  let shop: any = null
  try {
    shop = await getShopByUserId(user.id)
  } catch {
    shop = null
  }

  const isExisting = !!shop
  const pageSubtext = isExisting
    ? `เปิดร้านเมื่อ ${formatDateTime(shop.createdAt)} — ${formatShopAge(shop.createdAt)}`
    : 'ตั้งค่าร้านค้าของคุณเพื่อเริ่มรับออเดอร์และสร้าง Trust Score'

  return (
    <>
      <PageBreadcrumb
        title="ตั้งค่าร้าน"
        trail={[{ label: 'ร้านค้า', href: '/shop' }]}
      />
      {/* ส่วนหัวหน้า — แสดง mode (สร้างใหม่ หรือ แก้ไข) และอายุร้าน */}
      <div className="mb-5">
        <p className="text-default-400 text-sm mt-0.5">{pageSubtext}</p>
      </div>

      {/* ShopForm รับ shop จริงของ seller — null = ยังไม่มีร้าน */}
      <ShopForm shop={shop} isExisting={isExisting} />
    </>
  )
}
