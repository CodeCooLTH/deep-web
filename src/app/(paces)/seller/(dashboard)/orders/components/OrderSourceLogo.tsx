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

/** โลโก้สีของแพลตฟอร์ม — ไฟล์จริงใน public (ตัวเดียวกับ CHANNEL_LOGO ของ OrderCard) */
export const PLATFORM_LOGO: Record<string, string> = {
  FACEBOOK: '/images/logos/facebook.svg',
  LINE: '/images/logos/line.svg',
}

interface Props {
  /** รูปเพจ — null = ไม่รู้เพจ ให้ตกไปโลโก้แพลตฟอร์ม */
  logoUrl: string | null
  /** STOREFRONT | FACEBOOK | LINE | TIKTOK | OTHER | null */
  channel: string | null
  className?: string
}

export default function OrderSourceLogo({ logoUrl, channel, className }: Props) {
  const [failed, setFailed] = useState(false)
  const label = channel ? (SALES_CHANNEL_LABELS[channel] ?? channel) : 'ไม่ระบุช่องทาง'
  const src = (!failed && logoUrl) || (channel ? PLATFORM_LOGO[channel] : undefined)

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={label}
        title={label}
        /* ring กันรูปเพจพื้นขาวกลืนกับพื้นการ์ด (convention user-supplied-image-assets) */
        className={cn('ring-default-200 size-8 shrink-0 rounded-full object-cover ring-1', className)}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <span
      title={label}
      className={cn(
        'bg-default-100 text-default-600 flex size-8 shrink-0 items-center justify-center rounded-full',
        className,
      )}
    >
      <Icon icon={`tabler:${channel ? (SALES_CHANNEL_ICONS[channel] ?? 'world') : 'world'}`} className="text-base" aria-label={label} />
    </span>
  )
}
