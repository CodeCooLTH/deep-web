// 00095 TFR-FB-04 — Valibot + validateSteps + ตัวแปรข้อความ (ใช้ทั้ง client และ server → ห้าม import ของที่ลาก node:crypto
// เช่น shop-tag-match; การแปลงชื่อแท็ก→tagKeys ทำที่ service)
// ตัวเลขทั้งหมดมาจาก constants.ts ที่เดียว (TC-107)
import * as v from 'valibot'
import { countCodePoints, hasLoneSurrogate, parseTemplate } from '../auto-notify/variables'
import {
  ALLOWED_VARIABLES,
  BOT_STATUSES,
  FINAL_ACTIONS,
  FINAL_DELAY_MAX_MIN,
  type FinalAction,
  PART_KINDS,
  SALES_FOLLOW_LIMITS as L,
  SALES_STAGE_KEYS,
  TAG_MATCHES,
  type BotStatus,
  type PartKind,
} from './constants'

export type BotIssueCode =
  | 'NAME_REQUIRED'
  | 'NAME_TOO_LONG'
  | 'NO_CONDITION'
  | 'STEPS_COUNT'
  | 'STEP_DELAY_MIN'
  | 'STEPS_TOTAL_TOO_LONG'
  | 'PARTS_COUNT'
  | 'PART_KIND_INVALID'
  | 'PART_TEXT_REQUIRED'
  | 'PART_TEXT_TOO_LONG'
  | 'PART_TEXT_INVALID'
  | 'PART_IMAGES_COUNT'
  | 'PART_IMAGE_NOT_FOUND'
  | 'QUICK_MESSAGE_REQUIRED'
  | 'UNKNOWN_VARIABLE'
  | 'TOO_MANY_TAGS'
  | 'TOO_MANY_CHANNELS'
  | 'FINAL_DELAY_INVALID'
  | 'CHANNELS_REQUIRED'
  | 'INVALID_BODY'

export interface BotIssue {
  code: BotIssueCode
  path: string
  stepIndex?: number
  /** ชิ้นที่ผิดในรอบนั้น (issue ระดับชิ้น) */
  partIndex?: number
  /** ชื่อตัวแปรที่ไม่รู้จัก (UNKNOWN_VARIABLE) */
  name?: string
}

/** ชิ้นในรอบ — quick message เก็บแค่ id (service เติมเนื้อหา ณ ตอนส่ง · ต้องเป็นของร้านตอนบันทึก) */
export type BotPart =
  | { kind: 'TEXT'; text: string }
  | { kind: 'IMAGES'; fileIds: string[] }
  | { kind: 'QUICK_MESSAGE'; quickMessageId: string }

export interface BotStep {
  delayMin: number
  parts: BotPart[]
}

export interface BotFields {
  name: string
  salesStatuses: string[]
  /** ชื่อแท็ก (ยังไม่แปลงเป็น tagKeys) */
  tags: string[]
  tagMatch: 'ANY' | 'ALL'
  channelIds: string[]
  steps: BotStep[]
  /** ส่วนต่อขยาย: ไม่ส่ง = NONE/1 วัน (create) หรือค่าเดิมของบอท (patch) */
  finalAction?: FinalAction
  finalDelayMin?: number
}

// ── โครงชนิดข้อมูล (Valibot) — `adOnly` ที่ client ส่งมาถูกทิ้งเพราะ v.object ไม่เก็บคีย์เกิน (คำนวณฝั่งเซิร์ฟเวอร์เท่านั้น) ──
/** id ไฟล์/ข้อความสำเร็จรูปยาวเกิน 120 = ไม่ใช่ของจริงแน่ (uuid คีย์ + path ≈ 50) — กัน payload บวม/jsonb ขยะ */
const ID_MAX = L.maxIdLength
const idString = v.pipe(v.string(), v.maxLength(ID_MAX))
const PartSchema = v.variant('kind', [
  v.object({ kind: v.literal('TEXT'), text: v.string() }),
  v.object({ kind: v.literal('IMAGES'), fileIds: v.array(idString) }),
  v.object({ kind: v.literal('QUICK_MESSAGE'), quickMessageId: idString }),
])
const StepSchema = v.object({
  delayMin: v.number(),
  parts: v.array(PartSchema),
})
const uuid = v.pipe(v.string(), v.uuid())
const iso = v.pipe(v.string(), v.isoTimestamp())

