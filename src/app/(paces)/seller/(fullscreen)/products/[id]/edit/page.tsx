/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/page.tsx
 *
 * Page shell re-sourced from product-add layout (edit variant — pre-populated form):
 *   - (fullscreen) route group: PageBreadcrumb ถูกแทนด้วย FullscreenPageHeader (sticky top bar)
 *   - grid structure เดิม (product-add): 2-col left=fields, right=pricing+organize
 *     ถูก implement ภายใน ProductFormV2 (split 3fr/2fr + preview panel)
 *   - ปุ่ม Discard/Save/Publish ของ theme อยู่ล่างสุด; fullscreen ย้าย actions ไป top bar
 *   - "Publish" label เปลี่ยนเป็น "บันทึก" (edit context) ผ่าน FullscreenPageHeader default
 *
 * Product-load wiring:
 *   - fetch product by id + include tags ผ่าน prisma.product.findUnique
 *   - verify shopId ownership (ป้องกัน editor แก้ product ของร้านอื่น)
 *   - serializeProduct แปลง Decimal/Date/Json → plain object ก่อนส่ง RSC → client
 *   - ส่ง product prop ไปยัง ProductFormV2 → form pre-populate ผ่าน useEffect defaultValues
 *
 * Update wiring: ProductFormV2 detect product prop → ส่ง PATCH /api/products/{id}
 * Redirect after save: router.push('/products') ผ่าน ProductFormV2
 */
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getShopByUserId } from '@/services/shop.service'
import { isEntitlementActive } from '@/services/inventory-entitlement.service'
import { prisma } from '@/lib/prisma'
import { serializeProduct } from '@/services/product.service'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import ProductFormV2 from '@/app/(paces)/seller/(dashboard)/products/components/ProductFormV2'
import FullscreenPageHeader from '@/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader'
import Icon from '@/components/wrappers/Icon'

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

  // ร้านยังไม่มี — ไม่มี product ให้แก้ไข → แจ้งและลิงก์ไปสร้างร้าน
  if (!shop) {
    return (
      <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
        <Icon
          icon="tabler:building-store-off"
          width={64}
          height={64}
          className="text-warning mx-auto mb-4"
        />
        <h2 className="text-dark mb-2 text-xl font-bold">ยังไม่มีร้านค้า</h2>
        <p className="text-default-400 mb-6">ต้องสร้างร้านก่อนจึงจะแก้ไขสินค้าได้</p>
        <Link
          href="/shop"
          className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white"
        >
          <Icon icon="tabler:plus" width={18} height={18} />
          สร้างร้านค้า
        </Link>
      </div>
    )
  }

  // Fetch product + verify ownership (security: กัน seller แก้ product ของร้านอื่น)
  // serializeProduct แปลง Decimal/Date/Json → plain object ให้ RSC ส่งผ่าน boundary ได้
  // DAL pattern: bake shopId filter เข้า query — กัน RSC flight-data leak
  const productRaw = await prisma.product.findFirst({
    where: { id, shopId: shop.id },
    include: { tags: true },
  })

  if (!productRaw) {
    notFound()
  }

  const product = serializeProduct(productRaw)

  // Inventory Add-on entitlement — fail-closed: error ใด ๆ ระหว่าง resolve ถือว่าไม่ active
  // (ซ่อน field stockQty แทนที่จะเสี่ยงเปิดให้กรอกทั้งที่ยังไม่ได้ subscribe)
  // shop.id ตรงกับ shop ของ product อยู่แล้ว เพราะ query ด้านบนกรองด้วย shopId: shop.id
  const entitlementActive = await isEntitlementActive(shop.id).catch(() => false)

  return (
    <>
      {/*
        FullscreenPageHeader แทน PageBreadcrumb + bottom buttons ของ product-add theme
        "Publish" (theme) → "บันทึก" (edit context) ผ่าน default saveLabel ของ FullscreenPageHeader
        cancelHref → /products (proxy rewrite ครอบ → /seller/products บน seller subdomain)
      */}
      <FullscreenPageHeader
        title="แก้ไขสินค้า"
        subtitle={product.name}
        cancelHref="/products"
        saveFormId={FORM_ID}
      />
      {/*
        ProductFormV2 detect product prop → mode edit → PATCH /api/products/{id}
        layout split 3fr/2fr + preview panel implement ภายใน ProductFormV2
        ดู JSDoc ใน ProductFormV2.tsx สำหรับ layout และ validation details
      */}
      <ProductFormV2
        shopId={shop.id}
        product={product}
        formId={FORM_ID}
        entitlementActive={entitlementActive}
      />
    </>
  )
}
