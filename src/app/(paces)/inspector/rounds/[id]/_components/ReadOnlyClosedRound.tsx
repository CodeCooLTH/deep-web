/**
 * ReadOnlyClosedRound — มุมมองอ่านอย่างเดียวเมื่อรอบตรวจถูกปิดไปแล้ว (feature 00060 · T13)
 *
 * Base: theme/paces/Admin/TS/src/assets/css/custom/_card.css (`.card`) — ไม่มี form/ปุ่มแก้ไข
 *   เพราะ 4.9 ล็อกผลของรอบที่ปิดแล้วถาวร (edge state ตาม UX spec Surface C: "รอบถูกยกเลิก/
 *   เปลี่ยนผู้ตรวจกลางทาง → เข้าไปแล้วเจอ 'รอบนี้ถูกปิดแล้ว' read-only")
 *
 * badge สถานะที่นี่เป็น "สถานะปัจจุบัน" ของข้อตรวจนั้นในฐาน (อาจถูกรอบถัดไปตรวจซ้ำจนเปลี่ยนไปแล้ว)
 * ไม่ใช่ "ผลของรอบนี้โดยเฉพาะ" — service ยังไม่มีช่องแยกรายรอบให้อ่าน (ดูคอมเมนต์หัวไฟล์ page.tsx)
 */
import Icon from '@/components/wrappers/Icon'

// 🛑 ค่าจริงจาก `resolveResultStatus()` คือ `'RECHECK'` ไม่ใช่ `'RECHECK_DUE'` ตามที่ API.md §3.2 ค
// เขียนไว้ — ยึดค่าจริงของโค้ด (`src/lib/inspection/result-status.ts`) ไม่ใช่ของเอกสาร
type CheckRow = {
  checkKey: string
  label: string
  scope: 'SHOP' | 'ROOM'
  currentDisplayStatus: 'PASS' | 'FAIL' | 'RECHECK' | 'NO_DATA' | 'NOT_APPLICABLE'
}

const STATUS_META: Record<CheckRow['currentDisplayStatus'], { label: string; cls: string; icon: string }> = {
  PASS: { label: 'ผ่าน', cls: 'bg-success/15 text-success-ink', icon: 'circle-check' },
  FAIL: { label: 'ไม่ผ่าน', cls: 'bg-danger/15 text-danger-ink', icon: 'circle-x' },
  RECHECK: { label: 'รอตรวจซ้ำ', cls: 'bg-warning/15 text-warning-ink', icon: 'clock-exclamation' },
  NO_DATA: { label: 'ยังไม่มีข้อมูล', cls: 'bg-default-100 text-default-700', icon: 'circle-dashed' },
  NOT_APPLICABLE: { label: 'ไม่เกี่ยวข้อง', cls: 'bg-default-100 text-default-700', icon: 'minus' },
}

type Props = {
  shopName: string
  roomName: string | null
  stepLabel: string
  checks: CheckRow[]
}

export default function ReadOnlyClosedRound({ shopName, roomName, stepLabel, checks }: Props) {
  return (
    <div className="space-y-3 p-4">
      <div className="card">
        <div className="card-body flex items-start gap-3">
          <Icon icon="lock" className="mt-0.5 size-5 shrink-0 text-default-400" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-default-900">รอบนี้ถูกปิดแล้ว</p>
            <p className="mt-0.5 text-xs text-default-500">
              {shopName}
              {roomName ? ` · ${roomName}` : ''} · {stepLabel}
            </p>
            <p className="mt-1 text-xs text-default-500">
              แก้ไขผลของรอบนี้ไม่ได้อีก — หากผลไม่ถูกต้องต้องให้แอดมินเปิดรอบตรวจใหม่
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="divide-y divide-dashed divide-default-200">
          {checks.map((c) => {
            const meta = STATUS_META[c.currentDisplayStatus]
            return (
              <div key={c.checkKey} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 truncate text-sm text-default-800">{c.label}</span>
                <span className={`badge shrink-0 ${meta.cls}`}>
                  <Icon icon={meta.icon} className="size-3" aria-hidden="true" />
                  {meta.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
