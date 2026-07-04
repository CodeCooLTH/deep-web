'use client'

/**
 * AccountAvatar — วงกลม avatar/โลโก้ร้าน + fallback icon
 *   fallback เมื่อ: src ว่าง/null **หรือ** โหลดรูปไม่ขึ้น (onError — กันรูปแตกจาก logo URL เสีย)
 * ใช้ร่วมกัน: UserDropdownDetailed (topbar button/active box/list) + UserProfileSettings
 * pattern onError ตาม convention เดิม (BadgeImage/ChatThread/OrderCard)
 */

import Icon from '@/components/wrappers/Icon'
import { useState } from 'react'

interface Props {
  src: string | null | undefined
  kind: 'business' | 'personal'
  /** utility ขนาด/margin เช่น 'size-8 lg:me-3' | 'size-9' | 'size-7' */
  className: string
}

const AccountAvatar = ({ src, kind, className }: Props) => {
  const [failed, setFailed] = useState(false)

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className={`${className} rounded-full object-cover shrink-0`}
      />
    )
  }

  return (
    <span className={`${className} rounded-full bg-primary/15 text-primary inline-flex items-center justify-center shrink-0`}>
      <Icon icon={kind === 'business' ? 'building-store' : 'user'} className="size-1/2" />
    </span>
  )
}

export default AccountAvatar
