/**
 * การ์ดใบงาน 1 ใบบนบอร์ด Command Center
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/TaskItem.tsx
 * เมนู ⋮ ยึดแพตเทิร์นของโปรเจกต์ (custom React dropdown ไม่ใช่ Preline hs-dropdown):
 *   src/app/(paces)/seller/(dashboard)/orders/components/OrderCardMenu.tsx
 *   เหตุผลเดิม — Preline พังกับ list ที่ re-render (บอร์ดนี้ re-render ทุกรอบ poll)
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { durationTh } from '@/lib/relative-time-th'
import type { BoardItem } from '@/lib/command-center'

/** เกิน 24 ชม. ถึงเปลี่ยนสี — ไม่ใช่ทุกใบที่ค้างนานคือปัญหา สีที่เตือนตลอดเวลาคือสีที่ไม่มีใครเห็น */
const STALE_MS = 24 * 60 * 60 * 1000

type Props = {
  item: BoardItem
  busy: boolean
  onApprove: (item: BoardItem) => void
  onReject: (item: BoardItem) => void
  onStop: (item: BoardItem) => void
}

export default function ItemCard({ item, busy, onApprove, onReject, onStop }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const entered = item.stageEnteredAt ? new Date(item.stageEnteredAt).getTime() : null
  const stale = entered !== null && Date.now() - entered > STALE_MS
  const isReady = item.stage === 'ready'

  return (
    <div
      className={`card mb-3 ${isReady && item.awaitingApproval ? 'border-s-3 border-primary' : ''}`}>
      <div className="p-3">
        {/* min-w-0 ที่กล่อง + max-w-full ที่ลูก = ชุดที่ทำให้ line-clamp/truncate ทำงานจริง
            (flex item มี min-width:auto เป็นค่าตั้งต้น ตัวหนังสือยาวจะดันกล่องเกินคอลัมน์
            แทนที่จะถูกตัด — docs/conventions/flex-header-truncation.md) */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-2 max-w-full text-sm font-medium text-default-900 hover:text-primary">
              {item.title}
            </a>
          </div>

          <div className="relative shrink-0" ref={ref}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              disabled={busy}
              aria-label={`เมนูของใบงาน #${item.number}`}
              className="btn btn-icon btn-sm text-default-500 hover:text-default-900">
              <Icon icon="dots-vertical" className="size-4" />
            </button>

            {open && (
              <div className="absolute end-0 z-10 mt-1 w-44 rounded-lg border border-default-200 bg-card py-1 shadow-lg">
                <button
                  type="button"
                  className="dropdown-item w-full text-start"
                  onClick={() => {
                    setOpen(false)
                    onReject(item)
                  }}>
                  <Icon icon="arrow-back-up" className="me-2 size-4" />
                  ตีกลับให้แก้
                </button>
                <button
                  type="button"
                  className="dropdown-item w-full text-start text-danger"
                  onClick={() => {
                    setOpen(false)
                    onStop(item)
                  }}>
                  <Icon icon="player-stop" className="me-2 size-4" />
                  หยุดงานนี้
                </button>
                <div className="dropdown-divider" />
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dropdown-item"
                  onClick={() => setOpen(false)}>
                  <Icon icon="external-link" className="me-2 size-4" />
                  เปิดใน GitHub
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`badge ${item.kind === 'pr' ? 'bg-primary/15 text-primary' : 'bg-default-100 text-default-700'}`}>
            {item.kind === 'pr' ? 'PR' : 'ใบงาน'} #{item.number}
          </span>

          {/* null = อ่าน timeline ไม่ได้ ไม่ใช่ "เพิ่งเข้าขั้นนี้" — แสดง "—" ดีกว่าโกหกว่า 0 นาที */}
          <span className={`text-xs ${stale ? 'text-warning-ink' : 'text-default-500'}`}>
            {entered === null ? 'ค้างขั้นนี้ —' : `ค้างขั้นนี้ ${durationTh(entered)}`}
          </span>
        </div>

        {/* เตือนเฉพาะใบที่เคาะแล้ว: auto-merge.yml จะไม่แตะใบที่มี migration เด็ดขาด
            ถ้าไม่บอกตรงนี้ ผู้ใช้จะรอ merge ที่ไม่มีวันเกิดโดยไม่รู้ว่าทำไม */}
        {item.touchesMigration && (
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-warning/15 p-2">
            <Icon icon="alert-triangle" className="mt-0.5 size-4 shrink-0 text-warning-ink" />
            <p className="text-xs text-warning-ink">
              แตะ migration — ระบบจะไม่ merge ให้อัตโนมัติ ต้องกด merge เองบน GitHub
            </p>
          </div>
        )}

        {isReady &&
          (item.awaitingApproval ? (
            <button
              type="button"
              onClick={() => onApprove(item)}
              disabled={busy}
              className="btn mt-3 w-full bg-primary text-white hover:bg-primary-hover">
              เคาะ &quot;พร้อมขึ้น&quot;
            </button>
          ) : (
            /* เคาะแล้ว = ไม่ต้องการความสนใจอีก ⇒ ไม่มีปุ่ม ไม่มีแถบ accent
               สีธีมสงวนไว้กับ "สิ่งที่รอคุณอยู่" เท่านั้น (One Voice) */
            <div className="mt-3 flex items-center gap-2 text-xs text-default-500">
              <Icon icon="clock-play" className="size-4 shrink-0" />
              <span>อนุมัติแล้ว — จะขึ้นเมื่อด่านผ่านครบ</span>
            </div>
          ))}
      </div>
    </div>
  )
}
