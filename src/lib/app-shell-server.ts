import 'server-only'

import { cache } from 'react'
import { cookies, headers } from 'next/headers'

import {
  SHELL_COOKIE_NAME,
  isPaidFeatureRestricted,
  isPaymentRestricted,
  isSignUpRestricted,
  resolveAppShell,
  type AppShell,
} from '@/lib/app-shell'

/**
 * app-shell-server — อ่าน request จริงแล้วบอกว่าหน้านี้ถูกเปิดจากที่ไหน
 *
 * ตรรกะการตัดสินทั้งหมดอยู่ที่ `@/lib/app-shell` (ไฟล์บริสุทธิ์ มีเทสคุม) — ที่นี่รับผิดชอบแค่
 * "ไปหยิบ cookie กับ user-agent มาให้" เท่านั้น แยกกันเพราะ `server-only` ทำให้เทส import ไม่ได้
 */

/**
 * shell ของ request ปัจจุบัน
 *
 * `cache()` = คำนวณครั้งเดียวต่อ request ต่อให้ถูกเรียกจากหลาย component (layout + page +
 * การ์ดย่อยอีกหลายใบ) — ไม่ใช่ไปอ่าน cookie/header ซ้ำทุกจุด
 *
 * หมายเหตุ perf: การเรียก cookies()/headers() ทำให้ route กลายเป็น dynamic — แต่หน้า seller
 * ทุกหน้าเป็น dynamic อยู่แล้วเพราะต้องอ่าน session จึงไม่ได้เสียอะไรเพิ่ม
 */
export const getAppShell = cache(async (): Promise<AppShell> => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()])
  return resolveAppShell(cookieStore.get(SHELL_COOKIE_NAME)?.value, headerList.get('user-agent') ?? '')
})

/** ต้องซ่อนทุกอย่างที่เกี่ยวกับการจ่ายเงินไหม — ดูนิยาม "ทุกอย่าง" ที่ isPaymentRestricted */
export async function shouldHidePayments(): Promise<boolean> {
  return isPaymentRestricted(await getAppShell())
}

/** ต้องซ่อนการสมัครบัญชีไหม — ดูเหตุผลที่ `isSignUpRestricted` (Apple สั่ง 2026-08-23) */
export async function shouldHideSignUp(): Promise<boolean> {
  return isSignUpRestricted(await getAppShell())
}

/**
 * ต้องซ่อน **ฟีเจอร์ที่จ่ายเงินมาแล้วแต่ไม่มีขายเป็น IAP ในแอป** ไหม
 * — ดูเหตุผลที่ `isPaidFeatureRestricted` (Guideline 3.1.3(b) · feature 00064)
 *
 * ตอนนี้มีตัวเดียวคือ **Deep Stock** — Business Package ไม่เข้าข้อนี้เพราะขายเป็น IAP
 */
export async function shouldHidePaidFeatures(): Promise<boolean> {
  return isPaidFeatureRestricted(await getAppShell())
}
