/**
 * account-name.service.ts — ตั้งชื่อบัญชีใหม่จากชื่อลูกค้าที่ร้านบริการกรอกไว้ในงาน (feature 00073 · BRD FR-009)
 *
 * ลูกค้าร้านบริการส่วนใหญ่เข้ามาครั้งแรกจากลิงก์งาน → ยืนยันด้วย OTP → ได้บัญชีอัตโนมัติชื่อ `User_1234`
 * ทั้งที่ร้านรู้ชื่อเขาอยู่แล้ว (Order.buyerName) — ชื่อนี้ไปโผล่ที่แชท/รีวิว/หน้าโปรไฟล์ร้านเป็นรหัสว่าง ๆ
 *
 * 🛑 กติกา (ร้านบริการเท่านั้น):
 *   - แตะเฉพาะบัญชีที่ชื่อยังเป็นชื่อที่ระบบตั้ง (`isPlaceholderAccountName`) — ไม่ทับชื่อที่ผู้ใช้ตั้งเอง
 *   - ใช้ชื่อจากงานล่าสุดของ **ร้านบริการ** ที่ผูกกับบัญชีนี้แล้ว — ร้านประเภทอื่นไม่ใช้ (มติ: แก้แค่ร้านบริการ)
 *   - best-effort: ล้มแล้วต้องไม่ทำให้การเข้าสู่ระบบล้ม (ผู้เรียกครอบ try/catch เอง)
 */
import { prisma } from '@/lib/prisma'
import { isPlaceholderAccountName } from '@/lib/buyer-name'

/** เพดานความยาวชื่อแสดง — ชื่อที่ร้านพิมพ์ยาวผิดปกติไม่ควรกลายเป็นชื่อบัญชีทั้งก้อน */
const MAX_NAME = 60

export async function nameAccountFromServiceJob(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } })
  if (!user || !isPlaceholderAccountName(user.displayName)) return null

  const job = await prisma.order.findFirst({
    where: {
      buyerUserId: userId,
      buyerName: { not: null },
      shop: { vertical: 'SERVICE_QUEUE' },
    },
    orderBy: { createdAt: 'desc' },
    select: { buyerName: true },
  })
  const name = job?.buyerName?.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
  if (!name || isPlaceholderAccountName(name)) return null

  // updateMany + เงื่อนไขชื่อเดิมใน where = ไม่ทับชื่อที่ผู้ใช้เพิ่งตั้งเองระหว่างทาง
  const res = await prisma.user.updateMany({
    where: { id: userId, displayName: user.displayName },
    data: { displayName: name },
  })
  return res.count > 0 ? name : null
}
