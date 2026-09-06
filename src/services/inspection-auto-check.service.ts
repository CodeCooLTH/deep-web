import 'server-only'

import { prisma } from '@/lib/prisma'
import { getMaxVerificationLevel } from '@/services/verification.service'
import { searchScamByIdentifier } from '@/services/scam-report.service'
import { recordCheckOutcome } from '@/services/inspection-result.service'
import { collectRoomDuplicateFacts } from '@/services/room-image-fingerprint.service'
import { resolveChatResponse } from '@/lib/chat-response-display'
import {
  STEP1_AUTO_CHECKS,
  STEP1_AUTO_CHECK_KEYS,
  isRoomScopedAutoCheck,
  type AutoCheckFacts,
  type AutoCheckSkipReason,
  type Step1AutoCheckKey,
} from '@/lib/inspection/auto-checks'
import type { InspectionCheckKey, InspectionStep } from '@/lib/inspection/checks'

/**
 * inspection-auto-check.service.ts — ข้อตรวจอัตโนมัติของขั้นที่ 1 (feature 00060 · T8 งานที่ 3)
 *
 * 🛑 ไฟล์นี้ **ไม่เขียน `InspectionResult` เอง** ทุกการเขียนผ่าน `recordCheckOutcome()` ซึ่งเป็น
 *    ผู้เขียนคนเดียวของตารางนั้น (มีเทส [blocker] สแกนซอร์สบังคับอยู่) — การตัดสิน
 *    "สร้างแถวใหม่ หรือ เลื่อนเวลาในที่" ต้องอยู่ที่เดียว ไม่งั้นเส้นทางที่ตัดสินเองจะเขียน
 *    แถวซ้ำทุกวันโดยไม่มีอะไรฟ้อง จนกว่าจะมีคนเปิดไทม์ไลน์แล้วเจอ 365 บรรทัดที่เหมือนกัน
 *
 * 🛑 **แหล่งข้อมูลล่ม = ไม่บันทึกอะไรเลย ห้าม fallback เป็น PASS** — ผลเดิมจะอยู่ต่อจน
 *    หมดอายุ (1 วัน) แล้วตกเป็น "รอตรวจซ้ำ" ซึ่งเป็นคำที่ตรงกับความจริง
 *
 * SDS §3.2 เขียนไว้ว่าฟังก์ชันนี้อยู่ใน `inspection-result.service.ts` — แยกออกมาเพราะมันต้อง
 * import แหล่งข้อมูลภายนอก 3 ตัว (ฐานมิจฉาชีพ · การยืนยันตัวตน · ข้อร้องเรียน) ซึ่งจะลาก
 * dependency เข้าไฟล์ที่ทั้งระบบ import เพื่อ "เขียนผลตรวจ" โดยไม่จำเป็น (กติกาผู้เขียนคนเดียว
 * ยังอยู่ครบเพราะไฟล์นี้เรียกผ่าน recordCheckOutcome())
 */

export type AutoCheckRunSummary = {
  /** จำนวนครั้งที่เขียนผล (รวมทั้งการยืนยันผลเดิมและการเปลี่ยนผล) */
  recorded: number
  /** ในจำนวนนั้น มีกี่ครั้งที่ "ผลเปลี่ยน" ⇒ ปรากฏในไทม์ไลน์สาธารณะ */
  changed: number
  /** ข้อที่ไม่ได้บันทึก แยกตามเหตุผล — 🛑 ตัวเลขนี้ต้องอ่านได้จาก log ไม่งั้นข้อที่ไม่เคยถูกตรวจ
   *  จะดูเหมือนข้อที่ตรวจแล้วไม่มีข้อมูล ซึ่งเป็นคนละเรื่องกันโดยสิ้นเชิง */
  skipped: Record<AutoCheckSkipReason, number>
}

const emptySkipped = (): Record<AutoCheckSkipReason, number> => ({
  NO_SOURCE_DATA: 0,
  CRITERIA_NOT_DECIDED: 0,
  NO_DETECTOR: 0,
})

/** รวบรวมข้อเท็จจริงของร้านหนึ่งร้าน — ทุกแหล่งพังแยกกันได้ ห้ามให้แหล่งเดียวล้มทั้งชุด */
export async function collectAutoCheckFacts(shopId: string, now: Date): Promise<AutoCheckFacts | null> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      userId: true,
      createdAt: true,
      chatResponseRate: true,
      chatMedianResponseSec: true,
      chatResponseSampleSize: true,
    },
  })
  if (shop === null) return null

  const [scamFound, verificationLevel, openComplaintCount] = await Promise.all([
    resolveScamFound(shop.userId),
    getMaxVerificationLevel({ userId: shop.userId, shopId }).catch(() => null),
    prisma.order
      .count({ where: { shopId, disputeOpenedAt: { not: null }, disputeResolvedAt: null } })
      .catch(() => null),
  ])

  const MS_PER_DAY = 24 * 60 * 60 * 1000
  return {
    scamFound,
    verificationLevel,
    accountAgeDays: Math.floor((now.getTime() - shop.createdAt.getTime()) / MS_PER_DAY),
    // 🛑 ต้องผ่าน `resolveChatResponse()` เสมอ ห้ามอ่าน `Shop.chatResponseRate` ดิบ ๆ —
    //    ที่นั่นคือที่ที่เกณฑ์ "ตัวอย่างพอไหม" ถูกบังคับ (CHAT_RESPONSE_MIN_SAMPLE)
    //    อ่านดิบแปลว่าป้ายบอก "ตอบแชทผ่าน" จากบทสนทนาเดียว ขณะที่หน้าร้านสาธารณะของร้าน
    //    เดียวกันเลือกจะไม่พูดอะไรเลยเพราะข้อมูลไม่พอ — คำเดียวกันสองนิยาม (Hard Rule 16)
    chatResponseRate: resolveChatResponse(shop)?.ratePercent ?? null,
    openComplaintCount,
  }
}

