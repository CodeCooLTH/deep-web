/**
 * webhook ของบอทรายงานกลุ่ม LINE (00070 TFR-05 · AC-05-1/05-8) — ไม่แตะ DB: service ถูก mock ทั้งหมด
 * แกนที่พิสูจน์: ลายเซ็นผิด = 401 ก่อนทำอะไรทั้งสิ้น · หลังลายเซ็นผ่านตอบ 200 เสมอ
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'

const handleEvents = vi.hoisted(() => vi.fn())
vi.mock('@/services/line-report-command.service', () => ({ handleEvents }))
// after() ใช้นอก request context ไม่ได้ — รันทันทีแล้วคืน promise (ให้เทส await ได้ ไม่ปล่อย rejection ลอย)
const afterPromises: Promise<unknown>[] = []
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => Promise<unknown>) => { afterPromises.push(Promise.resolve(fn())) } }
})

import { POST } from './route'

const SECRET = 'report-bot-secret'
const sign = (raw: string, secret = SECRET) => createHmac('sha256', secret).update(raw).digest('base64')
const req = (raw: string, sig: string | null) =>
  new NextRequest('http://deepth.local/api/line-report/webhook', { method: 'POST', body: raw, headers: sig ? { 'x-line-signature': sig } : {} })
const body = JSON.stringify({ destination: 'U1', events: [{ type: 'join', source: { type: 'group', groupId: 'C1' } }] })

beforeEach(() => {
  vi.clearAllMocks()
  afterPromises.length = 0
  process.env.LINE_REPORT_BOT_CHANNEL_SECRET = SECRET
  process.env.LINE_REPORT_BOT_CHANNEL_ACCESS_TOKEN = 'tok'
  handleEvents.mockResolvedValue(undefined)
})

describe('POST /api/line-report/webhook', () => {
  it('ลายเซ็นถูก → 200 และ handleEvents ได้ events', async () => {
    const res = await POST(req(body, sign(body)))
    await Promise.all(afterPromises)
    expect(res.status).toBe(200)
    expect(handleEvents).toHaveBeenCalledTimes(1)
    expect(handleEvents.mock.calls[0][0]).toEqual([{ type: 'join', source: { type: 'group', groupId: 'C1' } }])
    expect(typeof handleEvents.mock.calls[0][1]).toBe('number')
  })

  it.each([
    ['ลายเซ็นผิด', sign(body, 'other')],
    ['ไม่มี header', null],
    ['ลายเซ็นของ body อื่น', sign('{}')],
  ])('%s → 401 INVALID_SIGNATURE และไม่ประมวลผลอะไร', async (_n, sig) => {
    const res = await POST(req(body, sig))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('INVALID_SIGNATURE')
    expect(handleEvents).not.toHaveBeenCalled()
    expect(afterPromises).toHaveLength(0)
  })

  it('secret ว่าง → 200 + warn ไม่ประมวลผล (แม้ลายเซ็นตรงกับค่าว่าง)', async () => {
    process.env.LINE_REPORT_BOT_CHANNEL_SECRET = ''
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await POST(req(body, sign(body, '')))
    expect(res.status).toBe(200)
    expect(warn).toHaveBeenCalled()
    expect(handleEvents).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('body ไม่ใช่ JSON (ลายเซ็นถูก) → 200', async () => {
    const res = await POST(req('not-json', sign('not-json')))
    expect(res.status).toBe(200)
    expect(handleEvents).not.toHaveBeenCalled()
  })

  it('ภายในล้ม (handleEvents reject / throw) → ยังตอบ 200 และ log ไม่มีข้อความผู้ใช้/token', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    handleEvents.mockRejectedValue(new Error('db down'))
    const res = await POST(req(body, sign(body)))
    await Promise.all(afterPromises)
    expect(res.status).toBe(200)
    const logged = JSON.stringify(err.mock.calls)
    expect(logged).toContain('Error')
    expect(logged).not.toContain('db down') // L-3: ไม่ log message
    expect(logged).not.toContain('tok')
    expect(logged).not.toContain(SECRET)
    err.mockRestore()
  })

  it('events เกิน 100 → ส่งต่อแค่ 100 แรก (L-4)', async () => {
    const raw = JSON.stringify({ events: Array.from({ length: 150 }, (_, i) => ({ type: 'join', n: i })) })
    await POST(req(raw, sign(raw)))
    await Promise.all(afterPromises)
    expect(handleEvents.mock.calls[0][0]).toHaveLength(100)
  })

  it('body ไม่ใช่ JSON: log ไม่ยกเนื้อ body', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await POST(req('secret-user-text', sign('secret-user-text')))
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-user-text')
    warn.mockRestore()
  })

  it('events ว่าง/ไม่ใช่ array → 200 ไม่เรียก handleEvents', async () => {
    const raw = JSON.stringify({ destination: 'U1', events: [] })
    expect((await POST(req(raw, sign(raw)))).status).toBe(200)
    const raw2 = JSON.stringify({ events: 'x' })
    expect((await POST(req(raw2, sign(raw2)))).status).toBe(200)
    expect(handleEvents).not.toHaveBeenCalled()
  })
})
