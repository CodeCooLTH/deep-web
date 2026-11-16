'use client'

/**
 * CapiStoppedBanner — "หยุดส่ง event ให้ Meta · ต้องเชื่อมเพจใหม่" ในแถบสถานะหัวห้อง (feature 00097 · D13)
 * ใช้เป็น `detail` ของ item `capiStopped` ใน threadStatuses (ChatThread) — ไม่มี state/ปุ่มทำงานเอง ลิงก์ไปตั้งค่าเท่านั้น
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx ผ่านพี่น้อง BotPausedBanner.tsx (markup เดียวกัน เปลี่ยนเป็นโทน warning-ink)
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'

export default function CapiStoppedBanner({ channelId }: { channelId: string }) {
  const t = useT().conversionsApi
  return (
    <div className="bg-warning/15 text-warning-ink flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
      <Icon icon="plug-connected-x" className="mt-0.5 shrink-0 text-lg" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {t.statusStoppedTitle}
        <span className="block text-xs">{t.statusStoppedBody}</span>
      </span>
      <Link href={`/settings/capis/${channelId}`} className="btn btn-sm bg-card text-default-700 min-h-11 shrink-0 sm:min-h-0">
        {t.goSettings}
      </Link>
    </div>
  )
}
