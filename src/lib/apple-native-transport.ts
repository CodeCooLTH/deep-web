'use client'

/**
 * apple-native-transport — ต่อ `apple-native-client` เข้ากับ `window` จริง
 * (feature 00040 · ภาคผนวก 7)
 *
 * รับ `window` เข้ามาทางพารามิเตอร์ ไม่อ้างของโลกตรง ๆ ⇒ เทสได้ใน node และ **บังคับให้โค้ด
 * ทำงานได้ตอนไม่มี window** ซึ่งเกิดจริงทุกครั้งที่ Next render บนเซิร์ฟเวอร์
 *
 * ทิศทางการคุยกันยึดตามของเดิมที่ `iap-transport.ts` กับ `SellerWebView` ใช้อยู่แล้ว:
 *   เว็บ → แอป : `ReactNativeWebView.postMessage(JSON)` · แอปกรองด้วย allow-list ตาม `type`
 *   แอป → เว็บ : ตั้งค่าลง `window` แล้วยิง event
 */
import {
  APPLE_RESULT_EVENT,
  CAP_APPLE_SIGNIN,
  NATIVE_CAPS_EVENT,
  type AppleSignInRequest,
} from '@/lib/apple-bridge-protocol'
import type { AppleNativeTransport } from '@/lib/apple-native-client'

type AppleWindow = Window & {
  /** native ฝากคำตอบล่าสุดไว้ที่นี่ก่อนยิง event */
  __DEEP_APPLE_RESULT__?: unknown
  /** ความสามารถที่เปลือกรุ่นนี้มี — บิลด์เก่าไม่มีตัวแปรนี้เลย */
  __DEEP_NATIVE_CAPS__?: unknown
  ReactNativeWebView?: { postMessage: (msg: string) => void }
}

/**
 * เปลือกรุ่นนี้เปิดแผ่น Sign in with Apple ของระบบได้ไหม
 *
 * 🛑 **นี่คือตัวกรองหลักที่ทำให้แอปรุ่นเก่าไม่พัง** — บิลด์ที่ปล่อยไปก่อนรอบนี้ไม่มีโมดูล
 * native และจะเมินข้อความเราเงียบ ๆ ⇒ ต้องรู้ให้ได้ *ก่อนกด* ว่าจะสั่ง native หรือถอย
 * ไปทางเว็บ ไม่ใช่สั่งไปแล้วรอจนหมดเวลา (ผู้ใช้จะเห็นปุ่มหมุนห้านาทีโดยไม่มีเหตุผล)
 *
 * `false` ทั้งในเบราว์เซอร์ปกติและตอน render บนเซิร์ฟเวอร์ — ทั้งสองกรณีต้องใช้ทางเว็บ
 */
export function nativeSupportsAppleSignIn(win: Window | undefined): boolean {
  const w = win as AppleWindow | undefined
  if (!w?.ReactNativeWebView) return false
  const caps = w.__DEEP_NATIVE_CAPS__
  return Array.isArray(caps) && caps.includes(CAP_APPLE_SIGNIN)
}

/**
 * ติดตามความสามารถที่ native ประกาศ — คืน cleanup
 *
 * ต้องมี event ไม่ใช่อ่านครั้งเดียวตอน mount: native ตั้งค่าผ่าน `injectJavaScript` ซึ่งรัน
 * "หลังหน้าโหลดเสร็จ" ซึ่งอาจช้ากว่าที่ React hydrate เสร็จ ⇒ ปุ่มที่อ่านครั้งเดียวจะสรุปว่า
 * "ไม่รองรับ" แล้วถอยไปทางเว็บทุกครั้ง ทั้งที่เปลือกทำได้ — คือบั๊กที่ Apple ตีกลับพอดี
 * (บทเรียนตัวเดียวกับ `__DEEP_PUSH_PERMISSION__` ที่ `native-bridge.ts` เขียนเตือนไว้แล้ว)
 */
export function subscribeNativeCaps(
  win: Window | undefined,
  onChange: (supported: boolean) => void,
): () => void {
  if (!win) return () => {}
  const handler = () => onChange(nativeSupportsAppleSignIn(win))
  win.addEventListener(NATIVE_CAPS_EVENT, handler)
  return () => win.removeEventListener(NATIVE_CAPS_EVENT, handler)
}

/**
 * `null` = สั่ง native ไม่ได้ (ไม่ได้อยู่ในแอป หรือเปลือกรุ่นเก่า)
 *
 * ตัวเรียกจะแปลง null เป็น `UNAVAILABLE` ทันทีโดยไม่ต้องรอหมดเวลา
 */
export function createWindowAppleTransport(win: Window | undefined): AppleNativeTransport | null {
  const w = win as AppleWindow | undefined
  if (!nativeSupportsAppleSignIn(win)) return null

  return {
    post: (msg: AppleSignInRequest) => {
      try {
        w?.ReactNativeWebView?.postMessage(JSON.stringify(msg))
      } catch {
        /* WebView อาจหายไประหว่างทาง (ผู้ใช้ปิดแอป/หน้าเปลี่ยน) — ปล่อยให้ timeout ของ
           ตัวเรียกเป็นคนจบเรื่อง ดีกว่าโยน error ขึ้นไปทำให้ทั้งหน้าพัง */
      }
    },
    subscribe: (onRaw) => {
      /* 🛑 อ่านค่าตอน event ยิง ไม่ใช่ตอน subscribe — native ตั้งค่าลง window **แล้วค่อย**
         ยิง event ถ้าอ่านตอน subscribe จะได้ค่าของคำขอครั้งก่อน (หรือ undefined) ตลอดกาล */
      const handler = () => onRaw((w as AppleWindow).__DEEP_APPLE_RESULT__)
      w!.addEventListener(APPLE_RESULT_EVENT, handler)
      return () => w!.removeEventListener(APPLE_RESULT_EVENT, handler)
    },
  }
}
