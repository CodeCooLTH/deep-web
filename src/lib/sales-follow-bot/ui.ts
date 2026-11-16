// 00095 S-7 — ตรรกะ "ตัดสินอะไรบางอย่าง" ของหน้าตั้งค่าบอทติดตาม แยกออกจาก component เพื่อให้เทสจับได้
// (convention ui-boolean-needs-a-testable-home) · pure: ห้าม import react/prisma
// ตัวตรวจ/ตัวคำนวณเวลา/ตัวหาช่องชนต้องมาจาก schemas.ts · conflicts.ts เท่านั้น — ไฟล์นี้ห้ามเขียนซ้ำ
import {
  SALES_FOLLOW_LIMITS as L,
  type BotStatus,
  type PartKind,
  type SalesStageKey,
  type SendReason,
  type SendStatus,
  type TagMatch,
} from './constants'
import { findChannelConflicts, type ConflictOther } from './conflicts'
import {
  buildStepBubbles,
  renderStepText,
  stepStructureKey,
  stepTimeline,
  validateBotFields,
  type BotFields,
  type BotIssue,
  type BotStep,
} from './schemas'

// ───────────────────────── เวลา ─────────────────────────

export type DelayUnit = 'MIN' | 'HOUR' | 'DAY'
export const DELAY_UNITS: readonly DelayUnit[] = ['MIN', 'HOUR', 'DAY']
export const UNIT_MIN: Record<DelayUnit, number> = { MIN: 1, HOUR: 60, DAY: 1440 }

/** นาที → (จำนวน, หน่วย) ด้วยหน่วยใหญ่สุดที่หารลงตัว — ใช้ตอนโหลดบอทเดิมเข้าฟอร์มเท่านั้น (ระหว่างพิมพ์เก็บหน่วยที่ผู้ใช้เลือกไว้) */
export function splitDelay(min: number): { value: number; unit: DelayUnit } {
  if (min > 0 && min % UNIT_MIN.DAY === 0) return { value: min / UNIT_MIN.DAY, unit: 'DAY' }
  if (min > 0 && min % UNIT_MIN.HOUR === 0) return { value: min / UNIT_MIN.HOUR, unit: 'HOUR' }
  return { value: min, unit: 'MIN' }
}

/** ช่องกรอกว่าง/ไม่ใช่จำนวนเต็มบวก = 0 (ตกด่าน STEP_DELAY_MIN ของ validateSteps) */
export function joinDelay(value: string, unit: DelayUnit): number {
  const n = Number(value.trim())
  return value.trim() !== '' && Number.isInteger(n) && n > 0 ? n * UNIT_MIN[unit] : 0
}

export interface DurationWords {
  day: string
  hour: string
  minute: string
}
/** 1,653 นาที → "1 วัน 3 ชม. 30 นาที" (ข้ามหน่วยที่เป็นศูนย์) */
export function formatDuration(min: number, w: DurationWords): string {
  const total = Math.max(0, Math.trunc(min))
  const d = Math.floor(total / 1440)
  const h = Math.floor((total % 1440) / 60)
  const m = total % 60
  const out = [d ? `${d} ${w.day}` : '', h ? `${h} ${w.hour}` : '', m ? `${m} ${w.minute}` : ''].filter(Boolean)
  return out.length ? out.join(' ') : `0 ${w.minute}`
}

// ───────────────────────── ร่างฟอร์ม ─────────────────────────

export interface DraftPart {
  /** คีย์ React/ลากเรียง — ไม่ถูกส่งขึ้น server */
  uid: string
  kind: PartKind
  text: string
  fileIds: string[]
  quickMessageId: string
}
export interface DraftStep {
  uid: string
  value: string
  unit: DelayUnit
  parts: DraftPart[]
}
export interface DraftTag {
  key: string
  name: string
  missing: boolean
}
export interface Draft {
  name: string
  status: BotStatus
  testRoomIds: string[]
  salesStatuses: SalesStageKey[]
  tags: DraftTag[]
  tagMatch: TagMatch
  channelIds: string[]
  steps: DraftStep[]
}

/** รูปของบอทที่ฟอร์มต้องการ (ย่อจาก BotDto — ไม่ import service เพราะลาก server-only) */
export interface BotLike {
  name: string
  status: BotStatus
  testRoomIds: string[]
  salesStatuses: SalesStageKey[]
  tags: DraftTag[]
  tagMatch: TagMatch
  channelIds: string[]
  steps: BotStep[]
}

