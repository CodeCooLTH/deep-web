// Next Imports
import type { Metadata, Viewport } from 'next'
import { Anuphan } from 'next/font/google'
import Script from 'next/script'

// Vercel Imports
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

// MUI Imports
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript'

// Type Imports
import type { ChildrenType } from '@core/types'

// Context Imports
import { NextAuthProvider } from '@/contexts/nextAuthProvider'
import { VerticalNavProvider } from '@menu/contexts/verticalNavContext'
import { SettingsProvider } from '@core/contexts/settingsContext'
import { IntersectionProvider } from '@/contexts/intersectionContext'

// Component Imports
import ThemeProvider from '@components/theme'

// Util Imports
import { getMode, getSettingsFromCookie, getSystemMode } from '@core/utils/serverHelpers'

import ToastMount from '@/components/ToastMount'

import './marketing.css'

// Google Analytics 4 measurement ID
const GA_MEASUREMENT_ID = 'G-TB854DJZX4'

const anuphan = Anuphan({
  subsets: ['thai', 'latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700'],
  variable: '--font-anuphan',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Deep — ซื้อขายออนไลน์อย่างมั่นใจ',
  description:
    'Deep คือระบบสร้างความน่าเชื่อถือสำหรับการซื้อขายออนไลน์ ผ่านการยืนยันตัวตน Trust Score และ Badge เพื่อลดปัญหามิจฉาชีพ',
  keywords: ['Deep', 'Trust Score', 'ซื้อขายออนไลน์', 'ยืนยันตัวตน', 'มิจฉาชีพ'],
  // PWA: iOS "เพิ่มลงหน้าจอโฮม" → เปิดเต็มจอ (standalone) ไม่มีแถบเบราว์เซอร์
  appleWebApp: { capable: true, title: 'Deep', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
}

// ปิด pinch-zoom บนมือถือฝั่ง buyer/landing ให้สม่ำเสมอกับฝั่ง Paces
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#ffffff',
}

export default async function MarketingRootLayout({ children }: ChildrenType) {
  const direction = 'ltr'
  const mode = await getMode()
  const settingsCookie = await getSettingsFromCookie()
  const systemMode = await getSystemMode()

  return (
    <html id="__next" lang="th" dir={direction} className={anuphan.variable} suppressHydrationWarning>
      <body className="marketing-body flex is-full min-bs-full flex-auto flex-col">
        <InitColorSchemeScript attribute="data" defaultMode={systemMode} />
        <NextAuthProvider basePath={process.env.NEXTAUTH_BASEPATH}>
          <VerticalNavProvider>
            <SettingsProvider settingsCookie={settingsCookie} mode={mode}>
              <ThemeProvider direction={direction} systemMode={systemMode}>
                <IntersectionProvider>{children}</IntersectionProvider>
                <ToastMount />
              </ThemeProvider>
            </SettingsProvider>
          </VerticalNavProvider>
        </NextAuthProvider>
        <Analytics />
        <SpeedInsights />
        {/* Google Analytics (gtag.js) — โหลดหลัง interactive เพื่อไม่บล็อก render */}
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </body>
    </html>
  )
}
