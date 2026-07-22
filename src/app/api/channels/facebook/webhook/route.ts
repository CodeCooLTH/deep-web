import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { Prisma } from '@prisma/client'
import { verifyWebhookSignature } from '@/lib/facebook/signature'
import { WebhookBodySchema, extractMessagingEvents } from '@/lib/facebook/webhook-types'
import { ingestInboundMessage } from '@/services/channel-chat.service'

// Webhook ของ Messenger + Instagram (feature 00018)
//
// route นี้ถูกยกเว้นจาก CSRF Origin-check ใน proxy.ts เพราะ Meta ไม่ส่ง header Origin
// → ลายเซ็น X-Hub-Signature-256 คือ authentication เพียงอย่างเดียวของ route นี้
//
// กติกาการตอบ: ตอบ 200 ให้เร็วและเกือบทุกกรณี ยกเว้นลายเซ็นไม่ผ่าน หรือ ingest พังจาก infra
// Meta จะ retry ซ้ำเรื่อย ๆ ถ้าได้ non-200 ซึ่งทำให้ปัญหาบานปลายแทนที่จะหาย — "เกือบทุกกรณี" เพราะ
// ยังมีข้อยกเว้น: infra error (DB ต่อไม่ติด/pool เต็ม/ปิดกลางคัน) ต้องตอบ non-200 ให้ Meta retry
// เพราะข้อความไม่ได้ถูกเขียนแน่ ๆ และ retry ปลอดภัยอยู่แล้ว (externalMessageId @unique dedupe ให้)
// — ตอบ 200 ทั้งที่ DB ล่มจะทำให้ข้อความหายถาวรโดยไม่จำเป็น (I-3) ส่วน logic/data error อื่น ๆ
// retry ไปก็พังซ้ำเหมือนเดิม ไม่มีประโยชน์ → คง 200 กัน Meta ยิงรัว ๆ ไม่จบ

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
      console.error('[fb-webhook] ingest ล้มเหลว', e instanceof Error ? e.message : e)
      // infra error (ต่อ DB ไม่ติด/pool เต็ม/ปิดกลางคัน) — ข้อความช่วงนี้ยังไม่ถูกเขียนแน่ ๆ ต้อง
      // ให้ Meta retry ทั้ง batch ไม่งั้นข้อความหายถาวรทั้งที่ retry ปลอดภัย (I-3) หยุด loop ทันที
      // เพราะ DB ล่มแล้ว event ที่เหลือใน batch ก็ไม่มีทางสำเร็จเช่นกัน
      if (isInfraError(e)) {
        return NextResponse.json({ error: 'temporarily unavailable' }, { status: 503 })
      }
      // logic/data error อื่น ๆ — ข้อความเดียวพังต้องไม่ทำให้ทั้ง batch ตกและถูก retry ทั้งก้อน
      // (retry ไปก็พังซ้ำเหมือนเดิม ไม่มีประโยชน์)
    }
  }

  return NextResponse.json({ ok: true })
}

// แยก error สอง "รส" ตอน ingest พัง (I-3): connection-level (infra) vs query/logic-level
// - PrismaClientInitializationError / PrismaClientRustPanicError / PrismaClientUnknownRequestError
//   = connect ไม่ได้ตั้งแต่แรก หรือ error ที่ Prisma engine เองก็ไม่รู้จัก มักเป็นปัญหา infra
// - PrismaClientKnownRequestError โค้ด P1xxx = connection-level (ต่อ DB ไม่ติด/timeout/ปิดกลางคัน)
//   ต่างจาก P2xxx ที่เป็น query/constraint error (เช่น P2002 ที่ service ชั้นในจัดการเป็น
//   DUPLICATE ไปแล้ว — ไม่หลุดมาถึงตรงนี้)
function isInfraError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientInitializationError) return true
  if (e instanceof Prisma.PrismaClientRustPanicError) return true
  if (e instanceof Prisma.PrismaClientUnknownRequestError) return true
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code.startsWith('P1')) return true
  return false
}
