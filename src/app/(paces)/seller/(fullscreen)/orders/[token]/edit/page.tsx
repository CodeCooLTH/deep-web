/**
 * แก้ไขคำสั่งซื้อ — fullscreen form
 *
 * Base: src/app/(paces)/seller/(fullscreen)/products/[id]/edit/page.tsx
 *   (edit variant ของ fullscreen page: fetch + ownership guard + locked guard + FullscreenPageHeader)
 * Base: src/app/(paces)/seller/(fullscreen)/orders/new/page.tsx
 *   (catalog/bestSellers/inventory wiring — หน้านี้ต้องหน้าตาเหมือนหน้าสร้างทุกประการ)
 *
 * ทำไมถึงมีไฟล์นี้: `OrderActions.tsx` และ `OrderCardMenu.tsx` ลิงก์ `/orders/{token}/edit`
 * มาตั้งแต่ commit 25edf903 (2026-06-15) แต่ไม่เคยมีหน้ารองรับ → กดปุ่มแก้ไขแล้ว 404
 *
 * Wiring: OrderCreateForm รับ `editOrderToken` → prefill ผ่าน GET /api/orders/{token}
 * แล้ว submit เป็น PATCH /api/orders/{token} + redirect กลับ /orders/{token} เอง (ไม่ต้อง onSuccess)
 *
 * ishipCreateMode: ไม่ส่ง (= 'OFF') โดยตั้งใจ — ฟอร์มข้าม runAfterOrderCreate เมื่อเป็นโหมดแก้ไขอยู่แล้ว
 * (OrderCreateForm: `if (!editOrderToken)`) การเปิดพัสดุเป็นเรื่องของ "ตอนสร้าง" เท่านั้น
 */

import { getProductsByShop, getBestSellerProducts } from '@/services/product.service'
import { isEntitlementActive } from '@/services/inventory-entitlement.service'
import { requireActiveShop } from '@/lib/shop-context'
import { getOrderForShop } from '@/services/order.service'
import { formatOrderNo } from '@/lib/order-no'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import OrderCreateForm, { type CatalogProduct } from '@/app/(paces)/seller/(dashboard)/orders/new/components/OrderCreateForm'
import { toCatalogProduct } from '@/app/(paces)/seller/(dashboard)/orders/new/components/to-catalog'
import FullscreenPageHeader from '@/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader'
import Icon from '@/components/wrappers/Icon'
import LockedStateBanner from '@/app/(paces)/seller/(dashboard)/business/components/LockedStateBanner'

export const metadata: Metadata = { title: 'แก้ไขคำสั่งซื้อ' }

const FORM_ID = 'order-edit-form'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function EditOrderPage({ params }: PageProps) {
  const { token } = await params

  // auth guard + active-shop guard อยู่ใน (fullscreen)/layout.tsx แล้ว
  const session = await getServerSession(authOptions)
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
  if (!active) notFound()
  const shop = active.shop

  // DAL pattern: scope shopId เข้า query — กัน IDOR + กัน RSC flight-data leak
  // (redirect หลัง findUnique ไม่ช่วย เพราะข้อมูล serialize เข้า flight ไปแล้ว)
  const order: any = await getOrderForShop(token, shop.id)
  if (!order) notFound()

  const orderNo = formatOrderNo(order.publicToken, order.createdAt)

  // Business ถูก package lock (read-only) — ห้ามแก้ไขออเดอร์
  if (active.locked) {
    return (
      <div className="mx-auto max-w-2xl">
        <LockedStateBanner
          lockReason={active.lockReason ?? ''}
          packageLockedAt={shop.packageLockedAt}
          level="shop"
        />
      </div>
    )
  }

  // ── แก้ได้เฉพาะ PENDING ────────────────────────────────────────────────────
  // ยึดกฎเดียวกับปุ่มในหน้ารายการ (OrderActions.tsx: `canEdit = status === 'PENDING'`)
  // เข้มกว่า service ที่บล็อกแค่ CANCELLED โดยตั้งใจ: ออเดอร์ที่ส่ง/ยืนยันแล้วมีรีวิว+trust score
  // ผูกอยู่ การรื้อ OrderItem ใหม่จะทำให้ประวัติไม่ตรงกับของที่ผู้ซื้อได้รับจริง
  if (order.status !== 'PENDING') {
    return (
      <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
        <Icon
          icon="pencil-off"
          width={64}
          height={64}
          className="text-warning mx-auto mb-4"
        />
        <h2 className="text-dark mb-2 text-xl font-bold">แก้ไขคำสั่งซื้อนี้ไม่ได้แล้ว</h2>
        <p className="text-default-400 mb-6">
          แก้ไขได้เฉพาะออเดอร์ที่ยังรอดำเนินการเท่านั้น ออเดอร์ {orderNo} ถูกดำเนินการไปแล้ว
          หากต้องการเปลี่ยนแปลง ให้ยกเลิกแล้วสร้างออเดอร์ใหม่
        </p>
        <Link
          href={`/orders/${order.publicToken}`}
          className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white"
        >
          <Icon icon="arrow-left" width={18} height={18} />
          กลับไปหน้ารายละเอียด
        </Link>
      </div>
    )
  }

  // ระบบคลัง (Inventory Add-on) เปิดอยู่ไหม — ถ้าเปิด แสดงสต็อกคงเหลือใน grid/line + เตือน qty เกิน
  const inventoryEnabled = await isEntitlementActive(shop.id).catch(() => false)

  let catalog: CatalogProduct[] = []
  try {
    catalog = (await getProductsByShop(shop.id)).map(toCatalogProduct)
  } catch {
    catalog = []
  }

  // สินค้าขายดี (เรียงยอดขาย desc) — โชว์ใน ProductPickerSheet (quick create); ล้มก็ไม่พัง
  let bestSellers: CatalogProduct[] = []
  try {
    bestSellers = (await getBestSellerProducts(shop.id, 8)).map(toCatalogProduct)
  } catch {
    bestSellers = []
  }

  return (
    <>
      {/* backHref ชี้กลับหน้ารายละเอียดออเดอร์ (ที่มาของปุ่มแก้ไข) — ไม่ใช่ /orders
          cancelHref เป็น deprecated prop แล้ว (FullscreenPageHeader M0-a) */}
      <FullscreenPageHeader
        title="แก้ไขคำสั่งซื้อ"
        subtitle={orderNo}
        backHref={`/orders/${order.publicToken}`}
        saveFormId={FORM_ID}
        saveLabel="บันทึกการแก้ไข"
      />
      <OrderCreateForm
        shopId={shop.id}
        catalog={catalog}
        bestSellers={bestSellers}
        formId={FORM_ID}
        inventoryEnabled={inventoryEnabled}
        editOrderToken={order.publicToken}
      />
    </>
  )
}
