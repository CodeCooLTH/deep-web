'use client'

/**
 * โลโก้ร้านในวงกลม — รูปโหลดไม่ได้ (ไฟล์หาย/ลิงก์เสีย) ต้องถอยเป็น **อักษรแรกของชื่อร้าน**
 * ไม่ใช่ไอคอนรูปแตกของเบราว์เซอร์ (user เจอ 2026-10-11 บนจอ guest)
 *
 * อักษรแรก = ตัวถอยชุดเดียวกับ MUI `Avatar` บนจอที่ล็อกอินแล้ว (OrderDetailMobile) — ร้านเดียวกัน
 * ต้องดูเหมือนกันทั้งสองจอ (sibling-surface-parity) · ผู้เรียกเป็นเจ้าของกรอบวงกลม/ขนาด/สีตัวอักษร
 *
 * รูปที่ล้มก่อน hydrate ไม่ยิง onError (event หายไปแล้ว) → ตรวจซ้ำใน ref callback ตอน mount
 * (ท่าเดียวกับ CoverBand ใน ShopHeaderBar แต่ไม่ setState ใน effect)
 *
 * Base: src/app/(marketing)/o/[token]/ShopHeaderBar.tsx (CoverBand — onError + ตรวจหลัง hydrate)
 */
import { useState } from 'react'

export default function ShopLogoImg({ src, shopName }: { src: string | null; shopName: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <>{shopName.slice(0, 1)}</>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=''
      ref={(img) => {
        if (img && img.complete && img.naturalWidth === 0) setFailed(true)
      }}
      onError={() => setFailed(true)}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  )
}
