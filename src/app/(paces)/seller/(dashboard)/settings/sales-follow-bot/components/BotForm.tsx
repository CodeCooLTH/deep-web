'use client'

/**
 * BotForm — ฟอร์มสร้าง/แก้บอทติดตามยอดขาย (00095 S-7 · mockup ส่วน 3, 3b)
 * หัว (ชื่อแก้ในที่ · สถานะ · เมนู) → แถบสรุปเป็นประโยค → 3 ส่วนเรียงตามรางเส้นประ (ทักใคร · ส่งทางไหน · ส่งอะไร เมื่อไร) + ตัวอย่าง/แชททดสอบฝั่งขวา + แถบบันทึก sticky
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/page.tsx (grid lg:grid-cols-3 gap-base · การ์ดซ้าย 2/3 + ขวา 1/3)
 *   + theme: .../pages/timeline/page.tsx (วงกลมเลข + รางเส้นประ — ตัดคอลัมน์เวลาซ้าย)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-notify/components/AutoNotifyClient.tsx (dirty · beforeunload · discard confirm · pacesToast)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-reply/[id]/KeywordEditorClient.tsx (แถบบันทึก sticky เหนือ bottom nav)
 *
 * 🛑 ตรรกะตัดสิน (dirty/PATCH diff/ล็อกสถานะ/ถามก่อนหยุดแชท/ช่องชน/ตรวจฟิลด์) อยู่ที่ src/lib/sales-follow-bot/ui.ts + schemas.ts (มีเทส) — ไฟล์นี้ต่อสายอย่างเดียว
 * 🛑 บันทึก = PATCH (ถ้าฟิลด์เปลี่ยน) แล้ว PUT status (ถ้าสถานะ/แชททดสอบเปลี่ยน) ตามลำดับ ใช้ expectedUpdatedAt ต่อเนื่อง · บอทใหม่ POST (CLOSED เสมอ)
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { SALES_FOLLOW_LIMITS as L, type BotStatus, type SalesStageKey } from '@/lib/sales-follow-bot/constants'
import { testRoomsProblem, type BotIssue } from '@/lib/sales-follow-bot/schemas'
import {
  buildPatch,
  channelConflictMap,
  draftIssues,
  fieldsDirty,
  fieldsOf,
  firstIssueTarget,
  formatDuration,
  isDirty,
  isLiveIssue,
  issueTarget,
  needsActivateConfirm,
  needsStopConfirm,
  newDraft,
  statusDirty,
  statusLock,
  timelineOf,
  toDraft,
  type Draft,
  type IssueTarget,
  type QuickMessageLite,
} from '@/lib/sales-follow-bot/ui'
import type { BotDto, BotOptions, TestRoomItem } from '@/services/sales-follow-bot.service'
import ActionMenu from './ActionMenu'
import ChannelSection from './ChannelSection'
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

/** รอบที่กางตั้งต้น: ≤3 รอบกางหมด · มากกว่านั้นกางรอบแรกรอบเดียว (ไม่ให้หน้ายาวเกินไปตั้งแต่เปิด) */
const defaultOpen = (d: Draft): ReadonlySet<string> => new Set(d.steps.length <= 3 ? d.steps.map((s) => s.uid) : d.steps.slice(0, 1).map((s) => s.uid))

