// ส่ง push ผ่าน Expo Push API (https://exp.host/--/api/v2/push/send) — best-effort, ไม่ throw
type ExpoMessage = {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: 'default'
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
  const messages: ExpoMessage[] = valid.map((to) => ({ to, title, body, data, sound: 'default' }))
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
