'use client'

/**
 * useTextScale — ปุ่มขยายขนาดตัวอักษรทั้งหน้า (feat 00018, TextScaleToggler บน topbar /inbox)
 *
 * ปรับ font-size ที่ <html> ตรง ๆ (ไม่ใช่ .wrapper) เพื่อให้ rem token ทั้งระบบ (Paces/Tailwind
 * เป็น rem อยู่แล้ว) สเกลตาม — คนละเคสกับ --sidenav-width เดิมที่ต้อง override ที่ .wrapper (custom
 * property เฉพาะจุด ต้องเลี่ยง cascade race กับ @theme{} ที่ compile ไปเป็น :root — ดู comment
 * SidenavContent.tsx) แต่ font-size เป็นคุณสมบัติที่ต้องอาศัย "inheritance จาก root" จริง ๆ จึงต้อง
 * ตั้งที่ <html> เท่านั้น (rule อยู่ที่ safepay-overrides.css: html[data-text-scale="lg|xl"])
 *
 * กันจอกระพริบตอนโหลด (flash of wrong size): attribute ตัวจริงถูกตั้งไปที่ <html> ก่อน paint แล้ว
 * ด้วย inline <Script strategy="beforeInteractive"> ใน src/app/(paces)/layout.tsx (อ่าน
 * localStorage เดียวกัน key เดียวกัน ก่อน React hydrate) — hook นี้แค่ sync React state ให้ตรงกับ
 * DOM ที่ตั้งไปแล้ว ไม่ใช่คนกันกระพริบเอง (useEffect ธรรมดาพอ ไม่ต้อง useLayoutEffect เพราะไม่ได้
 * เป็นคนตั้ง attribute ครั้งแรก — แค่ sync label/aria ของปุ่มดรอปดาวน์ให้ตรง)
 *
 * key ต้องตรงกับ inline script ใน (paces)/layout.tsx เป๊ะ — 2 จุดนี้ sync กันด้วยมือ (ไม่ import
 * ข้าม module ได้ เพราะ inline script เป็น string แยกจาก bundle)
 */
import { useCallback, useEffect, useState } from 'react'

export type TextScaleValue = 'normal' | 'lg' | 'xl'

export const TEXT_SCALE_STORAGE_KEY = 'deep-seller-text-scale'
export const TEXT_SCALE_ATTR = 'data-text-scale'

export const TEXT_SCALE_OPTIONS: { value: TextScaleValue; label: string }[] = [
  { value: 'normal', label: 'ปกติ' },
  { value: 'lg', label: 'ใหญ่' },
  { value: 'xl', label: 'ใหญ่มาก' },
]

function applyTextScale(scale: TextScaleValue) {
  const html = document.documentElement
  if (scale === 'normal') html.removeAttribute(TEXT_SCALE_ATTR)
  else html.setAttribute(TEXT_SCALE_ATTR, scale)
}

export function useTextScale() {
  const [scale, setScaleState] = useState<TextScaleValue>('normal')

  // sync React state จาก localStorage หลัง mount — ค่าจริงถูก apply ที่ <html> ไปแล้วก่อน paint
  // ผ่าน inline script (ดู comment หัวไฟล์) ตรงนี้แค่ทำให้ label ปุ่ม/radio ที่ tick ตรงกับความจริง
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(TEXT_SCALE_STORAGE_KEY)
      if (stored === 'lg' || stored === 'xl') setScaleState(stored)
    } catch {
      // localStorage ใช้ไม่ได้ (private mode/บล็อก) — เงียบไว้ ใช้ default 'normal'
    }
  }, [])

  const setScale = useCallback((next: TextScaleValue) => {
    setScaleState(next)
    try {
      window.localStorage.setItem(TEXT_SCALE_STORAGE_KEY, next)
    } catch {
      // ignore — เขียนไม่ได้ก็ยัง apply ที่ <html> ได้ (แค่ไม่จำข้าม session)
    }
    applyTextScale(next)
  }, [])

  return { scale, setScale }
}
