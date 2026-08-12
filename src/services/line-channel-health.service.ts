// (00025 ส่วนขยาย 2026-08-12) — "ปุ่มทดสอบการเชื่อมต่อ" ที่ตอบคำถามที่ถูกต้อง
//
// 🛑 คำถามที่ปุ่มนี้ต้องตอบคือ **"event ที่ LINE ส่งมา เราประมวลผลได้ไหม"**
// ไม่ใช่ **"server เรายังมีชีวิตไหม"** — สองอย่างนี้ต่างกันมากในระบบนี้ เพราะ webhook ของเรา
// ตอบ `200` เสมอตามสเปกของตัวเอง (BR-LINE-05/06) รวมตอนลายเซ็นไม่ผ่านและตอนหา destination
// ไม่เจอ ⇒ `POST /v2/bot/channel/webhook/test` จึงคืน `success:true` ได้ทั้งที่เราตกทุก event
//
// จึงทำงาน 2 จังหวะ: ยิงให้ LINE ส่ง test event เข้ามา → รอให้มันวิ่งถึง → **อ่านตัวนับความ
// ล้มเหลวของเราเอง** ว่าขยับในหน้าต่างนั้นไหม (AC-CH-16/17/18)

import { prisma } from '@/lib/prisma'
import { decryptToken } from '@/lib/token-crypto'
import { probeLineToken, probeLineWebhook, testLineWebhook } from '@/lib/line/health-probe'
import { readLineDestinationMiss } from './line-inbound-health.service'
import { HEALTH_INBOUND_SETTLE_MS } from '@/lib/line/constants'
import { LineChannelServiceError } from './shop-channel.service'

export type LineHealthVerdict =
  | 'PASS'
  | 'PASS_WITH_NOTE'
  | 'FAIL_SECRET'
  | 'FAIL_TOKEN'
  | 'FAIL_WEBHOOK'

export type LineHealthCheckState = 'PASS' | 'FAIL' | 'INCONCLUSIVE'

export interface LineHealthReport {
  verdict: LineHealthVerdict
  webhook: { state: LineHealthCheckState; endpoint: string | null; active: boolean; matchesUs: boolean } | null
  token: { state: LineHealthCheckState; expiresAt: string | null }
  inbound: { state: LineHealthCheckState; reason: 'SIGNATURE_MISMATCH' | 'DESTINATION_NOT_FOUND' | null }
  checkedAt: string
}

/**
 * ตรวจสุขภาพช่องทาง LINE แบบเต็ม — เรียกจากปุ่ม "ทดสอบการเชื่อมต่อ"
 *
 * ownership อยู่ใน `WHERE {id, shopId}` ตามแบบเดียวกับ `updateLineChannelCredentials`
 * (ไม่ trust channelId จาก path param เพียงอย่างเดียว — IDOR)
 */
