// 00095 TFR-FB-04 — Valibot + validateSteps + ตัวแปรข้อความ (ใช้ทั้ง client และ server → ห้าม import ของที่ลาก node:crypto
// เช่น shop-tag-match; การแปลงชื่อแท็ก→tagKeys ทำที่ service)
// ตัวเลขทั้งหมดมาจาก constants.ts ที่เดียว (TC-107)
import * as v from 'valibot'
import { countCodePoints, hasLoneSurrogate, parseTemplate } from '../auto-notify/variables'
import {
  ALLOWED_VARIABLES,
  BOT_STATUSES,
  SALES_FOLLOW_LIMITS as L,
  SALES_STAGE_KEYS,
  STEP_KINDS,
  TAG_MATCHES,
  type BotStatus,
  type StepKind,
} from './constants'

export type BotIssueCode =
  | 'NAME_REQUIRED'
  | 'NAME_TOO_LONG'
  | 'NO_CONDITION'
  | 'STEPS_COUNT'
  | 'STEP_DELAY_MIN'
  | 'STEPS_TOTAL_TOO_LONG'
  | 'STEP_TEXT_REQUIRED'
  | 'STEP_TEXT_TOO_LONG'
  | 'STEP_TEXT_INVALID'
  | 'STEP_IMAGE_REQUIRED'
  | 'STEP_KIND_INVALID'
  | 'UNKNOWN_VARIABLE'
  | 'TOO_MANY_TAGS'
  | 'TOO_MANY_CHANNELS'
  | 'CHANNELS_REQUIRED'
  | 'INVALID_BODY'

export interface BotIssue {
  code: BotIssueCode
  path: string
  stepIndex?: number
  /** ชื่อตัวแปรที่ไม่รู้จัก (UNKNOWN_VARIABLE) */
  name?: string
}

export interface BotStep {
  delayMin: number
  kind: StepKind
  text: string
  imageFileId: string | null
}

export interface BotFields {
  name: string
  salesStatuses: string[]
  /** ชื่อแท็ก (ยังไม่แปลงเป็น tagKeys) */
  tags: string[]
  tagMatch: 'ANY' | 'ALL'
  channelIds: string[]
  steps: BotStep[]
}

