import type { Metadata } from 'next'
import { Anuphan } from 'next/font/google'

import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

import AppProvidersWrapper from '@/components/wrappers/AppProvidersWrapper'
import { META_DATA } from '@/config/constants'

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
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="th"
      data-layout="vertical"
      data-sidenav-user="false"
      data-layout-position="fixed"
      data-topbar-color="light"
      data-menu-color="dark"
      data-theme="light"
      data-skin="saas"
      data-sidenav-size="on-hover-active"
      data-layout-width="fluid"
      dir="ltr"
      className={anuphan.variable}
    >
      <body className="antialiased">
        <AppProvidersWrapper>{children}</AppProvidersWrapper>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
