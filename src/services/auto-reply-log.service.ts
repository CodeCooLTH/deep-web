import { prisma } from '@/lib/prisma'
import type {
  AutoReplyLogDecision,
  MatchedVia,
  MatchType,
  ResolutionLevel,
  SkipReason,
} from '@/lib/auto-reply-constants'

/**
 * auto-reply-log.service — บันทึกการตัดสินใจของระบบตอบอัตโนมัติ (feature 00023, S-05)
 *
 * SSOT: docs/20 - Features/00023 - Chat Auto-Reply/{SRS.md TFR-025/TFR-026, DATABASE.md §3.6}
 *
 * WARNING: ไฟล์นี้คือ **จุดเดียว** ที่เขียนตาราง `AutoReplyLog` ได้ (S-05 ขอบเขต "ไม่ทำ")
 * ถ้ามีไฟล์อื่นเขียนตรง ๆ เมื่อไหร่ จะไม่มีใครรับประกันได้ว่า `skipReason` ถูกบังคับครบ
 * และ PII ถูกตัดก่อนออกจาก server — reviewer มี grep gate ตรวจข้อนี้
 *
 * WARNING: `rawText` / `normalizedText` คือ **ข้อความลูกค้าดิบ = PII** โปรเจกต์นี้เคยมีบั๊ก PII
 * หลุดผ่าน RSC flight payload มาแล้ว (หน้า Paces อยู่ใต้ client layout → Next serialize ทุก field
 * ที่ server ส่งมา ไม่ใช่เฉพาะที่แสดงผล) ดังนั้น `searchLogs` จึง **ไม่คืน `rawText` ดิบ** ออกไป
 * — คืนเป็นรูปที่ตัดแล้วเท่านั้น (`AutoReplyLogListItem`); ข้อความเต็มอยู่ที่ `getLogDetail` เท่านั้น
 */

/** ความยาวสูงสุดของข้อความที่ยอมให้หลุดออกจาก server boundary ในหน้ารายการ */
const PREVIEW_MAX = 80
/** เพดานจำนวนรายการต่อหน้า — กันหน้าเดียวลากทั้งตาราง */
export const LOG_PAGE_SIZE_MAX = 100
const LOG_PAGE_SIZE_DEFAULT = 30

export class AutoReplyLogValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AutoReplyLogValidationError'
  }
}

export type WriteLogEntry = {
  shopId: string
  conversationId: string
  chatMessageId?: string | null
  rawText?: string | null
  normalizedText?: string | null
  keywordId?: string | null
  matchedPhrase?: string | null
  matchType?: MatchType | null
  matchTrace?: unknown
  ruleId?: string | null
  resolutionLevel?: ResolutionLevel | null
  shopChannelId?: string | null
  adId?: string | null
  productId?: string | null
  decision: AutoReplyLogDecision
  skipReason?: SkipReason | null
  replyText?: string | null
  outboundMessageId?: string | null
  isTest?: boolean
  durationMs?: number | null
  errorMessage?: string | null
  // --- phase 00023-qna (2026-07-31) ---
  // ที่มาของคำตอบ: 'KEYWORD' = เข้ากลุ่มเพราะคำตรงตัว | 'QNA' = เข้ากลุ่มเพราะข้อในคลังคำถาม
  // null = ยังไม่ถึงขั้นจับคู่ (ถูกตัดที่ gate ก่อนหน้า) — ป้าย DeepBot อ่านค่านี้ตรง ๆ
  matchedVia?: MatchedVia | null
  qnaId?: string | null
  /** ข้อมูลที่ AI ใช้ประกอบการตอบ (feature 00023) — 🛑 ห้ามใส่ PII */
  aiContext?: unknown
}

/**
 * writeLog — เขียนบันทึก 1 รายการ
 *
 * WARNING: ห้ามเรียกฟังก์ชันนี้ภายใน `prisma.$transaction` เดียวกับการส่งข้อความ (TD-013)
 * บันทึกพังต้องไม่ rollback การส่งที่สำเร็จไปแล้ว — ลูกค้าได้ข้อความไปแล้วจริง ๆ การ rollback
 * ทำให้ระบบเข้าใจว่ายังไม่ได้ส่งแล้วส่งซ้ำ ซึ่งเสียหายกว่าการเสียบันทึกหนึ่งแถว
 *
 * ตัว caller ควรห่อด้วย try/catch แล้วปล่อยผ่าน (log ที่ console) ไม่ใช่โยนต่อ
 */
