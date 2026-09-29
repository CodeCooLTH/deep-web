'use client'

/**
 * FollowUpsClient — สถานะทั้งหมดของหน้ารวมติดตามลูกค้า: ตัวกรอง (อยู่ใน URL) · โหลดกระดาน/ปฏิทิน · ชีตวัน · ฟอร์มแก้ไข
 * (00066 พื้นผิว c, FR-ACT-08)
 *
 * Base:
 *  - โครงแถบเครื่องมือ: segmented ตาม theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (inline-flex + rounded-*-none
 *    — Paces Tailwind ไม่มี .btn-group) · ช่องค้นหา theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx
 *    (input-icon-group + search)
 *  - แนวทางพี่น้อง: src/app/(paces)/seller/(dashboard)/queues/components/QueuesCalendarSwitch.tsx (มุมมองเดียว mount ตัวเดียว)
 *
 * ตัดสินใจที่ควรรู้:
 *  - ทุกตัวกรอง/มุมมอง/เดือน อยู่ใน URL (`window.history.replaceState` — Next ซิงก์ useSearchParams ให้เอง ไม่ยิง RSC ใหม่ทั้งหน้า)
 *    ค่าแปลก = ไม่กรอง (parsePageQuery) · ค่าตั้งต้น = ทั้งร้าน (?mine=1 = ของฉัน)
 *  - ตัวเลขบน segmented/แท็บ/ชิปรายคนมาจาก counts ของ API ที่ไม่ขึ้นกับตัวกรอง (AC-ACT-26) — ปฏิทินก็ใช้ counts ชุดเดียวกัน
 *    จึงยิง board ทุกครั้งแม้อยู่มุมมองปฏิทิน (ปฏิทินยิงเพิ่มเฉพาะเดือน)
 *  - การ์ดเรียก API เองแล้วแจ้ง onChange → ที่นี่โหลดใหม่ทั้งชุดเสมอ (รายการย้ายคอลัมน์/วันได้ ไม่ patch ทีละใบ)
 *  - dep ของ effect โหลด = สตริง key เท่านั้น (ไม่ใส่อ็อบเจกต์ที่สร้างใหม่ทุก render — hook-return-identity-in-deps.md)
 */
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FollowUpForm from '@/app/(paces)/seller/_follow-up/FollowUpForm'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import {
  countActiveFilters,
  monthOfDay,
  parsePageQuery,
  scopeCounts,
  shopHasNoFollowUps,
  toApiSearch,
  toPageSearch,
  type BoardCounts,
  type PageQuery,
} from '@/lib/follow-up-page'
import { formatCount, type FollowUpChange } from '@/lib/follow-up-view'
import { openNativeNotificationSettings, readPushPermission, subscribePushPermission, type PushPermission } from '@/lib/native-bridge'
import type { FollowUpDto, PersonDto } from '@/services/customer-follow-up.service'
import FollowUpBoard, { type BoardData } from './FollowUpBoard'
import FollowUpCalendar from './FollowUpCalendar'
import FollowUpDaySheet from './FollowUpDaySheet'
import FollowUpFilterPanel from './FollowUpFilterPanel'

type BoardResponse = BoardData & { truncated: boolean }
type CalState = { month: string; items: FollowUpDto[]; truncated: boolean }

/** segmented — ปุ่มติดกัน active = primary (ข้อความล้วน ไม่มีไอคอน) */
function Segmented<K extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: K
  options: { key: K; text: string }[]
  onChange: (k: K) => void
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex">
      {options.map((o, i) => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            className={`btn min-h-11 border lg:min-h-0 ${i > 0 ? 'rounded-s-none -ms-px' : ''} ${
              i < options.length - 1 ? 'rounded-e-none' : ''
            } ${on ? 'border-primary bg-primary text-white' : 'border-default-300 bg-card text-default-800 hover:bg-light'}`}
          >
            {o.text}
          </button>
        )
      })}
    </div>
  )
}

