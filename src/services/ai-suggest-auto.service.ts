import 'server-only'

import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { AUTO_ORDER_RESULT_TYPE, META_NOTICE_TYPE } from '@/lib/auto-order-message-type'
import { isShopVertical, DEFAULT_SHOP_VERTICAL } from '@/lib/lodging'
import { redactPii, restorePii } from '@/lib/pii-redact'
import { SanitizeError, sanitizeForExternalAi, type SanitizedPayload } from '@/lib/ai-suggest-sanitize'
import { buildSuggestTurns } from '@/lib/ai-suggest-turns'
import { draftReplySuggestions, resolveSuggestProvider } from '@/lib/reply-suggest-provider'
import { TyphoonApiError, TyphoonNotConfiguredError, TyphoonRateLimitedError } from '@/lib/typhoon'
import {
  AUTO_SUGGEST_NOTE_MAX,
  type AutoSuggestGetResponse,
  type AutoSuggestOutcome,
  type AutoSuggestPatchBody,
  type AutoSuggestProvider,
  type AutoSuggestReason,
  type AutoSuggestState,
  type AutoSuggestTrigger,
  MEMORY_UPDATE_TRIGGER,
} from '@/lib/ai-suggest-auto-types'
import { MEMORY_RPM_SHARE } from '@/lib/chat-memory-types'
import { getAiSetting, getEffectiveAiSetting } from '@/services/ai-setting.service'
import { buildCustomerBlock, buildProductBlock, composeContextBlock, resolveProductCards } from '@/services/ai-context.service'
import { formatInterestedProductLine } from '@/lib/reply-suggest-prompt'
import { loadPromptMemory } from '@/services/chat-memory.service'
import { getConversationCrm } from '@/services/chat-crm.service'
import { buildSuggestIdentity } from '@/services/ai-suggest-identity'
import { isOwnerPaidPlan } from '@/services/ai-suggest-quota.service'

/**
 * คำแนะนำคำตอบอัตโนมัติ (Typhoon) — 00019-ext · S-9
 * ห้าม console.* ที่รับเนื้อความ/ชื่อ/ตารางป้าย (BR-AIT-09) — log ได้เฉพาะชนิด error
 */

export interface RequestAutoSuggestParams {
  shopId: string
  conversationId: string
  userId: string
  userDisplayName: string | null
  anchorMessageId: string
  manual: boolean
  trigger: AutoSuggestTrigger
}

export type RequestAutoSuggestResult = AutoSuggestState | { status: 'INVALID_ANCHOR' } // INVALID_ANCHOR → route 400

const RECENT_LIMIT = 15
const LEASE_MS = 30_000 // THINKING เกินนี้ = เจ้าของเดิมน่าจะตายกลางทาง → ยึดต่อได้
const BOT_FRESH_MS = 5 * 60_000 // เท่า STUCK_AFTER_MS ของ auto-reply.service (ไม่ได้ export จึงประกาศเอง ห้ามแก้ไฟล์นั้น)
const PACING_DEADLINE_MS = 5_000
const PACING_SLEEP_MS = 250

// ---------------------------------------------------------------- clamp

