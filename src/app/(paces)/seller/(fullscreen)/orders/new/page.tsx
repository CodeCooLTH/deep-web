/**
 * สร้างออเดอร์ใหม่ — fullscreen form
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx
 * โครงสร้าง card + grid ได้จาก Paces order-add; wiring (submit/validate/redirect) คงเดิม.
 * ตัด Flatpickr date (ใช้ server timestamp แทน).
 */

import { getProductsByShop, getBestSellerProducts } from '@/services/product.service'
import { isEntitlementActive } from '@/services/inventory-entitlement.service'
import { requireActiveShop } from '@/lib/shop-context'
import { getConnection } from '@/services/iship.service'
// feature 00024 — ทรัพยากรที่จองได้ + ตัวกั้นฟีเจอร์ (ใช้ตัวเดียวกับ API/เมนู กติกาไม่แตกเป็นสองชุด)
import { canUseAppointments, type AppointmentGranularity } from '@/lib/appointments'
import { listServiceResources } from '@/services/service-resource.service'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import OrderCreateForm, { type CatalogProduct } from '@/app/(paces)/seller/(dashboard)/orders/new/components/OrderCreateForm'
import { toCatalogProduct } from '@/app/(paces)/seller/(dashboard)/orders/new/components/to-catalog'
import Icon from '@/components/wrappers/Icon'
import FullscreenPageHeader from '@/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader'
import LockedStateBanner from '@/app/(paces)/seller/(dashboard)/business/components/LockedStateBanner'

export const metadata: Metadata = { title: 'สร้างออเดอร์' }

const FORM_ID = 'order-create-form'

export default async function NewOrderPage() {
  // auth guard อยู่ใน (fullscreen)/layout.tsx แล้ว — ดึง session เพื่อใช้ userId เท่านั้น
  const session = await getServerSession(authOptions)

  // Phase 4: resolve active shop (Personal หรือ Business ตาม context ที่สลับ) — membership guard ได้ฟรี
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })

  // ร้านถูกสร้างอัตโนมัติใน layout ถ้ายังไม่มี — กรณีนี้ไม่ควรเกิด แต่แสดง fallback เพื่อความปลอดภัย
  if (!active) {
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
          href="/shop"
          className="btn bg-primary px-6 py-3 font-semibold text-white hover:bg-primary-hover inline-flex items-center gap-2"
        >
          <Icon icon="plus" width={18} height={18} />
          ตั้งค่าร้านค้า
        </Link>
      </div>
    )
  }

  const shop = active.shop

  // Business ถูก package lock (read-only) — ห้ามสร้างออเดอร์ใหม่
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

  // ระบบคลัง (Inventory Add-on) เปิดอยู่ไหม — ถ้าเปิด แสดงสต็อกคงเหลือใน grid/line + เตือน qty เกิน
  const inventoryEnabled = await isEntitlementActive(shop.id).catch(() => false)

  // feature 00022 — โหมดสร้างพัสดุของร้าน ส่งลง form ตอน render (ไม่ต้องยิงถามฝั่ง client)
  // ร้านบ้านพักและร้านที่ยังไม่เชื่อมต่อจะได้ 'OFF' → ไม่มีอะไรเกิดขึ้นตอนสร้างออเดอร์
  const ishipCreateMode =
    shop.vertical === 'ONLINE_SALES'
      ? await getConnection(shop.id)
          .then((c) => (c.connected && c.status === 'ACTIVE' ? c.createMode : 'OFF'))
          .catch(() => 'OFF' as const)
      : ('OFF' as const)

  // feature 00024 — ระบบนัดหมายเปิดให้เฉพาะบัญชีธุรกิจประเภทสินค้าและบริการ (BR-RSV-01)
  // ร้านที่ไม่เข้าเงื่อนไขจะไม่ได้รับทรัพยากรเลย → ฟอร์มไม่ render บล็อกวันนัด DOM เหมือนเดิมทุกจุด
  // ดึงด้วย service function ตรง (มิเรอร์ listRooms ใน bookings/new/page.tsx) ไม่ fetch API ตัวเอง
  const serviceResourcesEnabled = canUseAppointments({
    kind: active.kind,
    vertical: shop.vertical,
  })
  const serviceResources = serviceResourcesEnabled
    ? await listServiceResources(shop.id, { activeOnly: true })
        .then((rows) =>
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            durationMinutes: r.durationMinutes,
            capacity: r.capacity,
            depositMode: r.depositMode,
            depositValue: r.depositValue.toFixed(2),
          })),
        )
        .catch(() => [])
    : []

  // map Product → CatalogProduct: ใช้ toCatalogProduct กลาง (แชร์กับหน้าแก้ไขออเดอร์)
  let catalog: CatalogProduct[] = []
  try {
    const products = await getProductsByShop(shop.id)
    catalog = products.map(toCatalogProduct)
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
      {/*
        Header sticky ด้านบน — **ไม่มีปุ่มบันทึก** โดยตั้งใจ

        เดิมส่ง saveFormId มาด้วย ทำให้หน้านี้มีปุ่ม type="submit" ถึง 3 ตัวใน DOM พร้อมกัน
        (หัวหน้า + footer มือถือ + footer เดสก์ท็อป) ซึ่งมี guard ไม่เท่ากัน — วัดในเบราว์เซอร์แล้ว
        พบว่ากด Enter ในช่อง text จะไป trigger **ปุ่มบนหัว** ซึ่งเป็นตัวที่ไม่มี disabled เลย
        = bypass guard ทั้งหมด (impeccable critique 2026-07-31 P1)

        ตัดออกได้เพราะทั้งสองเส้นทางมีปุ่มบันทึกที่มองเห็นตลอดเวลาอยู่แล้ว:
        เดสก์ท็อป = footer ของ CartPanel (pinned) · มือถือ = QuickSummaryPanel (fixed)
        ปุ่ม primary น้ำหนักเท่ากันสองจุดบนจอเดียวไม่ได้ช่วยใคร
      */}
      <FullscreenPageHeader
        title="สร้างออเดอร์"
        subtitle={`ร้าน ${shop.shopName}`}
        backHref="/orders"
      />
      {/* Form body — Paces order-add card pattern */}
      <OrderCreateForm shopId={shop.id} catalog={catalog} bestSellers={bestSellers} formId={FORM_ID} inventoryEnabled={inventoryEnabled} ishipCreateMode={ishipCreateMode} serviceResourcesEnabled={serviceResourcesEnabled} serviceResources={serviceResources} appointmentGranularity={shop.appointmentGranularity as AppointmentGranularity} />
    </>
  )
}
