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
}

interface Props {
  products: Product[]
}

export default function BestSellerStrip({ products }: Props) {
  const router = useRouter()
  if (!products.length) return null

  // บันไดความเข้มสี warning — ยิ่งอันดับต้นยิ่งเข้ม (ไม่ hardcode ทอง/เงิน/ทองแดง; token + opacity)
  const rankBadgeClass = (rank: number) => {
    if (rank === 1) return 'bg-warning text-white'
    if (rank === 2) return 'bg-warning/70 text-white'
    if (rank === 3) return 'bg-warning/45 text-dark'
    return 'bg-default-200 text-default-600'
  }

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
        {products.map((p, i) => {
          const rank = i + 1
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => router.push(`/orders/new?product=${p.id}`)}
              aria-label={`อันดับ ${rank} ${p.name} ${formatThb(p.price)}`}
              className={`w-28 shrink-0 snap-start overflow-hidden rounded-xl border bg-card text-left transition-transform duration-150 hover:shadow-sm active:scale-95 ${
                rank === 1 ? 'border-warning' : 'border-default-200'
              }`}
            >
              {/* กล่องภาพ (relative — รองรับ overlay badge/ปุ่ม +) */}
              <div className="relative">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt={p.name} className="aspect-square w-full object-cover" />
                ) : (
                  <span className="flex aspect-square w-full flex-col items-center justify-center gap-1 bg-default-100 text-default-300">
                    <Icon icon="package" className="size-8" />
                    <span className="text-2xs">ไม่มีรูป</span>
                  </span>
                )}
                {/* rank badge มุมซ้ายบน */}
                <span
                  className={`absolute -start-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full text-2xs font-bold shadow-sm ${rankBadgeClass(rank)}`}
                  aria-hidden="true"
                >
                  {rank}
                </span>
                {/* ปุ่ม + มุมขวาล่าง — affordance "เพิ่มลงออเดอร์" (ทั้งการ์ดกดได้ ปุ่มนี้ไม่ผูก onClick แยก) */}
                <span
                  className="absolute -bottom-1.5 -end-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-white shadow-sm"
                  aria-hidden="true"
                >
                  <Icon icon="plus" className="size-3.5" />
                </span>
              </div>
              <div className="p-2">
                <p className="line-clamp-2 text-xs font-medium text-dark">{p.name}</p>
                <p className="mt-0.5 truncate text-sm font-bold text-primary">{formatThb(p.price)}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
