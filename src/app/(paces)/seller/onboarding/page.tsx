/**
 * /onboarding — ตั้งค่าร้านครั้งแรก (เฟส 2) — เปลือก server ที่กั้น "ฟอร์มลงทะเบียน" ไม่ให้โผล่ในแอป iOS
 *
 * ที่มา: Apple Guideline 3.1.1 (2026-08-23) *"Remove the account registration features for
 * business and organizations"* — ดูเหตุผลเต็มที่ `AppSetupBlockedNotice`
 *
 * 🛑 **ห้าม `redirect()` ออกจากหน้านี้** — `proxy.ts` เป็นคนบังคับให้ผู้ใช้มาที่นี่
 * (token.needsOnboarding = ร้านยังไม่มี slug) ⇒ redirect ออกแล้ว proxy จะเด้งกลับมาทันที = **ลูปไม่รู้จบ**
 * (ต่างจาก `/auth/sign-up` ที่ไม่มีใครบังคับ จึง redirect ได้)
 *
 * เปลือกนี้เป็น server component เพราะ `shouldHideSignUp()` อ่าน cookie/UA ซึ่งทำใน
 * `'use client'` ไม่ได้ · ตัวฟอร์มเดิมย้ายไป `OnboardingClient.tsx` ไม่ได้แก้ตรรกะข้างในเลย
 */
import type { Metadata } from 'next'

import AppSetupBlockedNotice from '@/components/paces/AppSetupBlockedNotice'
import { shouldHideSignUp } from '@/lib/app-shell-server'

import OnboardingClient from './OnboardingClient'

export const metadata: Metadata = { title: 'ตั้งค่าร้านค้า' }

export default async function OnboardingPage() {
  if (await shouldHideSignUp()) return <AppSetupBlockedNotice />
  return <OnboardingClient />
}
