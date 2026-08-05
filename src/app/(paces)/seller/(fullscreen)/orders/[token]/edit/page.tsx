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
import { resolveOrderVocab } from '@/lib/seller-menu'
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

/**
 * feature 00030 — ชื่อหน้าผันตามประเภทกิจการ จึงเป็น generateMetadata ไม่ใช่ constant
 * (mirror orders/page.tsx) resolve ไม่ได้ → ตกไปชุด ONLINE_SALES ตาม fail-safe ของ SSOT
 */
export async function generateMetadata(): Promise<Metadata> {
  const session = await getServerSession(authOptions)
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  ).catch(() => null)
  return { title: `แก้ไข${resolveOrderVocab(active?.shop?.vertical ?? '').noun}` }
}

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
  // hoist ครั้งเดียว — ใช้ทั้ง heading/blocked copy/ฟอร์ม (feature 00030 BR-BKU-09)
  const vocab = resolveOrderVocab(shop.vertical)

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
    // ข้อความต่างกันตามสถานะ — เดิมใช้ข้อความเดียวว่า "ให้ยกเลิกแล้วสร้างใหม่" ซึ่งใช้ไม่ได้กับ
    // CONFIRMED/CANCELLED: CancelOrderButton คืน null เมื่อไม่ใช่ PENDING/SHIPPED ผู้ใช้จึงหา
    // ปุ่มยกเลิกไม่เจอ = copy สั่งให้ทำสิ่งที่ระบบไม่มีให้ทำ
    // ประโยคพวกนี้มี "กริยาเชิงโดเมน" ฝังอยู่ (จัดส่ง/รับสินค้า/ขาย/ลักษณนาม "ใบ") — แทน noun
    // อย่างเดียวจะได้ประโยคถูกไวยากรณ์แต่ผิดโลกจริง ("สร้างบิลเข้าพักใบใหม่" ละเมิดคำล็อก
    // "เปิดบิลเข้าพัก" ใน UX-Copy §3) จึง allow-list ร้านรับนัด/บ้านพักไปชุด vocab-template
    // ส่วน vertical อื่น/ไม่รู้จัก fail-closed ไปชุด ONLINE_SALES เดิม
    const isBookingVertical = shop.vertical === 'SERVICE_QUEUE' || shop.vertical === 'LODGING'
    const blockedCopy: Record<string, string> = isBookingVertical
      ? {
          // SHIPPED บนร้านรับนัด/บ้านพัก = ข้อมูลเก่าก่อน enforcement (สินค้า SHIPPED ค้างในฐาน)
          // ห้ามพูด "จัดส่งไปแล้ว" กับร้านที่ไม่มีจัดส่ง — บอกสถานะแบบกลางที่ยังจริงอยู่
          SHIPPED: `${vocab.noun}นี้เลยขั้นรอดำเนินการไปแล้ว จึงแก้ไขรายการหรือยอดเงินไม่ได้ หากข้อมูลผิด ให้ยกเลิกแล้ว${vocab.createLabel}ใหม่`,
          CONFIRMED: `ลูกค้ายืนยันแล้ว ${vocab.noun}ที่ปิดแล้วแก้ไขไม่ได้ เพราะประวัติและคะแนนความน่าเชื่อถือถูกบันทึกไปแล้ว`,
          CANCELLED: `${vocab.noun}นี้ถูกยกเลิกไปแล้ว หากต้องการเริ่มใหม่ ให้${vocab.createLabel}อีกครั้ง`,
        }
      : {
          SHIPPED:
            'คำสั่งซื้อนี้จัดส่งไปแล้ว จึงแก้ไขรายการสินค้าหรือยอดเงินไม่ได้ หากข้อมูลผิด ให้ยกเลิกคำสั่งซื้อแล้วสร้างใบใหม่',
          CONFIRMED:
            'ผู้ซื้อยืนยันรับสินค้าแล้ว คำสั่งซื้อที่ปิดแล้วแก้ไขไม่ได้ เพราะประวัติและคะแนนความน่าเชื่อถือถูกบันทึกไปแล้ว',
          CANCELLED: 'คำสั่งซื้อนี้ถูกยกเลิกไปแล้ว หากยังต้องการขาย ให้สร้างคำสั่งซื้อใบใหม่',
        }
    return (
      <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
        <Icon
          icon="pencil-off"
          width={64}
          height={64}
          className="text-warning mx-auto mb-4"
        />
        <h2 className="text-dark mb-2 text-xl font-bold">แก้ไข{vocab.noun} {orderNo} ไม่ได้</h2>
        <p className="text-default-400 mb-6">
          {blockedCopy[order.status] ?? `แก้ไขได้เฉพาะ${vocab.noun}ที่ยังรอดำเนินการเท่านั้น`}
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
        title={`แก้ไข${vocab.noun}`}
        subtitle={orderNo}
        backHref={`/orders/${order.publicToken}`}
        saveFormId={FORM_ID}
        saveLabel="บันทึกการแก้ไข"
      />
      <OrderCreateForm
        vocab={vocab}
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
