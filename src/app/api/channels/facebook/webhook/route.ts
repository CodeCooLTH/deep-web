import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { verifyWebhookSignature } from '@/lib/facebook/signature'
import { WebhookBodySchema, extractMessagingEvents } from '@/lib/facebook/webhook-types'
import { ingestInboundMessage } from '@/services/channel-chat.service'

// Webhook ของ Messenger + Instagram (feature 00018)
//
// route นี้ถูกยกเว้นจาก CSRF Origin-check ใน proxy.ts เพราะ Meta ไม่ส่ง header Origin
// → ลายเซ็น X-Hub-Signature-256 คือ authentication เพียงอย่างเดียวของ route นี้
//
// กติกาการตอบ: ตอบ 200 ให้เร็วและเกือบทุกกรณี ยกเว้นลายเซ็นไม่ผ่าน
// Meta จะ retry ซ้ำเรื่อย ๆ ถ้าได้ non-200 ซึ่งทำให้ปัญหาบานปลายแทนที่จะหาย

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token && token === process.env.FB_WEBHOOK_VERIFY_TOKEN) {
    // ต้องคืน challenge เป็น text เปล่า ๆ ไม่ใช่ JSON
    return new NextResponse(challenge ?? '', { status: 200, headers: { 'content-type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  // ต้องอ่าน raw text ไม่ใช่ .json() — ลายเซ็นคำนวณจาก byte ดิบ
  // ถ้า parse เป็น object แล้ว stringify ใหม่ ลายเซ็นจะไม่ตรง
  const rawBody = await request.text()

  if (!verifyWebhookSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
    console.warn('[fb-webhook] signature ไม่ผ่าน')
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  const parsed = v.safeParse(WebhookBodySchema, JSON.parse(rawBody || '{}'))
  if (!parsed.success) {
    // shape ที่เราไม่รู้จัก — ตอบ 200 เพื่อไม่ให้ retry แต่ log ไว้ดู
    console.warn('[fb-webhook] payload parse ไม่ผ่าน', parsed.issues[0]?.message)
    return NextResponse.json({ ok: true })
  }

  const provider = parsed.output.object === 'instagram' ? 'INSTAGRAM' : 'MESSENGER'

  for (const { pageId, event } of extractMessagingEvents(parsed.output)) {
    try {
      await ingestInboundMessage({ provider, pageExternalId: pageId, event })
    } catch (e) {
      // ข้อความเดียวพังต้องไม่ทำให้ทั้ง batch ตกและถูก retry ทั้งก้อน
      console.error('[fb-webhook] ingest ล้มเหลว', e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({ ok: true })
}
