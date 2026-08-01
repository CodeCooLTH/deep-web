// feature 00023 Deep Chat-Bot Assistant — phase `00023-qna` S-06 (ขาเขียน) + S-08 (ขาอ่าน/จัดการ)
// SSOT: docs/20 - Features/00023 - Deep Chat-Bot Assistant/SRS.md TFR-033 + DATABASE.md §3.10
//
// คิว "คำถามที่ DeepBot ตอบไม่ได้" — เปลี่ยนกองบันทึกที่เกิดขึ้นเองทุกวันให้เป็นงานที่ทำทีละข้อได้

import { prisma } from '@/lib/prisma'
import { normalizeMessage } from '@/lib/auto-reply-normalize'
import { shouldQueueUnanswered } from '@/lib/auto-reply-unanswered-filter'
import { invalidateShop } from '@/lib/auto-reply-cache'
import { createQna } from '@/services/auto-reply-qna.service'
import type { UnansweredStatus } from '@/lib/auto-reply-constants'

// ---------------------------------------------------------------------------
// ขาเขียน — เรียกจาก processJob ตรงจุดที่ตัดสิน NO_KEYWORD_MATCH (TFR-033)
// ---------------------------------------------------------------------------

/**
 * บันทึกข้อความที่บอทตอบไม่ได้เข้าคิว
 *
 * WARNING: ห้าม throw ทุกกรณี — อยู่ในเส้นทางร้อนของการตอบลูกค้า หลักเดียวกับ `writeLog`
 * (TD-013): คิวพังต้องไม่ทำให้บอทพังหรือทำให้งานค้างสถานะ
 *
 * WARNING: ฟังก์ชันนี้ **ห้ามแตะ `Conversation.handoffAt`** เด็ดขาด — `NO_KEYWORD_MATCH`
 * ต้องไม่ล็อกห้อง (บั๊กจริงบน prod 2026-07-31 ที่ล็อกไป 240 ห้องถาวร) ที่เขียนย้ำไว้ตรงนี้
 * เพราะไฟล์นี้เป็นโค้ดใหม่ที่ถูกเสียบเข้าไปตรงจุดเดียวกับที่เคยเกิดบั๊ก
 */
export async function recordUnanswered(params: {
  shopId: string
  rawText: string
  normalizedText: string
}): Promise<{ queued: boolean; reason?: string }> {
  try {
    const verdict = shouldQueueUnanswered(params.rawText, params.normalizedText)
    if (!verdict.keep) return { queued: false, reason: verdict.reason }

    const normalized = params.normalizedText.trim()

    // upsert รวมแถว: ข้อความเดิมของร้านเดิม = แถวเดียวตลอดกาล นับที่ hitCount
    //
    // WARNING: `update` ตรงนี้ **ไม่แตะ `status`** โดยเจตนา — ข้อที่เคยถูกตอบ (ANSWERED)
    // หรือถูกข้าม (DISMISSED) แล้วยังถูกถามซ้ำ ต้องนับต่อแต่ไม่กลับมาเป็น PENDING
    // ถ้ารีเซ็ต status จะกลายเป็นคิวที่วนไม่จบแล้วร้านจะเลิกเปิด (DATABASE §3.10)
    // ตัวเลข hitCount ที่โตขึ้นทั้งที่ตอบไปแล้ว = หลักฐานว่าคำตอบที่กรอกไว้ match ไม่ติด
    await prisma.autoReplyUnansweredQuestion.upsert({
      where: { shopId_normalizedQuestion: { shopId: params.shopId, normalizedQuestion: normalized } },
      create: {
        shopId: params.shopId,
        normalizedQuestion: normalized,
        rawSample: params.rawText.slice(0, 500),
      },
      update: {
        hitCount: { increment: 1 },
        lastSeenAt: new Date(),
        rawSample: params.rawText.slice(0, 500),
      },
    })
    return { queued: true }
  } catch (e) {
    console.error('[auto-reply-unanswered] บันทึกคิวล้มเหลว', e instanceof Error ? e.message : e)
    return { queued: false, reason: 'WRITE_FAILED' }
  }
}

// ---------------------------------------------------------------------------
// ขาอ่าน / จัดการ (S-08)
// ---------------------------------------------------------------------------

export interface UnansweredItem {
  id: string
  rawSample: string
  normalizedQuestion: string
  hitCount: number
  firstSeenAt: Date
  lastSeenAt: Date
  status: string
  qnaId: string | null
}

export interface UnansweredListResult {
  items: UnansweredItem[]
  pendingCount: number
}

