'use client'

/**
 * BotForm — ฟอร์มสร้าง/แก้บอทติดตามยอดขาย (00095 S-7 · mockup ส่วน 3, 3b)
 * redesign A: หัว (ชื่อแก้ในที่ · สถานะ · เมนู) → 4 การ์ด (เงื่อนไขการเริ่มติดตาม · ช่องทางที่ติดตาม · รอบการติดตาม · เงื่อนไขการหยุดติดตาม) วงกลมเลข = ครบ/ต้องตรวจ ตาม draftIssues
 * + คอลัมน์ขวา sticky ≥lg (สรุปบอทนี้ · ตัวอย่างแชท · แชททดสอบ) + แถบบันทึก sticky
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/page.tsx (grid lg:grid-cols-3 gap-base · การ์ดซ้าย 2/3 + ขวา 1/3)
 *   + theme: theme/paces/Admin/TS/src/app/(admin)/form/wizard/components/Steps.tsx (วงกลมเลข → เครื่องหมายถูก)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-notify/components/AutoNotifyClient.tsx (dirty · beforeunload · discard confirm · pacesToast)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-reply/[id]/KeywordEditorClient.tsx (แถบบันทึก sticky เหนือ bottom nav)
 *
 * 🛑 ตรรกะตัดสิน (dirty/PATCH diff/ล็อกสถานะ/ถามก่อนหยุดแชท/ช่องชน/ตรวจฟิลด์) อยู่ที่ src/lib/sales-follow-bot/ui.ts + schemas.ts (มีเทส) — ไฟล์นี้ต่อสายอย่างเดียว
 * 🛑 บันทึก = PATCH (ถ้าฟิลด์เปลี่ยน) แล้ว PUT status (ถ้าสถานะ/แชททดสอบเปลี่ยน) ตามลำดับ ใช้ expectedUpdatedAt ต่อเนื่อง · บอทใหม่ POST (CLOSED เสมอ)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { useRouter } from 'next/navigation'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { SALES_FOLLOW_LIMITS as L, type BotStatus } from '@/lib/sales-follow-bot/constants'
import { testRoomsProblem, type BotIssue } from '@/lib/sales-follow-bot/schemas'
import {
  buildPatch,
  channelConflictMap,
  draftIssues,
  fieldsDirty,
  fieldsOf,
  finalDelayOf,
  firstIssueTarget,
  goneTagNames,
  ruleSentence,
  FINAL_KEY,
  REPLY_HANDOFF_KEY,
  formatDuration,
  isDirty,
  groupChannelsByPage,
  isLiveIssue,
  issueTarget,
  needsActivateConfirm,
  needsStopConfirm,
  newDraft,
  sectionStates,
  statusDirty,
  statusLock,
  timelineOf,
  toDraft,
  type Draft,
  type IssueTarget,
  type QuickMessageLite,
  type SectionState,
} from '@/lib/sales-follow-bot/ui'
import type { BotDto, BotOptions, TestRoomItem } from '@/services/sales-follow-bot.service'
import ActionMenu from './ActionMenu'
import ChannelSection from './ChannelSection'
import EndSection from './EndSection'
import ChatPreview, { PreviewSheet, type PreviewChannel } from './ChatPreview'
import { issueText } from './issue-text'
import RoundsSection from './RoundsSection'
import Segmented from './Segmented'
import { useDurationWords } from './sfb-ui'
import TestRoomsCard from './TestRoomsCard'
import WhoSection from './WhoSection'

const BASE = '/settings/sales-follow-bot'
const API = '/api/shops/current/sales-follow-bot'

type Res = { status: number; body: Record<string, unknown> | null }
async function call(method: string, url: string, body?: unknown): Promise<Res> {
  try {
    const r = await fetch(url, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' })
    return { status: r.status, body: (await r.json().catch(() => null)) as Res['body'] }
  } catch {
    return { status: 0, body: null }
  }
}

/** รอบที่กางตั้งต้น: รอบแรกรอบเดียว (กางทีละรอบ — redesign A) */
const defaultOpen = (d: Draft): ReadonlySet<string> => new Set(d.steps.slice(0, 1).map((s) => s.uid))

