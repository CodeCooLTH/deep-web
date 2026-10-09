'use client'

/**
 * ChatMemorySection — "ความจำของแชทนี้" บนสุดของแท็บ "ข้อมูล" (00019-ext-mem, S-13)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx:87-93 (form-label + form-textarea)
 *       theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx:48 (callout bg-{c}/15 role="alert")
 * + ปุ่ม/ไอคอน/บันทึก-ยกเลิก ลอกจาก CustomerCrmSection.tsx (EditButton, ปุ่มท้ายฟอร์ม), skeleton/error จาก CustomerPanel.tsx crmSlot
 *
 * 🛑 textarea ต้อง form-textarea ไม่ใช่ form-input — _forms.css ไม่ห่อ @layer ทำให้ form-input ทับ rows
 *
 * state ทั้งก้อนมาจาก useChatMemory ที่ CustomerPanelBody (ยกขึ้น parent เพราะโน้ต CRM ต้องรู้ ai.noteReadByAi)
 * โหมดภายในมี view / edit และ "ชนกัน" (409) ซึ่งเป็นสถานะย่อยของ edit — draft ไม่หายเด็ดขาด
 * ห้ามเปลี่ยน expectedVersion เงียบ ๆ: ส่งทับได้เฉพาะตอนผู้ใช้กด "บันทึกทับด้วยของฉัน" เอง (AC-MEM-08)
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { relativeTimeTh } from '@/lib/relative-time-th'
import { redactPii } from '@/lib/pii-redact'
import { MEMORY_POKE_EVENT } from '@/lib/chat-memory-events'
import { CHAT_MEMORY_MAX, type ChatMemoryConflict } from '@/lib/chat-memory-types'
import { memoryMetaKind, shouldClampMemory } from '@/lib/chat-memory-ui'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import type { useChatMemory } from './useChatMemory'

type Props = {
  state: ReturnType<typeof useChatMemory>
  /** id ของหัวข้อ — ให้ลิงก์ "ความจำของแชทนี้" ใต้โน้ต (T12) โฟกัสมาที่นี่ได้ */
  headingId?: string
}

const COUNTER_WARN_AT = CHAT_MEMORY_MAX - 40 // 760

const timeOf = (iso: string) => relativeTimeTh(Date.parse(iso))

