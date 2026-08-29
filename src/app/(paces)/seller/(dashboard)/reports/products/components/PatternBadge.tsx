/**
 * PatternBadge — ป้ายสรุปพฤติกรรมการขายของสินค้าหนึ่งตัว (feature 00062)
 *
 * Base: docs/system/ui-guideline/paces-component-reference.md §6 Badge
 *   (`badge bg-{semantic}/15 text-{semantic}-ink` — ห้าม `text-{semantic}` เปล่า คอนทราสต์ตก)
 *
 * 🛑 ไม่มีเขียว (`success`) ในหน้านี้เลยโดยตั้งใจ — Verified-Means-Green สงวนเขียวไว้ให้
 * "ความเชื่อใจที่ยืนยันแล้ว" เท่านั้น "ขายสม่ำเสมอ" เป็นคำ *บรรยายรูปแบบ* ไม่ใช่ "ผ่าน/สำเร็จ"
 * จึงใช้ info · "ขายกระจุก"/"เงียบมาแล้ว" ใช้ warning = "ควรไปดูต่อ" ไม่ใช่ "ผิดพลาด"
 */
import Icon from '@/components/wrappers/Icon'
import {
  type SalesPattern,
  salesPatternDescription,
  salesPatternLabel,
} from '@/lib/product-sales-month'

/** ไอคอนที่ยืนยันแล้วว่ามีจริงในชุด tabler และถูกใช้อยู่ในโปรเจกต์นี้แล้ว */
const ICONS: Record<Exclude<SalesPattern['kind'], 'NONE'>, string> = {
  CONCENTRATED: 'chart-bar',
  STEADY: 'activity',
  DORMANT: 'clock',
}

const TONES: Record<Exclude<SalesPattern['kind'], 'NONE'>, string> = {
  CONCENTRATED: 'bg-warning/15 text-warning-ink',
  STEADY: 'bg-info/15 text-info-ink',
  DORMANT: 'bg-warning/15 text-warning-ink',
}

export default function PatternBadge({ pattern }: { pattern: SalesPattern }) {
  const label = salesPatternLabel(pattern)
  if (pattern.kind === 'NONE' || !label) {
    // 🛑 ขีดกลาง ไม่ใช่ช่องว่างเปล่า — ผู้อ่านต้องแยก "ไม่มีป้าย" ออกจาก "ป้ายยังโหลดไม่เสร็จ"
    return (
      <span className="text-default-400" title="ขายได้น้อยกว่า 3 ครั้งในเดือนนี้ หรือไม่เข้าเกณฑ์ใด">
        —
      </span>
    )
  }

  const description = salesPatternDescription(pattern)
  return (
    <span
      className={`badge inline-flex items-center gap-1 ${TONES[pattern.kind]}`}
      title={description ?? undefined}>
      <Icon icon={ICONS[pattern.kind]} className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  )
}