export async function writeLog(entry: WriteLogEntry) {
  // AC-024-02: กรณีที่ "ไม่ตอบ" ต้องบอกเหตุผลได้เสมอ — บันทึกเฉพาะตอนตอบทำให้ตอบคำถาม
  // ที่ร้านถามบ่อยที่สุด ("ทำไมมันไม่ตอบ") ไม่ได้เลย ซึ่งจะจบลงที่ร้านปิดฟีเจอร์ทิ้ง
  if (entry.decision !== 'REPLIED' && !entry.skipReason) {
    throw new AutoReplyLogValidationError(
      `decision=${entry.decision} ต้องมี skipReason เสมอ (AC-024-02)`,
    )
  }

  return prisma.autoReplyLog.create({
    data: {
      shopId: entry.shopId,
      conversationId: entry.conversationId,
      chatMessageId: entry.chatMessageId ?? null,
      rawText: entry.rawText ?? null,
      normalizedText: entry.normalizedText ?? null,
      keywordId: entry.keywordId ?? null,
      matchedPhrase: entry.matchedPhrase ?? null,
      matchType: entry.matchType ?? null,
      // Prisma Json รับ undefined ไม่ได้ ต้องแปลงเป็น null ให้ชัด
      matchTrace: (entry.matchTrace ?? null) as never,
      ruleId: entry.ruleId ?? null,
      matchedVia: entry.matchedVia ?? null,
      qnaId: entry.qnaId ?? null,
      // Prisma Json รับ undefined ไม่ได้ เหมือน matchTrace
      aiContext: (entry.aiContext ?? null) as never,
      resolutionLevel: entry.resolutionLevel ?? null,
      shopChannelId: entry.shopChannelId ?? null,
      adId: entry.adId ?? null,
      productId: entry.productId ?? null,
      decision: entry.decision,
      skipReason: entry.skipReason ?? null,
      replyText: entry.replyText ?? null,
      outboundMessageId: entry.outboundMessageId ?? null,
      isTest: entry.isTest ?? false,
      durationMs: entry.durationMs ?? null,
      errorMessage: entry.errorMessage ?? null,
    },
  })
}

export type SearchLogFilter = {
  conversationId?: string
  externalContactId?: string
  shopChannelId?: string
  adId?: string
  productId?: string
  keywordId?: string
  decision?: AutoReplyLogDecision
  skipReason?: SkipReason
  resolutionLevel?: ResolutionLevel
  isTest?: boolean
  /** มีค่า = กรองเฉพาะรายการที่มี errorMessage (AC-024-03 "ประเภทข้อผิดพลาด") */
  hasError?: boolean
  from?: Date
  to?: Date
  page?: number
  pageSize?: number
}

/** รูปที่ปลอดภัยพอจะข้าม server boundary — ไม่มีข้อความลูกค้าดิบ */
export type AutoReplyLogListItem = {
  id: string
  createdAt: Date
  conversationId: string
  decision: AutoReplyLogDecision
  skipReason: SkipReason | null
  resolutionLevel: ResolutionLevel | null
  keywordId: string | null
  matchedPhrase: string | null
  matchType: MatchType | null
  shopChannelId: string | null
  adId: string | null
  productId: string | null
  /** ตัดสั้น — ข้อความเต็มของลูกค้าไม่ออกจาก server ในหน้ารายการ */
  messagePreview: string | null
  replyPreview: string | null
  isTest: boolean
  durationMs: number | null
  hasError: boolean
}

/** ตัดข้อความให้สั้นพอสำหรับหน้ารายการ — ไม่ใช่การเข้ารหัส แค่ลดปริมาณ PII ที่ออกจาก server */
function preview(text: string | null): string | null {
  if (!text) return null
  const t = text.trim()
  if (t.length <= PREVIEW_MAX) return t
  return `${t.slice(0, PREVIEW_MAX)}…`
}

/**
 * searchLogs — ค้นบันทึกของร้าน (AC-024-03)
 *
 * WARNING: `shopId` อยู่ใน `WHERE` เสมอ ห้าม post-filter ใน JS (NFR-Sec ของโปรเจกต์)
 * WARNING: ไม่คืน `rawText` / `normalizedText` / `errorMessage` ดิบ — คืนเฉพาะรูปที่ตัดแล้ว
 *    (ดู `getLogDetail` ถ้าต้องการรายละเอียดเต็มของรายการเดียว)
 */
