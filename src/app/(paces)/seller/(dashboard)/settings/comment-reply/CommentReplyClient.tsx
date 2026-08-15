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
 *
 * ===== ฉบับแก้ครั้งที่ 2 — 2026-08-09 (การ์ดประวัติ) =====
 * user ทักหลังขึ้น prod ว่าหน้านี้ไม่เหมือนหน้าพี่น้อง `/settings/auto-reply` เลย — ต้นเหตุคือ
 * สเปกฉบับแรกเลือก "ไม่ใช้ TanStack DataTable" (ดู UX-Design-Spec.md §"ฉบับแก้ครั้งที่ 2") ยกเครื่อง
 * การ์ดประวัติใหม่ทั้งหมดให้ยกโครงจาก AutoReplyListing.tsx ตรง ๆ:
 * Base (toolbar ใน card-header + page-size ChoiceSelect + useReactTable + DataTable + mobileCard
 *   ทั้งแถวกดได้ + card-footer TablePagination): AutoReplyListing.tsx:376-491 (บรรทัดอ้างอิงเต็มอยู่
 *   ใน Theme Source Mapping ของสเปก) — ตัดช่องค้นหา+ปุ่มสร้างออก (หน้านี้ไม่มี action สร้าง,
 *   ค้นได้แค่หน้าที่โหลดมาจะโกหกผู้ใช้ว่าค้นได้ทั้งประวัติ)
 * Base (โมดัลรายละเอียด): src/lib/paces-swal.ts (`pacesAlert`, html mode)
 *
 * 🛑 ความปลอดภัย: commenterName/postMessage เป็นข้อความจากผู้ใช้ Facebook ภายนอก ต้อง escape
 * ก่อน interpolate เข้า pacesAlert({ html }) เสมอ (render ผ่าน innerHTML) — ใช้ escapeHtml() จาก
 * src/lib/html-escape.ts (helper กลางที่มีอยู่แล้ว ใช้ร่วมกับ DowngradeButton.tsx/CancelPackageButton.tsx
 * — ไม่สร้างใหม่ซ้ำ) ป้าย/label ที่เขียน static เองปลอดภัยอยู่แล้วไม่ต้อง escape
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ColumnDef, createColumnHelper, getCoreRowModel, PaginationState, useReactTable } from '@tanstack/react-table'
import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import ChoiceSelect from '@/components/wrappers/ChoiceSelect'
import Icon from '@/components/wrappers/Icon'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import { pacesToast } from '@/lib/paces-toast'
import { pacesAlert } from '@/lib/paces-swal'
import { escapeHtml } from '@/lib/html-escape'
import { formatDateTimeTH } from '@/lib/format-date'
import { COMMENT_NAME_PLACEHOLDER, hasNamePlaceholder } from '@/lib/comment-reply-template'
import { ChannelBadgeOverlay } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'
import { PageAvatar } from '@/app/(paces)/seller/(chat)/inbox/components/PageFilterDropdown'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import {
  LOG_STATUS_FILTER_OPTIONS,
  LOG_STATUS_META,
  parseLogStatusFilter,
  type CommentReplyLogStatusFilter,
} from '@/lib/comment-reply-log-status'

/** ต้องตรงกับ Valibot CommentReplyConfigSchema (src/lib/validations.ts) — maxLength(1000) ทั้งคู่ */
const REPLY_MAX = 1000
/** ต้องตรงกับ LOGS_PAGE_SIZE ใน page.tsx (RSC หน้าแรกดึงมาเท่ากับ default นี้) */
const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [5, 10, 15, 20].map((n) => ({ value: String(n), label: String(n) }))

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
  /**
   * เหตุผลของสถานะ FAILED แยกรายฝั่ง (แปลไทยแล้วที่ชั้น server — `describeCommentReplyFailure`)
   *
   * แยกตั้งแต่ระดับคอลัมน์ในฐาน (migration 20260810090000) เพราะสองงานนี้เป็นอิสระต่อกันจริง —
   * "ตอบใต้คอมเมนต์ไม่ผ่าน แต่ทักแชทได้" เป็นเคสปกติ (user ชี้เอง 2026-08-10) ตอนที่ยังใช้
   * คอลัมน์ร่วมกัน เหตุผลของฝั่งสาธารณะถูกล้างทิ้งทุกครั้งที่ฝั่งทักแชทสำเร็จ
   */
  publicFailReasonText: string | null
  privateFailReasonText: string | null
  conversationId: string | null
}

