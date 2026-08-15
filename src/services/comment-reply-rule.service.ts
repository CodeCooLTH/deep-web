/**
 * comment-reply-rule.service — CRUD ของกฎตอบคอมเมนต์ตามคีย์เวิร์ด (feature 00038 ส่วนขยาย E2)
 *
 * ตัวเลือกกฎ (ตอน webhook เข้า) อยู่ที่ `src/lib/comment-rule-match.ts` ซึ่งเป็นฟังก์ชันบริสุทธิ์
 * ไฟล์นี้รับผิดชอบเฉพาะ "อ่าน/เขียนแถว + ด่านสิทธิ์ + normalize คำก่อนเก็บ"
 *
 * 🛑 ทุกฟังก์ชันในนี้ scope ด้วย `shopId` ที่ผู้เรียกยืนยันสิทธิ์มาแล้วเสมอ — ห้ามรับ ruleId
 * ลอย ๆ แล้ว update/delete ตรง ๆ ไม่งั้นเดา uuid ได้ = แก้กฎร้านอื่นได้
 */
import { prisma } from '@/lib/prisma'
import { normalizeMessage } from '@/lib/auto-reply-normalize'
import { ruleHasSomethingToSend } from '@/lib/comment-rule-match'

/** จำนวนกฎสูงสุดต่อร้าน — กันหน้าจอยาวไม่จบและกัน payload ของ hot path บวม */
export const COMMENT_RULE_MAX_PER_SHOP = 50
/** จำนวนคำสูงสุดต่อกฎ */
export const COMMENT_RULE_MAX_PHRASES = 30

export type CommentRuleInput = {
  name: string
  shopChannelId: string | null
  phrases: string[]
  publicReplyText: string | null
  publicReplyFileId: string | null
  privateReplyText: string | null
  priority: number
  isActive: boolean
}

export type CommentRuleView = CommentRuleInput & {
  id: string
  createdAt: string
}

/**
 * แปลงคำที่ร้านพิมพ์ให้พร้อมเก็บ — ตัดว่าง/ซ้ำออก แล้วผลิตคู่ (phrases, normalizedPhrases)
 *
 * 🛑 ตัดคำที่ normalize แล้วเหลือว่างทิ้งเสมอ (เช่นร้านพิมพ์แต่อิโมจิ) — คำว่างในลิสต์ทำให้กฎ
 * กินคอมเมนต์ทุกใบ เพราะ `x.includes('')` เป็น true เสมอ (ดู comment-rule-match.ts)
 * กันที่นี่คือชั้นที่ป้องกัน "ข้อมูลเสียตั้งแต่เข้าฐาน" ส่วนตัว matcher กันตอนอ่าน — ต้องมีทั้งคู่
 *
 * ดีดคำซ้ำออกด้วย **รูป normalize** ไม่ใช่รูปดิบ ("ราคา " กับ "ราคา" คือคำเดียวกันหลัง normalize)
 */
export function prepareRulePhrases(raw: string[]): { phrases: string[]; normalizedPhrases: string[] } {
  const phrases: string[] = []
  const normalizedPhrases: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const normalized = normalizeMessage(item)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    phrases.push(item.trim())
    normalizedPhrases.push(normalized)
  }
  return { phrases, normalizedPhrases }
}

function toView(row: {
  id: string
  name: string
  shopChannelId: string | null
  phrases: string[]
  publicReplyText: string | null
  publicReplyFileId: string | null
  privateReplyText: string | null
  priority: number
  isActive: boolean
  createdAt: Date
}): CommentRuleView {
  return {
    id: row.id,
    name: row.name,
    shopChannelId: row.shopChannelId,
    phrases: row.phrases,
    publicReplyText: row.publicReplyText,
    publicReplyFileId: row.publicReplyFileId,
    privateReplyText: row.privateReplyText,
    priority: row.priority,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  }
}

/** เรียงเหมือนที่ matcher ตัดสิน เพื่อให้หน้าจอแสดงลำดับเดียวกับที่ระบบใช้จริง (ไม่ใช่คนละลำดับ) */
const LIST_ORDER = [
  { priority: 'desc' as const },
  { createdAt: 'asc' as const },
  { id: 'asc' as const },
]

export async function listCommentRules(shopId: string): Promise<CommentRuleView[]> {
  const rows = await prisma.commentReplyRule.findMany({ where: { shopId }, orderBy: LIST_ORDER })
  return rows.map(toView)
}

export type RuleWriteError =
  | 'NOTHING_TO_SEND'
  | 'NO_PHRASES'
  | 'TOO_MANY_RULES'
  | 'CHANNEL_NOT_FOUND'
  | 'NOT_FOUND'

