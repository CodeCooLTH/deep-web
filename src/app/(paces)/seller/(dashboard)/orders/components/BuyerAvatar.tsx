'use client'

/**
 * BuyerAvatar — รูป buyer (User.avatar) + fallback thumbnail icon (guest/ไม่มีรูป/onError)
 * Base: src/components/AccountAvatar.tsx (onError pattern) — fallback = icon 'user' (thumbnail) ไม่ใช่ตัวอักษร
 */

import Icon from '@/components/wrappers/Icon'
import { useState } from 'react'

interface Props {
  src?: string | null
  /** ชื่อ (ใช้เป็น alt เท่านั้น) */
  name?: string
  /** utility ขนาด เช่น 'size-8' */
  className?: string
}

export default function BuyerAvatar({ src, name = '', className = 'size-8' }: Props) {
  const [failed, setFailed] = useState(false)

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        onError={() => setFailed(true)}
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    )
  }
  // guest / ไม่มีรูป → thumbnail icon คน (แทนตัวอักษรแรก)
  return (
    <span className={`${className} inline-flex shrink-0 items-center justify-center rounded-full bg-default-100 text-default-400`}>
      <Icon icon="user" className="size-1/2" />
    </span>
  )
}