/**
 * uid ของรอบ/ชิ้นที่ผู้ใช้เพิ่มเอง (หลัง hydrate เท่านั้น) — ตัวนับ module
 * 🛑 รอบ/ชิ้นที่มาจาก toDraft/newDraft ใช้ uid จากตำแหน่ง (`r0` · `r0p1`) ห้ามใช้ตัวนับ: ฟอร์มเรนเดอร์บน server แล้ว hydrate ใหม่
 * ตัวนับของสองฝั่งเดินไม่ตรงกัน → data-rfd-draggable-id ใน DOM ไม่ตรง = hydration mismatch
 */
let uidSeq = 0
export const newUid = (): string => `u${++uidSeq}`

export const emptyPart = (kind: PartKind): DraftPart => ({ uid: newUid(), kind, text: '', fileIds: [], quickMessageId: '' })
export const emptyStep = (): DraftStep => ({ uid: newUid(), value: '', unit: 'MIN', parts: [emptyPart('TEXT')] })

/** uid ของร่างที่ถูกแทนทั้งก้อน (โหลดใหม่/หลังบันทึก) ขึ้นต้นด้วย epoch — ตัวแก้ข้อความ (uncontrolled) คีย์ด้วย uid จึง remount และวาดข้อความใหม่ · epoch 0 = ไม่มีคำนำหน้า (ค่าตอน hydrate) */
const uidPrefix = (epoch: number): string => (epoch > 0 ? `e${epoch}` : '')

export function toDraft(bot: BotLike, epoch = 0): Draft {
  return {
    name: bot.name,
    status: bot.status,
    testRoomIds: bot.testRoomIds,
    salesStatuses: bot.salesStatuses,
    tags: bot.tags,
    tagMatch: bot.tagMatch,
    channelIds: bot.channelIds,
    steps: bot.steps.map((s, i) => {
      const { value, unit } = splitDelay(s.delayMin)
      return {
        uid: `${uidPrefix(epoch)}r${i}`,
        value: String(value),
        unit,
        parts: s.parts.map((p, j) => ({
          uid: `${uidPrefix(epoch)}r${i}p${j}`,
          kind: p.kind,
          text: p.kind === 'TEXT' ? p.text : '',
          fileIds: p.kind === 'IMAGES' ? p.fileIds : [],
          quickMessageId: p.kind === 'QUICK_MESSAGE' ? p.quickMessageId : '',
        })),
      }
    }),
  }
}

/** บอทใหม่: รอบแรกรอ 30 นาที ข้อความเปล่า 1 ชิ้น — ตัวอย่างในแชทมีโครงเวลาตั้งแต่เปิดฟอร์ม */
export function newDraft(epoch = 0): Draft {
  const p = uidPrefix(epoch)
  const step: DraftStep = { uid: `${p}r0`, value: '30', unit: 'MIN', parts: [{ ...emptyPart('TEXT'), uid: `${p}r0p0` }] }
  return { name: '', status: 'CLOSED', testRoomIds: [], salesStatuses: [], tags: [], tagMatch: 'ANY', channelIds: [], steps: [step] }
}

/** ต่อรูปที่อัปโหลดเสร็จเข้าชิ้นตาม uid บนร่างล่าสุด — ใช้เป็น functional updater (อัปโหลดหลายชิ้นพร้อมกัน/ผู้ใช้แก้ระหว่างรอ ห้ามอ่านค่าเก่าจาก closure) · ชิ้นถูกลบไปแล้ว = ไม่ทำอะไร */
export function appendFileIds(d: Draft, stepUid: string, partUid: string, ids: readonly string[]): Draft {
  return {
    ...d,
    steps: d.steps.map((s) =>
      s.uid !== stepUid ? s : { ...s, parts: s.parts.map((p) => (p.uid === partUid && p.kind === 'IMAGES' ? { ...p, fileIds: [...p.fileIds, ...ids].slice(0, L.maxImagesPerPart) } : p)) },
    ),
  }
}

export const stepDelayMin = (s: DraftStep): number => joinDelay(s.value, s.unit)

export function stepsOf(d: Draft): BotStep[] {
  return d.steps.map((s) => ({
    delayMin: stepDelayMin(s),
    parts: s.parts.map((p) =>
      p.kind === 'TEXT' ? { kind: 'TEXT' as const, text: p.text } : p.kind === 'IMAGES' ? { kind: 'IMAGES' as const, fileIds: p.fileIds } : { kind: 'QUICK_MESSAGE' as const, quickMessageId: p.quickMessageId },
    ),
  }))
}