/** วงกลมเลขของส่วน: ครบ = เครื่องหมายถูก (success) · ต้องตรวจ (แท็กถูกลบ) = warning · ยังไม่ครบ = เลข — บอกสถานะเป็นข้อความสำหรับตัวอ่านหน้าจอด้วย */
function StepMarker({ n, state }: { n: number; state: SectionState }) {
  const t = useT().salesFollowBot
  const tone = state === 'done' ? 'bg-success/15 text-success-ink' : state === 'warn' ? 'bg-warning/15 text-warning-ink' : 'bg-primary/15 text-primary-ink'
  return (
    <span className={`${tone} flex size-8 shrink-0 items-center justify-center rounded-full font-semibold`}>
      {state === 'done' ? <Icon icon="check" aria-hidden="true" /> : state === 'warn' ? <Icon icon="alert-triangle" aria-hidden="true" /> : <span aria-hidden="true">{n}</span>}
      <span className="sr-only">{state === 'done' ? t.stepDoneSr : state === 'warn' ? t.stepWarnSr : t.stepTodoSr}</span>
    </span>
  )
}

/** การ์ดของส่วนหนึ่ง: หัว = วงกลมเลข + ชื่อ + ค่าสรุปชิดขวา (มือถือเห็นค่าที่ตั้งไว้โดยไม่ต้องกางอ่าน) */
function SectionCard({ id, n, state, title, summary, children }: { id: string; n: number; state: SectionState; title: string; summary?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card min-w-0 scroll-mt-24">
      <div className="card-body">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <StepMarker n={n} state={state} />
          <h3 className="text-default-900 mt-0 text-base font-semibold">{title}</h3>
          {summary && <span className="text-default-700 ms-auto max-w-full min-w-0 truncate text-xs tabular-nums md:text-sm">{summary}</span>}
        </div>
        <div className="mt-4 min-w-0">{children}</div>
      </div>
    </section>
  )
}

