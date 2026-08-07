'use client'

/**
 * ProductThumb — รูปสินค้า + fallback icon package เมื่อ src ว่าง/โหลดไม่ขึ้น (onError)
 * ใช้ร่วม ProductGrid (card) + CartLineItem (line thumb) + ProductCombobox (option)
 * Base: src/components/AccountAvatar.tsx (onError pattern) — shape rounded ตาม className ที่ส่งมา (ไม่ fix rounded-full)
 */

import Icon from '@/components/wrappers/Icon'
import { useState } from 'react'

interface Props {
  src?: string | null
  alt?: string
  /** utility ขนาด/รูปทรง เช่น 'size-11 rounded-lg' | 'aspect-square w-full' */
  className: string
  iconClassName?: string
  /**
   * ไอคอนสำรองเมื่อไม่มีรูป — default 'package' (กล่องพัสดุ) ซึ่งถูกสำหรับร้านขายของ
   * แต่ร้านบริการ/บ้านพักไม่ได้ส่งของ ให้ส่งไอคอนของ vertical นั้นมาแทน (PRODUCT_VOCAB.soldIcon)
   */
  icon?: string
}

const ProductThumb = ({ src, alt = '', className, iconClassName = 'size-1/2', icon = 'package' }: Props) => {
  const [failed, setFailed] = useState(false)

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} onError={() => setFailed(true)} className={`${className} object-cover shrink-0`} />
    )
  }

  return (
    <span className={`${className} bg-default-100 text-default-400 inline-flex items-center justify-center shrink-0`}>
      <Icon icon={icon} className={iconClassName} />
    </span>
  )
}

export default ProductThumb
