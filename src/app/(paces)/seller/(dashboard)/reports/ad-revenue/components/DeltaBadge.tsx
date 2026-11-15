'use client'

/**
 * DeltaBadge — % เปลี่ยนเทียบช่วงก่อน เป็น badge ต่อท้ายตัวเลขในแถวเดียวกัน (00091 เฟส 3 · มติ user 2026-11-15)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalOrder.tsx
 *   (`badge text-sm py-0 bg-{tone}/15 text-{tone}` + ไอคอนลูกศร + ค่า) ผ่านท่าเดียวกับ TotalVisitors/TotalSubscriber
 * 🛑 โทนตามทิศ "ดี/แย่" ของตัวชี้วัด ไม่ใช่ขึ้น/ลง: ดีขึ้น success · แย่ลง warning (ไม่ใช้ danger) · กลาง (neutral) bg-light ไม่มีลูกศร ใส่ +/−
 * 🛑 ฐาน 0 / ไม่มีตัวเทียบ (null) = ไม่แสดง badge · แสดงค่าสัมบูรณ์ (ไม่ใส่ +/− เมื่อมีลูกศร) · ทิศบอกด้วยไอคอน + sr-only ไม่พึ่งสีอย่างเดียว
 */
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'

/** higher = ขึ้นดี (ยอดขาย · ค่าโฆษณา — มติ user 2026-11-15 ค่าโฆษณาขึ้น = success ลง = warning) · lower = ขึ้นแย่ (ยกเลิก/ต้นทุน) · neutral = ไม่ตัดสิน (ยังไม่มีตัวชี้วัดไหนใช้) */
export type DeltaTone = 'higher' | 'lower' | 'neutral'
export type DeltaDir = 'good' | 'bad' | 'flat'

export function deltaDir(value: number | null, tone: DeltaTone): DeltaDir {
  if (value === null || value === 0 || tone === 'neutral') return 'flat'
  return (value > 0) === (tone === 'higher') ? 'good' : 'bad'
}

export default function DeltaBadge({ value, tone = 'higher', unit = '%' }: { value: number | null; tone?: DeltaTone; unit?: string }) {
  const t = useT().adReport
  if (value === null) return null
  const dir = deltaDir(value, tone)
  const abs = `${Math.abs(value).toFixed(1)}${unit}`
  if (dir === 'flat') {
    return <span className="badge bg-light text-default-700 py-0 text-sm tabular-nums">{tone === 'neutral' && value !== 0 ? `${value > 0 ? '+' : '−'}${abs}` : abs}</span>
  }
  return (
    <span className={`badge py-0 text-sm tabular-nums ${dir === 'good' ? 'bg-success/15 text-success-ink' : 'bg-warning/15 text-warning-ink'}`}>
      <Icon icon={value > 0 ? 'arrow-up' : 'arrow-down'} className="me-0.5 text-sm" aria-hidden="true" />
      <span className="sr-only">{value > 0 ? t.deltaUp : t.deltaDown}</span>
      {abs}
    </span>
  )
}
