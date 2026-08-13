'use client'

/**
 * LocaleProvider — แจกภาษาปัจจุบันและคำแปลให้ client component (feature 00047)
 *
 * Base pattern: `src/components/paces/PaymentRestrictionProvider.tsx` (server อ่านค่าจาก
 * request → ส่งเป็น prop ธรรมดา → client provider แจกต่อ) — ท่าเดียวกับที่ `(paces)/layout.tsx`
 * ทำอยู่แล้วกับ `hidePayments`
 *
 * 🛑 provider นี้ "ไม่มี setLocale" โดยตั้งใจ
 * ภาษาเป็นการตั้งค่าของบัญชีที่อยู่ในฐานข้อมูล (มติ D-I18N-4) การเปลี่ยนจึงต้องผ่าน API
 * แล้วค่อย `router.refresh()` ซึ่งเป็นหน้าที่ของการ์ดในหน้า `/account` ไม่ใช่ของ provider
 * ถ้าใส่ setLocale ที่เขียน cookie ไว้ตรงนี้ จะมีคนหยิบไปใช้ในหน้าที่ล็อกอินแล้ว → เขียน
 * cookie โดยไม่แตะ DB → ค่าถูก DB ทับกลับทันทีที่ refresh = ผู้ใช้เห็นภาษาเด้งกลับเอง
 *
 * 🛑 สิ่งเดียวที่ข้ามเส้น RSC คือ `locale` ซึ่งเป็นสตริง
 * dictionary ถูก import ตรงในไฟล์นี้ (ฝั่ง client) ไม่ได้ส่งข้ามเส้นมาเป็น prop — ตั้งใจ
 * เพราะ prop ที่ข้ามเส้นต้อง serialize ได้เสมอ และการส่งก้อนใหญ่ทุก request คือค่าใช้จ่าย
 * ที่ไม่ได้อะไรกลับมา (memory feedback_rsc_props_must_be_serializable)
 *
 * 🛑 ไม่มี hook ที่คืน object `{ locale, t }` โดยตั้งใจ
 * hook ที่ `return` object literal จะได้ identity ใหม่ทุก render ⇒ ถ้าใครเผลอใส่ทั้งก้อนลง
 * dep array ของ effect ที่ setState ด้วย จะกลายเป็นลูปยิงงานไม่หยุด และ
 * `react-hooks/exhaustive-deps` จะแนะนำให้เขียนแบบที่พังพอดี (เกิดจริงบน prod 2026-08-09
 * ที่ /inbox/comments — docs/conventions/hook-return-identity-in-deps.md)
 * `useT()` คืน dictionary ซึ่งเป็น module-level constant (identity คงที่ตลอดอายุ bundle)
 * และ `useLocale()` คืนสตริง — ทั้งคู่ใส่ dep array ได้ปลอดภัย
 */

import { createContext, useContext, useEffect, useMemo } from 'react'

import { th, type Dictionary } from './dictionaries/th'
import { en } from './dictionaries/en'
import { readLocaleCookie, writeLocaleCookie } from './locale-cookie'
import type { Locale } from './locales'

const DICTIONARIES: Record<Locale, Dictionary> = { th, en }

type LocaleContextValue = {
  locale: Locale
  dictionary: Dictionary
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  /**
   * ทำให้ cookie ตามค่าจริงให้ทัน (มติ D-I18N-5)
   *
   * `locale` ที่รับมาคือค่าที่เซิร์ฟเวอร์ตัดสินแล้ว — ถ้าผู้ใช้ล็อกอินอยู่ ค่านี้มาจาก
   * `User.locale` ⇒ การเขียนลง cookie ตรงนี้คือการทำสำเนาไว้ให้หน้า `/auth/sign-in`
   * ของ *ครั้งถัดไป* อ่านได้ ทั้งที่ตอนนั้นจะไม่มี session แล้ว
   *
   * เขียนเฉพาะตอนไม่ตรง — ไม่ใช่เขียนทับทุก render (ลดงานที่ไม่จำเป็น และทำให้เห็นชัดใน
   * devtools ว่ามีการเขียนเกิดขึ้นเมื่อค่าเปลี่ยนจริงเท่านั้น)
   *
   * dep เป็นสตริง ไม่ใช่ object ⇒ ไม่เข้าคลาส hook-return-identity-in-deps
   */
  useEffect(() => {
    if (readLocaleCookie() !== locale) writeLocaleCookie(locale)
  }, [locale])

  const value = useMemo<LocaleContextValue>(() => ({ locale, dictionary: DICTIONARIES[locale] }), [locale])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

/**
 * อ่าน context — โยนถ้าไม่มี provider โดยตั้งใจ
 *
 * ทางเลือกอีกทางคือถอยไปใช้ dictionary ไทยเงียบ ๆ ซึ่ง "ดูปลอดภัยกว่า" แต่จะทำให้ component
 * ที่ถูกวางนอก provider แสดงภาษาไทยตลอดไปโดยไม่มีอะไรฟ้อง = บั๊กเดินทางไปถึงผู้ใช้เสมอ
 * ซึ่งเป็นคลาสเดียวกับที่ BR-I18N-12 ห้ามไว้ทั้งฉบับ
 * provider ถูก mount ที่ `(paces)/layout.tsx` ซึ่งครอบทุกหน้าในโซนผู้ขาย ⇒ การอยู่นอก provider
 * คือความผิดพลาดของการต่อสาย ไม่ใช่สถานะปกติที่ต้องรองรับ
 */
function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    throw new Error('useT/useLocale ถูกเรียกนอก <LocaleProvider> — ตรวจว่า component นี้อยู่ใต้ (paces)/layout.tsx')
  }
  return ctx
}

/**
 * คำแปลของภาษาปัจจุบัน — ใช้ใน client component
 *
 *   const t = useT()
 *   <button>{t.common.save}</button>
 *
 * เข้าถึงด้วย property ไม่ใช่สตริงคีย์ ⇒ พิมพ์ผิดหรือคีย์ไม่มี = tsc แดงตั้งแต่ compile
 */
export function useT(): Dictionary {
  return useLocaleContext().dictionary
}

/** ภาษาปัจจุบัน (สตริง) — identity เสถียร ใส่ dep array ได้ปลอดภัย */
export function useLocale(): Locale {
  return useLocaleContext().locale
}
