import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { sessionUserId } from '@/lib/session-user'
import { InspectionAdminError } from '@/services/inspection-admin.service'
import { InspectionRoundError } from '@/services/inspection-round.service'

/**
 * ตัวช่วยร่วมของ `/api/admin/inspection/**` และ `/api/admin/users/[id]/inspector` (00060 · T10)
 *
 * 🛑 `requireAdmin()` คืน `session.user` ที่ยังไม่รับประกันว่ามี `id` — "มี session" ไม่เท่ากับ
 *    "รู้ว่าเป็นใคร" ⇒ ต้องผ่าน `sessionUserId()` อีกชั้นก่อนใช้เป็น `actorUserId` ของ audit
 *    (ถ้า id หลุดเป็น undefined เข้าไป แถว audit จะชี้ไปที่ "ไม่มีใคร" ซึ่งคือการมีหลักฐาน
 *     ที่ตอบคำถามสำคัญที่สุดไม่ได้)
 */
export async function requireAdminActor() {
  const admin = await requireAdmin()
  if (admin === null) return { response: adminError('FORBIDDEN') } as const
  const actorUserId = sessionUserId({ user: admin })
  if (actorUserId === null) return { response: adminError('FORBIDDEN') } as const
  return { actorUserId } as const
}

type AdminErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'QUOTA_INVALID'
  | 'SHOP_NOT_FOUND'
  | 'NOT_LODGING'
  | 'PLAN_NOT_FOUND'
  | 'ROOM_NOT_IN_SHOP'
  | 'UNKNOWN_CHECK_KEY'
  | 'CHECK_SCOPE_MISMATCH'
  | 'INSPECTOR_NOT_FOUND'
  | 'INSPECTOR_NAME_UNUSABLE'
  | 'ROUND_NOT_FOUND'
  | 'ROUND_ALREADY_ASSIGNED'
  | 'ROUND_ALREADY_COMPLETED'
  | 'USER_NOT_FOUND'
  | 'INSPECTOR_HAS_OPEN_ROUNDS'
  | 'FILE_NOT_COMMITTED'
  | 'INTERNAL_ERROR'

