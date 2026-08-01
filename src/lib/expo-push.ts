// ส่ง push ผ่าน Expo Push API (https://exp.host/--/api/v2/push/send) — best-effort, ไม่ throw
type ExpoMessage = {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: 'default'
  /**
   * 'high' = APNs priority 10 / FCM high — ส่งถึงเครื่อง "ทันที" แม้จอล็อกหรือผู้ใช้อยู่แอปอื่น
   *
   * ค่า default ของ Expo คือ priority 5 ซึ่ง Apple/Google สงวนสิทธิ์หน่วง-รวมกลุ่ม-หรือกลั้นไว้
   * เพื่อประหยัดแบตเตอรี่ (โดยเฉพาะตอนเครื่องอยู่ใน Low Power Mode) — แจ้งเตือนแชทที่มาช้า
   * 10 นาทีเท่ากับไม่มีประโยชน์สำหรับคนขายของ จึงต้องระบุ high เอง
   */
  priority?: 'high'
  /**
   * Android 8+ บังคับให้ทุก notification สังกัด channel และ "ความสำคัญ" ที่ตัดสินว่าจะเด้ง
   * heads-up + มีเสียงไหม อยู่ที่ channel ไม่ใช่ที่ payload
   * 'default' = channel ที่แอปสร้างไว้ตอนขอสิทธิ์ (importance HIGH, ดู notifications.ts)
   * ถ้าไม่ส่ง field นี้ Android จะโยนเข้า channel สำรองที่ importance ต่ำ = ขึ้นเงียบ ๆ ในแถบ
   * บนสุดโดยไม่มีเสียง ผู้ใช้พลาดข้อความ (iOS ไม่สนใจ field นี้)
   */
  channelId?: string
  /** จำนวนบนไอคอนแอป — ให้ผู้ขายเห็นว่ามีของค้างโดยไม่ต้องเปิดแอป */
  badge?: number
}

type ExpoTicket = { status?: string; details?: { error?: string } }

/** ส่ง push → คืน list ของ token ที่ "เสีย" (DeviceNotRegistered) ให้ caller ลบทิ้ง */
export async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<string[]> {
  const valid = tokens.filter((t) => t.startsWith('ExponentPushToken') || t.startsWith('ExpoPushToken'))
  if (valid.length === 0) return []
  const messages: ExpoMessage[] = valid.map((to) => ({
    to,
    title,
    body,
    data,
    sound: 'default',
    priority: 'high',
    channelId: 'default',
  }))
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    })
    const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null
    // ticket เรียงตาม messages — error DeviceNotRegistered = token เสีย ลบได้
    const invalid: string[] = []
    json?.data?.forEach((t, i) => {
      if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' && valid[i]) {
        invalid.push(valid[i])
      }
    })
    return invalid
  } catch (e) {
    console.error('[expo-push] send failed', e)
    return []
  }
}