/** ตัดผลไม่เกิน 3 ประโยค / 400 ตัวอักษร (FR-AIT-06) */
export function clampSuggestion(text: string, opts: { maxSentences?: number; maxChars?: number } = {}): string {
  const maxSentences = opts.maxSentences ?? 3
  const maxChars = opts.maxChars ?? 400
  const parts = text
    .trim()
    .split(/(?<=[.!?…])\s+|\n+|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
  let out = parts.slice(0, maxSentences).join(' ')
  if (out.length > maxChars) {
    const cut = out.slice(0, maxChars)
    const sp = cut.lastIndexOf(' ')
    // ponytail: ไทยไม่มีช่องว่างจะถูกตัดกลางคำ — prompt คุมความยาวเป็นด่านแรก
    out = (sp > 0 ? cut.slice(0, sp) : cut).trimEnd()
  }
  return out
}

// ---------------------------------------------------------------- pacing

function envInt(name: string, def: number): number {
  const n = Number(process.env[name])
  return Number.isInteger(n) && n > 0 ? n : def
}

type PacingRow = { id: string; shopId: string; firedAt: Date | null }

/**
 * ผ่านถ้าแถวที่ "อยู่หน้าเรา" (firedAt,id น้อยกว่า) ในหน้าต่างนั้นยังไม่ถึงเพดาน — reserve-then-verify:
 * ทุกคนเขียน firedAt ก่อนแล้วนับ ผู้ที่เขียนทีหลังจะเห็นคนก่อนเสมอ
 */
export function computePacingVerdict(
  rows: PacingRow[],
  me: { id: string; shopId: string; firedAt: Date },
  limits: { rps: number; rpm: number; lowPriorityShare?: number },
): boolean {
  const t = me.firedAt.getTime()
  const ahead = rows.filter((r) => {
    if (!r.firedAt || r.id === me.id) return false
    const f = r.firedAt.getTime()
    return f < t || (f === t && r.id < me.id)
  })
  const inSec = ahead.filter((r) => r.firedAt!.getTime() > t - 1000).length
  const shopMin = ahead.filter((r) => r.shopId === me.shopId).length
  // งานรอง (ความจำ) ต้องเหลือที่ว่างให้คำแนะนำหลัก: ผ่านเมื่อคนข้างหน้า < rpm*share
  const shareOk = limits.lowPriorityShare === undefined || ahead.length < Math.floor(limits.rpm * limits.lowPriorityShare)
  return inSec < limits.rps && ahead.length < limits.rpm && shopMin < Math.floor(limits.rpm / 2) && shareOk
}

/** true = ได้สิทธิ์ยิง (firedAt คงไว้) · false = หมดเวลา (firedAt ถูกล้าง) */
export async function reserveSlot(runId: string, shopId: string, opts: { deadlineAt?: number; lowPriority?: boolean } = {}): Promise<boolean> {
  const deadlineAt = opts.deadlineAt ?? Date.now() + PACING_DEADLINE_MS
  const limits = { rps: envInt('AI_SUGGEST_RPS', 3), rpm: envInt('AI_SUGGEST_RPM', 100),
    lowPriorityShare: opts.lowPriority ? MEMORY_RPM_SHARE : undefined,
  }
  for (;;) {
    // เวลาจาก DB ณ ตอนเขียน (ไม่ใช่นาฬิกา app): ถ้า app เก็บ now() ไว้ก่อนแล้วค่อยเขียน คำขอที่ now เก่ากว่าแต่เขียนช้ากว่า
    // จะไม่เห็นคนที่ผ่านไปแล้ว → ทั้งคู่ผ่านเกินเพดาน (เจอจริงในเทส 20 พร้อมกัน) · ยังกันนาฬิกาต่าง instance (R-5) ด้วย
    // ponytail: ช่องว่าง commit ระดับ ms ยังเกินเพดานได้นิดหน่อย — ตัวนับกลาง (Phase 2) ถ้าต้องการเป๊ะ
    const [{ firedAt: now }] = await prisma.$queryRaw<{ firedAt: Date }[]>`
      UPDATE "AiSuggestRun" SET "firedAt" = (clock_timestamp() AT TIME ZONE 'UTC') WHERE id = ${runId} RETURNING "firedAt"`
    const rows = await prisma.aiSuggestRun.findMany({
      where: { provider: 'typhoon', firedAt: { gte: new Date(now.getTime() - 60_000), lte: now } },
      orderBy: [{ firedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, shopId: true, firedAt: true },
    })
    if (computePacingVerdict(rows, { id: runId, shopId, firedAt: now }, limits)) return true
    await prisma.aiSuggestRun.update({ where: { id: runId }, data: { firedAt: null } })
    if (Date.now() + PACING_SLEEP_MS > deadlineAt) return false
    await new Promise((r) => setTimeout(r, PACING_SLEEP_MS))
  }
}

// ---------------------------------------------------------------- state mapping

type RunRow = {
  id: string
  anchorMessageId: string
  attempt: number
  status: string
  outcome: string | null
  suggestion: string | null
  feedback: string | null
  createdAt: Date
}

function reasonOf(outcome: string | null): AutoSuggestReason {
  // outcome OK + status NONE = ผลถูกทิ้งเพราะ anchor เก่าแล้ว (STALE_ANCHOR)
  if (outcome === 'OK') return 'STALE_ANCHOR'
  return (outcome as Exclude<AutoSuggestOutcome, 'OK'> | null) ?? 'ERROR'
}

function toState(r: RunRow): AutoSuggestState {
  if (r.status === 'READY' && r.suggestion)
    return {
      status: 'READY',
      anchorMessageId: r.anchorMessageId,
      attempt: r.attempt,
      suggestion: r.suggestion,
      feedback: r.feedback === 'UP' || r.feedback === 'DOWN' ? r.feedback : null,
    }
  if (r.status === 'THINKING') return { status: 'THINKING', anchorMessageId: r.anchorMessageId, attempt: r.attempt }
  return { status: 'NONE', anchorMessageId: r.anchorMessageId, attempt: r.attempt, reason: reasonOf(r.outcome) }
}

// ---------------------------------------------------------------- claim

const RUN_SELECT = {
  id: true,
  anchorMessageId: true,
  attempt: true,
  status: true,
  outcome: true,
  suggestion: true,
  feedback: true,
  createdAt: true,
} as const

type ClaimResult = { owned: true; runId: string } | { owned: false; state: AutoSuggestState }

/** createMany skipDuplicates = ON CONFLICT DO NOTHING (ไม่เขียน ERROR ลง log Postgres) */
export async function claimRun(p: {
  shopId: string
  conversationId: string
  anchorMessageId: string
  attempt: number
  trigger: AutoSuggestTrigger | typeof MEMORY_UPDATE_TRIGGER
}): Promise<ClaimResult> {
  const id = randomUUID()
  const { count } = await prisma.aiSuggestRun.createMany({
    data: [{ id, ...p, status: 'THINKING', provider: 'typhoon' }],
    skipDuplicates: true,
  })
  if (count === 1) return { owned: true, runId: id }

  const row = await prisma.aiSuggestRun.findUnique({
    where: {
      conversationId_anchorMessageId_attempt: {
        conversationId: p.conversationId,
        anchorMessageId: p.anchorMessageId,
        attempt: p.attempt,
      },
    },
    select: RUN_SELECT,
  })
  if (!row) return { owned: false, state: { status: 'NONE', anchorMessageId: p.anchorMessageId, attempt: p.attempt, reason: 'ERROR' } }
  if (row.status === 'THINKING' && Date.now() - row.createdAt.getTime() > LEASE_MS) {
    const t = await prisma.aiSuggestRun.updateMany({
      where: { id: row.id, status: 'THINKING', createdAt: { lt: new Date(Date.now() - LEASE_MS) } },
      data: { createdAt: new Date() },
    })
    if (t.count === 1) return { owned: true, runId: row.id }
  }
  return { owned: false, state: toState(row) }
}

// ---------------------------------------------------------------- context

async function latestMessage(conversationId: string) {
  return prisma.chatMessage.findFirst({
    where: { conversationId, type: { not: AUTO_ORDER_RESULT_TYPE }, NOT: { type: META_NOTICE_TYPE } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, senderRole: true },
  })
}

async function loadPayload(p: RequestAutoSuggestParams, conv: { buyerUserId: string | null; externalContactId: string | null }) {
  const rowsDesc = await prisma.chatMessage.findMany({
    where: { conversationId: p.conversationId, type: { not: AUTO_ORDER_RESULT_TYPE }, NOT: { type: META_NOTICE_TYPE } },
    orderBy: { createdAt: 'desc' },
    take: RECENT_LIMIT,
    select: { senderRole: true, type: true, body: true, productRefId: true, senderUserId: true },
  })
  const rows = rowsDesc.reverse()

  // isOwnerPaidPlan ล้ม = ถือเป็น non-paid (ไม่ fail ทั้งคำขอ) — ฝั่งนี้ไม่มีโควตา จึงกระทบแค่สิทธิ์บริบท (OQ-7)
  // loadPromptMemory อ่านก่อนรู้สวิตช์ (ขนานกับ query เดิม ไม่เพิ่ม round-trip) แล้วทิ้งส่วนที่สวิตช์ปิดทีหลัง;
  // fail-soft ในตัว แต่กันซ้ำเผื่อ mock/อนาคต throw
  const [shop, crm, stored, isPaid, promptMem] = await Promise.all([
    prisma.shop.findUnique({ where: { id: p.shopId }, select: { shopName: true, vertical: true } }),
    getConversationCrm(p.conversationId, p.shopId),
    getAiSetting(p.shopId),
    isOwnerPaidPlan(p.shopId).catch(() => false),
    loadPromptMemory({ shopId: p.shopId, conversationId: p.conversationId, includeMemory: true, includeProducts: true }).catch(
      () => ({ memory: null, products: [] }),
    ),
  ])
  const setting = getEffectiveAiSetting(stored, isPaid)

  let productCards = new Map<string, { name: string; price: string; isActive: boolean }>()
  if (setting.includeProductContext) {
    productCards = await resolveProductCards(
      p.shopId,
      rows.map((m) => m.productRefId).filter((id): id is string => id !== null),
    ).catch(() => productCards)
  }
  const turns = buildSuggestTurns(rows, {
    productCards,
    includeProductContext: setting.includeProductContext,
    externalSafe: true,
  })

  const buyerTexts = turns.filter((t) => t.role === 'BUYER').slice(-3).map((t) => t.text)
  const [prod, cust] = await Promise.allSettled([
    setting.includeProductContext ? buildProductBlock(p.shopId, buyerTexts) : Promise.resolve(''),
    setting.includeCustomerContext ? buildCustomerBlock(p.shopId, conv) : Promise.resolve(''),
  ])
  const contextBlock = composeContextBlock(
    prod.status === 'fulfilled' ? prod.value : '',
    cust.status === 'fulfilled' ? cust.value : '',
  )

  const rawVertical = shop?.vertical ?? ''
  const identity = await buildSuggestIdentity({ crm, rows, sessionName: p.userDisplayName })
  return {
    turns,
    input: {
      turns,
      shopName: shop?.shopName ?? '',
      instruction: setting.instruction,
      contextBlock,
      memory: setting.includeCustomerContext ? promptMem.memory : null,
      interestedProducts: setting.includeProductContext ? promptMem.products.map(formatInterestedProductLine) : [],
      vertical: isShopVertical(rawVertical) ? rawVertical : DEFAULT_SHOP_VERTICAL,
      ...identity,
    },
  }
}

// ---------------------------------------------------------------- main

export async function requestAutoSuggest(p: RequestAutoSuggestParams): Promise<RequestAutoSuggestResult> {
  const deadlineAt = Date.now() + PACING_DEADLINE_MS

  // ownership + anchor อยู่ในห้องนี้จริง (route กรองมาแล้ว แต่ service ไม่เชื่อ caller)
  const [conv, anchor] = await Promise.all([
    prisma.conversation.findFirst({
      where: { id: p.conversationId, shopId: p.shopId },
      select: { isSpam: true, buyerUserId: true, externalContactId: true },
    }),
    prisma.chatMessage.findFirst({
      where: { id: p.anchorMessageId, conversationId: p.conversationId },
      select: { senderRole: true },
    }),
  ])
  if (!conv || !anchor) return { status: 'INVALID_ANCHOR' }

  let attempt = 1
  if (p.manual) {
    const last = await prisma.aiSuggestRun.findFirst({
      where: { conversationId: p.conversationId, anchorMessageId: p.anchorMessageId },
      orderBy: { attempt: 'desc' },
      select: { attempt: true },
    })
    attempt = (last?.attempt ?? 0) + 1
  }

  const claim = await claimRun({
    shopId: p.shopId,
    conversationId: p.conversationId,
    anchorMessageId: p.anchorMessageId,
    attempt,
    trigger: p.trigger,
  })
  if (!claim.owned) return claim.state

  const runId = claim.runId
  const finish = (data: Record<string, unknown>) =>
    prisma.aiSuggestRun.update({ where: { id: runId }, data: { ...data, finishedAt: new Date() } })
  const none = async (
    outcome: AutoSuggestOutcome,
    reason: AutoSuggestReason,
    extra: Record<string, unknown> = {},
  ): Promise<AutoSuggestState> => {
    await finish({ status: 'NONE', outcome, ...extra })
    return { status: 'NONE', anchorMessageId: p.anchorMessageId, attempt, reason }
  }

  try {
    if (anchor.senderRole !== 'BUYER') return await none('SKIPPED_NOT_BUYER', 'SKIPPED_NOT_BUYER')
    const latest = await latestMessage(p.conversationId)
    if (latest?.id !== p.anchorMessageId) return await none('SKIPPED_NOT_BUYER', 'STALE_ANCHOR')
    if (conv.isSpam) return await none('SKIPPED_SPAM', 'SKIPPED_SPAM')
    const botJob = await prisma.autoReplyJob.findFirst({
      where: {
        chatMessageId: p.anchorMessageId,
        status: { in: ['PENDING', 'PROCESSING'] },
        updatedAt: { gt: new Date(Date.now() - BOT_FRESH_MS) },
      },
      select: { id: true },
    })
    if (botJob) return await none('SKIPPED_BOT', 'SKIPPED_BOT')
    const provider = resolveSuggestProvider(p.shopId)
    if (provider !== 'typhoon') {
      return await none('SKIPPED_NOT_ALLOWED', provider === 'gemini' ? 'NOT_ENABLED' : 'NOT_CONFIGURED')
    }

    const { turns, input } = await loadPayload(p, conv)
    if (turns.length === 0) return await none('SKIPPED_EMPTY', 'SKIPPED_EMPTY')

    // SanitizeError ไปที่ catch ด้านล่าง → ERROR โดยยังไม่เคยเรียก provider (fail-closed)
    const payload: SanitizedPayload = sanitizeForExternalAi(input, 'typhoon')

    if (!(await reserveSlot(runId, p.shopId, { deadlineAt }))) return await none('RATE_LIMITED', 'RATE_LIMITED')

    let draft
    try {
      draft = await draftReplySuggestions('typhoon', payload)
    } catch (e) {
      if (e instanceof TyphoonNotConfiguredError) return await none('SKIPPED_NOT_ALLOWED', 'NOT_CONFIGURED')
      if (e instanceof TyphoonRateLimitedError) return await none('RATE_LIMITED', 'RATE_LIMITED') // ไม่ retry
      if (e instanceof TyphoonApiError && e.kind === 'TIMEOUT') return await none('TIMEOUT', 'TIMEOUT')
      return await none('ERROR', 'ERROR')
    }
    const meta = {
      provider: 'typhoon',
      model: draft.model,
      latencyMs: draft.latencyMs,
      inputTokens: draft.usage?.inputTokens ?? null,
      outputTokens: draft.usage?.outputTokens ?? null,
    }

    const restored = restorePii(draft.suggestions[0] ?? '', payload.vault)
    if (restored.unresolved.length > 0) return await none('UNRESOLVED_TOKEN', 'UNRESOLVED_TOKEN', meta)
    const suggestion = clampSuggestion(restored.text)
    if (!suggestion) return await none('ERROR', 'ERROR', meta)

    // ระหว่างรอโมเดลอาจมีข้อความใหม่ → ผลเก่า ห้ามแสดง (FR-AIT-08 ฝั่ง server)
    const after = await latestMessage(p.conversationId)
    if (after?.id !== p.anchorMessageId) return await none('OK', 'STALE_ANCHOR', meta)

    await finish({ status: 'READY', outcome: 'OK', suggestion, ...meta })
    return { status: 'READY', anchorMessageId: p.anchorMessageId, attempt, suggestion, feedback: null }
  } catch (e) {
    // กันแผงค้าง THINKING (R-8) — log ชนิดเท่านั้น message อาจมีเนื้อความลูกค้า
    console.error('[ai-suggest-auto] failed:', e instanceof SanitizeError ? 'SanitizeError' : e instanceof Error ? e.name : 'unknown')
    return none('ERROR', 'ERROR').catch(() => ({
      status: 'NONE' as const,
      anchorMessageId: p.anchorMessageId,
      attempt,
      reason: 'ERROR' as const,
    }))
  }
}

// ---------------------------------------------------------------- read / feedback

export async function getLatestAutoSuggest(shopId: string, conversationId: string): Promise<AutoSuggestGetResponse> {
  const provider: AutoSuggestProvider = resolveSuggestProvider(shopId)
  if (provider !== 'typhoon') {
    return {
      status: 'NONE',
      anchorMessageId: null,
      attempt: null,
      reason: provider === 'gemini' ? 'NOT_ENABLED' : 'NOT_CONFIGURED',
      provider,
    }
  }
  const latest = await latestMessage(conversationId)
  if (!latest || latest.senderRole !== 'BUYER') {
    return { status: 'NONE', anchorMessageId: null, attempt: null, reason: 'STALE_ANCHOR', provider }
  }
  const run = await prisma.aiSuggestRun.findFirst({
    where: { shopId, conversationId, anchorMessageId: latest.id },
    orderBy: { attempt: 'desc' },
    select: RUN_SELECT,
  })
  if (!run) return { status: 'NONE', anchorMessageId: latest.id, attempt: null, reason: 'NO_RUN', provider }
  return { ...toState(run), provider }
}

/** ok=false → route 404 */
export async function submitAutoSuggestFeedback(
  p: { shopId: string; conversationId: string } & AutoSuggestPatchBody,
): Promise<{ ok: boolean }> {
  // note ผ่านตัวกรอง PII เดิม (ไม่ reversible) ก่อนเก็บ — BR-AIT-11
  const note = p.note ? redactPii(p.note.slice(0, AUTO_SUGGEST_NOTE_MAX)).text.slice(0, AUTO_SUGGEST_NOTE_MAX) : null
  const { count } = await prisma.aiSuggestRun.updateMany({
    where: {
      conversationId: p.conversationId,
      shopId: p.shopId,
      anchorMessageId: p.anchorMessageId,
      attempt: p.attempt,
      status: 'READY',
    },
    data: { feedback: p.feedback, feedbackReason: p.reason ?? null, feedbackNote: note, feedbackAt: new Date() },
  })
  return { ok: count > 0 }
}
