'use client'

/**
 * วงกลมผู้กระทำในประวัติออเดอร์ (ShippingActivity) — แยกเป็น client leaf เพราะต้องมี onError
 * (ShippingActivity เป็น server component ส่ง handler ข้ามไปไม่ได้)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx
 *   (จุดบนเส้นเวลา — ขยายเป็นวงกลม 36px ตามข้อ 3 ใน ShippingActivity.tsx)
 * Sibling: components/safepay/appointment-board/AppointmentDayCard.tsx (รูปโหลดไม่ขึ้น → ตัวอักษรแรก)
 *
 * 00086 critique P2 — รูปโปรไฟล์จากภายนอก (FB CDN หมดอายุ) โหลดไม่ขึ้นเคยโชว์ไอคอนรูปแตก
 * ⇒ ตกกลับเป็นวงกลมตัวอักษรแรกชุดเดียวกับแถวที่ไม่มีรูป
 */

import { useState } from 'react'
import Image from 'next/image'

export default function ActivityActorAvatar({ src, label }: { src: string; label: string | null }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span className="bg-default-200 text-default-800 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
        {label ? label.charAt(0).toUpperCase() : '?'}
      </span>
    )
  }
  return (
    <Image
      alt=""
      className="size-9 shrink-0 rounded-full object-cover"
      height={36}
      src={src}
      width={36}
      onError={() => setFailed(true)}
    />
  )
}
