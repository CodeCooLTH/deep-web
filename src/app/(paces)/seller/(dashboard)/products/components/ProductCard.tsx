/**
 * ProductCard — mobile/tablet product card (1 สินค้า = 1 การ์ดแยกใบ)
 *
 * แทนที่ mobileCard เดิมของ DataTable (แถวใน .card แม่ใบใหญ่) — ชื่อสินค้าเคยถูกตัดเพราะปุ่ม 3 ปุ่ม
 * กินความกว้างเกือบครึ่งจอ และปุ่มลบสีแดงเด่นกว่าปุ่มหลัก ย้ายมาเป็นการ์ดแยกใบแบบเดียวกับ /orders
 * (user ชี้เองว่าหน้า orders "ใช้งานง่าย")
 *
 * โครง 2 ชั้นคั่นด้วยเส้นประ (ไม่ใช่ 4 ชั้นแบบ OrderCard — สินค้าไม่มี items/shipping/payment ซ้อนกัน):
 *   ชั้นหัว: รูป + ชื่อ(+ปักหมุด)+ประเภท | ราคา + badge สถานะ
 *   ชั้นท้าย: ขายแล้ว N ชิ้น (+เรตติ้งถ้ามีรีวิว) | [แก้ไข][ปักหมุด][⋮]
 *
 * ลำดับชั้นปุ่ม: "แก้ไข" = primary (แก้ราคา/สต๊อก/รูปคืองานที่ทำถี่ที่สุดหลังเผยแพร่) รอง = ปักหมุด
 * ปุ่มลบถูกย้ายออกจากการ์ดทั้งหมด → อยู่ใน ⋮ (ProductCardMenu) เท่านั้น
 *
 * Base: theme/paces/Admin/TS/src/assets/css/custom/_card.css (card + border-dashed + left accent)
 *       theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (CardColoredBorder — border-s accent)
 * Structural template: src/app/(paces)/seller/(dashboard)/orders/components/OrderCard.tsx
 *   (stretched-link, ProductImage fallback pattern, relative z-10 บนปุ่ม)
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { formatBaht } from '@/lib/format-money'
import { productMargin } from '@/lib/order-profit'
import { PRODUCT_TYPE_ICONS, PRODUCT_TYPE_LABELS, type ProductRow } from './data'
import PinToggleButton, { type PinChangeResult } from './PinToggleButton'
import ProductCardMenu from './ProductCardMenu'

// รูปสินค้า + fallback placeholder (pattern เดียวกับ OrderCard.ProductImage — ต่างแค่ size-14)
function ProductImage({ src, alt }: { src?: string; alt: string }) {
  const fallbackRef = useRef(false)
  const [failed, setFailed] = useState(false)
  if (!src || failed || fallbackRef.current) {
    return (
      <span className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-default-200 bg-default-100 text-default-400">
        <Icon icon="solar:box-bold-duotone" className="text-xl" />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="size-14 shrink-0 rounded-lg border border-default-200 bg-default-100 object-cover"
      onError={() => {
        fallbackRef.current = true
        setFailed(true)
      }}
    />
  )
}

interface ProductCardProps {
  product: ProductRow
  pinSlots: number
  pinnedCount: number
  onPinChange: (result: PinChangeResult) => void
  onActiveToggle: (productId: string, nextIsActive: boolean) => void
  onDeleteRequest: (productId: string) => void
}

export default function ProductCard({
  product,
  pinSlots,
  pinnedCount,
  onPinChange,
  onActiveToggle,
  onDeleteRequest,
}: ProductCardProps) {
  const isPinned = product.pinnedAt !== null
  const hasReviews = product.reviews > 0

  return (
    <div className={`card border-s-3 ${product.isActive ? 'border-success' : 'border-default-300'}`}>
      {/* กดที่การ์ด = เปิดหน้ารายละเอียด — stretched link ทับทั้งการ์ด (pattern เดียวกับ OrderCard)
          ปุ่มที่ต้องกดได้ต้องถูกยกขึ้นเหนือแผ่นนี้ด้วย relative z-10 */}
      <Link
        href={`/products/${product.id}`}
        aria-label={`ดูรายละเอียดสินค้า ${product.name}`}
        className="absolute inset-0 rounded transition-colors active:bg-default-500/10"
      />

      <div className="card-body !px-4 !py-3">
        {/* ── ชั้นหัว: ซ้าย = รูป+ชื่อ+ประเภท · ขวา(stack) = ราคา เหนือ badge สถานะ ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <ProductImage src={product.image || undefined} alt={product.name} />
            <div className="min-w-0">
              <p className="flex min-w-0 items-center gap-1 text-sm font-bold text-default-900">
                {isPinned && (
                  <Icon icon="tabler:pin-filled" className="shrink-0 text-sm text-primary" aria-hidden="true" />
                )}
                <span className="line-clamp-2">{product.name}</span>
              </p>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-default-500">
                <Icon icon={PRODUCT_TYPE_ICONS[product.type]} className="size-3.5 text-default-400" />
                {PRODUCT_TYPE_LABELS[product.type]}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-sm font-bold tabular-nums text-default-900">
              ฿{product.price.toLocaleString('th-TH')}
            </span>
            {/* ต้นทุน/มาร์จิ้น (ux Design Spec S3) — บรรทัดเดียวกะทัดรัดในกรอบเดิม ไม่เพิ่มชั้นการ์ด
                ความสูงการ์ดถูกกำหนดโดยรูป size-14 (56px) อยู่แล้ว บรรทัดนี้จึงอยู่ในโควตาที่เหลือ
                คงบรรทัดไว้เสมอแม้ไม่มีข้อมูล เพื่อให้จังหวะการ์ดทุกใบเท่ากัน
                ใช้คำย่อ "ทุน" เพราะที่ 320px คำเต็มดันแถวขวาล้นออกนอกจอ (คำเต็มยังใช้ในตาราง) */}
            {(() => {
              const margin = productMargin({ price: product.price, cost: product.cost })
              const isLoss = margin !== null && margin < 0
              if (product.cost === null) {
                return <span className="text-2xs text-default-400">—</span>
              }
              return (
                <span
                  className={`text-2xs tabular-nums ${isLoss ? 'text-danger-ink' : 'text-default-500'}`}
                >
                  {isLoss && (
                    <Icon icon="alert-triangle" className="me-0.5 inline size-3" aria-hidden="true" />
                  )}
                  ทุน {formatBaht(product.cost)}
                  {margin !== null && ` · ${margin.toLocaleString('th-TH', { maximumFractionDigits: 1 })}%`}
                </span>
              )
            })()}
            <span
              className={`badge rounded-full ${
                product.isActive ? 'bg-success/15 text-success-ink' : 'bg-default-100 text-default-500'
              }`}
            >
              {product.isActive ? 'เปิดขาย' : 'ปิดการขาย'}
            </span>
          </div>
        </div>

        {/* ── ชั้นท้าย: ขายแล้ว N ชิ้น (+เรตติ้งถ้ามีรีวิว) · ปุ่ม [แก้ไข][ปักหมุด][⋮] ── */}
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-dashed border-default-200 pt-2.5">
          <p className="min-w-0 truncate text-xs text-default-500">
            ขายแล้ว {product.totalSold.toLocaleString('th-TH')} ชิ้น
            {/* ★0.0 (0) ซ้ำทุกสินค้าใหม่ไม่ให้ข้อมูลอะไร — ขึ้นเฉพาะเมื่อมีรีวิวจริง */}
            {hasReviews && <> · ★{product.rating.toFixed(1)} ({product.reviews})</>}
          </p>

          {/* relative z-10: ยกกลุ่มปุ่มขึ้นเหนือแผ่นลิงก์ที่ทับการ์ด */}
          <div className="relative z-10 flex shrink-0 items-center gap-1.5">
            {/* primary: แก้ไข — icon-only ทึบน้ำเงิน (งานที่ทำถี่ที่สุดต่อสินค้า 1 ชิ้นหลังเผยแพร่) */}
            <Link
              href={`/products/${product.id}/edit`}
              aria-label="แก้ไขสินค้า"
              className="btn btn-icon bg-primary text-white hover:bg-primary-hover min-h-11 min-w-11"
            >
              <Icon icon="solar:pen-2-linear" className="text-base" />
            </Link>
            <PinToggleButton
              productId={product.id}
              pinnedAt={product.pinnedAt}
              isActive={product.isActive}
              pinSlots={pinSlots}
              pinnedCount={pinnedCount}
              onChange={onPinChange}
              variant="mobile"
            />
            <ProductCardMenu
              productId={product.id}
              isActive={product.isActive}
              onActiveToggle={onActiveToggle}
              onDeleteRequest={onDeleteRequest}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
