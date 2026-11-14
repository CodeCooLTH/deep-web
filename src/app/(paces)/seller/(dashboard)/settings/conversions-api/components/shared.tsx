'use client'

/**
 * ชิ้นส่วนร่วมของ 3 หน้า Conversions API (feature 00089) — ป้ายสถานะ · avatar เพจ · ตัวยิง API · ลิงก์เชื่อมเพจใหม่
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (badge soft `bg-{c}/15 text-{c}-ink`)
 *   + src/app/(paces)/seller/(dashboard)/orders/components/BuyerAvatar.tsx · inbox/components/ChannelBadge.tsx (โลโก้ช่องทางจริง)
 *   + src/app/(paces)/seller/(dashboard)/settings/channels/ChannelsClient.tsx (anchor ไป /api/channels/facebook/connect = 302)
 */
import Icon from '@/components/wrappers/Icon'
import { getChannelDisplay } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'
import BuyerAvatar from '@/app/(paces)/seller/(dashboard)/orders/components/BuyerAvatar'
import { useT } from '@/i18n/LocaleProvider'
import type { CapiPageStatus } from '@/lib/meta-capi/ui'
import { cn } from '@/utils/helpers'

/** สถานะเดียวกัน = สีเดียวกันทั้ง 3 หน้า · "ส่งอยู่" ไม่ใช่เขียน (เปิดสวิตช์ ≠ Meta รับแล้ว — Design-Spec D7) */
const TONE: Record<CapiPageStatus, string> = {
  sending: 'bg-primary/15 text-primary-ink',
  problem: 'bg-warning/15 text-warning-ink',
  stopped: 'bg-danger/15 text-danger-ink',
  off: 'bg-default-100 text-default-800',
}

export function StatusBadge({ status }: { status: CapiPageStatus }) {
  const t = useT().conversionsApi
  const label = { sending: t.statusSending, problem: t.statusProblem, stopped: t.statusStopped, off: t.statusOff }[status]
  return (
    <span className={cn('badge gap-1', TONE[status])}>
      {(status === 'stopped' || status === 'problem') && <Icon icon="alert-triangle" className="size-3" aria-hidden="true" />}
      {label}
    </span>
  )
}

/** avatar เพจ + โลโก้ Messenger เกาะมุมล่างขวา — wrapper เป็น inline-block relative เพื่อไม่ให้ flex ของแถวมือถือดันไอคอนหลุดมุม */
export function PageAvatar({ src, name, className = 'size-10' }: { src: string | null; name: string; className?: string }) {
  const d = getChannelDisplay('MESSENGER')
  return (
    <span className="relative inline-block shrink-0">
      <BuyerAvatar src={src} name={name} className={className} />
      <span className="bg-card absolute -end-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full" aria-hidden="true">
        {d.logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.logoSrc} alt="" width={12} height={12} className="size-3" />
        ) : (
          <Icon icon={d.icon} className="size-3" />
        )}
      </span>
    </span>
  )
}

/** endpoint ตอบ 302 ไป Facebook → ต้องเป็น anchor ธรรมดา ไม่ใช่ next/link (บทเรียนใน ChannelsClient) */
export function ReconnectLink({ className }: { className?: string }) {
  const t = useT().conversionsApi
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- endpoint ตอบ 302 ไป OAuth ของ Meta ไม่ใช่หน้าในแอป
    <a href="/api/channels/facebook/connect" className={cn('btn btn-sm bg-primary/15 text-primary-ink hover:bg-primary/25 min-h-11 lg:min-h-0', className)}>
      <Icon icon="plug-connected" className="size-3.5" aria-hidden="true" />
      {t.reconnect}
    </a>
  )
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code?: string; error?: string }

async function call<T>(base: string, path: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const j = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null
    if (!res.ok) return { ok: false, status: res.status, code: j?.code, error: j?.error }
    return { ok: true, data: j as T }
  } catch {
    return { ok: false, status: 0 }
  }
}

/** ยิง /api/shops/meta-capi/** — ไม่ throw: คืนผลให้ผู้เรียกแปลเป็นข้อความเอง */
export const capiApi = <T = unknown,>(path: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown) => call<T>('/api/shops/meta-capi', path, method, body)

/** ยิง /api/shops/meta-audience/** (feature 00092) — แยกจาก capiApi เพราะ prefix ต่างกัน */
export const audienceApi = <T = unknown,>(path: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown) => call<T>('/api/shops/meta-audience', path, method, body)
