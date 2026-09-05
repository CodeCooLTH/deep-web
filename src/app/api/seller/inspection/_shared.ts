import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sessionUserId } from '@/lib/session-user'
import { requireActiveShop } from '@/lib/shop-context'
import { formatDateTH } from '@/lib/format-date'
import { nextIntakeOpensAt } from '@/lib/inspection/plan-lifecycle'
import { InspectionPlanError } from '@/services/inspection-plan.service'
import { InspectionEvidenceError } from '@/services/inspection-result.service'

/**
 * ตัวช่วยร่วมของ `/api/seller/inspection/**` (feature 00060 · T9)
 *
 * 🛑 **ไม่รับ `shopId` จาก client ทุกกรณี** — derive จาก active shop ของ session เท่านั้น
 *    รับเมื่อไรผู้ขาย A อ่าน/กดแผนของผู้ขาย B ได้ทันที (แพตเทิร์น DAL ownership เดียวกับ
 *    `/api/seller/auctions/_shared.ts`)
 *
 * 🛑 "มี session" ไม่เท่ากับ "รู้ว่าเป็นใคร" — ใช้ `sessionUserId()` เท่านั้น ห้าม cast
 *    `session.user.id` เอง (docs/conventions/session-exists-is-not-identity.md)
 */
export async function requireInspectionShop() {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (userId === null) {
    return { response: errorResponse('UNAUTHORIZED') } as const
  }

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (active === null) return { response: errorResponse('SHOP_NOT_FOUND') } as const

  // 🛑 ด่านประเภทร้านอยู่ที่ service ด้วย (ไม่ใช่แค่ที่นี่) — ที่นี่ตัดจบเร็วเพื่อให้ข้อความตรง
  //    ตั้งแต่คำขอแรก ส่วนด่านจริงที่กันการยิงตรงอยู่ใน assertOwnerOfLodgingShop()
  return { userId, shopId: active.shop.id } as const
}

type ErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'FORBIDDEN'
  | 'NOT_LODGING'
  | 'NOT_OWNER'
  | 'SHOP_NOT_FOUND'
  | 'PLAN_NOT_FOUND'
  | 'PLAN_NOT_ACTIVE'
  | 'PLAN_ALREADY_EXISTS'
  | 'PLAN_ALREADY_CANCELED'
  | 'INVALID_STEP_TRANSITION'
  | 'QUOTA_FULL'
  | 'TERMS_NOT_ACCEPTED'
  | 'INSUFFICIENT_CREDIT'
  | 'PRICING_NOT_DECIDED'
  | 'UNKNOWN_CHECK_KEY'
  | 'CHECK_SCOPE_MISMATCH'
  | 'ROOM_NOT_IN_SHOP'
  | 'CHECK_NOT_SELLER_SUPPLIED'
  | 'CHECK_NOT_IN_ROUND'
  | 'FILE_NOT_COMMITTED'
  | 'INTERNAL_ERROR'

/**
 * 🛑 `message` ต้องบอก **ทางออก** ไม่ใช่แค่อาการ — ข้อความที่เขียนเหมือนกันหมดทุกกรณีคือ
 *    คำเชิญให้ผู้ใช้กดสิ่งที่ไม่มีวันสำเร็จซ้ำ ๆ (บทเรียน iShip 2026-08-06 ที่ "เครดิตไม่พอ"
 *    ถูกจัดเป็น error ที่ retry ได้)
 */
