'use client'

// Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-details/components/ProductDisplay.tsx
//   (image gallery + thumbnail strip pattern — slides + hs-carousel-pagination-item;
//    เรา adapt เป็น click-to-switch แบบ mobile e-commerce แทน Preline carousel เพราะ
//    ใน live preview ผู้ใช้ดูภาพเดียวต่อครั้ง ไม่ต้องการ auto-rotate)
// Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-details/components/ProductDetails.tsx
//   (typography: badge bg-{tone}/15 text-{tone} rounded-full text-sm py-1.5 px-3,
//    text-danger text-xl font-bold สำหรับราคา, text-default-400 text-xs uppercase
//    สำหรับ section heading; pattern h6/p ใน attributes block)
// Layout override (Lazada/Shopee mobile-first preview panel):
//   - max-w-md container เพราะนี่คือ preview ของ "การ์ดสินค้า" ไม่ใช่หน้าเต็ม
//   - main image เป็น aspect-square ใหญ่อันเดียว, thumbnail strip เลื่อนแนวนอน
//   - ราคาตัวใหญ่ text-2xl text-danger (Lazada/Shopee เน้นราคาให้สะดุดตา)
//   - empty/placeholder states ใช้ text-default-300 italic เป็นมาตรฐาน
import { Icon } from '@iconify/react'
import Image from 'next/image'
import { useEffect, useState } from 'react'

interface ProductPreviewPanelProps {
  name: string
  shortDescription?: string
  description?: string
  price: number | undefined
  type: 'PHYSICAL' | 'DIGITAL' | 'SERVICE'
  images: string[]
  tags: string[]
  attributes: Record<string, string>
  shopName?: string
}

const TYPE_BADGE: Record<ProductPreviewPanelProps['type'], { emoji: string; label: string }> = {
  PHYSICAL: { emoji: '📦', label: 'ต้องจัดส่ง' },
  DIGITAL: { emoji: '💻', label: 'ดิจิทัล' },
  SERVICE: { emoji: '🛠️', label: 'ให้บริการ' },
}

export default function ProductPreviewPanel({
  name,
  shortDescription,
  description,
  price,
  type,
  images,
  tags,
  attributes,
  shopName,
}: ProductPreviewPanelProps) {
  const [activeIdx, setActiveIdx] = useState(0)

  // กัน activeIdx ค้างเลยช่วงของ images — เช่น ลบรูปสุดท้ายออก
  useEffect(() => {
    if (activeIdx > images.length - 1) {
      setActiveIdx(0)
    }
  }, [activeIdx, images.length])

  const hasImages = images.length > 0
  const activeImageId = hasImages ? images[Math.min(activeIdx, images.length - 1)] : undefined
  const hasName = name.trim().length > 0
  const hasPrice = typeof price === 'number' && price > 0
  const hasTags = tags.length > 0
  const attrEntries = Object.entries(attributes).filter(
    ([k, v]) => k.trim().length > 0 && v.trim().length > 0,
  )
  const hasAttrs = attrEntries.length > 0
  const hasDescription = (description ?? '').trim().length > 0
  const hasShortDescription = (shortDescription ?? '').trim().length > 0
  const hasAnyDescription = hasDescription || hasShortDescription
  const typeMeta = TYPE_BADGE[type]

  return (
    <div className="bg-card border-default-100 mx-auto w-full max-w-md rounded-2xl border p-4 lg:p-5">
      {/* Shop name (optional header) */}
      {shopName ? (
        <div className="text-default-500 mb-2 flex items-center gap-1.5 text-xs">
          <Icon icon="tabler:building-store" className="size-3.5" />
          <span className="truncate">{shopName}</span>
        </div>
      ) : null}

      {/* Main image — aspect-square, rounded-xl, placeholder when empty */}
      <div className="bg-default-50 border-default-100 relative aspect-square overflow-hidden rounded-xl border">
        {activeImageId ? (
          <Image
            src={`/api/files/${activeImageId}`}
            alt={hasName ? name : 'ตัวอย่างรูปสินค้า'}
            width={400}
            height={400}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="text-default-300 flex h-full w-full flex-col items-center justify-center gap-2">
            <Icon icon="tabler:photo" className="size-16" />
            <span className="text-sm italic">ตัวอย่างรูปสินค้า</span>
          </div>
        )}
      </div>

      {/* Thumbnail strip — only if multiple images */}
      {images.length > 1 ? (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {images.map((id, idx) => {
            const isActive = idx === activeIdx
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveIdx(idx)}
                className={`relative size-16 shrink-0 overflow-hidden rounded-lg border transition ${
                  isActive
                    ? 'ring-primary border-primary ring-2'
                    : 'border-default-200 opacity-70 hover:opacity-100'
                }`}
                aria-label={`รูปที่ ${idx + 1}`}
                aria-pressed={isActive}
              >
                <Image
                  src={`/api/files/${id}`}
                  alt=""
                  width={64}
                  height={64}
                  className="h-full w-full object-cover"
                />
              </button>
            )
          })}
        </div>
      ) : null}

      {/* Type badge — always render */}
      <div className="mt-3">
        <span className="bg-default-100 text-default-700 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs">
          <span aria-hidden>{typeMeta.emoji}</span>
          <span>{typeMeta.label}</span>
        </span>
      </div>

      {/* Name */}
      {hasName ? (
        <h1 className="text-dark mt-2 line-clamp-2 text-2xl font-bold break-words">{name}</h1>
      ) : (
        <h1 className="text-default-300 mt-2 text-xl italic">ชื่อสินค้าจะแสดงที่นี่</h1>
      )}

      {/* Price */}
      <div className="mt-2">
        {hasPrice ? (
          <div className="text-danger text-2xl font-bold">
            ฿
            {price.toLocaleString('th-TH', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        ) : (
          <div className="text-default-400 text-2xl">฿ -</div>
        )}
      </div>

      {/* Divider after price */}
      <div className="border-default-100 mt-3 border-t" />

      {/* Tags */}
      {hasTags ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="bg-primary/10 text-primary inline-block rounded px-2 py-0.5 text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {/* Short description (italic teaser) */}
      {hasShortDescription ? (
        <p className="text-default-500 mt-2 text-sm whitespace-pre-wrap italic">
          {shortDescription}
        </p>
      ) : null}

      {/* Attributes table — value เก็บเป็น "v1, v2, v3" comma-joined → แสดงเป็น chips */}
      {hasAttrs ? (
        <>
          <div className="text-dark mt-4 mb-2 text-sm font-semibold">รายละเอียดสินค้า</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {attrEntries.map(([k, v]) => {
              const chips = v
                .split(',')
                .map((c) => c.trim())
                .filter((c) => c.length > 0)
              return (
                <div key={k} className="contents">
                  <dt className="text-default-400">{k}</dt>
                  <dd>
                    <div className="flex flex-wrap gap-1.5">
                      {chips.map((c, i) => (
                        <span
                          key={`${k}-${i}-${c}`}
                          className="bg-default-100 text-default-700 inline-block rounded px-2 py-0.5 text-xs"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </dd>
                </div>
              )
            })}
          </dl>
        </>
      ) : null}

      {/* Description (long) */}
      {hasAnyDescription ? (
        <div className="mt-4">
          <div className="text-dark mb-2 text-sm font-semibold">คำอธิบายสินค้า</div>
          {hasDescription ? (
            <div className="text-default-700 text-sm whitespace-pre-wrap">{description}</div>
          ) : (
            <div className="text-default-400 text-sm italic">
              ยังไม่มีคำอธิบายเพิ่มเติม
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
