import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ['deepth.local', 'seller.deepth.local', 'admin.deepth.local'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.fbcdn.net' },
      { protocol: 'https', hostname: 'platform-lookaside.fbsbx.com' },
      // FB profile picture endpoint (avatar ใหญ่ ~200px จาก graph; 302 → fbcdn)
      { protocol: 'https', hostname: 'graph.facebook.com' },
      // LINE avatar CDN (FR-LO-14)
      { protocol: 'https', hostname: 'profile.line-scdn.net' },
      // Instagram avatar CDN (FR-LO-15 — เตรียมไว้ ปิด flag; IG CDN ใช้ wildcard subdomain)
      { protocol: 'https', hostname: '*.cdninstagram.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '*.s3.amazonaws.com' },
      // DEV/TEST เท่านั้น — รูปสินค้า seed ทดสอบจาก picsum; ถอดออกเมื่อต่อ upload จริง (supabase/r2/s3)
      { protocol: 'https', hostname: 'picsum.photos' },
    ],
  },
  /**
   * client router cache — ทดลอง 2026-09-10 (user: "chat มันให้ความรู้สึกช้า เพราะมันโหลด
   * component ใหม่เรื่อย ๆ … มีท่าอื่นที่ทำให้ลื่นกว่านี้ไหม")
   *
   * 🛑 Next 16.1.1 ตั้ง `staleTimes.dynamic = 0` เป็นค่าตั้งต้น (ยืนยันจาก
   * `node_modules/next/dist/server/config-shared.js:194`) = **ปิด client router cache ของ route
   * แบบ dynamic สนิท** ⇒ ทุกการเปลี่ยนหน้า **รวมถึงกดย้อนกลับ** ยิงขอ RSC payload ใหม่เสมอ
   * ไม่ใช้ของที่เพิ่งโหลดไปเมื่อ 3 วินาทีก่อนเลย — นั่นคือความรู้สึก "โหลดใหม่ตลอด" ในกล่องแชท
   * (รายการ → เปิดห้อง → กลับมารายการ = โหลด 2 รอบทั้งที่เป็นหน้าเดิม)
   *
   * 30 วินาที: นานพอให้ "เข้าห้อง–กลับ–เข้าห้องอื่น" ลื่นทั้งชุด แต่สั้นพอที่ข้อมูลค้างจะหมดอายุเอง
   *
   * ทำไมข้อมูลค้างไม่อันตรายที่นี่: `router.refresh()` **บัสต์ cache ให้เองอยู่แล้ว** และถูกเรียก
   * 196 จุดทั่วแอป (โซนแชท 16) ⇒ ทุก flow ที่แก้ข้อมูลรีเฟรชตัวเองหลัง mutation
   * ส่วนกล่องแชทยังมี realtime + poll 20 วิ + refresh ตอนกลับมาโฟกัสหน้าต่าง ซ้อนอีกชั้น
   *
   * 🛑 มีผล **ทั้งแอป** ไม่ใช่แค่แชท — ถ้าเจอหน้าไหนแสดงข้อมูลเก่าค้างเกินรับได้
   * ลดเป็น 10 หรือลบบล็อกนี้ทิ้งได้ทันที ไม่มีอะไรอื่นผูกอยู่
   */
  experimental: {
    staleTimes: {
      dynamic: 30,
    },
  },
  serverExternalPackages: ['@prisma/client', 'prisma'],
  outputFileTracingExcludes: {
    '*': [
      'theme/**',
      'docs/**',
      'uploads/**',
    ],
  },
}

export default nextConfig
