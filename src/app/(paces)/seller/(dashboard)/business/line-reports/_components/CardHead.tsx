/**
 * CardHead / GroupLabel — หัวการ์ดแบบ "การ์ดขาวโค้งมนบนพื้นเทา" ของหน้าจัดข้อความ + หน้าตั้งค่ากลุ่ม LINE (feature 00070 EXT)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/statistics/components/Stat.tsx (แผ่นไอคอน + ป้าย)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card/.card-body)
 * Spec: docs/superpowers/specs/2026-10-05-line-report-rounded-card-mockup.md §5
 * ใช้ร่วมกันสองหน้า: แผ่นไอคอน `size-10 rounded-lg` · ชื่อ 16/600 · คำอธิบาย 12 สีรอง · ระยะหัว→เนื้อ 16
 */
import type { ReactNode } from 'react'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'

/** การ์ดโค้งมน 12px เฉพาะสองหน้านี้ (มติ user 2026-10-05) — คลาสธีม rounded-xl ไม่ใช่ arbitrary */
export const ROUND_CARD = 'card rounded-xl border border-default-300 shadow-sm'

export type PlateTone = 'primary' | 'success' | 'warning' | 'info' | 'mute'
export const PLATE_TONE: Record<PlateTone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/15 text-success-ink',
  warning: 'bg-warning/15 text-warning-ink',
  info: 'bg-info/15 text-info-ink',
  mute: 'bg-default-200 text-default-700',
}

export function Plate({ icon, tone = 'primary', small }: { icon: string; tone?: PlateTone; small?: boolean }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-lg', small ? 'size-8' : 'size-10', PLATE_TONE[tone])}>
      <Icon icon={icon} className={small ? 'text-base' : 'text-xl'} aria-hidden="true" />
    </span>
  )
}

export default function CardHead({
  icon,
  tone = 'primary',
  title,
  desc,
  headingId,
  children,
}: {
  icon: string
  tone?: PlateTone
  title: string
  desc?: ReactNode
  headingId?: string
  /** ชิป/ปุ่ม/seg ชิดขวา */
  children?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Plate icon={icon} tone={tone} />
      <div className="min-w-0 flex-1">
        <h2 id={headingId} className="text-default-900 mb-0 text-base font-semibold">
          {title}
        </h2>
        {desc && <p className="text-default-700 mb-0 text-xs">{desc}</p>}
      </div>
      {children}
    </div>
  )
}

/** ป้ายหัวกลุ่มในการ์ด: ตัวหนา 12 + คำอธิบายจาง · บน 24 ล่าง 8 (กลุ่มแรกไม่มีระยะบน) */
export function GroupLabel({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="text-default-900 mt-6 mb-2 text-xs font-semibold first:mt-0">
      {children}
      {sub && <span className="text-default-700 font-normal"> · {sub}</span>}
    </div>
  )
}