export async function runLineChannelHealthCheck(params: {
  channelId: string
  shopId: string
  /** URL ที่เราแสดงให้ร้านคัดลอก — ตัวแปรเดียวกับที่ใช้ตอนเชื่อม (HR16) */
  webhookUrl: string
}): Promise<LineHealthReport> {
  const row = await prisma.shopChannel.findFirst({
    where: { id: params.channelId, shopId: params.shopId, provider: 'LINE' },
    select: { id: true, accessTokenEnc: true, lineLastInboundFailAt: true },
  })
  if (!row) throw new LineChannelServiceError('CHANNEL_NOT_FOUND_OR_FORBIDDEN')

  const token = decryptToken(row.accessTokenEnc)
  const startedAt = Date.now()
  // ตัวนับ destination-miss เป็นระดับ process — จำค่าก่อนยิงไว้เทียบทีหลัง
  const missBefore = readLineDestinationMiss().count

  const [tokenProbe, webhookProbe] = await Promise.all([
    probeLineToken(token),
    probeLineWebhook(token, params.webhookUrl),
  ])

  // จังหวะที่ 1 — สั่งให้ LINE ยิง test event เข้ามาจริง
  // ยิงเฉพาะเมื่อ webhook พร้อมพอจะมี event วิ่งมาถึง ไม่งั้นเสียเวลารอฟรี
  const shouldTest = Boolean(webhookProbe?.endpoint && webhookProbe.matchesUs)
  const testResult = shouldTest ? await testLineWebhook(token) : null

  // จังหวะที่ 2 — รอให้ event ที่ LINE ยิงมาวิ่งถึงเราแล้วค่อยอ่าน "ตัวนับของเราเอง"
  // 🛑 อ่านเร็วเกินไปจะพลาดสัญญาณแล้วรายงานว่า "ผ่าน" ทั้งที่ยังไม่ถึง
  if (shouldTest) await new Promise((r) => setTimeout(r, HEALTH_INBOUND_SETTLE_MS))

  const after = await prisma.shopChannel.findUnique({
    where: { id: row.id },
    select: { lineLastInboundFailAt: true, lineLastInboundFailReason: true, lineTokenExpiresAt: true },
  })

  // ขยับ = มีการปฏิเสธเกิดขึ้น "หลังจาก" เรากดยิง (เทียบกับเวลาเริ่ม ไม่ใช่เทียบกับค่าเดิม —
  // ค่าเดิมอาจเป็น null ได้ และ throttle 60 วิ ทำให้ค่าเดิมไม่ขยับแม้มีการปฏิเสธจริง)
  const failedAfterStart = Boolean(after?.lineLastInboundFailAt && after.lineLastInboundFailAt.getTime() >= startedAt)
  const missedAfterStart = readLineDestinationMiss().count > missBefore

  // เก็บผลอ่าน token ไว้ให้การ์ด/cron ใช้ต่อ (ไม่ต้องยิงซ้ำ)
  await prisma.shopChannel
    .update({
      where: { id: row.id },
      data: { lineTokenExpiresAt: tokenProbe.expiresAt, lineTokenCheckedAt: new Date() },
    })
    .catch((e) => console.error('[line-health] เก็บผลอ่าน token ไม่สำเร็จ', e instanceof Error ? e.message : e))

  const webhookState: LineHealthCheckState = !webhookProbe
    ? 'INCONCLUSIVE'
    : webhookProbe.endpoint && webhookProbe.matchesUs && webhookProbe.active
      ? 'PASS'
      : 'FAIL'
  const tokenState: LineHealthCheckState = tokenProbe.valid ? 'PASS' : 'FAIL'
  const inboundReason = failedAfterStart
    ? (after?.lineLastInboundFailReason as 'SIGNATURE_MISMATCH' | null) ?? 'SIGNATURE_MISMATCH'
    : missedAfterStart
      ? 'DESTINATION_NOT_FOUND'
      : null
  // สัญญาณบวกที่แข็งที่สุดที่หาได้: LINE ยิง test event ที่ **เซ็นด้วย channel secret จริง** เข้ามา
  // แล้วรายงานว่า server เราตอบ 200 **และ** ตัวนับความล้มเหลวของเราไม่ขยับในหน้าต่างนั้น
  // ⇒ แปลว่าลายเซ็นผ่านด่านของเราจริง ไม่ใช่แค่ "ไม่มีอะไรล้ม"
  //
  // 🛑 ถ้ายิงไม่ได้ (webhook ไม่ได้ชี้มาหาเรา) หรือยิงแล้ว LINE ไม่ยืนยัน → ดีที่สุดที่พูดได้คือ
  // INCONCLUSIVE ห้ามรายงานเป็นผ่าน เพราะเราไม่มีหลักฐานฝั่งรับเลยสักชิ้น
  const testConfirmed = Boolean(testResult?.reportedSuccess && testResult.statusCode === 200)
  const inboundState: LineHealthCheckState = inboundReason
    ? 'FAIL'
    : testConfirmed
      ? 'PASS'
      : 'INCONCLUSIVE'

  return {
    verdict: resolveVerdict({ webhookState, tokenState, inboundState, inboundReason }),
    webhook: webhookProbe
      ? {
          state: webhookState,
          endpoint: webhookProbe.endpoint,
          active: webhookProbe.active,
          matchesUs: webhookProbe.matchesUs,
        }
      : null,
    token: { state: tokenState, expiresAt: (tokenProbe.expiresAt ?? after?.lineTokenExpiresAt ?? null)?.toISOString() ?? null },
    inbound: { state: inboundState, reason: inboundReason },
    checkedAt: new Date().toISOString(),
  }
}

/**
 * รวมผล 3 ด้านเป็นคำตัดสินเดียว — ลำดับเดียวกับ `resolveLineChannelHealth()` โดยตั้งใจ
 * (ปุ่มทดสอบกับป้ายบนการ์ดต้องไม่พูดคนละเรื่องกับข้อมูลชุดเดียวกัน — HR16)
 */
export function resolveVerdict(input: {
  webhookState: LineHealthCheckState
  tokenState: LineHealthCheckState
  inboundState: LineHealthCheckState
  inboundReason: string | null
}): LineHealthVerdict {
  if (input.inboundReason === 'SIGNATURE_MISMATCH') return 'FAIL_SECRET'
  if (input.tokenState === 'FAIL') return 'FAIL_TOKEN'
  if (input.webhookState === 'FAIL') return 'FAIL_WEBHOOK'
  // หา destination ไม่เจอ = event มาถึงเราแล้วแต่ไม่มีแถวรองรับ — เป็นปัญหาฝั่งตั้งค่าช่องทาง
  if (input.inboundReason === 'DESTINATION_NOT_FOUND') return 'FAIL_WEBHOOK'
  // 🛑 ผ่านเต็มปากได้เฉพาะเมื่อมีหลักฐาน **ฝั่งรับ** จริง ไม่ใช่แค่ "ตั้งค่าถูก"
  // (ตั้งค่าถูก + ยืนยันการรับไม่ได้ = ยังไม่ผ่าน ต้องบอกผู้ใช้ตามนั้น)
  if (input.webhookState === 'PASS' && input.inboundState === 'PASS') return 'PASS'
  return 'PASS_WITH_NOTE'
}