/** ส่วนของฟอร์ม: วงกลมเลข + รางเส้นประเชื่อมส่วนถัดไป (เดสก์ท็อป) · มือถือ = เลขข้างหัวข้อ เนื้อหาเต็มกว้าง */
function FormSection({ id, n, title, last, children }: { id: string; n: number; title: string; last?: boolean; children: React.ReactNode }) {
  const dot = 'bg-primary/15 text-primary-ink relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full font-semibold'
  return (
    <section id={id} className="border-default-300 relative scroll-mt-24 max-md:border-t max-md:border-dashed max-md:pt-5 max-md:first:border-t-0 max-md:first:pt-0 md:flex md:gap-4">
      <div className={`relative hidden shrink-0 md:block ${last ? '' : 'after:border-default-300 after:absolute after:start-1/2 after:top-9 after:bottom-0 after:border-s after:border-dashed'}`}>
        <span className={dot} aria-hidden="true">{n}</span>
      </div>
      <div className={`min-w-0 flex-1 ${last ? '' : 'pb-8'}`}>
        <h3 className="text-default-900 mt-0 flex min-h-8 items-center gap-3 text-base font-semibold">
          <span className={`${dot} md:hidden`} aria-hidden="true">{n}</span>
          {title}
        </h3>
        {children}
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
  const stepIssues = issues.filter((i) => ['steps', 'step', 'part'].includes(issueTarget(i).kind))

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

  const stageText = (keys: readonly SalesStageKey[]) => keys.map((k) => t.stageLabel[k]).join(` ${t.orWord} `)

  const goTo = (tg: IssueTarget) => {
    const id =
      tg.kind === 'name' ? 'sfb-name' : tg.kind === 'condition' ? 'sfb-stage' : tg.kind === 'channels' ? 'sfb-ch' : tg.kind === 'part' ? `sfb-part-${tg.stepIndex}-${tg.partIndex}` : tg.kind === 'step' ? `sfb-step-${tg.stepIndex}` : 'sfb-sec-what'
    // รอบที่ถูกพับอยู่ต้องกางก่อน ไม่งั้นช่องที่ผิดไม่อยู่ใน DOM
    if (tg.kind === 'part') {
      const uid = draft.steps[tg.stepIndex]?.uid
      if (uid) setOpen((s) => new Set(s).add(uid))
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

  // ── ประโยคสรุป ──
  const named = draft.channelIds.map((id) => channelById.get(id)?.name).filter((x): x is string => !!x)
  const tagNames = draft.tags.filter((x) => !x.missing).map((x) => x.name)
  // ฟังก์ชันคืน element (ไม่ใช่ component ประกาศในตัว render — convention component-declared-in-render)
  const sumLink = (href: string, text: string) => (
    <a href={href} className="text-primary-ink decoration-default-400 font-semibold underline decoration-dotted underline-offset-4">
      {text}
    </a>
  )
  const empty = draft.salesStatuses.length === 0 && tagNames.length === 0 && named.length === 0

  const nameErr = textOf('name')
  const statusNote = draft.status === 'TESTING' ? t.statusDescTesting : draft.status === 'ACTIVE' ? t.statusDescActive : t.statusDescClosed
  const statusOpts: { value: BotStatus; label: string; icon?: string }[] = [
    { value: 'CLOSED', label: t.statusClosed },
    { value: 'TESTING', label: t.statusTesting, icon: 'flask' },
    { value: 'ACTIVE', label: t.statusActive },
  ]

  return (
    <>
      <div className="mb-base">
        <nav aria-label={t.breadcrumbAria} className="text-default-600 flex flex-wrap items-center gap-1 text-xs">
          <Link href="/settings" className="inline-flex min-h-11 items-center lg:min-h-0">{t.breadcrumbSettings}</Link>
          <Icon icon="chevron-right" aria-hidden="true" />
          <Link href={BASE} className="inline-flex min-h-11 items-center lg:min-h-0">{t.pageTitle}</Link>
          <Icon icon="chevron-right" aria-hidden="true" />
          <span aria-current="page" className="text-default-800">{isNew ? t.newBotTitle : original.name || t.newBotTitle}</span>
        </nav>

        <div className="mt-1.5 flex flex-col gap-3 md:flex-row md:items-center">
          <label className="group hover:bg-default-200 focus-within:bg-card focus-within:ring-default-500 relative -ms-2 flex min-h-11 min-w-0 flex-1 cursor-text items-center gap-2 rounded px-2 focus-within:ring-1">
            <span className="sr-only">{fmt(t.nameLabel, { max: L.maxName })}</span>
            <input
              id="sfb-name"
              type="text"
              value={draft.name}
              placeholder={t.namePlaceholder}
              aria-invalid={nameErr ? true : undefined}
              aria-describedby={nameErr ? 'sfb-name-err' : undefined}
              onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
              className="text-default-900 placeholder:text-default-400 min-w-0 flex-1 truncate bg-transparent text-xl font-semibold outline-none"
            />
            <Icon icon="pencil" className="text-default-400 group-focus-within:hidden" aria-hidden="true" />
            <span className="text-default-600 ms-auto hidden text-xs tabular-nums group-focus-within:inline">
              {Array.from(draft.name).length}/{L.maxName}
            </span>
          </label>
          <div className="flex items-center gap-2 md:shrink-0">
            <div className="flex-1 md:flex-none">
              <Segmented
                name="sfb-status"
                ariaLabel={t.statusAria}
                value={draft.status}
                options={statusOpts}
                disabled={lock !== null}
                describedBy="sfb-status-note"
                onChange={(v) => update((d) => ({ ...d, status: v }))}
                compact
              />
            </div>
            {!isNew && (
              <ActionMenu ariaLabel={t.botMenuAria} items={[{ key: 'delete', label: t.deleteBot, icon: 'trash', danger: true, onSelect: () => void remove() }]} />
            )}
          </div>
        </div>
        {nameErr && (
          <p id="sfb-name-err" role="alert" className="text-danger-ink mt-1 flex items-start gap-1 text-xs">
            <Icon icon="alert-circle" className="mt-0.5 shrink-0" aria-hidden="true" />
            {nameErr}
          </p>
        )}
        <p id="sfb-status-note" className="text-default-700 mt-1 text-sm">
          {statusNote}{' '}
          {lock && (
            <span className="text-default-600 inline-flex items-center gap-1 text-xs">
              <Icon icon="lock" aria-hidden="true" />
              {lock === 'NEW' ? t.statusLockedNew : t.statusLockedDirty}
            </span>
          )}
        </p>
      </div>

      <div className="bg-light text-default-800 mb-base flex items-start gap-3 rounded-lg px-4 py-3.5 text-base leading-loose" aria-label={t.sumAria} role="group">
        <Icon icon="target-arrow" className="text-primary mt-1.5 shrink-0 text-xl" aria-hidden="true" />
        {empty ? (
          <p className="text-default-700">{t.sumEmpty}</p>
        ) : (
          <p>
            {t.sumTap}{' '}
            {draft.salesStatuses.length > 0 ? (
              <>
                {t.sumCustomersWho} {sumLink('#sfb-sec-who', stageText(draft.salesStatuses))}
              </>
            ) : tagNames.length === 0 ? (
              sumLink('#sfb-sec-who', t.sumCustomersAll)
            ) : null}
            {tagNames.length > 0 && (
              <>
                {draft.salesStatuses.length > 0 ? ` ${t.sumTagged} ` : `${t.sumTaggedOnly} `}
                {sumLink('#sfb-sec-who', tagNames.join(` ${draft.tagMatch === 'ALL' ? t.andWord : t.orWord} `))}
              </>
            )}
            {named.length > 0 && (
              <>
                {' '}
                {t.sumVia} {sumLink('#sfb-sec-via', named.join(', '))}
              </>
            )}{' '}
            {t.sumTotal} {sumLink('#sfb-sec-what', fmt(t.roundsCount, { n: draft.steps.length }))} {t.sumWithin} {sumLink('#sfb-sec-what', formatDuration(tl.total, words))}
          </p>
        )}
      </div>

      <div className="gap-base grid lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <div className="card">
            <div className="card-body">
              <FormSection id="sfb-sec-who" n={1} title={t.sectionWho}>
                <div className="mt-3">
                  <WhoSection draft={draft} onChange={update} stages={options.stages} tags={options.tags} error={textOf('condition')} />
                </div>
              </FormSection>
              <FormSection id="sfb-sec-via" n={2} title={t.sectionVia}>
                <div className="mt-1">
                  <ChannelSection
                    channels={options.channels}
                    selected={draft.channelIds}
                    conflicts={conflicts}
                    error={textOf('channels')}
                    onToggle={(id, on) => update((d) => ({ ...d, channelIds: on ? [...d.channelIds, id] : d.channelIds.filter((x) => x !== id) }))}
                  />
                </div>
              </FormSection>
              <FormSection id="sfb-sec-what" n={3} title={t.sectionWhat} last>
                <RoundsSection draft={draft} onChange={update} open={open} setOpen={(fn) => setOpen(fn)} quick={quick} quickList={quickList} issues={stepIssues} />
              </FormSection>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-base lg:sticky lg:top-20 lg:self-start">
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
