/**
 * [blocker] สัญญาเรื่อง "เวลา" ของคิวขาออก — ตัวเลข 5 ตัวที่ต้องเรียงกันให้ถูก
 *
 * ที่มา (รีวิวก่อน merge 2026-08-23): `maxDuration = 120` ของ POST /messages, `STALE_CLAIM_MS`
 * = 3 นาที, งบเวลาของตัวกวาด/webhook และตารางเวลา cron **ผูกกันด้วยคอมเมนต์ล้วน ๆ** ไม่มีเทส
 * ไหนแตะ `maxDuration` เลยสักตัว ⇒ ขยับ `STALE_CLAIM_MS` เป็น 90 วินาทีวันหน้า **ไม่มีอะไรแดง**
 * แล้วจะเกิดช่วงที่ `after()` ยังยิงอยู่จริงขณะที่ตัวกวาดปิดแถวเป็น "ไม่แน่ใจว่าส่งไปหรือยัง"
 * ไปแล้ว = ผู้ขายเห็นบับเบิลแดงของข้อความที่กำลังจะส่งสำเร็จ แล้วกดส่งซ้ำ = ลูกค้าได้ข้อความซ้ำ
 *
 * `docs/conventions/rule-must-be-enforced-not-described.md` ตรงตัว — กฎที่ "เขียนไว้" ยังไม่ใช่
 * กฎที่ "บังคับได้"
 *
 * 🛑 ทุกค่าถูก **อ่านจากของจริง** ไม่ใช่พิมพ์ซ้ำในเทส: `STALE_CLAIM_MS` import ตรง (ไฟล์นั้นเป็น
 * ฟังก์ชันบริสุทธิ์ ไม่แตะ DB) ส่วนที่เหลืออ่านจากซอร์ส/`vercel.json` ด้วย regex เพราะ
 * `maxDuration` เป็น route segment config ที่ import ข้ามฝั่ง server เข้ามาในเทสไม่ได้
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STALE_CLAIM_MS } from '@/lib/chat-send-queue'

const root = process.cwd()
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

/** ดึง `export const maxDuration = N` จากไฟล์ route — ไม่เจอ = เทสต้องแดง ไม่ใช่ข้ามไป */
function maxDurationOf(rel: string): number {
  const m = read(rel).match(/export const maxDuration\s*=\s*(\d+)/)
  expect(m, `${rel} ไม่มี maxDuration — route ที่ทำ network I/O ใน after() ต้องประกาศงบเวลาเสมอ`).not.toBeNull()
  return Number(m![1])
}

/** ดึงค่าคงที่ตัวเลข (รองรับ `45_000`) จากซอร์สของ service */
function constOf(rel: string, name: string): number {
  const m = read(rel).match(new RegExp(`${name}\\s*=\\s*([0-9_]+)`))
  expect(m, `${rel} ไม่มีค่าคงที่ ${name}`).not.toBeNull()
  return Number(m![1].replace(/_/g, ''))
}

const MESSAGES_ROUTE = 'src/app/api/chat/conversations/[id]/messages/route.ts'
const OUTBOX_SERVICE = 'src/services/chat-outbox.service.ts'
const CRON_ROUTE = 'src/app/api/cron/chat-outbox/route.ts'
const FB_WEBHOOK = 'src/app/api/channels/facebook/webhook/route.ts'
const LINE_WEBHOOK = 'src/app/api/channels/line/webhook/route.ts'

