'use client'

/**
 * BadgeImage — client component จัดการ imageUrl precedence + onError fallback
 *
 * Base: utility island — ไม่มี theme widget ตรง ๆ; precedence img→IconifyIcon ตาม pattern BadgeAvatar ใน src/app/(paces)/admin/(dashboard)/badges/components/BadgesTable.tsx (in-repo precedent ที่ committed แล้ว)
 *
 * Precedence: imageUrl → img (onError → fallback IconifyIcon) → IconifyIcon จาก `badgeIconName()`
 *
 * 🛑 2026-08-21 (00052 P1): เลิกอ่าน `LUCIDE_FOR_BADGE[nameEN]` แล้ว — ชื่อไอคอนถูกเขียนลง
 * คอลัมน์ `Badge.icon` จริงแล้ว (migration `20260821090000_badge_v2_taxonomy`) ⇒ ต้อง thread
 * ค่าจากฐานเข้ามา ไม่ใช่ค้นจาก map ที่กำลังจะถูกลบ · ถ้าไม่ส่ง `icon` มา เหรียญทุกใบจะตกไป
 * `FALLBACK_LUCIDE` กลายเป็นไอคอนถ้วยรางวัลเหมือนกันหมด **โดยไม่มี error ให้ใครเห็น**
 * ทำไม extract แยกไฟล์: badges/page.tsx เป็น server component; onError ต้องการ useState ซึ่ง
 * ใช้ได้เฉพาะ client component — ต้องแยกออกมาเป็น 'use client' island (same pattern ที่ admin
 * BadgesTable.tsx ทำกับ BadgeAvatar แต่ admin file นั้นเป็น 'use client' ทั้งไฟล์อยู่แล้ว)
 */

import { Icon as IconifyIcon } from '@iconify/react'
import { badgeIconName } from '@/lib/badge-icons'
import { useState } from 'react'

type BadgeImageProps = {
  nameEN: string
  /** ค่า `Badge.icon` จากฐานข้อมูล (ชื่อ iconify) — ต้องส่งมาเสมอ ไม่งั้นตกไปไอคอนสำรองทุกใบ */
  icon: string | null
  imageUrl: string | null
  /** ขนาด Tailwind class เช่น 'size-[110px]' (badge card) — parent กำหนดตาม layout */
  sizeClass?: string
  className?: string
}

/**
 * BadgeImage — render รูป badge ตาม precedence (imageUrl → img onError → IconifyIcon)
 * รับแค่ icon/img ตาม sizeClass ที่ parent ส่ง — ไม่รู้เรื่อง wrapper/card (parent จัดการ)
 */
export function BadgeImage({ nameEN, icon, imageUrl, sizeClass = 'size-6', className = '' }: BadgeImageProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const iconName = badgeIconName(nameEN, icon)
  const showImg = !!imageUrl && !imgFailed

  if (showImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={nameEN}
        loading="lazy"
        className={`${sizeClass} object-contain ${className}`}
        style={{ imageRendering: 'pixelated' }}
        onError={() => setImgFailed(true)}
      />
    )
  }

  return (
    <IconifyIcon
      icon={iconName}
      className={`${sizeClass} ${className}`}
    />
  )
}
