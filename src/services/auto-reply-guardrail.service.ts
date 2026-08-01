// feature 00023 Deep Chat-Bot Assistant — phase `00023-ai-enhance` A-05
// SSOT: docs/scope/2026-08-01-00023-ai-enhance-scope-baseline.md
//       + PRD.md §3.9 BR-AR-34 · BRD.md §2.8 FR-027
//
// กฎห้ามตอบ (Guardrails) รายกลุ่มคำ — "AI ห้ามพูดถึงอะไร"
//
// WARNING (ข้อบังคับที่ reviewer ต้องตรวจทุกฟังก์ชันในไฟล์นี้):
//   1. `shopId` มาจาก session เท่านั้น — ทุก query ต้องมี shopId อยู่ใน `where`
//      ไม่ใช่ดึงมาแล้วค่อยกรองใน JS (memory `feedback_rsc_dal_authz`)
//   2. ชุดเริ่มต้นเป็น **copy-by-value** — คัดลอกตอนเปิดสวิตช์ครั้งแรกเท่านั้น
//      ห้ามมีเส้นทางไหนที่ย้อนกลับไป "sync" กับ DEFAULT_GUARDRAILS อีก เพราะจะทำให้
//      ข้อที่ร้านลบทิ้งไปแล้วโผล่กลับมา ซึ่ง AC-027-04 ห้ามไว้ตรง ๆ

import { prisma } from '@/lib/prisma'
import { DEFAULT_GUARDRAILS } from '@/lib/auto-reply-constants'

export const GUARDRAIL_RULE_MAX_LEN = 200
export const GUARDRAIL_MAX_PER_KEYWORD = 30

export interface GuardrailItem {
  id: string
  rule: string
  denyPhrases: string[]
  isFromDefaultSet: boolean
  isActive: boolean
}

/** ยืนยันว่ากลุ่มคำนี้เป็นของร้านนี้จริง — ใช้ก่อนทุกคำสั่งที่อ้าง keywordId จาก client */
async function assertKeywordOwned(keywordId: string, shopId: string): Promise<void> {
  const found = await prisma.autoReplyKeyword.findFirst({
    where: { id: keywordId, shopId },
    select: { id: true },
  })
  if (!found) throw new Error('AUTO_REPLY_KEYWORD_NOT_FOUND')
}

/**
 * กฎระดับร้าน — ใช้กับ ChatBot ซึ่งตอบข้อความที่ไม่เข้ากลุ่มไหนเลย จึงไม่มีกลุ่มให้ผูก
 * (keywordId = null) แยกฟังก์ชันจากของรายกลุ่มเพื่อไม่ให้เผลอปนกันใน query เดียว
 */
export async function listShopGuardrails(shopId: string): Promise<GuardrailItem[]> {
  return prisma.autoReplyGuardrail.findMany({
    where: { shopId, keywordId: null },
    select: { id: true, rule: true, denyPhrases: true, isFromDefaultSet: true, isActive: true },
    orderBy: [{ isFromDefaultSet: 'desc' }, { createdAt: 'asc' }],
  })
}

/** คัดลอกชุดเริ่มต้นเป็นกฎระดับร้าน — เรียกตอนเปิด ChatBot ครั้งแรก (เงื่อนไขเดียวกับรายกลุ่ม) */
export async function ensureShopDefaultGuardrails(
  shopId: string,
  actorUserId: string
): Promise<{ created: number }> {
  try {
    const existing = await prisma.autoReplyGuardrail.count({ where: { shopId, keywordId: null } })
    if (existing > 0) return { created: 0 }
    const result = await prisma.autoReplyGuardrail.createMany({
      data: DEFAULT_GUARDRAILS.map((g) => ({
        shopId,
        keywordId: null,
        rule: g.rule,
        denyPhrases: g.denyPhrases,
        isFromDefaultSet: true,
        createdByUserId: actorUserId,
      })),
    })
    return { created: result.count }
  } catch (e) {
    console.error('[guardrail] คัดลอกชุดเริ่มต้นระดับร้านไม่สำเร็จ', e)
    return { created: 0 }
  }
}

export async function listGuardrails(keywordId: string, shopId: string): Promise<GuardrailItem[]> {
  await assertKeywordOwned(keywordId, shopId)
  const rows = await prisma.autoReplyGuardrail.findMany({
    where: { keywordId, shopId },
    select: { id: true, rule: true, denyPhrases: true, isFromDefaultSet: true, isActive: true },
    // ชุดเริ่มต้นอยู่บน แล้วเรียงตามเวลาที่เพิ่ม — ร้านที่เพิ่มเองจะเห็นของตัวเองต่อท้ายเสมอ
    orderBy: [{ isFromDefaultSet: 'desc' }, { createdAt: 'asc' }],
  })
  return rows
}

function validateRule(rule: string): string {
  const r = rule.trim()
  if (!r) throw new Error('AUTO_REPLY_GUARDRAIL_RULE_EMPTY')
  if (r.length > GUARDRAIL_RULE_MAX_LEN) throw new Error('AUTO_REPLY_GUARDRAIL_RULE_TOO_LONG')
  return r
}

