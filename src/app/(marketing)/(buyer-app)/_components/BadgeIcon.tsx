'use client'

// Base: utility island — ไม่มี theme widget ตรง ๆ; pattern img+fallback ตาม idiom เดียวกับ ActiveProjects (theme/vuexy/typescript-version/full-version/src/views/pages/widget-examples/advanced/ActiveProjects.tsx) ที่ badges/page.tsx ใช้

/**
 * BadgeIcon — client component สำหรับแสดงรูป badge พร้อม onError fallback
 *
 * precedence: imageUrl → <img onError> → emoji badge.icon
 * ทำไมต้องเป็น client: onError ต้องใช้ useState (event handler ไม่ทำงานใน RSC)
 *
 * ใช้ใน:
 *  - src/app/(marketing)/(buyer-app)/badges/page.tsx (RSC ที่นำเข้า client boundary)
 *  - src/views/pages/user-profile/profile/AchievementBadges.tsx
 */

import { useState } from 'react'

type Props = {
  imageUrl?: string | null
  /** emoji fallback — badge.icon จาก DB */
  icon?: string | null
  /** ขนาด px (default 32) — earned grid ใช้ ≥96 */
  size?: number
  alt?: string
}

export default function BadgeIcon({ imageUrl, icon, size = 32, alt = 'badge' }: Props) {
  const [imgFailed, setImgFailed] = useState(false)
  const showImg = !!imageUrl && !imgFailed

  const dim = size
  const fontSize = Math.round(size * 0.55)

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

  // fallback: emoji badge.icon (ไม่ใช่ lucide) — เดิมของ Vuexy buyer surface
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: dim,
        height: dim,
        fontSize,
        flexShrink: 0,
      }}
      role='img'
      aria-label={alt}
    >
      {icon || '🏅'}
    </span>
  )
}
