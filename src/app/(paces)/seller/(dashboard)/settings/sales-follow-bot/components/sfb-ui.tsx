'use client'

/**
 * ชิ้นส่วนร่วมของหน้าบอทติดตามยอดขาย (00095 S-7) — ป้ายสถานะ · รูปโปรไฟล์+โลโก้แพลตฟอร์ม · รูปจากไฟล์ · การ์ดโหลดล้ม · คำเรียกเวลา
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx
 *   + settings/tags/components/TagsClient.tsx (TagBadge — badge) · inbox/components/ChannelBadge.tsx (ChannelBadgeOverlay — โลโก้เกยมุมรูป)
 */
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ChannelBadgeOverlay } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { fileUrlOf, variantUrlOf } from '@/lib/file-url'
import type { BotStatus } from '@/lib/sales-follow-bot/constants'
import { avatarInitial, type DurationWords } from '@/lib/sales-follow-bot/ui'

/** คำเรียกหน่วยเวลาแบบสั้น (ชม./นาที/วัน) — ตามภาษาที่เลือก */
export function useDurationWords(): DurationWords {
  const t = useT().salesFollowBot
  return { day: t.unitDay, hour: t.shortHour, minute: t.unitMinute }
}

/** ป้ายสถานะบอท — ปิด = เทา (เงียบ ไม่ใช่ล้มเหลว) · ทดสอบ = info + ไอคอน · เปิดใช้ = primary (ไม่ใช้เขียน เพราะ "กำลังทำงาน" ≠ "ยืนยันแล้ว") */
export function StatusBadge({ status }: { status: BotStatus }) {
  const t = useT().salesFollowBot
  if (status === 'TESTING')
    return (
      <span className="badge bg-info/15 text-info-ink text-xs">
        <Icon icon="flask" aria-hidden="true" />
        {t.statusTesting}
      </span>
    )
  if (status === 'ACTIVE')
    return (
      <span className="badge bg-primary/15 text-primary-ink text-xs">
        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
        {t.statusActive}
      </span>
    )
  return <span className="badge bg-default-200 text-default-800 text-xs">{t.statusClosed}</span>
}

/** รูปจากไฟล์ที่ร้านอัปโหลด: ลอง thumb ก่อน ไม่ได้ถอยไปต้นฉบับ (รูปเก่าไม่มี variant เป็นเรื่องปกติ — file-url.ts) */
export function FileThumb({ fileId, alt, className }: { fileId: string; alt: string; className?: string }) {
  const [useOriginal, setUseOriginal] = useState(false)
  const src = (!useOriginal && variantUrlOf(fileId, 'thumb')) || fileUrlOf(fileId)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" className={className} onError={() => !useOriginal && setUseOriginal(true)} />
  )
}

/** รูปโปรไฟล์วงกลม (รูปจริงถ้ามี ไม่งั้นตัวอักษรแรก) + โลโก้แพลตฟอร์มเกยมุม — ท่าเดียวกับแถวกล่องแชท */
export function AvatarWithPlatform({
  imageUrl,
  name,
  provider,
  className = 'size-10',
  badge = 'md',
}: {
  imageUrl: string | null
  name: string
  provider: string
  /** ขนาดวงกลม (คลาส size-*) */
  className?: string
  badge?: 'sm' | 'md'
}) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      {imageUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="size-full rounded-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span className="bg-default-200 text-default-700 flex size-full items-center justify-center rounded-full text-xs font-semibold" aria-hidden="true">
          {avatarInitial(name)}
        </span>
      )}
      <ChannelBadgeOverlay channel={provider} size={badge} />
    </span>
  )
}

/** โหลดล้ม + ปุ่มลองใหม่ (ดึงข้อมูลจาก server ใหม่) — ท่าแถวล้มของ FollowUpPanel */
export function LoadFailed({ message }: { message: string }) {
  const t = useT().salesFollowBot
  const router = useRouter()
  return (
    <div className="card">
      <div className="card-body">
        <div role="alert" className="flex flex-col items-center gap-2 py-6 text-center">
          <Icon icon="alert-triangle" className="text-warning-ink size-8" aria-hidden="true" />
          <p className="text-default-900 text-sm font-medium">{message}</p>
          <button type="button" onClick={() => router.refresh()} className="btn border-default-300 text-default-800 min-h-11 border lg:min-h-0">
            {t.retry}
          </button>
        </div>
      </div>
    </div>
  )
}
