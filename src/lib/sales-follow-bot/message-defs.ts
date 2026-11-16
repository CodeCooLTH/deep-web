// 00095 TFR-FB-03 — นิยามข้อความของบอท (HR16: นิยามเดียว ใช้ทุกจุด) ทั้งรูป Prisma where และ SQL
// สองรูปต้องมีเงื่อนไขเดียวกัน — เทส message-defs.test.ts เอา corpus เดียวกันผ่านทั้งสองรูป (parity)
// ทุก query ต้องมีขอบ createdAt >= now-30 วัน (AC-FB-47) → ฟังก์ชันที่นี่บังคับรับ now/since เสมอ
// 🛑 ห้ามใช้ Conversation.lastInboundAt ตัดสิน "ลูกค้าตอบ": reaction/คลิกโฆษณา/postback ขยับมันแต่ไม่ใช่ข้อความ
import type { Prisma } from '@prisma/client'
import { INTERNAL_MESSAGE_TYPES } from '../auto-order-message-type'
import { AUTO_FOLLOW_KIND } from '../auto-reply-constants'
import { MESSAGE_LOOKBACK_MS } from './constants'

export const messageLookbackSince = (now: Date): Date => new Date(now.getTime() - MESSAGE_LOOKBACK_MS)

/** LINE postback สร้าง ChatMessage ที่ externalMessageId = 'pb:<eventId>' — ไม่ใช่ลูกค้าตอบ (Q-15) */
const LINE_POSTBACK_PREFIX = 'pb:'

/** ข้อความจริงของลูกค้า (RealBuyerMsg) */
export function realBuyerMsgWhere(now: Date): Prisma.ChatMessageWhereInput {
  return {
    createdAt: { gte: messageLookbackSince(now) },
    senderRole: 'BUYER',
    isDeleted: false,
    type: { notIn: [...INTERNAL_MESSAGE_TYPES] },
    // NOT startsWith ทิ้ง NULL (SQL three-valued) — ต้องรับ null ตรง ๆ ไม่งั้น Messenger/IG ที่ไม่มี mid หายหมด
    OR: [{ externalMessageId: null }, { NOT: { externalMessageId: { startsWith: LINE_POSTBACK_PREFIX } } }],
  }
}

/** ร้านตอบที่นับ (CountedShopReply) — รวม echo/Meta AI/AUTO/AUTO_TEST/AUTO_NOTICE · ไม่รวมฟองบอทนี้และที่ส่งล้ม */
export function countedShopReplyWhere(now: Date): Prisma.ChatMessageWhereInput {
  return {
    createdAt: { gte: messageLookbackSince(now) },
    senderRole: 'SHOP',
    isDeleted: false,
    type: { notIn: [...INTERNAL_MESSAGE_TYPES] },
    // IS DISTINCT FROM ในรูป Prisma = null หรือไม่เท่า (not: x เฉย ๆ ทิ้ง NULL)
    AND: [
      { OR: [{ autoReplyKind: null }, { autoReplyKind: { not: AUTO_FOLLOW_KIND } }] },
      { OR: [{ deliveryStatus: null }, { deliveryStatus: { not: 'FAILED' } }] },
    ],
  }
}

const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`

/**
 * ฉบับ SQL — `m` = alias ตาราง ChatMessage · `sinceExpr` = นิพจน์ SQL ของขอบเวลา (บังคับ — ห้ามลืมขอบ 30 วัน)
 * ใช้ค่าคงที่ literal ในโค้ดเท่านั้น ไม่ใช่ input ผู้ใช้
 */
export function realBuyerMsgSql(m: string, sinceExpr: string): string {
  return (
    `(${m}."createdAt" >= ${sinceExpr} AND ${m}."senderRole" = 'BUYER' AND ${m}."isDeleted" = false` +
    ` AND ${m}."type" NOT IN (${INTERNAL_MESSAGE_TYPES.map(lit).join(', ')})` +
    ` AND (${m}."externalMessageId" IS NULL OR ${m}."externalMessageId" NOT LIKE ${lit(LINE_POSTBACK_PREFIX + '%')}))`
  )
}

export function countedShopReplySql(m: string, sinceExpr: string): string {
  return (
    `(${m}."createdAt" >= ${sinceExpr} AND ${m}."senderRole" = 'SHOP' AND ${m}."isDeleted" = false` +
    ` AND ${m}."type" NOT IN (${INTERNAL_MESSAGE_TYPES.map(lit).join(', ')})` +
    ` AND ${m}."autoReplyKind" IS DISTINCT FROM ${lit(AUTO_FOLLOW_KIND)}` +
    ` AND ${m}."deliveryStatus" IS DISTINCT FROM 'FAILED')`
  )
}

/** ตำแหน่งข้อความในห้อง — (createdAt, seq) เรียงลำดับ ตัดสินที่ seq เมื่อเวลาเท่ากัน */
export interface MsgPos {
  createdAt: Date
  seq: number
}

export function compareMsgPos(a: MsgPos, b: MsgPos): number {
  return a.createdAt.getTime() - b.createdAt.getTime() || a.seq - b.seq
}

/** ร้านค้างตอบ: ข้อความจริงล่าสุดของห้อง (RealBuyerMsg ∪ CountedShopReply) เป็นของลูกค้า */
export function isAwaitingShop(latestBuyer: MsgPos | null, latestShopReply: MsgPos | null): boolean {
  if (!latestBuyer) return false
  return !latestShopReply || compareMsgPos(latestBuyer, latestShopReply) > 0
}

/** ลูกค้าตอบหลังฟองบอทล่าสุดที่ SENT · ก่อนส่งขั้นแรก (ไม่มีฟอง) = ไม่ใช่เหตุหยุด (BR-FB-42) */
export function customerRepliedAfterBot(latestBuyer: MsgPos | null, lastBotBubble: MsgPos | null): boolean {
  return !!latestBuyer && !!lastBotBubble && compareMsgPos(latestBuyer, lastBotBubble) > 0
}
