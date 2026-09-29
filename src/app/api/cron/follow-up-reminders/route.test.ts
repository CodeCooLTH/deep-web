import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/services/follow-up-reminder.service', () => ({ runFollowUpReminders: vi.fn().mockResolvedValue({ sent: 0 }) }))
import { GET } from './route'

const req = (a?: string) => new Request('http://x', { headers: a ? { authorization: a } : {} })
afterEach(() => vi.unstubAllEnvs())

describe('cron follow-up-reminders auth [blocker]', () => {
  it('CRON_SECRET ว่าง ⇒ 401 แม้ส่ง "Bearer undefined"/"Bearer "', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(req('Bearer undefined'))).status).toBe(401)
    // env ไม่ตั้งเลย + "Bearer undefined" คือกรณีจริงที่ต้องกัน (เทียบสตริงตรง ๆ จะผ่าน)
    delete process.env.CRON_SECRET
    expect((await GET(req('Bearer undefined'))).status).toBe(401)
  })
  it('ไม่มี/ผิด header ⇒ 401', async () => {
    vi.stubEnv('CRON_SECRET', 's')
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer x'))).status).toBe(401)
  })
  it('ถูกต้อง ⇒ 200', async () => {
    vi.stubEnv('CRON_SECRET', 's')
    expect((await GET(req('Bearer s'))).status).toBe(200)
  })
})
