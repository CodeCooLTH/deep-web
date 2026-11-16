import { NextResponse } from 'next/server'
import { runSalesFollowTick } from '@/services/sales-follow-engine.service'

// งบ tick 40 วิ + sweep 5 วิ (TICK_BUDGET_MS) ต้องอยู่ใต้เพดานนี้
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/sales-follow-bot — Vercel Cron ทุก 1 นาที (00095 TFR-FB-09 · TD-FB-001)
 * แยกจาก cron chat-outbox โดยตั้งใจ: outbox คือตัวการันตีของทั้งฟีเจอร์แชท ไม่ควรแบ่งงบ 60 วิกับงานที่หนักกว่า
 */
export async function GET(request: Request) {
  // SECURITY: env ว่าง = reject ทันที ห้ามปล่อยให้เทียบกับ "Bearer undefined" แล้วผ่าน
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  // runSalesFollowTick ไม่ throw ออกมา และ log สรุปเองทุกรอบ
  return NextResponse.json(await runSalesFollowTick(new Date()))
}
