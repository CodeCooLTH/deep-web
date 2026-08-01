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
import { matchQna } from '@/lib/auto-reply-qna-match'
import { markQnaUsed } from '@/services/auto-reply-qna.service'
import { recordUnanswered } from '@/services/auto-reply-unanswered.service'

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
async function finish(
  job: JobRow,
  status: 'DONE' | 'SKIPPED' | 'FAILED',
  log: Parameters<typeof writeLog>[0],
) {
  await prisma.autoReplyJob.update({ where: { id: job.id }, data: { status } })
  try {
    await writeLog(log)
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
      select: { body: true, senderRole: true, autoReplyKind: true },
    })

    // gate 0 — ข้อความฝั่งร้าน (รวมคำตอบของบอทเอง) ห้ามนำมาตรวจจับเด็ดขาด (BR-AR-22)
    if (!message || message.senderRole !== 'BUYER') {
      return finish(job, 'SKIPPED', { ...base, decision: 'SKIPPED', skipReason: 'OUTBOUND_MESSAGE' })
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
      return finish(job, 'SKIPPED', { ...base, decision: 'SKIPPED', skipReason: 'CONVERSATION_DISABLED' })
    }

    const config = await getConfig(job.shopId)

    // gate 1 — สวิตช์ระดับเธรด (แอดมินปิดเธรดนี้เองจากกล่องข้อความ)
    //
    // WARNING: สวิตช์ระดับร้าน (AutoReplyConfig.isEnabled) ถูกถอดออกจากเส้นทางตัดสิน 2026-07-30
    // ตามคำสั่ง user: "ไม่มีแล้วสิ ปิดทั้งหมด ให้ user ปิดเอง ในแต่ละ row"
    // ความปลอดภัยเดิม (ระบบต้องไม่ทำงานจนกว่าร้านจะสั่ง) ยังอยู่ครบ เพราะกลุ่มคำที่สร้างใหม่
    // เป็น OFFLINE เสมอ — ไม่มีทางตอบใครจนกว่าร้านจะเปลี่ยนสถานะเอง
    if (conversation.autoReplyEnabled === false) {
      return finish(job, 'SKIPPED', { ...base, decision: 'SKIPPED', skipReason: 'CONVERSATION_DISABLED' })
    }

    // WARNING: gate 2 เดิม (โหมดทดสอบระดับร้าน) ถูกลบ 2026-07-29 — โหมดทดสอบผูกกับกลุ่มคำแล้ว
    // ตัดสินที่ gate 6.5 หลัง match แทน ดู AutoReplyKeyword.status

    // gate 3-5 — สถานะเธรด
    if (conversation.isSpam) {
      return finish(job, 'SKIPPED', { ...base, decision: 'SKIPPED', skipReason: 'SPAM' })
    }
    if (conversation.handoffAt) {
      return finish(job, 'SKIPPED', { ...base, decision: 'SKIPPED', skipReason: 'HANDED_OFF' })
    }
    if (conversation.autoReplyPausedUntil && conversation.autoReplyPausedUntil > new Date()) {
      return finish(job, 'SKIPPED', { ...base, decision: 'SKIPPED', skipReason: 'PAUSED_HUMAN_TAKEOVER' })
    }

    // gate 6 — เพดานจำนวนคำตอบต่อเธรด (AC-018-02) ครบแล้วส่งต่อพนักงาน
    if (conversation.autoReplyCount >= config.maxRepliesPerConversation) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { handoffAt: new Date(), handoffReason: 'MAX_REPLIES_REACHED' },
      })
      return finish(job, 'SKIPPED', { ...base, decision: 'HANDOFF', skipReason: 'MAX_REPLIES_REACHED' })
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
    const qnaMatch = matched.winner
      ? null
      : matchQna(normalizedText, ruleSet.qnas ?? [], ruleSet.keywords, { mode: 'EXACT' })

    /**
     * กลุ่มคำที่ "เป็นเจ้าของ" คำตอบครั้งนี้ — มาจากคำตรงตัว หรือจากกลุ่มที่ QnA ยืมมา
     *
     * WARNING: ตัวแปรนี้คือหัวใจของ TFR-032 ข้อ 2 — gate 6.5 (สถานะ), 6.6 (เวลาทำงาน)
     * และ 7 (cooldown) ทั้งหมดต้องอ่านค่านี้ ไม่ใช่ `matched.winner` ตรง ๆ
     * ถ้าลัดให้ QnA ข้าม gate เหล่านี้ มันจะกลายเป็นช่องทางที่ข้ามสถานะ OFFLINE/TEST,
     * ข้ามตารางเวลา และข้าม cooldown ได้ทั้งหมด = กับดัก "สวิตช์คนละที่" ตัวเดียวกับที่
     * ถูกรื้อทิ้งเมื่อ 2026-07-30 และเป็นเหตุผลที่ user เลือกให้คลังอยู่ในกลุ่มตั้งแต่แรก
     */
    const effectiveKeywordId = matched.winner?.keywordId ?? qnaMatch?.keywordId ?? null
    const matchedVia: 'KEYWORD' | 'QNA' | null = matched.winner ? 'KEYWORD' : qnaMatch ? 'QNA' : null

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
        qnaId: qnaMatch?.qna.id ?? null,
      })
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
        qnaId: qnaMatch?.qna.id ?? null,
      })
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
          qnaId: qnaMatch?.qna.id ?? null,
        })
      }
    }

    /**
     * WARNING: คำตอบจากคลัง **ไม่ผ่าน `resolveRule`** — คลังมีคำตอบของตัวเองอยู่แล้ว (TFR-032 ข้อ 3)
     * ข้าม resolveRule ไปเลยเมื่อชนะด้วย QnA เพื่อไม่ให้กฎกลางของร้าน (ระดับ PAGE_DEFAULT/
     * SHOP_DEFAULT) มาแย่งคำตอบที่ร้านกรอกไว้เจาะจงกับคำถามนั้น
     */
    const resolved = qnaMatch ? null : resolveRule(effectiveKeywordId, ctx, ruleSet)

    const trace = {
      match: matched.matchTrace,
      fallbackFrom: resolved?.fallbackFrom ?? [],
      ...(qnaMatch ? { qna: { id: qnaMatch.qna.id, question: qnaMatch.qna.question, method: qnaMatch.method } } : {}),
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
      resolutionLevel: qnaMatch ? 'QNA' : (resolved?.resolutionLevel ?? 'NONE'),
      ruleId: resolved?.rule?.id ?? null,
      matchedVia,
      qnaId: qnaMatch?.qna.id ?? null,
      isTest: isTestReply,
      durationMs: Date.now() - startedAt,
    }

    // gate 8-9 — ไม่มีกลุ่มคำตรง หรือถอยจนไม่เหลือกฎ = เงียบแล้วส่งต่อคน ห้ามเดา (BR-AR-08)
    //
    // WARNING: "มีคำตอบ" = มีข้อความ **หรือมีรูป** (TFR-036 ข้อ 6) — คำตอบที่เป็นรูปล้วน
    // (ซึ่งอนุญาต มิเรอร์ QuickMessage.body ที่ว่างได้ถ้ามีรูป) ต้องไม่ถูกตัดทิ้งเป็น
    // EMPTY_REPLY แล้วล็อกห้องด้วย handoffAt
    const replyText = (qnaMatch ? qnaMatch.qna.answer : resolved?.rule?.replyText)?.trim() ?? ''
    const replyImages = qnaMatch ? qnaMatch.qna.imageFileIds : []
    if (!replyText && replyImages.length === 0) {
      const reason: SkipReason = !effectiveKeywordId
        ? 'NO_KEYWORD_MATCH'
        : qnaMatch || resolved?.rule
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
         * บันทึกเข้าคิว "คำถามที่ตอบไม่ได้" (phase 00023-qna, TFR-033)
         *
         * WARNING: อยู่ในสาขา `NO_KEYWORD_MATCH` เท่านั้น และ **อยู่ใน `else` ของ handoffAt**
         * ให้เห็นชัดว่าเส้นทางนี้ไม่แตะ `handoffAt` — จุดนี้คือจุดเดียวกับบั๊กที่ล็อกห้องถาวร
         * 240 ห้องบน prod เมื่อ 2026-07-31
         *
         * `recordUnanswered` ไม่ throw เองอยู่แล้ว (ห่อ try/catch ในตัว) แต่ `await` ไว้เพื่อให้
         * ลำดับการเขียนแน่นอนตอนเทส — คิวพังไม่ทำให้งานค้างสถานะเพราะ finish() ทำงานต่อเสมอ
         */
        await recordUnanswered({ shopId: job.shopId, rawText, normalizedText })
      }
      return finish(job, 'SKIPPED', { ...common, decision: 'HANDOFF', skipReason: reason })
    }

    // --- ส่งจริง ---
    const result = await sendAutoReply({
      conversationId: conversation.id,
      shopId: job.shopId,
      text: replyText,
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

    // WARNING: +1 ต่อ "ชุด" ไม่ใช่ต่อชิ้นที่ส่ง (DATABASE §3.11) — คำตอบที่มี 5 รูปนับเป็น 1
    // ถ้านับเป็น 6 ร้านที่ตั้งเพดานไว้ 10 จะโดนตัดจบหลังตอบไปแค่ชุดเดียวครึ่ง ซึ่งไม่ใช่
    // สิ่งที่ "จำนวนคำตอบ" หมายถึงในสายตาร้าน
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { autoReplyCount: { increment: 1 }, lastAutoReplyAt: new Date() },
    })

    // นับการใช้งานของข้อในคลัง (TFR-032 ข้อ 5) — นับเฉพาะตอนส่งสำเร็จ ไม่ throw เอง
    if (qnaMatch) await markQnaUsed(qnaMatch.qna.id)

    return finish(job, 'DONE', {
      ...common,
      decision: 'REPLIED',
      replyText,
      outboundMessageId: result.messageId,
      // ความล้มเหลวบางส่วน (รูปบางใบส่งไม่ผ่าน) ต้องถูกบันทึก ไม่ใช่กลืน (TFR-036 ข้อ 4)
      errorMessage: result.partialError ?? null,
      durationMs: Date.now() - startedAt,
    })
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
