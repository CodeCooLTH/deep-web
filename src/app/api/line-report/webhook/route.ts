import { NextRequest, NextResponse, after } from 'next/server'
import { validateSignature } from '@/lib/line/signature'
import { getReportBotConfig } from '@/lib/line-report/config'
import { handleEvents } from '@/services/line-report-command.service'

// Webhook ของบอทรายงานกลุ่ม LINE (00068 · SRS TFR-05) — OA กลางตัวเดียวของ Deep (env LINE_REPORT_BOT_*)
// ไม่ใช่ /api/channels/line/webhook (OA ของแต่ละร้าน) และห้ามแก้ route นั้น
//
// ลายเซ็น x-line-signature คือ authentication อย่างเดียวของ route นี้ (proxy.ts ยกเว้น CSRF ให้ path นี้ + bucket rate-limit แยก)
// ลำดับตายตัว: raw text → secret ว่าง 200+warn → ลายเซ็นผิด 401 (ไม่แตะ DB) → parse (ผิด 200) → after() → 200
// หลังลายเซ็นผ่านตอบ 200 เสมอ แม้ภายในล้ม (AC-05-8) — LINE จะได้ไม่ยิงซ้ำรัว

export const dynamic = 'force-dynamic'
// batch หลาย event + สรุปยอดหลายร้านใน after() เดียว — ไม่ประกาศจะถูกตัดตาม default แล้วงานหายกลางคัน
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const receivedAtMs = Date.now()
  const raw = await request.text() // ลายเซ็นคำนวณจาก byte ดิบ — ห้าม parse แล้ว stringify ใหม่

  const cfg = getReportBotConfig()
  if (!cfg) {
    console.warn('[line-report-webhook] ยังไม่ตั้ง LINE_REPORT_BOT_CHANNEL_SECRET/ACCESS_TOKEN — ข้าม')
    return NextResponse.json({ ok: true })
  }
  if (!validateSignature(raw, cfg.channelSecret, request.headers.get('x-line-signature'))) {
    console.warn('[line-report-webhook] ลายเซ็นไม่ผ่าน')
    return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 401 })
  }

  try {
    const body = JSON.parse(raw || '{}') as { events?: unknown }
    // L-4: LINE ส่งไม่เกิน 100 ต่อครั้ง — เกินนั้นคือขยะ ไม่ประมวลผล
    const events = Array.isArray(body.events) ? body.events.slice(0, 100) : []
    if (events.length > 0) {
      after(() =>
        handleEvents(events, receivedAtMs).catch((e) =>
          console.error('[line-report-webhook] handleEvents ล้ม', e instanceof Error ? e.name : 'unknown'),
        ),
      )
    }
  } catch (e) {
    // body ไม่ใช่ JSON / after() ล้ม — ลายเซ็นผ่านแล้ว ตอบ 200 ต่อ
    console.warn('[line-report-webhook] อ่าน body ไม่ได้', e instanceof Error ? e.name : 'unknown') // ไม่ใส่ message: SyntaxError ของ JSON.parse ยกเนื้อ body มาด้วย
  }
  return NextResponse.json({ ok: true })
}
