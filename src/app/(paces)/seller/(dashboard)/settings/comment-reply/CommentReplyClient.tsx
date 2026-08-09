'use client'

/**
 * CommentReplyClient — การ์ดตั้งค่าตอบกลับคอมเมนต์ต่อเพจ + การ์ด Instagram (เร็ว ๆ นี้) +
 * การ์ดประวัติการตอบอัตโนมัติ (feature 00038, Task 10)
 *
 * SSOT: docs/20 - Features/00038 - Comment Auto-Reply/{UX-Design-Spec.md §หน้า 1, API.md §4.1-4.3}
 *
 * Base (สวิตช์ + textarea + ตัวนับตัวอักษร + ปุ่มบันทึก):
 *   src/app/(paces)/seller/(dashboard)/settings/ai/AiSettingForm.tsx:100-282
 *   (Base เดิม: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx:71)
 *   adapt: ตัด wrapper `border rounded-lg p-3` ต่อสวิตช์ทิ้ง ใช้ `border-t border-dashed
 *   border-default-300` คั่น 2 บล็อกแทน (UX-Design-Spec §1.3 — มี 2 สวิตช์ใหญ่ ไม่ใช่ 3 รายการเล็ก)
 * Base (badge สถานะเพจ + banner โทเคนหมดอายุ + ปุ่ม "เชื่อมต่อใหม่"):
 *   src/app/(paces)/seller/(dashboard)/settings/channels/ChannelsClient.tsx:232-296
 * Base (ประวัติการ์ดมือถือ `flex items-center gap-3 px-4 py-3.5`):
 *   src/app/(paces)/seller/(dashboard)/settings/auto-reply/AutoReplyListing.tsx:432-467
 * Base (ตารางประวัติ tablet/desktop `.table-wrapper` + `.table`):
 *   docs/system/ui-guideline/paces-component-reference.md §5 (ไม่ใช้ TanStack DataTable — read-only
 *   cursor list)
 * Base (ตัวกรองเพจในประวัติ): src/components/safepay/FilterDropdown.tsx
 * Base (empty state): src/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState.tsx
 * Base (avatar เพจ + provider overlay ขนาด lg): `PageAvatar` (inbox/components/PageFilterDropdown.tsx,
 *   size='lg') + `ChannelBadgeOverlay` (inbox/components/ChannelBadge.tsx) — เดิมมี local avatar
 *   component ในไฟล์นี้ที่ทำซ้ำตรรกะเดียวกัน (หนี้ feature 00038 #1) แก้แล้วโดยขยาย `PageAvatar`
 *   ด้วย size='lg' แทนสร้างใหม่
 *
 * แต่ละการ์ดถือ state ของตัวเองแยกกันสมบูรณ์ (AC-CR-04) — ไม่มี form state รวมทั้งหน้า เพราะ
 * PATCH ยิงทีละเพจ (API §4.2 รับ shopChannelId เดี่ยว) แก้เพจ A ต้องไม่กระทบเพจ B
 *
 * toast ใช้ pacesToast เท่านั้น (Hard Rule 9)
 */
import { useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import { pacesToast } from '@/lib/paces-toast'
import { formatDateTimeTH } from '@/lib/format-date'
import { ChannelBadgeOverlay } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'
import { PageAvatar } from '@/app/(paces)/seller/(chat)/inbox/components/PageFilterDropdown'
import SellerEmptyState from '../../_shared/SellerEmptyState'

/** ต้องตรงกับ Valibot CommentReplyConfigSchema (src/lib/validations.ts) — maxLength(1000) ทั้งคู่ */
const REPLY_MAX = 1000
const LOGS_PAGE_SIZE = 20

export type CommentReplyChannel = {
  shopChannelId: string
  name: string
  avatarUrl: string | null
  /** 'ACTIVE' | 'TOKEN_INVALID' */
  status: string
  commentPublicReplyEnabled: boolean
  commentPublicReplyText: string | null
  commentPrivateReplyEnabled: boolean
  commentPrivateReplyText: string | null
}

export type CommentReplyLogRow = {
  id: string
  createdAt: string
  commenterName: string | null
  postMessage: string | null
  trigger: string
  publicReplyStatus: string | null
  privateReplyStatus: string | null
  skipReasonText: string | null
  conversationId: string | null
}

type InstagramChannel = { name: string; avatarUrl: string | null }
type LogsPage = { logs: CommentReplyLogRow[]; hasMore: boolean }

type Props = {
  channels: CommentReplyChannel[]
  instagramChannel: InstagramChannel | null
  initialLogs: LogsPage
}

export default function CommentReplyClient({ channels, instagramChannel, initialLogs }: Props) {
  return (
    <div className="space-y-5">
      {channels.map((channel) => (
        <CommentReplyCard key={channel.shopChannelId} channel={channel} />
      ))}
      {instagramChannel && <InstagramComingSoonCard channel={instagramChannel} />}
      <CommentReplyHistoryCard channels={channels} initialLogs={initialLogs} />
    </div>
  )
}

function CommentReplyCard({ channel }: { channel: CommentReplyChannel }) {
  const [publicEnabled, setPublicEnabled] = useState(channel.commentPublicReplyEnabled)
  const [publicText, setPublicText] = useState(channel.commentPublicReplyText ?? '')
  const [privateEnabled, setPrivateEnabled] = useState(channel.commentPrivateReplyEnabled)
  const [privateText, setPrivateText] = useState(channel.commentPrivateReplyText ?? '')
  const [publicError, setPublicError] = useState<string | null>(null)
  const [privateError, setPrivateError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isTokenInvalid = channel.status === 'TOKEN_INVALID'
  const cardLocked = isTokenInvalid || saving
  const publicOverLimit = publicText.length > REPLY_MAX
  const privateOverLimit = privateText.length > REPLY_MAX

  function handleCancel() {
    setPublicEnabled(channel.commentPublicReplyEnabled)
    setPublicText(channel.commentPublicReplyText ?? '')
    setPrivateEnabled(channel.commentPrivateReplyEnabled)
    setPrivateText(channel.commentPrivateReplyText ?? '')
    setPublicError(null)
    setPrivateError(null)
  }

  async function handleSave() {
    if (saving) return
    // BR-CR-05 (client-side — server กันซ้ำอีกชั้นที่ config/route.ts): เปิดสวิตช์แล้วข้อความว่างไม่ได้
    let hasError = false
    if (publicEnabled && !publicText.trim()) {
      setPublicError('กรอกข้อความก่อนเปิดใช้งาน')
      hasError = true
    } else {
      setPublicError(null)
    }
    if (privateEnabled && !privateText.trim()) {
      setPrivateError('กรอกข้อความก่อนเปิดใช้งาน')
      hasError = true
    } else {
      setPrivateError(null)
    }
    if (publicOverLimit || privateOverLimit) hasError = true
    if (hasError) return

    setSaving(true)
    try {
      const res = await fetch('/api/shops/comment-reply/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          shopChannelId: channel.shopChannelId,
          commentPublicReplyEnabled: publicEnabled,
          commentPublicReplyText: publicText.trim() === '' ? null : publicText,
          commentPrivateReplyEnabled: privateEnabled,
          commentPrivateReplyText: privateText.trim() === '' ? null : privateText,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        if (res.status === 409 && data?.code === 'CHANNEL_NOT_ACTIVE') {
          pacesToast.error('เพจนี้เชื่อมต่อไม่อยู่แล้ว — เชื่อมต่อใหม่ก่อนเปิดใช้งาน')
        } else {
          pacesToast.error(data?.error ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
        }
        return
      }
      pacesToast.success('บันทึกการตั้งค่าแล้ว')
    } catch {
      pacesToast.error('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  const publicHintId = `comment-reply-public-hint-${channel.shopChannelId}`
  const privateHintId = `comment-reply-private-hint-${channel.shopChannelId}`

  return (
    <div className="card">
      <div className="card-header flex items-center gap-3">
        <span className="relative shrink-0">
          <PageAvatar avatarUrl={channel.avatarUrl} name={channel.name} size="lg" />
          <ChannelBadgeOverlay channel="MESSENGER" imageUrl={channel.avatarUrl} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-default-800 truncate text-sm font-semibold">{channel.name}</p>
          <p className="text-default-400 text-xs">Facebook Page</p>
        </div>
        <span
          className={`badge inline-flex shrink-0 items-center gap-1 ${
            isTokenInvalid ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success'
          }`}
        >
          <Icon icon={isTokenInvalid ? 'alert-triangle' : 'check'} className="text-xs" aria-hidden="true" />
          {isTokenInvalid ? 'โทเคนหมดอายุ' : 'เชื่อมต่ออยู่'}
        </span>
      </div>

      <div className="card-body max-w-2xl space-y-6">
        {isTokenInvalid && (
          <div className="bg-danger/15 text-danger flex flex-wrap items-start gap-2 rounded-lg px-3 py-2 text-sm">
            <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-lg" aria-hidden="true" />
            <span className="min-w-0 flex-1">โทเคนของเพจนี้หมดอายุ ต้องเชื่อมต่อใหม่ก่อนถึงจะตั้งค่าได้</span>
            <a
              href="/api/channels/facebook/connect"
              className="btn btn-sm bg-danger/15 text-danger hover:bg-danger/25 inline-flex shrink-0 items-center gap-1.5"
            >
              <Icon icon="refresh" className="text-sm" aria-hidden="true" />
              เชื่อมต่อใหม่
            </a>
          </div>
        )}

        {/* สวิตช์ A — ตอบใต้คอมเมนต์ */}
        <div>
          <label className="flex cursor-pointer items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="text-default-800 block text-sm font-medium">ตอบใต้คอมเมนต์</span>
              <span className="text-default-500 block text-xs">
                ระบบจะตอบข้อความนี้ใต้คอมเมนต์ระดับบนของลูกค้าโดยอัตโนมัติ
              </span>
            </span>
            <input
              type="checkbox"
              className="form-switch shrink-0"
              checked={publicEnabled}
              onChange={(e) => {
                const next = e.target.checked
                setPublicEnabled(next)
                // ปิดสวิตช์ → textarea กลายเป็น disabled แก้ไม่ได้ทันที error ที่ค้างจากตอนเปิดจึงต้อง
                // เคลียร์ไปด้วย ไม่งั้นขอบแดง/ข้อความ "กรอกข้อความก่อนเปิดใช้งาน" ค้างอยู่บนช่องที่พิมพ์ไม่ได้แล้ว
                if (!next) setPublicError(null)
              }}
              disabled={cardLocked}
              aria-label="เปิดใช้งานตอบใต้คอมเมนต์"
            />
          </label>
          <textarea
            rows={3}
            className={`form-textarea mt-3 ${publicError ? 'is-invalid' : ''}`}
            placeholder="เปิดสวิตช์เพื่อตั้งข้อความ"
            value={publicText}
            onChange={(e) => {
              setPublicText(e.target.value)
              if (publicError) setPublicError(null)
            }}
            disabled={!publicEnabled || cardLocked}
            aria-describedby={publicHintId}
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <span id={publicHintId} className="text-default-500 inline-flex items-center gap-1 text-2xs">
              <Icon icon="info-circle" className="text-sm" aria-hidden="true" />
              คนอื่นที่เข้ามาดูโพสต์จะเห็นข้อความนี้ — หลีกเลี่ยงข้อความที่ดูเป็นสแปม
            </span>
            <span className={`shrink-0 text-2xs ${publicOverLimit ? 'text-danger font-semibold' : 'text-default-400'}`}>
              {publicText.length.toLocaleString()}/{REPLY_MAX.toLocaleString()}
            </span>
          </div>
          {publicError && <p className="text-danger mt-1 text-xs">{publicError}</p>}
          {publicOverLimit && (
            <p className="text-danger mt-1 text-xs">ยาวเกิน 1,000 ตัวอักษร กรุณาตัดให้สั้นลงก่อนบันทึก</p>
          )}
        </div>

        {/* คั่นด้วยเส้นประ — adapt จาก AiSettingForm (ตัด wrapper border/p-3 ต่อสวิตช์ทิ้ง) เพราะ
            หน้านี้มี 2 บล็อกใหญ่ ไม่ใช่ 3 รายการเล็กเรียงเป็นลิสต์ (UX-Design-Spec §1.3) */}
        <div className="border-default-300 border-t border-dashed pt-6">
          <label className="flex cursor-pointer items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="text-default-800 block text-sm font-medium">ทักแชทส่วนตัวต่อ</span>
              <span className="text-default-500 block text-xs">
                หลังตอบใต้คอมเมนต์แล้ว ระบบจะเปิดห้องแชทกับคนนั้นให้ทันที
              </span>
            </span>
            <input
              type="checkbox"
              className="form-switch shrink-0"
              checked={privateEnabled}
              onChange={(e) => {
                const next = e.target.checked
                setPrivateEnabled(next)
                // เหตุผลเดียวกับสวิตช์ A — ปิดแล้ว textarea disabled แก้ error ที่ค้างเองไม่ได้
                if (!next) setPrivateError(null)
              }}
              disabled={cardLocked}
              aria-label="เปิดใช้งานทักแชทส่วนตัวต่อ"
            />
          </label>
          <textarea
            rows={3}
            className={`form-textarea mt-3 ${privateError ? 'is-invalid' : ''}`}
            placeholder="เปิดสวิตช์เพื่อตั้งข้อความ"
            value={privateText}
            onChange={(e) => {
              setPrivateText(e.target.value)
              if (privateError) setPrivateError(null)
            }}
            disabled={!privateEnabled || cardLocked}
            aria-describedby={privateHintId}
          />
          <p id={privateHintId} className="text-default-500 mt-1 inline-flex items-center gap-1 text-2xs">
            <Icon icon="info-circle" className="text-sm" aria-hidden="true" />
            Facebook ให้ทักได้ครั้งเดียวต่อคอมเมนต์ และภายใน 7 วัน · คุยต่อได้เมื่อลูกค้าตอบกลับ
          </p>
          {privateError && <p className="text-danger mt-1 text-xs">{privateError}</p>}
          {privateOverLimit && (
            <p className="text-danger mt-1 text-xs">ยาวเกิน 1,000 ตัวอักษร กรุณาตัดให้สั้นลงก่อนบันทึก</p>
          )}
        </div>
      </div>

      {/* ไม่มี footer เลยเมื่อโทเคนหมดอายุ — ไม่มีอะไรให้บันทึกจนกว่าจะเชื่อมใหม่ (UX-Design-Spec §1.2) */}
      {!isTokenInvalid && (
        <div className="card-footer flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="btn bg-light text-default-700 hover:bg-light-hover hidden disabled:opacity-60 md:inline-flex"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || publicOverLimit || privateOverLimit}
            className="btn bg-primary text-white hover:bg-primary-hover w-full disabled:opacity-60 md:w-auto"
          >
            {saving ? (
              <>
                <Icon icon="loader-2" className="me-1 animate-spin text-base" aria-hidden="true" />
                กำลังบันทึก...
              </>
            ) : (
              'บันทึก'
            )}
          </button>
        </div>
      )}
    </div>
  )
}

/** การ์ด Instagram — static disabled ไม่มี state ไม่มี fetch (UX-Design-Spec §1.2) */
function InstagramComingSoonCard({ channel }: { channel: InstagramChannel }) {
  return (
    <div className="card">
      <div className="card-header flex items-center gap-3">
        <span className="relative shrink-0">
          <PageAvatar avatarUrl={channel.avatarUrl} name={channel.name} size="lg" />
          <ChannelBadgeOverlay channel="INSTAGRAM" imageUrl={channel.avatarUrl} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-default-800 truncate text-sm font-semibold">{channel.name}</p>
          <p className="text-default-400 text-xs">Instagram</p>
        </div>
        <span className="badge bg-default-200 text-default-700 shrink-0">เร็ว ๆ นี้</span>
      </div>
      <div className="card-body">
        <p className="text-default-500 text-sm">
          คอมเมนต์บน Instagram ต้องขอสิทธิ์เพิ่มจาก Meta ก่อน แล้วให้คุณกดเชื่อมบัญชี IG ใหม่อีกครั้ง
        </p>
      </div>
    </div>
  )
}

const REPLY_STATUS_META: Record<string, { label: string; className: string }> = {
  SENT: { label: 'ส่งแล้ว', className: 'bg-success/15 text-success' },
  SKIPPED: { label: 'ข้าม', className: 'bg-default-200 text-default-700' },
  FAILED: { label: 'ไม่สำเร็จ', className: 'bg-danger/15 text-danger' },
}

/** badge สถานะต่อรายการ (public/private) — "เปิดห้อง" ผูกกับ private เท่านั้น (สวิตช์ B สร้างห้องแชท) */
function ReplyStatusBadge({
  kind,
  status,
  conversationId,
  skipReasonText,
  revealSkipReason = false,
}: {
  kind: 'public' | 'private'
  status: string | null
  conversationId: string | null
  skipReasonText: string | null
  /** `title="..."` ไม่ทำงานบนทัชสกรีน (ไม่มี hover) — LogRowMobile ส่ง true เพื่อ render เหตุผลที่
      "ข้าม" เป็นข้อความเล็กมองเห็นได้จริงใต้ badge แทน ส่วนเดสก์ท็อป (LogRowDesktop) มีเมาส์ hover
      ได้อยู่แล้ว จึงปล่อย default false คง title ไว้เหมือนเดิม ไม่ต้องเปลืองพื้นที่ตาราง */
  revealSkipReason?: boolean
}) {
  if (!status) return <span className="text-default-300 text-xs">—</span>
  const meta = REPLY_STATUS_META[status] ?? REPLY_STATUS_META.SKIPPED
  const showReasonText = revealSkipReason && status === 'SKIPPED' && Boolean(skipReasonText)
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className={`badge text-2xs ${meta.className}`} title={status === 'SKIPPED' ? (skipReasonText ?? undefined) : undefined}>
          {meta.label}
        </span>
        {kind === 'private' && status === 'SENT' && conversationId && (
          <Link href={`/inbox/${conversationId}`} className="text-primary text-xs font-medium hover:underline">
            เปิดห้อง
          </Link>
        )}
      </span>
      {showReasonText && <span className="text-default-500 text-2xs">{skipReasonText}</span>}
    </span>
  )
}

function LogRowMobile({ log }: { log: CommentReplyLogRow }) {
  return (
    <div className="px-4 py-3.5">
      <p className="text-sm">
        <span className="text-default-800 font-medium">{formatDateTimeTH(log.createdAt)}</span>
        <span className="text-default-400"> · </span>
        <span className="text-default-600">{log.commenterName ?? 'ไม่ทราบชื่อ'}</span>
      </p>
      <div className="mt-1.5 flex flex-wrap items-start gap-3">
        <ReplyStatusBadge
          kind="public"
          status={log.publicReplyStatus}
          conversationId={null}
          skipReasonText={log.skipReasonText}
          revealSkipReason
        />
        <ReplyStatusBadge
          kind="private"
          status={log.privateReplyStatus}
          conversationId={log.conversationId}
          skipReasonText={log.skipReasonText}
          revealSkipReason
        />
      </div>
    </div>
  )
}

function LogRowDesktop({ log }: { log: CommentReplyLogRow }) {
  return (
    <tr>
      <td className="text-default-500 text-sm whitespace-nowrap">{formatDateTimeTH(log.createdAt)}</td>
      <td className="text-default-800 text-sm">
        {log.commenterName ?? <span className="text-default-400">ไม่ทราบชื่อ</span>}
      </td>
      <td className="text-default-600 hidden max-w-64 truncate text-sm xl:table-cell" title={log.postMessage ?? undefined}>
        {log.postMessage ?? <span className="text-default-400">(ไม่มีข้อความ)</span>}
      </td>
      <td>
        <ReplyStatusBadge kind="public" status={log.publicReplyStatus} conversationId={null} skipReasonText={log.skipReasonText} />
      </td>
      <td>
        <ReplyStatusBadge
          kind="private"
          status={log.privateReplyStatus}
          conversationId={log.conversationId}
          skipReasonText={log.skipReasonText}
        />
      </td>
    </tr>
  )
}

function CommentReplyHistoryCard({ channels, initialLogs }: { channels: CommentReplyChannel[]; initialLogs: LogsPage }) {
  const [logs, setLogs] = useState<CommentReplyLogRow[]>(initialLogs.logs)
  const [hasMore, setHasMore] = useState(initialLogs.hasMore)
  const [filterChannelId, setFilterChannelId] = useState('')
  const [loading, setLoading] = useState(false)

  const showFilter = channels.length > 1
  const pageFilterOptions = [
    { value: '', label: 'เพจ: ทุกเพจ' },
    ...channels.map((c) => ({ value: c.shopChannelId, label: `เพจ: ${c.name}` })),
  ]

  async function fetchLogsPage(channelId: string, cursor: number): Promise<LogsPage> {
    const params = new URLSearchParams({ cursor: String(cursor), take: String(LOGS_PAGE_SIZE) })
    if (channelId) params.set('shopChannelId', channelId)
    const res = await fetch(`/api/shops/comment-reply/logs?${params.toString()}`, { cache: 'no-store' })
    if (!res.ok) throw new Error('โหลดประวัติไม่สำเร็จ')
    return res.json()
  }

  async function handleFilterChange(channelId: string) {
    setFilterChannelId(channelId)
    setLoading(true)
    try {
      // เปลี่ยนตัวกรอง = cursor เป็น offset ดิบ ไม่รู้จักการกรอง — ต้องเริ่มนับใหม่จาก 0 เสมอ
      const data = await fetchLogsPage(channelId, 0)
      setLogs(data.logs)
      setHasMore(data.hasMore)
    } catch {
      pacesToast.error('โหลดประวัติไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  async function handleLoadMore() {
    setLoading(true)
    try {
      const data = await fetchLogsPage(filterChannelId, logs.length)
      setLogs((prev) => [...prev, ...data.logs])
      setHasMore(data.hasMore)
    } catch {
      pacesToast.error('โหลดประวัติไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between gap-3">
        <h5 className="card-title">ประวัติการตอบอัตโนมัติ</h5>
        {showFilter && (
          <FilterDropdown
            icon="filter"
            value={filterChannelId}
            options={pageFilterOptions}
            onChange={handleFilterChange}
            resetValue=""
            align="right"
          />
        )}
      </div>

      {logs.length === 0 ? (
        <div className="card-body">
          <SellerEmptyState
            compact
            icon="history"
            title="ยังไม่มีการตอบกลับเกิดขึ้น"
            description="เมื่อระบบตอบหรือข้ามคอมเมนต์ จะบันทึกไว้ที่นี่"
          />
        </div>
      ) : (
        <>
          {/* มือถือ (<768px) — การ์ดแถวละรายการ */}
          <div className="divide-default-200 divide-y md:hidden">
            {logs.map((log) => (
              <LogRowMobile key={log.id} log={log} />
            ))}
          </div>
          {/* tablet/desktop (>=768px) — table จริง; คอลัมน์ "โพสต์" กลับมาที่ >=1280px */}
          <div className="table-wrapper hidden md:block">
            <table className="table">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>ผู้คอมเมนต์</th>
                  <th className="hidden xl:table-cell">โพสต์</th>
                  <th>ตอบใต้คอมเมนต์</th>
                  <th>ทักแชท</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <LogRowDesktop key={log.id} log={log} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {hasMore && (
        <div className="card-footer flex justify-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loading}
            className="btn btn-sm bg-light text-default-700 hover:bg-light-hover inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {loading && <Icon icon="loader-2" className="animate-spin text-base" aria-hidden="true" />}
            โหลดเพิ่ม
          </button>
        </div>
      )}
    </div>
  )
}
