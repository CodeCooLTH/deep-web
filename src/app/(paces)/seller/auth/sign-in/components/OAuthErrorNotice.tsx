'use client'

/**
 * OAuthErrorNotice — แสดงเหตุผลที่ล็อกอินด้วย Apple/Facebook/LINE/Instagram ไม่สำเร็จ
 *
 * ## 🛑 บั๊กที่ไฟล์นี้แก้ (หัวหน้าแจ้ง 2026-08-19: *"login ด้วย apple แล้วไม่พาไปไหน
 * อยู่ที่หน้า login เหมือนเดิม"*)
 *
 * NextAuth เด้งกลับมาที่หน้านี้ **พร้อมบอกสาเหตุมาแล้ว** ใน `?error=`
 * (`next-auth/core/index.js:209-211` → `167-169`) แต่ `SignInForm` อ่าน `searchParams`
 * แค่ `callbackUrl` ตัวเดียว ⇒ เหตุผลถูกทิ้งทุกครั้ง ผู้ใช้เห็นแค่ "กดแล้วไม่มีอะไรเกิดขึ้น"
 *
 * ความล้มเหลวที่เงียบสนิทแพงกว่าความล้มเหลวที่ดัง: มันแยกไม่ออกจาก "ปุ่มเสีย" เลย
 * และคนที่เจอ (รวมทีมรีวิวของ Apple) ไม่มีทางรู้ว่าต้องทำอะไรต่อ
 *
 * 🛑 **ฝั่ง buyer ทำถูกมาตั้งแต่ต้น** (`(marketing)/auth/sign-in/OAuthErrorToast.tsx`)
 * seller เป็นหน้าพี่น้องที่ไม่ได้ยกมา — คลาสเดียวกับ `docs/conventions/sibling-surface-parity.md`
 * ยกมาตรงตัวไม่ได้เพราะตัวนั้นใช้ `react-toastify` ซึ่ง `(paces)` ห้ามใช้ (Hard Rule 9)
 * จึงเรียกผ่าน `pacesToast` แทน
 *
 * ## ทำไมต้องมีรหัสต่อท้ายข้อความ
 *
 * `OAuthCallback` กับ `OAuthAccountNotLinked` แก้คนละที่กันคนละเรื่อง แต่ผู้ใช้เล่าอาการมา
 * ได้เหมือนกันทุกประการ ("กดแล้วไม่เข้า") — รหัสคือสิ่งเดียวที่แยกสองอย่างนี้ออกจากกัน
 * โดยไม่ต้องให้ผู้ใช้ทำอะไรเพิ่ม (log ของ Vercel แพลนนี้ query ย้อนหลังไม่ได้)
 */

import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

import { useT } from '@/i18n/LocaleProvider'
import type { Dictionary } from '@/i18n/dictionaries/th'
import { pacesToast } from '@/lib/paces-toast'

/**
 * รหัสที่ NextAuth ส่งมาลงหน้านี้ได้จริง (`next-auth/core/index.js:209`) + `AccessDenied`
 * ที่มาจาก `signIn` callback คืน false (บัญชีถูกลบ — App Store 5.1.1(v))
 *
 * 🛑 ห้ามทำเป็น `Record<string, …>` ที่รับคีย์อะไรก็ได้ — คีย์ที่ไม่รู้จักต้องตกไปข้อความ
 * fallback **ที่ยังบอกรหัสอยู่** ไม่ใช่เงียบ (ซึ่งคือบั๊กที่ไฟล์นี้ถูกสร้างมาแก้พอดี)
 */
function messageFor(code: string, t: Dictionary): string {
  const m = t.auth.signIn.oauthError
  const known: Record<string, string> = {
    OAuthSignin: m.oauthSignin,
    OAuthCallback: m.oauthCallback,
    OAuthCreateAccount: m.oauthCreateAccount,
    OAuthAccountNotLinked: m.accountNotLinked,
    Callback: m.oauthCallback,
    AccessDenied: m.accessDenied,
    Configuration: m.configuration,
    CredentialsSignin: m.credentials,
    SessionRequired: m.sessionRequired,
  }
  return `${known[code] ?? m.unknown} (${code})`
}

export default function OAuthErrorNotice() {
  const t = useT()
  const code = useSearchParams().get('error')

  useEffect(() => {
    if (!code) return
    pacesToast.error(messageFor(code, t))
    // t เปลี่ยนตอนสลับภาษาเท่านั้น — ไม่ใส่ใน deps เพราะจะยิง toast ซ้ำทุกครั้งที่สลับ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  return null
}
