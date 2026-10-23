'use client'

/**
 * FlashLogo — โลโก้ Flash พร้อม fallback เมื่อไฟล์หาย (Design-Spec §2.5)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx
 *       (ช่องโลโก้ขนส่งในหัวสถานะ — size-11 + ring)
 */

import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { courierLogoUrl } from '@/lib/iship/courier'

export default function FlashLogo({ className = 'size-11' }: { className?: string }) {
  const url = courierLogoUrl('FLASH', 'Flash Express')
  const [failed, setFailed] = useState(false)
  if (!url || failed) {
    return (
      <span
        aria-hidden="true"
        className={`bg-default-100 text-default-700 flex shrink-0 items-center justify-center rounded-lg ${className}`}
      >
        <Icon icon="tabler:truck-delivery" className="text-base" />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      // alt ว่าง: ชื่อบริการเป็นข้อความอยู่ติดกันแล้ว (กันคนอ่านหน้าจอได้ยินซ้ำ)
      alt=""
      onError={() => setFailed(true)}
      className={`ring-default-200 shrink-0 rounded-lg object-contain ring-1 ${className}`}
    />
  )
}
