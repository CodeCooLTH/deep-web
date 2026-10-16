'use client'

/**
 * ActivityCard — การ์ด ④ ความเคลื่อนไหวล่าสุด (สูงสุด 8 แถว) จากการเทียบ snapshot ต่อเนื่อง
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx (รายการ marker + ข้อความ + เวลา)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (card + card-header)
 * ไม่มีประวัติย้อนหลัง จึงบอกตรง ๆ ใต้หัวการ์ด · ถ้อยคำ "ออกจากฉาก" ไม่ใช่ "ปิดงาน" (BR-CD-26)
 */
import Icon from '@/components/wrappers/Icon'
import { formatResponseDuration } from '@/lib/agent-performance'
import type { ActivityItem, ActivityKind } from '@/lib/chat-desk/page-model'
import { useSecondTick } from './desk-hooks'

const MAX_ROWS = 8
const MARKER: Record<ActivityKind, { icon: string; cls: string }> = {
  ENTER_LOUNGE: { icon: 'walk', cls: 'bg-default-200 text-default-700' },
  TO_DESK: { icon: 'messages', cls: 'bg-info/15 text-info-ink' },
  LEAVE: { icon: 'door-exit', cls: 'bg-default-200 text-default-700' },
}
const TEXT = (a: ActivityItem) =>
  a.kind === 'ENTER_LOUNGE' ? 'เข้ามารอคำตอบ' : a.kind === 'TO_DESK' ? a.deskName ? `ไปที่โต๊ะ ${a.deskName}` : 'ไปที่โต๊ะแอดมิน' : 'ออกจากฉาก'

export type ActivityCardProps = {
  items: ActivityItem[]
  /** ห้องนี้ยังอยู่ในฉากไหม — ไม่อยู่แล้วแถวกดไม่ได้ */
  isPresent: (roomId: string) => boolean
  onSelectRoom: (roomId: string) => void
}

export default function ActivityCard({ items, isPresent, onSelectRoom }: ActivityCardProps) {
  const nowSec = useSecondTick()
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">ความเคลื่อนไหวล่าสุด</div>
          <div className="text-default-400 text-xs">แสดงเฉพาะเหตุการณ์ที่เกิดหลังเปิดหน้านี้</div>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-default-700 px-3 py-4 text-xs">ยังไม่มีความเคลื่อนไหวหลังเปิดหน้านี้</p>
      ) : (
        <ul className="divide-default-200 divide-y px-3">
          {items.slice(0, MAX_ROWS).map((a) => {
            const m = MARKER[a.kind]
            const canOpen = a.kind !== 'LEAVE' && isPresent(a.roomId)
            const age = nowSec ? formatResponseDuration(Math.max(0, nowSec - a.at / 1000)) : ''
            const body = (
              <>
                <span className={`grid size-8 shrink-0 place-items-center rounded-full ${m.cls}`}>
                  <Icon icon={m.icon} width={16} height={16} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="text-default-900 inline-block max-w-full truncate align-bottom font-semibold" title={a.name}>{a.name}</span>{' '}
                  <span className="text-default-700">{TEXT(a)}</span>
                </span>
                <span className="text-default-400 shrink-0 text-xs tabular-nums">{age}</span>
              </>
            )
            return (
              <li key={a.key}>
                {canOpen ? (
                  <button type="button" onClick={() => onSelectRoom(a.roomId)} className="hover:bg-default-100 flex min-h-11 w-full items-center gap-2.5 py-2 text-start">
                    {body}
                  </button>
                ) : (
                  <div className="flex min-h-11 items-center gap-2.5 py-2">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
