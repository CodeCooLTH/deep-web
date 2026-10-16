/**
 * chat-desk-metrics-parity.db.test.ts — ตัวเลขรายวันของโต๊ะแชทต้องเท่ารายงานผลงานแอดมินทุกวินาที (AC-CD-12, M-3)
 * 🛑 HR13/HR14: เฉพาะ localhost:5434 · สร้างข้อมูลเองในช่วงเวลาที่ล็อกไว้ · ลบด้วย id ที่สร้าง
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))

import { getAgentPerformanceOverview, getShopResponseSummary } from '@/services/agent-performance.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)

const T0 = Date.parse('2026-03-10T03:00:00.000Z')
const FILTERS = { from: new Date('2026-03-09T17:00:00.000Z'), to: new Date('2026-03-10T17:00:00.000Z') }
const ids = { users: [] as string[], shop: '', convs: [] as string[] }

describe.skipIf(!isLocal)('chat-desk — getShopResponseSummary = overview ของรายงานเดิม (DB จริง)', () => {
  beforeAll(async () => {
    const mk = async (n: string) => {
      const u = await prisma.user.create({ data: { displayName: `par-${n}-${run}`, username: `par_${n}_${run}` }, select: { id: true } })
      ids.users.push(u.id)
      return u.id
    }
    const [owner, a1, a2] = [await mk('o'), await mk('a1'), await mk('a2')]
    const shop = await prisma.shop.create({ data: { userId: owner, shopName: `par-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })
    ids.shop = shop.id

    type M = { off: number; role: 'BUYER' | 'SHOP'; by?: string | null; auto?: string | null; del?: boolean }
    const conv = async (startOff: number, msgs: M[]) => {
      const c = await prisma.conversation.create({
        data: { shopId: shop.id, channel: 'DEEP', createdAt: new Date(T0 + startOff * 1000), lastMessageAt: new Date(T0 + startOff * 1000) },
        select: { id: true },
      })
      ids.convs.push(c.id)
      for (const m of msgs) {
        await prisma.chatMessage.create({
          data: {
            conversationId: c.id, senderRole: m.role, senderUserId: m.by ?? null, autoReplyKind: m.auto ?? null,
            isDeleted: m.del ?? false, createdAt: new Date(T0 + (startOff + m.off) * 1000),
          },
        })
      }
    }
    // ชุดหลากแบบเดียวกับ agent-performance-sql-parity: ตอบ 2 รอบ · พิมพ์รัว · บอทก่อนคน · ตอบนอกระบบ · ไม่มีใครตอบ
    await conv(0, [{ off: 0, role: 'BUYER' }, { off: 30, role: 'SHOP', by: a1 }, { off: 600, role: 'BUYER' }, { off: 660, role: 'SHOP', by: a1 }])
    await conv(100, [{ off: 0, role: 'BUYER' }, { off: 10, role: 'BUYER' }, { off: 100, role: 'SHOP', by: a2 }])
    await conv(200, [{ off: 0, role: 'BUYER' }, { off: 2, role: 'SHOP', auto: 'AUTO' }, { off: 20, role: 'SHOP' }, { off: 300, role: 'SHOP', by: a1 }])
    await conv(300, [{ off: 0, role: 'BUYER' }, { off: 25, role: 'SHOP' }, { off: 40, role: 'SHOP' }]) // ตอบนอกระบบล้วน
    await conv(400, [{ off: 0, role: 'BUYER' }, { off: 90, role: 'BUYER' }]) // ไม่มีใครตอบ
  })

  afterAll(async () => {
    await prisma.conversation.deleteMany({ where: { id: { in: ids.convs } } })
    await prisma.shop.deleteMany({ where: { id: ids.shop } })
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  it('5 ฟิลด์เท่ากับ getAgentPerformanceOverview(...).overview และไม่ใช่ค่าว่างทั้งคู่', async () => {
    const summary = await getShopResponseSummary(ids.shop, FILTERS)
    const { overview } = await getAgentPerformanceOverview(ids.shop, FILTERS)
    expect(summary).toEqual({
      firstResponseAvgSec: overview.firstResponseAvgSec,
      responseAvgSec: overview.responseAvgSec,
      responseSampleCount: overview.responseSampleCount,
      unattributedReplyCount: overview.unattributedReplyCount,
      answeredOutsideSystemConversations: overview.answeredOutsideSystemConversations,
    })
    // กัน "เท่ากันเพราะว่างทั้งคู่" — ชุดข้อมูลนี้ต้องมีของจริงครบทุกฟิลด์
    expect(summary.responseSampleCount).toBeGreaterThan(0)
    expect(summary.firstResponseAvgSec).not.toBeNull()
    expect(summary.responseAvgSec).not.toBeNull()
    expect(summary.unattributedReplyCount).toBeGreaterThan(0)
    expect(summary.answeredOutsideSystemConversations).toBeGreaterThan(0)
  })
})
