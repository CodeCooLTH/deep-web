import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireShopContext, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { normalizeMessage } from '@/lib/auto-reply-normalize'
import { matchKeywords, resolveRule } from '@/services/auto-reply-match.service'
import { AutoReplySimulateSchema } from '@/lib/validations'
import { prisma } from '@/lib/prisma'
import { getConfig } from '@/services/auto-reply-config.service'

/**
 * POST /api/shops/auto-reply/simulate — ทดสอบกฎแบบกรอกเอง (FR-020)
 *
 * WARNING: ห้ามเขียนแถวใด ๆ ห้ามส่งข้อความ ห้ามแตะคิว — QA พิสูจน์ด้วยการนับแถวก่อน/หลัง
 * ใช้ matcher **ตัวเดียวกับเส้นทางตอบจริง** (ไม่มี logic คู่ขนาน) ซึ่งเป็นสิ่งที่ทำให้ AC-020-05
 * เป็นจริง — ผลที่เห็นตรงกับสิ่งที่จะเกิดขึ้นจริงเมื่อลูกค้าส่งข้อความเดียวกัน
 *
 * ใช้ได้แม้ร้านปิด auto-reply อยู่ (AC-020-06) เพราะเป็นเครื่องมือตั้งค่า ไม่ใช่การตอบ
 *
 * NOTE (สำหรับ reviewer): endpoint นี้เป็น POST แต่ **ไม่มี forbidIfReadOnly โดยเจตนา**
 * ไม่ใช่การลืม — มันไม่เขียนข้อมูลใด ๆ (อ่านกฎ + เรียกฟังก์ชันบริสุทธิ์เท่านั้น) ใช้ POST
 * เพราะรับ body ไม่ใช่เพราะเปลี่ยนสถานะ. STAFF ที่อ่านการตั้งค่าได้ ควรทดลองกฎได้ด้วย
 * ไม่งั้นคนที่ต้องรับผลจากการตั้งค่าจะตรวจสอบมันไม่ได้เลย
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplySimulateSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const normalizedText = normalizeMessage(parsed.output.message)

  // WARNING: พรีวิวต้องรวม "ชุดที่ยังปิดอยู่" ด้วย (user 2026-07-29)
  // เพราะหน้านี้คือการดูว่า *ที่ตั้งไว้* จะตอบอะไร ไม่ใช่การทดสอบ gate ของระบบจริง
  // ถ้ากรอง OFFLINE ออก ผู้ใช้ที่กำลังตั้งค่าจะไม่มีทางเห็นคำตอบของตัวเองเลยจนกว่าจะเปิดใช้งาน
  // ซึ่งกลับหัวกับลำดับการทำงานจริง (ตั้งค่า -> ดูผล -> ค่อยเปิด)
  // สถานะยังส่งกลับไปให้ UI บอกเป็นข้อความเล็ก ๆ ว่ายังไม่เปิด — ไม่บังคำตอบ
  const [allKeywords, allRules] = await Promise.all([
    prisma.autoReplyKeyword.findMany({
      where: { shopId: ctx.shopId },
      select: {
        id: true, name: true, matchType: true, priority: true, status: true,
        phrases: { select: { id: true, phrase: true, normalizedPhrase: true } },
      },
      orderBy: { priority: 'desc' },
    }),
    prisma.autoReplyRule.findMany({
      where: { shopId: ctx.shopId },
      select: {
        id: true, keywordId: true, shopChannelId: true, adId: true, productId: true,
        specificity: true, isActive: true, activeFrom: true, activeUntil: true,
        replyText: true, createdAt: true,
      },
    }),
  ])
  const ruleSet = { keywords: allKeywords, rules: allRules } as never
  const matchCtx = {
    shopChannelId: parsed.output.shopChannelId ?? null,
    adId: parsed.output.adId ?? null,
    productId: parsed.output.productId ?? null,
    now: new Date(),
  }

  const matched = matchKeywords(normalizedText, ruleSet, matchCtx)


  const effectiveKeywordId = matched.winner?.keywordId ?? null
  const matchedVia: 'KEYWORD' | null = matched.winner ? 'KEYWORD' : null

  const resolved = resolveRule(matched.winner?.keywordId ?? null, matchCtx, ruleSet)

  // สถานะของชุดที่ชนะ — UI เอาไปบอกเป็นข้อความเล็ก ๆ ใต้คำตอบ ไม่บังคำตอบ
  // ใช้ effectiveKeywordId เพื่อให้ผู้ชนะจากคลังก็โชว์สถานะกลุ่มเจ้าของได้เหมือนกัน
  const winner = allKeywords.find((k) => k.id === effectiveKeywordId)
  const winnerState = winner
    ? { keywordId: winner.id, keywordName: winner.name, status: winner.status }
    : null

  const config = await getConfig(ctx.shopId)

  return NextResponse.json(
    {
      rawText: parsed.output.message,
      normalizedText,
      matched: matched.winner
        ? {
            keywordId: matched.winner.keywordId,
            keywordName: matched.winner.keywordName,
            matchedPhrase: matched.winner.matchedPhrase,
            matchType: matched.winner.matchType,
          }
        : null,
      // AC-020-04: ต้องบอกได้ว่ากฎอื่นทำไมไม่ถูกเลือก
      matchTrace: matched.matchTrace,
      fallbackFrom: resolved.fallbackFrom,
      resolutionLevel: resolved.resolutionLevel,
      ruleId: resolved.rule?.id ?? null,
      replyText: resolved.rule?.replyText ?? null,
      // ไม่มีกฎให้ถอย = ระบบจะเงียบแล้วส่งต่อพนักงาน ไม่ใช่เดาคำตอบ
      willHandoff: !resolved.rule?.replyText?.trim(),
      matchedVia,
      // บริบทให้ UI บอกสถานะได้ (ยังไม่เปิด / อยู่โหมดทดสอบ) โดยไม่ต้องบังคำตอบ
      winnerState,
    },
    { headers: AUTO_REPLY_NO_STORE },
  )
}
