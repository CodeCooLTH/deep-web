/**
 * _shared.ts — ด่านร่วมของ owner API ชุด line-report (00070 · SRS §4.3 · API §2/§5)
 * error map อยู่ที่นี่ที่เดียว: route ทุกตัวห่อด้วย `handle()` แล้ว throw LineReportError ได้เลย
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { isReportBotReady } from '@/lib/line-report/config'
import { LineReportError, LINE_REPORT_ERROR_MESSAGE, LINE_REPORT_ERROR_STATUS, type LineReportErrorCode } from '@/lib/line-report/errors'
import { GroupIdParam } from '@/lib/line-report/validations'
import { requireReportAccess } from '@/services/line-report-access.service'

/** ทุก response ของ owner API ห้าม cache (มีข้อมูลตัวเลขของร้าน/โค้ดผูก) */
export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function toErrorResponse(e: unknown): NextResponse {
  if (e instanceof LineReportError) {
    const code: LineReportErrorCode = e.code
    return json({ error: code, message: LINE_REPORT_ERROR_MESSAGE[code], details: e.details }, LINE_REPORT_ERROR_STATUS[code])
  }
  // error นอกชุด: log ชื่ออย่างเดียว (message อาจมี PII/SQL)
  console.error('[line-report-api] error นอกชุด', e instanceof Error ? e.name : 'unknown')
  return json({ error: 'INTERNAL', message: LINE_REPORT_ERROR_MESSAGE.INTERNAL, details: {} }, 500)
}

/** ตรวจสิทธิ์ L1 (READ) / L2 (PAID) จาก session จริง → userId */
export async function requireAccess(level: 'READ' | 'PAID'): Promise<string> {
  return requireReportAccess(await getServerSession(authOptions), level)
}

export function requireBotReady(): void {
  if (!isReportBotReady()) throw new LineReportError('BOT_NOT_CONFIGURED')
}

/** Valibot → VALIDATION + details.fields (ชื่อฟิลด์ที่ผิด) · JSON เสีย = VALIDATION เช่นกัน */
export async function parseBody<S extends v.GenericSchema>(req: Request, schema: S, opts?: { emptyOk?: boolean }): Promise<v.InferOutput<S>> {
  let raw: unknown
  try {
    const text = await req.text()
    raw = text.trim() === '' && opts?.emptyOk ? {} : JSON.parse(text)
  } catch {
    throw new LineReportError('VALIDATION', { fields: [] })
  }
  const r = v.safeParse(schema, raw)
  if (!r.success) {
    const fields = [...new Set(r.issues.map((i) => v.getDotPath(i)).filter((p): p is string => !!p))]
    throw new LineReportError('VALIDATION', { fields })
  }
  return r.output
}

export type Ctx = { params: Promise<{ id: string }> }

/** params ของ Next 16 เป็น Promise · id เพี้ยน = 404 ไม่ใช่ 400 (ไม่ยืนยันว่ามี id รูปแบบไหน) */
export async function groupIdOf(ctx: Ctx): Promise<string> {
  const r = v.safeParse(GroupIdParam, (await ctx.params).id)
  if (!r.success) throw new LineReportError('GROUP_NOT_FOUND')
  return r.output
}

export function handle<A extends unknown[]>(fn: (...a: A) => Promise<NextResponse>) {
  return async (...a: A): Promise<NextResponse> => {
    try {
      return await fn(...a)
    } catch (e) {
      return toErrorResponse(e)
    }
  }
}
