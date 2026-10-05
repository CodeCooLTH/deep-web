import { NextResponse } from 'next/server'
import { runSweep } from '@/services/line-report-sweep.service'

/**
 * GET /api/cron/line-report-sweep — Vercel Cron ทุก 30 นาที (feature 00070, SRS TFR-17)
 *
 * ส่งรายงานสรุปยอดเข้ากลุ่ม LINE ตามเวลาที่เจ้าของตั้ง · cleanup รวมอยู่ใน tick แรกหลัง 03:00 ไทย (ไม่เพิ่ม cron)
 * maxDuration 300 (default ของ Vercel) — service หยุดเริ่มกลุ่มใหม่เมื่อครบ 240s เหลือ 60s กันงานค้างกลางทาง
 */
export const maxDuration = 300

export async function GET(request: Request) {
  // SECURITY: env ว่าง = reject ทันที ห้ามปล่อยให้เทียบกับ "Bearer undefined" แล้วผ่าน
  // (แพตเทิร์นเดียวกับ line-token-health — ห้ามคิดใหม่)
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await runSweep())
  } catch (e) {
    // 500 เฉพาะล้มทั้งรอบ — ความล้มของกลุ่มเดียวถูกจับใน service แล้ว
    // ตอบข้อความคงที่: message ของ DB/Prisma อาจมี SQL/ข้อมูลปน (แม้ปลายทางคือ Vercel cron) · รายละเอียดอยู่ใน log เฉพาะชื่อ error
    console.error('[line-report-sweep] กวาดล้มเหลวทั้งรอบ', e instanceof Error ? e.name : 'NonError')
    return NextResponse.json({ error: 'sweep_failed' }, { status: 500 })
  }
}