export async function listUnanswered(
  shopId: string,
  opts: { status?: UnansweredStatus; search?: string; take?: number } = {}
): Promise<UnansweredListResult> {
  const status = opts.status ?? 'PENDING'
  const search = opts.search?.trim()

  const [items, pendingCount] = await Promise.all([
    prisma.autoReplyUnansweredQuestion.findMany({
      where: {
        shopId,
        status,
        ...(search ? { rawSample: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      select: {
        id: true,
        rawSample: true,
        normalizedQuestion: true,
        hitCount: true,
        firstSeenAt: true,
        lastSeenAt: true,
        status: true,
        qnaId: true,
      },
      // ที่ถูกถามบ่อยที่สุดอยู่บน — ตรงกับ index [shopId, status, hitCount]
      // ร้านมีเวลาจำกัด ข้อที่ถูกถาม 68 ครั้งคุ้มกว่าข้อที่ถูกถามครั้งเดียว
      orderBy: [{ hitCount: 'desc' }, { lastSeenAt: 'desc' }],
      take: opts.take ?? 100,
    }),
    prisma.autoReplyUnansweredQuestion.count({ where: { shopId, status: 'PENDING' } }),
  ])

  return { items, pendingCount }
}

/**
 * กดข้าม — ไม่ลบแถว
 *
 * เก็บไว้เป็นหลักฐานว่า "ร้านตัดสินใจแล้วว่าข้อนี้ไม่ต้องตอบ" ถ้าลบทิ้ง ข้อความเดิมที่ถูกถาม
 * อีกครั้งจะสร้างแถวใหม่แล้วโผล่กลับขึ้นคิว — ร้านต้องมากดข้ามซ้ำไปเรื่อย ๆ
 */
export async function dismissUnanswered(id: string, shopId: string, actorUserId: string): Promise<void> {
  const result = await prisma.autoReplyUnansweredQuestion.updateMany({
    where: { id, shopId, status: 'PENDING' },
    data: { status: 'DISMISSED', dismissedAt: new Date(), dismissedByUserId: actorUserId },
  })
  if (result.count === 0) throw new Error('AUTO_REPLY_UNANSWERED_NOT_FOUND')
}

/** ยกเลิกการข้าม — กลับเป็น PENDING (รองรับ undo ที่ ux ถามถึง) */
export async function restoreUnanswered(id: string, shopId: string): Promise<void> {
  const result = await prisma.autoReplyUnansweredQuestion.updateMany({
    where: { id, shopId, status: 'DISMISSED' },
    data: { status: 'PENDING', dismissedAt: null, dismissedByUserId: null },
  })
  if (result.count === 0) throw new Error('AUTO_REPLY_UNANSWERED_NOT_FOUND')
}

/**
 * กรอกคำตอบ → สร้างข้อในคลัง + ปิดคิวแถวนั้น
 *
 * WARNING: สองอย่างนี้ต้องอยู่ในทรานแซกชันเดียวกัน — ถ้าสร้าง QnA สำเร็จแล้วปิดคิวพลาด
 * ข้อนั้นจะยังค้างอยู่ในคิวทั้งที่ตอบไปแล้ว ร้านจะกรอกซ้ำแล้วชน unique constraint
 * แล้วเจอ error ที่อธิบายไม่ได้ว่าทำไม ("ก็ยังอยู่ในคิวอยู่เลย")
 */
export async function convertUnansweredToQna(
  id: string,
  shopId: string,
  input: { keywordId: string; question: string; answer: string; imageFileIds?: string[] },
  actorUserId: string
): Promise<{ qnaId: string }> {
  const created = await prisma.$transaction(async (tx) => {
    // อ่านสถานะ "ในทรานแซกชันเดียวกับที่จะเขียน" — ถ้าอ่านนอก tx สองคำขอที่กดพร้อมกัน
    // จะเห็น PENDING ทั้งคู่แล้วสร้าง QnA ซ้ำสองข้อ (unique constraint จับได้แค่ข้อความซ้ำเป๊ะ)
    const row = await tx.autoReplyUnansweredQuestion.findFirst({
      where: { id, shopId },
      select: { id: true, status: true },
    })
    if (!row) throw new Error('AUTO_REPLY_UNANSWERED_NOT_FOUND')
    if (row.status === 'ANSWERED') throw new Error('AUTO_REPLY_UNANSWERED_ALREADY_ANSWERED')

    // createQna ตรวจ ownership ของ keywordId + คำนวณ normalizedQuestion ให้แล้ว
    // ส่ง tx เข้าไปเพื่อให้ทั้งสองคำสั่งล้มพร้อมกัน (cache invalidate ทำหลัง commit ข้างล่าง)
    const qna = await createQna(
      input.keywordId,
      shopId,
      { question: input.question, answer: input.answer, imageFileIds: input.imageFileIds, source: 'QUEUE' },
      actorUserId,
      tx
    )

    await tx.autoReplyUnansweredQuestion.updateMany({
      where: { id, shopId },
      data: { status: 'ANSWERED', qnaId: qna.id },
    })

    return qna
  })

  // หลัง commit เท่านั้น — ล้างก่อน commit จะดูดค่าเก่ากลับเข้า cache ทันที
  invalidateShop(shopId)
  return { qnaId: created.id }
}

/**
 * ปิดคิวจากข้อความในห้องแชท (TFR-037 ข้อ 5) — ใช้เมื่อร้านสร้าง QnA จาก mini action
 * ซึ่งข้อความนั้นอาจเคยถูกบันทึกเข้าคิวไว้แล้วหรือไม่ก็ได้
 *
 * ไม่ throw ถ้าไม่เจอแถว — การไม่มีในคิวเป็นเรื่องปกติ (ข้อความอาจถูกกรองออกตั้งแต่แรก
 * หรือบอทเคยตอบได้แล้วในอดีต) ไม่ใช่ความผิดพลาดที่ต้องหยุดการสร้าง QnA
 */
export async function markAnsweredByText(shopId: string, rawText: string, qnaId: string): Promise<void> {
  try {
    const normalized = normalizeMessage(rawText).trim()
    if (!normalized) return
    await prisma.autoReplyUnansweredQuestion.updateMany({
      where: { shopId, normalizedQuestion: normalized, status: { not: 'ANSWERED' } },
      data: { status: 'ANSWERED', qnaId },
    })
  } catch (e) {
    console.error('[auto-reply-unanswered] ปิดคิวจากห้องแชทล้มเหลว', e instanceof Error ? e.message : e)
  }
}
