/**
 * ShareBar — แถบสัดส่วนบาง ๆ ใต้แถวรายการ (ใช้ใน ③ แอดสูงสุด · ⑥ จังหวัด) · feature 00091 FR-009
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalSubscriber.tsx
 *   (`w-full h-1.25 bg-default-100 rounded` + ลูก `h-full` + `style={{ width }}` — ธีมเองก็ใช้ความกว้างไดนามิกแบบนี้)
 *   + .../dashboard/analytics/components/UserGeography.tsx (แถบ h-1.25 rounded-full + overflow-hidden)
 * ตกแต่งล้วน (aria-hidden) — ตัวเลขอยู่ในข้อความข้างแถบเสมอ
 */
import { cn } from '@/utils/helpers'

export default function ShareBar({ pct, tone = 'primary' }: { pct: number; tone?: 'primary' | 'muted' }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div className="bg-default-100 h-1.25 w-full overflow-hidden rounded-full" aria-hidden="true">
      {/* ความกว้างเป็นค่าไดนามิกตามสัดส่วน — ธีม Paces ทำแบบเดียวกัน ไม่ใช่ arbitrary Tailwind */}
      <div className={cn('h-full rounded-full', tone === 'primary' ? 'bg-primary' : 'bg-default-400')} style={{ width: `${w}%` }} />
    </div>
  )
}
