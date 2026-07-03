'use client'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/widget-examples/advanced/ActiveProjects.tsx
//   (img+fallback idiom ที่ badges/page.tsx ใช้) — icon-fallback pattern mirror in-repo
//   src/app/(paces)/seller/(dashboard)/badges/BadgeImage.tsx (precedence img → IconifyIcon lucide)

/**
 * BadgeIcon — client component สำหรับแสดงรูป badge พร้อม onError fallback
 *
 * precedence: imageUrl → <img onError> → iconify icon (badgeIconName: DB icon → map ชื่อ → award)
 * ทำไมต้องเป็น client: onError ต้องใช้ useState (event handler ไม่ทำงานใน RSC)
 * no-emoji (Hard Rule 12): fallback ใช้ iconify icon — DB icon ที่เป็น emoji ถูกทิ้ง แทนด้วย map ตามชื่อ
 *
 * ใช้ใน:
 *  - src/app/(marketing)/(buyer-app)/badges/page.tsx (RSC ที่นำเข้า client boundary)
 *  - src/views/pages/user-profile/profile/AchievementBadges.tsx
 */

import { useState } from 'react'
import { Icon as IconifyIcon } from '@iconify/react'
import { badgeIconName } from '@/lib/badge-icons'

type Props = {
  imageUrl?: string | null
  /** ชื่อ badge (EN) — ใช้ map เป็น icon เมื่อ imageUrl ว่าง + DB icon เป็น emoji */
  nameEN?: string | null
  /** badge.icon จาก DB — ใช้เมื่อเป็นชื่อ iconify จริง (emoji จะถูกทิ้ง) */
  icon?: string | null
  /** ขนาด px (default 32) — earned grid ใช้ ≥96 */
  size?: number
  alt?: string
}

export default function BadgeIcon({ imageUrl, nameEN, icon, size = 32, alt = 'badge' }: Props) {
  const [imgFailed, setImgFailed] = useState(false)
  const showImg = !!imageUrl && !imgFailed

  const dim = size

  if (showImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl!}
        alt={alt}
        width={dim}
        height={dim}
        loading='lazy'
        onError={() => setImgFailed(true)}
        style={{ width: dim, height: dim, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
      />
    )
  }

  // fallback: iconify icon (no-emoji — Hard Rule 12); คุมสีผ่าน currentColor ของ parent
  return (
    <IconifyIcon
      icon={badgeIconName(nameEN, icon)}
      width={dim}
      height={dim}
      aria-label={alt}
      style={{ flexShrink: 0 }}
    />
  )
}