/** ฟิลด์ที่ส่ง server (ชื่อแท็กรวมแท็กที่ถูกลบ — validateBotFields นับตามจำนวนที่เลือกจริง) */
export function fieldsOf(d: Draft): BotFields {
  return {
    name: d.name,
    salesStatuses: d.salesStatuses,
    tags: d.tags.map((t) => t.name),
    tagMatch: d.tagMatch,
    channelIds: d.channelIds,
    steps: stepsOf(d),
  }
}

type FieldKey = 'name' | 'salesStatuses' | 'tags' | 'tagMatch' | 'channelIds' | 'steps'
const FIELD_KEYS: readonly FieldKey[] = ['name', 'salesStatuses', 'tags', 'tagMatch', 'channelIds', 'steps']

/** PATCH ส่งเฉพาะฟิลด์ที่เปลี่ยน — แท็กที่ถูกลบแล้วไม่ถูกส่งซ้ำถ้าผู้ใช้ยังไม่แตะช่องแท็ก (ไม่งั้น server ตอบ TAG_NOT_FOUND) */
export function buildPatch(original: Draft, current: Draft): Partial<BotFields> {
  const a = fieldsOf(original)
  const b = fieldsOf(current)
  const out: Partial<BotFields> = {}
  for (const k of FIELD_KEYS) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) (out as Record<string, unknown>)[k] = b[k]
  return out
}

export const fieldsDirty = (original: Draft, current: Draft): boolean => Object.keys(buildPatch(original, current)).length > 0

/** สถานะ/ห้องทดสอบเปลี่ยน — บันทึกด้วย PUT status แยกจาก PATCH */
export function statusDirty(original: Draft, current: Draft): boolean {
  if (original.status !== current.status) return true
  return current.status === 'TESTING' && [...original.testRoomIds].sort().join() !== [...current.testRoomIds].sort().join()
}

export const isDirty = (original: Draft, current: Draft): boolean => fieldsDirty(original, current) || statusDirty(original, current)

/** ตัวเลือกสถานะล็อกเมื่อไร — บอทใหม่เริ่ม CLOSED เสมอ (AC-FB-04) · มีฟิลด์ค้างและยังไม่ได้แตะสถานะ = ให้บันทึกก่อน */
export function statusLock(a: { isNew: boolean; original: Draft; current: Draft }): 'NEW' | 'DIRTY' | null {
  if (a.isNew) return 'NEW'
  if (fieldsDirty(a.original, a.current) && !statusDirty(a.original, a.current)) return 'DIRTY'
  return null
}

export const needsActivateConfirm = (from: BotStatus, to: BotStatus): boolean => to === 'ACTIVE' && from !== 'ACTIVE'

/** แก้โครงรอบ (จำนวน/ชนิดชิ้น/ลำดับ) ขณะมีแชทที่กำลังตาม = ต้องถามก่อน (service เทียบ stepStructureKey ค่าเดียวกัน) */
export const structureChanged = (original: Draft, current: Draft): boolean => stepStructureKey(stepsOf(original)) !== stepStructureKey(stepsOf(current))
export const needsStopConfirm = (a: { original: Draft; current: Draft; activeRunCount: number }): boolean =>
  a.activeRunCount > 0 && structureChanged(a.original, a.current)

// ───────────────────────── เพิ่มรอบ/ชิ้น ─────────────────────────

export const totalDelayMin = (d: Draft): number => d.steps.reduce((n, s) => n + stepDelayMin(s), 0)
export const remainingDelayMin = (d: Draft): number => Math.max(0, L.maxTotalDelayMin - totalDelayMin(d))

/** เหตุที่ปุ่ม "เพิ่มรอบ" ใช้ไม่ได้ — null = เพิ่มได้ (รอบใหม่ต้องมีเวลาเหลืออย่างน้อย minDelayMin) */
export function addRoundBlocker(d: Draft): 'MAX_ROUNDS' | 'MAX_TOTAL' | null {
  if (d.steps.length >= L.maxSteps) return 'MAX_ROUNDS'
  if (remainingDelayMin(d) < L.minDelayMin) return 'MAX_TOTAL'
  return null
}
export const addPartBlocker = (s: DraftStep): 'MAX_PARTS' | null => (s.parts.length >= L.maxParts ? 'MAX_PARTS' : null)

