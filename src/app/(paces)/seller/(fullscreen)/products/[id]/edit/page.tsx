import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getShopByUserId } from '@/services/shop.service'
import { prisma } from '@/lib/prisma'
import { serializeProduct } from '@/services/product.service'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import type { Metadata } from 'next'
import ProductFormV2 from '@/app/(paces)/seller/(dashboard)/products/components/ProductFormV2'
import FullscreenPageHeader from '@/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader'

export const metadata: Metadata = { title: 'แก้ไขสินค้า' }

const FORM_ID = 'product-form'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params

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
      <div className="card p-10 rounded-xl text-center max-w-2xl mx-auto">
        <Icon icon="mdi:storefront-off-outline" width={64} height={64} className="text-warning mx-auto mb-4" />
        <h2 className="text-xl font-bold text-dark mb-2">ยังไม่มีร้านค้า</h2>
        <p className="text-default-400 mb-6">ต้องสร้างร้านก่อนจึงจะเพิ่มสินค้าได้</p>
        <Link
          href="/shop"
          className="btn bg-primary px-6 py-3 font-semibold text-white hover:bg-primary-hover inline-flex items-center gap-2"
        >
          <Icon icon="mdi:plus" width={18} height={18} />
          สร้างร้านค้า
        </Link>
      </div>
    )
  }

  // Fetch product and verify it belongs to this shop (security: prevent editing other shops' products)
  // ใช้ serializeProduct เพื่อแปลง Decimal/Date/Json ให้ RSC ส่งผ่านไปยัง
  // client component (ProductForm) ได้โดยไม่ต้อง cast ด้วยมือ
  const productRaw = await prisma.product.findUnique({
    where: { id },
    include: { tags: true },
  })

  if (!productRaw || productRaw.shopId !== shop.id) {
    notFound()
  }

  const product = serializeProduct(productRaw)

  return (
    <>
      <FullscreenPageHeader
        title="แก้ไขสินค้า"
        subtitle={product.name}
        cancelHref="/products"
        saveFormId={FORM_ID}
      />
      <ProductFormV2
        shopId={shop.id}
        product={product}
        formId={FORM_ID}
      />
    </>
  )
}