export default function ChatMemorySection({ state, headingId }: Props) {
  const t = useT()
  const m = t.inbox.customerPanel.memory
  const uid = useId()
  const { status, data } = state
  const memory = data?.memory ?? null
  const ai = data?.ai ?? null
  const writes = ai?.writes === true
  const updating = ai?.updating === true

  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [draft, setDraft] = useState('')
  const [editBase, setEditBase] = useState<number | null>(null) // version ที่ผู้ใช้เริ่มแก้จาก
  const [conflictState, setConflictState] = useState<{ current: ChatMemoryConflict['current'] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [announce, setAnnounce] = useState(false)

  const pencilRef = useRef<HTMLButtonElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const refocusRef = useRef(false)

  // ประกาศให้โปรแกรมอ่านจอเมื่อ AI อัปเดตเสร็จ (ข้อความเปลี่ยนเงียบ ๆ ไม่มีอนิเมชัน)
  // ปรับ state ตอน render (ไม่ใช้ effect) — ตามแนว "storing information from previous renders" ของ React
  const [prevUpdating, setPrevUpdating] = useState(updating)
  if (prevUpdating !== updating) {
    setPrevUpdating(updating)
    if (prevUpdating && !updating) setAnnounce(true)
  }

  // เข้าโหมดแก้ → โฟกัสท้ายข้อความ · iOS: sheet เป็น fixed คีย์บอร์ดบังช่อง จึงเลื่อนเข้ากลาง
  useEffect(() => {
    if (mode !== 'edit') return
    const el = areaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    el.scrollIntoView?.({ block: 'center' })
  }, [mode])

  // ออกจากโหมดแก้ → คืนโฟกัสให้ปุ่มที่เปิดมา (ดินสอ หรือ "เพิ่มความจำ")
  useEffect(() => {
    if (mode === 'view' && refocusRef.current) {
      refocusRef.current = false
      ;(pencilRef.current ?? addRef.current)?.focus()
    }
  }, [mode, memory])

  // ระหว่างแก้ถ้ารีเฟรชพบฉบับใหม่ (version ไม่ตรงที่เริ่มแก้) → ขึ้น "ชนกัน" ทันที ไม่เปลี่ยน expectedVersion เงียบ ๆ
  const dataStale = mode === 'edit' && (memory?.version ?? null) !== editBase
  const conflict: { current: ChatMemoryConflict['current'] } | null = dataStale
    ? { current: memory ? { text: memory.text, version: memory.version, source: memory.source, updatedAt: memory.updatedAt } : null }
    : conflictState

  const pii = useMemo(() => (mode === 'edit' ? redactPii(draft).found.length > 0 : false), [mode, draft])

  const startEdit = () => {
    setDraft(memory?.text ?? '')
    setEditBase(memory?.version ?? null)
    setConflictState(null)
    setMode('edit')
  }
  const exitEdit = (refocus: boolean) => {
    refocusRef.current = refocus
    setConflictState(null)
    setMode('view')
  }

  async function save(expected: number | null) {
    if (saving) return
    setSaving(true)
    const r = await state.saveMemory(draft, expected)
    setSaving(false)
    if (r.ok) {
      // เก็บแถวไว้แม้ข้อความว่าง (ล้างความจำ) — ไม่งั้นแก้รอบถัดไปจะส่ง expectedVersion=null ชนแถวเดิม
      state.applyMemory(r.memory)
      // ถ้าเขียนทับตอนชนกัน editBase เปลี่ยนไปแล้ว — ออกโหมดแก้ก่อนที่ dataStale จะกระพริบ
      exitEdit(true)
      pacesToast.chat.success(m.saved)
    } else if (r.conflict) {
      setConflictState({ current: r.current })
    } else {
      pacesToast.chat.error(m.saveError)
    }
  }

  // "ใช้ฉบับล่าสุด" — ทิ้งร่าง แล้วแสดงฉบับของอีกฝั่ง (ขอ GET เงียบ ๆ ด้วย poke เพื่อได้ฟิลด์ครบ)
  function takeLatest() {
    const cur = conflict?.current ?? null
    const prev = memory
    state.applyMemory(cur ? { ...(prev ?? { aiUpdatedAt: null, shared: false, previousText: null }), ...cur } : null)
    window.dispatchEvent(new Event(MEMORY_POKE_EVENT))
    exitEdit(true)
  }

  async function refreshNow() {
    if (refreshing) return
    setRefreshing(true)
    const r = await state.refresh()
    setRefreshing(false)
    if (!r.ok) {
      if (r.busy) pacesToast.chat.warning(m.refreshBusy)
      else pacesToast.chat.error(m.loadError)
      return
    }
    if (r.status === 'NONE') pacesToast.chat.info(m.refreshNone)
    else window.dispatchEvent(new Event(MEMORY_POKE_EVENT)) // UPDATED/THINKING → โหลดใหม่ (ถ้ายังคิดอยู่ hook จะ poll เอง)
  }

  const title = (
    <>
      <Icon icon="brain" className="text-default-700 shrink-0 text-base" />
      <h3 id={headingId} tabIndex={-1} className="text-default-900 mb-0 text-sm font-semibold outline-none">
        {m.title}
      </h3>
    </>
  )

  // ── loading / error: หัวข้อโชว์ทันที ไม่กระพริบ ──
  if (status === 'loading' && !data) {
    return (
      <section className="space-y-2">
        <div className="flex items-center gap-1.5">{title}</div>
        <div className="bg-default-100 h-24 animate-pulse rounded-lg" role="status" aria-label={m.loading} />
      </section>
    )
  }
  if (status === 'error' || !data || !ai) {
    return (
      <section className="space-y-2">
        <div className="flex items-center gap-1.5">{title}</div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-default-700 mb-0 text-sm">{m.loadError}</p>
          <button type="button" onClick={() => void state.reload()} className="btn border-default-300 min-h-11 shrink-0">
            <Icon icon="refresh" className="me-1" /> {m.retry}
          </button>
        </div>
      </section>
    )
  }

  const hasText = !!memory && memory.text.length > 0
  const metaKind = memoryMetaKind({ source: memory?.source ?? 'ADMIN', shared: memory?.shared === true, updating, writes })
  const infoId = `${uid}-info`
  const areaId = `${uid}-area`
  const counterId = `${uid}-counter`
  const full = draft.length >= CHAT_MEMORY_MAX

  // ตัวนับ + ข้อความเตือน — ใช้ร่วมระหว่างแก้ปกติกับตอนชนกัน (JSX ตัวแปร ไม่ใช่ component)
  const draftField = (
    <>
      <label className="sr-only" htmlFor={areaId}>
        {m.textLabel}
      </label>
      <textarea
        ref={areaRef}
        id={areaId}
        rows={6}
        maxLength={CHAT_MEMORY_MAX}
        className="form-textarea"
        placeholder={m.placeholder}
        aria-describedby={counterId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Esc ยกเลิกการแก้ และกันไม่ให้ลามไปปิด sheet ทั้งใบ (ฟังที่ document)
          if (e.key === 'Escape') {
            e.stopPropagation()
            exitEdit(true)
          }
        }}
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        {memory?.previousText ? (
          <button
            type="button"
            onClick={() => setDraft(memory.previousText ?? '')}
            aria-label={m.restorePrevLabel}
            className="text-primary hover:bg-primary/10 -ms-2 flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium"
          >
            <Icon icon="history" className="text-sm" /> {m.restorePrev}
          </button>
        ) : (
          <span />
        )}
        <span id={counterId} className={`text-xs ${draft.length >= COUNTER_WARN_AT ? 'text-warning-ink' : 'text-default-700'}`}>
          {full ? fmt(m.counterFull, { max: CHAT_MEMORY_MAX }) : fmt(m.counter, { count: draft.length, max: CHAT_MEMORY_MAX })}
        </span>
      </div>
      {pii && (
        // เตือนอ่อน ไม่บล็อกการบันทึก (OQ-M4) — role=status เพราะเปลี่ยนตามที่พิมพ์ ไม่ใช่ alert ขัดจังหวะ
        <div className="bg-warning/15 text-warning-ink mt-1 flex items-start gap-2 rounded px-3 py-2 text-xs" role="status">
          <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-sm" />
          <span>{writes ? m.piiHintAi : m.piiHintManual}</span>
        </div>
      )}
    </>
  )

  // ── EDIT / CONFLICT ──
  if (mode === 'edit') {
    if (conflict) {
      const cur = conflict.current
      return (
        <section className="space-y-3">
          <div className="flex items-center gap-1.5">{title}</div>
          <div className="bg-warning/15 text-warning-ink flex items-start gap-2 rounded px-3 py-2 text-xs" role="alert">
            <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-sm" />
            <div>
              <p className="mb-0 font-semibold">{m.conflictTitle}</p>
              {cur && (
                <p className="mb-0">
                  {fmt(cur.source === 'AI' ? m.conflictByAi : m.conflictByAdmin, { time: timeOf(cur.updatedAt) })}
                </p>
              )}
            </div>
          </div>
          <div>
            <span className="form-label">{m.conflictLatest}</span>
            <div className="bg-default-100 text-default-900 rounded-lg px-3 py-2.5 text-sm break-words whitespace-pre-wrap">
              {cur && cur.text ? cur.text : <span className="text-default-600">—</span>}
            </div>
          </div>
          <div>
            <span className="form-label">{m.conflictYours}</span>
            {draftField}
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button type="button" onClick={takeLatest} disabled={saving} className="btn border-default-300 min-h-11">
                {m.conflictUseLatest}
              </button>
              <span className="text-default-700 text-xs">{m.conflictUseLatestHint}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => void save(cur?.version ?? null)}
                disabled={saving}
                className="btn border-default-300 min-h-11 disabled:opacity-60"
              >
                <Icon icon={saving ? 'loader-2' : 'check'} className={`me-1 ${saving ? 'animate-spin' : ''}`} /> {m.conflictOverwrite}
              </button>
              <span className="text-default-700 text-xs">{m.conflictOverwriteHint}</span>
            </div>
            <button
              type="button"
              onClick={() => exitEdit(true)}
              disabled={saving}
              className="text-primary hover:bg-primary/10 -ms-2 flex min-h-11 items-center rounded-lg px-2 text-xs font-medium"
            >
              {m.conflictCancel}
            </button>
          </div>
        </section>
      )
    }

    return (
      <section className="space-y-2">
        <div className="flex items-center gap-1.5">{title}</div>
        {memory?.shared && <p className="text-default-700 mb-0 text-xs">{m.sharedEditNote}</p>}
        {draftField}
        {updating && (
          <p className="text-default-700 mb-0 flex items-center gap-1.5 text-xs">
            <Icon icon="loader-2" className="shrink-0 animate-spin text-sm" /> {m.updatingWhileEditing}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => void save(editBase)}
            disabled={saving}
            className="btn bg-primary text-white hover:bg-primary-hover min-h-11 disabled:opacity-60"
          >
            <Icon icon={saving ? 'loader-2' : 'check'} className={`me-1 ${saving ? 'animate-spin' : ''}`} /> {m.save}
          </button>
          <button type="button" onClick={() => exitEdit(true)} className="btn border-default-300 min-h-11">
            {m.cancel}
          </button>
        </div>
      </section>
    )
  }

  // ── VIEW ──
  const refreshBtn =
    writes && metaKind !== 'updating' ? (
      <button
        type="button"
        onClick={() => void refreshNow()}
        disabled={refreshing}
        aria-label={m.refreshLabel}
        className="text-primary hover:bg-primary/10 flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium disabled:opacity-60"
      >
        <Icon icon={refreshing ? 'loader-2' : 'refresh'} className={`text-sm ${refreshing ? 'animate-spin' : ''}`} /> {m.refresh}
      </button>
    ) : null

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5">
        {title}
        <button
          type="button"
          onClick={() => setInfoOpen((v) => !v)}
          aria-expanded={infoOpen}
          aria-controls={infoId}
          aria-label={m.infoLabel}
          title={m.infoLabel}
          className="text-default-700 hover:bg-default-100 flex size-11 items-center justify-center rounded-full"
        >
          <Icon icon="info-circle" className="text-base" />
        </button>
        {hasText && (
          <button
            ref={pencilRef}
            type="button"
            onClick={startEdit}
            aria-label={m.edit}
            title={m.edit}
            className="text-primary hover:bg-primary/10 ms-auto -me-2 flex size-11 items-center justify-center rounded-lg"
          >
            <Icon icon="pencil" className="text-base" />
          </button>
        )}
      </div>

      {infoOpen && (
        <div id={infoId} className="bg-info/5 text-default-800 space-y-1 rounded-lg px-3 py-2 text-xs">
          <p className="mb-0">{writes ? m.infoAi1 : m.infoManual1}</p>
          <p className="mb-0">{writes ? m.infoAi2 : m.infoManual2}</p>
          <p className="mb-0">{writes ? m.infoAi3 : m.infoManual3}</p>
          <p className="mb-0">{m.infoPii}</p>
          {ai.readsProducts && <p className="mb-0">{m.infoProducts}</p>}
        </div>
      )}

      {hasText ? (
        <>
          <div className="bg-default-100 text-default-900 rounded-lg px-3 py-2.5 text-sm break-words whitespace-pre-wrap">
            <p className={`mb-0 ${shouldClampMemory(memory.text) && !expanded ? 'line-clamp-6' : ''}`}>{memory.text}</p>
          </div>
          {shouldClampMemory(memory.text) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="text-primary hover:bg-primary/10 -ms-2 flex min-h-11 items-center rounded-lg px-2 text-xs font-medium"
            >
              {expanded ? m.less : m.more}
            </button>
          )}
          {memory.shared && (
            <span className="badge bg-info/15 text-info-ink inline-flex items-center gap-1 text-xs">
              <Icon icon="users" className="text-sm" /> {m.sharedBadge}
            </span>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            {metaKind === 'updating' ? (
              <p role="status" aria-live="polite" className="text-default-700 mb-0 flex items-center gap-1.5 text-xs">
                <Icon icon="loader-2" className="shrink-0 animate-spin text-sm" /> {m.updating}
              </p>
            ) : (
              <p className="text-default-700 mb-0 flex items-center gap-1.5 text-xs">
                {metaKind === 'ai' && <Icon icon="sparkles" className="shrink-0 text-sm" />}
                {fmt(metaKind === 'ai' ? m.metaAi : m.metaAdmin, {
                  time: timeOf(metaKind === 'ai' ? (memory.aiUpdatedAt ?? memory.updatedAt) : memory.updatedAt),
                })}
              </p>
            )}
            {refreshBtn}
          </div>
        </>
      ) : metaKind === 'updating' ? (
        <p role="status" aria-live="polite" className="text-default-700 mb-0 flex items-center gap-1.5 text-xs">
          <Icon icon="loader-2" className="shrink-0 animate-spin text-sm" /> {m.updating}
        </p>
      ) : (
        <div>
          <p className="text-default-700 mb-0 text-sm">{writes ? m.emptyAi : m.emptyManual}</p>
          <button
            ref={addRef}
            type="button"
            onClick={startEdit}
            className="text-primary hover:bg-primary/10 -ms-2 flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium"
          >
            <Icon icon="plus" className="text-sm" /> {m.add}
          </button>
        </div>
      )}

      {!ai.readsMemory && (
        <p className="text-default-700 mb-0 text-xs">
          {m.notRead}{' '}
          <Link href="/settings/ai" className="text-primary font-medium">
            {m.notReadLink}
          </Link>
        </p>
      )}

      <span className="sr-only" role="status" aria-live="polite">
        {announce ? m.updatedAnnounce : ''}
      </span>
    </section>
  )
}
