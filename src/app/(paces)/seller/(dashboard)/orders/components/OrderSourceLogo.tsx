'use client'

/**
 * OrderSourceLogo — โลโก้ "ที่มา" ของออเดอร์ในลิสต์ (user สั่ง 2026-08-06)
 *
 * ลำดับการเลือกภาพ:
 * 1. รูปเพจที่ลูกค้าทักมา (ShopChannel.avatarUrl — ตอนนี้รู้ได้เฉพาะออเดอร์ FACEBOOK
 *    ของร้านที่เชื่อมเพจเดียว; ร้านหลายเพจ/ช่องทางอื่นตกไปข้อ 2)
 * 2. โลโก้สีของแพลตฟอร์ม (facebook/line svg — map เดียวกับ ChannelBadge ใน OrderCard)
 * 3. tabler icon ของช่องทาง (STOREFRONT/TIKTOK/OTHER ที่ไม่มีไฟล์โลโก้)
 */

import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { SALES_CHANNEL_ICONS, SALES_CHANNEL_LABELS } from './data'
import { SALES_CHANNEL_LOGO } from '@/lib/sales-channel-logo'

/** โลโก้สีของแพลตฟอร์ม — SSOT อยู่ที่ lib/sales-channel-logo (เดิมก็อปไว้ 2 ที่ ดูเหตุผลที่นั่น) */
export { SALES_CHANNEL_LOGO as PLATFORM_LOGO } from '@/lib/sales-channel-logo'

interface Props {
  /** รูปเพจ — null = ไม่รู้เพจ ให้ตกไปโลโก้แพลตฟอร์ม */
  logoUrl: string | null
  /** STOREFRONT | FACEBOOK | LINE | TIKTOK | OTHER | null */
  channel: string | null
  /** sm = แถวตาราง (32px) · lg = หัวหน้า order detail (48px — user 2026-08-06) */
  size?: 'xs' | 'sm' | 'lg'
  className?: string
}

const SIZE = {
  xs: { avatar: 'size-6', badge: 'size-3', icon: 'text-sm' },
  sm: { avatar: 'size-8', badge: 'size-3.5', icon: 'text-base' },
  lg: { avatar: 'size-12', badge: 'size-4.5', icon: 'text-xl' },
} as const

export default function OrderSourceLogo({ logoUrl, channel, size = 'sm', className }: Props) {
  const sz = SIZE[size]
  // แยก failed ราย src — รูปเพจโหลดพัง (URL ฝั่ง Meta หมดอายุได้) ต้องตกไปโลโก้แพลตฟอร์มต่อ
  const [pageFailed, setPageFailed] = useState(false)
  const [platformFailed, setPlatformFailed] = useState(false)
  const label = channel ? (SALES_CHANNEL_LABELS[channel] ?? channel) : 'ไม่ระบุช่องทาง'
  const pageSrc = !pageFailed && logoUrl ? logoUrl : null
  const platformSrc = channel && !platformFailed ? SALES_CHANNEL_LOGO[channel] : undefined

  if (pageSrc) {
    return (
      <span className={cn('relative inline-block shrink-0', className)} title={label}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pageSrc}
          alt={label}
          /* ring กันรูปเพจพื้นขาวกลืนกับพื้นการ์ด (convention user-supplied-image-assets) */
          className={`ring-default-200 ${sz.avatar} rounded-full object-cover ring-1`}
          onError={() => setPageFailed(true)}
        />
        {/* badge แพลตฟอร์มมุมขวาล่างของรูปเพจ (user 2026-08-06) — pattern เดียวกับ
            avatar+channel badge ในกล่องแชท: ring-card คั่นรูปกับ badge ให้อ่านเป็นคนละชั้น */}
        {platformSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={platformSrc}
            alt=""
            className={`ring-card bg-card absolute -bottom-0.5 -end-0.5 ${sz.badge} rounded-full ring-2`}
            onError={() => setPlatformFailed(true)}
          />
        )}
      </span>
    )
  }

  if (platformSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={platformSrc}
        alt={label}
        title={label}
        className={cn(sz.avatar, 'shrink-0 rounded-full object-contain', className)}
        onError={() => setPlatformFailed(true)}
      />
    )
  }

  return (
    <span
      title={label}
      className={cn(
        `bg-default-100 text-default-600 flex ${sz.avatar} shrink-0 items-center justify-center rounded-full`,
        className,
      )}
    >
      <Icon icon={`tabler:${channel ? (SALES_CHANNEL_ICONS[channel] ?? 'world') : 'world'}`} className={sz.icon} aria-label={label} />
    </span>
  )
}
