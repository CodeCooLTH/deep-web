'use client'

/**
 * รายการที่ ChatBot ตอบลูกค้า — คู่ "ลูกค้าถาม → บอทตอบ" เรียงล่าสุดขึ้นก่อน
 *
 * แสดงเป็นคู่บทสนทนาไม่ใช่ตารางคอลัมน์ เพราะสิ่งที่ร้านมาดูหน้านี้คือ "บอทตอบว่าอะไร
 * แล้วมันโอเคไหม" ซึ่งต้องอ่านข้อความเต็ม ๆ ทั้งสองฝั่งพร้อมกัน ตารางจะบีบข้อความจนอ่านไม่ได้
 *
 * Base: settings/auto-reply/[id]/TestThreadsCard.tsx (การ์ด + input-icon-group + empty state)
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import { getChannelDisplay } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'

export type ChatLogRow = {
  id: string
  createdAt: string
  customerText: string | null
  replyText: string | null
  decision: string
  isTest: boolean
  durationMs: number | null
  conversationId: string
  name: string
  provider: string | null
  channelName: string | null
}

export default function ChatLogsList({ items }: { items: ChatLogRow[] }) {
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.customerText ?? '').toLowerCase().includes(q) ||
        (r.replyText ?? '').toLowerCase().includes(q),
    )
  }, [items, search])

  return (
    <div className="card">
      <div className="card-header flex-col items-stretch gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h4 className="card-title">ประวัติการตอบของบอท</h4>
          <p className="text-default-500 mt-0.5 text-xs">
            เฉพาะข้อความที่ ChatBot แต่งคำตอบเองจากคลังความรู้ · แสดง 100 รายการล่าสุด
          </p>
        </div>
        {items.length > 0 && (
          <div className="input-icon-group min-w-0 sm:w-56 sm:flex-none">
            <Icon icon="search" className="input-icon" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              type="search"
              className="form-input form-input-sm"
              placeholder="ค้นหา"
              aria-label="ค้นหาในประวัติการตอบ"
            />
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card-body flex flex-col items-center gap-2 py-12 text-center">
          <Icon icon="message-2-bolt" className="text-default-300 size-12" aria-hidden="true" />
          <h5 className="text-default-800 font-semibold">บอทยังไม่ได้ตอบใคร</h5>
          <p className="text-default-500 max-w-md text-sm">
            รายการจะขึ้นที่นี่เมื่อลูกค้าถามคำถามที่ไม่ตรงกลุ่มคำไหนเลย แล้ว ChatBot หาคำตอบจากคลังความรู้ได้
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="card-body text-default-500 py-10 text-center text-sm">ไม่พบรายการที่ตรงกับคำค้นหา</div>
      ) : (
        <ul className="divide-default-200 divide-y">
          {visible.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link
                  href={`/inbox/${r.conversationId}`}
                  className="text-default-800 hover:text-primary truncate text-sm font-medium"
                >
                  {r.name}
                </Link>
                {r.provider && <ChannelChip provider={r.provider} channelName={r.channelName} />}
                {r.isTest && <span className="badge bg-warning/15 text-warning text-2xs">ทดสอบ</span>}
                <span className="text-default-400 ms-auto text-xs tabular-nums">
                  {formatDateTime(new Date(r.createdAt))}
                  {r.durationMs !== null && ` · ${(r.durationMs / 1000).toFixed(1)} วิ`}
                </span>
              </div>

              {/* ฝั่งลูกค้าและฝั่งบอทใช้เส้นสีต่างกันแทนฟองแชท — ในรายการยาว ๆ ฟองแชท
                  ทำให้แต่ละแถวสูงจนกวาดสายตาไม่ทัน แต่ยังต้องแยกออกว่าใครพูด */}
              <div className="space-y-1.5">
                <p className="border-default-300 text-default-600 border-s-2 ps-2.5 text-sm whitespace-pre-wrap">
                  {r.customerText || '(ไม่มีข้อความ)'}
                </p>
                <p className="border-primary text-default-800 border-s-2 ps-2.5 text-sm whitespace-pre-wrap">
                  {r.replyText || '(ไม่ได้ส่งข้อความ)'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ChannelChip({ provider, channelName }: { provider: string; channelName: string | null }) {
  const display = getChannelDisplay(provider)
  return (
    <span className="text-default-400 flex items-center gap-1 text-xs">
      <Icon
        icon={display.icon}
        width={12}
        height={12}
        className={display.iconClassName}
        style={display.iconStyle}
        aria-hidden="true"
      />
      {channelName ?? display.label}
    </span>
  )
}
