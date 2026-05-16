/**
 * สร้างออเดอร์ใหม่ — fullscreen form
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx
 * โครงสร้าง card + grid ได้จาก Paces order-add; wiring (submit/validate/redirect) คงเดิม.
 * ตัด Flatpickr date (ใช้ server timestamp แทน).
 */

import { getProductsByShop } from '@/services/product.service'
import { getShopByUserId } from '@/services/shop.service'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import OrderCreateForm, { type CatalogProduct } from '@/app/(paces)/seller/(dashboard)/orders/new/components/OrderCreateForm'
import Icon from '@/components/wrappers/Icon'
import FullscreenPageHeader from '@/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader'

export const metadata: Metadata = { title: 'สร้างออเดอร์' }

const FORM_ID = 'order-create-form'

export default async function NewOrderPage() {
  // auth guard อยู่ใน (fullscreen)/layout.tsx แล้ว — ดึง session เพื่อใช้ userId เท่านั้น
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user as { id: string; displayName: string } | undefined

  let shop: { id: string; shopName: string } | null = null
  try {
    shop = await getShopByUserId(user!.id)
  } catch {
    shop = null
  }

  // ร้านถูกสร้างอัตโนมัติใน layout ถ้ายังไม่มี — กรณีนี้ไม่ควรเกิด แต่แสดง fallback เพื่อความปลอดภัย
  if (!shop) {
    return (
      <div className="card p-10 rounded-xl text-center max-w-2xl mx-auto">
        <Icon
          icon="building-store"
          width={64}
          height={64}
          className="text-warning mx-auto mb-4"
        />
        <h2 className="text-xl font-bold text-dark mb-2">ยังไม่มีร้านค้า</h2>
        <p className="text-default-400 mb-6">ต้องสร้างร้านก่อนจึงจะสร้างออเดอร์ได้</p>
        <Link
          href="/seller/shop"
          className="btn bg-primary px-6 py-3 font-semibold text-white hover:bg-primary-hover inline-flex items-center gap-2"
        >
          <Icon icon="plus" width={18} height={18} />
          ตั้งค่าร้านค้า
        </Link>
      </div>
    )
  }

  let catalog: CatalogProduct[] = []
  try {
    const products = await getProductsByShop(shop.id)
    catalog = products.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      price: Number(p.price),
      type: p.type,
      image: Array.isArray(p.images) && p.images.length > 0 ? `/api/files/${p.images[0]}` : null,
    }))
  } catch {
    catalog = []
  }

  return (
    <>
      {/* Header sticky ด้านบน พร้อมปุ่ม submit ที่ชี้ form id */}
      <FullscreenPageHeader
        title="สร้างออเดอร์"
        subtitle={`ร้าน ${shop.shopName}`}
        cancelHref="/seller/orders"
        saveFormId={FORM_ID}
        saveLabel="บันทึกออเดอร์"
      />
      {/* Form body — Paces order-add card pattern */}
      <OrderCreateForm shopId={shop.id} catalog={catalog} formId={FORM_ID} />
    </>
  )
}
