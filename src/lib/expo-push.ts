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
   * 🛑 Android ไม่มีบรรทัดนี้ — ห้ามส่ง subtitle ไปเครื่อง Android ตรง ๆ (หายเงียบ ๆ ไม่ error)
   * ประกอบข้อความรายเครื่องผ่าน `composeForPlatform()` เสมอ (อ่าน `PushToken.platform`)
   */
  subtitle?: string
  body: string
  data?: Record<string, unknown>
  sound?: string
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

export const isExpoToken = (t: string) => t.startsWith('ExponentPushToken') || t.startsWith('ExpoPushToken')

/** ผู้รับหนึ่งเครื่อง — สตริงเปล่า = ไม่รู้ platform (ถือเป็น iOS ดู composeForPlatform) */
export type PushTarget = string | { token: string; platform?: string | null }

/**
 * เสียงแจ้งเตือน — ชุดที่แอปผู้ขายรู้จัก (2026-10-09 · user เลือก: แอปผู้ขาย · เฉพาะแชทใหม่)
 *
 * - `default` = เสียงมาตรฐานของเครื่อง · Android channel `default`
 * - `chat`    = เสียงแชทเดียวกับที่ดังในเว็บ (`public/sounds/sound-new-chat-msg.m4a`) แปลงเป็น
 *               `new_chat_message.wav` แล้วฝังในแอปผู้ขาย (deep-seller-app `assets/sounds/`)
 *               · iOS เล่นตามชื่อไฟล์ใน payload · Android เล่นตาม channel `chat` ที่แอปสร้างไว้
 *
 * 🛑 ชื่อไฟล์และชื่อ channel ต้องตรงกับแอปผู้ขายทุกตัวอักษร (`src/core/push/notifications.ts`)
 * 🛑 เครื่องที่ยังไม่อัปเดตแอป: iOS หาไฟล์ไม่เจอ → เล่นเสียงมาตรฐานแทน (ไม่พัง)
 * 🛑 `PushToken` ไม่ได้เก็บว่าเป็นแอปผู้ขายหรือผู้ซื้อ ⇒ ผู้ขายที่ล็อกอินแอปผู้ซื้อด้วย จะได้ payload นี้ที่แอปผู้ซื้อด้วย
 *    iOS: แอปผู้ซื้อไม่มีไฟล์ → เสียงมาตรฐาน · Android: แอปผู้ซื้อต้องมี channel `chat` ก่อนปล่อย Android
 *    (ทั้งสองแอปยังไม่ปล่อย Android ณ วันที่เขียน)
 */
export type PushSound = 'default' | 'chat'
const PUSH_SOUNDS: Record<PushSound, { sound: string; channelId: string }> = {
  default: { sound: 'default', channelId: 'default' },
  chat: { sound: 'new_chat_message.wav', channelId: 'chat' },
}
export function resolvePushSound(sound: PushSound | undefined): { sound: string; channelId: string } {
  return PUSH_SOUNDS[sound ?? 'default']
}

type PushLines = { title: string; subtitle?: string; body: string }

/**
 * ประกอบ 3 บรรทัด (หัวเรื่อง / บรรทัดกลาง / เนื้อหา) ให้เข้ากับเครื่องปลายทาง
 *
 * iOS แสดง `subtitle` เป็นบรรทัดของตัวเอง · **Android ไม่มีบรรทัดนี้เลย** และ Expo ไม่ error
 * ⇒ ถ้าส่งชุดเดียวกัน Android เสียบรรทัดกลางไปเงียบ ๆ (แชทผู้ขาย = เสีย "ใครทัก")
 * Android จึงยกบรรทัดกลางไปนำหน้าเนื้อหาเป็น `ชื่อ: ข้อความ` — รูปที่แอปแชทบน Android ใช้กันเป็นปกติ
 * และคงลำดับ เพจ → คนส่ง → ข้อความ ที่ user กำหนดไว้ (2026-08-08)
 *
 * 🛑 platform ไม่รู้ (null) = iOS: แถวก่อนมีคอลัมน์นี้มาจากแอปที่ปล่อยแค่ iOS ทั้งหมด
 * และแอป Android ส่ง `platform:'android'` ตั้งแต่บิลด์แรก (SellerWebView.registerPushToken)
 */
export function composeForPlatform(platform: string | null | undefined, lines: PushLines): PushLines {
  if (platform !== 'android') return lines
  const sub = lines.subtitle?.trim()
  return { title: lines.title, body: sub ? `${sub}: ${lines.body}` : lines.body }
}

/**
 * ส่ง push แบบคืนสถานะ (00066 TD-FU-4) — `delivered` = Expo รับคำขอ (`res.ok`) ไม่ใช่ "ถึงเครื่อง"
 * ไม่มี token ที่ใช้ได้ / fetch ล้ม / HTTP ไม่ ok → delivered=false (ไม่ throw)
 */
export async function sendExpoPushWithStatus(
  tokens: PushTarget[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
  options?: { subtitle?: string; sound?: PushSound },
): Promise<{ invalid: string[]; delivered: boolean }> {
  const tone = resolvePushSound(options?.sound)
  const targets = tokens
    .map((t) => (typeof t === 'string' ? { token: t, platform: null } : t))
    .filter((t) => isExpoToken(t.token))
  const valid = targets.map((t) => t.token)
  if (valid.length === 0) return { invalid: [], delivered: false }
  const messages: ExpoMessage[] = targets.map((t) => {
    const lines = composeForPlatform(t.platform, { title, subtitle: options?.subtitle, body })
    return {
      to: t.token,
      title: lines.title,
      // undefined ถูก JSON.stringify ตัดทิ้งอยู่แล้ว — ไม่ต้อง spread แบบมีเงื่อนไขให้อ่านยาก
      subtitle: lines.subtitle,
      body: lines.body,
      data,
      sound: tone.sound,
      priority: 'high',
      channelId: tone.channelId,
    }
  })
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
    return { invalid, delivered: res.ok === true }
  } catch (e) {
    console.error('[expo-push] send failed', e)
    return { invalid: [], delivered: false }
  }
}

/** ส่ง push → คืน list ของ token ที่ "เสีย" (DeviceNotRegistered) ให้ caller ลบทิ้ง — wrapper ของ WithStatus */
export async function sendExpoPush(
  tokens: PushTarget[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
  options?: { subtitle?: string; sound?: PushSound },
): Promise<string[]> {
  return (await sendExpoPushWithStatus(tokens, title, body, data, options)).invalid
}
