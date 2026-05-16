/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-details/components/ProductDisplay.tsx
 * แสดงรูปภาพ product ด้วย Preline carousel (hs-carousel) หรือ empty-state icon ถ้าไม่มีรูป
 * ปุ่ม Edit เชื่อมไป /products/[id]/edit
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import Image from 'next/image'
import Link from 'next/link'
import type { ProductDetailProps } from './data'

interface Props {
  product: ProductDetailProps
}

const ProductDisplay = ({ product }: Props) => {
  const { id, name, images } = product
  const hasImages = images.length > 0

  return (
    <div className="card sticky top-20">
      {hasImages ? (
        /*
         * Branch "มีรูป": คง Preline carousel โครงเดิมทุกบรรทัด
         * data-hs-carousel จะมีก็ต่อเมื่อมี .hs-carousel-body รองรับ
         * ป้องกัน Preline init carousel บน element ที่ไม่มี .hs-carousel-body
         */
        <div data-hs-carousel='{ "loadingClasses": "opacity-0" }' className="relative">
          <div className="hs-carousel relative overflow-hidden w-full lg:min-h-120 min-h-90 rounded-lg">
            <div className="hs-carousel-body flex flex-nowrap transition-transform duration-700 opacity-0">
              {images.map((src, idx) => (
                <div className="hs-carousel-slide" key={idx}>
                  <Image
                    src={src}
                    alt={`${name} รูปที่ ${idx + 1}`}
                    width={600}
                    height={600}
                    className="w-full object-cover"
                  />
                </div>
              ))}
            </div>
            {images.length > 1 && (
              <div className="hs-carousel-pagination relative mt-5 z-10">
                <div className="flex flex-row items-center justify-center gap-4">
                  {images.map((src, idx) => (
                    <div
                      className="hs-carousel-pagination-item shrink-0 border border-default-300 rounded overflow-hidden cursor-pointer opacity-50 hs-carousel-active:opacity-100"
                      key={idx}
                    >
                      <Image
                        src={src}
                        alt={`thumb-${idx}`}
                        width={48}
                        height={48}
                        className="w-12"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /*
         * Branch "ไม่มีรูป": render เฉพาะ empty placeholder
         * ไม่มี data-hs-carousel / .hs-carousel / .hs-carousel-body ใด ๆ เลย
         * กัน Preline ไม่ให้ init carousel แล้วเรียก this.inner.classList บน null
         */
        <div className="flex items-center justify-center lg:min-h-120 min-h-90 bg-default-100 rounded-lg">
          <Icon icon="package" className="size-24 text-default-300" />
        </div>
      )}
      <div className="my-5 flex justify-center gap-2">
        <Link
          href={`/seller/products/${id}/edit`}
          className="btn bg-light hover:text-primary inline-flex items-center gap-1.5"
        >
          <Icon icon="pencil" className="text-base" />
          แก้ไขสินค้า
        </Link>
      </div>
    </div>
  )
}

export default ProductDisplay