// ── โครงชนิดข้อมูล (Valibot) — `adOnly` ที่ client ส่งมาถูกทิ้งเพราะ v.object ไม่เก็บคีย์เกิน (คำนวณฝั่งเซิร์ฟเวอร์เท่านั้น) ──
const StepSchema = v.object({
  delayMin: v.number(),
  kind: v.picklist(STEP_KINDS),
  text: v.string(),
  imageFileId: v.optional(v.nullable(v.string())),
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
}

/** POST สร้างบอท — ไม่รับ status (บอทใหม่ CLOSED เสมอ AC-FB-04) */
export const CreateBotSchema = v.object({
  name: fieldEntries.name,
  salesStatuses: v.optional(fieldEntries.salesStatuses, []),
  tags: v.optional(fieldEntries.tags, []),
  tagMatch: v.optional(fieldEntries.tagMatch, 'ANY'),
  channelIds: fieldEntries.channelIds,
  steps: fieldEntries.steps,
})

/** PATCH — ส่งเฉพาะที่แก้ · ผลรวมกับบอทเดิมต้องผ่าน validateBotFields อีกรอบ (NO_CONDITION ข้ามฟิลด์) */
export const UpdateBotSchema = v.object({
  name: v.optional(fieldEntries.name),
  salesStatuses: v.optional(fieldEntries.salesStatuses),
  tags: v.optional(fieldEntries.tags),
  tagMatch: v.optional(fieldEntries.tagMatch),
  channelIds: v.optional(fieldEntries.channelIds),
  steps: v.optional(fieldEntries.steps),
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
function mapStructuralIssue(i: v.BaseIssue<unknown>): BotIssue {
  const keys = (i.path ?? []).map((p) => p.key)
  const path = keys.join('.')
  const root = keys[0]
  const stepIndex = root === 'steps' && typeof keys[1] === 'number' ? keys[1] : undefined
  const at = (code: BotIssueCode): BotIssue => (stepIndex === undefined ? { code, path } : { code, path, stepIndex })
  if (root === 'name') return at('NAME_REQUIRED')
  if (root === 'channelIds' && keys.length === 1) return at('CHANNELS_REQUIRED')
  if (root === 'steps') {
    if (keys.length === 1) return at('STEPS_COUNT')
    const field = keys[2]
    if (field === 'delayMin') return at('STEP_DELAY_MIN')
    if (field === 'kind') return at('STEP_KIND_INVALID')
    if (field === 'text') return at('STEP_TEXT_REQUIRED')
  }
  return at('INVALID_BODY')
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: BotIssue[] }

/** body ของ POST: ชนิดผิด → issue เดียวต่อจุด · ชนิดถูก → ตรวจ semantic ครบทุกข้อ แล้วคืนค่าที่ normalize (trim, TEXT ทิ้งรูป) */
export function parseCreateBot(raw: unknown): ParseResult<BotFields> {
  const r = v.safeParse(CreateBotSchema, raw)
  if (!r.success) return { ok: false, issues: r.issues.map(mapStructuralIssue) }
  const value = normalizeBotFields({ ...r.output, steps: r.output.steps.map((s) => ({ ...s, imageFileId: s.imageFileId ?? null })) })
  const issues = validateBotFields(value)
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value }
}

export function normalizeBotFields(f: BotFields): BotFields {
  return {
    ...f,
    name: f.name.trim(),
    tags: f.tags.map((t) => t.trim()).filter(Boolean),
    steps: f.steps.map((s) => ({
      ...s,
      text: s.text.trim(),
      // TEXT ที่ client แนบ imageFileId มา = ไม่สนใจรูป (TC-073) ไม่ error
      imageFileId: s.kind === 'TEXT_IMAGE' ? s.imageFileId : null,
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
  return issues
}

/** ตรวจขั้นทั้งชุด (TFR-FB-04) — คืนทุก issue ไม่หยุดที่ข้อแรก */
export function validateSteps(steps: readonly BotStep[]): BotIssue[] {
  const issues: BotIssue[] = []
  if (steps.length < 1 || steps.length > L.maxSteps) issues.push({ code: 'STEPS_COUNT', path: 'steps' })

  let delaysValid = true
  steps.forEach((s, i) => {
    const p = `steps.${i}`
    const add = (code: BotIssueCode, field: string, name?: string) =>
      issues.push({ code, path: `${p}.${field}`, stepIndex: i, ...(name !== undefined ? { name } : {}) })

    if (!Number.isInteger(s.delayMin) || s.delayMin < L.minDelayMin) {
      add('STEP_DELAY_MIN', 'delayMin')
      delaysValid = false
    }
    if (!(STEP_KINDS as readonly string[]).includes(s.kind)) add('STEP_KIND_INVALID', 'kind')

    const text = typeof s.text === 'string' ? s.text.trim() : ''
    if (text === '') add('STEP_TEXT_REQUIRED', 'text')
    else {
      if (countCodePoints(text) > L.maxText) add('STEP_TEXT_TOO_LONG', 'text')
      // NUL ทำ jsonb ตอนบันทึกล้ม (500) · surrogate เดี่ยวส่งให้แพลตฟอร์มไม่ได้
      if (text.includes('\u0000') || hasLoneSurrogate(text)) add('STEP_TEXT_INVALID', 'text')
      const seen = new Set<string>()
      for (const seg of parseTemplate(text)) {
        if (seg.type !== 'var' || (ALLOWED_VARIABLES as readonly string[]).includes(seg.name) || seen.has(seg.name)) continue
        seen.add(seg.name)
        add('UNKNOWN_VARIABLE', 'text', seg.name)
      }
    }
    if (s.kind === 'TEXT_IMAGE' && !s.imageFileId) add('STEP_IMAGE_REQUIRED', 'imageFileId')
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

export type StepBubble = { type: 'TEXT'; text: string } | { type: 'IMAGE'; fileId: string }
export type StepBubbles = { ok: true; bubbles: StepBubble[] } | { ok: false; reason: 'EMPTY_MESSAGE' | 'IMAGE_MISSING' }

/** ฟองที่ขั้นหนึ่งจะส่ง: ข้อความก่อนแล้วรูป (AC-FB-12) · ข้อความว่างหลังแทนตัวแปร = ข้ามทั้งขั้น (TC-109) */
export function buildStepBubbles(
  step: Pick<BotStep, 'kind' | 'text' | 'imageFileId'>,
  contactName: string | null | undefined,
): StepBubbles {
  const text = renderStepText(step.text, contactName)
  if (text === '') return { ok: false, reason: 'EMPTY_MESSAGE' }
  const bubbles: StepBubble[] = [{ type: 'TEXT', text }]
  if (step.kind === 'TEXT_IMAGE') {
    if (!step.imageFileId) return { ok: false, reason: 'IMAGE_MISSING' }
    bubbles.push({ type: 'IMAGE', fileId: step.imageFileId })
  }
  return { ok: true, bubbles }
}
