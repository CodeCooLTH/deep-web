// 00095 S-7 — ตรรกะ "ตัดสินอะไรบางอย่าง" ของหน้าตั้งค่าบอทติดตาม แยกออกจาก component เพื่อให้เทสจับได้
// (convention ui-boolean-needs-a-testable-home) · pure: ห้าม import react/prisma
// ตัวตรวจ/ตัวคำนวณเวลา/ตัวหาช่องชนต้องมาจาก schemas.ts · conflicts.ts เท่านั้น — ไฟล์นี้ห้ามเขียนซ้ำ
import {
  FINAL_ACTION_DEFAULT,
  FINAL_DELAY_DEFAULT_MIN,
  SALES_FOLLOW_LIMITS as L,
  type BotStatus,
  type FinalAction,
  type ReplyHandoff,
  REPLY_HANDOFF_DEFAULT,
  type PartKind,
  type SalesStageKey,
  type SendReason,
  type SendStatus,
} from './constants'
import { MAX_RULES, type ConditionMatch, type ConditionRule, type StageOp, type TagOp } from './conditions'
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

/** เวลารอหลังตามครบ: ว่าง/ไม่ใช่จำนวนเต็มไม่ติดลบ = -1 (ตกด่าน FINAL_DELAY_INVALID) · 0 ใช้ได้ (ต่างจากเวลารอระหว่างรอบ) */
export function joinFinalDelay(value: string, unit: DelayUnit): number {
  const n = Number(value.trim())
  return value.trim() !== '' && Number.isInteger(n) && n >= 0 ? n * UNIT_MIN[unit] : -1
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
/** แถวเงื่อนไขในร่าง (uid ไว้เป็น key ของแถว — ตำแหน่งตอน hydrate ตามกติกาเดียวกับรอบ/ชิ้น) */
export type DraftRule =
  | { uid: string; field: 'stage'; op: StageOp; values: SalesStageKey[] }
  | { uid: string; field: 'tag'; op: TagOp; values: DraftTag[] }
export type BotRuleLike =
  | { field: 'stage'; op: StageOp; values: SalesStageKey[] }
  | { field: 'tag'; op: TagOp; values: DraftTag[] }

export interface Draft {
  name: string
  status: BotStatus
  testRoomIds: string[]
  conditionMatch: ConditionMatch
  rules: DraftRule[]
  channelIds: string[]
  steps: DraftStep[]
  finalAction: FinalAction
  replyHandoff: ReplyHandoff
  finalValue: string
  finalUnit: DelayUnit
}

/** รูปของบอทที่ฟอร์มต้องการ (ย่อจาก BotDto — ไม่ import service เพราะลาก server-only) */
export interface BotLike {
  name: string
  status: BotStatus
  testRoomIds: string[]
  conditionMatch: ConditionMatch
  rules: BotRuleLike[]
  channelIds: string[]
  steps: BotStep[]
  finalAction?: FinalAction
  finalDelayMin?: number
  replyHandoff?: ReplyHandoff
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
  const fin = splitDelay(bot.finalDelayMin ?? FINAL_DELAY_DEFAULT_MIN)
  return {
    finalAction: bot.finalAction ?? FINAL_ACTION_DEFAULT,
    replyHandoff: bot.replyHandoff ?? REPLY_HANDOFF_DEFAULT,
    finalValue: String(fin.value),
    finalUnit: fin.unit,
    name: bot.name,
    status: bot.status,
    testRoomIds: bot.testRoomIds,
    conditionMatch: bot.conditionMatch,
    rules: bot.rules.map((r, i) => ({ ...r, uid: `${uidPrefix(epoch)}q${i}` }) as DraftRule),
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
  return { name: '', status: 'CLOSED', testRoomIds: [], conditionMatch: 'ALL', rules: [], channelIds: [], steps: [step], finalAction: FINAL_ACTION_DEFAULT, replyHandoff: REPLY_HANDOFF_DEFAULT, finalValue: '1', finalUnit: 'DAY' }
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

/** คีย์ถ้อยคำของ action ท้ายสุด (ใช้ในฟอร์ม/ตัวอย่าง/ตาราง) */
export const FINAL_KEY = { NONE: 'finalNone', RESOLVE: 'finalResolve', HIDE: 'finalHide', SPAM: 'finalSpam' } as const satisfies Record<FinalAction, string>

/** คีย์ถ้อยคำของปลายทางส่งต่อเมื่อลูกค้าตอบ (FR-FA-7) */
export const REPLY_HANDOFF_KEY = { ADMIN: 'replyHandoffAdmin', META_AI: 'replyHandoffMetaAi' } as const satisfies Record<ReplyHandoff, string>

/** เวลารอหลังตามครบของร่าง (นาที) — ไม่ถูกต้อง = 0 เพื่อแสดงผลเท่านั้น (ตัวตรวจจริงอยู่ที่ validateBotFields) */
export const finalDelayOf = (d: Draft): number => Math.max(0, joinFinalDelay(d.finalValue, d.finalUnit))

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
    conditionMatch: d.conditionMatch,
    rules: d.rules.map((r): ConditionRule => (r.field === 'stage' ? { field: 'stage', op: r.op, values: r.values } : { field: 'tag', op: r.op, values: r.values.map((x) => x.name) })),
    channelIds: d.channelIds,
    steps: stepsOf(d),
    finalAction: d.finalAction,
    replyHandoff: d.replyHandoff,
    finalDelayMin: joinFinalDelay(d.finalValue, d.finalUnit),
  }
}

type FieldKey = 'name' | 'conditionMatch' | 'rules' | 'channelIds' | 'steps' | 'finalAction' | 'finalDelayMin' | 'replyHandoff'
const FIELD_KEYS: readonly FieldKey[] = ['name', 'conditionMatch', 'rules', 'channelIds', 'steps', 'finalAction', 'finalDelayMin', 'replyHandoff']

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
  conditionMatch: ConditionMatch
  rules: BotRuleLike[]
}

