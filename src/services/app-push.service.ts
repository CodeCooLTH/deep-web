import { prisma } from '@/lib/prisma'
import { sendExpoPush } from '@/lib/expo-push'

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
