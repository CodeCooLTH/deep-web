// ส่ง push ผ่าน Expo Push API (https://exp.host/--/api/v2/push/send) — best-effort, ไม่ throw
type ExpoMessage = {
  to: string
  title: string
  /**
   * บรรทัดกลางระหว่างหัวเรื่องกับเนื้อหา — **iOS เท่านั้น** (Android ไม่มีที่แสดง จะเมินทิ้งเงียบ ๆ)
   *
   * ให้ noti มีสามบรรทัดแยกกันได้โดยไม่ต้องยัดสองอย่างรวมในบรรทัดเดียว — ถ้ายัดรวม ชื่อไทยของ
   * ทั้งคู่จะยาวเกินเพดานแล้ว `…` ไปลงตรงส่วนที่ผู้ใช้อยากอ่านพอดี (แชทผู้ขายใช้เป็น
   * ชื่อเพจ / ชื่อคนส่ง / ข้อความ — ดู pushNewChatMessage ใน seller-push.service)
   *
   * 🛑 วันที่ปล่อยแอป Android ต้องประกอบข้อความให้ใหม่ ไม่ใช่ก็อปชุดของ iOS ไปตรง ๆ — ตอนนี้
   * ตาราง PushToken เก็บแค่ userId+token ไม่มี platform จึงแยกรูปแบบรายเครื่องไม่ได้ และสิ่งที่
   * อยู่ใน subtitle จะ **หายไปเงียบ ๆ บน Android** (ไม่ error ไม่ได้แปลว่าไม่มีใครต้องการ)
   */
  subtitle?: string
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
  options?: { subtitle?: string },
): Promise<string[]> {
  const valid = tokens.filter((t) => t.startsWith('ExponentPushToken') || t.startsWith('ExpoPushToken'))
  if (valid.length === 0) return []
  const messages: ExpoMessage[] = valid.map((to) => ({
    to,
    title,
    // undefined ถูก JSON.stringify ตัดทิ้งอยู่แล้ว — ไม่ต้อง spread แบบมีเงื่อนไขให้อ่านยาก
    subtitle: options?.subtitle,
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
