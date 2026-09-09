/**
 * หน้าซื้อแพ็กเกจสำหรับ **แอป iOS เท่านั้น** (feature 00064 — Apple Guideline 3.1.1)
 *
 * ## ทำไมเป็นหน้าใหม่ ไม่ใช่แก้ `/business`
 *
 * user เคาะ 2026-09-08 หลังชั่งสองทาง — หน้า `/business` เต็มไปด้วยของฝั่งกระเป๋าเงิน
 * (ปุ่มอัปเกรด/ดาวน์เกรด/ยกเลิก · ราคาบาท · แถบเตือนเงินไม่พอ) การเปิดให้แอปเข้าแล้ว
 * ไล่ซ่อนทีละจุดคือรูปแบบที่ **ทำให้โดนตีกลับมาแล้ว 2 ครั้ง** (แคตตาล็อกทางลัด 2026-08-20,
 * หน้าแผนการตรวจสอบ 2026-09-06) — จุดที่ลืมมีเสมอ
 *
 * หน้านี้จึงไม่มีโค้ดฝั่งกระเป๋าเงินอยู่เลยแม้แต่บรรทัดเดียว ⇒ ไม่มีอะไรให้หลุด
 *
 * ## 🛑 ด่านกลับด้านกับ `/business`
 *
 * `/business` = "อยู่ในแอป → ห้ามเข้า" · หน้านี้ = "**ไม่ได้อยู่ในแอป → ห้ามเข้า**"
 * เพราะบนเบราว์เซอร์ StoreKit ไม่มีอยู่จริง หน้านี้จะว่างเปล่าและทำให้คนสับสนว่าซื้อยังไง
 * (และถ้าปล่อยให้ Google index ได้ = หน้าขายของที่กดซื้อไม่ได้)
 */
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { sessionUserId } from '@/lib/session-user'
import { shouldHidePayments } from '@/lib/app-shell-server'
import { getSubscriptionStatus } from '@/services/business-package.service'
import type { BusinessPackageTier } from '@/lib/business-package'

import IapSubscribeClient from './components/IapSubscribeClient'

export const metadata: Metadata = { title: 'แพ็กเกจธุรกิจ', robots: { index: false, follow: false } }

/**
 * ที่อยู่ของโดเมนหลัก — หน้า `/terms` กับ `/privacy` อยู่ที่นั่น ไม่ได้อยู่บน subdomain นี้
 *
 * 🛑 ลิงก์แบบ path เปล่า (`/terms`) ใช้ไม่ได้: `proxy.ts` จะ rewrite เป็น `/seller/terms`
 * แล้ว 404 — เป็นบั๊กคลาสเดียวกับที่ proxy เขียนเตือนไว้เองเรื่อง "ปุ่มดูหน้าร้าน"
 *
 * คำนวณจาก host จริงเพื่อให้ทำงานทั้ง prod และ dev (`seller.deepth.local:3000`)
 */
async function mainSiteOrigin(): Promise<string> {
  const h = await headers()
  const host = (h.get('host') ?? '').replace(/^seller\./, '')
  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') || host.endsWith('.local') || host.includes('.local:') ? 'http' : 'https')
  return `${proto}://${host}`
}

export default async function IapSubscribePage() {
  /* 🛑 ด่านกลับด้าน — ดูเหตุผลหัวไฟล์ */
  if (!(await shouldHidePayments())) redirect('/business')

  const session = await getServerSession(authOptions)
  const ownerId = sessionUserId(session)
  if (!ownerId) redirect('/auth/sign-in')

  /* หาไม่เจอ = ถือว่ายังไม่มีแพ็กเกจ (FREE) — fail-closed ไปทางที่ปลอดภัยกว่าคือ
     "ยังไม่มี" ไม่ได้ ⇒ ต้องโยนต่อ ไม่งั้นคนที่จ่ายผ่านกระเป๋าเงินอยู่จะเห็นปุ่มซื้อ (TC-IAP-45) */
  const sub = await getSubscriptionStatus(ownerId)

  return (
    <IapSubscribeClient
      subscription={
        sub
          ? { source: sub.source, status: sub.status, tier: sub.tier as BusinessPackageTier }
          : null
      }
      mainSiteOrigin={await mainSiteOrigin()}
    />
  )
}
