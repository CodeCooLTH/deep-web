/**
 * AssignmentCard — การ์ดหนึ่งงานตรวจในคิวของผู้ตรวจ (feature 00060 · T13 · Surface C)
 *
 * Base: theme/paces/Admin/TS/src/assets/css/custom/_card.css (`.card` + `border-s-3` left accent)
 *       theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (`card border-{color} border-s-3`
 *       pattern — CardColoredBorder)
 * Adapt: มิเรอร์โครงการ์ดมือถือของ `/orders` (`OrderCard.tsx` — Base เดียวกันตาม
 *       `seller/page-sourcing.md` §orders) แต่ตัด action menu/expand ออกทั้งหมด เพราะรายการนี้
 *       ไม่มีอะไรให้ทำนอกจาก "แตะเพื่อเปิด" — Operate mode ไม่ใช่ dashboard
 *
 * Server component ล้วน — ไม่มี state ในรายการ ใช้ <Link> ห่อทั้งใบตรง ๆ ได้ (ไม่มีปุ่มลูกอื่น
 * ในการ์ดนี้ ต่างจาก OrderCard ที่มี ⋮/expand จึงต้อง stretched-link)
 *
 * ชื่อที่พักมาจากคิวโดยตรงแล้ว (`roomName` — เติมให้ที่ service เมื่อ 2026-09-05 หลังพบว่าสัญญา
 * API.md §4.6 บังคับไว้แต่ตัว implement รอบแรกลืมทั้งฟิลด์) · `null` = รอบระดับร้าน ไม่ใช่ข้อมูลหาย
 */

import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { INSPECTION_STEP_LABEL_TH, type InspectionMethod, type InspectionStep } from '@/lib/inspection/checks'
import { formatDateTH } from '@/lib/format-date'
import { cn } from '@/utils/helpers'

const METHOD_ICON: Record<InspectionMethod, string> = {
  AUTO: 'robot',
  DOCUMENT: 'file-text',
  VIDEO_CALL: 'video',
  ONSITE: 'map-pin',
}

const METHOD_LABEL: Record<InspectionMethod, string> = {
  AUTO: 'ตรวจอัตโนมัติ',
  DOCUMENT: 'ตรวจเอกสาร',
  VIDEO_CALL: 'วิดีโอคอล',
  ONSITE: 'ลงพื้นที่',
}

export type AssignmentCardProps = {
  id: string
  shopName: string
  /** null = รอบระดับร้าน (ไม่ผูกที่พักหลังใดหลังหนึ่ง) */
  roomName: string | null
  /** null = ข้อตรวจของรอบนี้เป็น scope SHOP ทั้งหมด — ไม่มี "หลัง" ให้ระบุ */
  step: InspectionStep
  method: InspectionMethod
  dueAtISO: string | null
  isOverdue: boolean
}

export default function AssignmentCard({ id, shopName, roomName, step, method, dueAtISO, isOverdue }: AssignmentCardProps) {
  return (
    <Link
      href={`/inspector/rounds/${id}`}
      className={cn('card border-s-3 block transition-colors active:bg-default-500/10', isOverdue ? 'border-danger' : 'border-default-300')}
    >
      <div className="card-body !py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-default-900">
              {shopName}
              {roomName !== null && <span className="font-normal text-default-500"> · {roomName}</span>}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-default-600">
              <Icon icon={METHOD_ICON[method]} className="size-3.5 shrink-0 text-default-400" aria-hidden="true" />
              {INSPECTION_STEP_LABEL_TH[step]} · {METHOD_LABEL[method]}
            </p>
          </div>
          {isOverdue && (
            <span className="badge shrink-0 bg-danger/15 text-danger-ink">
              <Icon icon="alert-triangle" className="size-3" aria-hidden="true" />
              เลยกำหนด
            </span>
          )}
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-dashed border-default-200 pt-2.5">
          <span className={cn('text-xs font-medium', isOverdue ? 'text-danger-ink' : 'text-default-500')}>
            {dueAtISO ? `ครบกำหนด ${formatDateTH(dueAtISO)}` : 'ไม่มีกำหนดเวลา'}
          </span>
          <Icon icon="chevron-right" className="size-4 shrink-0 text-default-400" aria-hidden="true" />
        </div>
      </div>
    </Link>
  )
}
