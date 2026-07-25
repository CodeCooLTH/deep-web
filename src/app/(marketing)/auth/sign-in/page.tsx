import type { Metadata } from 'next'
import { Suspense } from 'react'

import { getOrderSummaryForSignIn } from '@/services/order.service'

import OAuthErrorToast from './OAuthErrorToast'
import SignInCard from './SignInCard'
import SmsExpiredToast from './SmsExpiredToast'

export const metadata: Metadata = { title: 'เข้าสู่ระบบ' }

// UUID v4 — pattern เดียวกับ o/[token]/page.tsx (ตัว discriminator ของลิงก์ออเดอร์)
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * ดึง publicToken จาก ?callbackUrl= ถ้าผู้ใช้ถูก redirect มาจากลิงก์ออเดอร์
 *
 * รับเฉพาะรูป `/o/{uuid}` เท่านั้น — ทั้งสองทางเข้าส่งมาเป็น UUID เสมออยู่แล้ว:
 *   - force-login gate (o/[token]/page.tsx) redirect ด้วย order.publicToken ตรง ๆ
 *   - short-code 8 หลัก resolve เป็น UUID ก่อน แล้วค่อยวนกลับมาเจอ gate
 *   - SMS route (api/o/sms/[code]) ก็ set callbackUrl เป็น '/o/' + publicToken
 * รูปอื่นทั้งหมด → null (ตกกลับไปหน้า sign-in ปกติ ไม่ crash)
 */
function extractOrderToken(callbackUrl: string | undefined): string | null {
  if (!callbackUrl?.startsWith('/o/')) return null
  const token = callbackUrl.slice(3).split(/[/?#]/)[0]
  return UUID_V4_RE.test(token) ? token : null
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function SignInPage({ searchParams }: Props) {
  const params = await searchParams
  const rawCallbackUrl = typeof params.callbackUrl === 'string' ? params.callbackUrl : undefined

  // มาจากลิงก์ออเดอร์ → โหลดสรุปออเดอร์แบบ public-safe มาโชว์เหนือฟอร์ม เพื่อให้ผู้ซื้อ
  // รู้ว่ากำลังจะเข้าถึงคำสั่งซื้อใบไหนก่อนตัดสินใจล็อกอิน (ดู getOrderSummaryForSignIn
  // เรื่องขอบเขตข้อมูลที่โชว์ได้). token ไม่มีอยู่จริง → null → หน้า sign-in ปกติ
  const token = extractOrderToken(rawCallbackUrl)
  const orderContext = token ? await getOrderSummaryForSignIn(token) : null

  return (
    <>
      <Suspense fallback={null}>
        <OAuthErrorToast />
      </Suspense>
      <Suspense fallback={null}>
        <SmsExpiredToast />
      </Suspense>
      <Suspense fallback={null}>
        <SignInCard orderContext={orderContext} />
      </Suspense>
    </>
  )
}