/** ปุ่มเลื่อน/ลบของรายการที่เรียงได้ (รอบหรือชิ้น) — คืนเหตุผลถ้าใช้ไม่ได้ */
export function moveBlocker(index: number, count: number): { up: 'FIRST' | null; down: 'LAST' | null; remove: 'ONLY' | null } {
  return { up: index <= 0 ? 'FIRST' : null, down: index >= count - 1 ? 'LAST' : null, remove: count <= 1 ? 'ONLY' : null }
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list]
  const next = [...list]
  const [x] = next.splice(from, 1)
  next.splice(to, 0, x)
  return next
}

/** เวลาสะสมถึงรอบ i (รวมรอบนั้น) และธง adOnly — stepTimeline ตัวเดียวกับ server */
export function timelineOf(d: Draft): { cumulative: number[]; adOnly: boolean[]; total: number } {
  const delays = d.steps.map(stepDelayMin)
  const tl = stepTimeline(delays)
  let acc = 0
  return { cumulative: delays.map((x) => (acc += x)), adOnly: tl.adOnly, total: tl.totalDelayMin }
}

// ───────────────────────── ช่องทางชน ─────────────────────────

export interface ChannelOptionLike {
  id: string
}
export interface OtherBotLike {
  id: string
  name: string
  status: string
  channelIds: string[]
  salesStatuses: string[]
  tags: { missing: boolean }[]
}

/** channelId → บอทที่ครองช่องนี้อยู่ (ตามสถานะการขาย/แท็กที่เลือกตอนนี้) — findChannelConflicts ตัวเดียวกับ server (AC-FB-20) */
export function channelConflictMap(
  d: Draft,
  botId: string | null,
  channelIds: readonly string[],
  others: readonly OtherBotLike[],
): Map<string, { botId: string; botName: string }> {
  const conflicts = findChannelConflicts(
    { id: botId ?? '', name: d.name, channelIds, salesStatuses: d.salesStatuses, usableTagCount: d.tags.filter((t) => !t.missing).length },
    others.map<ConflictOther>((o) => ({
      id: o.id,
      name: o.name,
      channelIds: o.channelIds,
      salesStatuses: o.salesStatuses,
      usableTagCount: o.tags.filter((t) => !t.missing).length,
      status: o.status,
      deletedAt: null,
    })),
  )
  const m = new Map<string, { botId: string; botName: string }>()
  for (const c of conflicts) if (!m.has(c.channelId)) m.set(c.channelId, { botId: c.botId, botName: c.botName })
  return m
}

// ───────────────────────── ผลตรวจ → จุดที่ต้องชี้ ─────────────────────────

export type IssueTarget =
  | { kind: 'name' }
  | { kind: 'condition' }
  | { kind: 'channels' }
  | { kind: 'steps' }
  | { kind: 'step'; stepIndex: number }
  | { kind: 'part'; stepIndex: number; partIndex: number }

export function issueTarget(i: BotIssue): IssueTarget {
  if (i.code === 'NAME_REQUIRED' || i.code === 'NAME_TOO_LONG') return { kind: 'name' }
  if (i.code === 'NO_CONDITION' || i.code === 'TOO_MANY_TAGS') return { kind: 'condition' }
  if (i.code === 'CHANNELS_REQUIRED' || i.code === 'TOO_MANY_CHANNELS') return { kind: 'channels' }
  if (i.stepIndex !== undefined && i.partIndex !== undefined) return { kind: 'part', stepIndex: i.stepIndex, partIndex: i.partIndex }
  if (i.stepIndex !== undefined) return { kind: 'step', stepIndex: i.stepIndex }
  return { kind: 'steps' }
}

/** ผิดที่ผู้ใช้ควรเห็นทันทีระหว่างพิมพ์ (ไม่รอกดบันทึก) — ที่เหลือโชว์หลังกดบันทึกครั้งแรก */
export const isLiveIssue = (i: BotIssue): boolean => i.code === 'UNKNOWN_VARIABLE' || i.code === 'PART_TEXT_TOO_LONG' || i.code === 'NAME_TOO_LONG'

export function draftIssues(d: Draft): BotIssue[] {
  return validateBotFields(fieldsOf(d))
}

