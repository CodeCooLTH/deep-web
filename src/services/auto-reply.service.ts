import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isWithinSchedule } from '@/lib/auto-reply-schedule'
import { normalizeMessage } from '@/lib/auto-reply-normalize'
import { getRuleSetCache, setRuleSetCache } from '@/lib/auto-reply-cache'
import type { SkipReason } from '@/lib/auto-reply-constants'
import { getConfig } from '@/services/auto-reply-config.service'
import {
  matchKeywords,
  resolveRule,
  type MatchContext,
  type RuleSet,
} from '@/services/auto-reply-match.service'
import { writeLog } from '@/services/auto-reply-log.service'
import { sendAutoReply } from '@/services/auto-reply-send.service'
// phase 00023-qna — คลังคำถาม-คำตอบ (วิธีจับคู่ทางที่สอง) + คิวคำถามที่ตอบไม่ได้
import { answerFromKnowledge, isChatbotWithinWindow } from '@/services/ai-enhance.service'
import { redactPii } from '@/lib/pii-redact'
import { checkCapBeforeCall, recordUsageAndBill } from '@/services/ai-enhance-billing.service'

/**
 * auto-reply.service — คิวและตัวประมวลผลของระบบตอบอัตโนมัติ (feature 00023, S-07)
 *
 * SSOT: docs/20 - Features/00023 - Chat Auto-Reply/SDS.md {TD-001, TD-002, TD-003, TD-007, TD-008}
 *       + PRD.md §4.3 (ลำดับ gate 9 ข้อ)
 *
 * WARNING: นี่คือจุดที่ "ตอบซ้ำ" จะเกิดถ้าทำพลาด การกันซ้ำไม่ได้อยู่ในโค้ดไฟล์นี้ แต่อยู่ที่
 * `AutoReplyJob.chatMessageId @unique` ระดับฐานข้อมูล (TD-002) — ไฟล์นี้มีหน้าที่ "ไม่ทำลาย"
 * การรับประกันนั้น ห้ามเพิ่มเส้นทางที่ส่งข้อความโดยไม่ผ่านการ claim งานสำเร็จก่อน
 */

/** งานที่ค้างสถานะ PROCESSING นานกว่านี้ถือว่า worker ตายกลางคัน */
const STUCK_AFTER_MS = 5 * 60_000
/** เพดานงานต่อการเรียกหนึ่งครั้ง — กัน after() ตัวเดียวลากงานทั้งร้าน */
const DEFAULT_BATCH = 5
/** ลองใหม่ได้กี่ครั้งก่อนยอมแพ้แล้วส่งต่อพนักงาน (AC-023-04) */
const MAX_JOB_ATTEMPTS = 3

// ---------------------------------------------------------------------------
// enqueue
// ---------------------------------------------------------------------------

export type EnqueueResult = { enqueued: boolean; reason?: string; jobId?: string }

export type EnqueueParams = {
  chatMessageId: string
  conversationId: string
  shopId: string
  senderRole: string
  /**
   * true เมื่อ `event.message.text` มีเนื้อความจริงจากลูกค้า (TD-007)
   *
   * WARNING: ห้ามเปลี่ยนไปดู `ChatMessage.body` แทน — `ingestInboundMessage` เขียน placeholder
   * ภาษาไทยลง body เองเมื่อ mirror ไฟล์ไม่ผ่าน เช่น "[ลูกค้าส่งรูปภาพ — เปิดดูใน Messenger]",
   * "[ตำแหน่งที่ตั้ง] เปิดใน Google Maps: ...", "[ไฟล์แนบ — เปิดดูใน Messenger]"
   * ร้านที่มีกลุ่มคำ "รูป" / "ที่อยู่" / "แนบ" จะโดนระบบตอบราคาสินค้าใส่ตอนลูกค้าส่งสติกเกอร์
   * และบันทึกจะดูเหมือนลูกค้าพิมพ์เอง ซึ่งหาสาเหตุยากมาก
   * เงื่อนไขนี้ยังกันเคส "หลายรูปใน event เดียว" (mid#i หลายแถว) ไปในตัว
   */
  hasCustomerText: boolean
}

/**
 * enqueueAutoReplyJob — สร้างงาน 1 ชิ้นต่อข้อความลูกค้า 1 ข้อความ
 *
 * WARNING: ฟังก์ชันนี้ **ห้าม throw ทุกกรณี** (TD-008) เพราะถูกเรียกจาก webhook ที่ถ้าล้ม
 * จะทำให้ Meta retry ทั้ง batch แล้วปัญหาบานปลายแทนที่จะหาย — การไม่ได้ตอบลูกค้าหนึ่งคน
 * เสียหายน้อยกว่าการทำให้ webhook ของทั้งเพจล้ม
 */
export async function enqueueAutoReplyJob(params: EnqueueParams): Promise<EnqueueResult> {
  try {
    if (params.senderRole !== 'BUYER') return { enqueued: false, reason: 'OUTBOUND_MESSAGE' }
    if (!params.hasCustomerText) return { enqueued: false, reason: 'NO_CUSTOMER_TEXT' }

    const job = await prisma.autoReplyJob.create({
      data: {
        chatMessageId: params.chatMessageId,
        conversationId: params.conversationId,
        shopId: params.shopId,
        status: 'PENDING',
      },
      select: { id: true },
    })
    return { enqueued: true, jobId: job.id }
  } catch (e) {
    // P2002 ที่ chatMessageId = มีงานของข้อความนี้อยู่แล้ว (Meta ส่งซ้ำ) ไม่ใช่ error
    // นี่คือกลไกกันตอบซ้ำทำงานถูกต้อง ไม่ใช่ความผิดปกติ
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('P2002') || msg.includes('Unique constraint')) {
      return { enqueued: false, reason: 'DUPLICATE_JOB' }
    }
    console.error('[auto-reply] enqueue ล้มเหลว', msg)
    return { enqueued: false, reason: 'ENQUEUE_FAILED' }
  }
}

// ---------------------------------------------------------------------------
// claim
// ---------------------------------------------------------------------------

/**
 * claimJob — คว้างานแบบ atomic
 *
 * WARNING: ต้องใช้ conditional `updateMany` แล้วตัดสินจาก `count` เท่านั้น
 * ห้ามใช้ `findFirst` แล้วค่อย `update` เด็ดขาด — ระหว่างสองคำสั่งนั้นมีช่องให้ worker อีกตัว
 * (cron sweeper กับ after() ของ webhook ทำงานพร้อมกันได้จริง) คว้างานเดียวกันไปด้วย
 * ผลคือลูกค้าได้คำตอบสองครั้ง ซึ่งเป็นสิ่งที่ AC-017-01 ห้ามเด็ดขาด
 * (หลักเดียวกับ atomic deduct ของ wallet.service)
 */
export async function claimJob(jobId: string, lockedBy: string): Promise<boolean> {
  const { count } = await prisma.autoReplyJob.updateMany({
    where: { id: jobId, status: 'PENDING' },
    data: { status: 'PROCESSING', lockedAt: new Date(), lockedBy, attempts: { increment: 1 } },
  })
  return count === 1
}

// ---------------------------------------------------------------------------
// rule set loader (+ cache)
// ---------------------------------------------------------------------------

