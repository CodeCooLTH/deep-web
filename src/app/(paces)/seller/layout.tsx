import type { Metadata } from 'next'
import { Suspense } from 'react'
import NavigationLoader from './NavigationLoader'
import AppOAuthBridge from '@/components/paces/AppOAuthBridge'
import { PaymentRestrictionProvider } from '@/components/paces/PaymentRestrictionProvider'
import { shouldHidePayments } from '@/lib/app-shell-server'

export const metadata: Metadata = {
  title: { default: 'ผู้ขาย', template: '%s | Deep ผู้ขาย' },
}

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  /**
   * เปิดจากในแอป iOS → ทั้งโซนผู้ขายห้ามมีช่องทาง/คำเชิญให้จ่ายเงิน
   * (App Store Guideline 3.1.1 — rejection 2026-08-04 · ดู src/lib/app-shell.ts)
   *
   * วางที่ layout ชั้นนอกสุดของ seller เพราะครอบทั้ง (dashboard) และ (chat) — ข้อความ
   * "ยอดเงินไม่พอ — เติมเงิน" มีอยู่ในทั้งสองโซน ถ้าวางที่ layout ย่อยจะครอบไม่ครบ
   */
  const hidePayments = await shouldHidePayments()

  // NavigationLoader = global preloading overlay ตอนเปลี่ยนหน้า; Suspense เพราะภายในใช้ useSearchParams
  return (
    <PaymentRestrictionProvider hidePayments={hidePayments}>
      <Suspense fallback={null}>
        <NavigationLoader />
      </Suspense>
      {/* OAuth ผ่าน Custom Tab ของแอป Android — ทำงานทั้งในแท็บ (ส่งกลับแอป) และใน WebView (ดักลิงก์เชื่อมเพจ)
          วางชั้นนอกสุดเพราะหน้าปลายทางของ OAuth กระจายทุกโซน: /auth · (dashboard) · /register · /onboarding */}
      <AppOAuthBridge />
      {children}
    </PaymentRestrictionProvider>
  )
}