const fieldEntries = {
  name: v.string(),
  salesStatuses: v.array(v.picklist(SALES_STAGE_KEYS)),
  tags: v.array(v.string()),
  tagMatch: v.picklist(TAG_MATCHES),
  channelIds: v.array(uuid),
  steps: v.array(StepSchema),
  finalAction: v.picklist(FINAL_ACTIONS),
  // ชนิดผิด/ไม่ใช่จำนวนเต็ม = INVALID แบบเดียวกับ delayMin · ช่วง 0..7 วันตรวจใน validateBotFields (รหัสเดียวกัน)
  finalDelayMin: v.number(),
}

/** POST สร้างบอท — ไม่รับ status (บอทใหม่ CLOSED เสมอ AC-FB-04) */
export const CreateBotSchema = v.object({
  name: fieldEntries.name,
  salesStatuses: v.optional(fieldEntries.salesStatuses, []),
  tags: v.optional(fieldEntries.tags, []),
  tagMatch: v.optional(fieldEntries.tagMatch, 'ANY'),
  channelIds: fieldEntries.channelIds,
  steps: fieldEntries.steps,
  finalAction: v.optional(fieldEntries.finalAction),
  finalDelayMin: v.optional(fieldEntries.finalDelayMin),
})

/** PATCH — ส่งเฉพาะที่แก้ · ผลรวมกับบอทเดิมต้องผ่าน validateBotFields อีกรอบ (NO_CONDITION ข้ามฟิลด์) */
export const UpdateBotSchema = v.object({
  name: v.optional(fieldEntries.name),
  salesStatuses: v.optional(fieldEntries.salesStatuses),
  tags: v.optional(fieldEntries.tags),
  tagMatch: v.optional(fieldEntries.tagMatch),
  channelIds: v.optional(fieldEntries.channelIds),
  steps: v.optional(fieldEntries.steps),
  finalAction: v.optional(fieldEntries.finalAction),
  finalDelayMin: v.optional(fieldEntries.finalDelayMin),
  expectedUpdatedAt: iso,
})

export const ChangeStatusSchema = v.object({
  status: v.picklist(BOT_STATUSES),
  testRoomIds: v.optional(v.array(uuid)),
  expectedUpdatedAt: iso,
})

export const ExpectedUpdatedAtQuerySchema = v.object({ expectedUpdatedAt: iso })

export type TestRoomsProblem = 'TEST_ROOMS_REQUIRED' | 'TEST_ROOMS_TOO_MANY'
/** TESTING ต้องมีห้องทดสอบ 1..20 — เกิน 20 = TEST_ROOMS_TOO_MANY (400) · สถานะอื่นไม่ตรวจ */
export function testRoomsProblem(status: BotStatus, testRoomIds: readonly string[] | undefined): TestRoomsProblem | null {
  if (status !== 'TESTING') return null
  const n = new Set(testRoomIds ?? []).size
  if (n < 1) return 'TEST_ROOMS_REQUIRED'
  if (n > L.maxTestRooms) return 'TEST_ROOMS_TOO_MANY'
  return null
}

