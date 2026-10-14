'use client'

/**
 * native-bridge — ช่องทางคุยกับเปลือก native ของ deep-seller-app จากในหน้าเว็บ
 *
 * แอปผู้ขายเป็น WebView-first: หน้าเว็บชุดเดียวกันถูกเปิดทั้งในเบราว์เซอร์ปกติและในแอป
 * ไฟล์นี้จึงต้อง **ทำงานได้ทั้งสองที่** — ในเบราว์เซอร์ทุกฟังก์ชันต้องเงียบและไม่พัง
 *
 * `window.__DEEP_PUSH_TOKEN__` (SellerWebView ฝากไว้) เคยถูกอ่านตรง ๆ ใน SignOutCard กับ
 * DeleteAccountCard **โดยก็อปโค้ดชุดเดียวกันไว้ทั้งสองไฟล์** — ย้ายมารวมที่นี่ 2026-09-25
 * ตอนพบว่ามีทางออกจากระบบ **7 ทาง** แต่ถอน token จริงแค่ 2 ทาง (ดู `revokeDevicePushToken`)
 */

/** ตรงกับ Notifications.getPermissionsAsync().status ของ expo-notifications */
export type PushPermission = 'granted' | 'denied' | 'undetermined'

type NativeWindow = Window & {
  __DEEP_PUSH_PERMISSION__?: string
  /** token ที่ SellerWebView ฝากไว้ให้เว็บถอนตอนออกจากระบบ */
  __DEEP_PUSH_TOKEN__?: string
  ReactNativeWebView?: { postMessage: (msg: string) => void }
  /** ความสามารถ native ที่ build นี้มี — SellerWebView ตั้งก่อนหน้าโหลด (build เก่าไม่มี) */
  __DEEP_NATIVE_FEATURES__?: unknown
}

/**
 * แอปยิงแจ้งเตือนตัวอย่างให้ฟังเสียงได้ (deep-seller-app 1.0.2 build 17 ขึ้นไป · 2026-10-10)
 * 🛑 ต้องตรงกับ `SOUND_PREVIEW_FEATURE` ใน deep-seller-app `src/core/push/sound-preview.ts`
 */
export const NATIVE_FEATURE_SOUND_PREVIEW = 'sound-preview'

/** แอป build นี้มีความสามารถนั้นไหม — เบราว์เซอร์ปกติ / build เก่า = false */
export function hasNativeFeature(name: string): boolean {
  if (typeof window === 'undefined') return false
  const list = (window as NativeWindow).__DEEP_NATIVE_FEATURES__
  return Array.isArray(list) && list.includes(name)
}

/**
 * ขอให้แอปยิงแจ้งเตือนตัวอย่างด้วยเสียงที่เลือก — ได้ยินเหมือนตอนแชทเข้าจริง
 * (ไฟล์เสียงในแอป + ระดับเสียงแจ้งเตือนของเครื่อง) · ไม่อยู่ในแอป = ไม่ทำอะไร
 * 🛑 type ต้องตรงกับ `PREVIEW_SOUND_TYPE` ฝั่งแอป
 */
export function previewNativePushSound(sound: 'chat' | 'default'): void {
  if (typeof window === 'undefined') return
  const bridge = (window as NativeWindow).ReactNativeWebView
  if (!bridge) return
  try {
    bridge.postMessage(JSON.stringify({ type: 'deep:preview-push-sound', sound }))
  } catch {
    // postMessage พัง = ปุ่มไม่มีเสียง ไม่ใช่เหตุให้หน้าพัง
  }
}

/**
 * ปุ่ม "ฟังเสียง" ควรทำอะไร กับเสียงที่เลือกอยู่
 *   - native   : แอปยิงแจ้งเตือนตัวอย่าง (ตรงกับของจริงที่สุด)
 *   - web      : เล่นไฟล์ในหน้าเว็บ (เบราว์เซอร์ / แอป build เก่า — ได้เฉพาะเสียงแชท)
 *   - denied   : อยู่ในแอปแต่ปิดสิทธิ์แจ้งเตือน ⇒ ไม่มีเสียงอะไรดังได้ ต้องบอกผู้ใช้
 *   - none     : เสียงของเครื่องฟังจากเว็บไม่ได้ ⇒ ปิดปุ่ม
 */
