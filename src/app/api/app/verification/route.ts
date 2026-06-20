import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireAppUser } from '@/lib/app-auth'
import { AppVerifyRequestSchema } from '@/lib/app-validations'
import {
  getUserVerifications,
  getMaxVerificationLevel,
  submitVerification,
} from '@/services/verification.service'

// GET /api/app/verification — สถานะยืนยันตัวตนของฉัน (ระดับปัจจุบัน + ประวัติ)
export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response

  const [records, level] = await Promise.all([
    getUserVerifications(auth.user.id),
    getMaxVerificationLevel(auth.user.id),
  ])
  return NextResponse.json({
    currentLevel: level > 0 ? level : 0, // 0=ยังไม่ verify, 1=phone, 2=เอกสาร, 3=ธุรกิจ
    records: records.map((r) => ({
      type: r.type,
      level: r.level,
      status: r.status, // PENDING | APPROVED | REJECTED
      rejectedReason: r.rejectedReason,
      createdAtMs: r.createdAt.getTime(),
    })),
  })
}

// POST /api/app/verification — ขอยืนยันตัวตน L2/L3 (สร้าง record PENDING → admin รีวิวฝั่งเว็บ)
export async function POST(request: NextRequest) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response

  const body = await request.json().catch(() => null)
  if (body === null) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  const parsed = v.safeParse(AppVerifyRequestSchema, body)
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })

  const { level, type, documents } = parsed.output

  // กันส่งซ้ำ: ถ้ามีคำขอ PENDING หรือ APPROVED ระดับนี้อยู่แล้ว → ไม่สร้างใหม่
  const existing = await getUserVerifications(auth.user.id)
  if (existing.some((r) => r.level === level && (r.status === 'PENDING' || r.status === 'APPROVED'))) {
    return NextResponse.json({ ok: true, status: 'PENDING', message: 'มีคำขอ/ยืนยันระดับนี้อยู่แล้ว' })
  }

  try {
    const record = await submitVerification(auth.user.id, {
      type: type ?? (level === 3 ? 'BUSINESS' : 'DOCUMENT'),
      level,
      documents,
    })
    return NextResponse.json({ ok: true, status: record.status, id: record.id }, { status: 201 })
  } catch (e) {
    console.error('[POST /api/app/verification] submit failed', e)
    return NextResponse.json({ error: 'ส่งคำขอยืนยันไม่สำเร็จ' }, { status: 500 })
  }
}