/** ไม่มีเบอร์ = ค้นไม่ได้ = "ยังไม่มีข้อมูล" — ไม่ใช่ "ไม่พบในฐาน" */
async function resolveScamFound(ownerId: string): Promise<boolean | null> {
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { phone: true } })
  const phone = owner?.phone ?? null
  if (phone === null || phone.trim() === '') return null
  try {
    return (await searchScamByIdentifier('PHONE', phone)).found
  } catch (err) {
    console.error('[inspection/auto-check] ค้นฐานมิจฉาชีพไม่สำเร็จ ownerId=%s', ownerId, err)
    return null
  }
}

/**
 * รันข้อตรวจอัตโนมัติของขั้นที่ 1 ให้ร้านหนึ่งร้าน
 *
 * idempotent โดยธรรมชาติ: ผลที่เหมือนเดิมเป็น `UPDATE` เลื่อน `lastConfirmedAt`/`expiresAt`
 * ในที่ (TD-002) ⇒ รันซ้ำวันเดียวกันไม่เพิ่มแถวสักแถว
 */
export async function runAutomaticStep1Checks(input: {
  shopId: string
  planStep: InspectionStep
  now: Date
}): Promise<AutoCheckRunSummary> {
  const { shopId, planStep, now } = input
  const summary: AutoCheckRunSummary = { recorded: 0, changed: 0, skipped: emptySkipped() }

  const facts = await collectAutoCheckFacts(shopId, now)
  if (facts === null) return summary

  // ── ข้อระดับร้าน ───────────────────────────────────────────────────────────
  for (const key of STEP1_AUTO_CHECK_KEYS) {
    const def = STEP1_AUTO_CHECKS[key]
    if (def.kind !== 'SHOP') continue
    const verdict = def.evaluate(facts)
    if (verdict.kind === 'SKIP') {
      summary.skipped[verdict.reason] += 1
      continue
    }
    const result = await recordCheckOutcome({
      shopId,
      roomId: null,
      checkKey: key as Step1AutoCheckKey as InspectionCheckKey,
      outcome: verdict.outcome,
      planStep,
      now,
      roundId: null,
    })
    summary.recorded += 1
    if (result.changed) summary.changed += 1
  }

  // ── ข้อที่ผูกรายหลัง ───────────────────────────────────────────────────────
  //
  // 🛑 ต้องตัดสิน **ต่อหลัง** ด้วยข้อเท็จจริงของหลังนั้น ห้ามตัดสินครั้งเดียวแล้วเขียนผลเดียวกัน
  //    ลงทุกหลัง — ห้องที่ก็อปรูปมาหนึ่งหลังจะทำให้ทั้งร้านตกทั้งที่หลังอื่นสะอาด และในทางกลับกัน
  //    หลังที่ก็อปมาจะได้ "ผ่าน" ฟรีเพราะหลังอื่นสะอาด (ผิด FR-INS-029 ทั้งสองทาง)
  const roomScopedKeys = STEP1_AUTO_CHECK_KEYS.filter(isRoomScopedAutoCheck)
  if (roomScopedKeys.length > 0) {
    const rooms = await prisma.room.findMany({
      where: { shopId, isActive: true },
      select: { id: true, images: true },
    })
    if (rooms.length > 0) {
      const roomFacts = await collectRoomDuplicateFacts({ shopId, rooms })
      for (const key of roomScopedKeys) {
        const def = STEP1_AUTO_CHECKS[key]
        if (def.kind !== 'ROOM') continue
        for (const room of rooms) {
          const f = roomFacts.get(room.id)
          if (f === undefined) continue
          const verdict = def.evaluateRoom(f)
          if (verdict.kind === 'SKIP') {
            summary.skipped[verdict.reason] += 1
            continue
          }
          const result = await recordCheckOutcome({
            shopId,
            roomId: room.id,
            checkKey: key as Step1AutoCheckKey as InspectionCheckKey,
            outcome: verdict.outcome,
            planStep,
            now,
            roundId: null,
          })
          summary.recorded += 1
          if (result.changed) summary.changed += 1
        }
      }
    }
  }

  return summary
}
