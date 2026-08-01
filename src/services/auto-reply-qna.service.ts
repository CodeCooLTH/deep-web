// feature 00023 Deep Chat-Bot Assistant — phase `00023-qna` S-05
// SSOT: docs/20 - Features/00023 - Deep Chat-Bot Assistant/SRS.md TFR-034 + DATABASE.md §3.9
//
// CRUD + bulk ของคลังคำถาม-คำตอบรายกลุ่มคำ
//
// WARNING (ข้อบังคับที่ reviewer ต้องตรวจทุกฟังก์ชันในไฟล์นี้):
//   1. `shopId` มาจาก session เท่านั้น (TFR-005) — ทุก query ต้องมี shopId อยู่ใน `where`
//      ไม่ใช่ดึงมาแล้วค่อยกรองใน JS (memory `feedback_rsc_dal_authz`)
//   2. `normalizedQuestion` คำนวณที่นี่ด้วย `normalizeMessage()` ทุกครั้งที่เขียน
//      **ห้ามรับจาก client** (หลักเดียวกับ `specificity` ของ AutoReplyRule ใน TFR-004)
//   3. ทุกเส้นทางที่เขียนต้องเรียก `invalidateShop()` — ไม่งั้นร้านกรอกคำตอบเสร็จแล้วทดสอบ
//      ทันทีจะเจอ "ตั้งแล้วไม่ทำงาน" นาน 60 วินาที ซึ่งแยกไม่ออกจากบั๊กจริง
//      (บทเรียนซ้ำรอย cooldown/ตารางเวลา 2026-07-31)

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { normalizeMessage } from '@/lib/auto-reply-normalize'
import { invalidateShop } from '@/lib/auto-reply-cache'
import { MAX_REPLY_IMAGES, type QnaSource } from '@/lib/auto-reply-constants'

export const QNA_QUESTION_MAX_LEN = 500
export const QNA_ANSWER_MAX_LEN = 2000

/** ตัวกรองของหน้าจัดการ (mockup §07 — ชิป 4 ตัว) */
export type QnaListFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'NEVER_USED'

export interface QnaListItem {
  id: string
  question: string
  answer: string
  imageFileIds: string[]
  isActive: boolean
  useCount: number
  lastUsedAt: Date | null
  source: string
  updatedAt: Date
}

export interface QnaListResult {
  items: QnaListItem[]
  /** สถิติของ "ทั้งกลุ่ม" ไม่ใช่ของผลลัพธ์ที่กรองแล้ว — หัวการ์ดต้องบอกภาพรวมเสมอ */
  stats: { total: number; active: number; totalUses: number }
}

/** ยืนยันว่ากลุ่มคำนี้เป็นของร้านนี้จริง — ใช้ก่อนทุกคำสั่งที่อ้าง keywordId จาก client */
async function assertKeywordOwned(
  keywordId: string,
  shopId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  const found = await db.autoReplyKeyword.findFirst({
    where: { id: keywordId, shopId },
    select: { id: true },
  })
  if (!found) throw new Error('AUTO_REPLY_KEYWORD_NOT_FOUND')
}

function validateContent(question: string, answer: string, imageFileIds: string[]) {
  const q = question.trim()
  const a = answer.trim()
  if (!q) throw new Error('AUTO_REPLY_QNA_QUESTION_EMPTY')
  if (q.length > QNA_QUESTION_MAX_LEN) throw new Error('AUTO_REPLY_QNA_QUESTION_TOO_LONG')
  // คำตอบว่างได้ **เฉพาะเมื่อมีรูป** — มิเรอร์ QuickMessage.body ที่ว่างได้ถ้ามีรูป
  // (SRS TFR-036 ข้อ 6: คำตอบที่เป็นรูปล้วนต้องไม่ถูกตัดทิ้งเป็น EMPTY_REPLY)
  if (!a && imageFileIds.length === 0) throw new Error('AUTO_REPLY_QNA_ANSWER_EMPTY')
  if (a.length > QNA_ANSWER_MAX_LEN) throw new Error('AUTO_REPLY_QNA_ANSWER_TOO_LONG')
  if (imageFileIds.length > MAX_REPLY_IMAGES) throw new Error('AUTO_REPLY_QNA_TOO_MANY_IMAGES')

  const normalized = normalizeMessage(q)
  // คำถามที่เหลือว่างหลัง normalize (เช่น "???" ล้วน) จะกลายเป็นข้อที่ match ไม่ได้เลย
  // ปฏิเสธตั้งแต่ตอนเขียน ดีกว่าปล่อยให้เป็นแถวตายในคลังที่ร้านงงว่าทำไมไม่เคยถูกใช้
  if (!normalized) throw new Error('AUTO_REPLY_QNA_QUESTION_EMPTY')

  return { q, a, normalized }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
}