const ERROR_SPEC: Record<ErrorCode, { status: number; message: string }> = {
  UNAUTHORIZED: { status: 401, message: 'กรุณาเข้าสู่ระบบก่อน' },
  VALIDATION_ERROR: { status: 400, message: 'ข้อมูลไม่ถูกต้องหรือไม่ครบถ้วน' },
  FORBIDDEN: { status: 403, message: 'ไม่มีสิทธิ์เข้าถึงส่วนนี้' },
  NOT_LODGING: { status: 403, message: 'แผนการตรวจสอบเปิดให้เฉพาะร้านประเภทบ้านพักในรอบแรก' },
  NOT_OWNER: { status: 403, message: 'เฉพาะเจ้าของร้านเท่านั้นที่จัดการแผนการตรวจสอบได้' },
  SHOP_NOT_FOUND: { status: 404, message: 'ไม่พบร้านค้า' },
  PLAN_NOT_FOUND: { status: 404, message: 'ร้านนี้ยังไม่ได้อยู่ในแผนการตรวจสอบ กรุณาสมัครก่อน' },
  PLAN_NOT_ACTIVE: {
    status: 404,
    message: 'แผนการตรวจสอบของร้านสิ้นสุดแล้ว สมัครใหม่ได้จากหน้าแผนการตรวจสอบ',
  },
  PLAN_ALREADY_EXISTS: {
    status: 409,
    message: 'ร้านนี้อยู่ในแผนการตรวจสอบอยู่แล้ว หากต้องการขั้นที่สูงขึ้นให้ใช้การอัปเกรด',
  },
  PLAN_ALREADY_CANCELED: {
    status: 409,
    message: 'แจ้งยกเลิกแผนไว้แล้ว จะมีผลเมื่อสิ้นสุดรอบบิลปัจจุบัน',
  },
  INVALID_STEP_TRANSITION: { status: 409, message: 'เลือกได้เฉพาะขั้นที่สูงกว่าขั้นปัจจุบัน' },
  QUOTA_FULL: { status: 409, message: 'ขั้นนี้เปิดรับครบจำนวนของเดือนนี้แล้ว' },
  TERMS_NOT_ACCEPTED: {
    status: 400,
    message: 'ต้องรับทราบเงื่อนไขค่าตรวจไม่คืนเงินและเงื่อนไขกรณีพบหลักฐานฉ้อโกงก่อน',
  },
  INSUFFICIENT_CREDIT: { status: 402, message: 'ยอดเงินในกระเป๋าร้านไม่พอ กรุณาเติมเงินก่อนสมัคร' },
  // ราคายังไม่เคาะ ⇒ เปิดขายบน production ไม่ได้ (lib/inspection/pricing.ts) — ต้องเป็นข้อความ
  // ที่บอกตรง ๆ ว่ายังไม่เปิดขาย ไม่ใช่ 500 ที่ชวนให้ผู้ใช้กดซ้ำ
  PRICING_NOT_DECIDED: { status: 409, message: 'แผนการตรวจสอบยังไม่เปิดให้สมัครในขณะนี้' },
  UNKNOWN_CHECK_KEY: { status: 400, message: 'ไม่รู้จักข้อตรวจที่ระบุ' },
  CHECK_SCOPE_MISMATCH: {
    status: 400,
    message: 'ข้อตรวจนี้ไม่ตรงกับสิ่งที่ระบุ (ข้อของร้าน/ข้อของที่พักรายหลัง)',
  },
  ROOM_NOT_IN_SHOP: { status: 403, message: 'ไม่พบที่พักหลังนี้ในร้าน' },
  CHECK_NOT_SELLER_SUPPLIED: { status: 403, message: 'ข้อตรวจนี้ผู้ตรวจของ Deep เป็นผู้เก็บหลักฐานเอง' },
  CHECK_NOT_IN_ROUND: { status: 400, message: 'ยังไม่มีรอบตรวจที่เปิดอยู่สำหรับข้อตรวจนี้' },
  FILE_NOT_COMMITTED: { status: 400, message: 'ไฟล์แนบยังอัปโหลดไม่สำเร็จ กรุณาลองแนบใหม่' },
  INTERNAL_ERROR: { status: 500, message: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' },
}

export function errorResponse(
  code: ErrorCode,
  opts?: { message?: string; details?: Record<string, unknown> },
): NextResponse {
  const spec = ERROR_SPEC[code]
  return NextResponse.json(
    { error: code, message: opts?.message ?? spec.message, ...(opts?.details ? { details: opts.details } : {}) },
    { status: spec.status },
  )
}

/** export เพื่อให้เทส [blocker] ยืนยันได้ว่า error ทุกตัวของ service มีปลายทาง HTTP จริง */
export const PLAN_ERROR_TO_CODE: Record<string, ErrorCode> = {
  SHOP_NOT_FOUND: 'SHOP_NOT_FOUND',
  NOT_LODGING_SHOP: 'NOT_LODGING',
  NOT_SHOP_OWNER: 'NOT_OWNER',
  NOT_SHOP_MEMBER: 'FORBIDDEN',
  TERMS_NOT_ACCEPTED: 'TERMS_NOT_ACCEPTED',
  INTAKE_QUOTA_FULL: 'QUOTA_FULL',
  // 🛑 "ยังไม่เปิดรับ" กับ "เต็มแล้ว" ตอบ 409 QUOTA_FULL เหมือนกันตามสัญญา แต่ **ข้อความต่างกัน**
  //    — วันที่ทีมลืมตั้งโควตา ทุกขั้นจะขึ้นว่า "เต็ม" ทั้งที่ยังไม่มีใครสมัครสักคน แล้วจะไม่มีใคร
  //    เอะใจไปสืบ เพราะคำว่าเต็มเป็นคำอธิบายที่ฟังขึ้นสมบูรณ์
  INTAKE_NOT_OPEN: 'QUOTA_FULL',
  PLAN_NOT_FOUND: 'PLAN_NOT_FOUND',
  // 🛑 แยกจาก PLAN_NOT_FOUND — ร้านที่เคยจ่ายแล้วแผนหมดอายุ ถูกบอกว่า "ยังไม่ได้สมัคร"
  //    คือการอ้างสาเหตุที่ระบบรู้อยู่แล้วว่าไม่จริง และร้านกำลังเครียดตอนป้ายร่วงพอดี
  PLAN_NOT_ACTIVE: 'PLAN_NOT_ACTIVE',
  PLAN_ALREADY_EXISTS: 'PLAN_ALREADY_EXISTS',
  PLAN_ALREADY_CANCELED: 'PLAN_ALREADY_CANCELED',
  STEP_UNCHANGED: 'INVALID_STEP_TRANSITION',
  INVALID_STEP_TRANSITION: 'INVALID_STEP_TRANSITION',
}

/**
 * แมป error จาก service → HTTP ตามตารางใน API.md §5
 * 🛑 ทุกโค้ดในตารางต้องมี `catch` จริงที่นี่ ไม่งั้นมันตกไป 500 แล้วผู้ใช้เห็น "ลองใหม่อีกครั้ง"
 *    กับสิ่งที่ไม่มีทางสำเร็จด้วยการลองใหม่ (memory `feedback_service_error_route_mapping`)
 * 🛑 ห้าม log `fileId` / ยอดเงิน — log ได้เฉพาะ `shopId`/`roundId` ที่ไม่ระบุตัวบุคคล
 */
export function mapInspectionError(e: unknown, ctx: { tag: string; shopId?: string; step?: number; now?: Date }): NextResponse {
  if (e instanceof InspectionPlanError) {
    const code = PLAN_ERROR_TO_CODE[e.code] ?? 'INTERNAL_ERROR'
    if (code === 'QUOTA_FULL') {
      const now = ctx.now ?? new Date()
      const nextOpenAt = nextIntakeOpensAt(now)
      // AC-INS-09-2: ข้อความปิดรับ **ต้องบอกวันที่เปิดรับรอบถัดไปเสมอ** — บอกแค่ "เต็มแล้ว"
      // คือการปล่อยให้คนรอโดยไม่มีกำหนด
      const opened = e.code === 'INTAKE_QUOTA_FULL'
      return errorResponse('QUOTA_FULL', {
        message: opened
          ? `ขั้นนี้เปิดรับครบจำนวนของเดือนนี้แล้ว เปิดรับรอบถัดไป ${formatDateTH(nextOpenAt)}`
          : `เดือนนี้ยังไม่เปิดรับสมัครขั้นนี้ เปิดรับรอบถัดไป ${formatDateTH(nextOpenAt)}`,
        details: { step: ctx.step ?? null, nextOpenAt: nextOpenAt.toISOString() },
      })
    }
    return errorResponse(code)
  }

  if (e instanceof InspectionEvidenceError) return errorResponse(e.code)

  if (e instanceof Error) {
    // wallet.service โยนสตริงนี้ออกมาตรง ๆ ตามสัญญาเดิมของมัน
    if (e.message === 'INSUFFICIENT_CREDIT') return errorResponse('INSUFFICIENT_CREDIT')
    if (e.message === 'PRICING_NOT_DECIDED') return errorResponse('PRICING_NOT_DECIDED')
  }

  console.error(`[${ctx.tag}] shopId=${ctx.shopId ?? '-'} error:`, e)
  return errorResponse('INTERNAL_ERROR')
}
