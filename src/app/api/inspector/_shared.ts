import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sessionUserId } from '@/lib/session-user'
import { InspectionRoundError } from '@/services/inspection-round.service'

/**
 * ตัวช่วยร่วมของ `/api/inspector/**` (feature 00060 · T10)
 *
 * 🛑 **ผู้ตรวจเป็นบุคคลภายนอกที่จ้างรายครั้ง** ⇒ ด่านสองชั้นต้องผ่านก่อนแตะข้อมูลใด ๆ:
 *    (1) `sessionUserId()` ไม่เป็น null (2) `User.isInspector === true` **ตรวจทุกคำขอ**
 *    ไม่ใช่ตอน login — ถอดสิทธิ์แล้วต้องเข้าไม่ได้ทันทีแม้มีงานค้างอยู่
 *
 * 🛑 **ไม่มี endpoint ใดในกลุ่มนี้คืนข้อมูลการเงิน** (ยอดเครดิต · ธุรกรรม · สลิป · ราคาแผน)
 *    ไม่ว่าร้านไหน — ห้ามเพิ่มภายหลังโดยไม่แก้ API.md §2.1
 */
export async function requireInspector() {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (userId === null) return { response: inspectorError('UNAUTHORIZED') } as const

  const user = await prisma.user.findFirst({
    where: { id: userId, isInspector: true, deletedAt: null },
    select: { id: true },
  })
  if (user === null) return { response: inspectorError('NOT_INSPECTOR') } as const
  return { userId } as const
}

type InspectorErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'NOT_INSPECTOR'
  | 'ROUND_NOT_ASSIGNED'
  | 'ROUND_ALREADY_COMPLETED'
  | 'RESULTS_INCOMPLETE'
  | 'CHECK_NOT_IN_ROUND'
  | 'UNKNOWN_CHECK_KEY'
  | 'EVIDENCE_VISIBILITY_FORBIDDEN'
  | 'FILE_NOT_COMMITTED'
  | 'INTERNAL_ERROR'

const SPEC: Record<InspectorErrorCode, { status: number; message: string }> = {
  UNAUTHORIZED: { status: 401, message: 'กรุณาเข้าสู่ระบบก่อน' },
  VALIDATION_ERROR: { status: 400, message: 'ข้อมูลไม่ถูกต้องหรือไม่ครบถ้วน' },
  NOT_INSPECTOR: { status: 403, message: 'บัญชีนี้ไม่ใช่ผู้ตรวจ' },
  // 🛑 รวม "ไม่ใช่ของคุณ" กับ "ไม่มีอยู่จริง" เป็นคำตอบเดียวโดยตั้งใจ — แยกเมื่อไร ผู้ที่มี
  //    isInspector จะเดา id ไล่ไปเรื่อย ๆ แล้วรู้ว่ารอบไหนมีอยู่จริงบ้าง
  ROUND_NOT_ASSIGNED: { status: 403, message: 'ไม่พบรอบตรวจที่คุณได้รับมอบหมาย' },
  ROUND_ALREADY_COMPLETED: {
    status: 409,
    message: 'รอบตรวจนี้ปิดไปแล้ว หากผลไม่ถูกต้องต้องเปิดรอบตรวจใหม่',
  },
  RESULTS_INCOMPLETE: { status: 409, message: 'ยังบันทึกผลไม่ครบทุกข้อของรอบนี้' },
  CHECK_NOT_IN_ROUND: { status: 400, message: 'ข้อตรวจนี้ไม่ได้อยู่ในรอบที่ได้รับมอบหมาย' },
  UNKNOWN_CHECK_KEY: { status: 400, message: 'ไม่รู้จักข้อตรวจที่ระบุ' },
  EVIDENCE_VISIBILITY_FORBIDDEN: { status: 400, message: 'ชนิดหลักฐานไม่ตรงกับข้อตรวจนี้' },
  FILE_NOT_COMMITTED: { status: 400, message: 'ไฟล์แนบยังอัปโหลดไม่สำเร็จ กรุณาลองแนบใหม่' },
  INTERNAL_ERROR: { status: 500, message: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' },
}

export function inspectorError(
  code: InspectorErrorCode,
  opts?: { message?: string; details?: Record<string, unknown> },
): NextResponse {
  const spec = SPEC[code]
  return NextResponse.json(
    { error: code, message: opts?.message ?? spec.message, ...(opts?.details ? { details: opts.details } : {}) },
    { status: spec.status },
  )
}

const ROUND_ERROR_TO_CODE: Record<string, InspectorErrorCode> = {
  ROUND_NOT_ASSIGNED_TO_YOU: 'ROUND_NOT_ASSIGNED',
  ROUND_NOT_FOUND: 'ROUND_NOT_ASSIGNED',
  INSPECTOR_NOT_ELIGIBLE: 'NOT_INSPECTOR',
  INSPECTOR_NAME_UNUSABLE: 'NOT_INSPECTOR',
  ROUND_ALREADY_COMPLETED: 'ROUND_ALREADY_COMPLETED',
  ROUND_NOT_COMPLETABLE: 'RESULTS_INCOMPLETE',
  CHECK_NOT_IN_ROUND: 'CHECK_NOT_IN_ROUND',
  EVIDENCE_VISIBILITY_FORBIDDEN: 'EVIDENCE_VISIBILITY_FORBIDDEN',
  FILE_NOT_COMMITTED: 'FILE_NOT_COMMITTED',
}

/**
 * 🛑 ห้าม log `fileId` ของหลักฐาน — log ได้เฉพาะ `roundId` ที่เป็น reference ภายใน
 *    ที่ไม่ระบุตัวบุคคล (RC-8 + PDPA)
 */
export function mapInspectorError(e: unknown, ctx: { tag: string; roundId?: string }): NextResponse {
  if (e instanceof InspectionRoundError) {
    const code = ROUND_ERROR_TO_CODE[e.code] ?? 'INTERNAL_ERROR'
    // รายชื่อข้อที่ยังขาดต้องกลับไปถึงผู้ตรวจ ไม่งั้นเขาไม่รู้ว่าต้องกดข้อไหนต่อ
    const details = e.missing.length > 0 ? { missing: e.missing } : undefined
    if (code !== 'INTERNAL_ERROR') return inspectorError(code, { details })
  }
  console.error(`[${ctx.tag}] roundId=${ctx.roundId ?? '-'} error:`, e)
  return inspectorError('INTERNAL_ERROR')
}

export { ROUND_ERROR_TO_CODE }
