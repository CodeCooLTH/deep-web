/**
 * RoundTimeline — คิว "รอผู้ตรวจเข้าตรวจ" + ไทม์ไลน์รอบตรวจย้อนหลัง (feature 00060 · T12)
 *
 * Base: ไม่มีหน้า theme ที่ตรงกัน (ตรวจแล้ว — theme/paces ไม่มี `ui/timeline`) จึง compose จาก
 * `.card` + `border-s-3` (left accent — ขึ้นทะเบียนเป็น variant ที่ยอมรับแล้วใน
 * paces-component-reference.md §7 "variants: ... border-s-3 (left accent)") ตามที่
 * UX-Design-Spec.md §Surface B ระบุไว้ตรง ๆ ว่าให้ทำแบบนี้เมื่อไม่มี theme page ตรงตัว
 *
 * 🛑 badge "รอผู้ตรวจเข้าตรวจ" ปรากฏเฉพาะที่นี่ (ฝั่งร้าน) ห้ามใช้คำนี้ที่อื่น — แยกจาก
 *    "นัดหมายแล้ว รอผลตรวจ" ด้วยว่า inspectorDisplayName ยังเป็นชื่อ placeholder
 *    (UNASSIGNED_INSPECTOR_NAME) หรือมีชื่อผู้ตรวจจริงแล้ว
 */
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatDateTH } from '@/lib/format-date'
import { INSPECTION_CHECKS, INSPECTION_STEP_LABEL_TH } from '@/lib/inspection/checks'
import { UNASSIGNED_INSPECTOR_NAME } from '@/lib/inspection/round-planning'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import type { PendingRoundJSON, TimelineEntryJSON } from './types'

const METHOD_LABEL: Record<string, string> = {
  AUTO: 'อัตโนมัติ',
  DOCUMENT: 'เอกสาร',
  VIDEO_CALL: 'วิดีโอคอล',
  ONSITE: 'ลงพื้นที่',
}

// ค่าดิบ 3 ค่าของ outcome — ใช้แค่บอกความจริง ณ วันนั้นในไทม์ไลน์ ไม่ใช่ displayStatus (API.md §4.1
// "changedResults[].outcome เป็นค่าดิบ 3 ค่าไม่ใช่ displayStatus โดยตั้งใจ")
const OUTCOME_LABEL: Record<string, string> = { PASS: 'ผ่าน', FAIL: 'ไม่ผ่าน', NOT_APPLICABLE: 'ไม่เกี่ยวข้อง' }

function PendingRow({ round }: { round: PendingRoundJSON }) {
  const assigned = round.inspectorDisplayName !== UNASSIGNED_INSPECTOR_NAME
  return (
    <li className="border-warning card border-s-3 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-default-800 text-sm font-medium">
          {INSPECTION_STEP_LABEL_TH[round.step]} · {METHOD_LABEL[round.method] ?? round.method}
          {round.roomName ? ` · ${round.roomName}` : ''}
        </p>
        <span className="badge bg-warning/15 text-warning-ink inline-flex shrink-0 items-center gap-1">
          <Icon icon="clock-hour-3" className="size-3.5" />
          {assigned ? 'นัดหมายแล้ว รอผลตรวจ' : 'รอผู้ตรวจเข้าตรวจ'}
        </span>
      </div>
      <p className="text-default-400 mt-1 text-xs">
        {assigned ? `ผู้ตรวจ: ${round.inspectorDisplayName}` : 'ยังไม่มีผู้ตรวจรับงาน'}
      </p>
    </li>
  )
}

function CompletedRow({ entry }: { entry: TimelineEntryJSON }) {
  const changedLabel = entry.changedResults
    .map((c) => `${INSPECTION_CHECKS[c.checkKey].labelTh} (${OUTCOME_LABEL[c.outcome] ?? c.outcome})`)
    .join(', ')

  return (
    <li className="border-success card border-s-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon icon="circle-check" className="text-success size-4 shrink-0" />
        <p className="text-default-800 text-sm font-medium">
          {formatDateTH(entry.completedAt)} · {INSPECTION_STEP_LABEL_TH[entry.step]} ·{' '}
          {METHOD_LABEL[entry.method] ?? entry.method}
          {entry.roomName ? ` · ${entry.roomName}` : ''}
        </p>
      </div>
      <p className="text-default-400 mt-1 text-xs">ตรวจโดย {entry.inspectorDisplayName}</p>
      {changedLabel && <p className="text-default-500 mt-1 text-xs">ผลเปลี่ยน: {changedLabel}</p>}
      {entry.confirmedCheckKeys.length > 0 && (
        <p className="text-default-400 mt-0.5 text-xs">
          ยืนยันผลเดิม {entry.confirmedCheckKeys.length} ข้อ
        </p>
      )}
    </li>
  )
}

type Props = {
  timeline: TimelineEntryJSON[]
  pendingRounds: PendingRoundJSON[]
}

export default function RoundTimeline({ timeline, pendingRounds }: Props) {
  const isEmpty = timeline.length === 0 && pendingRounds.length === 0

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">รอบตรวจ</h4>
      </div>
      <div className="card-body">
        {isEmpty ? (
          <SellerEmptyState
            compact
            icon="calendar-time"
            title="ยังไม่มีรอบตรวจที่เสร็จสิ้น"
          />
        ) : (
          <ul className={cn('space-y-2')}>
            {/* pendingRounds มาก่อนเสมอ (ยังไม่จบ = สิ่งที่ต้องรู้ก่อน) ตามด้วยประวัติเก่า→ใหม่กลับ
                (timeline ที่ service ส่งมาเรียง completedAt ใหม่→เก่าอยู่แล้ว) */}
            {pendingRounds.map((r) => (
              <PendingRow key={r.roundId} round={r} />
            ))}
            {timeline.map((t) => (
              <CompletedRow key={t.roundId} entry={t} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
