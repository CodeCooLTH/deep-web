import { Prisma } from '@prisma/client'
// ไฟล์นี้เดิมรับแต่ TransactionClient (findOrCreateCustomer ถูกเรียกในธุรกรรมเสมอ)
// getCancellationSummary เป็น read นอกธุรกรรม จึงต้องใช้ client ปกติ
import { prisma } from '@/lib/prisma'
import { CANCEL_REASON_KEYS, cancelReasonCountsAgainstGuest } from '@/lib/lodging'

// derive จาก SSOT ไม่ hardcode รายการซ้ำ — ถ้าเพิ่ม/แก้เหตุผลใน lodging.ts ที่นี่ตามอัตโนมัติ
const GUEST_FAULT_CANCEL_REASONS = CANCEL_REASON_KEYS.filter(cancelReasonCountsAgainstGuest)

/**
 * findOrCreateCustomer (feat 00014) — dedup ลูกค้าด้วย phone (unique global) → คืน customerId.
 * เจอ = ใช้ id เดิม (cross-shop identity); ไม่เจอ = สร้างใหม่. P2002-safe (concurrent create race → re-find).
 * ⚠️ phone ต้อง normalize (src/lib/phone.ts) มาก่อนเสมอ. เรียกใน $transaction (ใช้ tx เดียวกับ order.create).
 */
export async function findOrCreateCustomer(
  tx: Prisma.TransactionClient,
  phone: string,
): Promise<string> {
  const existing = await tx.customer.findUnique({ where: { phone }, select: { id: true } })
  if (existing) return existing.id
  try {
    const created = await tx.customer.create({ data: { phone }, select: { id: true } })
    return created.id
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const again = await tx.customer.findUnique({ where: { phone }, select: { id: true } })
      if (again) return again.id
    }
    throw e
  }
}

/**
 * getCancellationSummary — ประวัติการยกเลิกที่เป็นความผิดของผู้จอง (feature 00017, BR-LODG-38)
 *
 * IMPORTANT: คำนวณสดจาก Order ทุกครั้ง ไม่มี counter แบบ denormalized (TD-005)
 * counter ที่พลาดแม้ครั้งเดียวจะเพี้ยนถาวร และตัวเลขนี้ถูกใช้ตัดสินใจทางธุรกิจจึงต้องถูกเสมอ
 * ปริมาณข้อมูลต่อลูกค้าอยู่ระดับหลักสิบ + มี index (customerId, status) จึงเบาพอ
 *
 * 🛑 ความเป็นส่วนตัว (BR-LODG-39): คืนเฉพาะ "จำนวนครั้ง" เท่านั้น
 * ห้ามคืน shopId / ชื่อร้าน / วันที่ / publicToken หรือรายละเอียดการจองของร้านอื่นเด็ดขาด
 * — ตัวเลขข้ามร้านใช้เตือนได้ แต่ต้องไม่เปิดเผยว่าเกิดที่ร้านไหน
 */
export async function getCancellationSummary(customerId: string): Promise<{
  total: number
  byReason: Record<string, number>
}> {
  const rows = await prisma.order.groupBy({
    by: ['cancelReason'],
    where: {
      customerId,
      status: 'CANCELLED',
      // นับเฉพาะเหตุผลที่เป็นความผิดผู้จอง — ร้านยกเลิกเองต้องไม่ทำให้ผู้จองติดประวัติ
      // (BR-LODG-37; SSOT ของการแบ่งคือ countsAgainstGuest ใน src/lib/lodging.ts)
      cancelReason: { in: GUEST_FAULT_CANCEL_REASONS },
    },
    _count: { _all: true },
  })

  const byReason: Record<string, number> = {}
  let total = 0
  for (const r of rows) {
    if (!r.cancelReason) continue
    byReason[r.cancelReason] = r._count._all
    total += r._count._all
  }
  return { total, byReason }
}
