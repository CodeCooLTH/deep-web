'use client'

/**
 * iap-transport — ต่อ `iap-client` เข้ากับ `window` จริง (feature 00064)
 *
 * รับ `window` เข้ามาทางพารามิเตอร์ ไม่อ้างของโลกตรง ๆ ⇒ เทสได้ใน node และ **บังคับให้โค้ด
 * ทำงานได้ตอนไม่มี window** ซึ่งเกิดจริงทุกครั้งที่ Next render บนเซิร์ฟเวอร์
 *
 * ทิศทางการคุยกันยึดตามของเดิมที่ `native-bridge.ts` กับ `SellerWebView` ใช้อยู่แล้ว:
 *   เว็บ → แอป : `ReactNativeWebView.postMessage(JSON)` · แอปกรองด้วย allow-list ตาม `type`
 *   แอป → เว็บ : ตั้งค่าลง `window` แล้วยิง event
 */
import { IAP_RESULT_EVENT } from '@/lib/iap-bridge-protocol'
import type { IapTransport } from '@/lib/iap-client'

type IapWindow = Window & {
  /** native ฝากคำตอบล่าสุดไว้ที่นี่ก่อนยิง event */
  __DEEP_IAP_RESULT__?: unknown
  ReactNativeWebView?: { postMessage: (msg: string) => void }
}

/**
 * `null` = ไม่ได้เปิดอยู่ในแอป (เบราว์เซอร์ปกติ หรือกำลัง render บนเซิร์ฟเวอร์)
 *
 * ตัวเรียกจะแปลง null เป็น `UNAVAILABLE` ทันทีโดยไม่ต้องรอหมดเวลา
 */
export function createWindowIapTransport(win: Window | undefined): IapTransport | null {
  const w = win as IapWindow | undefined
  if (!w?.ReactNativeWebView) return null

  return {
    post: (msg) => {
      try {
        w.ReactNativeWebView?.postMessage(JSON.stringify(msg))
      } catch {
        /* WebView อาจหายไประหว่างทาง (ผู้ใช้ปิดแอป/หน้าเปลี่ยน) — ปล่อยให้ timeout ของ
           ตัวเรียกเป็นคนจบเรื่อง ดีกว่าโยน error ขึ้นไปทำให้ทั้งหน้าพัง */
      }
    },
    subscribe: (onRaw) => {
      /* 🛑 อ่านค่าตอน event ยิง ไม่ใช่ตอน subscribe — native ตั้งค่าลง window **แล้วค่อย**
         ยิง event ถ้าอ่านตอน subscribe จะได้ค่าของคำขอครั้งก่อน (หรือ undefined) ตลอดกาล
         (บั๊กคลาสเดียวกับที่ native-bridge เขียนเตือนไว้เรื่อง __DEEP_PUSH_PERMISSION__) */
      const handler = () => onRaw(w.__DEEP_IAP_RESULT__)
      w.addEventListener(IAP_RESULT_EVENT, handler)
      return () => w.removeEventListener(IAP_RESULT_EVENT, handler)
    },
  }
}
