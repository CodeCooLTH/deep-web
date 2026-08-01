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
  /** เหตุผลที่ไม่ได้ตอบ — null = ตอบสำเร็จ */
  skipReason: string | null
  isTest: boolean
  durationMs: number | null
  conversationId: string
  name: string
  provider: string | null
  channelName: string | null
}

/**
 * เหตุผลเชิงระบบ -> สิ่งที่ร้านอ่านแล้วรู้ว่าต้องไปแก้ตรงไหน
 * ไม่แปล = ร้านเห็น GUARDRAILS_BLOCKED แล้วก็ยังต้องมาถามอยู่ดีว่าแปลว่าอะไร
 */
const SKIP_LABEL: Record<string, string> = {
  GUARDRAILS_BLOCKED: 'คำตอบชนกฎ "หยุดไม่ตอบ" ของร้าน',
  GUARDRAILS_CHECK_FAILED: 'ด่านตรวจกฎตัดสินไม่ได้ จึงไม่ส่ง',
  NO_KNOWLEDGE_ANSWER: 'คลังความรู้ไม่มีข้อมูลพอจะตอบ',
  NO_KNOWLEDGE: 'คลังความรู้ยังว่าง',
  AI_NO_ANSWER: 'AI ตอบคำถามนี้ไม่ได้',
  AI_ENHANCE_TIMEOUT: 'AI ใช้เวลานานเกินกำหนด',
  AI_ENHANCE_ERROR: 'เรียก AI ไม่สำเร็จ',
  DAILY_CAP_OR_NO_CREDIT: 'ถึงเพดานค่าใช้จ่ายต่อวัน หรือเครดิตหมด',
  COOLDOWN: 'ยังไม่ครบระยะเว้นระหว่างคำตอบ',
  HOURLY_CAP: 'ตอบครบเพดานต่อห้องต่อชั่วโมงแล้ว',
  OUTSIDE_SCHEDULE: 'อยู่นอกช่วงเวลาที่ตั้งให้บอททำงาน',
  NOT_TEST_THREAD: 'โหมดทดสอบ และแชทนี้ไม่ได้อยู่ในรายการทดสอบ',
  OFFLINE: 'ChatBot ปิดอยู่',
  SEND_FAILED: 'ส่งข้อความไม่สำเร็จ',
  UNEXPECTED_ERROR: 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
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
        (r.skipReason ? (SKIP_LABEL[r.skipReason] ?? '').toLowerCase().includes(q) : false) ||
        (r.replyText ?? '').toLowerCase().includes(q),
    )
  }, [items, search])

  return (
    <div className="card">
      <div className="card-header flex-col items-stretch gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h4 className="card-title">ประวัติการตอบของบอท</h4>
          <p className="text-default-500 mt-0.5 text-xs">
            ทุกครั้งที่ ChatBot ทำงาน ทั้งที่ตอบสำเร็จและที่ไม่ได้ตอบพร้อมเหตุผล · 100 รายการล่าสุด
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
          <h5 className="text-default-800 font-semibold">ยังไม่มีประวัติ</h5>
          <p className="text-default-500 max-w-md text-sm">
            รายการจะขึ้นที่นี่ทุกครั้งที่ ChatBot ทำงาน — ทั้งครั้งที่ตอบลูกค้าได้ และครั้งที่ไม่ได้ตอบพร้อมเหตุผลว่าทำไม
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
                {r.skipReason && <span className="badge bg-danger/15 text-danger text-2xs">ไม่ได้ตอบ</span>}
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
                {r.skipReason ? (
                  <p className="border-danger text-danger border-s-2 ps-2.5 text-sm">
                    {SKIP_LABEL[r.skipReason] ?? r.skipReason}
                  </p>
                ) : (
                  <p className="border-primary text-default-800 border-s-2 ps-2.5 text-sm whitespace-pre-wrap">
                    {r.replyText || '(ไม่ได้ส่งข้อความ)'}
                  </p>
                )}
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
