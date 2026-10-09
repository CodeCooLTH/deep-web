import 'server-only'
import { thaiDayKey } from '@/lib/format-date'
import { prisma } from '@/lib/prisma'
import { AUTO_ORDER_RESULT_TYPE } from '@/lib/auto-order-message-type'
import { MEMORY_UPDATE_TRIGGER, type MemoryUpdateOutcome } from '@/lib/ai-suggest-auto-types'
import { MEMORY_AI_WINDOW, MEMORY_SLOT_WAIT_MS } from '@/lib/chat-memory-types'
import { baseHasPii, shouldAttemptMemoryUpdate, validateAiMemory } from '@/lib/chat-memory-rules'
import { SanitizeError, sanitizeForExternalAi } from '@/lib/ai-suggest-sanitize'
import { buildSuggestTurns } from '@/lib/ai-suggest-turns'
import { resolveSuggestProvider } from '@/lib/reply-suggest-provider'
import {
  generateTyphoonMemoryText,
  TyphoonApiError,
  TyphoonRateLimitedError,
} from '@/lib/typhoon'
import { claimRun, reserveSlot } from '@/services/ai-suggest-auto.service'
import { resolveEffectiveMemory } from '@/services/chat-memory.service'
import { getAiSetting, getEffectiveAiSetting } from '@/services/ai-setting.service'
import { isOwnerPaidPlan } from '@/services/ai-suggest-quota.service'
import { getConversationCrm } from '@/services/chat-crm.service'
import { buildSuggestIdentity } from '@/services/ai-suggest-identity'

/**
 * ผู้เขียนความจำอัตโนมัติ (Typhoon) — 00019-ext-mem S-9/S-10
 * 🛑 ห้าม console.* ที่รับเนื้อความ/ชื่อ (BR-AIT-09) · ห้าม restorePii ลงความจำ (BR-MEM-03)
 */

/** CAS ด้วย version: แอดมินบันทึกแทรกระหว่างที่ AI คิด → ไม่เขียนทับ (SUPERSEDED, BR-MEM-05) */

// เท่า LEASE_MS ของ claimRun — งานความจำที่ยังไม่ปิดภายในนี้ถือว่ายังวิ่งอยู่
const MEMORY_RUN_LEASE_MS = 30_000
export async function applyAiUpdate(p: {
  shopId: string
  conversationId: string
  row: { id: string; version: number } | null
  text: string
  basedOnMessageId: string
}): Promise<'OK' | 'SUPERSEDED'> {
  const { shopId } = p
  if (!p.row) {
    // createMany skipDuplicates: ชนกัน = count 0 ไม่เกิด ERROR ใน log Postgres
    const { count } = await prisma.chatMemory.createMany({
      data: [
        {
          shopId,
          conversationId: p.conversationId,
          text: p.text,
          source: 'AI',
          version: 1,
          basedOnMessageId: p.basedOnMessageId,
          aiUpdatedAt: new Date(),
        },
      ],
      skipDuplicates: true,
    })
    return count === 1 ? 'OK' : 'SUPERSEDED'
  }
  const cur = await prisma.chatMemory.findFirst({ where: { id: p.row.id, shopId }, select: { text: true } })
  if (!cur) return 'SUPERSEDED'
  const { count } = await prisma.chatMemory.updateMany({
    where: { id: p.row.id, shopId, version: p.row.version },
    data: {
      text: p.text,
      source: 'AI',
      version: p.row.version + 1,
      previousText: cur.text || null,
      basedOnMessageId: p.basedOnMessageId,
      aiUpdatedAt: new Date(),
      updatedByUserId: null,
    },
  })
  return count === 1 ? 'OK' : 'SUPERSEDED'
}

export type MaybeUpdateResult = {
  outcome: MemoryUpdateOutcome | 'NOT_APPLICABLE'
  /** claim แพ้ = มีงานเดียวกันกำลังรัน/เสร็จแล้ว (refresh route แปลงเป็น THINKING) */
  busy?: boolean
}