type InstagramChannel = { name: string; avatarUrl: string | null }
type LogsPage = { logs: CommentReplyLogRow[]; total: number }

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

/**
 * ปุ่มแทรก `{ชื่อ}` + คำอธิบายว่ามันจะกลายเป็นอะไร (user สั่ง 2026-08-15)
 *
 * ประกาศไว้นอก render ของ CommentReplyCard โดยตั้งใจ — component ที่ประกาศในตัว render เป็นชนิด
 * ใหม่ทุก re-render แล้ว React จะ unmount/mount ใหม่ทั้งซับทรี ซึ่งในที่นี้แปลว่า **โฟกัสหลุด
 * จาก textarea ทุกตัวอักษรที่ร้านพิมพ์** (docs/conventions/component-declared-in-render.md)
 */
function NamePlaceholderRow({
  targetRef,
  value,
  onChange,
  disabled,
}: {
  targetRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (next: string) => void
  disabled: boolean
}) {
  const insert = () => {
    const el = targetRef.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    onChange(value.slice(0, start) + COMMENT_NAME_PLACEHOLDER + value.slice(end))
    // คืนโฟกัสให้ช่องพิมพ์แล้ววางเคอร์เซอร์ถัดจากคำที่เพิ่งแทรก — ต้องรอ React เขียน value ใหม่ลง
    // DOM ก่อน ไม่งั้น setSelectionRange จะอ้างอิงข้อความเวอร์ชันเก่าแล้วเคอร์เซอร์ไปผิดที่
    requestAnimationFrame(() => {
      const at = start + COMMENT_NAME_PLACEHOLDER.length
      targetRef.current?.focus()
      targetRef.current?.setSelectionRange(at, at)
    })
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={insert}
        disabled={disabled}
        className="btn btn-sm btn-light inline-flex shrink-0 items-center gap-1.5"
      >
        <Icon icon="user" className="text-sm" aria-hidden="true" />
        แทรกชื่อลูกค้า
      </button>
      <span className="text-default-500 text-2xs">
        {COMMENT_NAME_PLACEHOLDER} จะกลายเป็นชื่อ Facebook ของคนที่คอมเมนต์ — เป็นตัวหนังสือ ไม่ใช่การแท็ก
        {hasNamePlaceholder(value) ? ' · คอมเมนต์ที่ระบบอ่านชื่อไม่ได้ จะตัดคำนี้ทิ้งให้อัตโนมัติ' : ''}
      </span>
    </div>
  )
}