// ── map issue ของ Valibot (ชนิดผิด) → รหัสของ API §4.2 ──
export function mapStructuralIssue(i: v.BaseIssue<unknown>): BotIssue {
  const keys = (i.path ?? []).map((p) => p.key)
  const path = keys.join('.')
  const root = keys[0]
  const stepIndex = root === 'steps' && typeof keys[1] === 'number' ? keys[1] : undefined
  const partIndex = stepIndex !== undefined && keys[2] === 'parts' && typeof keys[3] === 'number' ? keys[3] : undefined
  const at = (code: BotIssueCode): BotIssue => ({
    code,
    path,
    ...(stepIndex !== undefined ? { stepIndex } : {}),
    ...(partIndex !== undefined ? { partIndex } : {}),
  })
  if (root === 'name') return at('NAME_REQUIRED')
  if (root === 'channelIds' && keys.length === 1) return at('CHANNELS_REQUIRED')
  if (root === 'finalDelayMin') return at('FINAL_DELAY_INVALID')
  if (root === 'finalAction') return at('INVALID_BODY')
  if (root === 'steps') {
    if (keys.length === 1) return at('STEPS_COUNT')
    if (keys[2] === 'delayMin') return at('STEP_DELAY_MIN')
    if (keys[2] === 'parts') {
      if (keys.length === 3) return at('PARTS_COUNT')
      // variant ที่ discriminator ผิด/ขาด รายงานที่ path ของชิ้นเอง (ยาว 4) หรือที่ 'kind'
      if (keys.length === 4 || keys[4] === 'kind') return at('PART_KIND_INVALID')
      if (keys[4] === 'text') return at('PART_TEXT_REQUIRED')
      if (keys[4] === 'fileIds') return at('PART_IMAGES_COUNT')
      if (keys[4] === 'quickMessageId') return at('QUICK_MESSAGE_REQUIRED')
    }
  }
  return at('INVALID_BODY')
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: BotIssue[] }

/** body ของ POST: ชนิดผิด → issue เดียวต่อจุด · ชนิดถูก → ตรวจ semantic ครบทุกข้อ แล้วคืนค่าที่ normalize (trim, TEXT ทิ้งรูป) */
export function parseCreateBot(raw: unknown): ParseResult<BotFields> {
  const r = v.safeParse(CreateBotSchema, raw)
  if (!r.success) return { ok: false, issues: r.issues.map(mapStructuralIssue) }
  const value = normalizeBotFields(r.output as BotFields)
  const issues = validateBotFields(value)
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value }
}

export function normalizeBotFields(f: BotFields): BotFields {
  return {
    ...f,
    name: f.name.trim(),
    tags: f.tags.map((t) => t.trim()).filter(Boolean),
    steps: f.steps.map((st) => ({
      delayMin: st.delayMin,
      parts: st.parts.map((p): BotPart =>
        p.kind === 'TEXT'
          ? { kind: 'TEXT', text: p.text.trim() }
          : p.kind === 'IMAGES'
            ? { kind: 'IMAGES', fileIds: p.fileIds }
            : { kind: 'QUICK_MESSAGE', quickMessageId: p.quickMessageId.trim() },
      ),
    })),
  }
}

/** ตรวจ semantic ทั้งก้อน (ชนิดถูกแล้ว) — ใช้ซ้ำตอน PATCH หลังรวมกับบอทเดิม */
export function validateBotFields(f: BotFields): BotIssue[] {
  const issues: BotIssue[] = []
  const name = f.name.trim()
  if (name === '') issues.push({ code: 'NAME_REQUIRED', path: 'name' })
  else if (countCodePoints(name) > L.maxName) issues.push({ code: 'NAME_TOO_LONG', path: 'name' })

  const tagCount = f.tags.map((t) => t.trim()).filter(Boolean).length
  if (tagCount > L.maxTags) issues.push({ code: 'TOO_MANY_TAGS', path: 'tags' })
  // เงื่อนไขอย่างน้อยหนึ่งอย่าง (AC-FB-02) — แท็กอย่างเดียวบันทึกได้ (บทเรียน gochat #1)
  if (f.salesStatuses.length === 0 && tagCount === 0) issues.push({ code: 'NO_CONDITION', path: 'salesStatuses' })

  const channels = new Set(f.channelIds).size
  if (channels < 1) issues.push({ code: 'CHANNELS_REQUIRED', path: 'channelIds' })
  else if (channels > L.maxChannels) issues.push({ code: 'TOO_MANY_CHANNELS', path: 'channelIds' })

  issues.push(...validateSteps(f.steps))
  if (f.finalDelayMin !== undefined && (!Number.isInteger(f.finalDelayMin) || f.finalDelayMin < 0 || f.finalDelayMin > FINAL_DELAY_MAX_MIN))
    issues.push({ code: 'FINAL_DELAY_INVALID', path: 'finalDelayMin' })
  return issues
}