/** โหลดกลุ่มคำ+กฎของร้าน (เฉพาะที่ไม่ใช่ OFFLINE) พร้อม cache 60 วิ — config ไม่ถูก cache (TD-004) */
export async function loadRuleSet(shopId: string): Promise<RuleSet> {
  const cached = getRuleSetCache<RuleSet>(shopId)
  if (cached) return cached

  const [keywords, rules, qnas] = await Promise.all([
    prisma.autoReplyKeyword.findMany({
      // OFFLINE ไม่ต้องโหลดเลย — ไม่มีทางตอบใครได้ การกรองที่ query ทำให้ไม่เสียแรง match ฟรี ๆ
      where: { shopId, status: { not: 'OFFLINE' } },
      select: {
        id: true,
        name: true,
        matchType: true,
        priority: true,
        // สถานะรายกลุ่ม ใช้ตัดสินที่ gate หลัง match ว่าตัวนี้ตอบเธรดนี้ได้ไหม
        status: true,
        testThreads: { select: { conversationId: true } },
        phrases: { select: { id: true, phrase: true, normalizedPhrase: true } },
        // AI Enhance (phase `00023-ai-enhance`) — โหลดมาพร้อม ruleSet เพื่อไม่ให้เพิ่ม query
        // ในเส้นทางร้อน; กฎห้ามตอบจะ query แยกเฉพาะกลุ่มที่เปิดสวิตช์จริงเท่านั้น
        aiEnhanceEnabled: true,
        aiTone: true,
      },
      orderBy: { priority: 'desc' },
    }),
    prisma.autoReplyRule.findMany({
      where: { shopId, isActive: true },
      select: {
        id: true,
        keywordId: true,
        shopChannelId: true,
        adId: true,
        productId: true,
        specificity: true,
        isActive: true,
        activeFrom: true,
        activeUntil: true,
        replyText: true,
        createdAt: true,
      },
    }),
    // คลังคำถาม-คำตอบ (phase 00023-qna) — โหลดในรอบเดียวกันและใช้ cache ก้อนเดียวกัน
    // ไม่กรอง keywordId ที่นี่: matchQna ตัดข้อของกลุ่ม OFFLINE ทิ้งเองด้วยการเทียบกับ
    // รายการกลุ่มที่ส่งเข้าไป (ซึ่ง query ด้านบนกรอง OFFLINE ออกแล้ว) — จุดตัดสินเดียว ไม่มีเงื่อนไขคู่ขนาน
    prisma.autoReplyQna.findMany({
      where: { shopId, isActive: true },
      select: {
        id: true,
        keywordId: true,
        question: true,
        normalizedQuestion: true,
        answer: true,
        imageFileIds: true,
        isActive: true,
        useCount: true,
      },
    }),
  ])

  const ruleSet = {
    keywords: keywords.map((k) => ({
      ...k,
      testConversationIds: k.testThreads.map((t) => t.conversationId),
    })),
    rules,
    qnas,
  } as RuleSet
  setRuleSetCache(shopId, ruleSet)
  return ruleSet
}

// ---------------------------------------------------------------------------
// processJob
// ---------------------------------------------------------------------------

type JobRow = {
  id: string
  chatMessageId: string
  conversationId: string
  shopId: string
  attempts: number
}

/** ปิดงานพร้อมเขียนบันทึก — บันทึกพังต้องไม่ทำให้สถานะงานค้าง (TD-013) */
/**
 * ปิดงาน + เขียนบันทึก
 *
 * `startedAt` เป็นพารามิเตอร์บังคับเพื่อให้ `durationMs` ถูกคำนวณ **ตอนเขียนจริง** เสมอ
 *
 * WARNING: เดิมค่านี้อยู่ใน object `common` ซึ่งถูกสร้างครั้งเดียวก่อนถึงด่าน AI แล้วทุก
 * สาขาเอาค่าค้างนั้นไปใช้ — บันทึกจึงรายงาน 42-95ms ทั้งที่เรียก Gemini ไปหลายวินาที
 * (เจอตอน user ไล่ดูว่าทำไมบอทไม่ตอบ 2026-08-01) คำนวณที่นี่จุดเดียวแปลว่าสาขาใหม่
 * ที่ใครเพิ่มทีหลังได้ค่าถูกอัตโนมัติ ไม่มีอะไรให้ลืม
 */
async function finish(
  job: JobRow,
  status: 'DONE' | 'SKIPPED' | 'FAILED',
  log: Parameters<typeof writeLog>[0],
  startedAt: number,
) {
  await prisma.autoReplyJob.update({ where: { id: job.id }, data: { status } })
  try {
    await writeLog({ ...log, durationMs: Date.now() - startedAt })
  } catch (e) {
    console.error('[auto-reply] เขียนบันทึกล้มเหลว', e instanceof Error ? e.message : e)
  }
}

/**
 * processJob — ประมวลผลงาน 1 ชิ้น
 *
 * ลำดับ gate ตาม PRD §4.3 — WARNING: ห้ามสลับลำดับ โดยเฉพาะ gate โหมดทดสอบ (ข้อ 2)
 * ต้องอยู่ก่อนการโหลดกฎและการ match ซึ่งเป็นงานที่มีต้นทุน (AC-021-09)
 */
