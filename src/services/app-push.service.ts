import { prisma } from '@/lib/prisma'
import { sendExpoPush } from '@/lib/expo-push'

/**
 * ส่ง push ให้ user "หลายคน" พร้อมกัน — best-effort
 *
 * ต่างจากการวน pushToUser() ทีละคนตรงที่ยุบเหลือ 1 query + 1 HTTP call:
 * เดิมร้านที่มีพนักงาน 4 คน = 4 query หา token + 4 request ไป exp.host เรียงกัน ซึ่งบวก
 * เวลาหน่วงจริงราว 300ms ต่อคน (วัดจาก exp.host = ~330ms/รอบ) → คนสุดท้ายได้ noti ช้ากว่า
 * คนแรกเกินวินาที. Expo Push API รับ array ของข้อความอยู่แล้ว จึงส่งรวดเดียวได้
 *
 * ใช้กับ noti ที่ "ผู้รับหลายคนต้องได้พร้อมกัน" (เช่น ข้อความเข้าร้านที่มีทีมช่วยตอบ)
 */
export async function pushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (userIds.length === 0) return
  try {
    const rows = await prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    })
    if (rows.length === 0) return
    const invalid = await sendExpoPush(
      rows.map((r) => r.token),
      title,
      body,
      data,
    )
    if (invalid.length > 0) {
      await prisma.pushToken.deleteMany({ where: { token: { in: invalid } } })
    }
  } catch (e) {
    console.error('[app-push] pushToUsers failed', e)
  }
}

/** ส่ง push ให้ user คนหนึ่ง (หา token ของทุกอุปกรณ์ → ส่ง) — best-effort */
export async function pushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    const rows = await prisma.pushToken.findMany({ where: { userId }, select: { token: true } })
    if (rows.length === 0) return
    const invalid = await sendExpoPush(
      rows.map((r) => r.token),
      title,
      body,
      data,
    )
    // ลบ token ที่เสีย (DeviceNotRegistered) — receipt handling
    if (invalid.length > 0) {
      await prisma.pushToken.deleteMany({ where: { token: { in: invalid } } })
    }
  } catch (e) {
    console.error('[app-push] pushToUser failed', e)
  }
}
