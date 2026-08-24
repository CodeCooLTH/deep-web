// route.test.ts — [blocker] ตัวกวาดคิวขาออกชั้น 3 (cron)
//
// 🛑 ทำไมเป็น [blocker]: เส้นทางคิวขาออกไม่มี auto-retry (D-2) — ถ้า cron ตัวนี้ไม่ทำงาน แถวที่
// `after()` ไม่ได้รันจะค้าง `QUEUED` ตลอดกาล ผู้ขายเห็น "กำลังส่ง" หมุนถาวร กดลองใหม่ไม่ได้
// (ปุ่มมีเฉพาะสถานะ FAILED) และกติกา "claim ค้างเกินเพดาน → FAILED" ก็อยู่ใน `sweepOutbox`
// ตัวเดียวกัน ⇒ ไม่มีวันกลายเป็น FAILED. อาการปลายทางเหมือน "ไม่มีอะไรเกิดขึ้น" ทุกประการ
// ไม่มี error ไม่มี log — จึงต้องมีด่านผูกไว้ ไม่ใช่พึ่งการที่ใครจะสังเกตเห็น

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const sweepOutbox = vi.fn()
vi.mock('@/services/chat-outbox.service', () => ({
  sweepOutbox: (...a: unknown[]) => sweepOutbox(...a),
}))

const { GET } = await import('./route')

const ORIGINAL_SECRET = process.env.CRON_SECRET

function req(auth?: string) {
  return new Request('https://seller.deepthailand.app/api/cron/chat-outbox', {
    headers: auth ? { authorization: auth } : {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sweepOutbox.mockResolvedValue({ rooms: 0, sent: 0, failed: 0, stale: 0, staleRows: [] })
})

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIGINAL_SECRET
})

describe('GET /api/cron/chat-outbox — auth', () => {
  // 🛑 เคสสำคัญที่สุดของชุดนี้: env ที่ยังไม่ได้ตั้ง (deploy ใหม่/preview) ต้อง **ปฏิเสธ** ไม่ใช่
  // ตกไปเทียบกับสตริง "Bearer undefined" ซึ่งใครก็เดาได้ แล้วเปิดให้คนนอกสั่งกวาดคิวของทั้งระบบ
  it('CRON_SECRET ว่าง → 401 และไม่แตะตัวกวาดเลย', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(req('Bearer undefined'))
    expect(res.status).toBe(401)
    expect(sweepOutbox).not.toHaveBeenCalled()
  })

  it('CRON_SECRET เป็นสตริงว่าง → 401 (ค่าที่ falsy ต้องถูกปฏิเสธเหมือนไม่มีค่า)', async () => {
    process.env.CRON_SECRET = ''
    const res = await GET(req('Bearer '))
    expect(res.status).toBe(401)
    expect(sweepOutbox).not.toHaveBeenCalled()
  })

  it('header ผิด → 401 และไม่แตะตัวกวาดเลย', async () => {
    process.env.CRON_SECRET = 'sekret'
    const res = await GET(req('Bearer wrong'))
    expect(res.status).toBe(401)
    expect(sweepOutbox).not.toHaveBeenCalled()
  })

  it('ไม่มี header เลย → 401', async () => {
    process.env.CRON_SECRET = 'sekret'
    expect((await GET(req())).status).toBe(401)
    expect(sweepOutbox).not.toHaveBeenCalled()
  })
})

describe('GET /api/cron/chat-outbox — งานที่ทำ', () => {
  it('header ถูก → เรียก sweepOutbox ด้วย owner "cron" และคืนตัวเลขที่ได้', async () => {
    process.env.CRON_SECRET = 'sekret'
    sweepOutbox.mockResolvedValue({
      rooms: 3,
      sent: 5,
      failed: 1,
      stale: 2,
      staleRows: [{ id: 'm1', conversationId: 'c1', shopId: 's1' }],
    })

    const res = await GET(req('Bearer sekret'))

    expect(res.status).toBe(200)
    expect(sweepOutbox).toHaveBeenCalledTimes(1)
    // owner ต้องเป็น 'cron' ไม่ใช่ 'after'/'sweep' — เจ้าของ claim คือสิ่งที่บอกได้ว่าใครหยิบแถวไป
    // ตอนต้องสืบว่าข้อความหายที่ชั้นไหน
    expect(sweepOutbox).toHaveBeenCalledWith({ owner: 'cron', limit: 50 })
    // 🛑 คืนเฉพาะตัวเลข — `staleRows` มี conversationId/shopId รายแถว ซึ่งมีไว้ให้ผู้เรียกใน
    // โปรเซสเดียวกันแจ้งเตือนต่อ ไม่ใช่ของที่ควรไหลออกไปกับ response ของ endpoint สาธารณะ
    await expect(res.json()).resolves.toEqual({ rooms: 3, sent: 5, failed: 1, stale: 2 })
  })

  it('log ตัวเลขทุกรอบแม้เป็นศูนย์ — stale ที่สูงผิดปกติคือสัญญาณของบั๊กชั้นบน', async () => {
    process.env.CRON_SECRET = 'sekret'
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await GET(req('Bearer sekret'))
      expect(spy).toHaveBeenCalledWith('[chat-outbox]', JSON.stringify({ rooms: 0, sent: 0, failed: 0, stale: 0 }))
    } finally {
      spy.mockRestore()
    }
  })
})

describe('vercel.json — ตารางเวลาของ cron', () => {
  // 🛑 กฎที่ "เขียนไว้" ยังไม่ใช่กฎที่ "บังคับได้" (docs/conventions/rule-must-be-enforced-not-described.md)
  // route ที่ไม่มี entry ใน vercel.json จะไม่มีใครเรียกเลย — และมันจะเงียบสนิท: ไฟล์ยังอยู่ tsc ผ่าน
  // เทสของ route ก็ยังเขียว. ด่านนี้คือสิ่งเดียวที่จะแดงถ้ามีคนลบ entry ทิ้งตอน merge/แก้ config
  const cfg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
    crons?: Array<{ path: string; schedule: string }>
  }
  const entry = cfg.crons?.find((c) => c.path === '/api/cron/chat-outbox')

  it('มี entry ของ /api/cron/chat-outbox', () => {
    expect(entry).toBeDefined()
  })

  // ความถี่ผูกกับ STALE_CLAIM_MS (3 นาที): ห่างกว่าเพดานของตัวเอง = แถวที่ค้างถูกปล่อยทิ้งนานกว่า
  // ที่กติกาสัญญาไว้ ถ้าจำเป็นต้องถอยเป็นทุก 2 นาที ต้องขยับ STALE_CLAIM_MS เป็น 5 นาทีคู่กัน (D-8)
  it('ตารางเวลาถี่กว่าเพดาน claim ค้าง (ทุก 1 นาที)', () => {
    expect(entry?.schedule).toBe('* * * * *')
  })
})
