'use client'

/**
 * ChatPreviewPanel — กล่องแชทอ่านอย่างเดียว (30 ข้อความล่าสุด) ของห้องที่คลิกในโต๊ะแชท
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ChatPage.tsx (รูปทรงบับเบิล: rounded px-* py-* + bg-primary/bg-light)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx (หัวแผง/ปุ่มปิด)
 * สีบับเบิลตรงกับกล่องแชทจริง (ThreadMessageList: ร้าน = bg-primary text-white · ลูกค้า = bg-light)
 * ไม่มีช่องพิมพ์/ปุ่มส่ง — ทางออกเดียวคือลิงก์ "เปิดในหน้าข้อความ" (AC-41)
 */
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { ChannelMark } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'
import { formatResponseDuration } from '@/lib/agent-performance'
import { CHANNEL_LABEL } from '@/lib/chat-desk/channel-colors'
import { previewBodyLabel } from '@/lib/chat-desk/rules'
import type { DeskCustomer, DeskCustomerStatus, DeskPlatform } from '@/lib/chat-desk/types'
import { formatDateTime } from '@/lib/format-date'

export type PreviewMessage = {
  id: string
  senderRole: 'BUYER' | 'SHOP'
  by: { kind: 'ADMIN'; name: string } | { kind: 'EXTERNAL' } | { kind: 'META_AI' } | { kind: 'BOT' } | null
  type: string
  body: string | null
  isDeleted: boolean
  createdAt: string
}

export type PreviewData = {
  room: { id: string; name: string; platform: DeskPlatform; pageName: string | null }
  messages: PreviewMessage[]
  truncated: boolean
}

export type PreviewPhase = 'loading' | 'ok' | 'error' | 'not-found'

const STATUS_CHIP: Record<DeskCustomerStatus, { label: string; cls: string; icon: string }> = {
  WAITING: { label: 'รอคำตอบ', cls: 'bg-warning/15 text-warning-ink', icon: 'clock' },
  OVERDUE: { label: 'เกินเวลาตอบ', cls: 'bg-danger/15 text-danger-ink', icon: 'alert-triangle' },
  RECENT: { label: 'ร้านเพิ่งตอบ', cls: 'bg-info/15 text-info-ink', icon: 'messages' },
}

/** ชื่อผู้ส่งฝั่งร้าน — "ตอบจากนอกระบบ" คือคำเดียวกับ MetricGlossary (มติ Controller ข้อ 5) */
function byLabel(by: PreviewMessage['by']): string | null {
  if (!by) return null
  if (by.kind === 'ADMIN') return by.name
  if (by.kind === 'EXTERNAL') return 'ตอบจากนอกระบบ'
  if (by.kind === 'META_AI') return 'Meta AI'
  return 'บอท Deep'
}

function Bubble({ m }: { m: PreviewMessage }) {
  const mine = m.senderRole === 'SHOP'
  const by = mine ? byLabel(m.by) : null
  return (
    <div className={`flex ${mine ? 'justify-end' : ''}`}>
      <div className="max-w-xs min-w-0">
        {m.isDeleted ? (
          <div className="border-default-300 text-default-400 inline-flex items-center gap-1 rounded border border-dashed px-3 py-2 text-sm italic">
            <Icon icon="trash" className="text-sm" />
            ข้อความถูกลบ
          </div>
        ) : (
          <div className={`rounded px-3 py-2 text-sm break-words whitespace-pre-wrap ${mine ? 'bg-primary text-white' : 'bg-light text-default-900'}`}>
            {previewBodyLabel(m.type, m.body, false)}
          </div>
        )}
        <div className={`text-default-400 mt-0.5 text-xs ${mine ? 'text-end' : ''}`}>
          {by ? `${by} · ` : ''}
          {formatDateTime(m.createdAt)}
        </div>
      </div>
    </div>
  )
}

export type ChatPreviewViewProps = {
  customer: DeskCustomer
  /** snapshot.serverNow */
  now: number
  phase: PreviewPhase
  data: PreviewData | null
  onRetry: () => void
  onClose: () => void
  /** มี = แสดงปุ่มกลับไปแผงโต๊ะ (มาจากแถวใน AdminPanel) */
  onBack?: () => void
}

