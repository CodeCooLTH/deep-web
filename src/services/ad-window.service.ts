import { prisma } from '@/lib/prisma'
import { getWindowState } from '@/lib/messaging-window'

/**
 * จุดตั้งต้นกรอบ 7 วันของโฆษณา Click-to-Messenger/Direct (ดู AD_WINDOW_MS ใน lib/messaging-window.ts)
 * = ข้อความ "ของลูกค้า" แรกที่ตามหลัง referral source=ADS
 *
 * ทำไมต้องมีข้อความตามมา: referral ที่ติดมากับ echo ของเพจไม่ใช่การที่ลูกค้าเริ่มคุย → ไม่นับ
 * ทำไมดูแค่ 8 วัน: เกินนั้นกรอบปิดแน่ ไม่ต้องสแกนทั้งประวัติ
 */
const LOOKBACK_MS = 8 * 24 * 60 * 60 * 1000
const MSG_BEFORE_MS = 2 * 60 * 1000
const MSG_AFTER_MS = 24 * 60 * 60 * 1000

type Channel = string

/** batch: คืน Map<conversationId, anchor> เฉพาะห้องที่มี anchor · ห้อง non-Meta ถูกข้ามโดยไม่ query */
export async function getAdWindowStartAtMany(
  rooms: { id: string; channel: Channel }[],
  now: Date = new Date(),
): Promise<Map<string, Date>> {
  const out = new Map<string, Date>()
  const ids = rooms.filter((r) => r.channel === 'MESSENGER' || r.channel === 'INSTAGRAM').map((r) => r.id)
  if (ids.length === 0) return out

  const refs = await prisma.conversationAdReferral.findMany({
    where: {
      conversationId: { in: ids },
      source: 'ADS',
      receivedAt: { gte: new Date(now.getTime() - LOOKBACK_MS) },
    },
    select: { conversationId: true, receivedAt: true },
    orderBy: { receivedAt: 'desc' },
  })
  if (refs.length === 0) return out

  const minAt = Math.min(...refs.map((r) => r.receivedAt.getTime())) - MSG_BEFORE_MS
  const maxAt = Math.max(...refs.map((r) => r.receivedAt.getTime())) + MSG_AFTER_MS
  const msgs = await prisma.chatMessage.findMany({
    where: {
      conversationId: { in: [...new Set(refs.map((r) => r.conversationId))] },
      senderRole: 'BUYER',
      isDeleted: false,
      createdAt: { gte: new Date(minAt), lte: new Date(maxAt) },
    },
    select: { conversationId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const byRoom = new Map<string, Date[]>()
  for (const m of msgs) byRoom.set(m.conversationId, [...(byRoom.get(m.conversationId) ?? []), m.createdAt])

  // refs เรียงใหม่→เก่า: referral ล่าสุดที่มีข้อความลูกค้าตามมาชนะ (ตัวที่ไม่มีข้อความข้าม)
  for (const r of refs) {
    if (out.has(r.conversationId)) continue
    const from = r.receivedAt.getTime() - MSG_BEFORE_MS
    const to = r.receivedAt.getTime() + MSG_AFTER_MS
    const hit = byRoom.get(r.conversationId)?.find((d) => d.getTime() >= from && d.getTime() <= to)
    if (hit) out.set(r.conversationId, hit)
  }
  return out
}

export async function getAdWindowStartAt(
  conversationId: string,
  channel: Channel,
  now: Date = new Date(),
): Promise<Date | null> {
  return (await getAdWindowStartAtMany([{ id: conversationId, channel }], now)).get(conversationId) ?? null
}

/**
 * getWindowState + กรอบโฆษณา — query anchor เฉพาะตอนกรอบ 24 ชม. ปิดแล้ว (ทางที่กรอบเปิดปกติไม่เพิ่ม query)
 * ทุกจุดที่ตัดสิน "ส่งได้ไหม" ของ Meta ต้องเรียกตัวนี้ ไม่ใช่ getWindowState ตรง ๆ
 */
export async function getWindowStateWithAd(
  conv: { id: string; channel: Channel; lastInboundAt: Date | null },
  now: Date = new Date(),
) {
  const std = getWindowState(conv.lastInboundAt, now)
  if (std.open) return std
  return getWindowState(conv.lastInboundAt, now, await getAdWindowStartAt(conv.id, conv.channel, now))
}
