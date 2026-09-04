/**
 * /onboarding — ตั้งค่าร้านครั้งแรก (เฟส 2: ชื่อร้าน/slug/ประเภท)
 *
 * 🛑 **หน้านี้ต้องทำงานได้ในทุกเปลือก รวมแอป iOS** — `proxy.ts:210` **บังคับ** ให้ผู้ใช้ที่
 * `needsOnboarding` มาที่นี่ และหนีไม่ได้จนกว่าจะเสร็จ ⇒ ห้ามเป็นทางตัน
 *
 * เหตุผลเต็ม + ประวัติที่หน้านี้เคยถูกปิดแล้วผู้ขายเข้าแอปไม่ได้ (2026-08-25 → 09-04):
 * ดูหัวไฟล์ `src/app/(paces)/seller/register/page.tsx`
 *
 * ข้อ 3.1.1 ถูกปิดที่ **ต้นทาง** แทน — `/auth/sign-up` · ลิงก์ "สมัครสมาชิก" ·
 * ปุ่ม "เปิดร้านของฉัน" ที่ `/choose-shop`
 *
 * 🛑 **ห้าม `redirect()` ออกจากหน้านี้** — proxy จะเด้งกลับมาทันที = ลูปไม่รู้จบ
 */
import type { Metadata } from 'next'

import OnboardingClient from './OnboardingClient'

export const metadata: Metadata = { title: 'ตั้งค่าร้านค้า' }

export default function OnboardingPage() {
  return <OnboardingClient />
}