/** ส่วนแสดงผลล้วน (ไม่มี fetch) — แยกไว้ให้เทสด้วย renderToStaticMarkup */
export function ChatPreviewView({ customer, now, phase, data, onRetry, onClose, onBack }: ChatPreviewViewProps) {
  const chip = STATUS_CHIP[customer.status]
  const sinceSec = customer.since ? (now - new Date(customer.since).getTime()) / 1000 : null
  const pageName = data?.room.pageName ?? null
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // เปิดมาให้เห็นข้อความล่าสุด (เรียงเก่า→ใหม่)
    const el = scrollRef.current
    if (el && phase === 'ok') el.scrollTop = el.scrollHeight
  }, [phase, data])

  return (
    <>
      <div className="border-default-300 border-b border-dashed p-4">
        <div className="flex items-start gap-2">
          {onBack && (
            <button type="button" onClick={onBack} aria-label="กลับไปโต๊ะ" className="btn btn-icon text-default-700 hover:bg-default-100">
              <Icon icon="arrow-left" className="text-lg" />
            </button>
          )}
          <div className="mt-1 shrink-0">
            <ChannelMark channel={customer.platform} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-default-900 truncate font-semibold" title={customer.name}>
              {customer.name}
            </div>
            <div className="text-default-700 truncate text-xs" title={pageName ?? undefined}>
              {CHANNEL_LABEL[customer.platform]}
              {pageName ? ` · ${pageName}` : ''}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิดแผง" className="btn btn-icon text-default-700 hover:bg-default-100">
            <Icon icon="x" className="text-lg" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className={`badge rounded-full text-xs font-semibold ${chip.cls}`}>
            <Icon icon={chip.icon} className="text-xs" />
            {chip.label}
          </span>
          {sinceSec !== null && (
            <span className="text-default-700 text-xs tabular-nums">
              {customer.status === 'RECENT' ? `ร้านตอบเมื่อ ${formatResponseDuration(sinceSec)} ที่แล้ว` : `รอมา ${formatResponseDuration(sinceSec)}`}
            </span>
          )}
        </div>
      </div>

      <div className="bg-default-100 text-default-700 mx-4 mt-3 flex gap-1.5 rounded px-3 py-2 text-xs">
        <Icon icon="eye" className="mt-px shrink-0 text-sm" />
        <span>อ่านอย่างเดียว — ห้องนี้ยังเป็น &quot;ยังไม่อ่าน&quot; ในกล่องข้อความ</span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4" aria-busy={phase === 'loading'}>
        {phase === 'loading' && (
          <div className="space-y-3" aria-label="กำลังโหลดข้อความ" role="status">
            <span className="bg-default-300 block h-9 w-2/3 animate-pulse rounded motion-reduce:animate-none" />
            <span className="bg-default-300 ms-auto block h-9 w-1/2 animate-pulse rounded motion-reduce:animate-none" />
            <span className="bg-default-300 block h-9 w-3/5 animate-pulse rounded motion-reduce:animate-none" />
          </div>
        )}
        {(phase === 'error' || phase === 'not-found') && (
          <div className="flex flex-col items-center py-8 text-center">
            <Icon icon="alert-triangle" className="text-danger mb-2 size-10 opacity-70" />
            <p className="text-default-700 mb-0 text-sm font-semibold">{phase === 'not-found' ? 'ไม่พบห้องนี้แล้ว' : 'โหลดข้อความไม่สำเร็จ'}</p>
            {phase === 'error' && (
              <button type="button" onClick={onRetry} className="btn border-danger text-danger hover:bg-danger mt-3 rounded-full border px-6 text-sm hover:text-white">
                ลองใหม่
              </button>
            )}
          </div>
        )}
        {phase === 'ok' && data && (
          <>
            {data.truncated && <p className="text-default-400 mb-0 text-center text-xs">แสดง 30 ข้อความล่าสุด</p>}
            {data.messages.length === 0 ? (
              <p className="text-default-400 mb-0 py-4 text-center text-xs">ยังไม่มีข้อความ</p>
            ) : (
              data.messages.map((m) => <Bubble key={m.id} m={m} />)
            )}
          </>
        )}
      </div>

      <div className="border-default-300 border-t border-dashed p-4">
        <Link href={`/inbox/${customer.id}`} className="btn bg-primary hover:bg-primary-hover w-full rounded text-white">
          <Icon icon="message-circle" className="me-1.5 text-base" />
          เปิดในหน้าข้อความ
        </Link>
      </div>
    </>
  )
}

export type ChatPreviewPanelProps = Omit<ChatPreviewViewProps, 'phase' | 'data' | 'onRetry'>

type Loaded = { key: string; phase: PreviewPhase; data: PreviewData | null }

/** ดึง preview เองตาม customer.id (GET อ่านอย่างเดียว) — poll ของหน้าไม่ทำให้ดึงซ้ำเพราะ key = id + จำนวนครั้งที่ลองใหม่ */
export default function ChatPreviewPanel(props: ChatPreviewPanelProps) {
  const id = props.customer.id
  const [retryN, setRetryN] = useState(0)
  const key = `${id}:${retryN}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    fetch(`/api/chat-desk/rooms/${id}/preview`, { signal: ctl.signal, cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 404) return setLoaded({ key, phase: 'not-found', data: null })
        if (!res.ok) return setLoaded({ key, phase: 'error', data: null })
        setLoaded({ key, phase: 'ok', data: (await res.json()) as PreviewData })
      })
      .catch(() => {
        if (!ctl.signal.aborted) setLoaded({ key, phase: 'error', data: null })
      })
    return () => ctl.abort()
  }, [id, key])

  // key ไม่ตรง = ยังเป็นผลของห้องเก่า → ถือว่ากำลังโหลด (ไม่ต้อง setState รีเซ็ตใน effect)
  const cur = loaded?.key === key ? loaded : null
  return <ChatPreviewView {...props} phase={cur?.phase ?? 'loading'} data={cur?.data ?? null} onRetry={() => setRetryN((n) => n + 1)} />
}