function CommentReplyCard({ channel }: { channel: CommentReplyChannel }) {
  const publicTextRef = useRef<HTMLTextAreaElement>(null)
  const privateTextRef = useRef<HTMLTextAreaElement>(null)
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
            isTokenInvalid ? 'bg-danger/15 text-danger-ink' : 'bg-success/15 text-success-ink'
          }`}
        >
          <Icon icon={isTokenInvalid ? 'alert-triangle' : 'check'} className="text-xs" aria-hidden="true" />
          {isTokenInvalid ? 'โทเคนหมดอายุ' : 'เชื่อมต่ออยู่'}
        </span>
      </div>

      <div className="card-body max-w-2xl space-y-6">
        {isTokenInvalid && (
          <div className="bg-danger/15 text-danger-ink flex flex-wrap items-start gap-2 rounded-lg px-3 py-2 text-sm">
            <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-lg" aria-hidden="true" />
            <span className="min-w-0 flex-1">โทเคนของเพจนี้หมดอายุ ต้องเชื่อมต่อใหม่ก่อนถึงจะตั้งค่าได้</span>
            <a
              href="/api/channels/facebook/connect"
              className="btn btn-sm bg-danger/15 text-danger-ink hover:bg-danger/25 inline-flex shrink-0 items-center gap-1.5"
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
            ref={publicTextRef}
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
          <NamePlaceholderRow
            targetRef={publicTextRef}
            value={publicText}
            onChange={(next) => {
              setPublicText(next)
              if (publicError) setPublicError(null)
            }}
            disabled={!publicEnabled || cardLocked}
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <span id={publicHintId} className="text-default-500 inline-flex items-center gap-1 text-2xs">
              <Icon icon="info-circle" className="text-sm" aria-hidden="true" />
              คนอื่นที่เข้ามาดูโพสต์จะเห็นข้อความนี้ — หลีกเลี่ยงข้อความที่ดูเป็นสแปม
            </span>
            <span className={`shrink-0 text-2xs ${publicOverLimit ? 'text-danger-ink font-semibold' : 'text-default-400'}`}>
              {publicText.length.toLocaleString()}/{REPLY_MAX.toLocaleString()}
            </span>
          </div>
          {publicError && <p className="text-danger-ink mt-1 text-xs">{publicError}</p>}
          {publicOverLimit && (
            <p className="text-danger-ink mt-1 text-xs">ยาวเกิน 1,000 ตัวอักษร กรุณาตัดให้สั้นลงก่อนบันทึก</p>
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
            ref={privateTextRef}
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
          <NamePlaceholderRow
            targetRef={privateTextRef}
            value={privateText}
            onChange={(next) => {
              setPrivateText(next)
              if (privateError) setPrivateError(null)
            }}
            disabled={!privateEnabled || cardLocked}
          />
          <p id={privateHintId} className="text-default-500 mt-1 inline-flex items-center gap-1 text-2xs">
            <Icon icon="info-circle" className="text-sm" aria-hidden="true" />
            Facebook ให้ทักได้ครั้งเดียวต่อคอมเมนต์ และภายใน 7 วัน · คุยต่อได้เมื่อลูกค้าตอบกลับ
          </p>
          {privateError && <p className="text-danger-ink mt-1 text-xs">{privateError}</p>}
          {privateOverLimit && (
            <p className="text-danger-ink mt-1 text-xs">ยาวเกิน 1,000 ตัวอักษร กรุณาตัดให้สั้นลงก่อนบันทึก</p>
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

// คำ/สีของ badge มาจาก SSOT เดียวกับตัวกรองใน toolbar (src/lib/comment-reply-log-status.ts) —
// ห้ามพิมพ์คำซ้ำที่นี่: ผู้ใช้กรอง "ไม่สำเร็จ" แล้วเห็น badge เขียนคำอื่นจะไม่มีอะไรฟ้อง (HR16)
const REPLY_STATUS_META: Record<string, { label: string; className: string }> = LOG_STATUS_META

/** badge สถานะต่อรายการ (public/private) — "เปิดห้อง" ผูกกับ private เท่านั้น (สวิตช์ B สร้างห้องแชท) */
function ReplyStatusBadge({
  kind,
  status,
  conversationId,
  skipReasonText,
  failReasonText,
  revealSkipReason = false,
  hideLink = false,
}: {
  kind: 'public' | 'private'
  status: string | null
  conversationId: string | null
  skipReasonText: string | null
  /**
   * เหตุผลที่ FAILED **ของฝั่งนี้เท่านั้น** — แสดงใต้ป้ายเสมอ ไม่ซ่อนใน `title` (user สั่ง
   * 2026-08-09 "อยากให้แสดงรายละเอียดเลย ว่าไม่สำเร็จเพราะอะไร")
   *
   * ต่างจาก `skipReasonText` ที่ยังอยู่ใน `title` บนเดสก์ท็อป โดยตั้งใจ: "ข้าม" คือระบบตัดสินใจ
   * ถูกต้องแล้วตามกฎ (ข้อมูลประกอบ) ส่วน "ไม่สำเร็จ" คือมีบางอย่างพัง ซึ่งร้านต้องรู้ทันทีว่า
   * แก้ได้เองไหม — และ `title=` บนมือถือไม่มี hover ให้อ่านอยู่แล้ว
   * (docs/conventions/aria-name-requires-supporting-role.md: title ไม่ใช่ตัวแทนของข้อความจริง)
   */
  failReasonText: string | null
  /** `title="..."` ไม่ทำงานบนทัชสกรีน (ไม่มี hover) — mobileCard ส่ง true เพื่อ render เหตุผลที่
      "ข้าม" เป็นข้อความเล็กมองเห็นได้จริงใต้ badge แทน ส่วนตาราง desktop มีเมาส์ hover ได้อยู่แล้ว
      จึงปล่อย default false คง title ไว้เหมือนเดิม ไม่ต้องเปลืองพื้นที่ตาราง */
  revealSkipReason?: boolean
  /** ฉบับแก้ครั้งที่ 2: mobileCard ทั้งแถวเป็น <button> แล้ว (UX-Design-Spec §"สิ่งที่เปลี่ยน" #4) —
      <a> (Link) ซ้อนใน <button> เป็น HTML ที่ผิดกฎ (interactive ใน interactive) ต้องซ่อนลิงก์นี้
      ตอนอยู่ในการ์ดมือถือ — ลิงก์ "เปิดห้อง" ยังกดได้จากโมดัลรายละเอียดแทน (buildDetailHtml) */
  hideLink?: boolean
}) {
  if (!status) return <span className="text-default-300 text-xs">—</span>
  const meta = REPLY_STATUS_META[status] ?? REPLY_STATUS_META.SKIPPED
  // เหตุผลของ "ข้าม" มาได้ 2 ทาง: `skipReasonText` = ข้ามทั้งแถว (FROM_PAGE/DISABLED/…) ส่วน
  // `failReasonText` = ข้ามเฉพาะฝั่งนี้ ซึ่งตอนนี้มีของจริงแล้ว (privateReplyStatus='SKIPPED' +
  // privateErrorMessage='ALREADY_SENT' เมื่อคอมเมนต์ใบก่อนของคนเดียวกันบนโพสต์เดียวกันทักไปแล้ว)
  // ถ้าไม่ fallback มาที่ตัวหลัง ป้าย "ข้าม" ของเคสนั้นจะไม่มีเหตุผลติดมาเลยสักคำ — ซึ่งคือ
  // อาการเดิมที่กำลังแก้อยู่พอดี (user 2026-08-15: "บางอันตอบได้บางอันว่าง")
  const skipWhyText = status === 'SKIPPED' ? (skipReasonText ?? failReasonText) : null
  const showReasonText = revealSkipReason && Boolean(skipWhyText)
  // ผู้เรียกส่งเหตุผล "ของฝั่งนี้" มาให้แล้ว จึงไม่ต้องมีกฎว่าแสดงได้เฉพาะฝั่งไหน
  // (เดิมต้องจำกัดไว้ที่ฝั่งทักแชท เพราะฐานเก็บเหตุผลไว้คอลัมน์เดียว — แยกคอลัมน์แล้วข้อจำกัดนั้นหมดไป)
  const showFailReason = status === 'FAILED' && Boolean(failReasonText)
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className={`badge text-2xs ${meta.className}`} title={skipWhyText ?? undefined}>
          {meta.label}
        </span>
        {kind === 'private' && status === 'SENT' && conversationId && !hideLink && (
          <Link href={`/inbox/${conversationId}`} className="text-primary text-xs font-medium hover:underline">
            เปิดห้อง
          </Link>
        )}
      </span>
      {showReasonText && <span className="text-default-500 text-2xs">{skipWhyText}</span>}
      {/* ข้อความเหตุผลไม่ตัดสั้น — ตัดแล้วร้านต้องไปหาต่ออีกที่ ซึ่งคือปัญหาเดิมที่กำลังแก้อยู่
          ใช้ text-danger-ink ไม่ใช่ text-danger เปล่า ๆ (คู่สี soft ที่ตกคอนทราสต์ — ui-guideline §6) */}
      {showFailReason && <span className="text-danger-ink text-2xs max-w-56 text-pretty">{failReasonText}</span>}
    </span>
  )
}

/**
 * โมดัล "ดูรายละเอียด" — pacesAlert (Swal html mode), UX-Design-Spec §"สิ่งที่เปลี่ยน" #5
 * 🛑 commenterName/postMessage มาจากผู้ใช้ Facebook ภายนอก — escapeHtml ก่อน interpolate เสมอ
 * (pacesAlert set เนื้อหาผ่าน innerHTML) ป้าย/label ที่เขียน static เองไม่ต้อง escape
 */
function buildDetailHtml(log: CommentReplyLogRow): string {
  const commenter = escapeHtml(log.commenterName ?? 'ไม่ทราบชื่อ')
  const post = escapeHtml(log.postMessage ?? '(ไม่มีข้อความ)')
  const time = escapeHtml(formatDateTimeTH(log.createdAt))
  return `
    <div class="text-start space-y-3">
      <div>
        <p class="text-default-400 text-xs mb-0.5">เวลา</p>
        <p class="text-default-800 text-sm font-medium">${time}</p>
      </div>
      <div>
        <p class="text-default-400 text-xs mb-0.5">ผู้คอมเมนต์</p>
        <p class="text-default-800 text-sm font-medium">${commenter}</p>
      </div>
      <div>
        <p class="text-default-400 text-xs mb-0.5">โพสต์</p>
        <p class="text-default-800 text-sm">${post}</p>
      </div>
      <div class="border-default-300 border-t border-dashed pt-3">
        <p class="text-default-400 mb-1 text-xs">ตอบใต้คอมเมนต์</p>
        ${statusBlockHtml('public', log)}
      </div>
      <div>
        <p class="text-default-400 mb-1 text-xs">ทักแชท</p>
        ${statusBlockHtml('private', log)}
      </div>
    </div>
  `
}

/** เหตุผลข้ามแบบเต็ม (ไม่ตัดด้วย title เหมือนตาราง) + ลิงก์ "เปิดห้อง" ที่หายไปจาก mobileCard
    (ถูกซ่อนเพราะ hideLink — ผู้ใช้ยังกดเปิดห้องได้จากตรงนี้) */
function statusBlockHtml(kind: 'public' | 'private', log: CommentReplyLogRow): string {
  const status = kind === 'public' ? log.publicReplyStatus : log.privateReplyStatus
  const failReason = kind === 'public' ? log.publicFailReasonText : log.privateFailReasonText
  if (!status) return `<span class="text-default-300 text-xs">—</span>`
  const meta = REPLY_STATUS_META[status] ?? REPLY_STATUS_META.SKIPPED
  const linkHtml =
    kind === 'private' && status === 'SENT' && log.conversationId
      ? ` <a href="/inbox/${encodeURIComponent(log.conversationId)}" class="text-primary text-xs font-medium hover:underline">เปิดห้อง</a>`
      : ''
  // fallback ไป failReason เมื่อ SKIPPED — เงื่อนไขเดียวกับ `skipWhyText` ใน ReplyStatusBadge เป๊ะ
  // (เหตุผลข้ามรายฝั่งเก็บอยู่ใน `*ErrorMessage` เช่น ALREADY_SENT ของฝั่งทักแชท)
  const skipWhy = status === 'SKIPPED' ? (log.skipReasonText ?? failReason) : null
  const reasonHtml =
    skipWhy
      ? `<p class="text-default-500 mt-1 text-xs">${escapeHtml(skipWhy)}</p>`
      : // เหตุผลของ FAILED — เงื่อนไขเดียวกับ ReplyStatusBadge เป๊ะ โมดัลกับตารางต้องพูดตรงกัน
        status === 'FAILED' && failReason
        ? `<p class="text-danger-ink mt-1 text-xs">${escapeHtml(failReason)}</p>`
        : ''
  return `<span class="badge text-2xs ${meta.className}">${meta.label}</span>${linkHtml}${reasonHtml}`
}

const logColumnHelper = createColumnHelper<CommentReplyLogRow>()

function openDetailModal(log: CommentReplyLogRow) {
  void pacesAlert({
    title: 'รายละเอียดการตอบกลับ',
    html: buildDetailHtml(log),
    confirmButtonText: 'ปิด',
    // โมดัลนี้อ่านอย่างเดียว ปิดทิ้งไม่มีผลอะไรเลย — ค่าตั้งต้นของ pacesAlert คือ false
    // ซึ่งเหมาะกับ modal ที่มีผลลัพธ์ให้รับทราบ ไม่ใช่ตารางข้อมูลที่เปิดดูแล้วปิด
    allowOutsideClick: true,
  })
}

/**
 * CommentReplyHistoryCard — ฉบับแก้ครั้งที่ 2 (2026-08-09): ยกโครงจาก AutoReplyListing.tsx
 * (DataTable + useReactTable manual pagination + TablePagination) แทน `<table>`/"โหลดเพิ่ม" เดิม
 *
 * manual pagination เพราะข้อมูลมาจาก server เป็นหน้า ๆ (ไม่โหลดทั้งชุดเข้า memory) — `data` ของ
 * table คือ "หน้าปัจจุบัน" เท่านั้น ตัด getSortedRowModel/getFilteredRowModel/getPaginationRowModel
 * ออกหมด (log เรียงตามเวลาเสมอ ไม่มีมิติให้ sort, ไม่มีช่องค้นหา — เหตุผลใน header comment บนสุด)
 */
function CommentReplyHistoryCard({ channels, initialLogs }: { channels: CommentReplyChannel[]; initialLogs: LogsPage }) {
  const [logs, setLogs] = useState<CommentReplyLogRow[]>(initialLogs.logs)
  const [total, setTotal] = useState(initialLogs.total)
  const [filterChannelId, setFilterChannelId] = useState('')
  const [filterStatus, setFilterStatus] = useState<CommentReplyLogStatusFilter>('ALL')
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE })
  const [loading, setLoading] = useState(false)
  // หน้าแรกมากับ RSC อยู่แล้ว (initialLogs) — effect ด้านล่างต้อง fetch เฉพาะตอน filter/page
  // เปลี่ยน "หลัง" mount ครั้งแรก ไม่งั้นยิงซ้ำโหลดหน้าเดิมทันทีที่ component ขึ้น
  const isFirstRender = useRef(true)

  const showFilter = channels.length > 1
  const pageFilterOptions = [
    { value: '', label: 'เพจ: ทุกเพจ' },
    ...channels.map((c) => ({ value: c.shopChannelId, label: `เพจ: ${c.name}` })),
  ]

  async function fetchLogsPage(
    channelId: string,
    pageIndex: number,
    pageSize: number,
    status: CommentReplyLogStatusFilter,
  ): Promise<LogsPage> {
    // cursor = offset ดิบ; pageIndex*pageSize คือ offset ของหน้าที่ต้องการ (API.md §4.3 ไม่เปลี่ยน)
    const params = new URLSearchParams({ cursor: String(pageIndex * pageSize), take: String(pageSize) })
    if (channelId) params.set('shopChannelId', channelId)
    // กรองที่ server เท่านั้น — `total` (ใช้คำนวณจำนวนหน้า) มาจาก server ถ้ากรองที่ client
    // เลขหน้าจะไม่ตรงกับแถวที่เห็น ซึ่งเป็นคลาสเดียวกับบั๊กตัวนับในหน้าคอมเมนต์
    if (status !== 'ALL') params.set('status', status)
    const res = await fetch(`/api/shops/comment-reply/logs?${params.toString()}`, { cache: 'no-store' })
    if (!res.ok) throw new Error('โหลดประวัติไม่สำเร็จ')
    return res.json()
  }

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    let cancelled = false
    setLoading(true)
    fetchLogsPage(filterChannelId, pagination.pageIndex, pagination.pageSize, filterStatus)
      .then((data) => {
        if (cancelled) return
        setLogs(data.logs)
        setTotal(data.total)
      })
      .catch(() => {
        // เปลี่ยนหน้าแล้ว fetch ล้ม → toast error + คงหน้าเดิมไว้ (logs/total ไม่แตะ) —
        // UX-Design-Spec §"Edge states" ฉบับแก้ครั้งที่ 2
        if (!cancelled) pacesToast.error('โหลดประวัติไม่สำเร็จ ลองใหม่อีกครั้ง')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterChannelId, filterStatus, pagination.pageIndex, pagination.pageSize])

  // เปลี่ยน filter หรือ page-size → reset pageIndex=0 เสมอ (Edge states)
  function handleFilterChange(channelId: string) {
    setFilterChannelId(channelId)
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }
  function handleStatusChange(next: string) {
    setFilterStatus(parseLogStatusFilter(next))
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }
  function handlePageSizeChange(size: number) {
    setPagination({ pageIndex: 0, pageSize: size })
  }

  const columns = useMemo<ColumnDef<CommentReplyLogRow, any>[]>(
    () => [
      logColumnHelper.accessor('createdAt', {
        header: 'เวลา',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-default-500 text-sm whitespace-nowrap">{formatDateTimeTH(row.original.createdAt)}</span>
        ),
      }),
      logColumnHelper.accessor('commenterName', {
        header: 'ผู้คอมเมนต์',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-default-800 text-sm">
            {row.original.commenterName ?? <span className="text-default-400">ไม่ทราบชื่อ</span>}
          </span>
        ),
      }),
      logColumnHelper.accessor('postMessage', {
        header: 'โพสต์',
        enableSorting: false,
        meta: { headerClassName: 'hidden xl:table-cell', cellClassName: 'hidden xl:table-cell' },
        cell: ({ row }) => (
          <span className="text-default-600 block max-w-64 truncate text-sm" title={row.original.postMessage ?? undefined}>
            {row.original.postMessage ?? <span className="text-default-400">(ไม่มีข้อความ)</span>}
          </span>
        ),
      }),
      logColumnHelper.display({
        id: 'publicStatus',
        header: 'ตอบใต้คอมเมนต์',
        cell: ({ row }) => (
          <ReplyStatusBadge kind="public" status={row.original.publicReplyStatus} conversationId={null} skipReasonText={row.original.skipReasonText} failReasonText={row.original.publicFailReasonText} />
        ),
      }),
      logColumnHelper.display({
        id: 'privateStatus',
        header: 'ทักแชท',
        cell: ({ row }) => (
          <ReplyStatusBadge
            kind="private"
            status={row.original.privateReplyStatus}
            conversationId={row.original.conversationId}
            skipReasonText={row.original.skipReasonText}
            failReasonText={row.original.privateFailReasonText}
          />
        ),
      }),
      logColumnHelper.display({
        id: 'actions',
        header: 'รายละเอียด',
        cell: ({ row }) => (
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => openDetailModal(row.original)}
              className="btn btn-icon btn-sm border-default-300 text-default-800 hover:border-default-400 border"
              aria-label="ดูรายละเอียด"
            >
              <Icon icon="info-circle" className="text-base" aria-hidden="true" />
            </button>
          </div>
        ),
      }),
    ],
    [],
  )

  const table = useReactTable({
    data: logs,
    columns,
    state: { pagination },
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const start = total === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, total)

  // Edge states: "0 log → ซ่อน toolbar+pagination ทั้งคู่" — หมายถึงร้านนี้ไม่เคยมีประวัติเลย
  // (ไม่ใช่แค่ตัวกรองปัจจุบันว่าง) ตัดสินจาก total ตอนไม่ได้กรอง ไม่งั้นกรองแล้วว่างจะซ่อน
  // FilterDropdown ไปด้วย ผู้ใช้สลับกลับ "ทุกเพจ" ไม่ได้
  // "ว่างจริง" = ยังไม่เคยมีประวัติเลย ไม่ใช่ "กรองแล้วไม่เจอ" — ถ้าซ่อน toolbar ตอนกรองแล้วว่าง
  // ผู้ใช้จะปลดตัวกรองไม่ได้ ติดอยู่กับหน้าว่างตลอดไป
  const isTrulyEmpty = total === 0 && filterChannelId === '' && filterStatus === 'ALL'

  return (
    <div className="card">
      <div className="card-header flex flex-wrap items-center justify-between gap-3">
        <h5 className="card-title">ประวัติการตอบอัตโนมัติ</h5>
        {!isTrulyEmpty && (
          <div className="flex items-center gap-2.5">
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
            {/* ตัวกรองสถานะ — พี่น้อง AutoReplyListing.tsx มีมาตั้งแต่แรก ที่นี่เพิ่งเติม
                (sibling-surface-parity.md: ยกโครงตารางมาแล้วแต่ข้ามพฤติกรรม ซึ่งเป็นสิ่งที่ user
                ทักจริง ๆ) แถวส่วนใหญ่ที่นี่เป็น "ข้าม" และแถวที่เปิดตารางมาหาคือ "ไม่สำเร็จ" */}
            <FilterDropdown
              icon="circle-check"
              value={filterStatus}
              options={LOG_STATUS_FILTER_OPTIONS}
              onChange={handleStatusChange}
              resetValue="ALL"
              align="right"
            />

            {/* hidden lg:block — เหมือนพี่น้อง AutoReplyListing.tsx (จำนวนต่อหน้าไม่ใช่ control หลักบนมือถือ) */}
            <div className="hidden w-20 lg:block">
              <ChoiceSelect
                options={PAGE_SIZE_OPTIONS}
                value={String(pageSize)}
                search={false}
                onChange={(v) => handlePageSizeChange(Number(v))}
                ariaLabel="จำนวนต่อหน้า"
              />
            </div>
          </div>
        )}
      </div>

      {logs.length === 0 && !loading ? (
        <div className="card-body">
          <SellerEmptyState
            compact
            icon="history"
            title="ยังไม่มีการตอบกลับเกิดขึ้น"
            description="เมื่อระบบตอบหรือข้ามคอมเมนต์ จะบันทึกไว้ที่นี่"
          />
        </div>
      ) : (
        // dim ตารางระหว่างโหลดหน้าใหม่ (Edge states) — ไม่ล้างข้อมูลเดิมทิ้งระหว่างรอ
        // aria-busy + live region: ก่อนหน้านี้ตารางสลับเนื้อหาเงียบสนิทสำหรับผู้ใช้ที่มองไม่เห็น
        // (dim + pointer-events-none เป็นสัญญาณทางสายตาล้วน)
        <div className={loading ? 'pointer-events-none opacity-50' : undefined} aria-busy={loading || undefined}>
          <span className="sr-only" role="status" aria-live="polite">
            {loading ? 'กำลังโหลดประวัติ' : `แสดง ${logs.length} จาก ${total} รายการ`}
          </span>
          <DataTable<CommentReplyLogRow>
            table={table}
            emptyMessage="ไม่พบประวัติตามตัวกรองนี้"
            onRowClick={(row) => openDetailModal(row.original)}
            mobileCard={(row) => {
              const log = row.original
              return (
                <button
                  type="button"
                  onClick={() => openDetailModal(log)}
                  className="hover:bg-default-50 flex w-full items-center gap-3 px-4 py-3.5 text-start"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="text-default-800 font-medium">{formatDateTimeTH(log.createdAt)}</span>
                      <span className="text-default-400"> · </span>
                      <span className="text-default-600">{log.commenterName ?? 'ไม่ทราบชื่อ'}</span>
                    </p>
                    {/* postMessage null → ไม่โชว์บรรทัดนี้เลย (พื้นที่จำกัด อย่ากินที่ด้วยข้อความว่าง) */}
                    {log.postMessage && <p className="text-default-500 mt-0.5 truncate text-xs">{log.postMessage}</p>}
                    <div className="mt-1.5 flex flex-wrap items-start gap-3">
                      <ReplyStatusBadge
                        kind="public"
                        status={log.publicReplyStatus}
                        conversationId={null}
                        skipReasonText={log.skipReasonText}
                        failReasonText={log.publicFailReasonText}
                        revealSkipReason
                        hideLink
                      />
                      <ReplyStatusBadge
                        kind="private"
                        status={log.privateReplyStatus}
                        conversationId={log.conversationId}
                        skipReasonText={log.skipReasonText}
                        failReasonText={log.privateFailReasonText}
                        revealSkipReason
                        hideLink
                      />
                    </div>
                  </div>
                  <Icon icon="chevron-right" className="text-default-300 shrink-0 text-lg" aria-hidden="true" />
                </button>
              )
            }}
          />
        </div>
      )}

      {logs.length > 0 && (
        <div className="card-footer">
          <TablePagination
            totalItems={total}
            start={start}
            end={end}
            itemsName="รายการ"
            showInfo
            previousPage={table.previousPage}
            canPreviousPage={table.getCanPreviousPage()}
            pageCount={table.getPageCount()}
            pageIndex={pageIndex}
            setPageIndex={table.setPageIndex}
            nextPage={table.nextPage}
            canNextPage={table.getCanNextPage()}
          />
        </div>
      )}
    </div>
  )
}
