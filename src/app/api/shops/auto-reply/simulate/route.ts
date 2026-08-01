import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireShopContext, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { normalizeMessage } from '@/lib/auto-reply-normalize'
import { matchKeywords, resolveRule } from '@/services/auto-reply-match.service'
import { AutoReplySimulateSchema } from '@/lib/validations'
import { prisma } from '@/lib/prisma'
import { getConfig } from '@/services/auto-reply-config.service'
// phase 00023-qna — คลังคำถาม-คำตอบ (วิธีจับคู่ทางที่สอง) ต้องเห็นในพรีวิวด้วย ไม่งั้น AC-020-05 พัง
import { matchQna } from '@/lib/auto-reply-qna-match'

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
  const [allKeywords, allRules, allQnas] = await Promise.all([
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
    // คลังคำถาม-คำตอบของร้าน (phase 00023-qna)
    //
    // WARNING: **ห้ามใช้ `loadRuleSet()` แทน query นี้** แม้จะดูซ้ำซ้อน — `loadRuleSet` กรอง
    // กลุ่มคำ OFFLINE ออก ซึ่งกลับหัวกับเจตนาของหน้าพรีวิว (ดูคอมเมนต์ WARNING ด้านบน)
    // ถ้าเปลี่ยนมาใช้ ผู้ใช้ที่กำลังตั้งค่าจะไม่เห็นคำตอบในคลังของกลุ่มที่ยังไม่เปิดเลย
    //
    // NOTE: ไม่กรอง `isActive` ที่ query โดยเจตนา — `matchQna()` ตัดข้อที่ปิดอยู่ทิ้งเองข้างใน
    // (จุดตัดสินเดียว ไม่มีเงื่อนไขคู่ขนาน หลักเดียวกับที่ฝั่ง keyword ก็ไม่กรอง `status` ที่นี่)
    prisma.autoReplyQna.findMany({
      where: { shopId: ctx.shopId },
      select: {
        id: true, keywordId: true, question: true, normalizedQuestion: true,
        answer: true, imageFileIds: true, isActive: true, useCount: true,
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

  /**
   * คลังคำถาม-คำตอบ — วิธีจับคู่ "ทางที่สอง" (phase 00023-qna, TFR-032)
   *
   * WARNING: เงื่อนไขต้องเหมือน `processJob` เป๊ะ — เรียก **เฉพาะเมื่อไม่มีกลุ่มคำใดตรง**
   * และ **ไม่** เรียกตอนกลุ่มคำตรงแต่ไม่มีกฎ (NO_RULE_MATCH) เพราะนั่นคือร้านตั้งค่าค้าง
   * ครึ่งทางซึ่งร้านต้องเห็นว่าค้าง ไม่ใช่ให้คลังมากลบร่องรอย
   *
   * ส่ง `allKeywords` (ไม่กรอง status) โดยเจตนา — ต่างจาก `processJob` ที่ส่งเฉพาะกลุ่มที่
   * ไม่ OFFLINE นี่ไม่ใช่ความไม่สอดคล้อง แต่คือ parity กับพฤติกรรมเดิมของหน้าพรีวิวเอง
   * ซึ่งแสดงกลุ่มที่ยังไม่เปิดอยู่แล้ว (matchKeywords ข้างบนก็ใช้ชุดเดียวกันนี้)
   */
  const qnaMatch = matched.winner
    ? null
    : matchQna(normalizedText, allQnas, allKeywords, { mode: 'EXACT' })

  /** กลุ่มคำที่ "เป็นเจ้าของ" คำตอบครั้งนี้ — คำตรงตัว หรือกลุ่มที่ QnA ยืมมา (TFR-032 ข้อ 2) */
  const effectiveKeywordId = matched.winner?.keywordId ?? qnaMatch?.keywordId ?? null
  const matchedVia: 'KEYWORD' | 'QNA' | null = matched.winner ? 'KEYWORD' : qnaMatch ? 'QNA' : null

  // NOTE: ผู้ชนะจากคลังไม่ผ่าน resolveRule เลย (ใช้ qna.answer ตรง ๆ) — เรียกด้วย null
  // เพื่อให้ fallbackFrom/resolutionLevel สะท้อนความจริงว่า "ไม่ได้มาจากกฎ"
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
      // ตอบจากคลัง = ไม่ได้ผ่านบันไดกฎ จึงรายงานระดับเป็น QNA ตรง ๆ (SDS §14.2 ข้อ 3)
      resolutionLevel: qnaMatch ? 'QNA' : resolved.resolutionLevel,
      ruleId: qnaMatch ? null : (resolved.rule?.id ?? null),
      replyText: qnaMatch ? qnaMatch.qna.answer : (resolved.rule?.replyText ?? null),
      // ไม่มีกฎให้ถอย = ระบบจะเงียบแล้วส่งต่อพนักงาน ไม่ใช่เดาคำตอบ
      willHandoff: qnaMatch
        ? !qnaMatch.qna.answer.trim()
        : !resolved.rule?.replyText?.trim(),
      // phase 00023-qna — บอกว่าคำตอบนี้มาทางไหน (API.md §4.18-ext)
      matchedVia,
      qna: qnaMatch
        ? {
            id: qnaMatch.qna.id,
            question: qnaMatch.qna.question,
            answer: qnaMatch.qna.answer,
            imageFileIds: qnaMatch.qna.imageFileIds,
          }
        : null,
      // บริบทให้ UI บอกสถานะได้ (ยังไม่เปิด / อยู่โหมดทดสอบ) โดยไม่ต้องบังคำตอบ
      winnerState,
    },
    { headers: AUTO_REPLY_NO_STORE },
  )
}
