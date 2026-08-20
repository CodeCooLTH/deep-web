import type { Metadata, Viewport } from 'next'
import { Anuphan } from 'next/font/google'
import Script from 'next/script'

import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

import AppProvidersWrapper from '@/components/wrappers/AppProvidersWrapper'
import { META_DATA } from '@/config/constants'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { getLocale } from '@/i18n/server'
import { SITE_ICONS } from '@/lib/site-icons'
// favicon ของฝั่ง seller/admin = Paces theme favicon (ไม่ใช้ของ buyer/Deep ที่ root)

import '@/assets/css/app.css'

// โหลด Anuphan ผ่าน next/font เพื่อให้ CSS variable --font-anuphan ตรงกับฝั่ง marketing
const anuphan = Anuphan({
  subsets: ['thai', 'latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700'],
  variable: '--font-anuphan',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: META_DATA.title,
    template: `%s | ${META_DATA.name}`,
  },
  description: META_DATA.description,
  keywords: META_DATA.keywords,
  authors: [{ name: META_DATA.author }],
  icons: SITE_ICONS,
}

// ปิด pinch-zoom บนมือถือ — แอป seller/admin เป็น native-like (Paces) ไม่อยาก
// ให้ผู้ใช้ซูมจนเลย์เอาต์เพี้ยน. maximumScale=1 + userScalable=false
//
// viewportFit 'cover' (2026-08-06): ถ้าไม่ตั้ง iOS จะคืน env(safe-area-inset-*) = 0 ทั้งหมด
// แปลว่า `pb-[env(safe-area-inset-bottom)]` ทุกจุดใน (paces) — bottom nav, sheet, action bar,
// main padding ใน safepay-overrides.css — ไม่เคยทำงานเลยตั้งแต่แรก. อาการที่ user จับได้:
// label ของ bottom nav ไปนอนคาบแถบ home indicator (เว้นขอบล่าง ~12pt ขณะที่ Shopee/TrueMoney
// เว้น ~36pt). ฝั่ง buyer (marketing)/layout.tsx ตั้ง cover ไว้อยู่แล้ว
//
// สำคัญ: เปิด cover = เนื้อหากินพื้นที่ status bar/home indicator ด้วย → ทุก surface ที่ยึดขอบจอ
// ต้องเว้น inset เอง (ไม่งั้นหัวจอมุดใต้นาฬิกา) จุดที่จัดการไว้แล้วในคอมมิตเดียวกัน:
// SellerMobileHeader (pt), .app-header + .chat-shell (safepay-overrides.css),
// SellerBottomNav (h + pb), (fullscreen)/layout, action bar/sheet เต็มจอ, หน้า auth/onboarding
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

/**
 * feature 00047 — `lang` ต้องตรงกับภาษาที่แสดงจริง (BR-I18N-15)
 *
 * ต้องตัดสินที่นี่เพราะ `<html>` มีอยู่ที่เดียวคือ root layout และ FR-I18N-05 กำหนดว่าค่านี้
 * ต้องถูกตั้งแต่การเรนเดอร์ครั้งแรกฝั่งเซิร์ฟเวอร์ (โปรแกรมอ่านหน้าจอตัดสินภาษาที่จะออกเสียง
 * จาก attribute นี้ — ตั้งทีหลังด้วย JS ไม่ทันรอบแรก)
 *
 * ทำให้ layout เป็น async = ทุก route ใต้ (paces) เป็น dynamic — ซึ่ง **ไม่ได้เปลี่ยนอะไร**
 * เพราะทุกหน้าใต้นี้อ่าน session อยู่แล้วจึง dynamic มาตั้งแต่แรก และ `getLocale()` ถูกห่อ
 * ด้วย `cache()` ⇒ query ฐานข้อมูลครั้งเดียวต่อ request ใช้ร่วมกับทั้ง tree
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()

  return (
    <html
      lang={locale}
      data-layout="vertical"
      data-sidenav-user="false"
      data-layout-position="fixed"
      data-topbar-color="light"
      data-menu-color="dark"
      data-theme="light"
      data-skin="default"
      data-sidenav-size="on-hover-active"
      data-layout-width="fluid"
      dir="ltr"
      className={anuphan.variable}
    >
      <body className="antialiased">
        {/* feat 00018 (TextScaleToggler, /inbox topbar) — กันจอกระพริบตอนโหลด (flash of wrong
            font size): ต้องอ่าน localStorage แล้วตั้ง data-text-scale ที่ <html> "ก่อน" browser
            paint ครั้งแรก ซึ่งทำได้เฉพาะ blocking script ใน root layout เท่านั้น (useLayoutEffect
            ใน React component ทำงานหลัง SSR HTML ถูก paint ไปแล้วรอบแรก — ไม่ทันกันกระพริบข้าม
            hydration) strategy="beforeInteractive" ของ next/script รับประกันว่า Next ฉีด script
            นี้เข้า <head> และรันก่อน hydrate เสมอ (pattern เดียวกับ next-themes) key ต้องตรงกับ
            TEXT_SCALE_STORAGE_KEY ใน src/hooks/useTextScale.ts เป๊ะ (sync กันด้วยมือ อ่าน comment
            หัวไฟล์นั้นก่อนแก้ค่านี้) */}
        <Script id="text-scale-init" strategy="beforeInteractive">
          {`(function(){try{var s=window.localStorage.getItem('deep-seller-text-scale');if(s==='lg'||s==='xl'){document.documentElement.setAttribute('data-text-scale',s);}}catch(e){}})();`}
        </Script>
        {/* feature 00047 — วาง LocaleProvider ไว้ชั้นนอกสุดของ (paces) เพราะครอบทั้งโซนผู้ขาย
            (รวมหน้า auth ที่ยังไม่ล็อกอิน) และโซนแอดมินในคราวเดียว จุดเดียวเหมือนที่
            PacesToastContainer ทำ — component ไหนก็เรียก useT() ได้โดยไม่ต้องต่อสายเพิ่ม */}
        <LocaleProvider locale={locale}>
          <AppProvidersWrapper>{children}</AppProvidersWrapper>
        </LocaleProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
