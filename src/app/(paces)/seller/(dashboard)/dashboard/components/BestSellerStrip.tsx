'use client'

/**
 * BestSellerStrip — "สินค้าขายดี" บน command center (< lg) → จิ้ม → /orders/new?product=<id> (pre-add, feature Quick Create)
 * Base: mockup 2026-07-06-quick-create-order.html (command center frame — สินค้าขายดี card slide, ไม่มี border section)
 * ว่าง (ร้านใหม่/ไม่มียอดขาย) → ไม่ render
 */

import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

interface Product {
  id: string
  name: string
  price: number
  image: string | null
  /** จำนวนขายรวม (sum qty) — โชว์ "ขายแล้ว X ชิ้น" */
  soldCount: number
}

interface Props {
  products: Product[]
}

export default function BestSellerStrip({ products }: Props) {
  const router = useRouter()
  if (!products.length) return null

  return (
    // px-4: คืน gutter (CommandCenter wrapper มี -mx-4 edge-to-edge)
    <div className="px-4">
      <p className="flex items-center gap-1.5 text-sm font-bold text-dark">
        <Icon icon="trophy" className="size-4 text-warning" />
        สินค้าขายดี
      </p>
      {/* hint CTA ระดับ section (ครั้งเดียว) — แทนข้อความซ้ำทุกการ์ด */}
      <p className="mb-2.5 text-2xs text-default-400">จิ้มที่การ์ดเพื่อเพิ่มลงออเดอร์ใหม่</p>

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
            aria-label={`${p.name} ${formatThb(p.price)} ขายแล้ว ${p.soldCount} ชิ้น`}
            className="w-24 shrink-0 snap-start overflow-hidden rounded-xl border border-default-200 bg-card text-left transition-transform duration-150 hover:shadow-sm active:scale-95"
          >
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt={p.name} className="aspect-square w-full object-cover" />
            ) : (
              <span className="flex aspect-square w-full flex-col items-center justify-center gap-1 bg-default-100 text-default-300">
                <Icon icon="package" className="size-8" />
                <span className="text-2xs">ไม่มีรูป</span>
              </span>
            )}
            <div className="p-2">
              <p className="line-clamp-2 text-xs font-medium text-dark">{p.name}</p>
              <p className="mt-0.5 truncate text-sm font-bold text-primary">{formatThb(p.price)}</p>
              {/* จำนวนขาย — รูปกล่อง + "ขายแล้ว X ชิ้น" (แทน rank badge; ลำดับซ้าย→ขวา = ขายดีสุดก่อน) */}
              <p className="mt-1 flex items-center gap-1 truncate text-2xs text-default-400">
                <Icon icon="package" className="size-3 shrink-0" />
                ขายแล้ว {p.soldCount.toLocaleString('th-TH')} ชิ้น
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
