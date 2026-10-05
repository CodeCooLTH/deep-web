'use client'

/**
 * TemplateBuilderClient — orchestrator หน้าจัดข้อความรายงาน (คลัง ┃ ข้อความ ┃ ตัวอย่าง) · feature 00070 EXT · FR-LGS-EXT-11
 *
 * Base: src/app/(paces)/seller/(fullscreen)/public-profile/builder/components/BuilderClient.tsx (DragDropContext เดียวครอบคลัง+ผืนงาน · shell ความสูง lg · handleDragEnd)
 *   + src/app/(paces)/seller/(fullscreen)/public-profile/builder/components/BuilderToolbar.tsx (toolbarExtra ≥lg + belowContent <lg · ไม่ส่ง saveFormId)
 *   + src/app/(paces)/seller/(fullscreen)/public-profile/builder/hooks/useUnsavedChangesGuard.ts
 *   + theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/Board.tsx (DragDropContext/Droppable/Draggable)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/notifications/page.tsx (toast + ปุ่ม — ผ่าน pacesToast action)
 *   + theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx (ผ่าน pacesConfirm)
 * Spec: docs/superpowers/specs/2026-10-05-line-report-message-builder-ux-spec.md
 *
 * state ก้อนเดียว = useReducer (lib/reducer.ts · pure) · บันทึกด้วยปุ่ม ไม่ autosave · boolean ตัดสินปุ่มอยู่ใน lib (primary-action/gauge-state/draft-issues)
 * 🛑 hook ทั้งหมดอยู่ก่อน JSX — ไม่มี early return (อ่านอย่างเดียวสลับด้วย prop) · ค่าที่ hook คืน (router) ไม่ใส่ทั้งก้อนใน deps
 * 🛑 การวัดเกจ (measureTemplate) ใน useMemo deps = draft เท่านั้น ผลวัดไม่เขียนกลับ draft (กันวนไม่หยุด)
 * 🛑 ไม่มี `position: fixed` ของตัวเอง (iOS) · ไม่ใส่ safe-area ซ้ำ — layout fullscreen จัดให้แล้ว
 */
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DragDropContext, type DragStart, type DragUpdate, type DropResult, type ResponderProvided } from '@hello-pangea/dnd'
import FullscreenPageHeader from '@/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader'
import { useUnsavedChangesGuard } from '@/app/(paces)/seller/(fullscreen)/public-profile/builder/hooks/useUnsavedChangesGuard'
import GroupBanner from '@/app/(paces)/seller/(dashboard)/business/line-reports/_components/detail/GroupBanner'
import type { AppShell } from '@/lib/app-shell'
import { libraryAvailability, top3Availability, type AvailabilityContext } from '@/lib/line-report/availability'
import { PENDING_GROUP_FALLBACK_NAME } from '@/lib/line-report/list-view'
import { orderWordFor } from '@/lib/line-report/order-word'
import { bannerFor, canTest, testBlockedReason, toPresenterGroup } from '@/lib/line-report/presenter'
import { METRIC_REQUIRED_HELPER } from '@/lib/line-report/settings-guards'
import { BASE_TITLE } from '@/lib/line/flex-summary-report'
import { measureTemplate } from '@/lib/line-report/template-size'
import { deriveFlags, type Block, type BlockType, type TemplateV1 } from '@/lib/line-report/template'
import { pacesConfirm, pacesConfirmAsync } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import type { GroupDetailDto } from '@/services/line-report-group.service'
import CanvasList, { CANVAS_DROPPABLE_ID } from './components/CanvasList'
import PreviewPanel from './components/PreviewPanel'
import SizeGauge from './components/SizeGauge'
import { DesktopActions, MobileActions } from './components/TemplateActionBar'
import TemplateLibrary, { LIBRARY_DROPPABLE_ID, typeOfDraggableId } from './components/TemplateLibrary'
import { blockTitle, makeBlock } from './lib/block-meta'
import { confirmProfitExposure } from './lib/confirm-profit'
import { analyzeDraft, EMPTY_TEXT_HINT, normalizeHiddenButton } from './lib/draft-issues'
import { GAUGE_COPY, gaugeState } from './lib/gauge-state'
import { getPrimaryAction } from './lib/primary-action'
import { initState, isDirty, reducer } from './lib/reducer'

