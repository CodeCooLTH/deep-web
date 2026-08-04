/**
 * /api/account/delete — ลบบัญชีผู้ใช้ (App Store Guideline 5.1.1(v))
 *
 * GET  = preflight: บอกว่าลบได้ไหม ติดอะไร ต้องพิมพ์อะไรยืนยัน
 * POST = ลบจริง (soft-delete ทันที + cron ล้าง PII อีก 30 วัน)
 *
 * ทำไมวางใต้ /api/account/*: กลุ่มนี้ auth ด้วย session cookie อยู่แล้ว และ proxy.ts บังคับ
 * CSRF Origin-check ให้ทุก mutation ที่ไม่ใช่ /api/auth,/api/app,/api/cron,/api/webhooks
 * — endpoint นี้จึงได้ CSRF guard ฟรีโดยไม่ต้องทำเอง (สำคัญมากเพราะเป็น destructive action)
 *
 * Base (โครง route + valibot + session guard): src/app/api/account/set-phone/route.ts
 * Spec: docs/superpowers/specs/2026-08-04-account-deletion-design.md
 */
import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { ACCOUNT_DELETE_ERROR } from '@/lib/account-deletion'
import {
  AccountDeletionError,
  checkAccountDeletable,
  deleteAccount,
} from '@/services/account-deletion.service'

const Body = v.object({
  confirmText: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
})

/** map error code → HTTP status; ข้อความไทยให้ client เป็นคนเลือกจาก code (i18n อยู่ที่ UI) */
const STATUS_BY_CODE: Record<string, number> = {
  [ACCOUNT_DELETE_ERROR.NOT_FOUND]: 404,
  [ACCOUNT_DELETE_ERROR.ALREADY_DELETED]: 409,
  // 409 ไม่ใช่ 403 โดยตั้งใจ — ปัญหาอยู่ที่ "สถานะข้อมูลยังไม่พร้อม" ไม่ใช่ "ไม่มีสิทธิ์"
  [ACCOUNT_DELETE_ERROR.HAS_BLOCKERS]: 409,
  [ACCOUNT_DELETE_ERROR.CONFIRM_MISMATCH]: 400,
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const preflight = await checkAccountDeletable(userId)
    return NextResponse.json(preflight)
  } catch (e) {
    if (e instanceof AccountDeletionError) {
      return NextResponse.json({ error: e.code }, { status: STATUS_BY_CODE[e.code] ?? 400 })
    }
    // ไม่ leak ข้อความ error ของ DB ออกไป — log ฝั่ง server พอ
    console.error('[api/account/delete] preflight failed', e)
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = v.safeParse(Body, await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }
  const { confirmText } = parsed.output

  try {
    // service ตรวจ blockers + ข้อความยืนยันซ้ำเองทั้งคู่ (fail-closed) — route ไม่ต้องเช็คก่อน
    const { purgeAt } = await deleteAccount(userId, confirmText)
    return NextResponse.json({ ok: true, purgeAt: purgeAt.toISOString() })
  } catch (e) {
    if (e instanceof AccountDeletionError) {
      // HAS_BLOCKERS: ส่ง blockers ล่าสุดกลับไปด้วย ให้ UI อัปเดตรายการที่ต้องเคลียร์ได้ทันที
      // โดยไม่ต้องให้ผู้ใช้ปิดโมดัลแล้วเปิดใหม่ (ระหว่างโมดัลเปิดค้างอาจมีออเดอร์ใหม่เข้ามา)
      if (e.code === ACCOUNT_DELETE_ERROR.HAS_BLOCKERS) {
        const preflight = await checkAccountDeletable(userId).catch(() => null)
        return NextResponse.json(
          { error: e.code, blockers: preflight?.blockers ?? [] },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: e.code }, { status: STATUS_BY_CODE[e.code] ?? 400 })
    }
    console.error('[api/account/delete] delete failed', e)
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 })
  }
}