export default function BotForm({ bot, bots, options, testRooms }: { bot: BotDto | null; bots: BotDto[]; options: BotOptions; testRooms: TestRoomItem[] }) {
  const t = useT().salesFollowBot
  const ta = useT().autoNotify
  const common = useT().common
  const router = useRouter()
  const words = useDurationWords()
  const isNew = bot === null

  // epoch: เพิ่มทุกครั้งที่ร่างถูกแทนทั้งก้อน (โหลดใหม่จาก props / หลังบันทึก) — uid ของรอบ/ชิ้นขึ้นต้นด้วย epoch ทำให้ตัวแก้ข้อความ (uncontrolled) remount และวาดข้อความใหม่
  const epochRef = useRef(0)
  const [original, setOriginal] = useState<Draft>(() => (bot ? toDraft(bot) : newDraft()))
  const [draft, setDraft] = useState<Draft>(original)
  const [meta, setMeta] = useState({ id: bot?.id ?? null, updatedAt: bot?.updatedAt ?? null, activeRunCount: bot?.activeRunCount ?? 0 })
  const [rooms, setRooms] = useState<TestRoomItem[]>(testRooms)
  const [open, setOpen] = useState<ReadonlySet<string>>(() => defaultOpen(original))
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverIssues, setServerIssues] = useState<BotIssue[]>([])
  const [serverMsg, setServerMsg] = useState<{ channels?: string; condition?: string; test?: string }>({})
  const [serverConflict, setServerConflict] = useState<ReadonlyMap<string, { botId: string; botName: string }> | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  // router.refresh() (โหลดของอีกคน / สิทธิ์เปลี่ยน) ส่ง props ชุดใหม่มา — รับเข้า state (ท่า prevInitial ของ AutoNotifyClient/TagsClient)
  const [prevBot, setPrevBot] = useState(bot)
  if (bot !== prevBot) {
    setPrevBot(bot)
    epochRef.current += 1
    const d = bot ? toDraft(bot, epochRef.current) : newDraft(epochRef.current)
    setOriginal(d)
    setDraft(d)
    setOpen(defaultOpen(d))
    setRooms(testRooms)
    setMeta({ id: bot?.id ?? null, updatedAt: bot?.updatedAt ?? null, activeRunCount: bot?.activeRunCount ?? 0 })
    setServerIssues([])
    setServerMsg({})
    setServerConflict(null)
  }

  const update = useCallback((fn: (d: Draft) => Draft) => {
    setDraft(fn)
    // ผล server ที่ค้างอยู่เป็นของค่าก่อนแก้ — ล้างเมื่อผู้ใช้แก้ใหม่ (ไม่ให้ข้อความแดงค้างผิดจุด)
    setServerIssues([])
    setServerMsg({})
    setServerConflict(null)
  }, [])

  const dirty = isDirty(original, draft)
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  const quickList = options.quickMessages as readonly QuickMessageLite[]
  const quick = useMemo(() => new Map(quickList.map((q) => [q.id, q])), [quickList])
  const others = useMemo(() => bots.filter((b) => b.id !== meta.id), [bots, meta.id])
  const channelById = useMemo(() => new Map(options.channels.map((c) => [c.id, c])), [options.channels])

  // ── ผลตรวจ ──
  const clientIssues = useMemo(() => draftIssues(draft), [draft])
  const issues = useMemo(() => {
    const seen = new Set<string>()
    return [...serverIssues, ...(submitted ? clientIssues : clientIssues.filter(isLiveIssue))].filter((i) => {
      const k = `${i.code}|${i.path}|${i.name ?? ''}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }, [serverIssues, clientIssues, submitted])
  const textOf = (kind: 'name' | 'condition' | 'channels'): string | null => {
    const hit = issues.find((i) => issueTarget(i).kind === kind)
    if (hit) return issueText(hit, t)
    return kind === 'name' ? null : (serverMsg[kind] ?? null)
  }
  const stepIssues = issues.filter((i) => ['steps', 'step', 'part', 'final'].includes(issueTarget(i).kind))

  const conflicts = useMemo(() => {
    const m = new Map(channelConflictMap(draft, meta.id, options.channels.map((c) => c.id), others))
    serverConflict?.forEach((v, k) => m.set(k, v))
    return m
  }, [draft, meta.id, options.channels, others, serverConflict])
  const hasConflict = draft.channelIds.some((id) => conflicts.has(id))

  const testProblem = testRoomsProblem(draft.status, draft.testRoomIds)
  const testErr = serverMsg.test ?? (submitted && testProblem ? (testProblem === 'TEST_ROOMS_REQUIRED' ? t.vTestRoomsRequired : fmt(t.vTestRoomsTooMany, { max: L.maxTestRooms })) : null)

  const lock = statusLock({ isNew, original, current: draft })
  const tl = timelineOf(draft)
  const previewChannel: PreviewChannel | null = (() => {
    const c = options.channels.find((x) => draft.channelIds.includes(x.id))
    return c ? { name: c.name, provider: c.provider, avatarUrl: c.avatarUrl } : null
  })()


  const goTo = (tg: IssueTarget) => {
    const id =
      tg.kind === 'name' ? 'sfb-name' : tg.kind === 'condition' ? 'sfb-match' : tg.kind === 'channels' ? 'sfb-ch' : tg.kind === 'part' ? `sfb-part-${tg.stepIndex}-${tg.partIndex}` : tg.kind === 'step' ? `sfb-step-${tg.stepIndex}` : tg.kind === 'final' ? 'sfb-final-wait' : 'sfb-what'
    // รอบที่ถูกพับอยู่ต้องกางก่อน ไม่งั้นช่องที่ผิดไม่อยู่ใน DOM
    if (tg.kind === 'part') {
      const uid = draft.steps[tg.stepIndex]?.uid
      if (uid) setOpen(() => new Set([uid]))
    }
    setTimeout(() => {
      const el = document.getElementById(id)
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
      ;(el?.matches('input,[contenteditable]') ? el : el?.querySelector<HTMLElement>('input,[contenteditable="true"]'))?.focus({ preventScroll: true })
    }, 60)
  }

  // ── บันทึก ──
  const failFrom = async (r: Res, retry: (updatedAt: string) => Promise<void>) => {
    const code = (r.body?.error as string | undefined) ?? ''
    if (r.status === 400 && code === 'VALIDATION_ERROR') {
      const list = (r.body?.issues as BotIssue[] | undefined) ?? []
      setServerIssues(list)
      setSubmitted(true)
      pacesToast.error(t.toastInvalid)
      const first = firstIssueTarget(list)
      if (first) goTo(first)
    } else if (r.status === 400 && code === 'CHANNEL_NOT_FOUND') {
      setServerMsg({ channels: t.vChannelNotFound })
      pacesToast.error(t.toastInvalid)
      goTo({ kind: 'channels' })
    } else if (r.status === 400 && code === 'TAG_NOT_FOUND') {
      setServerMsg({ condition: fmt(t.vTagsGone, { names: ((r.body?.names as string[] | undefined) ?? []).join(', ') }) })
      pacesToast.error(t.toastInvalid)
      goTo({ kind: 'condition' })
    } else if (r.status === 400 && code.startsWith('TEST_ROOM')) {
      setServerMsg({ test: code === 'TEST_ROOMS_REQUIRED' ? t.vTestRoomsRequired : code === 'TEST_ROOMS_TOO_MANY' ? fmt(t.vTestRoomsTooMany, { max: L.maxTestRooms }) : t.vTestRoomGone })
      pacesToast.error(t.toastInvalid)
    } else if (r.status === 409 && code === 'CHANNEL_CONFLICT') {
      const list = (r.body?.conflicts as { channelId: string; botId: string; botName: string }[] | undefined) ?? []
      setServerConflict(new Map(list.map((c) => [c.channelId, { botId: c.botId, botName: c.botName }])))
      setSubmitted(true)
      pacesToast.error(t.toastInvalid)
      goTo({ kind: 'channels' })
    } else if (r.status === 409 && code === 'BOT_STALE') {
      const current = r.body?.currentUpdatedAt as string | null | undefined
      const overwrite = await pacesConfirm.warning(t.staleTitle, t.staleBody, { confirmButtonText: t.staleOverwrite, cancelButtonText: t.staleReload })
      if (overwrite && current) await retry(current)
      else if (!overwrite) router.refresh()
    } else if (r.status === 403 || (r.status === 409 && (code === 'NOT_AVAILABLE_FOR_SHOP' || code === 'FEATURE_NOT_ENABLED'))) {
      pacesToast.error(t.toastNoPermission)
      router.refresh()
    } else if (r.status === 404) {
      router.refresh()
    } else {
      pacesToast.error(t.toastSaveFailed)
    }
  }

  const applySaved = (dto: BotDto, keep?: Draft) => {
    // keep = ร่างผู้ใช้คงเดิม (uid เดิม) · ไม่ keep = แทนทั้งก้อน → epoch ใหม่
    if (!keep) epochRef.current += 1
    const fresh = toDraft(dto, keep ? 0 : epochRef.current)
    // รอบที่กางอยู่คงกางต่อ — uid ของร่างใหม่มาจากตำแหน่ง จึงย้ายสถานะกางตามตำแหน่ง
    if (!keep) setOpen(new Set(draft.steps.flatMap((s, i) => (open.has(s.uid) && fresh.steps[i] ? [fresh.steps[i].uid] : []))))
    setOriginal(fresh)
    // PATCH สำเร็จแต่ PUT สถานะล้ม: ค่าที่ผู้ใช้กรอกคงอยู่ (ฟิลด์เท่ากับที่บันทึกแล้ว) เหลือแค่ส่วนสถานะที่ยังค้าง
    setDraft(keep ?? fresh)
    setMeta({ id: dto.id, updatedAt: dto.updatedAt, activeRunCount: dto.activeRunCount })
  }

  const save = async () => {
    if (saving) return
    setSubmitted(true)
    const bad = [...clientIssues]
    if (bad.length > 0 || hasConflict || testProblem) {
      pacesToast.error(t.toastInvalid)
      const first = firstIssueTarget(bad)
      if (first) goTo(first)
      else if (hasConflict) goTo({ kind: 'channels' })
      return
    }
    if (!isNew) {
      if (needsActivateConfirm(original.status, draft.status)) {
        const ok = await pacesConfirm({ icon: 'warning', confirmSemantic: 'primary', focusCancel: true, title: t.activateTitle, text: t.activateBody, confirmButtonText: t.activateOk, cancelButtonText: t.activateCancel })
        if (!ok) return
      }
      if (fieldsDirty(original, draft) && needsStopConfirm({ original, current: draft, activeRunCount: meta.activeRunCount })) {
        const ok = await pacesConfirm.warning(t.structureTitle, fmt(t.structureBody, { n: meta.activeRunCount }), { confirmButtonText: t.structureOk, cancelButtonText: t.structureCancel })
        if (!ok) return
      }
    }

    await persist()
  }

  /** ยิง API จริง — แยกจาก save เพื่อให้ "ทับด้วยของฉัน" (BOT_STALE) ยิงซ้ำด้วย updatedAt ใหม่ได้โดยไม่ถามยืนยันซ้ำ */
  const persist = async (forced?: string): Promise<void> => {
    setSaving(true)
    try {
      if (isNew) {
        const r = await call('POST', `${API}/bots`, fieldsOf(draft))
        if (r.status !== 201) return await failFrom(r, async () => undefined)
        const dto = r.body as unknown as BotDto
        applySaved(dto)
        pacesToast.success(t.toastSaved)
        router.replace(`${BASE}/${dto.id}`)
        return
      }
      let cur = forced ?? meta.updatedAt ?? ''
      let patched: BotDto | null = null
      if (fieldsDirty(original, draft)) {
        const r = await call('PATCH', `${API}/bots/${meta.id}`, { ...buildPatch(original, draft), expectedUpdatedAt: cur })
        if (r.status !== 200) return await failFrom(r, (u) => persist(u))
        patched = r.body as unknown as BotDto
        cur = patched.updatedAt
        applySaved(patched, draft)
      }
      if (statusDirty(patched ? toDraft(patched) : original, draft)) {
        const r = await call('PUT', `${API}/bots/${meta.id}/status`, {
          status: draft.status,
          ...(draft.status === 'TESTING' ? { testRoomIds: draft.testRoomIds } : {}),
          expectedUpdatedAt: cur,
        })
        if (r.status !== 200) return await failFrom(r, (u) => persist(u))
        applySaved(r.body as unknown as BotDto)
        pacesToast.success(fmt(t.toastStatus, { status: draft.status === 'ACTIVE' ? t.statusActive : draft.status === 'TESTING' ? t.statusTesting : t.statusClosed }))
      } else {
        pacesToast.success(t.toastSaved)
      }
      setSubmitted(false)
      setServerIssues([])
    } finally {
      setSaving(false)
    }
  }

  const closePreview = useCallback(() => setPreviewOpen(false), [])

  const cancel = async () => {
    if (dirty && !(await pacesConfirm.warning(ta.discardConfirmTitle, undefined, { confirmButtonText: ta.discardConfirmOk, cancelButtonText: ta.keepEditing }))) return
    router.push(BASE)
  }

  const remove = async () => {
    if (!meta.id || saving) return
    // activeRunCount/updatedAt ล่าสุดก่อนเปิดกล่อง — จำนวนที่ค้างในหน้านานแล้วทำให้ยืนยันด้วยตัวเลขผิด
    const fresh = await call('GET', `${API}/bots/${meta.id}`)
    if (fresh.status !== 200) return void (await failFrom(fresh, async () => undefined))
    const dto = fresh.body as unknown as BotDto
    const ok = await pacesConfirm.danger(fmt(t.deleteTitle, { name: dto.name }), dto.activeRunCount > 0 ? fmt(t.deleteBodyN, { n: dto.activeRunCount }) : t.deleteBody0, {
      confirmButtonText: t.deleteOk,
      cancelButtonText: t.deleteCancel,
    })
    if (!ok) return
    setSaving(true)
    try {
      const r = await call('DELETE', `${API}/bots/${meta.id}?expectedUpdatedAt=${encodeURIComponent(dto.updatedAt)}`)
      if (r.status !== 200) {
        if (r.status === 409 && r.body?.error === 'BOT_STALE') pacesToast.error(t.toastDeleteFailed)
        else await failFrom(r, async () => undefined)
        return
      }
      setOriginal(draft) // ไม่ให้ beforeunload ถามตอนออก
      pacesToast.success(t.toastDeleted)
      router.push(BASE)
    } finally {
      setSaving(false)
    }
  }

  // ── สรุปต่อส่วน (หัวการ์ด + การ์ด "สรุปบอทนี้") ──
  const states = sectionStates(draft, hasConflict)
  const handoffText = t[REPLY_HANDOFF_KEY[draft.replyHandoff]]
  const finalText = draft.finalAction !== 'NONE' ? `${formatDuration(finalDelayOf(draft), words)} → ${t[FINAL_KEY[draft.finalAction]]}` : null
  const goneCount = goneTagNames(draft).length
  const whoSummary = [ruleSentence(draft.rules, draft.conditionMatch, { and: t.andWord, or: t.orWord, not: t.sentNot, hasTag: t.sentHasTag, noTag: t.sentNoTag }, (k) => t.stageLabel[k]), goneCount > 0 ? fmt(t.tagsGoneCount, { n: goneCount }) : ''].filter(Boolean).join(' · ')
  const pages = groupChannelsByPage(draft.channelIds.flatMap((id) => channelById.get(id) ?? []))
  const roundsText = fmt(t.roundsSummary, { n: draft.steps.length, d: formatDuration(tl.total, words) })
  const endSummary = [fmt(t.endHandoffShort, { a: handoffText }), finalText].filter(Boolean).join(' · ')
  const sumRows: { label: string; href: string; text: string }[] = [
    { label: t.sumRowWho, href: '#sfb-who', text: whoSummary || t.sumWhoAll },
    { label: t.sumRowVia, href: '#sfb-via', text: pages.length === 0 ? '–' : pages.map((g) => g.name).join(', ') },
    { label: t.sumRowSend, href: '#sfb-what', text: roundsText },
    { label: t.sumRowReply, href: '#sfb-end', text: fmt(t.endHandoffShort, { a: handoffText }) },
    { label: t.sumRowNoReply, href: '#sfb-end', text: finalText ?? t.finalNone },
  ]

  const nameErr = textOf('name')
  const statusOpts: { value: BotStatus; label: string; icon?: string }[] = [
    { value: 'CLOSED', label: t.statusClosed },
    { value: 'TESTING', label: t.statusTesting, icon: 'flask' },
    { value: 'ACTIVE', label: t.statusActive },
  ]

  return (
    <>
      {/* หัวหน้าแบบเดียวกับหน้ารายการ (PageBreadcrumb) — แยกชื่อหน้า / breadcrumb / ช่องแก้ชื่อให้ชัด (ผู้ใช้ 2026-11-17) */}
      <PageBreadcrumb
        title={isNew ? t.newBotTitle : original.name || t.newBotTitle}
        homeLabel={common.home}
        trail={[{ label: t.breadcrumbSettings, href: '/settings' }, { label: t.pageTitle, href: BASE }]}
      />

      <div className="card mb-base">
        <div className="card-body flex flex-col gap-4 md:flex-row md:items-start">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <label htmlFor="sfb-name" className="text-default-800 text-sm font-medium">
                {t.nameFieldLabel}
              </label>
              <span className="text-default-700 text-xs tabular-nums">
                {Array.from(draft.name).length}/{L.maxName}
              </span>
            </div>
            <input
              id="sfb-name"
              type="text"
              value={draft.name}
              placeholder={t.namePlaceholder}
              aria-invalid={nameErr ? true : undefined}
              aria-describedby={nameErr ? 'sfb-name-err' : undefined}
              onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
              className="form-input"
            />
            {nameErr && (
              <p id="sfb-name-err" role="alert" className="text-danger-ink mt-1 flex items-start gap-1 text-xs">
                <Icon icon="alert-circle" className="mt-0.5 shrink-0" aria-hidden="true" />
                {nameErr}
              </p>
            )}
          </div>
          <div className="md:shrink-0">
            <p className="text-default-800 mb-1.5 text-sm font-medium">{t.statusFieldLabel}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 md:flex-none">
                <Segmented
                  name="sfb-status"
                  ariaLabel={t.statusAria}
                  value={draft.status}
                  options={statusOpts}
                  disabled={lock !== null}
                  onChange={(v) => update((d) => ({ ...d, status: v }))}
                  compact
                />
              </div>
              {!isNew && (
                <ActionMenu ariaLabel={t.botMenuAria} items={[{ key: 'delete', label: t.deleteBot, icon: 'trash', danger: true, onSelect: () => void remove() }]} />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="gap-base grid lg:grid-cols-3">
        <div className="gap-base grid min-w-0 grid-cols-1 lg:col-span-2">
          <SectionCard id="sfb-who" n={1} state={states.who} title={t.sectionWho} summary={whoSummary}>
            <WhoSection draft={draft} onChange={update} stages={options.stages} tags={options.tags} error={textOf('condition')} />
          </SectionCard>
          <SectionCard id="sfb-via" n={2} state={states.via} title={t.sectionVia} summary={fmt(t.channelPlatforms, { n: draft.channelIds.length })}>
            <ChannelSection
              channels={options.channels}
              selected={draft.channelIds}
              conflicts={conflicts}
              error={textOf('channels')}
              onToggle={(id, on) => update((d) => ({ ...d, channelIds: on ? [...d.channelIds, id] : d.channelIds.filter((x) => x !== id) }))}
            />
          </SectionCard>
          <SectionCard id="sfb-what" n={3} state={states.what} title={t.sectionWhat} summary={`${fmt(t.roundsCount, { n: draft.steps.length })} · ${formatDuration(tl.total, words)}`}>
            <RoundsSection draft={draft} onChange={update} open={open} setOpen={(fn) => setOpen(fn)} quick={quick} quickList={quickList} issues={stepIssues} />
          </SectionCard>
          <SectionCard id="sfb-end" n={4} state={states.end} title={t.sectionEnd} summary={endSummary}>
            <EndSection draft={draft} onChange={update} issues={stepIssues} />
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-base lg:sticky lg:top-20 lg:self-start">
          <div className="card hidden lg:block">
            <div className="card-body">
              <h3 className="text-default-900 mt-0 text-base font-semibold">{t.summaryTitle}</h3>
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                {sumRows.map((r) => (
                  <Fragment key={r.label}>
                    <dt className="text-default-700">{r.label}</dt>
                    <dd className="min-w-0">
                      <a href={r.href} className="text-primary-ink break-words font-medium hover:underline">
                        {r.text}
                      </a>
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          </div>
          <div className="hidden md:block">
            <ChatPreview draft={draft} quick={quick} channel={previewChannel} />
          </div>
          {draft.status === 'TESTING' && (
            <TestRoomsCard
              channelIds={draft.channelIds}
              selected={rooms}
              error={testErr}
              onChange={(list) => {
                setRooms(list)
                update((d) => ({ ...d, testRoomIds: list.map((r) => r.conversationId) }))
              }}
            />
          )}
        </div>
      </div>

      {/* แถบบันทึก — ระยะล่างบน <lg = 5.5rem (bottom nav 72px + 16px) + safe-area กัน SellerBottomNav ทับ (เดียวกับ KeywordEditorClient) */}
      <div className="card sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 mt-base lg:bottom-4"> {/* carve-out: safe-area ไม่มี token */}
        <div className="card-body flex flex-wrap items-center gap-2 py-3">
          <span className="text-default-700 min-w-0 flex-1 basis-full text-xs md:basis-0" aria-live="polite">
            {dirty ? t.unsaved : ''}
          </span>
          <button type="button" onClick={() => setPreviewOpen(true)} className="btn border-default-300 text-default-800 min-h-11 flex-1 border md:hidden">
            <Icon icon="eye" className="size-4" aria-hidden="true" />
            {t.previewOpen}
          </button>
          <button type="button" onClick={() => void cancel()} disabled={saving} className="btn border-default-300 text-default-800 min-h-11 flex-1 border md:flex-none lg:min-h-0">
            {common.cancel}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || (!isNew && !dirty)}
            className="btn bg-primary hover:bg-primary-hover min-h-11 flex-1 text-white disabled:opacity-50 md:flex-none lg:min-h-0"
          >
            {saving ? t.saving : common.save}
          </button>
        </div>
      </div>

      {previewOpen && <PreviewSheet draft={draft} quick={quick} channel={previewChannel} onClose={closePreview} />}
    </>
  )
}
