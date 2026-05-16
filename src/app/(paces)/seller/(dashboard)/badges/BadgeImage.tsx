'use client'

/**
 * BadgeImage — client component จัดการ imageUrl precedence + onError fallback
 *
 * Base: utility island — ไม่มี theme widget ตรง ๆ; precedence img→IconifyIcon ตาม pattern BadgeAvatar ใน src/app/(paces)/admin/(dashboard)/badges/components/BadgesTable.tsx (in-repo precedent ที่ committed แล้ว)
 *
 * Precedence: imageUrl → img (onError → fallback IconifyIcon) → IconifyIcon (LUCIDE_FOR_BADGE) → FALLBACK_LUCIDE
 * ทำไม extract แยกไฟล์: badges/page.tsx เป็น server component; onError ต้องการ useState ซึ่ง
 * ใช้ได้เฉพาะ client component — ต้องแยกออกมาเป็น 'use client' island (same pattern ที่ admin
 * BadgesTable.tsx ทำกับ BadgeAvatar แต่ admin file นั้นเป็น 'use client' ทั้งไฟล์อยู่แล้ว)
 */

import { Icon as IconifyIcon } from '@iconify/react'
import { LUCIDE_FOR_BADGE, FALLBACK_LUCIDE } from '../_constants/badge-icons'
import { useState } from 'react'

type BadgeImageProps = {
  nameEN: string
  imageUrl: string | null
  /** ขนาด Tailwind class เช่น 'size-6' (widget) หรือ 'size-8' (earned card ≥96px circle) */
  sizeClass?: string
  className?: string
}

/**
 * BadgeImage — render รูป badge ตาม precedence
 * earned card: wrapper มี size-24 (≥96px) circle; ตัว img/icon size-8 ภายใน
 * in-progress row: wrapper มี size-10 circle; ตัว icon size-5
 * component นี้รับแค่ icon/img — ไม่รู้เรื่อง wrapper circle (parent จัดการ)
 */
export function BadgeImage({ nameEN, imageUrl, sizeClass = 'size-6', className = '' }: BadgeImageProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const lucide = LUCIDE_FOR_BADGE[nameEN] ?? FALLBACK_LUCIDE
  const showImg = !!imageUrl && !imgFailed

  if (showImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={nameEN}
        loading="lazy"
        className={`${sizeClass} object-contain ${className}`}
        onError={() => setImgFailed(true)}
      />
    )
  }

  return (
    <IconifyIcon
      icon={lucide}
      className={`${sizeClass} ${className}`}
    />
  )
}
