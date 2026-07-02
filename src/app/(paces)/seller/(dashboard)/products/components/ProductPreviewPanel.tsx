'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-details/components/ProductDisplay.tsx
 *   (image gallery + thumbnail strip — adapt จาก Preline carousel เป็น click-to-switch
 *    เพราะ live preview ดูภาพเดียวต่อครั้ง ไม่ต้องการ auto-rotate)
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-details/components/ProductDetails.tsx
 *   (typography: badge bg-{tone}/15 text-{tone} rounded-full, text-danger font-bold สำหรับราคา,
 *    text-default-400 สำหรับ section heading; pattern h6/p ใน attributes block)
 *
 * Domain component — ไม่มี 1:1 Paces theme equivalent สำหรับ live-preview panel นี้
 *   SafePay-specific: preview panel ที่ subscribe ค่าจาก RHF watch() และ update realtime
 *   Layout override (Lazada/Shopee mobile-first preview):
 *   max-w-md container (preview ของ "การ์ดสินค้า" ไม่ใช่หน้าเต็ม),
 *   main image aspect-square, thumbnail strip เลื่อนแนวนอน,
 *   ราคา text-2xl text-danger, empty states ใช้ text-default-300 italic
 *   billingMode-aware: แสดง "/เดือน" "/ปี" "/รอบ" ต่อท้ายราคา
 */
import { Icon } from '@iconify/react'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import type { FulfillmentMode, BillingMode, BillingPeriod } from '@/lib/product-types/registry'

interface ProductPreviewPanelProps {
  name: string
  shortDescription?: string
  description?: string
  price: number | undefined
  type: 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'SUBSCRIPTION'
  images: string[]
  tags: string[]
  attributes: Record<string, string>
  shopName?: string
  billingMode?: BillingMode
  billingPeriod?: BillingPeriod | null
  fulfillmentMode?: FulfillmentMode
}

// icon แทน emoji (กฎ no-emoji) — tabler ผ่าน @iconify/react (colon convention เหมือน tabler:building-store ในไฟล์นี้)
const TYPE_BADGE: Record<ProductPreviewPanelProps['type'], { icon: string; label: string }> = {
  PHYSICAL: { icon: 'tabler:package', label: 'ต้องจัดส่ง' },
  DIGITAL: { icon: 'tabler:device-laptop', label: 'ดิจิทัล' },
  SERVICE: { icon: 'tabler:tools', label: 'ให้บริการ' },
  SUBSCRIPTION: { icon: 'tabler:repeat', label: 'สมาชิก/รอบ' },
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
  billingMode,
  billingPeriod,
  fulfillmentMode,
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

  // label ต่อท้ายราคาสำหรับ RECURRING — แสดงรอบเก็บเงินให้ผู้ใช้เห็นใน live preview
  const priceLabel = (() => {
    if (billingMode === 'RECURRING') {
      if (billingPeriod === 'MONTHLY') return '/เดือน'
      if (billingPeriod === 'YEARLY') return '/ปี'
      if (billingPeriod === 'CUSTOM') return '/รอบ'
      return '/รอบ'
    }
    return ''
  })()

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
          <Icon icon={typeMeta.icon} className="size-3.5" aria-hidden />
          <span>{typeMeta.label}</span>
        </span>
      </div>

      {/* Name */}
      {hasName ? (
        <h1 className="text-dark mt-2 line-clamp-2 text-2xl font-bold break-words">{name}</h1>
      ) : (
        <h1 className="text-default-300 mt-2 text-xl italic">ชื่อสินค้าจะแสดงที่นี่</h1>
      )}

      {/* Capability badges — แสดงใต้ชื่อ เหนือราคา เฉพาะเมื่อมี flag พิเศษ */}
      {(fulfillmentMode === 'NO_SHIPPING' || billingMode === 'RECURRING') && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {fulfillmentMode === 'NO_SHIPPING' && (
            <span className="bg-default-100 text-default-700 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
              ไม่ต้องจัดส่ง
            </span>
          )}
          {billingMode === 'RECURRING' && (
            <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
              <Icon icon="tabler:repeat" className="size-3.5" aria-hidden /> เก็บเป็นรอบ
            </span>
          )}
        </div>
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
            {priceLabel && (
              <span className="text-default-500 ml-0.5 text-sm font-normal">{priceLabel}</span>
            )}
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