const DRAG_HELP = 'กด Space เพื่อยก ใช้ลูกศรเพื่อย้าย กด Space อีกครั้งเพื่อวาง กด Esc เพื่อยกเลิก'
const REASON_ID = 'template-action-reason'

/** id บล็อกใหม่ — ไม่ใช้ crypto.randomUUID (ต้อง secure context · dev โดเมน http ใช้ไม่ได้) */
const newBlockId = () => `b${Math.random().toString(36).slice(2, 10)}`

type SaveBody = { template: TemplateV1; expectedVersion: number; confirmProfit?: boolean }

export type TemplateBuilderClientProps = {
  group: GroupDetailDto
  shell: AppShell
  lockReason: 'NEVER' | 'RENEWAL_FAILED'
  serverNowIso: string
}

export default function TemplateBuilderClient({ group, shell, lockReason, serverNowIso }: TemplateBuilderClientProps) {
  const router = useRouter()
  const [state, dispatch] = useReducer(reducer, group, (g) => initState(g.effectiveTemplate, g.templateVersion ?? 0, g.template !== null))
  const [testing, setTesting] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  // ผลจาก server ที่ผูกกับฉบับร่างก้อนนั้น (เทียบด้วย identity) — แก้ต่อแล้วหายเอง ไม่ต้องมี effect ล้าง
  const [serverNote, setServerNote] = useState<{ forDraft: TemplateV1; warnings: string[]; errors: string[] } | null>(null)

  const pg = toPresenterGroup(group)
  const paused = group.paused
  // แพ็กเกจหยุด/บอทถูกนำออก = อ่านอย่างเดียว ไม่ชวนบันทึก (AC-EXT-11-11)
  const readOnly = paused || group.status !== 'ACTIVE'
  const banner = bannerFor(pg, paused, shell, lockReason)
  const { word } = orderWordFor(group.shops)
  const name = group.groupName || PENDING_GROUP_FALLBACK_NAME
  const monthlyEnabled = group.settings.monthlyEnabled

  const ctx: AvailabilityContext = useMemo(
    () => ({ monthlyEnabled, shops: group.shops.filter((s) => s.state === 'OK').map((s) => ({ vertical: s.vertical })) }),
    [monthlyEnabled, group.shops],
  )
  const sampleShops = useMemo(() => group.shops.map((s) => ({ id: s.shopId, name: s.name, vertical: s.vertical, state: s.state })), [group.shops])
  const top3Avail = top3Availability(ctx)

  const { draft } = state
  const dirty = isDirty(state)
  const measure = useMemo(() => measureTemplate({ ...draft, blocks: draft.blocks.filter((b) => !(b.type === 'text' && b.runs.length === 0)) }), [draft])
  const hasChart = draft.blocks.some((b) => b.type === 'chart_trend' || b.type === 'chart_compare')
  const gauge = gaugeState(measure.bytes, measure.limit, hasChart)
  const issues = analyzeDraft({
    draft,
    markupById: state.markupById,
    saved: state.saved.template,
    profitConfirmed: state.profitConfirmed,
    tooLarge: gauge.blocksSave,
    tooLargeReason: GAUGE_COPY.over,
  })
  const flags = deriveFlags(draft)
  const action = getPrimaryAction({
    dirty,
    valid: issues.firstReason === null,
    invalidReason: issues.firstReason,
    saving: state.saving,
    stale: state.stale,
    readOnly,
    canTest: canTest(pg, paused, group.test.usedToday),
    testBlockedReason: testBlockedReason(pg, paused, group.test.usedToday),
    testing,
  })
  // แถวที่พับแต่มี error → แสดงที่บรรทัดสรุป (ไม่ซ่อนอยู่ในแถวที่ปิด)
  const rowErrors: Record<string, string> = { ...Object.fromEntries(issues.emptyTextIds.map((id) => [id, EMPTY_TEXT_HINT])), ...issues.textErrors }
  const note = serverNote && serverNote.forDraft === draft ? serverNote : null
  const gaugeExtra = [...(issues.metricMissing ? [METRIC_REQUIRED_HELPER] : []), ...(note?.errors ?? [])]
  const gaugeWarnings = note?.warnings ?? []

  useUnsavedChangesGuard(dirty)

  // เปิดแถวใหม่/แถวที่เพิ่งเพิ่ม → เลื่อนให้เห็น (nearest: ไม่กระโดดถ้าเห็นอยู่แล้ว)
  useEffect(() => {
    const el = state.openId ? document.getElementById(`row-${state.openId}`) : null
    if (!el) return
    // lg: เลื่อนเฉพาะคอลัมน์ที่ overflow เอง (scrollIntoView จะลาก main ของ layout ขึ้นไปบังหัวคอลัมน์) · <lg: เลื่อนหน้า
    const col = el.closest<HTMLElement>('[data-scroll-col]')
    if (col && getComputedStyle(col).overflowY !== 'visible') {
      const c = col.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      if (r.top < c.top) col.scrollTop -= c.top - r.top
      else if (r.bottom > c.bottom) col.scrollTop += r.bottom - c.bottom
    } else el.scrollIntoView({ block: 'nearest' })
  }, [state.openId])

  // ─── เพิ่ม/เอาออก/ยืนยันกำไร ───────────────────────────────────────────────────────
  async function addBlock(type: BlockType, index?: number) {
    if (readOnly || !libraryAvailability(type, state.draft, ctx).ok) return
    const block = makeBlock(type, newBlockId())
    if (type === 'profit') {
      const next = deriveFlags({ ...state.draft, blocks: [...state.draft.blocks, block] })
      if (!(await confirmProfitExposure(deriveFlags(state.draft), next, state.profitConfirmed))) return
      dispatch({ type: 'confirmProfit' })
    }
    dispatch({ type: 'add', block, index })
    setAnnouncement(`เพิ่มแล้ว: ${blockTitle(type, word)}`)
  }

  function removeBlock(id: string) {
    const index = state.draft.blocks.findIndex((b) => b.id === id)
    const block = state.draft.blocks[index]
    if (!block) return
    const markup = state.markupById[id]
    const title = blockTitle(block.type, word)
    dispatch({ type: 'remove', id })
    setAnnouncement(`เอาออกแล้ว: ${title}`)
    // ไม่มี modal — ทางถอยอยู่บน toast (AC-EXT-11-9) · ถ้าไม่ย้อนกลับ ยังเพิ่มใหม่จากคลังได้
    pacesToast.info(`เอาออกแล้ว: ${title}`, { duration: 6000, action: { label: 'ย้อนกลับ', onClick: () => dispatch({ type: 'restore', block, index, markup }) } })
  }

  async function setShopsProfit(id: string, next: boolean) {
    if (next) {
      const nextDraft: TemplateV1 = { ...state.draft, blocks: state.draft.blocks.map((b) => (b.id === id && b.type === 'shops' ? { ...b, profit: true } : b)) }
      if (!(await confirmProfitExposure(deriveFlags(state.draft), deriveFlags(nextDraft), state.profitConfirmed))) return
      dispatch({ type: 'confirmProfit' })
    }
    dispatch({ type: 'setShops', id, patch: { profit: next } })
  }

  async function confirmTypedProfit() {
    if (await confirmProfitExposure({ showProfit: false }, { showProfit: true }, false)) dispatch({ type: 'confirmProfit' })
  }

  // ─── ลาก ──────────────────────────────────────────────────────────────────────────
  const titleOfDraggable = (id: string): string => {
    const t = typeOfDraggableId(id)
    if (t) return blockTitle(t, word)
    const b = state.draft.blocks.find((x) => x.id === id)
    return b ? blockTitle(b.type, word) : 'บล็อก'
  }
  const onDragStart = (s: DragStart, p: ResponderProvided) => {
    const n = state.draft.blocks.length
    p.announce(s.source.droppableId === CANVAS_DROPPABLE_ID ? `ยก${titleOfDraggable(s.draggableId)}แล้ว ตำแหน่งที่ ${s.source.index + 1} จาก ${n}` : `ยก${titleOfDraggable(s.draggableId)}แล้ว`)
  }
  const onDragUpdate = (u: DragUpdate, p: ResponderProvided) => {
    p.announce(u.destination?.droppableId === CANVAS_DROPPABLE_ID ? `ย้าย${titleOfDraggable(u.draggableId)}ไปตำแหน่งที่ ${u.destination.index + 1}` : `${titleOfDraggable(u.draggableId)}อยู่นอกพื้นที่วาง`)
  }
  const onDragEnd = (r: DropResult, p: ResponderProvided) => {
    const { source, destination, draggableId } = r
    // ปล่อยนอกพื้นที่/กลับคลัง = ไม่ทำอะไร
    if (!destination || destination.droppableId !== CANVAS_DROPPABLE_ID) {
      p.announce('ยกเลิกการย้าย')
      return
    }
    p.announce(`วาง${titleOfDraggable(draggableId)}ที่ตำแหน่งที่ ${destination.index + 1}`)
    if (source.droppableId === CANVAS_DROPPABLE_ID) {
      if (destination.index !== source.index) dispatch({ type: 'move', from: source.index, to: destination.index })
      return
    }
    if (source.droppableId === LIBRARY_DROPPABLE_ID) {
      const t = typeOfDraggableId(draggableId)
      if (t) void addBlock(t, destination.index)
    }
  }

  // ─── บันทึก / ส่งทดสอบ / คืนมาตรฐาน / โหลดฉบับล่าสุด ─────────────────────────────────
  async function save(confirmedNow = false): Promise<void> {
    if (state.saving || action.save.disabled) return
    dispatch({ type: 'touchAll' })
    dispatch({ type: 'saveStart' })
    const sent = { template: normalizeHiddenButton(state.draft), markup: state.markupById } // snapshot ที่ส่งจริง
    if (sent.template !== state.draft) dispatch({ type: 'setButton', patch: { label: sent.template.button.label } })
    const body: SaveBody = { template: sent.template, expectedVersion: state.saved.version, ...(state.profitConfirmed || confirmedNow ? { confirmProfit: true } : {}) }
    try {
      const res = await fetch(`/api/line-report/groups/${group.id}/template`, {
        method: 'PUT',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        dispatch({ type: 'saveOk', version: data.group?.templateVersion ?? state.saved.version + 1, ...sent })
        setServerNote({ forDraft: sent.template, warnings: Array.isArray(data.warnings) ? data.warnings : [], errors: [] })
        pacesToast.info('บันทึกแล้ว รายงานรอบถัดไปจะใช้แบบนี้')
        return
      }
      dispatch({ type: 'saveFail' })
      const code: string | undefined = data.error
      if (code === 'TEMPLATE_STALE') {
        dispatch({ type: 'markStale' })
      } else if (code === 'PACKAGE_REQUIRED') {
        router.refresh()
      } else if (code === 'PROFIT_CONFIRM_REQUIRED') {
        if (!confirmedNow && (await confirmProfitExposure({ showProfit: false }, { showProfit: true }, false))) {
          dispatch({ type: 'confirmProfit' })
          dispatch({ type: 'saveFail' })
          return void save(true)
        }
      } else if (code === 'TEMPLATE_INVALID') {
        // ตาข่ายชั้นสอง (client ตรวจก่อนแล้ว) — เปิดแถวที่ผิดให้เห็น
        if (typeof data.details?.blockId === 'string') {
          dispatch({ type: 'open', id: data.details.blockId })
          dispatch({ type: 'touch', id: data.details.blockId })
        }
        pacesToast.error('บันทึกเทมเพลตไม่สำเร็จ ข้อความที่แก้ยังอยู่ในหน้านี้ ลองบันทึกอีกครั้ง')
      } else if (code === 'TEMPLATE_TOO_LARGE') {
        setServerNote({ forDraft: state.draft, warnings: [], errors: [GAUGE_COPY.over] })
      } else if (code === 'INVALID_SETTINGS' && data.details?.rule === 'METRIC_REQUIRED') {
        setServerNote({ forDraft: state.draft, warnings: [], errors: [METRIC_REQUIRED_HELPER] })
      } else {
        pacesToast.error('บันทึกเทมเพลตไม่สำเร็จ ข้อความที่แก้ยังอยู่ในหน้านี้ ลองบันทึกอีกครั้ง')
      }
    } catch {
      dispatch({ type: 'saveFail' })
      pacesToast.error('บันทึกเทมเพลตไม่สำเร็จ ข้อความที่แก้ยังอยู่ในหน้านี้ ลองบันทึกอีกครั้ง')
    }
  }

  async function sendTest() {
    if (testing || action.test.disabled) return
    setTesting(true)
    try {
      const res = await fetch(`/api/line-report/groups/${group.id}/test`, { method: 'POST', credentials: 'same-origin', cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        pacesToast.success('ส่งตัวอย่างเข้ากลุ่มแล้ว ดูได้ในกลุ่ม LINE')
        const skipped: { label: string; reason: string }[] = Array.isArray(data.skipped) ? data.skipped : []
        if (skipped.length > 0) {
          const what = skipped.length === 1 ? `ข้าม ${skipped[0].label} (${skipped[0].reason})` : `ข้าม ${skipped.length} รายการ`
          pacesToast.warning(`ส่งแล้ว แต่${what} ดูเหตุผลในประวัติของกลุ่ม`, { duration: 8000 })
        }
      } else pacesToast.error(data.message ?? 'ส่งไม่สำเร็จ ลองอีกครั้ง')
      // ส่งล้มก็นับโควตา → ให้ RSC ส่งค่าใหม่ลงมา · บอทหลุด/แพ็กเกจหมด = สถานะหน้าเปลี่ยน
      if (res.ok || res.status < 500) router.refresh()
    } catch {
      pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
    } finally {
      setTesting(false)
    }
  }

  async function resetToDefault() {
    const result = await pacesConfirmAsync({
      title: 'คืนเป็นแบบมาตรฐาน?',
      text: 'บล็อกและข้อความที่คุณจัดไว้จะถูกแทนที่ด้วยแบบมาตรฐาน ข้อความที่ส่งเข้ากลุ่มไปแล้วไม่เปลี่ยน',
      confirmButtonText: 'คืนเป็นแบบมาตรฐาน',
      cancelButtonText: 'ปิด',
      icon: 'warning',
      errorText: 'คืนเป็นแบบมาตรฐานไม่สำเร็จ ลองอีกครั้ง',
      run: async () => {
        const res = await fetch(`/api/line-report/groups/${group.id}/template`, { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        // 5xx = ยิงไม่ถึงปลายทาง → throw ให้โมดัลเปิดค้าง · 4xx = ปลายทางตอบแล้วว่าไม่ให้ → คืนผลปกติให้จัดการข้างนอก
        if (res.status >= 500) throw new Error('reset')
        return { ok: res.ok, data }
      },
    })
    if (!result) return
    if (!result.ok) {
      pacesToast.error(result.data.message ?? 'คืนเป็นแบบมาตรฐานไม่สำเร็จ ลองอีกครั้ง')
      if (result.data.error === 'PACKAGE_REQUIRED') router.refresh()
      return
    }
    const g = result.data.group as GroupDetailDto
    dispatch({ type: 'load', template: g.effectiveTemplate, version: g.templateVersion ?? 0, custom: false })
    pacesToast.info('คืนเป็นแบบมาตรฐานแล้ว')
  }

  function discard() {
    dispatch({ type: 'load', template: state.saved.template, version: state.saved.version, custom: state.saved.custom })
  }

  async function reloadLatest() {
    const ok = await pacesConfirm.warning('ทิ้งฉบับร่างและโหลดฉบับล่าสุด?', 'การแก้ในหน้านี้จะหาย และใช้เทมเพลตที่บันทึกจากที่อื่นแทน', {
      confirmButtonText: 'โหลดฉบับล่าสุด',
      cancelButtonText: 'อยู่ต่อ',
    })
    if (!ok) return
    // ดึงฉบับล่าสุดแล้วรีเซ็ต state ผ่าน reducer (ไม่ remount — ไม่ทิ้งอย่างอื่นของหน้า)
    try {
      const res = await fetch(`/api/line-report/groups/${group.id}`, { credentials: 'same-origin', cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.group) throw new Error('reload')
      const g = data.group as GroupDetailDto
      dispatch({ type: 'load', template: g.effectiveTemplate, version: g.templateVersion ?? 0, custom: g.template !== null })
    } catch {
      pacesToast.error('โหลดฉบับล่าสุดไม่สำเร็จ ลองอีกครั้ง')
    }
  }

  const visibleReason = action.save.reason ?? action.test.reason
  const barProps = {
    action,
    dirty,
    saving: state.saving,
    testing,
    hasCustom: state.saved.custom,
    view: state.view,
    onView: (v: 'canvas' | 'preview') => dispatch({ type: 'setView', view: v }),
    onSave: () => void save(),
    onTest: () => void sendTest(),
    onDiscard: discard,
    onReset: () => void resetToDefault(),
    reasonId: REASON_ID,
    reasonText: visibleReason,
  }

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="lg:flex lg:h-[calc(100dvh-4rem)] lg:flex-col lg:overflow-hidden" /* HR7 carve-out: หัก padding บน+ล่างของ (fullscreen)/layout.tsx (2rem+2rem) เท่านั้น — เหมือน public-profile/builder/BuilderClient.tsx */
    >
      {/* shrink-0: ในคอลัมน์ flex ที่สูงตายตัว header ถูกบีบจนเนื้อหาใต้มันลอยขึ้นไปซ้อน (หัวคอลัมน์ถูกบัง — critique P1-2) */}
      <div className="shrink-0">
      <FullscreenPageHeader
        title="จัดข้อความรายงาน"
        subtitle={name}
        backHref={`/business/line-reports/${group.id}`}
        isDirty={dirty}
        toolbarExtra={<DesktopActions {...barProps} />}
        belowContent={<MobileActions {...barProps} />}
      />
      </div>
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>

      <div className="mt-6 shrink-0 empty:mt-0">
        {banner && <GroupBanner banner={banner} onRebind={() => router.push(`/business/line-reports/${group.id}?rebind=1`)} />}
        {state.stale && (
          <div role="alert" className="bg-warning/15 text-warning-ink mb-base flex flex-col gap-3 rounded-lg px-4 py-3 text-sm sm:flex-row sm:items-center">
            <p className="mb-0 min-w-0 flex-1">มีการแก้เทมเพลตของกลุ่มนี้จากที่อื่น ฉบับร่างของคุณยังอยู่ในหน้านี้</p>
            <button type="button" onClick={() => void reloadLatest()} className="btn bg-primary hover:bg-primary-hover min-h-11 shrink-0 text-white lg:min-h-0">
              โหลดฉบับล่าสุด
            </button>
          </div>
        )}
      </div>

      <DragDropContext onDragStart={onDragStart} onDragUpdate={onDragUpdate} onDragEnd={onDragEnd} dragHandleUsageInstructions={DRAG_HELP}>
        {/* ระยะระหว่าง section = 24 (gap-6) ทุกขนาด · md ซ้อนกันเป็นคอลัมน์เดียว (ไม่บีบผืนงาน/พรีวิว) · lg 3 คอลัมน์ */}
        <div className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-7">
          {!readOnly && (
            <div data-scroll-col className={`${state.view === 'preview' ? 'hidden md:block' : ''} lg:w-1/4 lg:min-h-0 lg:overflow-y-auto`}>
              <TemplateLibrary draft={draft} ctx={ctx} word={word} onAdd={(t) => void addBlock(t)} />
            </div>
          )}
          <div data-scroll-col className={`${state.view === 'preview' ? 'hidden md:block' : ''} lg:min-h-0 lg:overflow-y-auto ${readOnly ? 'lg:w-7/12' : 'lg:w-5/12'}`}>
            <CanvasList
              draft={draft}
              markupById={state.markupById}
              openId={state.openId}
              touched={state.touched}
              readOnly={readOnly}
              word={word}
              ctx={ctx}
              top3Avail={top3Avail}
              titlePlaceholder={BASE_TITLE[state.previewKind]}
              profitOn={flags.showProfit}
              profitConfirmed={state.profitConfirmed}
              profitUnconfirmed={issues.profitUnconfirmed}
              rowErrors={rowErrors}
              dispatch={dispatch}
              onShopsProfit={(id, next) => void setShopsProfit(id, next)}
              onConfirmProfit={() => void confirmTypedProfit()}
              onRemove={removeBlock}
            />
            <SizeGauge gauge={gauge} extra={[...gaugeExtra, ...gaugeWarnings]} />
          </div>
          <div data-scroll-col className={`${state.view === 'canvas' ? 'hidden md:block' : ''} lg:min-h-0 lg:overflow-y-auto ${readOnly ? 'lg:w-5/12' : 'lg:w-1/3'}`}>
            <PreviewPanel
              template={draft}
              shops={sampleShops}
              kind={state.previewKind}
              onKind={(kind) => dispatch({ type: 'setPreviewKind', kind })}
              settings={group.settings}
              cycle={group.cycle ? { startIso: group.cycle.startIso, endIso: group.cycle.endIso } : null}
              serverNowIso={serverNowIso}
            />
          </div>
        </div>
      </DragDropContext>
    </form>
  )
}
