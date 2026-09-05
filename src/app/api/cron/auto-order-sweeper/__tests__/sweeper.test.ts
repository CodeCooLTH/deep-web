import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * 00061 TFR-024 — Watchdog + Reaper
 *
 * ทั้งสองหน้าที่พังแบบ "เงียบ" ได้ทั้งคู่: watchdog ที่ไม่ทำงาน = การ์ด "กำลังอ่าน" ค้าง
 * ตลอดกาลโดยไม่มี error · reaper ที่ไม่ทำงาน = ร่างค้างสะสมไปเรื่อย ๆ
 */
const SRC = readFileSync('src/app/api/cron/auto-order-sweeper/route.ts', 'utf8')

describe('cron auto-order-sweeper', () => {
  it('[blocker] env ว่าง = 401 ทันที ห้ามเทียบกับ "Bearer undefined"', () => {
    expect(SRC).toMatch(/if\s*\(!cronSecret\)\s*return NextResponse\.json\([^)]*401/)
  })

  it('[blocker] watchdog ต้องเว้นช่วงสุดท้ายไว้ ไม่ไล่ตามข้อความที่เพิ่งเข้ามา', () => {
    // 🛑 ไม่ใช่ margin เผื่อ: ข้อความที่เพิ่งเข้าเมื่อ 10 วินาทีก่อนอาจกำลังถูกแกะอยู่ใน
    // after() ณ วินาทีนี้พอดี — ไม่เว้นแล้ว watchdog จะเขียนร่างแข่งกับตัวดักจับที่กำลังจะสำเร็จ
    // แล้วชน UNIQUE ของ sourceChatMessageId
    expect(SRC).toContain('SETTLE_MS')
    expect(SRC).toMatch(/lte:\s*new Date\(now - SETTLE_MS\)/)
    expect(SRC).toMatch(/gte:\s*new Date\(now - LOOKBACK_MS\)/)
  })

  it('[blocker] ตัวตัดสินว่า "แกะไปแล้วหรือยัง" ต้องดูแถว Order ไม่ใช่ธงบน ChatMessage', () => {
    // ผลลัพธ์อยู่ที่ Order ซึ่งเป็นแหล่งความจริงเดียว — ธงแยกบนข้อความจะค้างทันทีที่มี
    // ทางเข้าใหม่ที่ลืมอัปเดต (stored-flag-vs-owner-truth.md)
    expect(SRC).toMatch(/prisma\.order\.findUnique\(\{\s*\n?\s*where:\s*\{\s*sourceChatMessageId/)
  })

  it('[blocker] watchdog ข้ามการ์ดของฟีเจอร์เอง (กันวนดักผลลัพธ์ตัวเอง)', () => {
    expect(SRC).toMatch(/type:\s*\{\s*not:\s*AUTO_ORDER_RESULT_TYPE\s*\}/)
    expect(SRC).toContain("senderRole: 'SHOP'")
  })

  it('[blocker] reaper ไม่ลบแถวจริง และไม่แตะใบทดสอบ', () => {
    expect(SRC).not.toMatch(/order\.delete/)
    expect(SRC).toMatch(/status:\s*'DRAFTED',\s*isDryRun:\s*false,\s*expiresAt:\s*\{\s*lte/)
    expect(SRC).toContain('DRAFT_EXPIRED_REASON')
  })

  it('[blocker] reaper ต้องล้าง draftReasons พร้อมกัน — ไม่งั้นชน CHECK ของฐาน', () => {
    const at = SRC.indexOf('runReaper')
    const body = SRC.slice(at)
    expect(body).toMatch(/draftReasons:\s*\[\]/)
  })

  it('[blocker] แต่ละ phase มี try/catch ของตัวเอง — phase หนึ่งล้มต้องไม่พาอีก phase ตกไปด้วย', () => {
    expect(SRC).toContain('result.watchdogError')
    expect(SRC).toContain('result.reaperError')
  })

  it('[blocker] มี cron entry ใน vercel.json', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      crons: { path: string; schedule: string }[]
    }
    const entry = vercel.crons.find((c) => c.path === '/api/cron/auto-order-sweeper')
    expect(entry, 'ไม่มี cron entry — route ที่ไม่มีใครเรียกคือโค้ดที่ไม่มีอยู่จริง').toBeTruthy()
  })
})