export function resolveSoundPreview(input: {
  sound: 'chat' | 'default'
  nativePreview: boolean
  permission: PushPermission | null
}): 'native' | 'web' | 'denied' | 'none' {
  if (input.nativePreview) return input.permission === 'denied' ? 'denied' : 'native'
  return input.sound === 'chat' ? 'web' : 'none'
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

/** เพดานเวลารอถอน token — เน็ตช้าต้องไม่ทำให้ "ออกจากระบบ" ค้าง */
const REVOKE_TIMEOUT_MS = 2000

/**
 * ถอน push token ของ **เครื่องนี้** ออกจากบัญชีที่ล็อกอินอยู่
 *
 * ## 🛑 ไม่ถอน = เครื่องนั้นยังได้แจ้งเตือนของบัญชีเดิมต่อไปเรื่อย ๆ
 *
 * แอปผู้ขายลงทะเบียน Expo push token ผูกกับบัญชีที่ล็อกอินอยู่ ⇒ ออกจากระบบแล้วไม่ถอน
 * **คนถัดไปที่หยิบเครื่อง (หรือพนักงานที่ลาออก) จะเห็นแชทลูกค้าที่ไม่ใช่ของตัวเองบนจอล็อก**
 *
 * ## 🛑 ทำไมย้ายมาอยู่ที่นี่ (2026-09-25)
 *
 * โค้ดชุดนี้เคยถูกก็อปไว้ใน `SignOutCard` กับ `DeleteAccountCard` ⇒ ทางออกจากระบบอีก **5 ทาง**
 * ไม่เคยถอน token เลย รวมทั้ง **ดรอปดาวน์มุมขวาบน** กับ **เมนูในแถบข้าง** ซึ่งเป็นทางที่
 * ผู้ใช้จริงใช้บ่อยที่สุด · `signOutSeller` ประกาศตัวเองว่า "ล้างของที่ค้างให้ครบ" มาตั้งแต่ต้น
 * แต่ของชิ้นนี้ถูกทิ้งไว้ข้างนอก (Hard Rule 16 — ปล่อยให้แต่ละที่เขียนเอง จะมีที่ที่ลืมเสมอ)
 *
 * 🛑 ต้องเรียก **ก่อน** `signOut()` เสมอ — endpoint นี้ auth ด้วยคุกกี้ session
 * ถ้าเรียกหลังคุกกี้ถูกล้างจะได้ 401 แล้ว token ค้างอยู่ในฐานตลอดไป
 *
 * 🛑 ล้มก็ต้องไปต่อ — ผู้ใช้กดออกจากระบบแล้วต้องได้ออกเสมอ ยอมให้ token ค้างดีกว่าค้างอยู่
 * ในระบบที่ตั้งใจจะออก · ไม่ได้อยู่ในแอป (เบราว์เซอร์ปกติ) = ไม่มี token ⇒ ข้ามไปเงียบ ๆ
 */
export async function revokeDevicePushToken(): Promise<void> {
  if (typeof window === 'undefined') return
  const token = (window as NativeWindow).__DEEP_PUSH_TOKEN__
  if (!token) return
  try {
    await Promise.race([
      fetch('/api/seller/push-token', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }),
      new Promise((resolve) => setTimeout(resolve, REVOKE_TIMEOUT_MS)),
    ])
  } catch {
    /* เงียบโดยตั้งใจ — ดูเหตุผลหัวฟังก์ชัน */
  }
}

/**
 * แอปมีช่องแจ้งเตือน Android `chat_silent` (แชทใหม่แบบไม่มีเสียง) — 00018 ส่วนขยาย 2026-10-14
 * 🛑 ต้องตรงกับ `SILENT_CHAT_CHANNEL_FEATURE` ใน deep-seller-app `src/core/push/notifications.ts`
 */
export const NATIVE_FEATURE_SILENT_CHAT_CHANNEL = 'silent-chat-channel'

/**
 * ค่า "ปิดเสียงแจ้งเตือนแชทใหม่" ที่จะบอกเซิร์ฟเวอร์สำหรับเครื่องนี้ — ตรรกะล้วน (มีเทส)
 *
 * iOS: ตามปุ่มเสมอ (push ที่ไม่มี `sound` = เงียบ · ใช้ได้ทุกรุ่นของแอป)
 * Android: ตามปุ่มได้ก็ต่อเมื่อแอปมีช่อง `chat_silent` — รุ่นเก่าไม่มีช่องนี้ ถ้าบอกเซิร์ฟเวอร์ว่า "ปิด"
 * push จะถูกส่งเข้าช่องที่ไม่มีอยู่ แล้วแจ้งเตือนอาจไม่ขึ้นเลย ⇒ **ยอมให้ยังมีเสียงดีกว่าให้แชทหาย**
 * (ส่ง false ไม่ใช่ข้ามการส่ง — ล้างค่าที่อาจค้างอยู่ให้ตรงกับที่เครื่องทำได้จริง)
 */
export function resolveDeviceChatMute(input: {
  muted: boolean
  isAndroid: boolean
  hasSilentChannel: boolean
}): boolean {
  if (!input.muted) return false
  return input.isAndroid ? input.hasSilentChannel : true
}

/**
 * บอกเซิร์ฟเวอร์ว่าปุ่มลำโพงหน้าแชทของ **เครื่องนี้** เปิด/ปิดอยู่ ⇒ แจ้งเตือนแชทใหม่ที่เด้งบนเครื่องนี้
 * มี/ไม่มีเสียงตามปุ่ม (00018 ส่วนขยาย 2026-10-14)
 *
 * - ไม่ได้อยู่ในแอป (ไม่มี `__DEEP_PUSH_TOKEN__`) ⇒ ไม่ทำอะไร: คอม/เบราว์เซอร์ไม่มีแจ้งเตือนเด้ง
 * - **ค่าใน localStorage คือตัวจริง** ⇒ ผู้เรียกส่งซ้ำได้ทุกเมื่อ (เปิดหน้าแชท / แอปฝาก token ทีหลัง)
 *   แก้ทุกกรณีที่ค่าไม่ตรง: กดตอนเน็ตหลุด · กดไว้ก่อนฟีเจอร์นี้ขึ้น · token ถูกสร้างใหม่
 * - ล้มเงียบ: ปุ่มเปลี่ยนสถานะทันทีเสมอ ไม่รอเน็ต (รอบหน้าที่เปิดหน้าแชทจะส่งให้อีก)
 */
export function syncDeviceChatMute(muted: boolean): void {
  if (typeof window === 'undefined') return
  const token = (window as NativeWindow).__DEEP_PUSH_TOKEN__
  if (!token) return
  const chatSoundMuted = resolveDeviceChatMute({
    muted,
    isAndroid: /Android/i.test(window.navigator.userAgent),
    hasSilentChannel: hasNativeFeature(NATIVE_FEATURE_SILENT_CHAT_CHANNEL),
  })
  try {
    void fetch('/api/seller/push-token', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, chatSoundMuted }),
    }).catch(() => {})
  } catch {
    /* เงียบโดยตั้งใจ — ดูหัวฟังก์ชัน */
  }
}
