/**
 * หน้าตั้งค่าโปรไฟล์สาธารณะ (/public-profile) — 2026-07-26
 *
 * รวมสิ่งที่กำหนดว่า "คนนอกเห็นร้านเราเป็นยังไง" ไว้ที่เดียว ต่างจาก /shop ที่เป็นข้อมูล
 * ตั้งต้นของร้าน (ชื่อ โลโก้ ปก หมวดหมู่ ที่อยู่) — ที่นี่คือส่วนที่เลือกได้ว่าจะเอาอะไรไปโชว์
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/page.tsx
 *   — โครง PageBreadcrumb + card + card-header ของ Paces
 *
 * Server component — auth guard อยู่ที่ (dashboard)/layout.tsx แล้ว
 */
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import PageBreadcrumb from '@/components/PageBreadcrumb'

import ShopVideosClient from './components/ShopVideosClient'

export const metadata: Metadata = { title: 'โปรไฟล์สาธารณะ' }

export default async function PublicProfileSettingsPage() {
  const session = await getServerSession(authOptions)
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active?.shop) return null

  // ลิงก์ดูหน้าจริง — ต้องเป็น URL เต็มที่ชี้ไปโดเมนหลัก ไม่ใช่ path เปล่า
  //
  // หน้านี้อยู่บน subdomain seller ซึ่ง proxy เติม /seller นำหน้าทุก path (proxy.ts "Everything
  // else: rewrite to the internal /seller/* path tree") ถ้าใส่ href เป็น /b/{slug} เบราว์เซอร์
  // จะต่อกับ host เดิมได้ seller.<domain>/b/{slug} → โดน rewrite เป็น /seller/b/{slug} → 404
  // (บั๊กจริงที่ user เจอตอนกดปุ่มนี้)
  const host = (await headers()).get('host') ?? ''
  const rootHost = host.replace(/^seller\./, '')
  const proto = host.startsWith('localhost') || host.includes('.local') ? 'http' : 'https'
  const publicUrl = active.shop.slug ? `${proto}://${rootHost}/b/${active.shop.slug}` : null

  return (
    <>
      <PageBreadcrumb title="โปรไฟล์สาธารณะ" trail={[{ label: 'ภาพรวม' }]} />

      <div className="card mb-base">
        <div className="card-header">
          <h4 className="card-title">หน้าร้านที่คนนอกเห็น</h4>
        </div>
        <div className="card-body">
          <p className="text-default-500 text-sm">
            ชื่อร้าน โลโก้ ภาพหน้าปก และหมวดหมู่ ตั้งค่าได้ที่หน้าตั้งค่าร้านค้า
            ส่วนหน้านี้ใช้เลือกว่าจะเอาอะไรไปโชว์เพิ่ม
          </p>
          <div className="mt-base flex flex-wrap gap-2">
            <a className="btn bg-default-100 text-default-900 hover:bg-default-200" href="/shop">
              ตั้งค่าร้านค้า
            </a>
            {publicUrl && (
              <a
                className="btn bg-primary text-white hover:bg-primary-hover"
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                ดูหน้าร้านจริง
              </a>
            )}
          </div>
        </div>
      </div>

      <ShopVideosClient />
    </>
  )
}
