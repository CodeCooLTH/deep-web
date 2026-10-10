/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-details/page.tsx
 * 3-col card layout: ซ้าย ProductDisplay, ขวา (col-span-2) ProductDetails + ProductReviews
 * ข้อมูล product + reviews มาจาก real DB — ไม่มี demo data
 */

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireActiveShop } from '@/lib/shop-context'
import { resolveProductVocab } from '@/lib/seller-menu'
import { getOrdersByShop } from '@/services/order.service'
import { notFound, redirect } from 'next/navigation'
import { productPageMetadata } from '@/lib/product-page-title'
import { getServerSession } from 'next-auth'
import ProductDisplay from './components/ProductDisplay'
import ProductDetails from './components/ProductDetails'
import ProductReviews from './components/ProductReviews'
import type { ProductDetailProps, ReviewRow } from './components/data'
import { gatePage } from '@/lib/shop-capability'
import { isBillingOnlyFor } from '@/lib/order-role-rules'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'

// ชื่อแท็บผันตามประเภทกิจการ (ร้านบริการ = 'บริการและสินค้า') — ดู lib/product-page-title.ts
export const generateMetadata = () => productPageMetadata('detail')

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  // 00071 P3 (P1): บทบาทที่ไม่มีสิทธิ์เห็นการ์ดบอกเหตุผล ไม่ใช่หน้าว่าง/404 เงียบ — ตัดก่อน query ข้อมูลของหน้า
  const gate = await gatePage(session, 'P1')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return <NoPermissionCard capability="P1" viewerRoles={await viewerRolesOf(session)} />
  }
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  // Phase 4: resolve active shop (Personal หรือ Business ตาม context ที่สลับ) — membership guard ได้ฟรี
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
  if (!active) redirect('/shop')
  const shop = active.shop
  // คำเรียกของที่ร้านขาย ผันตามประเภทกิจการ (ONLINE_SALES/LODGING = "สินค้า" เดิม)
  const { productNoun } = resolveProductVocab(shop.vertical)

  // DAL pattern: bake shopId filter เข้า query — กัน RSC flight-data leak
  const product = await prisma.product.findFirst({ where: { id, shopId: shop.id } })
  // P1 ของผู้เปิดบิล = เฉพาะบริการ — สินค้าประเภทอื่นเปิดตรงด้วย id ก็ต้องไม่เห็น
  if (!product || (gate.ok && isBillingOnlyFor(gate.roles, 'P1') && product.type !== 'SERVICE')) notFound()

  // Derive review stats + total sold from orders
  let orders: any[] = []
  try {
    orders = await getOrdersByShop(shop.id)
  } catch {
    orders = []
  }

  // รวม sold count และ reviews สำหรับ product นี้
  let totalSold = 0
  const reviewRows: ReviewRow[] = []

  orders
    .filter((o: any) => o.status === 'CONFIRMED')
    .forEach((o: any) => {
      if (!Array.isArray(o.items)) return
      const hasThisProduct = o.items.some((item: any) => item.productId === id)
      if (!hasThisProduct) return

      // นับจำนวนที่ขายได้สำหรับ product นี้
      o.items.forEach((item: any) => {
        if (item.productId === id) {
          totalSold += item.qty ?? 1
        }
      })

      // เก็บ review ของ order นี้
      if (o.review) {
        const review = o.review
        let reviewerLabel = 'ลูกค้า'
        if (o.buyerContact) {
          // Mask ตาม PDPA: แสดงเฉพาะ 4 ตัวท้าย — เหมือนกับ CustomerDetails และ customers/page
          // (ไม่แยก local/domain ของ email เพื่อไม่รั่ว domain และตัวแรกของ local part)
          const contact = String(o.buyerContact)
          reviewerLabel = contact.length <= 4
            ? contact || 'ลูกค้า'
            : '•'.repeat(Math.max(0, contact.length - 4)) + contact.slice(-4)
        }
        reviewRows.push({
          id: review.id,
          rating: review.rating,
          comment: review.comment ?? '',
          reviewerLabel,
          // ส่ง ISO string เพื่อหลีกเลี่ยง Date serialization error ระหว่าง RSC → client
          createdAt: review.createdAt instanceof Date
            ? review.createdAt.toISOString()
            : String(review.createdAt),
        })
      }
    })

  // คำนวณ rating stats
  const totalReviews = reviewRows.length
  const avgRating =
    totalReviews > 0
      ? reviewRows.reduce((sum, r) => sum + r.rating, 0) / totalReviews
      : 0

  // สรุปการกระจาย rating 1–5 ดาว
  const ratingBreakdown = [5, 4, 3, 2, 1].map((stars) => {
    const count = reviewRows.filter((r) => Math.round(r.rating) === stars).length
    const progress = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0
    return { stars, count, progress }
  })

  // Build product props — coerce Decimal → number เพื่อ serialization ข้าม RSC boundary
  const productProps: ProductDetailProps = {
    id: product.id,
    name: product.name,
    description: product.description ?? '',
    images: Array.isArray(product.images) ? (product.images as string[]) : [],
    price: Number(product.price),
    type: (product.type as ProductDetailProps['type']) ?? 'PHYSICAL',
    totalSold,
    reviews: totalReviews,
    rating: avgRating,
    // ส่ง ISO string เพื่อหลีกเลี่ยง Date serialization error
    createdAt: product.createdAt instanceof Date
      ? product.createdAt.toISOString()
      : String(product.createdAt),
  }

  return (
    <>
      <PageBreadcrumb title={product.name} trail={[{ label: 'การขาย' }, { label: productNoun, href: '/products' }]} />
      {/* 3-col card layout ตาม Paces theme: ซ้าย display, ขวา details + reviews */}
      <div className="card">
        <div className="card-body">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-base">
            <div>
              <ProductDisplay product={productProps} />
            </div>
            <div className="lg:col-span-2">
              <div className="md:p-7.5">
                <ProductDetails product={productProps} vertical={shop.vertical} />
                <div className="mt-10 md:mt-15">
                  <ProductReviews
                    reviews={reviewRows}
                    avgRating={avgRating}
                    totalReviews={totalReviews}
                    ratingBreakdown={ratingBreakdown}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
