import { NextResponse } from 'next/server'
import { sweepLineTokenHealth } from '@/services/line-token-health.service'

/**
 * GET /api/cron/line-token-health — Vercel Cron รายวัน (ส่วนขยาย 00025 2026-08-12, FR-CH-02)
 *
 * ทำไมต้องเป็น cron ตัวใหม่ ไม่แขวนกับ `auto-reply-sweeper` ที่มีอยู่:
 * งานคนละอายุขัยกัน — วันหนึ่งมีใครแก้ sweeper แล้วเผลอพาการตรวจ token ล้มไปด้วย จะไม่มีอะไรฟ้อง
 * และอาการคือ "ไม่มีใครได้รับคำเตือนล่วงหน้าอีกเลย" ซึ่งเงียบสนิทจนกว่าจะมีร้าน token ตายจริง
 *
 * ตี 2 ไทย (19:00 UTC) — นอกช่วงที่ร้านทำงาน แต่ยังเป็นเวลาที่ถ้า push ออกไปแล้วร้านจะเห็น
 * ตอนเปิดเครื่องเช้า ไม่ใช่ตอนกลางดึกที่ปลุกคน
 *
 * หมายเหตุ: ใช้สล็อตเดียวกับ `inventory-renewal` (ทั้งคู่ 19:00 UTC) — รันพร้อมกันได้เพราะเป็นคนละ
 * function และงานนี้ยิง LINE ไม่กี่คำขอต่อร้าน ไม่แย่งทรัพยากรกัน
 */
export const maxDuration = 60

export async function GET(request: Request) {
  // SECURITY: env ว่าง = reject ทันที ห้ามปล่อยให้เทียบกับ "Bearer undefined" แล้วผ่าน
  // (แพตเทิร์นเดียวกับ cron ตัวอื่นของโปรเจกต์ — ห้ามคิดใหม่)
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await sweepLineTokenHealth())
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[line-token-health] กวาดล้มเหลวทั้งรอบ', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