export async function createGuardrail(
  keywordId: string,
  shopId: string,
  input: { rule: string; denyPhrases?: string[] },
  actorUserId: string
): Promise<{ id: string }> {
  await assertKeywordOwned(keywordId, shopId)
  const rule = validateRule(input.rule)

  const count = await prisma.autoReplyGuardrail.count({ where: { keywordId, shopId } })
  if (count >= GUARDRAIL_MAX_PER_KEYWORD) throw new Error('AUTO_REPLY_GUARDRAIL_LIMIT_REACHED')

  const created = await prisma.autoReplyGuardrail.create({
    data: {
      shopId,
      keywordId,
      rule,
      denyPhrases: (input.denyPhrases ?? []).map((p) => p.trim()).filter(Boolean),
      isFromDefaultSet: false,
      createdByUserId: actorUserId,
    },
    select: { id: true },
  })
  return created
}

/** เพิ่มกฎระดับร้าน (keywordId = null) — ใช้กับ ChatBot */
export async function createShopGuardrail(
  shopId: string,
  input: { rule: string; denyPhrases?: string[] },
  actorUserId: string
): Promise<{ id: string }> {
  const rule = validateRule(input.rule)
  const count = await prisma.autoReplyGuardrail.count({ where: { shopId, keywordId: null } })
  if (count >= GUARDRAIL_MAX_PER_KEYWORD) throw new Error('AUTO_REPLY_GUARDRAIL_LIMIT_REACHED')
  return prisma.autoReplyGuardrail.create({
    data: {
      shopId,
      keywordId: null,
      rule,
      denyPhrases: (input.denyPhrases ?? []).map((p) => p.trim()).filter(Boolean),
      isFromDefaultSet: false,
      createdByUserId: actorUserId,
    },
    select: { id: true },
  })
}

export async function updateGuardrail(
  guardrailId: string,
  shopId: string,
  input: { rule?: string; denyPhrases?: string[]; isActive?: boolean }
): Promise<void> {
  const data: { rule?: string; denyPhrases?: string[]; isActive?: boolean } = {}
  if (input.rule !== undefined) data.rule = validateRule(input.rule)
  if (input.denyPhrases !== undefined) {
    data.denyPhrases = input.denyPhrases.map((p) => p.trim()).filter(Boolean)
  }
  if (input.isActive !== undefined) data.isActive = input.isActive

  const result = await prisma.autoReplyGuardrail.updateMany({
    where: { id: guardrailId, shopId },
    data,
  })
  if (result.count === 0) throw new Error('AUTO_REPLY_GUARDRAIL_NOT_FOUND')
}

/**
 * ลบกฎ — ลบจริง ไม่ใช่ soft delete
 *
 * ข้อที่มาจากชุดเริ่มต้นก็ลบได้ (BR-AR-34 "ไม่มีข้อใดถูกบังคับห้ามปิด") และเมื่อลบแล้ว
 * **ต้องไม่กลับมาอีก** แม้ SafePay จะอัปเดตชุดเริ่มต้นในอนาคต — ซึ่งเป็นจริงโดยโครงสร้าง
 * เพราะ `ensureDefaultGuardrails` คัดลอกเฉพาะตอนที่กลุ่มยังไม่มีกฎสักข้อเท่านั้น
 */
export async function deleteGuardrail(guardrailId: string, shopId: string): Promise<void> {
  const result = await prisma.autoReplyGuardrail.deleteMany({ where: { id: guardrailId, shopId } })
  if (result.count === 0) throw new Error('AUTO_REPLY_GUARDRAIL_NOT_FOUND')
}

/**
 * คัดลอกชุดเริ่มต้นเข้ากลุ่มคำ — เรียกตอนเปิดสวิตช์ AI Enhance ครั้งแรก (AC-027-01)
 *
 * WARNING: เงื่อนไข "กลุ่มนี้ยังไม่มีกฎสักข้อ" คือสิ่งเดียวที่กัน AC-027-04 ("ข้อที่ร้านลบ
 * ไปแล้วต้องไม่ถูกเติมกลับ") — ห้ามเปลี่ยนเป็นการเทียบทีละข้อกับ DEFAULT_GUARDRAILS
 * เพราะร้านที่ลบข้อ 3 ทิ้งแล้วปิด-เปิดสวิตช์ใหม่จะได้ข้อ 3 กลับมาทันที
 *
 * ไม่ throw: ถ้าคัดลอกพลาด สวิตช์ต้องยังเปิดได้ (ร้านเพิ่มกฎเองทีหลังได้) การทำให้
 * การเปิดสวิตช์ล้มเพราะเรื่องนี้เป็นการลงโทษผู้ใช้ด้วยปัญหาของระบบ
 */
export async function ensureDefaultGuardrails(
  keywordId: string,
  shopId: string,
  actorUserId: string
): Promise<{ created: number }> {
  try {
    const existing = await prisma.autoReplyGuardrail.count({ where: { keywordId, shopId } })
    if (existing > 0) return { created: 0 }

    const result = await prisma.autoReplyGuardrail.createMany({
      data: DEFAULT_GUARDRAILS.map((g) => ({
        shopId,
        keywordId,
        rule: g.rule,
        denyPhrases: g.denyPhrases,
        isFromDefaultSet: true,
        createdByUserId: actorUserId,
      })),
    })
    return { created: result.count }
  } catch (e) {
    console.error('[guardrail] คัดลอกชุดเริ่มต้นไม่สำเร็จ', e)
    return { created: 0 }
  }
}
