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

  return (
    // px-4: คืน gutter (CommandCenter wrapper มี -mx-4 edge-to-edge)
    <div className="px-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-dark">
        <Icon icon="trophy" className="size-4 text-warning" />
        สินค้าขายดี
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {products.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => router.push(`/orders/new?product=${p.id}`)}
            className="w-24 shrink-0 overflow-hidden rounded-xl border border-default-200 bg-card text-left"
          >
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt={p.name} className="aspect-video w-full object-cover" />
            ) : (
              <span className="flex aspect-video w-full items-center justify-center bg-default-100 text-default-400">
                <Icon icon="package" className="size-6" />
              </span>
            )}
            <div className="p-2">
              <p className="line-clamp-2 text-xs font-medium text-dark">{p.name}</p>
              <p className="mt-0.5 text-xs font-semibold text-primary">{formatThb(p.price)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
