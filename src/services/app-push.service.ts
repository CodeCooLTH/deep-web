import { prisma } from '@/lib/prisma'
import { sendExpoPush, sendExpoPushWithStatus, isExpoToken, type PushSound } from '@/lib/expo-push'

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
  /** subtitle = บรรทัดกลาง — iOS เป็นบรรทัดแยก · Android ยกไปนำหน้า body (composeForPlatform) */
  options?: { subtitle?: string; sound?: PushSound },
): Promise<void> {
  await pushToUsersWithStatus(userIds, title, body, data, options)
}

/**
 * เหมือน pushToUsers แต่คืนสถานะ (00066 TD-FU-4) — ไม่ throw
 * NO_TOKEN = ไม่มีอุปกรณ์ที่ส่งได้ (ไม่มีแถว/ไม่มี token รูป Expo) · FAILED = DB/Expo ล้ม · SENT = Expo รับคำขอ (res.ok)
 */
export async function pushToUsersWithStatus(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
  options?: { subtitle?: string; sound?: PushSound },
): Promise<'SENT' | 'NO_TOKEN' | 'FAILED'> {
  if (userIds.length === 0) return 'NO_TOKEN'
  try {
    const rows = await prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      // platform ต้องมาด้วย — Android ไม่มีบรรทัด subtitle ต้องประกอบข้อความต่างจาก iOS
      select: { token: true, platform: true },
    })
    const tokens = rows.filter((r) => isExpoToken(r.token))
    if (tokens.length === 0) return 'NO_TOKEN'
    const { invalid, delivered } = await sendExpoPushWithStatus(tokens, title, body, data, options)
    if (invalid.length > 0) {
      await prisma.pushToken.deleteMany({ where: { token: { in: invalid } } })
    }
    return delivered ? 'SENT' : 'FAILED'
  } catch (e) {
    console.error('[app-push] pushToUsers failed', e)
    return 'FAILED'
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
    const rows = await prisma.pushToken.findMany({ where: { userId }, select: { token: true, platform: true } })
    if (rows.length === 0) return
    const invalid = await sendExpoPush(
      rows,
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
