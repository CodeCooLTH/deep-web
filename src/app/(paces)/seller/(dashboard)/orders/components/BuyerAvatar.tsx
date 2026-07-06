'use client'

/**
 * BuyerAvatar — รูป buyer (User.avatar) + fallback ตัวอักษรแรกของชื่อ (onError/null)
 * Base: src/components/AccountAvatar.tsx (onError pattern) — fallback = initial ไม่ใช่ icon
 */

import { useState } from 'react'

interface Props {
  src?: string | null
  name: string
  /** utility ขนาด เช่น 'size-8' */
  className?: string
}

export default function BuyerAvatar({ src, name, className = 'size-8' }: Props) {
  const [failed, setFailed] = useState(false)
  const initial = (name.trim().charAt(0) || '?').toUpperCase()

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    )
  }
  return (
    <div className={`${className} flex shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary`}>
      {initial}
    </div>
  )
}
