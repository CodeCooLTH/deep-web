/**
 * line-report-access.service.ts — ด่านสิทธิ์ของรายงานกลุ่ม LINE (00068 · SRS TFR-01/22 · SDS §3.1)
 *
 * L1 = เป็นเจ้าของร้านอย่างน้อย 1 ร้าน (อ่าน/ลบ/รับทราบ) · L2 = L1 + แพ็กเกจธุรกิจ ACTIVE (สร้าง/แก้/ส่ง)
 */
import { prisma } from '@/lib/prisma'
import { sessionUserId } from '@/lib/session-user'
import { getSubscriptionStatus } from '@/services/business-package.service'
import { LineReportError } from '@/lib/line-report/errors'

export type PaidState = 'PAID' | 'UNPAID' | 'UNKNOWN'

/**
 * อ่านสถานะแพ็กเกจแบบ 3 ค่า — แยก "ยืนยันแล้วว่าไม่ ACTIVE" (UNPAID) ออกจาก "อ่านไม่ได้" (UNKNOWN)
 * sweep ต้องไม่เอา UNKNOWN ไปทำเหมือนหยุดแพ็กเกจ (ไม่งั้น DB สะดุดครั้งเดียว = slot ถูกบันทึก MISSED + ส่งข้อความสุดท้ายผิด ๆ)
 */
export async function readOwnerPaidState(ownerId: string): Promise<PaidState> {
  try {
    return (await getSubscriptionStatus(ownerId))?.status === 'ACTIVE' ? 'PAID' : 'UNPAID'
  } catch {
    return 'UNKNOWN'
  }
}

/**
 * จ่ายแล้วไหม — fail-closed: อ่านแพ็กเกจพัง = "ไม่จ่าย" (ไม่ส่งรายงานเข้ากลุ่มเพราะเดา)
 * ทุก tier ทุก source นับเท่ากัน · ไม่มีแถว/LOCKED_RENEWAL_FAILED = false
 * จุดส่งจริงต้องเรียกซ้ำทุกครั้ง ห้ามอ่านจากแถวกลุ่ม (AC-01-6)
 */
export async function isOwnerPaidForReports(ownerId: string): Promise<boolean> {
  return (await readOwnerPaidState(ownerId)) === 'PAID'
}

/** เจ้าของร้านจริง (Shop.userId) — ADMIN/พนักงานของร้านคนอื่นไม่นับ */
export async function ownsAnyShop(ownerId: string): Promise<boolean> {
  const shop = await prisma.shop.findFirst({
    where: { userId: ownerId, deletedAt: null, purgedAt: null },
    select: { id: true },
  })
  return shop !== null
}

export type ReportAccess =
  | { kind: 'ANON' }
  | { kind: 'NOT_OWNER'; userId: string }
  | { kind: 'LOCKED'; userId: string; reason: 'NEVER' | 'RENEWAL_FAILED' }
  | { kind: 'OK'; userId: string }

export async function resolveReportAccess(session: unknown): Promise<ReportAccess> {
  const userId = sessionUserId(session)
  if (!userId) return { kind: 'ANON' }
  if (!(await ownsAnyShop(userId))) return { kind: 'NOT_OWNER', userId }
  let sub: Awaited<ReturnType<typeof getSubscriptionStatus>>
  try {
    sub = await getSubscriptionStatus(userId)
  } catch {
    // fail-closed: อ่านไม่ได้ = ล็อก (ใช้ NEVER = CTA กลาง "ดูแพ็กเกจ")
    return { kind: 'LOCKED', userId, reason: 'NEVER' }
  }
  if (!sub) return { kind: 'LOCKED', userId, reason: 'NEVER' }
  if (sub.status !== 'ACTIVE') return { kind: 'LOCKED', userId, reason: 'RENEWAL_FAILED' }
  return { kind: 'OK', userId }
}

/** แปลงผล resolveReportAccess เป็น userId หรือ throw ตาม level — ให้ `requireReportAccess` ของ route เรียก */
export function assertReportAccess(access: ReportAccess, level: 'READ' | 'PAID'): string {
  if (access.kind === 'ANON') throw new LineReportError('UNAUTHORIZED')
  if (access.kind === 'NOT_OWNER') throw new LineReportError('NOT_OWNER')
  if (access.kind === 'LOCKED' && level === 'PAID') throw new LineReportError('PACKAGE_REQUIRED')
  return access.userId
}

export async function requireReportAccess(session: unknown, level: 'READ' | 'PAID'): Promise<string> {
  return assertReportAccess(await resolveReportAccess(session), level)
}

/** จุดแจ้งเมนู: กลุ่มของเจ้าของที่มีแจ้งเตือนและยังไม่รับทราบ (TFR-22) */
export async function countUnackedAlerts(ownerId: string): Promise<number> {
  return prisma.lineReportGroup.count({
    where: { ownerId, status: { not: 'REMOVED' }, alertKind: { not: null }, alertAckAt: null },
  })
}
