import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

// โหลด .env.local (DATABASE_URL + NEXTAUTH_SECRET) — ใช้โดย e2e/helpers/auth.ts (seed + cookie)
// ถ้ารันผ่าน npm script `e2e` จะมี dotenv -e .env.local อยู่แล้ว; ตรงนี้เป็น fallback ตอนรัน npx ตรง
dotenv.config({ path: '.env.local' })

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