const MSG_WHERE = (conversationId: string) => ({ conversationId, type: { not: AUTO_ORDER_RESULT_TYPE } })

/** ไม่ throw ทุกกรณี */
export async function maybeUpdateMemory(p: {
  shopId: string
  conversationId: string
  latestMessageId: string
  force?: boolean
}): Promise<MaybeUpdateResult> {
  const { shopId, conversationId } = p
  let runId: string | null = null
  const finish = async (outcome: MemoryUpdateOutcome, extra: Record<string, unknown> = {}): Promise<MaybeUpdateResult> => {
    if (runId) {
      await prisma.aiSuggestRun
        .update({
          where: { id: runId },
          data: { status: outcome === 'OK' ? 'READY' : 'NONE', outcome, suggestion: null, finishedAt: new Date(), ...extra },
        })
        .catch(() => {})
    }
    return { outcome }
  }

  try {
    // 1) เงื่อนไขเข้า: ร้าน typhoon + สวิตช์ "ข้อมูลลูกค้า" (effective) เปิด
    if (resolveSuggestProvider(shopId) !== 'typhoon') return { outcome: 'NOT_APPLICABLE' }
    const [stored, isPaid, eff] = await Promise.all([
      getAiSetting(shopId),
      isOwnerPaidPlan(shopId).catch(() => false),
      resolveEffectiveMemory(shopId, conversationId),
    ])
    if (!eff || !getEffectiveAiSetting(stored, isPaid).includeCustomerContext) return { outcome: 'NOT_APPLICABLE' }
    const row = eff.row
    const base = row?.text ?? ''
    const hasText = base.trim().length > 0

    // 2) ตัดสินก่อน claim (P-4: SKIPPED_FEW/COOLDOWN ไม่เขียนแถว)
    // P-5: นับหลังข้อความฐานถ้าฐานอยู่ห้องนี้ ไม่งั้นนับหลังเวลาที่แถวถูกแก้ล่าสุด
    let since: Date | null = null
    if (row && hasText) {
      const baseId = row.basedOnMessageId
      const baseMsg = baseId
        ? await prisma.chatMessage.findFirst({
            where: { id: baseId, conversationId },
            select: { createdAt: true },
          })
        : null
      since = baseMsg?.createdAt ?? row.updatedAt
    }
    const [newMessageCount, totalMessages, buyerMessages, lastRun] = await Promise.all([
      since
        ? prisma.chatMessage.count({ where: { ...MSG_WHERE(conversationId), createdAt: { gt: since } } })
        : Promise.resolve(0),
      prisma.chatMessage.count({ where: MSG_WHERE(conversationId) }),
      prisma.chatMessage.count({ where: { ...MSG_WHERE(conversationId), senderRole: 'BUYER' } }),
      // P-3: ผลถูกปฏิเสธก็นับเป็นความพยายาม ไม่งั้นทุกข้อความถัดไปยิงซ้ำ
      prisma.aiSuggestRun.findFirst({
        where: { shopId, conversationId, trigger: MEMORY_UPDATE_TRIGGER },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ])
    const lastAt = Math.max(row?.aiUpdatedAt?.getTime() ?? 0, lastRun?.createdAt.getTime() ?? 0)
    const gate = shouldAttemptMemoryUpdate({
      newMessageCount: hasText ? newMessageCount : totalMessages,
      totalMessages,
      buyerMessages,
      hasText,
      msSinceLastAiRun: lastAt ? Date.now() - lastAt : null,
      force: !!p.force,
    })
    if (!gate.ok) return { outcome: gate.outcome }

    // 3) claim — force ใช้ attempt ถัดไป (anchor เดิมเคยรันแล้วก็ขอใหม่ได้)
    const anchorMessageId = `mem:${p.latestMessageId}`
    let attempt = 1
    if (p.force) {
      const last = await prisma.aiSuggestRun.findFirst({
        where: { conversationId, anchorMessageId },
        orderBy: { attempt: 'desc' },
        select: { attempt: true, finishedAt: true, createdAt: true },
      })
      // ยังมีงานของ anchor นี้วิ่งอยู่ (กดซ้ำ/สองแท็บ) → ไม่ยิงซ้ำ ให้เป็น THINKING (lease เดียวกับ claimRun)
      if (last && !last.finishedAt && Date.now() - last.createdAt.getTime() < MEMORY_RUN_LEASE_MS) {
        return { outcome: 'NOT_APPLICABLE', busy: true }
      }
      attempt = (last?.attempt ?? 0) + 1
    }
    const claim = await claimRun({ shopId, conversationId, anchorMessageId, attempt, trigger: MEMORY_UPDATE_TRIGGER })
    if (!claim.owned) return { outcome: 'NOT_APPLICABLE', busy: true }
    runId = claim.runId

    // 4) ฐานมี PII (แอดมินพิมพ์เอง) → ไม่ส่งออกเด็ดขาด
    if (baseHasPii(base)) return await finish('SKIPPED_BASE_HAS_PII')

    // 5) sanitize: ฐาน = memory, ข้อความหลังฐาน (≤ 40) = turns
    const recent = await prisma.chatMessage.findMany({
      where: { ...MSG_WHERE(conversationId), ...(since ? { createdAt: { gt: since } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: MEMORY_AI_WINDOW,
      select: { senderRole: true, type: true, body: true, productRefId: true, senderUserId: true },
    })
    const rows = recent.reverse()
    const turns = buildSuggestTurns(rows, { productCards: new Map(), includeProductContext: false, externalSafe: true })
    if (turns.length === 0) return await finish('SKIPPED_FEW_MESSAGES')
    const crm = await getConversationCrm(conversationId, shopId).catch(() => null)
    const identity = await buildSuggestIdentity({ crm, rows, sessionName: null })
    const payload = sanitizeForExternalAi(
      {
        turns,
        shopName: '',
        memory: hasText ? { text: base, updatedDay: thaiDayKey(row!.updatedAt) } : null,
        ...identity,
      },
      'typhoon',
    )
    // sanitize ทิ้งความจำเดิม (scrub พัง) → AI จะเขียนใหม่จากศูนย์ทับของเดิม ⇒ ไม่ส่ง
    if (hasText && payload.memory === null) return await finish('ERROR')

    // 6) คิวต่ำกว่าคำแนะนำหลัก รอได้สั้น ๆ
    if (!(await reserveSlot(runId, shopId, { lowPriority: true, deadlineAt: Date.now() + MEMORY_SLOT_WAIT_MS }))) {
      return await finish('RATE_LIMITED')
    }

    // 7) เรียกโมเดล ไม่ retry
    let gen
    try {
      gen = await generateTyphoonMemoryText(payload)
    } catch (e) {
      if (e instanceof TyphoonRateLimitedError) return await finish('RATE_LIMITED')
      if (e instanceof TyphoonApiError && e.kind === 'TIMEOUT') return await finish('TIMEOUT')
      return await finish('ERROR')
    }
    const meta = {
      model: gen.model,
      latencyMs: gen.latencyMs,
      inputTokens: gen.usage?.inputTokens ?? null,
      outputTokens: gen.usage?.outputTokens ?? null,
    }

    // 8) ตรวจผล — ไม่ restorePii: ป้ายที่หลุดมา = REJECTED_PII
    const v = validateAiMemory(gen.text, base)
    if (!v.ok) return await finish(v.outcome, meta)

    // 9) CAS
    const applied = await applyAiUpdate({
      shopId,
      conversationId,
      row: row ? { id: row.id, version: row.version } : null,
      text: v.text,
      basedOnMessageId: p.latestMessageId,
    })
    return await finish(applied === 'OK' ? 'OK' : 'SUPERSEDED', meta)
  } catch (e) {
    // log ชนิดเท่านั้น — message อาจมีเนื้อความลูกค้า
    console.error('[chat-memory-ai] failed:', e instanceof SanitizeError ? 'SanitizeError' : e instanceof Error ? e.name : 'unknown')
    return finish('ERROR')
  }
}