export async function processJob(jobId: string, lockedBy = 'after'): Promise<void> {
  const claimed = await claimJob(jobId, lockedBy)
  if (!claimed) return // worker อื่นคว้าไปแล้ว — ไม่ใช่ error

  const startedAt = Date.now()

  const job = await prisma.autoReplyJob.findUnique({
    where: { id: jobId },
    select: { id: true, chatMessageId: true, conversationId: true, shopId: true, attempts: true },
  })
  if (!job) return

  const base = { shopId: job.shopId, conversationId: job.conversationId, chatMessageId: job.chatMessageId }

  try {
    const message = await prisma.chatMessage.findUnique({
      where: { id: job.chatMessageId },
      select: { body: true, senderRole: true, autoReplyKind: true, type: true, imageUrl: true, createdAt: true },
    })

    // gate 0 — ข้อความฝั่งร้าน (รวมคำตอบของบอทเอง) ห้ามนำมาตรวจจับเด็ดขาด (BR-AR-22)
    if (!message || message.senderRole !== 'BUYER') {
      return finish(job, 'SKIPPED', { ...base, decision: 'SKIPPED', skipReason: 'OUTBOUND_MESSAGE' }, startedAt)
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: job.conversationId, shopId: job.shopId },
      select: {
        id: true,
        isSpam: true,
        handoffAt: true,
        autoReplyEnabled: true,
        autoReplyPausedUntil: true,
        autoReplyCount: true,
        shopChannelId: true,
        contextProductId: true,
        referralAdId: true,
      },
    })
    if (!conversation) {
      return finish(job, 'SKIPPED', { ...base, decision: 'SKIPPED', skipReason: 'CONVERSATION_DISABLED' }, startedAt)
    }

    const config = await getConfig(job.shopId)

    // gate 1 — สวิตช์ระดับเธรด (แอดมินปิดเธรดนี้เองจากกล่องข้อความ)
    //
    // WARNING: สวิตช์ระดับร้าน (AutoReplyConfig.isEnabled) ถูกถอดออกจากเส้นทางตัดสิน 2026-07-30
    // ตามคำสั่ง user: "ไม่มีแล้วสิ ปิดทั้งหมด ให้ user ปิดเอง ในแต่ละ row"
    // ความปลอดภัยเดิม (ระบบต้องไม่ทำงานจนกว่าร้านจะสั่ง) ยังอยู่ครบ เพราะกลุ่มคำที่สร้างใหม่
    // เป็น OFFLINE เสมอ — ไม่มีทางตอบใครจนกว่าร้านจะเปลี่ยนสถานะเอง
    if (conversation.autoReplyEnabled === false) {
      return finish(job, 'SKIPPED', { ...base, decision: 'SKIPPED', skipReason: 'CONVERSATION_DISABLED' }, startedAt)
    }

    // WARNING: gate 2 เดิม (โหมดทดสอบระดับร้าน) ถูกลบ 2026-07-29 — โหมดทดสอบผูกกับกลุ่มคำแล้ว
    // ตัดสินที่ gate 6.5 หลัง match แทน ดู AutoReplyKeyword.status

    // gate 3-5 — สถานะเธรด
    if (conversation.isSpam) {
      return finish(job, 'SKIPPED', { ...base, decision: 'SKIPPED', skipReason: 'SPAM' }, startedAt)
    }
    if (conversation.handoffAt) {
      return finish(job, 'SKIPPED', { ...base, decision: 'SKIPPED', skipReason: 'HANDED_OFF' }, startedAt)
    }
    if (conversation.autoReplyPausedUntil && conversation.autoReplyPausedUntil > new Date()) {
      return finish(job, 'SKIPPED', { ...base, decision: 'SKIPPED', skipReason: 'PAUSED_HUMAN_TAKEOVER' }, startedAt)
    }

    // gate 6 — เพดานจำนวนคำตอบต่อเธรด (AC-018-02) ครบแล้วส่งต่อพนักงาน
    if (conversation.autoReplyCount >= config.maxRepliesPerConversation) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { handoffAt: new Date(), handoffReason: 'MAX_REPLIES_REACHED' },
      })
      return finish(job, 'SKIPPED', { ...base, decision: 'HANDOFF', skipReason: 'MAX_REPLIES_REACHED' }, startedAt)
    }

    // --- ถึงตรงนี้ค่อยเริ่มงานที่มีต้นทุน ---
    const rawText = message.body ?? ''
    const normalizedText = normalizeMessage(rawText)
    const ruleSet = await loadRuleSet(job.shopId)

    const ctx: MatchContext = {
      shopChannelId: conversation.shopChannelId,
      adId: conversation.referralAdId,
      productId: conversation.contextProductId,
      now: new Date(),
    }

    const matched = matchKeywords(normalizedText, ruleSet, ctx)

    /**
     * คลังคำถาม-คำตอบ — วิธีจับคู่ "ทางที่สอง" (phase 00023-qna, TFR-032)
     *
     * WARNING: เรียก **เฉพาะเมื่อไม่มีกลุ่มคำใดตรง** เท่านั้น — "คำตรงตัวชนะก่อนเสมอ"
     * (user decisions 2026-07-31 §3) และ **ไม่** เรียกตอน NO_RULE_MATCH:
     * กลุ่มคำตรงแต่ไม่มีกฎ = ร้านตั้งค่าค้างไว้ครึ่งทาง ซึ่งร้านต้องเห็นว่าค้าง
     * ถ้าปล่อยให้คลังมาตอบแทน อาการ "ตั้งกฎไว้แล้วไม่เคยถูกใช้" จะถูกกลบและไล่ไม่เจอ
     */
    // ตัดเส้นทาง "จับคู่ตรงตัวจากคลังรายกลุ่มคำ" ออก 2026-08-02 (user สั่ง) —
    // DeepBot อ่านคลังความรู้ระดับร้านแล้วตอบเองครอบคลุมกว่า การมีสองทางที่อ่านตารางเดียวกัน
    // แต่ตัดสินคนละแบบ ทำให้ไล่ไม่ออกว่าคำตอบมาจากไหน

    /**
     * กลุ่มคำที่ "เป็นเจ้าของ" คำตอบครั้งนี้ — มาจากคำตรงตัว หรือจากกลุ่มที่ QnA ยืมมา
     *
     * WARNING: ตัวแปรนี้คือหัวใจของ TFR-032 ข้อ 2 — gate 6.5 (สถานะ), 6.6 (เวลาทำงาน)
     * และ 7 (cooldown) ทั้งหมดต้องอ่านค่านี้ ไม่ใช่ `matched.winner` ตรง ๆ
     * ถ้าลัดให้ QnA ข้าม gate เหล่านี้ มันจะกลายเป็นช่องทางที่ข้ามสถานะ OFFLINE/TEST,
     * ข้ามตารางเวลา และข้าม cooldown ได้ทั้งหมด = กับดัก "สวิตช์คนละที่" ตัวเดียวกับที่
     * ถูกรื้อทิ้งเมื่อ 2026-07-30 และเป็นเหตุผลที่ user เลือกให้คลังอยู่ในกลุ่มตั้งแต่แรก
     */
    const effectiveKeywordId = matched.winner?.keywordId ?? null
    const matchedVia: 'KEYWORD' | null = matched.winner ? 'KEYWORD' : null

    // gate 6.5 — สถานะของ "กลุ่มคำที่ชนะ" (feature 00023, user 2026-07-29)
    //
    // WARNING: ต้องเช็ค **หลัง match** เพราะสถานะผูกกับกลุ่มคำแต่ละชุด ไม่ใช่ทั้งร้าน
    // ชุด TEST ตอบได้เฉพาะเธรดที่ผูกไว้กับชุดนั้น ส่วนชุด LIVE ทำงานปกติในเธรดเดียวกัน
    // นี่คือสิ่งที่ทำให้ "ปล่อยของทีละชุด" ได้โดยไม่กระทบชุดที่ใช้งานจริงอยู่
    // (OFFLINE ไม่ต้องเช็คที่นี่ — ไม่ถูกโหลดเข้า ruleSet ตั้งแต่แรก)
    const winner = ruleSet.keywords.find((k) => k.id === effectiveKeywordId)
    const isTestReply = winner?.status === 'TEST'
    if (isTestReply && !(winner?.testConversationIds ?? []).includes(conversation.id)) {
      return finish(job, 'SKIPPED', {
        ...base,
        decision: 'SKIPPED',
        skipReason: 'KEYWORD_TEST_ONLY',
        rawText,
        normalizedText,
        keywordId: effectiveKeywordId,
        matchedVia,
      }, startedAt)
    }

    // gate 6.6 — เวลาทำงานของร้าน (user 2026-07-31: "ทำงานช่วง 18.00-9.00 แทน admin ตอนหลับ")
    //
    // WARNING: อยู่ **หลัง** gate 6.5 ทั้งที่เป็นการเช็คที่ถูกกว่ามาก เพราะต้องรู้ก่อนว่ากลุ่มที่ชนะ
    // อยู่สถานะ TEST ไหม — ร้านที่ตั้งเวลาไว้ 18:00-09:00 แล้วมานั่งทดสอบตอนบ่าย จะเจอบอทเงียบ
    // โดยไม่มีเหตุผลให้ดู ซึ่งเป็นบทเรียนเดียวกับ cooldown ที่แก้ไปเมื่อเช้าวันเดียวกัน
    // ต้นทุนที่จ่ายเพิ่มคือการ match ในหน่วยความจำที่ทำไปแล้ว ไม่ใช่ query ใหม่
    if (!isTestReply && !isWithinSchedule(config, new Date())) {
      return finish(job, 'SKIPPED', {
        ...base,
        decision: 'SKIPPED',
        skipReason: 'OUTSIDE_SCHEDULE',
        rawText,
        normalizedText,
        keywordId: effectiveKeywordId,
        matchedVia,
      }, startedAt)
    }

    // gate 7 — cooldown ของกลุ่มคำเดิมในเธรดเดิม (AC-018-01)
    //
    // ยกเว้นกลุ่มที่อยู่สถานะ TEST (user 2026-07-31): cooldown มีไว้กันลูกค้าโดนตอบซ้ำถี่ ๆ
    // แต่คนที่กำลังทดสอบ **ตั้งใจ** ยิงคำเดิมรัว ๆ เพื่อดูว่าตั้งค่าถูกไหม พอโดน cooldown
    // ปิดปากบอทเงียบ ๆ อาการที่เห็นคือ "ตั้งแล้วไม่ทำงาน" ซึ่งแยกไม่ออกจากบั๊กจริง
    // (user เจอกับตัว 2 รอบในสิบนาที) — ลูกค้าจริงไม่ได้รับผลกระทบ เพราะกลุ่ม TEST
    // ตอบเฉพาะเธรดที่ร้านเลือกเองไว้ที่ gate 6.5 อยู่แล้ว
    // WARNING: เงื่อนไขเป็น `effectiveKeywordId` ไม่ใช่ `matched.winner` — คำตอบจากคลังต้องติด
    // cooldown เดียวกับคำตอบของกลุ่มนั้น ไม่งั้นลูกค้าที่พิมพ์คำถามเดิมรัว ๆ จะโดนตอบซ้ำทุกครั้ง
    if (effectiveKeywordId && config.keywordCooldownSec > 0 && !isTestReply) {
      const since = new Date(Date.now() - config.keywordCooldownSec * 1000)
      const recent = await prisma.autoReplyLog.findFirst({
        where: {
          shopId: job.shopId,
          conversationId: job.conversationId,
          keywordId: effectiveKeywordId,
          decision: 'REPLIED',
          createdAt: { gte: since },
        },
        select: { id: true },
      })
      if (recent) {
        return finish(job, 'SKIPPED', {
          ...base,
          decision: 'SKIPPED',
          skipReason: 'KEYWORD_COOLDOWN',
          rawText,
          normalizedText,
          keywordId: effectiveKeywordId,
          matchedVia,
        }, startedAt)
      }
    }

    /**
     * WARNING: คำตอบจากคลัง **ไม่ผ่าน `resolveRule`** — คลังมีคำตอบของตัวเองอยู่แล้ว (TFR-032 ข้อ 3)
     * ข้าม resolveRule ไปเลยเมื่อชนะด้วย QnA เพื่อไม่ให้กฎกลางของร้าน (ระดับ PAGE_DEFAULT/
     * SHOP_DEFAULT) มาแย่งคำตอบที่ร้านกรอกไว้เจาะจงกับคำถามนั้น
     */
    const resolved = resolveRule(effectiveKeywordId, ctx, ruleSet)

    const trace = {
      match: matched.matchTrace,
      fallbackFrom: resolved?.fallbackFrom ?? [],
    }
    const common = {
      ...base,
      rawText,
      normalizedText,
      keywordId: effectiveKeywordId,
      // คำที่ตรง/วิธีจับ มีเฉพาะเส้นทางคำตรงตัว — เส้นทางคลังใช้ทั้งประโยค ไม่มี "คำ" ที่ตรง
      matchedPhrase: matched.winner?.matchedPhrase ?? null,
      matchType: matched.winner?.matchType ?? null,
      matchTrace: trace,
      shopChannelId: ctx.shopChannelId,
      adId: ctx.adId,
      productId: ctx.productId,
      // 'QNA' ไม่มีทางออกจาก getResolutionLevel() — เซ็ตตรงนี้จุดเดียว (TFR-032 ข้อ 3)
      resolutionLevel: resolved?.resolutionLevel ?? 'NONE',
      ruleId: resolved?.rule?.id ?? null,
      matchedVia,
      isTest: isTestReply,
    }

    // gate 8-9 — ไม่มีกลุ่มคำตรง หรือถอยจนไม่เหลือกฎ = เงียบแล้วส่งต่อคน ห้ามเดา (BR-AR-08)
    //
    // WARNING: "มีคำตอบ" = มีข้อความ **หรือมีรูป** (TFR-036 ข้อ 6) — คำตอบที่เป็นรูปล้วน
    // (ซึ่งอนุญาต มิเรอร์ QuickMessage.body ที่ว่างได้ถ้ามีรูป) ต้องไม่ถูกตัดทิ้งเป็น
    // EMPTY_REPLY แล้วล็อกห้องด้วย handoffAt
    const replyText = resolved?.rule?.replyText?.trim() ?? ''
    const replyImages: string[] = []
    if (!replyText && replyImages.length === 0) {
      let chatbotReason: string | null = null
      const reason: SkipReason = !effectiveKeywordId
        ? 'NO_KEYWORD_MATCH'
        : resolved?.rule
          ? 'EMPTY_REPLY'
          : 'NO_RULE_MATCH'

      /**
       * WARNING: `NO_KEYWORD_MATCH` ต้อง **ไม่** เขียน `handoffAt` (บั๊กจริงที่ user เจอบน prod
       * 2026-07-31 — ทักด้วยคำที่ตั้งไว้แล้วบอทเงียบ)
       *
       * `handoffAt` เป็นสวิตช์ **ถาวร**: gate ที่ `:260` เห็นค่านี้แล้วตัดทิ้งทุกข้อความถัดไป
       * โดยไม่พยายาม match อีกเลย และ **ไม่มีที่ไหนในโค้ดเบสเคลียร์มันกลับเป็น null** (ต่างจาก
       * `autoReplyPausedUntil` ที่หมดอายุเองตามเวลา)
       *
       * ผลคือ: ลูกค้าเปิดบทสนทนาด้วย "สวัสดีครับ" ซึ่งไม่ตรงคำที่ตั้งไว้ → ห้องนั้นตายถาวร
       * ตั้งแต่ข้อความแรก แล้วคำที่ตรงจริงที่ตามมาทีหลังไม่มีวันได้รับคำตอบ ซึ่งเป็นเคสปกติ
       * ของแทบทุกบทสนทนา
       *
       * BR-AR-08 สั่งให้ "เงียบแล้วส่งต่อคน" ซึ่งหมายถึง **ข้อความนั้น** — ไม่ได้สั่งให้ล็อกทั้งห้อง
       * "บอทไม่เข้าใจข้อความนี้" ไม่เท่ากับ "คนเข้ามารับช่วงแล้ว" ซึ่งเป็นความหมายจริงของ `handoffAt`
       * (ดู `MAX_REPLIES_REACHED` / `SEND_FAILED` ที่ล็อกถาวรแล้วสมเหตุสมผล)
       */
      if (reason !== 'NO_KEYWORD_MATCH') {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { handoffAt: new Date(), handoffReason: reason },
        })
      } else {
        /**
         * ChatBot — ก่อนจะยอมเงียบ ลองให้ AI ตอบจากคลังความรู้ (phase `00023-ai-enhance`)
         *
         * WARNING: อยู่ใน `else` ของ NO_KEYWORD_MATCH เท่านั้น = **เฉพาะตรงที่เมื่อก่อนเงียบ**
         * ไม่แตะเส้นทางที่ Auto Reply ตอบได้อยู่แล้ว คำที่ร้านตั้งไว้จึงชนะเสมอโดยโครงสร้าง
         * ไม่ใช่โดยลำดับ if ที่ใครมาแก้ทีหลังแล้วสลับได้
         */
        const chatbot = await tryChatbotAnswer({
          shopId: job.shopId,
          conversationId: conversation.id,
          customerText: rawText,
          // รูปที่ลูกค้าส่งมา — ส่งให้ AI ดูด้วย ไม่งั้นข้อความรูปล้วนจะไม่มีอะไรให้ตอบเลย
          imageUrls: message.imageUrl ? [message.imageUrl] : [],
          messageAt: message.createdAt,
        })
        if (chatbot.sent) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { autoReplyCount: { increment: 1 }, lastAutoReplyAt: new Date() },
          })
          return finish(job, 'DONE', {
            ...common,
            decision: 'REPLIED',
            replyText: chatbot.text,
            outboundMessageId: chatbot.messageId,
            resolutionLevel: 'CHATBOT',
            matchedVia: 'CHATBOT',
            aiContext: chatbot.aiContext ?? undefined,
            errorMessage: null,
          }, startedAt)
        }

        /**
         * เหตุผลที่บอทไม่ตอบ — บันทึกเฉพาะกรณีที่ ChatBot **ลองทำงานแล้วไม่สำเร็จ**
         *
         * WARNING (บั๊กจริง user เจอ 2026-08-01): เดิมบันทึกทุกเหตุผลรวมทั้ง OFFLINE/
         * NOT_TEST_THREAD ซึ่งเกิดกับ *ทุกห้องของทุกร้าน* ที่ไม่เข้ากลุ่มคำ — หน้าประวัติ
         * จึงเต็มไปด้วยแถว "ChatBot ปิดอยู่" ของร้านที่ไม่เคยเปิดใช้บอทเลย
         * เหตุผลกลุ่มนี้ไม่ใช่ "ผลการทำงานของบอท" แต่คือ "บอทไม่ได้ถูกเรียกใช้"
         */
        if (!SILENT_CHATBOT_REASONS.has(chatbot.reason)) chatbotReason = chatbot.reason
      }
      return finish(
        job,
        'SKIPPED',
        {
          ...common,
          decision: 'HANDOFF',
          skipReason: reason,
          errorMessage: chatbotReason ? `CHATBOT:${chatbotReason}` : null,
        },
        startedAt
      )
    }

    /**
     * AI Enhance ถูกตัดออก 2026-08-02 (user สั่ง) — DeepBot รับหน้าที่ตอบด้วย AI ไปทั้งหมดแล้ว
     * การมีสองเส้นทางที่เรียก AI คนละที่ ตั้งค่าคนละหน้า และคิดเงินคนละก้อน
     * ทำให้อธิบายบิลกับร้านไม่ได้ และเป็นต้นเหตุที่คำตอบสำเร็จรูปเพี้ยนโดยไม่มีใครสั่ง
     */
    const finalText = replyText

    // --- ส่งจริง ---
    const result = await sendAutoReply({
      conversationId: conversation.id,
      shopId: job.shopId,
      text: finalText,
      imageFileIds: replyImages,
      isTest: isTestReply,
    })

    if (!result.sent) {
      const failedEnough = job.attempts >= MAX_JOB_ATTEMPTS
      if (failedEnough) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { handoffAt: new Date(), handoffReason: result.reason },
        })
      }
      await prisma.autoReplyJob.update({
        where: { id: job.id },
        data: {
          // ยังไม่ครบโควตา = คืนเป็น PENDING ให้ชั้น 3 (opportunistic sweep) รับต่อ
          status: failedEnough ? 'FAILED' : 'PENDING',
          lastError: result.error ?? result.reason,
          lockedAt: null,
          lockedBy: null,
        },
      })
      try {
        await writeLog({
          ...common,
          decision: failedEnough ? 'FAILED' : 'SKIPPED',
          skipReason: result.reason as SkipReason,
          errorMessage: result.error ?? null,
          replyText,
        })
      } catch (e) {
        console.error('[auto-reply] เขียนบันทึกล้มเหลว', e instanceof Error ? e.message : e)
      }
      return
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { autoReplyCount: { increment: 1 }, lastAutoReplyAt: new Date() },
    })

    return finish(job, 'DONE', {
      ...common,
      decision: 'REPLIED',
      replyText: finalText,
      outboundMessageId: result.messageId,
      // ความล้มเหลวบางส่วน (รูปบางใบส่งไม่ผ่าน) ต้องถูกบันทึก ไม่ใช่กลืน (TFR-036 ข้อ 4)
      errorMessage: result.partialError ?? null,
    }, startedAt)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[auto-reply] processJob ล้มเหลว', jobId, msg)
    await prisma.autoReplyJob
      .update({
        where: { id: job.id },
        data: {
          status: job.attempts >= MAX_JOB_ATTEMPTS ? 'FAILED' : 'PENDING',
          lastError: msg,
          lockedAt: null,
          lockedBy: null,
        },
      })
      .catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// batch runners
