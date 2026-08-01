import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

// โหลด .env.local (DATABASE_URL + NEXTAUTH_SECRET) — ใช้โดย e2e/helpers/auth.ts (seed + cookie)
// ถ้ารันผ่าน npm script `e2e` จะมี dotenv -e .env.local อยู่แล้ว; ตรงนี้เป็น fallback ตอนรัน npx ตรง
dotenv.config({ path: '.env.local' })

/**
 * ห้าม E2E แตะฐานข้อมูลที่ใช้งานจริงเด็ดขาด (เหตุการณ์ 2026-07-31)
 *
 * ไฟล์เทสในโฟลเดอร์นี้เรียก deleteMany แบบ where: { shopId } / { userId } ซึ่งลบ "ทุกแถวของ
 * ร้านนั้น" ไม่ใช่แค่แถวที่เทสสร้างเอง — วันนั้น .env.local ยังชี้ Supabase ตัวเดียวกับ prod
 * ข้อมูลร้าน/ออเดอร์/แชททั้งหมดจึงหายไปตอนมีคนรันเทส
 *
 * กันด้วยการหยุดตั้งแต่ยังไม่เปิดเบราว์เซอร์ ไม่ใช่หวังว่าจะจำได้ว่าอย่าชี้ผิด
 * ถ้าจำเป็นต้องรันใส่ปลายทางอื่นจริง ๆ ต้องตั้ง E2E_ALLOW_REMOTE_DB=1 อย่างจงใจ
 */
const dbUrl = process.env.DATABASE_URL ?? ''
const looksRemote = /supabase|amazonaws|\.com|\.io|\.dev/i.test(new URL(dbUrl || 'postgresql://x@localhost/x').hostname)
if (looksRemote && process.env.E2E_ALLOW_REMOTE_DB !== '1') {
  throw new Error(
    `[E2E] หยุด — DATABASE_URL ชี้ไปฐานข้อมูลปลายทางไกล (${new URL(dbUrl).hostname})\n` +
      'เทสชุดนี้ลบข้อมูลทั้งร้าน ห้ามรันใส่ฐานข้อมูลจริง\n' +
      'ใช้ฐานข้อมูลบนเครื่อง (docker compose up -d) แล้วให้ .env.local ชี้ localhost\n' +
      'ถ้าตั้งใจจริงและรู้ผลที่ตามมา: E2E_ALLOW_REMOTE_DB=1',
  )
}

/**
 * E2E Playwright config — เทสผ่าน browser จริงที่ subdomain dev (user รัน dev server เองที่ :4000)
 * baseURL = seller subdomain (proxy route ตาม host); ห้าม localhost.
 * ไม่ตั้ง webServer — user รัน `npm run dev -- -p 4000` เอง (กฎ: QA ไม่ start server).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // seed/cleanup แชร์ DB — รัน serial กัน race
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // E2E_BASE_URL override — เผื่อ dev server หลัก (:4000) รันจาก worktree อื่นอยู่
    // (เจอจริง 2026-07-30: :4000 เสิร์ฟ worktree revise-ui-order-link ทำให้ route ใหม่ 404)
    baseURL: process.env.E2E_BASE_URL ?? 'http://seller.deepth.local:4000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