export default function FollowUpsClient({
  userId,
  todayKey,
  assignees,
  allTags,
  shopId,
}: {
  userId: string
  /** วันนี้ (ไทย) YYYY-MM-DD จาก server — ไม่คำนวณฝั่ง client กัน hydration ต่างกันรอบเที่ยงคืน */
  todayKey: string
  /** null = ร้าน PERSONAL ล้วน → ไม่มีตัวเลือกคน */
  assignees: PersonDto[] | null
  allTags: string[]
  /** ?shopId= ที่มากับ push (อยู่ในขอบเขตแล้ว) — ส่งต่อให้ API ตัดขอบเขต */
  shopId: string | null
}) {
  const t = useT().followUps
  const currentMonth = monthOfDay(todayKey)
  const personal = assignees === null
  const sp = useSearchParams()
  const spKey = sp.toString()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- spKey คือ sp ในรูปสตริง (sp เองเปลี่ยน identity ได้)
  const q = useMemo(() => parsePageQuery((k) => sp.get(k), currentMonth), [spKey, currentMonth])

  const navigate = useCallback(
    (next: PageQuery) => {
      const s = new URLSearchParams(toPageSearch(next, currentMonth))
      if (shopId) s.set('shopId', shopId)
      const qs = s.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
    },
    [currentMonth, shopId],
  )

  // ---------- โหลดข้อมูล ----------
  const [reloadSeq, setReloadSeq] = useState(0)
  const reload = useCallback(() => setReloadSeq((n) => n + 1), [])
  const onChange = useCallback((_c: FollowUpChange<FollowUpDto>) => reload(), [reload])

  const [board, setBoard] = useState<BoardResponse | null>(null)
  const [boardErr, setBoardErr] = useState(false)
  const boardKey = toApiSearch(q, 'board', shopId)
  useEffect(() => {
    let cancelled = false
    setBoardErr(false)
    fetch(`/api/follow-ups/board?${boardKey}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status))
        const j = (await r.json()) as BoardResponse
        if (!cancelled) setBoard(j)
      })
      .catch(() => {
        // คงข้อมูลเดิมไว้ (ถ้ามี) — แถบ error บอกและมีปุ่มลองใหม่ ไม่ล้างจอเป็นว่าง
        if (!cancelled) setBoardErr(true)
      })
    return () => {
      cancelled = true
    }
  }, [boardKey, reloadSeq])

  const [cal, setCal] = useState<CalState | null>(null)
  const [calErr, setCalErr] = useState(false)
  const isCalendar = q.view === 'calendar'
  const calKey = toApiSearch(q, 'calendar', shopId)
  useEffect(() => {
    if (!isCalendar) return
    let cancelled = false
    setCalErr(false)
    fetch(`/api/follow-ups/board?${calKey}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status))
        const j = (await r.json()) as { items: FollowUpDto[]; truncated: boolean; month: string }
        if (!cancelled) setCal({ month: j.month, items: j.items, truncated: j.truncated })
      })
      .catch(() => {
        if (!cancelled) setCalErr(true)
      })
    return () => {
      cancelled = true
    }
  }, [isCalendar, calKey, reloadSeq])
  // เดือนที่ค้างจากรอบก่อนห้ามวาดเป็นของเดือนนี้ — รอโหลดเป็น skeleton/"กำลังโหลด" แทน (เหตุเดียวกับ AppointmentMonthBoard)
  const calItems = cal && cal.month === q.month ? cal.items : null

  // ---------- ค้นชื่อ (หน่วง 350ms) ----------
  const [qInput, setQInput] = useState(q.q)
  const qRef = useRef(q)
  useEffect(() => {
    qRef.current = q
  }, [q])
  useEffect(() => {
    const v = qInput.trim().slice(0, 100)
    if (v === qRef.current.q) return
    const id = setTimeout(() => navigate({ ...qRef.current, q: v }), 350)
    return () => clearTimeout(id)
  }, [qInput, navigate])

  // ---------- ชีตวัน + ฟอร์มแก้ไข ----------
  const [day, setDay] = useState<string | null>(null)
  const [editing, setEditing] = useState<FollowUpDto | null>(null)
  const changeDay = (key: string) => {
    setDay(key)
    // เดินข้ามเดือน → พาปฏิทินตามไปด้วย ไม่งั้นชีตค้างเดือนเก่าแล้วบอกว่า "ไม่มีรายการ" ทั้งที่ไม่ได้โหลด
    if (monthOfDay(key) !== q.month) navigate({ ...q, month: monthOfDay(key) })
  }

  // ---------- แจ้งเตือนของเครื่องถูกปิด (เฉพาะในแอป) — null ≠ denied ----------
  const [perm, setPerm] = useState<PushPermission | null>(null)
  useEffect(() => {
    setPerm(readPushPermission())
    return subscribePushPermission(setPerm)
  }, [])

  // ---------- derive ----------
  const counts: BoardCounts | null = board?.counts ?? null
  const scope = counts ? scopeCounts(counts, userId) : null
  const activeCount = countActiveFilters(q)
  const hasFilter = activeCount > 0 || q.mine
  const clearAll = () => {
    setQInput('')
    navigate({ ...q, mine: false, assignee: null, tags: [], q: '' })
  }
  const columnsEmpty = board ? Object.values(board.columns).every((c) => c.length === 0) : false
  const err = isCalendar ? calErr : boardErr

  return (
    <div className="flex flex-col gap-3">
      {perm === 'denied' && (
        <div role="status" className="bg-info/15 text-info-ink flex flex-wrap items-center gap-2 rounded-lg p-3 text-sm">
          <Icon icon="bell-off" className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{t.pushOffBanner}</span>
          <button
            type="button"
            onClick={openNativeNotificationSettings}
            className="btn border-info-ink text-info-ink min-h-11 border bg-transparent lg:min-h-0"
          >
            {t.pushOffCta}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!personal && (
          <Segmented
            label={t.scopeAria}
            value={q.mine ? 'mine' : 'all'}
            options={[
              { key: 'mine', text: `${t.scopeMine}${scope ? ` (${formatCount(scope.mine)})` : ''}` },
              { key: 'all', text: `${t.scopeAll}${scope ? ` (${formatCount(scope.all)})` : ''}` },
            ]}
            onChange={(k) => navigate(k === 'mine' ? { ...q, mine: true, assignee: null } : { ...q, mine: false })}
          />
        )}
        <Segmented
          label={t.viewAria}
          value={q.view}
          options={[
            { key: 'board', text: t.viewBoard },
            { key: 'calendar', text: t.viewCalendar },
          ]}
          onChange={(k) => navigate({ ...q, view: k })}
        />
      </div>

      {/* แถวค้นหา + ตัวกรอง — relative: แผงตัวกรองยึดแถวนี้ ไม่ใช่ปุ่ม (เหมือน InboxList) */}
      <div className="relative flex items-center gap-2">
        <div className="input-icon-group flex-1">
          <Icon icon="search" className="input-icon" aria-hidden="true" />
          <input
            type="search"
            className="form-input"
            placeholder={t.filterSearchPh}
            aria-label={t.filterSearchPh}
            value={qInput}
            maxLength={100}
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <FollowUpFilterPanel
          assignee={q.assignee}
          tags={q.tags}
          activeCount={activeCount}
          assignees={assignees}
          showAssignee={!personal && !q.mine}
          allTags={allTags}
          byUser={counts?.byUser ?? {}}
          unassigned={counts?.unassigned ?? 0}
          onApply={(n) => navigate({ ...q, assignee: n.assignee, tags: n.tags })}
        />
      </div>

      {err && (
        <div role="alert" className="bg-danger/15 text-danger-ink flex flex-wrap items-center gap-2 rounded-lg p-3 text-sm">
          <Icon icon="alert-triangle" className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{t.pageLoadError}</span>
          <button
            type="button"
            onClick={reload}
            className="btn border-danger-ink text-danger-ink min-h-11 border bg-transparent lg:min-h-0"
          >
            {t.retry}
          </button>
        </div>
      )}

      {isCalendar ? (
        <FollowUpCalendar
          month={q.month}
          todayKey={todayKey}
          items={calItems}
          truncated={cal?.month === q.month && cal.truncated}
          onMonthChange={(m) => navigate({ ...q, month: m })}
          onOpenDay={setDay}
        />
      ) : board && counts && shopHasNoFollowUps(counts) ? (
        // ร้านไม่มีรายการเลยสักใบ = แทนกระดานทั้งหมด (ไม่ใช่กระดาน 5 คอลัมน์ว่างเรียงกัน)
        <div className="card">
          <div className="card-body flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <span className="bg-default-100 text-default-500 flex size-14 items-center justify-center rounded-full">
              <Icon icon="list-check" className="size-7" aria-hidden="true" />
            </span>
            <h5 className="text-dark text-base font-semibold">{t.pageEmpty}</h5>
            <p className="text-default-600 max-w-sm text-sm">{t.pageEmptyHint}</p>
            <Link href="/inbox" className="btn bg-primary hover:bg-primary-hover mt-1 min-h-11 gap-1.5 text-white">
              <Icon icon="message-circle" className="size-4" aria-hidden="true" />
              {t.pageEmptyCta}
            </Link>
          </div>
        </div>
      ) : board && columnsEmpty && hasFilter ? (
        // กรองแล้วไม่เจอ — ไม่ใช่ร้านว่าง (ตัวเลขทั้งร้านยังมี) จึงมีทางล้างตัวกรอง
        <div className="card">
          <div className="card-body flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-default-800 text-sm">{t.filterNone}</p>
            <button
              type="button"
              onClick={clearAll}
              className="btn border-default-300 text-default-800 hover:bg-light min-h-11 border lg:min-h-0"
            >
              {t.filterClear}
            </button>
          </div>
        </div>
      ) : (
        <>
          {board?.truncated && (
            <div role="status" className="bg-warning/15 text-warning-ink flex items-start gap-2 rounded-lg p-3 text-sm">
              <Icon icon="alert-triangle" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{t.boardTruncated}</span>
            </div>
          )}
          <FollowUpBoard data={board} onChange={onChange} onEdit={setEditing} />
        </>
      )}

      {day && (
        <FollowUpDaySheet
          dayKey={day}
          items={calItems}
          onClose={() => setDay(null)}
          onDayChange={changeDay}
          onChange={onChange}
          onEdit={setEditing}
        />
      )}

      {editing && (
        <FollowUpForm
          item={editing}
          assignees={assignees}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
    </div>
  )
}
