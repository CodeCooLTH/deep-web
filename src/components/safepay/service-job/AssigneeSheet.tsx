'use client'

/**
 * AssigneeSheet — ชีต "มอบงาน" ของร้านบริการ (feature 00086 S-6 · BRD FR-007)
 *
 * แตะแถว = บันทึกทันที (ไม่มี footer) · "ยังไม่ระบุ (ให้กดรับงานเอง)" = DELETE /assign
 * แถวเป็น `<button aria-pressed>` ไม่ใช่ radio — ลูกศรบน radio group เปลี่ยนค่าทุกครั้งที่กด = มอบงานรัว ๆ โดยไม่ตั้งใจ
 * ไม่มีบรรทัด "ระบบแจ้งช่างที่ได้รับงาน" ของต้นแบบ — FR-014 ไม่แจ้งช่าง (ประโยคนั้นไม่จริง · UX D3)
 * สิทธิ์ O2s ตรวจที่ route — ผู้เรียกเปิดชีตนี้เฉพาะ canAssignServiceJob
 *
 * มติ 2026-10-30 (ร้านช่างเยอะ · prototype v14) — ใช้สองที่:
 *  - หน้างาน (orderToken) : แตะ = บันทึกผ่าน API ทันที
 *  - ฟอร์มสร้างงาน (onSelect) : แตะ = เลือกค่าในฟอร์ม ไม่ยิง API (AssigneePicker เปิดเมื่อช่างเกิน ASSIGNEE_CHIPS_MAX)
 *  ส่ง window มา = ขอ load จาก server → ป้าย "ว่างช่วงนี้ / ติดงาน" + "วันนี้ N งาน" · คนว่างขึ้นก่อน (assignee-load)
 *  ช่างเกิน ASSIGNEE_CHIPS_MAX = มีช่องค้นชื่อ
 *
 * Base: src/components/safepay/service-close/ServiceCloseSheet.tsx (เปลือกชีต) ← theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx
 *   แถวเลือก: radio card ของ ShippingSettingsRow.tsx (border-primary bg-primary/10) ← theme/paces/Admin/TS/src/app/(admin)/ui/list-group/page.tsx
 */