export async function searchLogs(shopId: string, filter: SearchLogFilter = {}) {
  const pageSize = Math.min(Math.max(filter.pageSize ?? LOG_PAGE_SIZE_DEFAULT, 1), LOG_PAGE_SIZE_MAX)
  const page = Math.max(filter.page ?? 1, 1)

  const where = {
    shopId, // ← ห้ามย้ายออกจากตรงนี้ไปกรองใน JS
    ...(filter.conversationId ? { conversationId: filter.conversationId } : {}),
    ...(filter.shopChannelId ? { shopChannelId: filter.shopChannelId } : {}),
    ...(filter.adId ? { adId: filter.adId } : {}),
    ...(filter.productId ? { productId: filter.productId } : {}),
    ...(filter.keywordId ? { keywordId: filter.keywordId } : {}),
    ...(filter.decision ? { decision: filter.decision } : {}),
    ...(filter.skipReason ? { skipReason: filter.skipReason } : {}),
    ...(filter.resolutionLevel ? { resolutionLevel: filter.resolutionLevel } : {}),
    ...(filter.isTest !== undefined ? { isTest: filter.isTest } : {}),
    ...(filter.hasError !== undefined
      ? { errorMessage: filter.hasError ? { not: null } : null }
      : {}),
    // ค้นตามผู้ติดต่อ: log ไม่ได้เก็บ contact ตรง ๆ (ผูกผ่านเธรด) — join ที่ระดับ query
    // ไม่ใช่ดึงมาแล้วกรองทีหลัง
    ...(filter.externalContactId
      ? { conversation: { externalContactId: filter.externalContactId } }
      : {}),
    ...(filter.from || filter.to
      ? {
          createdAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {}),
          },
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.autoReplyLog.findMany({
      where,
      // allow-list ที่ระดับ select ไม่ใช่ตัดทีหลัง — บทเรียน PII ของโปรเจกต์นี้ชัดเจนว่า
      // "ดึงมาแล้วค่อยตัดตอนแสดงผล" ไม่ปลอดภัยพอ (ai-context.service.ts TD-004)
      select: {
        id: true,
        createdAt: true,
        conversationId: true,
        decision: true,
        skipReason: true,
        resolutionLevel: true,
        keywordId: true,
        matchedPhrase: true,
        matchType: true,
        shopChannelId: true,
        adId: true,
        productId: true,
        rawText: true,
        replyText: true,
        isTest: true,
        durationMs: true,
        errorMessage: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.autoReplyLog.count({ where }),
  ])

  const items: AutoReplyLogListItem[] = rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    conversationId: r.conversationId,
    decision: r.decision as AutoReplyLogDecision,
    skipReason: r.skipReason as SkipReason | null,
    resolutionLevel: r.resolutionLevel as ResolutionLevel | null,
    keywordId: r.keywordId,
    matchedPhrase: r.matchedPhrase,
    matchType: r.matchType as MatchType | null,
    shopChannelId: r.shopChannelId,
    adId: r.adId,
    productId: r.productId,
    messagePreview: preview(r.rawText),
    replyPreview: preview(r.replyText),
    isTest: r.isTest,
    durationMs: r.durationMs,
    // ส่งแค่ "มี/ไม่มี" ไม่ส่งเนื้อ error ออกไป — ข้อความ error อาจมี id ภายใน/ชิ้นส่วน payload
    hasError: r.errorMessage !== null,
  }))

  return { items, total, page, pageSize }
}

/**
 * getLogDetail — รายละเอียดเต็มของบันทึกรายการเดียว (AC-011-04 ต้องดู `matchTrace` ได้)
 *
 * WARNING: `shopId` อยู่ใน `WHERE` ไม่ใช่ตรวจหลัง `findUnique` — การ `findUnique` แล้วค่อยเช็ค
 * เจ้าของทีหลังทำให้ข้อมูลถูก serialize เข้า RSC flight ไปแล้วก่อนจะ redirect
 * (memory `feedback_rsc_dal_authz` — บั๊กจริงของโปรเจกต์นี้)
 */
export async function getLogDetail(shopId: string, logId: string) {
  return prisma.autoReplyLog.findFirst({
    where: { id: logId, shopId },
    select: {
      id: true,
      createdAt: true,
      conversationId: true,
      chatMessageId: true,
      rawText: true,
      normalizedText: true,
      keywordId: true,
      matchedPhrase: true,
      matchType: true,
      matchTrace: true,
      ruleId: true,
      resolutionLevel: true,
      shopChannelId: true,
      adId: true,
      productId: true,
      decision: true,
      skipReason: true,
      replyText: true,
      outboundMessageId: true,
      isTest: true,
      durationMs: true,
      errorMessage: true,
    },
  })
}

/**
 * deleteOldLogs — retention 90 วัน (DATABASE.md §6) เรียกจาก cron sweeper เท่านั้น
 * คืนจำนวนแถวที่ลบ เพื่อให้ cron รายงานได้
 */
export async function deleteOldLogs(olderThan: Date) {
  const { count } = await prisma.autoReplyLog.deleteMany({
    where: { createdAt: { lt: olderThan } },
  })
  return count
}
