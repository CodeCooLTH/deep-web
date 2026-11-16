// 00095 S-3 — หยุด run + เขียนบรรทัดระบบ FOLLOW_BOT_NOTE ในทรานแซกชันเดียว (TFR-FB-17 · SDS flow 4.2)
//
// 🛑 ไฟล์นี้ import แค่ prisma + ค่าคงที่ — **ห้าม import ตัวส่ง** (chat.service / chat-outbox / channel-chat)
// บรรทัดระบบเป็นข้อความภายใน ลูกค้าไม่เห็น ต้องไม่ถูกยิงออกช่องทางนอกและไม่กระตุ้นอะไร (แบบ auto-order-internal-message.service)
// ผลได้จากการไม่มีสายให้ตัด ไม่ใช่จาก if กันไว้ · insert ตรงและ **ไม่แตะ** Conversation.lastMessageAt/preview/lastSenderRole
import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { FOLLOW_BOT_NOTE_TYPE } from '@/lib/auto-order-message-type'
import type { StopReason } from '@/lib/sales-follow-bot/constants'

type Tx = Prisma.TransactionClient

/** เหตุผลในประโยค "บอท “…” หยุดทักแล้ว เพราะ…" (UX §18) — Record บังคับให้เพิ่มรหัสแล้วต้องมีคำ */
export const STOP_NOTE_REASON_TEXT: Record<StopReason, string> = {
  STAGE_CHANGED: 'สถานะการขายเปลี่ยน',
  TAG_REMOVED: 'แท็กของลูกค้าไม่ตรงเงื่อนไขแล้ว',
  BOT_DISABLED: 'บอทถูกปิด',
  BOT_EDITED: 'บอทถูกแก้ไขขั้นตอน',
  BOT_DELETED: 'บอทถูกลบ',
  CUSTOMER_REPLIED: 'ลูกค้าตอบกลับ',
  WINDOW_CLOSED: 'เลยกรอบเวลาที่ส่งข้อความได้',
  NOT_INTERESTED: 'ลูกค้าไม่สนใจ',
  OUT_OF_SCOPE: 'แชทนี้หลุดขอบเขตของบอท',
  CONTACT_BLOCKED: 'ลูกค้าบล็อกหรือเลิกติดตามแล้ว',
  ADMIN_STOPPED: 'ร้านสั่งหยุด',
}

export const buildStopNoteBody = (botName: string, reason: StopReason): string =>
  `บอท “${botName}” หยุดทักแล้ว เพราะ${STOP_NOTE_REASON_TEXT[reason]}`

export interface StopRunsFilter {
  shopId: string
  /** ต้องระบุอย่างน้อยหนึ่งอย่าง — กันหยุดทั้งร้านโดยไม่ตั้งใจ */
  botId?: string
  conversationId?: string
  runId?: string
}

export interface StoppedRun {
  runId: string
  conversationId: string
  botId: string
}

/**
 * หยุด run ที่ ACTIVE ตามตัวกรอง + เขียนบรรทัดระบบ **หนึ่งบรรทัดต่อ run ที่เราหยุดเอง** ใน tx เดียว
 * `UPDATE … WHERE status='ACTIVE' RETURNING` = ผู้ชนะเท่านั้นได้แถวกลับ → สองคนหยุดพร้อมกันได้บรรทัดเดียว (TC-140)
 * ไม่ได้แถว (มีคนหยุดก่อน/ไม่มี run) = ไม่เขียนอะไร
 * ผู้เรียกต้องห่อใน $transaction เองถ้าต้องการให้ผูกกับงานอื่น (แก้บอท/ลบบอท) — ส่ง tx เข้ามา
 */
export async function stopRunsWithNote(
  tx: Tx,
  f: StopRunsFilter,
  reason: StopReason,
  o: { stoppedByUserId?: string | null; now?: Date; botName?: string } = {},
): Promise<StoppedRun[]> {
  if (!f.botId && !f.conversationId && !f.runId) throw new Error('stopRunsWithNote: ต้องระบุ botId/conversationId/runId')
  const now = o.now ?? new Date()
  const cond: Prisma.Sql[] = [Prisma.sql`"shopId" = ${f.shopId}`, Prisma.sql`"status" = 'ACTIVE'`]
  if (f.botId) cond.push(Prisma.sql`"botId" = ${f.botId}`)
  if (f.conversationId) cond.push(Prisma.sql`"conversationId" = ${f.conversationId}`)
  if (f.runId) cond.push(Prisma.sql`"id" = ${f.runId}`)
  const stopped = await tx.$queryRaw<StoppedRun[]>`
    UPDATE "SalesFollowRun"
    SET "status" = 'STOPPED', "stopReason" = ${reason}, "finishedAt" = ${now.toISOString()}::timestamptz,
        "stoppedByUserId" = ${o.stoppedByUserId ?? null}, "holdReason" = NULL, "nextDueAt" = NULL,
        "updatedAt" = ${now.toISOString()}::timestamptz
    WHERE ${Prisma.join(cond, ' AND ')}
    RETURNING "id" AS "runId", "conversationId", "botId"`
  if (stopped.length === 0) return []

  // ชื่อบอท = snapshot ณ ตอนหยุด (TC-180) — บอทที่เพิ่งแก้ชื่อใน tx เดียวกันจึงใช้ชื่อใหม่ถ้าผู้เรียกส่งมา
  const names = new Map<string, string>()
  if (o.botName !== undefined) for (const s of stopped) names.set(s.botId, o.botName)
  else {
    const bots = await tx.salesFollowBot.findMany({
      where: { shopId: f.shopId, id: { in: [...new Set(stopped.map((s) => s.botId))] } },
      select: { id: true, name: true },
    })
    for (const b of bots) names.set(b.id, b.name)
  }
  await tx.chatMessage.createMany({
    data: stopped.map((s) => ({
      conversationId: s.conversationId,
      senderRole: 'SHOP',
      senderUserId: null,
      autoReplyKind: null,
      type: FOLLOW_BOT_NOTE_TYPE,
      body: buildStopNoteBody(names.get(s.botId) ?? 'บอทติดตาม', reason),
    })),
  })
  return stopped
}

/** หยุดแบบมี tx ของตัวเอง (engine/แผงห้อง) */
export async function stopRunWithNote(
  f: StopRunsFilter,
  reason: StopReason,
  o: { stoppedByUserId?: string | null; now?: Date } = {},
): Promise<StoppedRun[]> {
  return prisma.$transaction((tx) => stopRunsWithNote(tx, f, reason, o))
}