/** กฎของร่าง/บอทในรูปที่ตัวประเมินใช้ (ชื่อแท็กเทียบด้วย key เดียวกัน — แท็กที่ถูกลบไม่ตัดออก: conflicts ดูแค่ชุดสถานะ) */
const ruleKeys = (r: BotRuleLike): ConditionRule => (r.field === 'stage' ? r : { field: 'tag', op: r.op, values: r.values.map((x) => x.key) })
const conditionOf = (d: Draft) => ({ conditionMatch: d.conditionMatch, rules: d.rules.map(ruleKeys) })

/** channelId → บอทที่ครองช่องนี้อยู่ (ตามสถานะการขาย/แท็กที่เลือกตอนนี้) — findChannelConflicts ตัวเดียวกับ server (AC-FB-20) */
export function channelConflictMap(
  d: Draft,
  botId: string | null,
  channelIds: readonly string[],
  others: readonly OtherBotLike[],
): Map<string, { botId: string; botName: string }> {
  const conflicts = findChannelConflicts(
    { id: botId ?? '', name: d.name, channelIds, ...conditionOf(d) },
    others.map<ConflictOther>((o) => ({
      id: o.id,
      name: o.name,
      channelIds: o.channelIds,
      conditionMatch: o.conditionMatch,
      rules: o.rules.map(ruleKeys),
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
  | { kind: 'final' }
  | { kind: 'step'; stepIndex: number }
  | { kind: 'part'; stepIndex: number; partIndex: number }

export function issueTarget(i: BotIssue): IssueTarget {
  if (i.code === 'NAME_REQUIRED' || i.code === 'NAME_TOO_LONG') return { kind: 'name' }
  if (i.code === 'NO_CONDITION' || i.code === 'RULES_COUNT' || i.code === 'RULE_VALUES' || i.code === 'RULES_TOO_BROAD') return { kind: 'condition' }
  if (i.code === 'FINAL_DELAY_INVALID') return { kind: 'final' }
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

// ───────────────────────── redesign A: สถานะส่วนของฟอร์ม · รวมช่องทางตามเพจ · แถบเวลา ─────────────────────────

export type SectionState = 'done' | 'warn' | 'todo'

/**
 * วงกลมเลขของแต่ละส่วน (1 ทักใคร · 2 ส่งทางไหน · 3 ส่งอะไร เมื่อไร · 4 เมื่อจบ) — มาจาก draftIssues ตัวเดียวกับที่ปุ่มบันทึกใช้ (ไม่เดา)
 * ผิด = todo · ผ่านแต่มีแท็กที่ถูกลบ = warn (ไม่ใช่เครื่องหมายถูก — ผู้ใช้ยังต้องตัดสินใจ) · ช่องชน = ส่วน 2 todo
 */
export function sectionStates(d: Draft, hasConflict: boolean): { who: SectionState; via: SectionState; what: SectionState; end: SectionState } {
  const kinds = new Set(draftIssues(d).map((i) => issueTarget(i).kind))
  const bad = (...k: IssueTarget['kind'][]) => k.some((x) => kinds.has(x))
  return {
    who: bad('condition') ? 'todo' : d.rules.some((r) => r.field === 'tag' && r.values.some((x) => x.missing)) ? 'warn' : 'done',
    via: bad('channels') || hasConflict ? 'todo' : 'done',
    what: bad('steps', 'step', 'part') ? 'todo' : 'done',
    end: bad('final') ? 'todo' : 'done',
  }
}

/** เอาแท็กที่ถูกลบออกจากร่าง (ปุ่ม "เอาออกจากบอท") */
export const removeGoneTags = (d: Draft): Draft => ({
  ...d,
  // แถวที่เหลือไม่มีแท็กเลยหลังเอาออก = ตัดแถวทิ้ง (แถวว่างผ่านตรวจไม่ได้)
  rules: d.rules.flatMap((r): DraftRule[] => {
    if (r.field !== 'tag') return [r]
    const values = r.values.filter((x) => !x.missing)
    return values.length > 0 ? [{ ...r, values }] : []
  }),
})

/** ชื่อแท็กที่ถูกลบในร่าง (ไม่ซ้ำ) */
export const goneTagNames = (d: Draft): string[] => [...new Set(d.rules.flatMap((r) => (r.field === 'tag' ? r.values.filter((x) => x.missing).map((x) => x.name) : [])))]

/** แถวใหม่ — สถานะ "เป็น" / แท็ก "มีข้อใดข้อหนึ่ง" ค่าว่าง */
export const emptyRule = (field: 'stage' | 'tag'): DraftRule =>
  field === 'stage' ? { uid: newUid(), field: 'stage', op: 'is', values: [] } : { uid: newUid(), field: 'tag', op: 'has_any', values: [] }

/** แถวทั้งหมดเลือกข้อเดียวกันซ้ำไม่ได้ ไม่ต้องกันที่นี่ — เพดานแถวที่ UI ปิดปุ่ม "เพิ่มเงื่อนไข" */
export const canAddRule = (d: Draft): boolean => d.rules.length < MAX_RULES

export interface ChannelGroup<C> {
  key: string
  name: string
  avatarUrl: string | null
  channels: C[]
}
/** รวมช่องทางที่เป็นเพจ/บัญชีเดียวกัน (Messenger + IG ของเพจเดียวกันชื่อเหมือนกัน) เป็นแถวเดียว · LINE แยกเสมอ · คงลำดับที่เจอก่อน */
export function groupChannelsByPage<C extends { provider: string; name: string; avatarUrl: string | null }>(list: readonly C[]): ChannelGroup<C>[] {
  const out = new Map<string, ChannelGroup<C>>()
  for (const c of list) {
    const key = `${c.provider === 'LINE' ? 'LINE' : 'META'}|${c.name.trim()}`
    const g = out.get(key)
    if (g) {
      g.channels.push(c)
      g.avatarUrl ??= c.avatarUrl
    } else out.set(key, { key, name: c.name, avatarUrl: c.avatarUrl, channels: [c] })
  }
  return [...out.values()]
}

/** ค้นหาในโมดัลเลือกช่องทาง — ตรงชื่อเพจ/handle (ไม่สนตัวพิมพ์) · คำค้นว่าง = ทั้งหมด · คืนกลุ่มที่เหลือช่องอย่างน้อย 1 */
export function filterChannelGroups<C extends { provider: string; name: string; avatarUrl: string | null; handle?: string | null }>(groups: readonly ChannelGroup<C>[], q: string): ChannelGroup<C>[] {
  const k = q.trim().toLowerCase()
  if (!k) return [...groups]
  return groups.flatMap((g) => {
    const hit = g.channels.filter((c) => `${c.name} ${c.handle ?? ''}`.toLowerCase().includes(k))
    return hit.length ? [{ ...g, channels: hit }] : []
  })
}

/** ป้ายบนพิล: "ชื่อเพจ · แพลตฟอร์ม" */
export const channelPillLabel = (name: string, platform: string): string => `${name} · ${platform}`

/** ช่องทางหนึ่งแถวอยู่สถานะไหน — ล็อก (บอทอื่นครอง · ยังไม่ได้เลือก) / เลือกแล้ว (ชนก็ยังขึ้นเลือก เพื่อให้ผู้ใช้ปลดเอง) / ไม่ได้เลือก */
export function channelRowState(a: { checked: boolean; clashed: boolean }): 'locked' | 'on' | 'off' {
  if (a.clashed && !a.checked) return 'locked'
  return a.checked ? 'on' : 'off'
}

/** เลือก Meta AI แล้วบอทมีช่อง LINE → ห้องจาก LINE ส่งต่อแอดมินแทน (Meta AI ใช้ได้เฉพาะ Messenger/IG) */
export const metaAiLineNote = (handoff: ReplyHandoff, hasLine: boolean): boolean => handoff === 'META_AI' && hasLine

/** "ไม่ทำอะไร" = ไม่มีอะไรให้รอ → ช่องเวลารอปิด (ค่ายังอยู่ในร่าง ไม่ถูกล้าง: BR-FA-6) */
export const finalWaitDisabled = (action: FinalAction): boolean => action === 'NONE'

// ───────────────────────── โหมดง่าย/ขั้นสูงของเงื่อนไข (UI เท่านั้น — ข้อมูลยังเป็น conditionMatch + conditionRules) ─────────────────────────

export interface SimpleConditions {
  stages: SalesStageKey[]
  /** แท็กที่ทำให้หยุด (= แถว has_none) */
  stopTags: DraftTag[]
}

/**
 * แทนแบบง่ายได้เมื่อ match=ALL และกฎมีแค่ ≤1 แถว "สถานะ เป็น" + ≤1 แถว "แท็ก ไม่มี" — นอกนั้น null (= ต้องใช้ขั้นสูง)
 * ไม่มีกฎเลย = แทนได้ (บอทใหม่)
 */
export function toSimpleConditions(match: ConditionMatch, rules: readonly DraftRule[]): SimpleConditions | null {
  if (match !== 'ALL') return null
  const out: SimpleConditions = { stages: [], stopTags: [] }
  let seenStage = false
  let seenTag = false
  for (const r of rules) {
    if (r.field === 'stage' && r.op === 'is' && !seenStage) {
      seenStage = true
      out.stages = [...r.values]
    } else if (r.field === 'tag' && r.op === 'has_none' && !seenTag) {
      seenTag = true
      out.stopTags = [...r.values]
    } else return null
  }
  return out
}

/** ประกอบกฎกลับจากแบบง่าย — ละแถวที่ไม่มีค่า (uid คงที่ ไม่ใช้ตัวนับ: เรียกหลัง hydrate แต่ไม่ต้องพึ่งลำดับ) */
export function fromSimpleConditions(s: SimpleConditions): { match: ConditionMatch; rules: DraftRule[] } {
  const rules: DraftRule[] = []
  if (s.stages.length > 0) rules.push({ uid: 'qs', field: 'stage', op: 'is', values: [...s.stages] })
  if (s.stopTags.length > 0) rules.push({ uid: 'qt', field: 'tag', op: 'has_none', values: [...s.stopTags] })
  return { match: 'ALL', rules }
}

/** รอบแรกที่ส่งได้เฉพาะลูกค้าจากโฆษณา — หมายเหตุ "เฉพาะโฆษณา" โชว์ครั้งเดียวที่รอบนี้ (รอบถัดไปเป็นแบบเดียวกันหมด) · -1 = ไม่มี */
export const firstAdOnlyIndex = (adOnly: readonly boolean[]): number => adOnly.findIndex(Boolean)

/** ข้อความแรกที่ไม่ว่างของรอบ — ใช้เป็นตัวอย่างในบรรทัดเดียวตอนพับ · null = ไม่มีชิ้นข้อความ */
export function draftStepPreview(step: DraftStep): string | null {
  const p = step.parts.find((x) => x.kind === 'TEXT' && x.text.trim() !== '')
  return p ? p.text.trim() : null
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

// ───────────────────────── ประโยคสรุปเงื่อนไข (FR-FA-8) ─────────────────────────

export interface SentenceWords {
  and: string
  or: string
  /** "ไม่ใช่" (สถานะ) */
  not: string
  /** "มีแท็ก" */
  hasTag: string
  /** "ไม่มีแท็ก" */
  noTag: string
}

/**
 * "ยังไม่ซื้อ และ ไม่มีแท็ก รอคีย์ออเดอร์ และ มีแท็ก สนใจ หรือ ถามราคา" — ประโยคเดียวใช้ทั้งการ์ดสรุปในฟอร์มและหน้ารายการ
 * ค่าในแถวเดียวกันเชื่อมด้วย "หรือ" (has_all ใช้ "และ") · แถวเชื่อมกันด้วย "และ"/"หรือ" ตามโหมด
 */
export function ruleSentence(rules: readonly BotRuleLike[], match: ConditionMatch, w: SentenceWords, stageLabel: (k: SalesStageKey) => string): string {
  return ruleSentenceSegments(rules, match, w, stageLabel).map((x) => x.text).join('')
}

/** ประโยคเดียวกับ ruleSentence แต่แยกชิ้น — ชื่อแท็กที่ถูกลบมี gone=true ให้ UI ทำสีเทา (ต่อชิ้นกลับได้เท่ากับ ruleSentence ทุกตัวอักษร) */
export function ruleSentenceSegments(rules: readonly BotRuleLike[], match: ConditionMatch, w: SentenceWords, stageLabel: (k: SalesStageKey) => string): { text: string; gone?: boolean }[] {
  const out: { text: string; gone?: boolean }[] = []
  const push = (text: string, gone?: boolean) => out.push(gone ? { text, gone } : { text })
  let first = true
  for (const r of rules) {
    if (r.values.length === 0) continue
    if (!first) push(` ${match === 'ALL' ? w.and : w.or} `)
    first = false
    if (r.field === 'stage') {
      push(`${r.op === 'is_not' ? `${w.not} ` : ''}${r.values.map(stageLabel).join(` ${w.or} `)}`)
      continue
    }
    push(`${r.op === 'has_none' ? w.noTag : w.hasTag} `)
    r.values.forEach((x, k) => {
      if (k > 0) push(` ${r.op === 'has_all' ? w.and : w.or} `)
      push(x.name, x.missing)
    })
  }
  return out
}

/**
 * บอทที่แท็กถูกลบจน "ไม่มีวันตรง" (has_all ที่แท็กหาย · has_any ที่แท็กหายหมด) — ALL: แถวไหนแถวหนึ่งตาย · ANY: ตายทุกแถว
 * (ตรงกับ evaluateConditions ที่ fail-closed) ใช้ขึ้นป้าย "ไม่ติดตามแชทใหม่" ในรายการ
 */
export function neverMatches(rules: readonly BotRuleLike[], match: ConditionMatch): boolean {
  const dead = (r: BotRuleLike) =>
    r.field === 'tag' && ((r.op === 'has_all' && r.values.some((x) => x.missing)) || (r.op === 'has_any' && r.values.length > 0 && r.values.every((x) => x.missing)))
  return match === 'ALL' ? rules.some(dead) : rules.length > 0 && rules.every(dead)
}

/** ตัวอักษรแรกของชื่อสำหรับวงรูปโปรไฟล์ — ข้ามเครื่องหมาย/ตัวเลขนำหน้า เช่น "[QA00095] ร้าน" → "Q" (อักษรไทยนับ) · ไม่มีตัวอักษรเลย = "?" */
export const avatarInitial = (name: string): string => name.match(/\p{L}/u)?.[0] ?? '?'