// ---------------------------------------------------------------------------
// อ่าน
// ---------------------------------------------------------------------------

/**
 * คลังความรู้ระดับร้าน — ทุกข้อของร้านไม่ว่าผูกกลุ่มคำไหนหรือไม่ผูกเลย
 * (user ตัดสิน 2026-08-01 ให้คลังเป็นของ ChatBot ไม่ใช่ของกลุ่มคำ)
 */
export async function listShopQna(
  shopId: string,
  opts: { search?: string } = {}
): Promise<QnaListResult> {
  const search = opts.search?.trim()
  const where = {
    shopId,
    ...(search
      ? {
          OR: [
            { question: { contains: search, mode: 'insensitive' as const } },
            { answer: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }
  const [items, total, active, uses] = await Promise.all([
    prisma.autoReplyQna.findMany({
      where,
      select: {
        id: true, question: true, answer: true, imageFileIds: true,
        isActive: true, useCount: true, lastUsedAt: true, source: true, updatedAt: true,
      },
      orderBy: [{ useCount: 'desc' }, { updatedAt: 'desc' }],
      take: 500,
    }),
    prisma.autoReplyQna.count({ where: { shopId } }),
    prisma.autoReplyQna.count({ where: { shopId, isActive: true } }),
    prisma.autoReplyQna.aggregate({ where: { shopId }, _sum: { useCount: true } }),
  ])
  return { items, stats: { total, active, totalUses: uses._sum.useCount ?? 0 } }
}

/** เพิ่มข้อเข้าคลังกลาง (ไม่ผูกกลุ่มคำ) */
export async function createShopQna(
  shopId: string,
  input: { question: string; answer: string; imageFileIds?: string[] },
  actorUserId: string
): Promise<{ id: string }> {
  const images = input.imageFileIds ?? []
  const { q, a, normalized } = validateContent(input.question, input.answer, images)
  try {
    const created = await prisma.autoReplyQna.create({
      data: {
        shopId,
        keywordId: null,
        question: q,
        normalizedQuestion: normalized,
        answer: a,
        imageFileIds: images,
        source: 'MANUAL',
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
      select: { id: true },
    })
    invalidateShop(shopId)
    return created
  } catch (e) {
    if (isUniqueViolation(e)) throw new Error('AUTO_REPLY_QNA_DUPLICATE')
    throw e
  }
}

export async function listQna(
  keywordId: string,
  shopId: string,
  opts: { filter?: QnaListFilter; search?: string } = {}
): Promise<QnaListResult> {
  await assertKeywordOwned(keywordId, shopId)

  const filter = opts.filter ?? 'ALL'
  const search = opts.search?.trim()

  const where = {
    keywordId,
    shopId, // ซ้ำกับ assertKeywordOwned โดยเจตนา — ownership ต้องอยู่ใน WHERE ของ query ที่คืนข้อมูลจริง
    ...(filter === 'ACTIVE' ? { isActive: true } : {}),
    ...(filter === 'INACTIVE' ? { isActive: false } : {}),
    ...(filter === 'NEVER_USED' ? { useCount: 0 } : {}),
    ...(search
      ? {
          OR: [
            { question: { contains: search, mode: 'insensitive' as const } },
            { answer: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [items, total, active, uses] = await Promise.all([
    prisma.autoReplyQna.findMany({
      where,
      select: {
        id: true,
        question: true,
        answer: true,
        imageFileIds: true,
        isActive: true,
        useCount: true,
        lastUsedAt: true,
        source: true,
        updatedAt: true,
      },
      // ที่ถูกใช้บ่อยอยู่บน — ตรงกับ index [keywordId, isActive, useCount]
      orderBy: [{ useCount: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.autoReplyQna.count({ where: { keywordId, shopId } }),
    prisma.autoReplyQna.count({ where: { keywordId, shopId, isActive: true } }),
    prisma.autoReplyQna.aggregate({ where: { keywordId, shopId }, _sum: { useCount: true } }),
  ])

  return { items, stats: { total, active, totalUses: uses._sum.useCount ?? 0 } }
}

// ---------------------------------------------------------------------------
// เขียน
// ---------------------------------------------------------------------------

export async function createQna(
  keywordId: string,
  shopId: string,
  input: { question: string; answer: string; imageFileIds?: string[]; source?: QnaSource },
  actorUserId: string,
  /**
   * ส่ง tx มาเมื่อการสร้างต้อง atomic ร่วมกับการเขียนอื่น (เช่น `convertUnansweredToQna`
   * ที่ต้องปิดคิวในทรานแซกชันเดียวกัน) — เมื่อส่ง tx มา **จะไม่ invalidate cache ให้**
   * เพราะ commit ยังไม่เกิด ล้าง cache ตอนนั้นจะดูดค่าเก่ากลับเข้ามาใหม่ทันที
   * ผู้เรียกต้อง `invalidateShop(shopId)` เองหลัง transaction สำเร็จ
   */
  tx?: Prisma.TransactionClient
): Promise<{ id: string }> {
  const db = tx ?? prisma
  await assertKeywordOwned(keywordId, shopId, db)
  const images = input.imageFileIds ?? []
  const { q, a, normalized } = validateContent(input.question, input.answer, images)

  try {
    const created = await db.autoReplyQna.create({
      data: {
        shopId,
        keywordId,
        question: q,
        normalizedQuestion: normalized,
        answer: a,
        imageFileIds: images,
        source: input.source ?? 'MANUAL',
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
      select: { id: true },
    })
    if (!tx) invalidateShop(shopId)
    return created
  } catch (e) {
    // @@unique([keywordId, normalizedQuestion]) — ให้ DB เป็นคนบอกว่าซ้ำ ไม่ใช่ findFirst ก่อนเขียน
    // (findFirst-แล้ว-create มีช่องให้ 2 request แทรกกันจนได้แถวซ้ำจริง)
    if (isUniqueViolation(e)) throw new Error('AUTO_REPLY_QNA_DUPLICATE')
    throw e
  }
}

export async function updateQna(
  qnaId: string,
  shopId: string,
  input: { question?: string; answer?: string; imageFileIds?: string[]; isActive?: boolean },
  actorUserId: string
): Promise<void> {
  const existing = await prisma.autoReplyQna.findFirst({
    where: { id: qnaId, shopId },
    select: { question: true, answer: true, imageFileIds: true },
  })
  if (!existing) throw new Error('AUTO_REPLY_QNA_NOT_FOUND')

  const data: Record<string, unknown> = { updatedByUserId: actorUserId }

  if (input.question !== undefined || input.answer !== undefined || input.imageFileIds !== undefined) {
    const nextQuestion = input.question ?? existing.question
    const nextAnswer = input.answer ?? existing.answer
    const nextImages = input.imageFileIds ?? existing.imageFileIds
    const { q, a, normalized } = validateContent(nextQuestion, nextAnswer, nextImages)
    data.question = q
    data.answer = a
    data.normalizedQuestion = normalized
    data.imageFileIds = nextImages
  }

  if (input.isActive !== undefined) data.isActive = input.isActive

  try {
    await prisma.autoReplyQna.update({ where: { id: qnaId }, data })
    invalidateShop(shopId)
  } catch (e) {
    if (isUniqueViolation(e)) throw new Error('AUTO_REPLY_QNA_DUPLICATE')
    throw e
  }
}

export async function deleteQna(qnaId: string, shopId: string): Promise<void> {
  // deleteMany + shopId ใน where — ไม่ใช่ delete({ where: { id } }) ซึ่งลบข้ามร้านได้ถ้า id หลุด
  const result = await prisma.autoReplyQna.deleteMany({ where: { id: qnaId, shopId } })
  if (result.count === 0) throw new Error('AUTO_REPLY_QNA_NOT_FOUND')
  invalidateShop(shopId)
}

// ---------------------------------------------------------------------------
// bulk — TFR-034 ข้อ 4
// ---------------------------------------------------------------------------

export type QnaBulkAction = 'ACTIVATE' | 'DEACTIVATE' | 'MOVE' | 'DELETE'

export interface QnaBulkResult {
  ok: number
  /** รายข้อที่ทำไม่ได้ พร้อมเหตุผล — bulk ต้องไม่ล้มทั้งชุดเพราะข้อเดียวชน (TFR-034 ข้อ 4) */
  failed: { id: string; reason: string }[]
}

export async function bulkQna(
  shopId: string,
  qnaIds: string[],
  action: QnaBulkAction,
  opts: { targetKeywordId?: string; actorUserId: string }
): Promise<QnaBulkResult> {
  if (qnaIds.length === 0) return { ok: 0, failed: [] }

  // กรองให้เหลือเฉพาะ id ที่เป็นของร้านนี้จริง ก่อนทำอะไรทั้งสิ้น
  const owned = await prisma.autoReplyQna.findMany({
    where: { id: { in: qnaIds }, shopId },
    select: { id: true, normalizedQuestion: true },
  })
  const ownedIds = owned.map((r) => r.id)
  const failed: { id: string; reason: string }[] = qnaIds
    .filter((id) => !ownedIds.includes(id))
    .map((id) => ({ id, reason: 'AUTO_REPLY_QNA_NOT_FOUND' }))

  if (ownedIds.length === 0) return { ok: 0, failed }

  if (action === 'ACTIVATE' || action === 'DEACTIVATE') {
    const { count } = await prisma.autoReplyQna.updateMany({
      where: { id: { in: ownedIds }, shopId },
      data: { isActive: action === 'ACTIVATE', updatedByUserId: opts.actorUserId },
    })
    invalidateShop(shopId)
    return { ok: count, failed }
  }

  if (action === 'DELETE') {
    const { count } = await prisma.autoReplyQna.deleteMany({ where: { id: { in: ownedIds }, shopId } })
    invalidateShop(shopId)
    return { ok: count, failed }
  }

  // MOVE — ย้ายไปกลุ่มอื่น
  const target = opts.targetKeywordId
  if (!target) throw new Error('AUTO_REPLY_QNA_MOVE_TARGET_REQUIRED')
  await assertKeywordOwned(target, shopId)

  // WARNING: ย้ายทีละข้อโดยเจตนา ไม่ใช่ updateMany ก้อนเดียว — กลุ่มปลายทางอาจมีคำถามซ้ำอยู่แล้ว
  // ซึ่ง unique constraint จะปฏิเสธ ถ้ายิงเป็นก้อนเดียวจะล้มทั้งชุดเพราะข้อเดียวชน
  // และร้านจะไม่รู้ว่าข้อไหนเป็นตัวปัญหา
  let ok = 0
  for (const row of owned) {
    try {
      await prisma.autoReplyQna.update({
        where: { id: row.id },
        data: { keywordId: target, updatedByUserId: opts.actorUserId },
      })
      ok++
    } catch (e) {
      failed.push({
        id: row.id,
        reason: isUniqueViolation(e) ? 'AUTO_REPLY_QNA_DUPLICATE' : 'AUTO_REPLY_QNA_MOVE_FAILED',
      })
    }
  }
  invalidateShop(shopId)
  return { ok, failed }
}

// ---------------------------------------------------------------------------
// นับการใช้งาน — เรียกจาก processJob หลังส่งสำเร็จ (TFR-032 ข้อ 5)
// ---------------------------------------------------------------------------

/**
 * WARNING: ห้าม throw — ถูกเรียกในเส้นทางตอบลูกค้าที่ส่งข้อความออกไปแล้ว
 * การนับพลาดเสียหายน้อยกว่าการทำให้งานที่ส่งสำเร็จแล้วถูกบันทึกเป็นล้มเหลว
 */
export async function markQnaUsed(qnaId: string): Promise<void> {
  try {
    await prisma.autoReplyQna.update({
      where: { id: qnaId },
      data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
    })
  } catch (e) {
    console.error('[auto-reply-qna] นับการใช้งานล้มเหลว', e instanceof Error ? e.message : e)
  }
}
