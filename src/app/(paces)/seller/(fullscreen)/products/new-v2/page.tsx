/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/page.tsx
 *
 * Page shell re-sourced from product-add layout:
 *   - (fullscreen) route group แทน PageBreadcrumb ด้วย FullscreenPageHeader (sticky top bar)
 *   - grid grid-cols-1 lg:grid-cols-3 gap-base ตาม product-add 2-col structure
 *   - ProductFormV2 เป็น domain component ไม่มี 1:1 theme equivalent
 *     (render ด้วย internal split layout 3fr/2fr + preview panel; ดู JSDoc ใน ProductFormV2.tsx)
 *   - ปุ่ม Discard/Save อยู่ใน FullscreenPageHeader ซึ่ง sticky top
 *     (product-add theme ใช้ Link ล่างสุด; fullscreen ย้าย action bar ไป top ตาม SafePay convention)
 *
 * Corrections: wrong Base citation (src/...) ถูกแก้ไขเป็น theme/... path นี้
 */
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getShopByUserId } from '@/services/shop.service'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import type { Metadata } from 'next'
import ProductFormV2 from '@/app/(paces)/seller/(dashboard)/products/components/ProductFormV2'
import FullscreenPageHeader from '@/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader'

export const metadata: Metadata = { title: 'เพิ่มสินค้าใหม่' }

const FORM_ID = 'product-form-v2'

export default async function NewProductV2Page() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  let shop: any = null
  try {
    shop = await getShopByUserId(user.id)
  } catch {
    shop = null
  }

  if (!shop) {
    return (
      <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
        <Icon
          icon="tabler:building-store"
          width={64}
          height={64}
          className="text-warning mx-auto mb-4"
        />
        <h2 className="text-dark mb-2 text-xl font-bold">ยังไม่มีร้านค้า</h2>
        <p className="text-default-400 mb-6">เปิดร้านก่อนนะคะ ถึงจะเพิ่มสินค้าได้</p>
        <Link
          href="/shop"
          className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white"
        >
          <Icon icon="tabler:plus" width={18} height={18} />
          เปิดร้าน
        </Link>
      </div>
    )
  }

  return (
    <>
      {/*
        FullscreenPageHeader แทน PageBreadcrumb + bottom action buttons ของ theme
        product-add มี Link Discard/Save as Draft/Publish ล่างสุด —
        fullscreen ย้าย actions ไป sticky top bar เพื่อ UX ที่ดีกว่าบน mobile
      */}
      <FullscreenPageHeader
        title="เพิ่มสินค้าใหม่"
        cancelHref="/products"
        saveLabel="บันทึก"
        saveFormId={FORM_ID}
      />
      {/*
        ProductFormV2 เป็น domain component ที่ implement 2-col layout (3fr/2fr) ภายใน
        ตาม product-add ซ้าย = fields, ขวา = preview panel (ProductPreviewPanel)
        ดู JSDoc ใน ProductFormV2.tsx สำหรับ domain-component note
      */}
      <ProductFormV2 shopId={shop.id} formId={FORM_ID} />
    </>
  )
}