/** id ของจุดที่ผิดแรกสุด (ลำดับตามหน้า) สำหรับเลื่อนไปหา · null = ไม่มี */
export function firstIssueTarget(issues: readonly BotIssue[]): IssueTarget | null {
  const rank = (t: IssueTarget) => (t.kind === 'name' ? 0 : t.kind === 'condition' ? 1 : t.kind === 'channels' ? 2 : 3)
  const sorted = [...issues].map(issueTarget).sort((a, b) => {
    const r = rank(a) - rank(b)
    if (r !== 0) return r
    const sa = 'stepIndex' in a ? a.stepIndex : -1
    const sb = 'stepIndex' in b ? b.stepIndex : -1
    if (sa !== sb) return sa - sb
    return ('partIndex' in a ? a.partIndex : -1) - ('partIndex' in b ? b.partIndex : -1)
  })
  return sorted[0] ?? null
}

// ───────────────────────── รายการ/ประวัติ ─────────────────────────

/** ตัดรายการยาวเป็น "แสดง max ตัว + เหลืออีก N" */
export function limitList<T>(items: readonly T[], max: number): { shown: T[]; rest: number } {
  return { shown: items.slice(0, max), rest: Math.max(0, items.length - max) }
}

/** บรรทัดตัวอย่างข้อความในแถวบอท: ข้อความแรกที่ส่งได้ของรอบแรก แทน {ชื่อ} ด้วยชื่อตัวอย่าง · ไม่มีชิ้นข้อความ = null */
export function firstTextPreview(steps: readonly BotStep[], sampleName: string): string | null {
  const first = steps[0]
  if (!first) return null
  for (const p of first.parts) {
    if (p.kind !== 'TEXT') continue
    const text = renderStepText(p.text, sampleName)
    if (text) return text
  }
  return null
}

export type ResultTone = 'ok' | 'warn' | 'err' | 'idle'
export type ResultKey = 'sent' | 'skipped' | 'failed' | 'sending' | 'uncertain'
/** ผลการส่ง → (โทนสี, คำ): เขียวเฉพาะ SENT · ไม่แน่ใจว่าส่งถึง = warning ไม่ใช่ danger (Q11) */
export function sendOutcome(status: SendStatus, reason: SendReason | null): { tone: ResultTone; key: ResultKey } {
  if (reason === 'UNCERTAIN_SEND') return { tone: 'warn', key: 'uncertain' }
  if (status === 'SENT') return { tone: 'ok', key: 'sent' }
  if (status === 'SKIPPED') return { tone: 'warn', key: 'skipped' }
  if (status === 'FAILED') return { tone: 'err', key: 'failed' }
  return { tone: 'idle', key: 'sending' }
}

// ───────────────────────── ตัวอย่างในแชท ─────────────────────────

export interface QuickMessageLite {
  id: string
  title: string
  bodyPreview: string
  thumbUrl: string | null
  imageCount: number
}
export type PreviewBubble =
  | { type: 'TEXT'; text: string }
  | { type: 'IMAGES'; fileIds: string[] }
  | { type: 'QUICK'; text: string; thumbUrl: string | null; imageCount: number }
  | { type: 'GONE' }
export interface PreviewRound {
  index: number
  cumulativeMin: number
  delayMin: number
  adOnly: boolean
  /** ไม่มีฟองให้ส่งเลย (ยังไม่พิมพ์) — โชว์ฟองเทาจาง */
  empty: boolean
  bubbles: PreviewBubble[]
}

/** ตัวอย่างทุกฟองของทุกรอบ — buildStepBubbles ตัวเดียวกับตัวส่งจริง (TC-082) · QM ที่ถูกลบ = ข้ามชิ้น (TFR-FB-25) */
export function previewRounds(d: Draft, quick: ReadonlyMap<string, QuickMessageLite>, sampleName: string): PreviewRound[] {
  const tl = timelineOf(d)
  const steps = stepsOf(d)
  return steps.map((st, i) => {
    const r = buildStepBubbles(st, sampleName)
    const bubbles: PreviewBubble[] = r.ok
      ? r.bubbles.map((b): PreviewBubble => {
          if (b.type === 'TEXT') return { type: 'TEXT', text: b.text }
          if (b.type === 'IMAGES') return { type: 'IMAGES', fileIds: b.fileIds }
          const q = quick.get(b.quickMessageId)
          return q ? { type: 'QUICK', text: q.bodyPreview, thumbUrl: q.thumbUrl, imageCount: q.imageCount } : { type: 'GONE' }
        })
      : []
    const real = bubbles.filter((b) => b.type !== 'GONE')
    return { index: i, cumulativeMin: tl.cumulative[i], delayMin: st.delayMin, adOnly: tl.adOnly[i], empty: real.length === 0, bubbles }
  })
}