import { useEffect, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import {
  matchesStaffQuery,
  sortStaffByAvailability,
  staffQuery,
  usesAssigneeSearch,
  type LoadWindow,
  type StaffLoad,
} from '@/lib/assignee-load'
import { formatDayMonthTH, formatTimeHM, isSameBangkokDay } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'
import { SERVICE_JOB_ERROR_MESSAGE } from '@/lib/service-job'
import { cn } from '@/utils/helpers'

import StaffLoadLine from './StaffLoadLine'
import { useSheetA11y } from './useSheetA11y'

type Staff = { userId: string; displayName: string; load?: StaffLoad }

interface CommonProps {
  open: boolean
  onClose: () => void
  /** ผู้รับผิดชอบตอนนี้ — null = ยังไม่มีคนรับ */
  currentUserId: string | null
  /** ช่วงเวลาของงาน — มี = ป้ายว่าง/ติดงาน · null = ชื่ออย่างเดียว (งานไม่มีเวลา/ฟอร์มยังไม่ครบ) */
  window?: LoadWindow | null
}

export type AssigneeSheetProps =
  | (CommonProps & {
      orderToken: string
      orderLabel: string
      /** บันทึกสำเร็จ — ผู้เรียกรีเฟรชข้อมูลของตัวเอง */
      onDone: () => void
      onSelect?: never
    })
  | (CommonProps & {
      /** ฟอร์มสร้างงาน — รายชื่อของร้านฟอร์ม (กล่องแชทรวมหลายร้าน) */
      shopId: string
      /** เลือกแล้ว (ไม่ยิง API) — null = ยังไม่มีคนรับ */
      onSelect: (userId: string | null) => void
      /** ยังไม่มีช่วงเวลา (จองล่วงหน้าที่ยังไม่เลือกวัน/เวลา) — บอกว่าต้องเลือกก่อนจึงเห็นว่าใครว่าง (assigneeWindowHint) */
      windowHint?: string | null
      orderToken?: never
    })

const NONE = '' // คีย์ของแถว "ยังไม่ระบุ"

/**
 * มอบงานไม่สำเร็จแล้วต้องทำอะไรต่อนอกจาก toast (MINOR-4) — แยกเป็นฟังก์ชันล้วนให้เทสได้ (repo ไม่มี DOM)
 *  - 400 ASSIGNEE_NOT_TECHNICIAN: รายชื่อในชีตเก่าแล้ว (คนนั้นถูกถอดช่าง/ออกจากร้านระหว่างเปิดชีต) → โหลดรายชื่อใหม่
 *  - 409 SERVICE_JOB_ALREADY_CLOSED: งานถูกปิดระหว่างเปิดชีต → ให้ผู้เรียกรีเฟรช (onDone) แล้วปิดชีต — มอบต่อไม่ได้แล้ว
 *  - อื่น ๆ: แค่ toast (กดซ้ำได้)
 */
export function assignErrorFollowUp(status: number, code: string | undefined): 'RELOAD_STAFF' | 'REFRESH' | null {
  if (status === 400 && code === 'ASSIGNEE_NOT_TECHNICIAN') return 'RELOAD_STAFF'
  if (status === 409 && code === 'SERVICE_JOB_ALREADY_CLOSED') return 'REFRESH'
  return null
}

export default function AssigneeSheet(props: AssigneeSheetProps) {
  const { open, onClose, currentUserId, window: loadWindow = null } = props
  const orderToken = props.orderToken ?? null
  const shopId = props.onSelect ? props.shopId : null
  const windowHint = props.onSelect ? (props.windowHint ?? null) : null
  const [staff, setStaff] = useState<Staff[] | 'loading' | 'error'>('loading')
  const [query, setQuery] = useState('')
  // deps ของ fetch เป็นสตริง — ผู้เรียกสร้าง window ใหม่ทุก render ได้โดยไม่ยิงซ้ำ
  const fromISO = loadWindow?.from.toISOString() ?? null
  const toISO = loadWindow?.to.toISOString() ?? null
  const [reloadKey, setReloadKey] = useState(0)
  /** แถวที่กำลังบันทึก — แถวอื่นกดไม่ได้ระหว่างนั้น */
  const [pending, setPending] = useState<string | null>(null)

  const { panelRef, closeRef } = useSheetA11y(open, () => {
    if (pending === null) onClose()
  })

  useEffect(() => {
    if (!open) return
    setPending(null)
    setStaff('loading')
    setQuery('')
    let cancelled = false
    const win = fromISO && toISO ? { from: new Date(fromISO), to: new Date(toISO) } : null
    fetch(`/api/shops/current/service-staff${staffQuery({ shopId, window: win, excludeToken: orderToken })}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status))
        return (await r.json()) as { staff?: Staff[] }
      })
      .then((j) => {
        if (!cancelled) setStaff(Array.isArray(j.staff) ? j.staff : [])
      })
      .catch(() => {
        if (!cancelled) setStaff('error')
      })
    return () => {
      cancelled = true
    }
  }, [open, reloadKey, shopId, orderToken, fromISO, toISO])

  if (!open) return null

  const current = currentUserId ?? NONE

  async function pick(userId: string, name: string | null) {
    if (pending !== null) return
    if (userId === current) {
      onClose()
      return
    }
    if (props.onSelect) {
      props.onSelect(userId === NONE ? null : userId)
      onClose()
      return
    }
    const { orderToken: token, onDone } = props
    setPending(userId)
    try {
      const res = await fetch(`/api/orders/${token}/assign`, userId === NONE
        ? { method: 'DELETE' }
        : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }) })
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        pacesToast.error(json.message ?? SERVICE_JOB_ERROR_MESSAGE[json.error ?? ''] ?? 'มอบงานไม่สำเร็จ — ลองอีกครั้ง')
        const next = assignErrorFollowUp(res.status, json.error)
        if (next === 'RELOAD_STAFF') setReloadKey((k) => k + 1)
        if (next === 'REFRESH') {
          onDone()
          onClose()
        }
        return
      }
      pacesToast.success(userId === NONE ? 'ยกเลิกผู้รับผิดชอบแล้ว' : `มอบงานให้ ${name} แล้ว`)
      onDone()
      onClose()
    } catch {
      pacesToast.error('มอบงานไม่สำเร็จ — ลองอีกครั้ง')
    } finally {
      setPending(null)
    }
  }

  // ฟังก์ชันคืน JSX ไม่ใช่ component — ประกาศ component ใน render = remount ทุกรอบ (component-declared-in-render)
  const sameDay = fromISO ? isSameBangkokDay(fromISO) : true
  const renderRow = (id: string, label: string, hint?: string, load?: StaffLoad) => {
    const on = id === current
    const busy = pending === id
    return (
      <button
        key={id || 'none'}
        type="button"
        aria-pressed={on}
        disabled={pending !== null && !busy}
        onClick={() => void pick(id, id === NONE ? null : label)}
        className={cn(
          'flex min-h-12 w-full items-center gap-3 rounded-lg border p-3 text-start disabled:opacity-60',
          on ? 'border-primary bg-primary/10' : 'border-default-200 hover:bg-default-50',
        )}
      >
        <Icon
          icon={busy ? 'loader-2' : on ? 'circle-check-filled' : 'circle'}
          className={cn('shrink-0 text-lg', on ? 'text-primary' : 'text-default-400', busy && 'animate-spin')}
          aria-hidden="true"
        />
        <span className="min-w-0">
          <span className="text-dark block truncate text-sm font-medium">{label}</span>
          {hint && <span className="text-default-700 block text-xs">{hint}</span>}
          {load && <StaffLoadLine load={load} sameDay={sameDay} />}
        </span>
      </button>
    )
  }

  const searchable = Array.isArray(staff) && usesAssigneeSearch(staff.length)
  const shown = Array.isArray(staff)
    ? sortStaffByAvailability(staff.filter((s) => matchesStaffQuery(s.displayName, query)))
    : []

  return (
    <div
      className="fixed inset-0 z-90 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assignee-sheet-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && pending === null) onClose()
      }}
    >
      <div ref={panelRef} className="card bg-card flex max-h-full w-full flex-col rounded-b-none sm:max-w-lg sm:rounded-lg">
        <div className="card-header flex flex-nowrap items-center justify-between gap-2">
          <h5 id="assignee-sheet-title" className="mb-0 flex min-w-0 grow items-center gap-2 text-base">
            <Icon icon="user-cog" className="text-primary shrink-0 text-lg" aria-hidden="true" />
            <span className="truncate">{props.onSelect ? 'เลือกผู้รับผิดชอบ' : `มอบงาน · ${props.orderLabel}`}</span>
          </h5>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={pending !== null}
            aria-label="ปิด"
            className="btn btn-icon text-default-700 hover:bg-default-100 size-11! shrink-0"
          >
            <Icon icon="x" className="text-lg" />
          </button>
        </div>

        {(searchable || loadWindow || windowHint) && (
          <div className="border-default-200 space-y-2 border-b px-4 py-3">
            {searchable && (
              <div className="bg-light/40 border-default-200 flex min-h-11 w-full min-w-0 items-center gap-2 rounded-full border px-3">
                <Icon icon="solar:magnifer-linear" className="text-default-400 shrink-0 text-lg" aria-hidden="true" />
                <input
                  type="search"
                  placeholder="ค้นชื่อ"
                  aria-label="ค้นชื่อผู้รับผิดชอบ"
                  autoComplete="off"
                  className="text-default-900 placeholder:text-default-400 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none outline-hidden focus:ring-0"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            )}
            {loadWindow && (
              <p className="text-default-700 mb-0 text-xs">
                ช่วงงาน {formatTimeHM(loadWindow.from)}–{formatTimeHM(loadWindow.to)} · {sameDay ? 'วันนี้' : formatDayMonthTH(loadWindow.from)} · คนที่ว่างขึ้นก่อน
              </p>
            )}
            {!loadWindow && windowHint && <p className="text-warning-ink mb-0 text-xs">{windowHint}</p>}
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"> {/* carve-out HR7: ชีตไม่มี footer — เนื้อชีตยึดขอบล่างจอจึงรับ safe-area เอง (เท่า ServiceCloseSheet) */}
          {/* critique P1-5 — คำเดียวกับการ์ด "งานนี้" · บรรทัดสองบอกว่าช่างรับเองได้ · กำลังค้นชื่อ = ซ่อน (ไม่ใช่ชื่อคน) */}
          {!query.trim() && renderRow(NONE, 'ยังไม่มีคนรับ', 'ช่างกด "รับงานนี้" เองได้')}
          {staff === 'loading' &&
            [0, 1, 2].map((i) => <div key={i} className="bg-default-300 h-12 animate-pulse rounded-lg" aria-hidden="true" />)}
          {staff === 'error' && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <p className="text-default-700 mb-0 text-sm">โหลดรายชื่อไม่สำเร็จ</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="btn btn-sm border-default-300 text-default-800 hover:bg-default-50 min-h-11 border lg:min-h-0"
              >
                ลองอีกครั้ง
              </button>
            </div>
          )}
          {Array.isArray(staff) && staff.length === 0 && (
            <p className="text-default-700 mb-0 pt-2 text-sm">ร้านยังไม่มีคนในฝ่ายช่าง · ตั้งบทบาทได้ที่หน้าทีมงาน</p>
          )}
          {shown.map((s) => renderRow(s.userId, s.displayName, undefined, s.load))}
          {Array.isArray(staff) && staff.length > 0 && shown.length === 0 && (
            <p className="text-default-700 mb-0 pt-2 text-center text-sm">ไม่พบชื่อ &quot;{query.trim()}&quot;</p>
          )}
        </div>
      </div>
    </div>
  )
}
