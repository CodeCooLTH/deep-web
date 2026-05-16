/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/page.tsx
 *
 * Page shell re-sourced from product-add layout:
 *   - (fullscreen) route group แทน PageBreadcrumb ด้วย FullscreenPageHeader (sticky top bar)
 *   - ProductForm มี grid grid-cols-1 lg:grid-cols-3 gap-6 ภายใน (ซ้าย: info+image, ขวา: price+type)
 *     ซึ่ง map กับ product-add 2-col structure (left: ProductInformation+ProductImage, right: Pricing+Organize)
 *   - ปุ่ม Discard/Save ย้ายจาก bottom Link ของ theme ไปอยู่ใน FullscreenPageHeader (sticky top)
 *
 * Note: ProductForm เป็น SafePay domain form (ไม่มี 1:1 theme equivalent)
 *   — ดู JSDoc ใน ProductForm.tsx. Preserve submit/validation/redirect wiring ทุกบรรทัด.
 */
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getShopByUserId } from '@/services/shop.service'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import type { Metadata } from 'next'
import ProductForm from '@/app/(paces)/seller/(dashboard)/products/components/ProductForm'
import FullscreenPageHeader from '@/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader'

export const metadata: Metadata = { title: 'เพิ่มสินค้า' }

const FORM_ID = 'product-form'

export default async function NewProductPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  // explicit /seller/auth/sign-in — server redirect ไม่ผ่าน proxy rewrite
  if (!user) redirect('/seller/auth/sign-in')

  let shop: any = null
  try {
    shop = await getShopByUserId(user.id)
  } catch {
    shop = null
  }

  if (!shop) {
    return (
      <div className="card p-10 rounded-xl text-center max-w-2xl mx-auto">
        <Icon icon="tabler:building-store" width={64} height={64} className="text-warning mx-auto mb-4" />
        <h2 className="text-xl font-bold text-dark mb-2">ยังไม่มีร้านค้า</h2>
        <p className="text-default-400 mb-6">ต้องสร้างร้านก่อนจึงจะเพิ่มสินค้าได้</p>
        <Link
          href="/seller/shop"
          className="btn bg-primary px-6 py-3 font-semibold text-white hover:bg-primary-hover inline-flex items-center gap-2"
        >
          <Icon icon="tabler:plus" width={18} height={18} />
          สร้างร้านค้า
        </Link>
      </div>
    )
  }

  return (
    <>
      {/*
        FullscreenPageHeader แทน PageBreadcrumb + bottom action buttons ของ theme
        product-add มี Link Discard/Save as Draft/Publish ล่างสุด —
        fullscreen ย้าย actions ไป sticky top bar
      */}
      <FullscreenPageHeader
        title="เพิ่มสินค้า"
        subtitle="กรอกข้อมูลสินค้าใหม่"
        cancelHref="/seller/products"
        saveFormId={FORM_ID}
      />
      {/*
        ProductForm มี 2-col layout ภายใน: lg:col-span-2 (info+image) + col-span-1 (pricing+type)
        ตรงกับ product-add 2-col: left ProductInformation+ProductImage, right Pricing+Organize
      */}
      <ProductForm shopId={shop.id} formId={FORM_ID} />
    </>
  )
}
