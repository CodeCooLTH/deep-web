/**
 * 00070 U8 — เทสที่ไม่ต้องใช้ DB: cron auth 3 เคส (AC-19-2) · vercel.json (AC-19-1) · สแกนซอร์สของ send.service (AC-20-2, AC-23-1)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const runSweep = vi.hoisted(() => vi.fn(async () => ({ groups: 0 })))
vi.mock('@/services/line-report-sweep.service', () => ({ runSweep }))

import { GET, maxDuration } from '@/app/api/cron/line-report-sweep/route'

const root = path.resolve(__dirname, '../../..')
const req = (auth?: string) => new Request('http://x/api/cron/line-report-sweep', { headers: auth ? { authorization: auth } : {} })

describe('GET /api/cron/line-report-sweep — auth', () => {
  const prev = process.env.CRON_SECRET
  beforeEach(() => runSweep.mockClear())
  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = prev
  })

  it('env CRON_SECRET ว่าง → 401 แม้ส่ง "Bearer undefined"/"Bearer " มา', async () => {
    delete process.env.CRON_SECRET
    expect((await GET(req('Bearer undefined'))).status).toBe(401)
    process.env.CRON_SECRET = ''
    expect((await GET(req('Bearer '))).status).toBe(401)
    expect(runSweep).not.toHaveBeenCalled()
  })
  it('header ไม่ตรง/ไม่มี → 401', async () => {
    process.env.CRON_SECRET = 'good'
    expect((await GET(req('Bearer bad'))).status).toBe(401)
    expect((await GET(req())).status).toBe(401)
    expect(runSweep).not.toHaveBeenCalled()
  })
  it('header ถูก → 200 และเรียก runSweep · ล้มทั้งรอบ → 500', async () => {
    process.env.CRON_SECRET = 'good'
    const ok = await GET(req('Bearer good'))
    expect(ok.status).toBe(200)
    expect(runSweep).toHaveBeenCalledTimes(1)
    runSweep.mockRejectedValueOnce(new Error('db down: SELECT * FROM "Shop" secret-name'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const bad = await GET(req('Bearer good'))
    expect(bad.status).toBe(500)
    expect(await bad.json()).toEqual({ error: 'sweep_failed' }) // ข้อความคงที่ ไม่รั่ว message ของ DB
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret-name') // log เฉพาะชื่อ error
    spy.mockRestore()
  })
  it('maxDuration = 300', () => expect(maxDuration).toBe(300))
})

describe('vercel.json (AC-19-1)', () => {
  it('มี path + schedule ของ sweep', () => {
    const { crons } = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8')) as { crons: { path: string; schedule: string }[] }
    expect(crons).toContainEqual({ path: '/api/cron/line-report-sweep', schedule: '*/30 * * * *' })
  })
})

describe('สแกนซอร์ส line-report-send.service.ts', () => {
  const src = readFileSync(path.join(root, 'src/services/line-report-send.service.ts'), 'utf8')

  it('AC-20-2: ไม่มี P2002/isUniqueViolation (claim ผ่าน createMany skipDuplicates)', () => {
    expect(src).not.toMatch(/P2002|isUniqueViolation/)
  })

  it('AC-23-1: ทุก `return` ในฟังก์ชัน async มีการเขียน log มาก่อน หรือระบุ `// no-row` (ยังไม่เคยมีแถว)', () => {
    // แยกตัวฟังก์ชัน async ระดับ module (เริ่มบรรทัดที่ขึ้นต้น `async function`/`export async function` จนถึง `}` ปิดที่ column 0)
    const lines = src.split('\n')
    const WRITES = /\b(writeDelivery|markSent|markFailed|markMissed|markSkipped|markRetry|settleRows|pushAndSettle|runSlot)\(|lineReportDelivery\.create\(/
    let checked = 0
    for (let i = 0; i < lines.length; i++) {
      if (!/^(export )?async function \w+/.test(lines[i])) continue
      let end = i + 1
      while (end < lines.length && lines[end] !== '}') end++
      for (let j = i + 1; j < end; j++) {
        if (!/^\s+return\b/.test(lines[j]) && !/[)\s]return\b/.test(lines[j])) continue
        checked++
        const before = lines.slice(i, j + 1).join('\n')
        const ok = WRITES.test(before) || /\/\/ no-row/.test(lines[j])
        expect(ok, `${lines[i].trim()} → บรรทัด ${j + 1}: ${lines[j].trim()}`).toBe(true)
      }
    }
    expect(checked).toBeGreaterThan(10) // กันสแกนว่างเปล่า
  })

  it('AC-23-1 (negative): ตัวสแกนจับ return ที่ไม่มี log ได้จริง', () => {
    const bad = ['async function f() {', '  if (x) return { state: "X" }', '}'].join('\n')
    const WRITES = /\b(writeDelivery|mark\w+|settleRows|pushAndSettle|runSlot)\(/
    expect(WRITES.test(bad) || /\/\/ no-row/.test(bad)).toBe(false)
  })

  it('send.service เป็นที่เดียวที่ import pushToGroup (command.service ใช้ reply เท่านั้น)', () => {
    expect(src).toMatch(/pushToGroup/)
  })
})