const SPEC: Record<AdminErrorCode, { status: number; message: string }> = {
  UNAUTHORIZED: { status: 401, message: 'กรุณาเข้าสู่ระบบก่อน' },
  FORBIDDEN: { status: 403, message: 'ไม่มีสิทธิ์เข้าถึงส่วนนี้' },
  VALIDATION_ERROR: { status: 400, message: 'ข้อมูลไม่ถูกต้องหรือไม่ครบถ้วน' },
  QUOTA_INVALID: { status: 400, message: 'ค่าโควตาที่ระบุไม่ถูกต้อง' },
  SHOP_NOT_FOUND: { status: 404, message: 'ไม่พบร้านค้า' },
  NOT_LODGING: { status: 403, message: 'แผนการตรวจสอบเปิดให้เฉพาะร้านประเภทบ้านพักในรอบแรก' },
  PLAN_NOT_FOUND: { status: 404, message: 'ร้านนี้ยังไม่ได้อยู่ในแผนการตรวจสอบ' },
  ROOM_NOT_IN_SHOP: { status: 403, message: 'ไม่พบที่พักหลังนี้ในร้าน' },
  UNKNOWN_CHECK_KEY: { status: 400, message: 'ไม่รู้จักข้อตรวจที่ระบุ' },
  CHECK_SCOPE_MISMATCH: {
    status: 400,
    message: 'ข้อตรวจในรอบเดียวกันต้องเป็นขอบเขตเดียวกันทั้งหมด (ของร้าน หรือของที่พักรายหลัง)',
  },
  INSPECTOR_NOT_FOUND: { status: 400, message: 'ไม่พบผู้ตรวจที่ระบุ' },
  // 🛑 บัญชีมีอยู่จริง — ถ้าบอกว่า "ไม่พบ" แอดมินจะไปไล่หาบัญชีที่เห็นอยู่ตรงหน้าแล้วสรุปว่าระบบค้นพัง
  INSPECTOR_NAME_UNUSABLE: {
    status: 400,
    message: 'ผู้ตรวจคนนี้ยังไม่มีชื่อที่ใช้แสดงต่อร้าน มอบหมายไม่ได้จนกว่าจะตั้งชื่อให้เรียบร้อย',
  },
  // 🛑 ฝั่งแอดมินใช้ 404 ได้ (ต่างจาก 403 ของฝั่งผู้ตรวจ) เพราะแอดมินเห็นรอบทุกรอบอยู่แล้ว
  //    การบอกว่า "ไม่มีรอบนี้" จึงไม่เปิดเผยอะไรที่เขาไม่มีสิทธิ์รู้
  ROUND_NOT_FOUND: { status: 404, message: 'ไม่พบรอบตรวจที่ระบุ' },
  ROUND_ALREADY_ASSIGNED: {
    status: 409,
    message: 'รอบนี้มอบหมายให้ผู้ตรวจคนอื่นไปแล้ว หากต้องการเปลี่ยนตัวให้ยืนยันอีกครั้ง',
  },
  ROUND_ALREADY_COMPLETED: { status: 409, message: 'รอบตรวจนี้ปิดไปแล้ว' },
  USER_NOT_FOUND: { status: 404, message: 'ไม่พบผู้ใช้ที่ระบุ' },
  INSPECTOR_HAS_OPEN_ROUNDS: {
    status: 409,
    message: 'ผู้ตรวจคนนี้ยังถือรอบตรวจที่ยังไม่ปิดอยู่ กรุณามอบหมายผู้ตรวจคนใหม่ให้รอบเหล่านี้ก่อน',
  },
  FILE_NOT_COMMITTED: { status: 400, message: 'ไฟล์แนบยังอัปโหลดไม่สำเร็จ กรุณาลองแนบใหม่' },
  INTERNAL_ERROR: { status: 500, message: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' },
}

export function adminError(
  code: AdminErrorCode,
  opts?: { message?: string; details?: Record<string, unknown> },
): NextResponse {
  const spec = SPEC[code]
  return NextResponse.json(
    { error: code, message: opts?.message ?? spec.message, ...(opts?.details ? { details: opts.details } : {}) },
    { status: spec.status },
  )
}

const ROUND_ERROR_TO_CODE: Record<string, AdminErrorCode> = {
  ROUND_NOT_FOUND: 'ROUND_NOT_FOUND',
  ROUND_ALREADY_COMPLETED: 'ROUND_ALREADY_COMPLETED',
  ROUND_ALREADY_ASSIGNED: 'ROUND_ALREADY_ASSIGNED',
  // รอบ AUTO ไม่มีคนตรวจ — เป็นคำขอที่ผิดรูป ไม่ใช่สถานะที่ขัดกัน
  ROUND_NOT_ASSIGNABLE: 'VALIDATION_ERROR',
  INSPECTOR_NOT_ELIGIBLE: 'INSPECTOR_NOT_FOUND',
  INSPECTOR_NAME_UNUSABLE: 'INSPECTOR_NAME_UNUSABLE',
}

/** 🛑 ห้าม log `fileId` · เนื้อหา description ของรายงานฉ้อโกง · `identifiers[].value` · ยอดเงิน */
export function mapAdminError(e: unknown, ctx: { tag: string }): NextResponse {
  if (e instanceof InspectionAdminError) {
    return adminError(e.code as AdminErrorCode, { details: e.details })
  }
  if (e instanceof InspectionRoundError) {
    const code = ROUND_ERROR_TO_CODE[e.code]
    if (code !== undefined) return adminError(code)
  }
  if (e instanceof Error && e.name === 'DuplicateScamReportError') {
    return adminError('VALIDATION_ERROR', { message: 'เคยรายงานตัวระบุชุดนี้ไปแล้ว' })
  }
  console.error(`[${ctx.tag}] error:`, e)
  return adminError('INTERNAL_ERROR')
}

export { ROUND_ERROR_TO_CODE as ADMIN_ROUND_ERROR_TO_CODE }
