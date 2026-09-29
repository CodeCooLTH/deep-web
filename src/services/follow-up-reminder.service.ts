// 00066 TFR-011 — cron เตือนรายการติดตามลูกค้า (BR-ACT-13)
// 🛑 ไม่ import ตัวส่งข้อความขาออก (AC-ACT-42) · ไม่เรียก shopAudience → ไม่หัก chatEnabled (มติ Q2)
import { prisma } from '@/lib/prisma'
import { isReminderDue, groupReminders, buildReminderPush } from '@/lib/follow-up-rules'
import { reminderFireAt } from '@/lib/follow-up-time'
import { pushToUsersWithStatus } from '@/services/app-push.service'
import { getConversationToastPreview } from '@/services/chat.service'

const SCAN_MAX = 500
const PRE_WINDOW_MS = 36 * 3600_000

export interface ReminderRunResult {
  scanned: number
  due: number
  reserved: number
  sent: number
  noToken: number
  failed: number
  droppedNonMember: number
}

export async function runFollowUpReminders(now: Date = new Date()): Promise<ReminderRunResult> {
  const r: ReminderRunResult = { scanned: 0, due: 0, reserved: 0, sent: 0, noToken: 0, failed: 0, droppedNonMember: 0 }

  // superset: allDay ที่ fireAt = dueAt+9h ต้องอยู่ในหน้าต่าง 36 ชม. — ตัดสินจริงด้วย isReminderDue
  const rows = await prisma.customerFollowUp.findMany({
    where: {
      status: 'OPEN',
      assigneeUserId: { not: null },
      shop: { deletedAt: null, purgedAt: null },
      dueAt: { gt: new Date(now.getTime() - PRE_WINDOW_MS), lte: now },
    },
    orderBy: { dueAt: 'asc' },
    take: SCAN_MAX,
    select: {
      id: true, shopId: true, conversationId: true, title: true, dueAt: true, allDay: true,
      assigneeUserId: true, remindedFor: true, remindedAt: true, status: true,
    },
  })
  r.scanned = rows.length
  const due = rows.filter((x) => isReminderDue(x, now))
  r.due = due.length

  // จองก่อนส่ง: count===1 เท่านั้นถึงส่ง (กัน 2 instance/ผู้ใช้เลื่อนระหว่างทาง)
  const reserved: typeof due = []
  for (const row of due) {
    const fire = reminderFireAt(row)
    const res = await prisma.customerFollowUp.updateMany({
      where: {
        id: row.id,
        shopId: row.shopId,
        status: 'OPEN',
        dueAt: row.dueAt,
        allDay: row.allDay,
        OR: [{ remindedFor: null }, { remindedFor: { not: fire } }],
      },
      data: { remindedFor: fire, remindedAt: now },
    })
    if (res.count === 1) reserved.push(row)
  }
  r.reserved = reserved.length
  if (reserved.length === 0) return r

  // สมาชิกปัจจุบัน ณ ตอนส่ง = เจ้าของร้าน ∪ ShopMember
  const shopIds = [...new Set(reserved.map((x) => x.shopId))]
  const [shops, members] = await Promise.all([
    prisma.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, userId: true } }),
    prisma.shopMember.findMany({ where: { shopId: { in: shopIds } }, select: { shopId: true, userId: true } }),
  ])
  const ok = new Set([
    ...shops.map((s) => `${s.id}\u0000${s.userId}`),
    ...members.map((m) => `${m.shopId}\u0000${m.userId}`),
  ])
  const eligible = reserved.filter((x) => ok.has(`${x.shopId}\u0000${x.assigneeUserId}`))
  r.droppedNonMember = reserved.length - eligible.length

  for (const g of groupReminders(eligible)) {
    try {
      let customerName: string | null = null
      if (g.items.length === 1) {
        const p = await getConversationToastPreview(g.items[0].conversationId, g.shopId).catch(() => null)
        customerName = p?.senderName ?? null
      }
      // ส่งเฉพาะ field ใน allow-list — note/เบอร์ไม่เคยเข้ามาใน ReminderItem (AC-ACT-38)
      const push = buildReminderPush(
        g.items.map((i) => ({
          id: i.id, shopId: i.shopId, assigneeUserId: i.assigneeUserId,
          conversationId: i.conversationId, title: i.title, customerName,
        })),
      )
      const status = await pushToUsersWithStatus(
        [g.assigneeUserId], push.title, push.body, push.data, { subtitle: push.subtitle },
      )
      if (status === 'SENT') r.sent++
      else if (status === 'NO_TOKEN') r.noToken++ // คงจอง: ไม่มีอุปกรณ์ให้ส่ง ไม่วนซ้ำ
      else {
        r.failed++
        // ปล่อยจองให้รอบหน้าลองใหม่ในหน้าต่าง (AC-ACT-41) — เงื่อนไข remindedFor=fire กันทับค่าที่ผู้ใช้เลื่อนไป
        for (const i of g.items) {
          await prisma.customerFollowUp.updateMany({
            where: { id: i.id, shopId: i.shopId, remindedFor: reminderFireAt(i) },
            data: { remindedFor: i.remindedFor, remindedAt: i.remindedAt },
          })
        }
      }
    } catch (e) {
      r.failed++
      console.error('[follow-up-reminder] group failed', e)
    }
  }
  return r
}