describe('[blocker] งบเวลาของคิวขาออกต้องเรียงกันถูก (ไม่ใช่แค่มีคอมเมนต์อธิบาย)', () => {
  it('ค่าที่อ่านมาได้ต้องเป็นตัวเลขจริง (กันเทสเขียวเพราะ regex ไม่เจออะไรเลย)', () => {
    expect(STALE_CLAIM_MS).toBeGreaterThan(0)
    expect(maxDurationOf(MESSAGES_ROUTE)).toBeGreaterThan(0)
    expect(constOf(OUTBOX_SERVICE, 'WEBHOOK_DRAIN_BUDGET_MS')).toBeGreaterThan(0)
    expect(constOf(OUTBOX_SERVICE, 'SWEEP_TIME_BUDGET_MS')).toBeGreaterThan(0)
  })

  /**
   * 🛑 หัวใจของข้อนี้: invocation ที่ `after()` ยังทำงานอยู่ ห้ามอยู่ได้นานกว่าเพดาน claim ค้าง
   *
   * ถ้า `maxDuration` ≥ `STALE_CLAIM_MS` จะมีช่วงที่ worker **ยังยิงอยู่จริง** ขณะที่ตัวกวาด
   * ตัดสินว่าแถวที่มันถือ claim อยู่ "ค้างเกินเพดาน" แล้วปิดเป็น FAILED ด้วย `UNCERTAIN_SEND_REASON`
   * ⇒ ผู้ขายเห็นบับเบิลแดงทั้งที่ระบบยังทำงานปกติ และต้องพึ่ง R-F กันการเขียนทับอีกชั้น
   * เพดานที่ต่ำกว่าทำให้ "แพลตฟอร์มฆ่า" กับ "ตัวกวาดยึดคืน" ไม่มีวันคาบเกี่ยวกัน
   */
  it('maxDuration ของ POST /messages ต้อง < STALE_CLAIM_MS', () => {
    expect(
      maxDurationOf(MESSAGES_ROUTE) * 1000,
      'invocation อยู่ได้นานกว่าเพดาน claim ค้าง = ตัวกวาดปิดแถวที่ worker ยังยิงอยู่',
    ).toBeLessThan(STALE_CLAIM_MS)
  })

  it('งบเวลาของ webhook (ชั้น 2) ต้อง < maxDuration ของทั้งสอง webhook route', () => {
    const budget = constOf(OUTBOX_SERVICE, 'WEBHOOK_DRAIN_BUDGET_MS')
    for (const route of [FB_WEBHOOK, LINE_WEBHOOK]) {
      expect(budget, `${route}: งบระบายเกิน maxDuration = runtime ตัดกลาง claim`).toBeLessThan(
        maxDurationOf(route) * 1000,
      )
    }
  })

  it('งบเวลาของตัวกวาด (cron) ต้อง < maxDuration ของ cron route', () => {
    expect(constOf(OUTBOX_SERVICE, 'SWEEP_TIME_BUDGET_MS')).toBeLessThan(maxDurationOf(CRON_ROUTE) * 1000)
  })

  /**
   * D-8: ตัวกวาดต้องมาถี่กว่าเพดาน claim ค้าง ไม่งั้นแถวที่ค้างจริงถูกปล่อยทิ้งนานกว่าเพดานของ
   * ตัวเอง — และ **ไม่มีใครกลายเป็น FAILED ให้กดซ้ำได้** เพราะกติกานั้นอยู่ใน `sweepOutbox` เอง
   */
  it('cron ต้องมาถี่กว่า STALE_CLAIM_MS (อ่านตารางเวลาจริงจาก vercel.json)', () => {
    const crons = JSON.parse(read('vercel.json')).crons as { path: string; schedule: string }[]
    const entry = crons.find((c) => c.path === '/api/cron/chat-outbox')
    expect(entry, 'ไม่มี cron ของคิวขาออกใน vercel.json = ตัวการันตีของทั้งฟีเจอร์หายไป').toBeTruthy()

    // รองรับเฉพาะรูปแบบที่ใช้จริง: `* * * * *` (ทุกนาที) หรือ `*/N * * * *` (ทุก N นาที)
    const minute = entry!.schedule.split(' ')[0]!
    const everyMinutes = minute === '*' ? 1 : Number(minute.replace('*/', ''))
    expect(Number.isFinite(everyMinutes) && everyMinutes > 0, `อ่านตารางเวลาไม่ออก: ${entry!.schedule}`).toBe(true)

    expect(
      everyMinutes * 60_000,
      'cron ห่างกว่าเพดาน claim ค้าง = แถวที่ค้างจริงไม่มีใครมาปิดให้ทันเวลา (D-8)',
    ).toBeLessThan(STALE_CLAIM_MS)
  })
})
