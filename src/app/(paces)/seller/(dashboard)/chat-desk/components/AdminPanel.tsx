'use client'

/**
 * AdminPanel — แผงโต๊ะ: ชื่อ + ออนไลน์/ออฟไลน์/— + แชทในมือ + รายการห้อง (แตะแถว = เปิดกล่องแชทอ่านอย่างเดียว)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx (หัวแผง `flex items-center justify-between` + ปุ่ม x)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/list-group/page.tsx (รายการแถวเส้นคั่น)
 * ไม่มีปุ่มกระทำใด ๆ กับห้อง (อ่านอย่างเดียว) — โครงรายการตาม mockup `deskCard`
 */
import Icon from '@/components/wrappers/Icon'
import { ChannelMark } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'
import { formatResponseDuration } from '@/lib/agent-performance'
import { CHANNEL_LABEL } from '@/lib/chat-desk/channel-colors'
import type { DeskCustomer, DeskTable } from '@/lib/chat-desk/types'

export type AdminPanelProps = {
  table: DeskTable
  /** ห้องทั้งหมดที่โต๊ะนี้ (ไม่ระบุ = ใช้ table.shown ที่ถูกตัดที่ PER_DESK) */
  customers?: DeskCustomer[]
  /** เวลาปัจจุบันของ server (snapshot.serverNow) ใช้คำนวณ "ตอบเมื่อ ... ที่แล้ว" */
  now: number
  onSelectCustomer: (customer: DeskCustomer) => void
  onClose: () => void
}

function OnlineBadge({ online }: { online: boolean | null }) {
  // null = ตรวจไม่ได้ → "—" ห้ามขึ้นออฟไลน์ (BR-CD-12)
  if (online === null) return <span className="text-default-400 text-xs">—</span>
  return (
    <span className="text-default-700 inline-flex items-center gap-1 text-xs">
      <span className={`size-2 shrink-0 rounded-full ${online ? 'bg-primary' : 'border-default-400 border'}`} />
      {online ? 'ออนไลน์' : 'ออฟไลน์'}
    </span>
  )
}

export default function AdminPanel({ table, customers, now, onSelectCustomer, onClose }: AdminPanelProps) {
  const list = customers ?? table.shown
  return (
    <>
      <div className="border-default-300 border-b border-dashed p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-default-900 truncate font-semibold" title={table.name}>
              {table.name}
            </div>
            <div className="mt-1 flex items-center gap-3">
              {table.kind === 'ADMIN' && <OnlineBadge online={table.online} />}
              <span className="text-default-700 text-xs">
                แชทในมือ <b className="tabular-nums">{table.total}</b>
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิดแผง" className="btn btn-icon text-default-700 hover:bg-default-100">
            <Icon icon="x" className="text-lg" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {list.length === 0 ? (
          <p className="text-default-400 py-4 text-xs">ไม่มีห้องที่โต๊ะนี้ตอนนี้</p>
        ) : (
          <ul className="divide-default-200 divide-y">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelectCustomer(c)}
                  className="hover:bg-default-100 flex min-h-12 w-full items-center gap-2 py-2 text-start text-sm"
                >
                  <ChannelMark channel={c.platform} />
                  <span className="min-w-0 flex-1">
                    <span className="text-default-900 block truncate" title={c.name}>
                      {c.name}
                    </span>
                    <span className="text-default-700 block truncate text-xs">{CHANNEL_LABEL[c.platform]}</span>
                  </span>
                  {c.since && (
                    <span className="text-default-400 shrink-0 text-xs">
                      ตอบเมื่อ {formatResponseDuration((now - new Date(c.since).getTime()) / 1000)} ที่แล้ว
                    </span>
                  )}
                  <Icon icon="chevron-right" className="text-default-400 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {list.length < table.total && <p className="text-default-400 pt-2 text-xs">และอีก {table.total - list.length} ห้อง</p>}
      </div>
    </>
  )
}