function validatePart(part: BotPart, i: number, j: number, issues: BotIssue[]) {
  const p = `steps.${i}.parts.${j}`
  const add = (code: BotIssueCode, field: string, name?: string) =>
    issues.push({ code, path: `${p}.${field}`, stepIndex: i, partIndex: j, ...(name !== undefined ? { name } : {}) })
  if (!(PART_KINDS as readonly string[]).includes(part.kind)) return add('PART_KIND_INVALID', 'kind')

  if (part.kind === 'TEXT') {
    const text = typeof part.text === 'string' ? part.text.trim() : ''
    if (text === '') return add('PART_TEXT_REQUIRED', 'text')
    if (countCodePoints(text) > L.maxText) add('PART_TEXT_TOO_LONG', 'text')
    // NUL ทำ jsonb ตอนบันทึกล้ม (500) · surrogate เดี่ยวส่งให้แพลตฟอร์มไม่ได้
    if (text.includes('\u0000') || hasLoneSurrogate(text)) add('PART_TEXT_INVALID', 'text')
    const seen = new Set<string>()
    for (const seg of parseTemplate(text)) {
      if (seg.type !== 'var' || (ALLOWED_VARIABLES as readonly string[]).includes(seg.name) || seen.has(seg.name)) continue
      seen.add(seg.name)
      add('UNKNOWN_VARIABLE', 'text', seg.name)
    }
  } else if (part.kind === 'IMAGES') {
    const ids = Array.isArray(part.fileIds) ? part.fileIds : []
    if (ids.length < 1 || ids.length > L.maxImagesPerPart || ids.some((x) => typeof x !== 'string' || x.trim() === '' || x.length > L.maxIdLength)) add('PART_IMAGES_COUNT', 'fileIds')
  } else if (typeof part.quickMessageId !== 'string' || part.quickMessageId.trim() === '' || part.quickMessageId.length > L.maxIdLength) {
    add('QUICK_MESSAGE_REQUIRED', 'quickMessageId')
  }
}

/** ตรวจรอบทั้งชุด (TFR-FB-04 + TFR-FB-25) — คืนทุก issue ไม่หยุดที่ข้อแรก · issue ระดับชิ้นมี stepIndex + partIndex */
export function validateSteps(steps: readonly BotStep[]): BotIssue[] {
  const issues: BotIssue[] = []
  if (steps.length < 1 || steps.length > L.maxSteps) issues.push({ code: 'STEPS_COUNT', path: 'steps' })

  let delaysValid = true
  steps.forEach((st, i) => {
    const p = `steps.${i}`
    if (!Number.isInteger(st.delayMin) || st.delayMin < L.minDelayMin) {
      issues.push({ code: 'STEP_DELAY_MIN', path: `${p}.delayMin`, stepIndex: i })
      delaysValid = false
    }
    const parts = Array.isArray(st.parts) ? st.parts : []
    if (parts.length < 1 || parts.length > L.maxParts) issues.push({ code: 'PARTS_COUNT', path: `${p}.parts`, stepIndex: i })
    parts.forEach((part, j) => validatePart(part, i, j, issues))
  })

  // Σ delay: ชี้ขั้นที่ทำให้เกิน (ข้อความ "ขั้นที่ x เกินกรอบ 7 วัน") — ข้ามเมื่อมีขั้นที่ delay ใช้ไม่ได้ เพราะผลรวมไม่มีความหมาย
  if (delaysValid) {
    let acc = 0
    for (let i = 0; i < steps.length; i++) {
      acc += steps[i].delayMin
      if (acc > L.maxTotalDelayMin) {
        issues.push({ code: 'STEPS_TOTAL_TOO_LONG', path: 'steps', stepIndex: i })
        break
      }
    }
  }
  return issues
}

/** เวลาสะสม + ธง adOnly ต่อขั้น (คำนวณ ไม่เก็บ): ขั้นที่ผลรวมสะสม > 1,380 นาที ส่งได้เฉพาะลูกค้า Meta ที่ทักจากโฆษณา */
export function stepTimeline(delays: readonly number[]): { totalDelayMin: number; adOnly: boolean[] } {
  let acc = 0
  const adOnly = delays.map((d) => {
    acc += d
    return acc > L.adOnlyAfterMin
  })
  return { totalDelayMin: acc, adOnly }
}

