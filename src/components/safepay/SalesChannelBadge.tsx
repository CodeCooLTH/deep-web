'use client'

/**
 * SalesChannelBadge — ป้ายช่องทางการขายของออเดอร์ (โลโก้แบรนด์จริง + ชื่อ)
 *
 * ทำไมมีไฟล์นี้: เดิมหน้ารายละเอียดคำสั่งซื้อแสดงช่องทางเป็นข้อความล้วน ("ช่องทาง: Facebook")
 * user request 2026-07-30: "คนไทยชอบอะไรที่ดูง่าย ๆ" — โลโก้แบรนด์จำได้เร็วกว่าอ่านตัวหนังสือมาก
 *
 * Base (pattern): src/app/(paces)/seller/(chat)/inbox/components/ChannelBadge.tsx
 *   ใช้โครงเดียวกัน (badge + โลโก้จริง + fallback tabler icon เมื่อรูปพัง) แต่คนละ enum:
 *   ChannelBadge = ช่องทาง "แชท" (DEEP/MESSENGER/INSTAGRAM)
 *   ไฟล์นี้      = ช่องทาง "การขาย" ของ Order.salesChannel (STOREFRONT/FACEBOOK/LINE/TIKTOK/OTHER)
 *   จึงแยกไฟล์แทนที่จะยัด enum สองชุดเข้า component เดียว
 *
 * Hard Rule 6 carve-out: สีแบรนด์/โลโก้เป็น asset ใช้ตาม ref ได้
 * Hard Rule 7: ใช้ Paces primitive ล้วน (badge/bg-default-100/text-default-700/size-*) ไม่มี arbitrary value
 */

import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'

export type SalesChannelDisplay = {
  label: string
  /** tabler icon — ใช้เมื่อไม่มีโลโก้แบรนด์ หรือโลโก้โหลดไม่ขึ้น */
  icon: string
  /** โลโก้แบรนด์จริงใน public/images/logos (reuse ของเดิม ไม่สร้างใหม่) */
  logoSrc?: string
}

const CHANNEL_DISPLAY: Record<string, SalesChannelDisplay> = {
  // หน้าร้าน = ไม่ใช่แบรนด์ ใช้ tabler icon; building-store เป็นตัวที่โปรเจกต์ใช้สื่อ "ร้าน" อยู่แล้ว
  STOREFRONT: { label: 'หน้าร้าน', icon: 'building-store' },
  FACEBOOK: { label: 'Facebook', icon: 'brand-facebook', logoSrc: '/images/logos/facebook.svg' },
  INSTAGRAM: { label: 'Instagram', icon: 'brand-instagram', logoSrc: '/images/logos/instagram-circle.svg' },
  LINE: { label: 'LINE', icon: 'brand-line', logoSrc: '/images/logos/line.svg' },
  // โลโก้ TikTok — user ส่งไฟล์มาให้เอง 2026-07-30
  TIKTOK: { label: 'TikTok', icon: 'brand-tiktok', logoSrc: '/images/logos/tiktok.png' },
  OTHER: { label: 'อื่นๆ', icon: 'dots' },
}

export function getSalesChannelDisplay(channel: string): SalesChannelDisplay {
  return CHANNEL_DISPLAY[channel] ?? { label: channel, icon: 'dots' }
}

/** โลโก้ + fallback เป็น tabler icon เมื่อไฟล์รูปโหลดไม่สำเร็จ */
export function SalesChannelLogo({
  channel,
  size = 20,
  className = '',
}: {
  channel: string
  size?: number
  className?: string
}) {
  const display = getSalesChannelDisplay(channel)
  const [failed, setFailed] = useState(false)

  if (display.logoSrc && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={display.logoSrc}
        alt={display.label}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded object-contain ${className}`}
      />
    )
  }
  return (
    <Icon
      icon={display.icon}
      width={size}
      height={size}
      className={`text-default-700 shrink-0 ${className}`}
      aria-hidden="true"
    />
  )
}

/** pill badge: โลโก้ + ชื่อช่องทาง — ใช้ข้างข้อมูลการชำระเงิน/ในการ์ดคำสั่งซื้อ */
export default function SalesChannelBadge({ channel }: { channel: string }) {
  const display = getSalesChannelDisplay(channel)
  return (
    <span className="badge bg-default-100 text-default-700 inline-flex items-center gap-1.5 text-xs">
      <SalesChannelLogo channel={channel} size={14} />
      {display.label}
    </span>
  )
}
