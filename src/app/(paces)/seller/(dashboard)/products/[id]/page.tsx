/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-details/page.tsx
 * 3-col card layout: ซ้าย ProductDisplay, ขวา (col-span-2) ProductDetails + ProductReviews
 * ข้อมูล product + reviews มาจาก real DB — ไม่มี demo data
 */

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getShopByUserId } from '@/services/shop.service'
import { getOrdersByShop } from '@/services/order.service'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import ProductDisplay from './components/ProductDisplay'
import ProductDetails from './components/ProductDetails'
import ProductReviews from './components/ProductReviews'
import type { ProductDetailProps, ReviewRow } from './components/data'

export const metadata: Metadata = { title: 'รายละเอียดสินค้า' }

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  const shop = await getShopByUserId(user.id)
  if (!shop) redirect('/shop')

  const product = await prisma.product.findUnique({ where: { id } })
  if (!product || product.shopId !== shop.id) notFound()

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
      <PageBreadcrumb title={product.name} trail={[{ label: 'Business' }, { label: 'สินค้า', href: '/products' }]} />
      {/* 3-col card layout ตาม Paces theme: ซ้าย display, ขวา details + reviews */}
      <div className="card">
        <div className="card-body">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-base">
            <div>
              <ProductDisplay product={productProps} />
            </div>
            <div className="lg:col-span-2">
              <div className="md:p-7.5">
                <ProductDetails product={productProps} />
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