// ── ตัวแปรข้อความ: ตัวเดียวกันทั้งตัวส่งและตัวอย่างในแชท (TC-082) ──

/**
 * แทน `{ชื่อ}` — ไม่มีชื่อ = ตัดตัวแปรทิ้งพร้อมช่องว่างที่ซ้อน (AC-FB-13)
 * ห้ามใช้ customerDisplayName ของ 00078 (คืน "ลูกค้า" ทำให้ข้อความห้วน/ผิดความหมาย)
 * ตัวแปรที่ไม่รู้จักคงข้อความเดิมไว้ (ผ่าน validateSteps มาแล้ว ปกติไม่เกิด)
 */
export function renderStepText(text: string, contactName: string | null | undefined): string {
  const name = contactName?.trim() ?? ''
  let out = ''
  let removed = false
  for (const seg of parseTemplate(text)) {
    if (seg.type === 'text') {
      // ตัดตัวแปรทิ้งแล้วช่องว่างสองฝั่งชนกัน → ทิ้งฝั่งหลัง ("สวัสดีคุณ{ชื่อ} ค่ะ" → "สวัสดีคุณ ค่ะ")
      out += removed && /[ \t]$/.test(out) ? seg.text.replace(/^[ \t]+/, '') : seg.text
      removed = false
    } else if (seg.name === 'ชื่อ') {
      if (name) {
        out += name
        removed = false
      } else removed = true
    } else {
      out += `{${seg.name}}`
      removed = false
    }
  }
  return out.trim()
}

/**
 * ฟองที่รอบหนึ่งจะส่ง เรียงตามชิ้น (TFR-FB-25) — ตัวเดียวกับตัวอย่างในแชท
 * IMAGES = ฟองเดียวถือหลายรูป (ตัวส่งใช้ทางรูปหลายรูปเดียวกับช่องพิมพ์แชท) · QUICK_MESSAGE = placeholder: pure ไม่รู้เนื้อหา service เติมเอง
 * (quick message ถูกลบ/ไฟล์รูปหาย = service ข้ามชิ้นนั้น)
 */
export type StepBubble =
  | { type: 'TEXT'; partIndex: number; text: string }
  | { type: 'IMAGES'; partIndex: number; fileIds: string[] }
  | { type: 'QUICK_MESSAGE'; partIndex: number; quickMessageId: string }
export type StepBubbles = { ok: true; bubbles: StepBubble[] } | { ok: false; reason: 'EMPTY_MESSAGE' }

/** ชิ้นข้อความว่างหลังแทนตัวแปรถูกข้ามเป็นรายชิ้น · ไม่เหลือชิ้นที่ส่งได้เลย = EMPTY_MESSAGE ข้ามทั้งรอบ (TC-109) */
export function buildStepBubbles(step: Pick<BotStep, 'parts'>, contactName: string | null | undefined): StepBubbles {
  const bubbles: StepBubble[] = []
  step.parts.forEach((part, partIndex) => {
    if (part.kind === 'TEXT') {
      const text = renderStepText(part.text, contactName)
      if (text !== '') bubbles.push({ type: 'TEXT', partIndex, text })
    } else if (part.kind === 'IMAGES') {
      if (part.fileIds.length > 0) bubbles.push({ type: 'IMAGES', partIndex, fileIds: [...part.fileIds] })
    } else if (part.quickMessageId) bubbles.push({ type: 'QUICK_MESSAGE', partIndex, quickMessageId: part.quickMessageId })
  })
  return bubbles.length > 0 ? { ok: true, bubbles } : { ok: false, reason: 'EMPTY_MESSAGE' }
}

/**
 * โครงรอบสำหรับ structureRev (TFR-FB-25): จำนวนรอบ + ลำดับชนิดชิ้นในแต่ละรอบ — "TEXT,IMAGES|QUICK_MESSAGE"
 * แก้ข้อความ/รูป/เลือก quick message ตัวอื่น/delayMin ไม่เปลี่ยนค่านี้ = ไม่หยุด run · service เทียบค่านี้ของเดิมกับใหม่
 */
export function stepStructureKey(steps: readonly Pick<BotStep, 'parts'>[]): string {
  return steps.map((s) => s.parts.map((p) => p.kind).join(',')).join('|')
}
