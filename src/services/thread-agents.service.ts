import { prisma } from '@/lib/prisma'
// 🛑 นิยาม "คำตอบของคนจริง" มีอยู่แล้วตั้งแต่ 00059 — ห้ามพิมพ์เงื่อนไขเอง (HR16)
import { HUMAN_AGENT_REPLY_WHERE } from '@/lib/agent-performance'

/**
 * แอดมินที่ "เข้าไปตอบในแชทห้องนี้จริง" — กองรูปมุมขวาล่างของรายการแชท (user สั่ง 2026-09-10)
 *
 * 🛑 ใครนับ / ใครไม่นับ (ข้อมูลจริงบน prod 30 วัน: มีคนกำกับ 7,600 ใบ · ไม่มี 41,897 ใบ)
 *   ✅ แอดมินกดตอบใน Deep                     → `senderUserId` มีค่า
 *   ❌ ตอบจาก Business Suite / แอป Messenger  → echo กลับมาโดยไม่มีตัวตนคนส่ง (`senderUserId = null`)
 *   ❌ บอท / AI / ตอบอัตโนมัติ                → ทุกตัวส่ง `actorUserId: null` เข้ามาตั้งแต่ต้นทาง
 *   ❌ ข้อความที่ถูกลบ                          → `isDeleted`
 * ตรงกับที่ user สั่งพอดี: "ถ้ารายการไหนไม่มี admin ตอบเลย (เค้าตอบจากฝั่ง platform มา) ก็ไม่ต้องขึ้น"
 *
 * ไม่มี migration — ใช้ `@@index([conversationId, senderRole, createdAt])` ที่มีอยู่แล้ว
 */
export type ThreadAgent = {
  userId: string
  name: string
  avatar: string | null
}

/**
 * เพดานรูปที่วาดจริงในแถว — เกินกว่านี้ยุบเป็น `+N`
 *
 * ตัวเลขนี้มาจากข้อมูลจริงบน prod ไม่ใช่ค่าที่ตั้งลอย ๆ: 1 คน 2,530 ห้อง · 2 คน 65 ห้อง ·
 * 3 คน 1 ห้อง (ไม่เคยเกิน 3) ⇒ 3 ครอบทุกเคสที่เคยเกิดขึ้นจริง โดยที่ rail 320px ยังไม่แตก
 */
export const THREAD_AGENT_STACK_MAX = 3

type WithId = { id: string }

/**
 * เติม `threadAgents` ให้ทุกแถวในหน้าเดียว — 2 query ไม่ว่าจะกี่แถว (ไม่ใช่ N+1)
 *
 * 🛑 ต้องเรียก **ทั้งใน route และใน `inbox/page.tsx`** เหมือน enrich ตัวอื่นทุกตัว — ทำทางเดียว
 * กองรูปจะไม่ขึ้นตอนโหลดหน้าแรกแล้วค่อยโผล่หลัง refetch ซึ่งผู้ใช้อ่านว่าเป็นบั๊ก
 * (บทเรียนเดียวกับ `enrichWithOrderStage` / `enrichWithAutoReplyBadge`)
 *
 * เรียงคนที่ **ตอบล่าสุดไว้หน้าสุด** — กองรูปซ้อนกันเห็นใบหน้าสุดชัดที่สุด ใบนั้นจึงควรเป็นคนที่
 * เกี่ยวข้องกับสถานะปัจจุบันของห้องมากที่สุด ไม่ใช่คนที่บังเอิญตอบเป็นคนแรกเมื่อเดือนก่อน
 */
export async function enrichWithThreadAgents<T extends WithId>(
  items: T[],
): Promise<(T & { threadAgents: ThreadAgent[] })[]> {
  if (items.length === 0) return []

  const ids = items.map((i) => i.id)
  const rows = await prisma.chatMessage.groupBy({
    by: ['conversationId', 'senderUserId'],
    where: { conversationId: { in: ids }, ...HUMAN_AGENT_REPLY_WHERE },
    _max: { createdAt: true },
  })
  if (rows.length === 0) return items.map((i) => ({ ...i, threadAgents: [] }))

  const userIds = [...new Set(rows.map((r) => r.senderUserId).filter((x): x is string => x !== null))]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, displayName: true, avatar: true },
  })
  const userById = new Map(users.map((u) => [u.id, u]))

  const byConversation = new Map<string, { userId: string; lastAt: number }[]>()
  for (const r of rows) {
    if (!r.senderUserId) continue
    // แอดมินที่ถูกลบบัญชีไปแล้วหา User ไม่เจอ — ข้ามไป ไม่วาดรูปเปล่า ๆ ที่ hover แล้วไม่มีชื่อ
    if (!userById.has(r.senderUserId)) continue
    const list = byConversation.get(r.conversationId) ?? []
    list.push({ userId: r.senderUserId, lastAt: r._max.createdAt?.getTime() ?? 0 })
    byConversation.set(r.conversationId, list)
  }

  return items.map((i) => {
    const list = (byConversation.get(i.id) ?? []).sort((a, b) => b.lastAt - a.lastAt)
    return {
      ...i,
      threadAgents: list.map((a) => {
        const u = userById.get(a.userId)!
        return { userId: a.userId, name: u.displayName, avatar: u.avatar }
      }),
    }
  })
}
