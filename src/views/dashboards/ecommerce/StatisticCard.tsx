/**
 * Admin dashboard stat card — SafePay adaptation.
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 * Adaptations:
 *   - Drop month-over-month `change` (we don't track it yet — MVP is cumulative)
 *   - Allow per-card tint class (primary/success/warning/info) via `tone` prop
 *   - Thai `title` + optional `suffix` (e.g. "คน", "ออเดอร์")
 */
import { CountUp } from '@/components/wrappers/CountUp'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'

export type AdminStat = {
  title: string
  value: number
  suffix?: string
  icon: string
  tone?: 'primary' | 'success' | 'warning' | 'info' | 'secondary' | 'danger'
  /** มีค่า = การ์ดทั้งใบกดได้ (เพิ่ม 2026-09-06 · feature 00060) — ไม่ใส่ = การ์ดอ่านอย่างเดียว
   *  เหมือนเดิมทุกประการ ⇒ หน้าอื่นที่ใช้คอมโพเนนต์นี้อยู่แล้วไม่ต้องแก้อะไร */
  onClick?: () => void
  /** คำอธิบายเพิ่มสำหรับ screen reader เมื่อการ์ดกดได้ — ตัวเลขเปล่าไม่บอกว่ากดแล้วได้อะไร */
  actionHint?: string
}

const toneClass: Record<NonNullable<AdminStat['tone']>, string> = {
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  info: 'bg-info/15 text-info',
  secondary: 'bg-secondary/15 text-secondary',
  // เพิ่ม 2026-09-05 (feature 00060) — การ์ดที่ต้องอ่านว่า "เรื่องนี้หนักกว่าคิวที่ช้า"
  // ไม่มีโทนไหนเดิมสื่อได้: warning ถูกใช้กับงานเลยกำหนดอยู่แล้ว ส่วน secondary อ่านว่าไม่สำคัญ
  danger: 'bg-danger/15 text-danger',
}

const StatisticCard = ({ stat }: { stat: AdminStat }) => {
  const { title, value, suffix, icon, tone = 'primary', onClick, actionHint } = stat
  const body = (
    <>
      <div className="card-body">
        <div className="flex justify-between items-start">
          <div>
            <h5 className="text-default-400 text-sm mb-2 font-medium">
              {title}
            </h5>
            <h3 className="my-5 py-1.25 text-xl">
              <CountUp
                start={0}
                end={value}
                suffix={suffix ?? ''}
                duration={1}
                decimals={Number.isInteger(value) ? 0 : 2}
              />
            </h3>
          </div>
          <div>
            <div className={cn('size-9 rounded-full flex justify-center items-center', toneClass[tone])}>
              <Icon icon={icon} className="size-5.5" />
            </div>
          </div>
        </div>
      </div>
    </>
  )

  // การ์ดที่กดได้ต้องเป็น <button> จริง ไม่ใช่ <div onClick> — ไม่งั้นคีย์บอร์ดโฟกัสไม่ถึง
  // และ screen reader ไม่มีทางรู้ว่ามันกดได้ (docs/conventions/aria-name-requires-supporting-role.md)
  if (onClick !== undefined) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={actionHint === undefined ? undefined : `${title} — ${actionHint}`}
        className="card h-full w-full text-start transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        {body}
      </button>
    )
  }

  return <div className="card h-full">{body}</div>
}

export default StatisticCard
