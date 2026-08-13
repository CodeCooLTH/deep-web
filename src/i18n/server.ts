import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sessionUserId } from '@/lib/session-user'

import { LOCALE_COOKIE, toLocale, type Locale } from './locales'
import { th, type Dictionary } from './dictionaries/th'
import { en } from './dictionaries/en'

/**
 * i18n ฝั่งเซิร์ฟเวอร์ — ตัดสินว่า request นี้ต้องแสดงภาษาอะไร (feature 00047)
 *
 * Base pattern: `src/lib/app-shell-server.ts` (พี่น้องที่ทำเรื่องเดียวกัน — อ่านค่าจาก request
 * ฝั่งเซิร์ฟเวอร์แล้วส่งเป็น prop ธรรมดาเข้า client provider) รวมถึงเหตุผลที่ต้องแยกไฟล์:
 * ตรรกะบริสุทธิ์อยู่ที่ `./locales.ts` เพราะไฟล์ที่ import 'server-only' เทส import ไม่ได้
 *
 * ── ลำดับความสำคัญ (มติ D-I18N-4/5/6) ────────────────────────────────────────
 *   1. `User.locale` ในฐานข้อมูล  ← แหล่งความจริงเดียว ใช้เมื่อรู้ว่าเป็นใคร
 *   2. cookie `deep_locale`       ← เงา ใช้เฉพาะตอนยังไม่ล็อกอิน (/auth/sign-in)
 *   3. 'th'                       ← ค่าตั้งต้น (BR-I18N-01)
 *
 * 🛑 ห้ามสลับลำดับ 1 กับ 2 ไม่ว่าด้วยเหตุผลใด
 * เครื่องหนึ่งมีคนใช้ได้หลายคน (เครื่องรวมหน้าร้าน/พนักงานยืมกัน) ถ้าให้ cookie ชนะ
 * คนก่อนหน้าที่กด EN ทิ้งไว้จะเปลี่ยนภาษาให้เจ้าของบัญชีที่ล็อกอินตามมา โดยไม่มีใครตั้งใจ
 * และไม่มีอะไรฟ้อง
 *
 * ทำไมต้องอ่านที่เซิร์ฟเวอร์: FR-I18N-02 กำหนดว่าหน้าที่เรนเดอร์ฝั่งเซิร์ฟเวอร์ต้องออกมาเป็น
 * ภาษาที่ถูกต้องตั้งแต่การแสดงผลครั้งแรก ห้ามแสดงไทยแวบหนึ่งแล้วค่อยเปลี่ยนเป็นอังกฤษ
 */

const DICTIONARIES: Record<Locale, Dictionary> = { th, en }

/**
 * ภาษาของ request ปัจจุบัน
 *
 * `cache()` = คำนวณครั้งเดียวต่อ request ต่อให้ถูกเรียกจาก layout + page + component ย่อย
 * อีกหลายจุด (เหตุผลเดียวกับ getAppShell) — สำคัญกว่าปกติที่นี่เพราะมี query ฐานข้อมูลอยู่ข้างใน
 *
 * ทุกทางออกผ่าน `toLocale()` เสมอ: ค่าใน DB เป็น String ไม่มี CHECK constraint และ cookie
 * เป็นค่าที่ client เขียนเองได้ ⇒ ทั้งคู่เชื่อไม่ได้ ต้อง fail-closed ไปที่ไทย (BR-I18N-05)
 */
export const getLocale = cache(async (): Promise<Locale> => {
  // 1) รู้ว่าเป็นใคร → ใช้ค่าของบัญชีนั้นเสมอ
  //
  // `sessionUserId()` คืน string | null และไม่ throw — "มี session" ไม่ได้แปลว่า "รู้ว่าเป็นใคร"
  // (session callback เติม user.id ให้เฉพาะตอนหาแถว User เจอ — ดู lib/session-user.ts)
  const userId = sessionUserId(await getServerSession(authOptions))
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { locale: true } })
    // หาแถวไม่เจอ (ถูกลบ/purge กลางอากาศ) → ตกไปใช้ cookie ต่อ ไม่ใช่พังทั้งหน้า
    if (user) return toLocale(user.locale)
  }

  // 2) ยังไม่ล็อกอิน → ใช้เงาที่เครื่องนี้เคยบันทึกไว้
  const cookieStore = await cookies()
  return toLocale(cookieStore.get(LOCALE_COOKIE)?.value)
})

/**
 * คำแปลของ request ปัจจุบัน — ใช้ใน server component
 *
 *   const t = await getT()
 *   <h1>{t.common.save}</h1>
 *
 * 🛑 คืน dictionary ทั้งก้อน ไม่ใช่ฟังก์ชัน `t('some.key')` โดยตั้งใจ
 * การเข้าถึงด้วย property (`t.common.save`) ทำให้ `tsc` จับคีย์ผิด/คีย์ไม่มีตั้งแต่ตอน compile
 * ⇒ "คีย์หายตอน runtime" กลายเป็นสิ่งที่เกิดขึ้นไม่ได้เลยโดยโครงสร้าง ไม่ต้องพึ่ง fallback
 * (BR-I18N-12) และไม่ต้องพึ่งความตั้งใจของคนเขียน
 */
export async function getT(): Promise<Dictionary> {
  return DICTIONARIES[await getLocale()]
}

/** คำแปลของภาษาที่ระบุ — ใช้เมื่อรู้ locale อยู่แล้ว ไม่ต้องอ่านซ้ำ */
export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale]
}
