'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/components/ProductImage.tsx
 *   (card shell: card > card-header > card-body)
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductImagesCardV2.tsx
 *   (reuse ทั้ง uploader logic — auto-upload dropzone + hero/thumbnail strip + valueRef anti-stale-closure)
 *
 * AuctionImageCard = card wrapper บาง ๆ รอบ ProductImagesCardV2 (generic ใช้ค่าเดียวกัน
 * value:string[]/onChange อยู่แล้ว ไม่ผูกกับ "product" domain) — ต่างจาก ProductFormV2 ที่ใช้
 * ProductImagesCardV2 แบบ borderless composer, ที่นี่ห่อด้วย .card/.card-header ตาม mockup
 * seller-auction-v1.html frame 2 ("card: รูปภาพ")
 */
import ProductImagesCardV2 from '@/app/(paces)/seller/(dashboard)/products/components/ProductImagesCardV2'

interface AuctionImageCardProps {
  value: string[]
  onChange: (next: string[]) => void
  error?: string
}

export default function AuctionImageCard({ value, onChange, error }: AuctionImageCardProps) {
  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">รูปภาพ</h4>
      </div>
      <div className="card-body p-0">
        <ProductImagesCardV2 value={value} onChange={onChange} maxFiles={10} />
        {error && <p className="text-danger px-3 pb-3 -mt-1 text-sm">{error}</p>}
      </div>
    </div>
  )
}
