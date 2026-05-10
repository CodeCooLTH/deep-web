// Base: src/app/(paces)/seller/(fullscreen)/products/new/page.tsx (legacy structure)
// Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/page.tsx (Paces fullscreen pattern)
// V2 mockup route — marketplace post-composer style (no card shells in form body)
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
      <FullscreenPageHeader
        title="เพิ่มสินค้าใหม่"
        cancelHref="/products"
        saveLabel="บันทึก"
        saveFormId={FORM_ID}
      />
      <ProductFormV2 shopId={shop.id} formId={FORM_ID} />
    </>
  )
}
