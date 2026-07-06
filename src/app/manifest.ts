import type { MetadataRoute } from 'next'

// PWA manifest — "เพิ่มลงหน้าจอโฮม" แล้วเปิดเต็มจอ (standalone) ไม่มีแถบเบราว์เซอร์
// ไอคอน = โลโก้ V (public/icon.svg). start_url = /dashboard (มือถือ → proxy rewrite → /m)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Deep — ซื้อขายออนไลน์อย่างมั่นใจ',
    short_name: 'Deep',
    description: 'เช็กก่อนโอน กันมิจฉาชีพ · ประมูล · Trust Score',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'th',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
    ]
  }
}
