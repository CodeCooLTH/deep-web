import type { Metadata, Viewport } from 'next'
import { Anuphan } from 'next/font/google'

import { META_DATA } from '@/config/constants'
import { SITE_ICONS } from '@/lib/site-icons'

import '@/assets/css/app.css'

// root layout ของตัวเอง (ไม่ใช่ลูกของ (paces)) — หน้าสรุปสาธารณะต้องไม่มีสคริปต์วิเคราะห์ของ Vercel
// (token อยู่ใน path · NFR-LNK-2) · ไม่มี provider ที่อ่าน session/cookies/locale · ไม่มี splash ของ seller
const anuphan = Anuphan({
  subsets: ['thai', 'latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700'],
  variable: '--font-anuphan',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'สรุปรายละเอียด', template: `%s | ${META_DATA.name} ผู้ขาย` },
  icons: SITE_ICONS,
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

// ซูมได้ (WCAG 1.4.4) — ต่างจาก (paces) ที่ล็อก maximumScale=1 · ต้องเขียนครบทุก key เพราะ viewport ไม่ merge ข้าม root
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
}

export default function PublicReportLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" data-layout="vertical" data-theme="light" data-skin="default" dir="ltr" className={anuphan.variable}>
      <body className="antialiased">{children}</body>
    </html>
  )
}