/** ตรวจที่ service ไม่ใช่แค่ Valibot — Valibot เห็นเฉพาะ payload เดี่ยว ๆ ไม่เห็นแถวเดิม/จำนวนกฎ/เพจ */
async function validateWrite(
  shopId: string,
  input: CommentRuleInput,
  normalizedPhrases: string[],
): Promise<RuleWriteError | null> {
  if (normalizedPhrases.length === 0) return 'NO_PHRASES'
  // 🛑 กฎที่ match แล้วไม่ทำอะไรเลยจะ "กิน" คอมเมนต์นั้นไปจาก fallback ของเพจด้วย
  // = เงียบกว่าตอนไม่มีกฎเสียอีก ต้องกันตั้งแต่ตอนบันทึก ไม่ใช่ปล่อยให้ไปเงียบตอนรัน
  if (!ruleHasSomethingToSend(input)) return 'NOTHING_TO_SEND'
  if (input.shopChannelId) {
    // เพจต้องเป็นของร้านนี้จริง — ไม่เชื่อค่าจาก client (เดา uuid แล้วผูกกฎข้ามร้านไม่ได้)
    const owned = await prisma.shopChannel.findFirst({
      where: { id: input.shopChannelId, shopId, provider: 'MESSENGER' },
      select: { id: true },
    })
    if (!owned) return 'CHANNEL_NOT_FOUND'
  }
  return null
}

export async function createCommentRule(params: {
  shopId: string
  actorUserId: string
  input: CommentRuleInput
}): Promise<{ ok: true; rule: CommentRuleView } | { ok: false; error: RuleWriteError }> {
  const { phrases, normalizedPhrases } = prepareRulePhrases(params.input.phrases)
  const invalid = await validateWrite(params.shopId, params.input, normalizedPhrases)
  if (invalid) return { ok: false, error: invalid }

  const count = await prisma.commentReplyRule.count({ where: { shopId: params.shopId } })
  if (count >= COMMENT_RULE_MAX_PER_SHOP) return { ok: false, error: 'TOO_MANY_RULES' }

  const row = await prisma.commentReplyRule.create({
    data: {
      shopId: params.shopId,
      shopChannelId: params.input.shopChannelId,
      name: params.input.name.trim(),
      phrases,
      normalizedPhrases,
      publicReplyText: params.input.publicReplyText?.trim() || null,
      publicReplyFileId: params.input.publicReplyFileId || null,
      privateReplyText: params.input.privateReplyText?.trim() || null,
      priority: params.input.priority,
      isActive: params.input.isActive,
      createdByUserId: params.actorUserId,
    },
  })
  return { ok: true, rule: toView(row) }
}

export async function updateCommentRule(params: {
  shopId: string
  ruleId: string
  input: CommentRuleInput
}): Promise<{ ok: true; rule: CommentRuleView } | { ok: false; error: RuleWriteError }> {
  const { phrases, normalizedPhrases } = prepareRulePhrases(params.input.phrases)
  const invalid = await validateWrite(params.shopId, params.input, normalizedPhrases)
  if (invalid) return { ok: false, error: invalid }

  // 🛑 updateMany + where ที่มี shopId — ห้าม findFirst แล้วค่อย update by id (ช่องว่างระหว่างสอง
  // คำสั่ง) และห้าม update by id เดี่ยว ๆ (เดา uuid แล้วแก้กฎร้านอื่นได้)
  const { count } = await prisma.commentReplyRule.updateMany({
    where: { id: params.ruleId, shopId: params.shopId },
    data: {
      shopChannelId: params.input.shopChannelId,
      name: params.input.name.trim(),
      phrases,
      normalizedPhrases,
      publicReplyText: params.input.publicReplyText?.trim() || null,
      publicReplyFileId: params.input.publicReplyFileId || null,
      privateReplyText: params.input.privateReplyText?.trim() || null,
      priority: params.input.priority,
      isActive: params.input.isActive,
    },
  })
  if (count === 0) return { ok: false, error: 'NOT_FOUND' }

  const row = await prisma.commentReplyRule.findUnique({ where: { id: params.ruleId } })
  if (!row) return { ok: false, error: 'NOT_FOUND' }
  return { ok: true, rule: toView(row) }
}

export async function deleteCommentRule(params: {
  shopId: string
  ruleId: string
}): Promise<{ ok: boolean }> {
  const { count } = await prisma.commentReplyRule.deleteMany({
    where: { id: params.ruleId, shopId: params.shopId },
  })
  return { ok: count > 0 }
}
