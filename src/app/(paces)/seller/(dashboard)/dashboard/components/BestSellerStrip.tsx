'use client'

/**
 * BestSellerStrip — "สินค้าขายดี" บน command center (< lg) → จิ้ม → /orders/new?product=<id> (pre-add, feature Quick Create)
 *
 * Base: OrderStatusBand.tsx + CarouselGrid.tsx (โครง .card/.card-header !py-3/.card-title —
 *   sibling-surface-parity: ทุก section ใน CommandCenter เป็น .card เหมือนกัน)
 * Base (row-card): TopSellingProducts.tsx — sibling เดสก์ท็อปของข้อมูลชุดเดียวกัน
 *   (thumbnail rounded bg-default-100 object-cover + placeholder ไอคอน package ไม่มี caption)
 *
 * เดิมเป็นแถบเปล่า px-4 บนพื้นเทา + การ์ดแนวตั้ง w-24 (mockup 2026-07-06-quick-create-order.html)
 * — user 2026-08-06: "panel ไม่เข้ากับเพื่อนเลย" + "การ์ดไม่สมส่วน" → ยกโครงเป็น .card เข้าชุด
 * พี่น้อง และเปลี่ยนการ์ดสินค้าเป็นแนวนอน (thumbnail 56px ซ้าย + ข้อความขวา); สินค้าเดียว = เต็มกว้าง
 * ว่าง (ร้านใหม่/ไม่มียอดสั่งซื้อ) → ไม่ render ทั้งการ์ด (honest-hide แบบ SalesChartCard)
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

interface Product {
  id: string
  name: string
  price: number
  image: string | null
  /** จำนวนสั่งซื้อรวม (sum qty; PENDING+SHIPPED+CONFIRMED — ไม่รวม CANCELLED) — โชว์ "สั่งซื้อแล้ว X ชิ้น" */
  soldCount: number
}

interface Props {
  products: Product[]
}

export default function BestSellerStrip({ products }: Props) {
  const router = useRouter()
  if (!products.length) return null

  // สินค้าเดียว → การ์ดเต็มความกว้าง (ไม่ให้เป็นแท่งแคบลอยมุมซ้ายกลางพื้นที่ว่าง — เคสที่ user รายงาน)
  const single = products.length === 1

  return (
    <div className="card">
      <div className="card-header !py-3 flex items-center justify-between">
        <h4 className="card-title flex items-center gap-1.5">
          {/* trophy คงสี warning เดิม — สี = ตัวตนของ "ขายดี" ไม่ใช่ icon นำทางแบบพี่น้อง */}
          <Icon icon="trophy" className="size-4 text-warning" />
          สินค้าขายดี
        </h4>
        {/* label เดียวกับปุ่มบน TopSellingProducts (เดสก์ท็อป) — ปลายทางเดียวกัน /products */}
        <Link href="/products" className="text-primary text-sm font-medium inline-flex items-center gap-0.5">
          ดูสินค้าทั้งหมด
          <Icon icon="chevron-right" className="size-4" />
        </Link>
      </div>

      <div className="card-body !p-4">
        {/* hint CTA ระดับ section (ครั้งเดียว) — แทนข้อความซ้ำทุกการ์ด */}
        <p className="mb-2 text-2xs text-default-400">จิ้มที่การ์ดเพื่อเพิ่มลงออเดอร์ใหม่</p>

        {/* scroll-snap + ซ่อน scrollbar (pattern เดียวกับ CarouselGrid) ให้เลื่อนนิ่งบนมือถือ */}
        <div
          className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => router.push(`/orders/new?product=${p.id}`)}
              aria-label={`${p.name} ${formatThb(p.price)} สั่งซื้อแล้ว ${p.soldCount} ชิ้น`}
              className={`${single ? 'w-full' : 'w-56 shrink-0 snap-start'} flex items-center gap-3 rounded-lg border border-default-200 bg-card p-2 text-left transition-transform duration-150 hover:shadow-sm active:scale-95`}
            >
              {p.image ? (
                // กรอบเป็นตัวคุมสัดส่วน ไม่ใช่ <img> — img เป็น replaced element มี intrinsic ratio
                // ของตัวเอง สั่งสัดส่วนที่ตัวมันตรง ๆ ไม่มีผล (บทเรียนเดียวกับ TopSellingProducts)
                <span className="relative block size-14 shrink-0 overflow-hidden rounded bg-default-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt={p.name} className="absolute inset-0 size-full object-cover" />
                </span>
              ) : (
                // placeholder ไอคอนล้วนไม่มี caption — 56px เล็กเกินจะอ่านทั้งไอคอน+ข้อความ
                // (ยึด pattern TopSellingProducts เดสก์ท็อป)
                <span className="flex size-14 shrink-0 items-center justify-center rounded bg-default-100 text-default-300">
                  <Icon icon="package" className="size-6" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-xs font-medium text-dark">{p.name}</span>
                <span className="mt-0.5 block truncate text-sm font-bold text-primary">{formatThb(p.price)}</span>
                {/* จำนวนสั่งซื้อ (ไม่รวมออเดอร์ที่ยกเลิก) — "สั่งซื้อแล้ว X ชิ้น" (ลำดับซ้าย→ขวา = ขายดีสุดก่อน) */}
                <span className="mt-0.5 flex items-center gap-1 truncate text-2xs text-default-400">
                  <Icon icon="package" className="size-3 shrink-0" />
                  สั่งซื้อแล้ว {p.soldCount.toLocaleString('th-TH')} ชิ้น
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
