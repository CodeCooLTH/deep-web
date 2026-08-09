'use client'

/**
 * native-bridge — ช่องทางคุยกับเปลือก native ของ deep-seller-app จากในหน้าเว็บ
 *
 * แอปผู้ขายเป็น WebView-first: หน้าเว็บชุดเดียวกันถูกเปิดทั้งในเบราว์เซอร์ปกติและในแอป
 * ไฟล์นี้จึงต้อง **ทำงานได้ทั้งสองที่** — ในเบราว์เซอร์ทุกฟังก์ชันต้องเงียบและไม่พัง
 *
 * ของที่มีอยู่ก่อนไฟล์นี้: `window.__DEEP_PUSH_TOKEN__` (SellerWebView ฝากไว้ให้เว็บถอน token
 * ตอนออกจากระบบ) — SignOutCard/DeleteAccountCard อ่านตรง ๆ อยู่ ไม่ได้ย้ายมาที่นี่เพื่อลดผิว
 * การเปลี่ยนแปลง; ของใหม่ทั้งหมดรวมไว้ที่นี่ที่เดียว
 */

/** ตรงกับ Notifications.getPermissionsAsync().status ของ expo-notifications */
export type PushPermission = 'granted' | 'denied' | 'undetermined'

type NativeWindow = Window & {
  __DEEP_PUSH_PERMISSION__?: string
  ReactNativeWebView?: { postMessage: (msg: string) => void }
}

/** ชื่อ event ที่ native ยิงหลังตั้งค่า __DEEP_PUSH_PERMISSION__ — ต้องตรงกับฝั่งแอป */
const PERMISSION_EVENT = 'deep:push-permission'

function isPermission(v: unknown): v is PushPermission {
  return v === 'granted' || v === 'denied' || v === 'undetermined'
}

/**
 * สิทธิ์แจ้งเตือนระดับเครื่อง — `null` เมื่อ "ไม่ได้เปิดอยู่ในแอป"
 *
 * 🛑 null กับ 'denied' ต้องแยกกันให้ขาด: บนเบราว์เซอร์เดสก์ท็อปค่านี้จะเป็น null เสมอ ซึ่ง
 * **ไม่ได้แปลว่าถูกปิด** — ถ้าเอาไปแสดงเป็น "ถูกปิดอยู่" ผู้ใช้เดสก์ท็อปทุกคนจะเห็นคำเตือนที่
 * ไม่จริงและไปกดหาการตั้งค่าที่ไม่มีอยู่
 */
export function readPushPermission(): PushPermission | null {
  if (typeof window === 'undefined') return null
  const raw = (window as NativeWindow).__DEEP_PUSH_PERMISSION__
  return isPermission(raw) ? raw : null
}

/**
 * ติดตามค่าที่ native ตั้งให้ — คืน cleanup
 *
 * ทำไมต้องมี event ไม่ใช่แค่อ่านตอน mount: native ตั้งค่านี้ผ่าน injectJavaScript ซึ่งรัน
 * "หลังหน้าโหลดเสร็จ" (onNavigationStateChange) — React อาจ hydrate เสร็จก่อนหน้านั้น
 * ถ้าอ่านครั้งเดียวตอน mount จะได้ null แล้วแถบเตือนไม่มีวันโผล่เลยแม้สิทธิ์จะถูกปิดอยู่จริง
 */
export function subscribePushPermission(onChange: (p: PushPermission | null) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = () => onChange(readPushPermission())
  window.addEventListener(PERMISSION_EVENT, handler)
  return () => window.removeEventListener(PERMISSION_EVENT, handler)
}

/**
 * ขอให้แอปเปิดหน้าตั้งค่าแจ้งเตือนของระบบให้
 *
 * ต้องให้ native เป็นคนเปิด — เว็บเปิด `app-settings:` เองไม่ได้ (WKWebView บล็อก scheme นี้)
 * ไม่ได้อยู่ในแอป = ไม่ทำอะไรเลย (ปุ่มที่เรียกตัวนี้ถูกซ่อนอยู่แล้วเมื่อ readPushPermission() เป็น null)
 */
export function openNativeNotificationSettings(): void {
  if (typeof window === 'undefined') return
  const bridge = (window as NativeWindow).ReactNativeWebView
  if (!bridge) return
  try {
    bridge.postMessage(JSON.stringify({ type: 'deep:open-settings' }))
  } catch {
    // postMessage พังไม่ควรทำให้หน้าพัง — อย่างแย่ที่สุดคือปุ่มไม่ตอบสนอง
  }
}
