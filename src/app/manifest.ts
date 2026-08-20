import type { MetadataRoute } from 'next'

// PWA manifest — "เพิ่มลงหน้าจอโฮม" แล้วเปิดเต็มจอ (standalone) ไม่มีแถบเบราว์เซอร์
// start_url = /dashboard (มือถือ → proxy rewrite → /m)
//
// ไอคอน = โลโก้ Deep ตัว D (สร้างด้วย `scripts/generate-web-icons.mjs` จาก
// `src/assets/images/logo-deep-mark.png` — ต้นฉบับเดียวกับไอคอนแอปผู้ขายบน App Store)
// เดิมชี้ `/icon.svg` ซึ่งเป็นตัว "V" ของธีม Vuexy บนพื้นม่วง #7367F0 — ดู `src/lib/site-icons.ts`
//
// 🛑 ต้องมี PNG ไม่ใช่ SVG อย่างเดียว: Chrome บน Android ใช้ไอคอนจาก manifest ไปสร้าง
//    shortcut บนหน้าจอโฮม และรองรับ SVG ได้ไม่ครบทุกเวอร์ชัน — ที่ผ่านมาจึงถอยไปใช้ภาพ
//    ตัวอักษรย่อที่ Chrome สร้างเองแทน
// 🛑 `maskable` ต้องเป็นไฟล์คนละใบกับ `any`: Android ครอปไอคอน maskable ตามรูปทรงของเครื่อง
//    (วงกลม/สี่เหลี่ยมมน) เนื้อโลโก้ต้องอยู่ใน safe zone กลางภาพ ไฟล์ใบนั้นจึงเผื่อขอบไว้มากกว่า
//    ถ้าใช้ใบเดียวกันทั้งสองบทบาท ขอบโลโก้จะถูกกินหายบนเครื่องที่ครอปเป็นวงกลม
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
      { src: '/deep-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/deep-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/deep-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }
}