// ---------------------------------------------------------------------------

/** เรียกจาก `after()` ของ webhook — ประมวลผลงานค้างของเธรดนั้น */
export async function processPendingForConversation(conversationId: string, limit = DEFAULT_BATCH) {
  const jobs = await prisma.autoReplyJob.findMany({
    where: { conversationId, status: 'PENDING' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
  for (const j of jobs) await processJob(j.id, 'after')
}

/**
 * sweepStuckJobs — ชั้นที่ 3 ของการกู้คืน (TD-001)
 *
 * WARNING: งานที่ค้างสถานะ PROCESSING **ห้ามคืนเป็น PENDING โดยไม่ตรวจก่อน** (AC-017-03)
 * เพราะเคส "ส่งสำเร็จแล้วแต่เขียน DB ไม่สำเร็จ" จะทำให้ลูกค้าได้ข้อความสองครั้ง
 * ตรวจด้วยการหาข้อความฝั่งร้านที่ระบบเป็นผู้ส่ง (autoReplyKind != null) ที่เกิดหลังเวลา claim
 */
export async function sweepStuckJobs(opts: { shopId?: string; limit?: number } = {}) {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS)
  const stuck = await prisma.autoReplyJob.findMany({
    where: {
      ...(opts.shopId ? { shopId: opts.shopId } : {}),
      OR: [
        { status: 'PENDING', createdAt: { lt: cutoff } },
        { status: 'PROCESSING', lockedAt: { lt: cutoff } },
      ],
    },
    select: { id: true, status: true, conversationId: true, lockedAt: true },
    orderBy: { createdAt: 'asc' },
    take: opts.limit ?? 20,
  })

  let recovered = 0
  let closed = 0

  for (const j of stuck) {
    if (j.status === 'PROCESSING') {
      const alreadySent = await prisma.chatMessage.findFirst({
        where: {
          conversationId: j.conversationId,
          senderRole: 'SHOP',
          autoReplyKind: { not: null },
          ...(j.lockedAt ? { createdAt: { gte: j.lockedAt } } : {}),
        },
        select: { id: true },
      })
      if (alreadySent) {
        await prisma.autoReplyJob.update({ where: { id: j.id }, data: { status: 'DONE' } })
        closed++
        continue
      }
      await prisma.autoReplyJob.update({
        where: { id: j.id },
        data: { status: 'PENDING', lockedAt: null, lockedBy: null },
      })
    }
    await processJob(j.id, 'sweeper')
    recovered++
  }

  return { scanned: stuck.length, recovered, closedAlreadySent: closed }
}

/**
 * enrichWithAutoReplyBadge — เติมข้อมูลป้าย DeepBot ให้แถวในรายการแชท (S-20, phase `00023-qna`)
 *
 * ทำไมเป็น join ไม่ใช่คอลัมน์ที่ persist (user ตัดสิน 2026-08-01):
 * `Conversation.lastMessagePreview`/`lastSenderRole` เป็นคอลัมน์ denormalize ที่เขียนตอน insert
 * ข้อความ **4 จุด** (`chat.service.ts:655`, `channel-chat.service.ts:194/687/1097`) — การเพิ่ม
 * คอลัมน์ที่ 3 แปลว่าต้อง sync ทั้งสี่จุดนั้นตลอดไป ลืมจุดใดจุดหนึ่ง = ค่าค้างแล้วป้าย **ติดผิด
 * ข้อความ** ซึ่งแย่กว่าป้ายไม่ขึ้น · นอกจากนี้เส้นทาง race ของ echo Messenger ที่แปะ
 * `autoReplyKind` ย้อนหลังไม่ได้อัปเดต snapshot ซ้ำ — ทาง join อ่านจากข้อความจริงเสมอจึงไม่มี
 * ทั้งภาระ sync และช่องโหว่นั้น
 *
 * ทำไม raw SQL: ต้องได้ "ข้อความล่าสุด 1 แถวต่อเธรด" ของหลายเธรดในคิวรีเดียว — `DISTINCT ON`
 * ของ Postgres ทำได้ตรง ๆ (pattern เดียวกับ `enrichWithOrderStage`) ส่วนทาง Prisma ต้องยิงทีละ
 * เธรด = N+1 · index `[conversationId, autoReplyKind, createdAt]` มีอยู่แล้วใน schema ตั้งแต่
 * base feature โดยใส่ไว้เพื่องานนี้โดยเฉพาะ
 *
 * `lastMessageIsAiEnhanced` = ข้อความล่าสุดมาจาก **ChatBot (DeepAI)** ไม่ใช่คำตอบสำเร็จรูป (DeepBot)
 *
 * ชื่อฟิลด์เป็นมรดกจากยุค AI Enhance ที่ถูกถอดออกไปแล้ว (`68c37cd3`) — ความหมายตอนนี้คือ
 * "ตอบโดย AI" ซึ่งของจริงคือ ChatBot ที่ตอบจากคลังความรู้ · คงชื่อเดิมไว้เพราะ `InboxList.tsx`
 * ผูกกับชื่อนี้อยู่ และการเปลี่ยนชื่อฟิลด์ไม่ได้ทำให้ผู้ใช้ได้อะไรเพิ่ม
 *
 * WARNING: เดิมค่านี้ **hardcode `false`** ทำให้ป้าย DeepAI ไม่เคยขึ้นเลยแม้แต่ครั้งเดียว —
 * รายการแชทเขียนว่า "DeepBot" ทุกแถวรวมถึงแถวที่ AI เป็นคนตอบ ซึ่งกลบสิ่งที่ป้ายนี้มีไว้บอก
 * ตั้งแต่แรก (ร้านต้องแยกออกว่าอันไหนคำพูดของตัวเอง อันไหนที่ AI แต่งและควรอ่านตรวจ)
 *
 * ทำไมอ่านจาก `AutoReplyLog` แทนที่จะ join `outboundMessageId`: คอลัมน์นั้น **ไม่มี index**
 * (บทเรียนเดียวกับตอนทำป้าย DeepBot) จึง `DISTINCT ON (conversationId)` บน log ที่ตอบสำเร็จ
 * โดยใช้ index `[conversationId, createdAt]` ที่มีอยู่แล้ว — log ที่ REPLIED ล่าสุดของเธรด
 * ย่อมเป็นตัวเดียวกับข้อความ auto-reply ล่าสุด เพราะ log ถูกเขียนในจังหวะเดียวกับการส่ง
 */
export async function enrichWithAutoReplyBadge<T extends { id: string }>(
  items: T[],
): Promise<(T & { lastMessageAutoReplyKind: string | null; lastMessageIsAiEnhanced: boolean })[]> {
  if (items.length === 0) return []

  const ids = items.map((i) => i.id)
  const rows = await prisma.$queryRaw<{ conversationId: string; autoReplyKind: string | null }[]>`
    SELECT DISTINCT ON (m."conversationId")
      m."conversationId" AS "conversationId",
      m."autoReplyKind"  AS "autoReplyKind"
    FROM "ChatMessage" m
    WHERE m."conversationId" IN (${Prisma.join(ids)})
    ORDER BY m."conversationId", m."createdAt" DESC, m."seq" DESC
  `

  const viaRows = await prisma.$queryRaw<{ conversationId: string; matchedVia: string | null }[]>`
    SELECT DISTINCT ON (l."conversationId")
      l."conversationId" AS "conversationId",
      l."matchedVia"     AS "matchedVia"
    FROM "AutoReplyLog" l
    WHERE l."conversationId" IN (${Prisma.join(ids)})
      AND l."decision" = 'REPLIED'
    ORDER BY l."conversationId", l."createdAt" DESC
  `

  const byConversation = new Map(rows.map((r) => [r.conversationId, r.autoReplyKind]))
  const viaByConversation = new Map(viaRows.map((r) => [r.conversationId, r.matchedVia]))
  return items.map((i) => {
    const kind = byConversation.get(i.id) ?? null
    return {
      ...i,
      lastMessageAutoReplyKind: kind,
      // ต้องเช็ค kind ด้วย ไม่ใช่ดูแต่ matchedVia — เธรดที่ ChatBot เคยตอบเมื่อวาน แล้ววันนี้
      // พนักงานพิมพ์เอง ข้อความล่าสุดไม่ใช่ของบอทแล้ว ป้ายจึงต้องไม่ขึ้น
      lastMessageIsAiEnhanced: kind !== null && viaByConversation.get(i.id) === 'CHATBOT',
    }
  })
}


/**
 * tryChatbotAnswer — ให้ AI ตอบจากคลังความรู้เมื่อไม่มีกลุ่มคำไหนรับ
 *
 * คืน null เมื่อไม่ได้ตอบ (ปิดอยู่ / นอกเวลา / ไม่ใช่แชททดสอบ / ยอดเงินหมด / คลังว่าง /
 * AI ตอบไม่ได้ / ชนกฎ) — ผู้เรียกเงียบตามเดิมและเก็บคำถามเข้าคิว
 *
 * WARNING: ห้าม throw — อยู่ในเส้นทางเดียวกับการตอบลูกค้า ทุกความล้มเหลวคืน null
 */
/** ค่ากลางเมื่อร้านเลือกโหมดข้อความสำรองแต่ยังไม่ได้เขียนข้อความเอง */
const DEFAULT_FALLBACK_TEXT = 'ขอเช็คข้อมูลให้สักครู่นะคะ เดี๋ยวแอดมินมาตอบค่ะ'

/**
 * ข้อความสำรองเมื่อ AI ตอบคำถามนั้นไม่ได้ (user สั่ง 2026-08-01 "อยากให้ตอบทุกคำถาม")
 *
 * เดิมเส้นทางนี้คือเงียบ ซึ่งแปลว่าลูกค้าถูกปล่อยทิ้งโดยไม่รู้ว่ามีใครเห็นข้อความไหม
 * ค่าเริ่มต้นจึงเป็น MESSAGE ไม่ใช่ SILENT — และไม่เสียค่า AI เพราะเป็นข้อความคงที่
 *
 * WARNING: ต้องผ่าน cooldown/เพดานเหมือนคำตอบจาก AI ทุกประการ ไม่งั้นห้องที่โดนหน่วง
 * จะได้ข้อความสำรองรัว ๆ แทน ซึ่งน่ารำคาญกว่าเงียบ (ผู้เรียกเช็คให้แล้วก่อนมาถึงนี่)
 */
async function sendFallback(
  params: { shopId: string; conversationId: string },
  cfg: { aiChatbotFallbackMode?: string | null; aiChatbotFallbackText?: string | null } | null,
  status: string
): Promise<{ sent: true; text: string; messageId: string | null } | null> {
  if ((cfg?.aiChatbotFallbackMode ?? 'MESSAGE') !== 'MESSAGE') return null
  const text = (cfg?.aiChatbotFallbackText ?? '').trim() || DEFAULT_FALLBACK_TEXT
  const sent = await sendAutoReply({
    conversationId: params.conversationId,
    shopId: params.shopId,
    text,
    imageFileIds: [],
    isTest: status === 'TEST',
  })
  if (!sent.sent) return null
  return { sent: true, text, messageId: sent.messageId ?? null }
}

/**
 * เหตุผลที่แปลว่า "ChatBot ไม่ได้ทำงานกับห้องนี้ตั้งแต่แรก" — ไม่บันทึกลงประวัติ
 * เพราะเกิดกับทุกห้องที่ไม่เข้ากลุ่มคำ ไม่ได้บอกอะไรที่ร้านเอาไปแก้ได้
 */
const SILENT_CHATBOT_REASONS = new Set(['OFFLINE', 'NOT_TEST_THREAD', 'OUTSIDE_SCHEDULE'])

type ChatbotOutcome =
  | { sent: true; text: string; messageId: string | null; aiContext?: unknown; usedKnowledge?: string[] }
  | { sent: false; reason: string }

/**
 * WARNING: ทุกทางที่ "ไม่ได้ตอบ" ต้องคืนเหตุผลเสมอ ห้ามคืน null เปล่า
 *
 * เดิมคืน null ทุกกรณี บันทึกจึงไม่มีอะไรบอกว่าทำไมบอทเงียบ — ต้องไล่ query ฐาน prod
 * เทียบกับตาราง usage ทีละครั้งถึงจะรู้ (เกิดขึ้น 4 รอบในวันเดียว 2026-08-01)
 */
/**
 * มีข้อความใหม่ของลูกค้าเข้ามาหลังข้อความที่กำลังตอบไหม
 *
 * user 2026-08-01 ปฏิเสธการหน่วง 10 วินาที ("ไม่อยากให้หน่วง") — จึงใช้วิธีตรงข้าม:
 * ตอบทันทีเหมือนเดิม แต่ถ้าระหว่างที่คิดคำตอบอยู่ลูกค้าพิมพ์ต่อ ให้ทิ้งคำตอบนี้
 * แล้วปล่อยให้งานของข้อความล่าสุดตอบรวมทีเดียว
 *
 * ผลคือเคสปกติ (พิมพ์มาข้อความเดียว) ไม่ช้าลงแม้แต่มิลลิวินาทีเดียว ส่วนเคสพิมพ์รัว
 * ได้คำตอบเดียวที่เข้าใจบริบทครบ แทนที่จะได้สามคำตอบที่ต่างคนต่างตอบคนละท่อน
 */
async function hasNewerBuyerMessage(conversationId: string, after: Date): Promise<boolean> {
  const newer = await prisma.chatMessage.findFirst({
    where: { conversationId, senderRole: 'BUYER', createdAt: { gt: after } },
    select: { id: true },
  })
  return Boolean(newer)
}

/**
 * รวมข้อความลูกค้าที่ยังไม่ได้ตอบให้เป็นคำถามเดียว
 *
 * ขอบเขต = ตั้งแต่ข้อความล่าสุดของฝั่งร้านเป็นต้นมา — ทุกอย่างก่อนหน้านั้นถือว่าตอบไปแล้ว
 * จำกัด 5 ข้อความกัน prompt บวมจากลูกค้าที่พิมพ์รัวสิบกว่าบรรทัด
 */
async function collectPendingCustomerText(
  conversationId: string,
  upTo: Date,
  fallback: string
): Promise<string> {
  const lastShop = await prisma.chatMessage.findFirst({
    where: { conversationId, senderRole: 'SHOP', createdAt: { lte: upTo } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  const rows = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      senderRole: 'BUYER',
      type: 'TEXT',
      body: { not: null },
      createdAt: { lte: upTo, ...(lastShop ? { gt: lastShop.createdAt } : {}) },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { body: true },
  })
  const merged = rows
    .reverse()
    .map((r) => (r.body ?? '').trim())
    .filter(Boolean)
    .join('\n')
  return merged || fallback
}

async function tryChatbotAnswer(params: {
  shopId: string
  conversationId: string
  customerText: string
  imageUrls?: string[]
  /** เวลาของข้อความที่กำลังตอบ — ใช้ตรวจว่ามีข้อความใหม่แทรกไหม */
  messageAt?: Date
}): Promise<ChatbotOutcome> {
  try {
    const cfg = await prisma.autoReplyConfig.findUnique({
      where: { shopId: params.shopId },
      select: {
        aiChatbotStatus: true,
        aiChatbotTone: true,
        aiChatbotStartTime: true,
        aiChatbotEndTime: true,
        aiChatbotCooldownSec: true,
        aiChatbotMaxPerHour: true,
        aiChatbotFallbackMode: true,
        aiChatbotFallbackText: true,
        aiChatbotUseShopData: true,
        aiChatbotUseChatHistory: true,
        aiChatbotUseWebSearch: true,
        aiChatbotShopOnly: true,
        aiChatbotOutOfScopeText: true,
        aiChatbotExtraPrompt: true,
      },
    })
    const status = cfg?.aiChatbotStatus ?? 'OFFLINE'
    if (status === 'OFFLINE') return { sent: false, reason: 'OFFLINE' }

    // TEST = ตอบเฉพาะแชทที่ร้านเลือกไว้ (โครงเดียวกับกลุ่มคำสถานะ TEST)
    if (status === 'TEST') {
      const allowed = await prisma.aiChatbotTestThread.findUnique({
        where: { shopId_conversationId: { shopId: params.shopId, conversationId: params.conversationId } },
        select: { id: true },
      })
      if (!allowed) return { sent: false, reason: 'NOT_TEST_THREAD' }
    }

    if (!isChatbotWithinWindow(cfg?.aiChatbotStartTime, cfg?.aiChatbotEndTime, new Date())) return { sent: false, reason: 'OUTSIDE_SCHEDULE' }

    /**
     * เพดานการตอบต่อห้อง — ChatBot ไม่มี cooldown ของกลุ่มคำมาคุมเหมือน Auto Reply
     * เพราะมันทำงานตอน "ไม่เข้ากลุ่มไหนเลย" ถ้าไม่คุมตรงนี้ คนที่พิมพ์คำถามต่างกันรัว ๆ
     * ในห้องเดียวจะเรียก AI ได้ทุกครั้งจนกว่าจะชนเพดานเงินต่อวันของทั้งร้าน
     *
     * โหมดทดสอบข้ามด่านนี้ ด้วยเหตุผลเดียวกับ cooldown ของกลุ่มคำ: คนที่กำลังทดสอบ
     * ตั้งใจยิงซ้ำ ๆ เพื่อดูว่าตั้งค่าถูกไหม โดนหน่วงแล้วจะนึกว่าระบบพัง
     */
    if (status !== 'TEST') {
      const cooldownSec = cfg?.aiChatbotCooldownSec ?? 30
      const maxPerHour = cfg?.aiChatbotMaxPerHour ?? 10
      const now = Date.now()

      if (cooldownSec > 0) {
        const last = await prisma.autoReplyLog.findFirst({
          where: { conversationId: params.conversationId, matchedVia: 'CHATBOT', decision: 'REPLIED' },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        })
        if (last && now - last.createdAt.getTime() < cooldownSec * 1000) return { sent: false, reason: 'COOLDOWN' }
      }

      if (maxPerHour > 0) {
        const usedThisHour = await prisma.autoReplyLog.count({
          where: {
            conversationId: params.conversationId,
            matchedVia: 'CHATBOT',
            decision: 'REPLIED',
            createdAt: { gte: new Date(now - 60 * 60 * 1000) },
          },
        })
        if (usedThisHour >= maxPerHour) return { sent: false, reason: 'HOURLY_CAP' }
      }
    }

    /**
     * ด่านที่ 1 ของการทิ้งคำตอบซ้ำซ้อน — เช็คก่อนเรียก AI เพราะตรงนี้ยังไม่เสียเงิน
     * (ด่านที่ 2 อยู่ก่อนส่ง ดักกรณีลูกค้าพิมพ์ต่อระหว่างที่ AI กำลังคิด)
     */
    if (params.messageAt && (await hasNewerBuyerMessage(params.conversationId, params.messageAt))) {
      return { sent: false, reason: 'SUPERSEDED' }
    }

    const cap = await checkCapBeforeCall(params.shopId)
    if (!cap.allowed) return { sent: false, reason: 'DAILY_CAP_OR_NO_CREDIT' }

    // คลังความรู้ทั้งร้าน — ที่ถูกใช้บ่อยอยู่บน แล้วตัดที่ 200 ข้อกัน prompt บวม
    // (200 ข้อ ~ หลักหมื่น token ซึ่งยังอยู่ในงบของ flash-lite และคุมต้นทุนต่อครั้งได้)
    const knowledge = await prisma.autoReplyQna.findMany({
      where: { shopId: params.shopId, isActive: true },
      select: { id: true, question: true, answer: true },
      orderBy: { useCount: 'desc' },
      take: 200,
    })
    const fallbackMode = cfg?.aiChatbotFallbackMode ?? 'MESSAGE'
    // คลังว่าง + ร้านไม่ได้เปิดให้ AI ตอบเอง = ไม่มีอะไรให้ทำงานด้วย ตกไปเส้นทางข้อความสำรอง
    if (knowledge.length === 0 && fallbackMode !== 'AI_FREE') {
      const fb = await sendFallback(params, cfg, status)
      return fb ?? { sent: false, reason: 'NO_KNOWLEDGE' }
    }

    const guardrails = await prisma.autoReplyGuardrail.findMany({
      where: { shopId: params.shopId, keywordId: null, isActive: true },
      select: { rule: true, denyPhrases: true, mode: true },
    })

    // สินค้าที่มีขายจริง — บอทเสนอได้เฉพาะในรายการนี้ และราคามาจากระบบ ไม่ใช่จากที่ร้านพิมพ์ไว้
    const products = cfg?.aiChatbotUseShopData
      ? await prisma.product.findMany({
          where: { shopId: params.shopId, isActive: true },
          select: { name: true, price: true },
          orderBy: { name: 'asc' },
          take: 100,
        })
      : []

    // บทสนทนาก่อนหน้า — ทำให้ตอบต่อเนื่องได้ ("แล้วสีแดงล่ะ" ต้องรู้ว่ากำลังพูดถึงอะไร)
    // เอาเฉพาะข้อความตัวอักษร และกรอง PII ก่อนส่งออกเหมือนคำถามหลัก
    const history = cfg?.aiChatbotUseChatHistory
      ? (
          await prisma.chatMessage.findMany({
            where: { conversationId: params.conversationId, type: 'TEXT', body: { not: null } },
            orderBy: { createdAt: 'desc' },
            take: 11, // 10 ข้อความก่อนหน้า + ข้อความปัจจุบันที่ต้องตัดออก
            select: { senderRole: true, body: true, createdAt: true },
          })
        )
          .slice(1)
          .reverse()
          .map((m) => ({
            role: (m.senderRole === 'BUYER' ? 'ลูกค้า' : 'ร้าน') as 'ลูกค้า' | 'ร้าน',
            text: redactPii(m.body ?? '').text.slice(0, 300),
          }))
      : []

    // รวมข้อความที่ลูกค้าพิมพ์รัวมาเป็นคำถามเดียว ("สนใจโช๊ค" + "สามล้อ" + "เท่าไร")
    const customerText = params.messageAt
      ? await collectPendingCustomerText(params.conversationId, params.messageAt, params.customerText)
      : params.customerText

    const result = await answerFromKnowledge({
      customerText,
      imageUrls: params.imageUrls,
      products: products.map((p) => ({ name: p.name, price: p.price.toString() })),
      history,
      shopOnly: cfg?.aiChatbotShopOnly ?? false,
      outOfScopeText: cfg?.aiChatbotOutOfScopeText ?? null,
      extraPrompt: cfg?.aiChatbotExtraPrompt ?? null,
      allowFreeAnswer: fallbackMode === 'AI_FREE',
      useWebSearch: cfg?.aiChatbotUseWebSearch ?? false,
      knowledge: knowledge.map((k) => ({ question: k.question, answer: k.answer })),
      knowledgeIds: knowledge.map((k) => k.id),
      guardrails,
      tone: cfg?.aiChatbotTone ?? null,
    })

    if (result.usage) {
      await recordUsageAndBill({
        shopId: params.shopId,
        conversationId: params.conversationId,
        usage: result.usage,
        status: result.text ? 'SUCCESS' : 'FAILED',
      })
    }
    if (!result.text) {
      // AI ตอบไม่ได้ (คลังไม่มีข้อมูล/ชนกฎ/ล้มเหลว) — ร้านเลือกได้ว่าจะเงียบหรือส่งข้อความสำรอง
      const fb = await sendFallback(params, cfg, status)
      return fb ?? { sent: false, reason: result.reason ?? 'AI_NO_ANSWER' }
    }

    // ด่านที่ 2 — ลูกค้าพิมพ์ต่อระหว่างที่ AI คิดอยู่ ทิ้งคำตอบนี้ ให้งานของข้อความ
    // ล่าสุดตอบรวมแทน (โทเคนที่ใช้ไปแล้วยังถูกบันทึกด้านบน ไม่กลืนต้นทุนจริง)
    if (params.messageAt && (await hasNewerBuyerMessage(params.conversationId, params.messageAt))) {
      return { sent: false, reason: 'SUPERSEDED' }
    }

    const sent = await sendAutoReply({
      conversationId: params.conversationId,
      shopId: params.shopId,
      text: result.text,
      imageFileIds: [],
      isTest: status === 'TEST',
    })
    if (!sent.sent) return { sent: false, reason: 'SEND_FAILED' }

    /**
     * นับสถิติ "ถูกใช้ตอบ" ให้ความรู้ที่โมเดลอ้างว่าใช้ — นับหลังส่งสำเร็จเท่านั้น
     * ไม่ให้ล้มทั้งงานถ้าเขียนสถิติไม่ผ่าน: ลูกค้าได้คำตอบไปแล้ว ตัวเลขนับพลาดหนึ่งครั้ง
     * เสียหายน้อยกว่าการโยน error กลับเข้าเส้นทางของ webhook
     */
    if (result.usedKnowledgeIds?.length) {
      await prisma.autoReplyQna
        .updateMany({
          where: { id: { in: result.usedKnowledgeIds }, shopId: params.shopId },
          data: { useCount: { increment: 1 } },
        })
        .catch((e) => console.error('[chatbot] นับ useCount ไม่สำเร็จ', e))
    }

    return {
      sent: true,
      text: result.text,
      messageId: sent.messageId ?? null,
      // เก็บ "ใช้อะไรตอบ" ไว้ให้กล่องรายละเอียดในห้องแชทอธิบายได้ (ไม่มี PII ในนี้)
      aiContext: result.context ? { ...result.context, usedKnowledgeIds: result.usedKnowledgeIds ?? [] } : null,
    }
  } catch (e) {
    console.error('[chatbot] tryChatbotAnswer ล้มเหลว', e)
    return { sent: false, reason: 'UNEXPECTED_ERROR' }
  }
}
