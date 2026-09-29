import { NextResponse } from 'next/server'

import { runFollowUpReminders } from '@/services/follow-up-reminder.service'

export const maxDuration = 60

/** GET /api/cron/follow-up-reminders — เตือนรายการติดตามลูกค้าที่ถึงกำหนด (00066 TFR-011) */
export async function GET(request: Request) {
  // SECURITY: env ว่าง = reject ทันที ห้ามเทียบกับ "Bearer undefined"
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await runFollowUpReminders()) })
  } catch (e) {
    console.error('[follow-up-reminders] ล้มเหลว', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
