/**
 * line-report-command.service (00070 TFR-05/06/20) — ส่วนที่ไม่แตะ DB: payload ตัวอย่างตามรูป LINE-API-Facts §1
 * (bind/leave ถูก mock; เส้นทางที่ใช้ DB จริงอยู่ใน line-report-bind.db.test.ts)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const lc = vi.hoisted(() => ({ replyTo: vi.fn(), pushToGroup: vi.fn(), fetchGroupSummary: vi.fn(), leaveGroup: vi.fn() }))
vi.mock('@/lib/line-report/line-client', () => lc)
const bind = vi.hoisted(() => ({ consumeBindCode: vi.fn(), recordAndCountRate: vi.fn() }))
vi.mock('@/services/line-report-bind.service', () => bind)
const group = vi.hoisted(() => ({ markInactive: vi.fn() }))
vi.mock('@/services/line-report-group.service', () => group)

import { handleEvents } from '@/services/line-report-command.service'
import { BIND_FAILED_MESSAGE, GREETING_MESSAGE, SINGLE_CHAT_HELP_MESSAGE, bindSuccessMessage } from '@/lib/line-report/messages'

const base = { mode: 'active', timestamp: Date.now(), webhookEventId: '01HXXX', deliveryContext: { isRedelivery: false }, replyToken: 'rt1' }
// message ในกลุ่มจริงอาจไม่มี userId (LINE-API-Facts §1) — ต้องไม่บังคับ
const groupMsg = (text: string, extra: Record<string, unknown> = {}) => ({
  ...base, type: 'message', source: { type: 'group', groupId: 'C1' }, message: { id: '1', type: 'text', text }, ...extra,
})
const text = () => lc.replyTo.mock.calls.at(-1)?.[1]?.[0]?.altText

beforeEach(() => {
  vi.clearAllMocks()
  lc.replyTo.mockResolvedValue({ ok: true, duplicate: false })
  bind.consumeBindCode.mockResolvedValue({ outcome: 'INVALID' })
})

describe('handleEvents', () => {
  it('join → ทักทาย (reply)', async () => {
    await handleEvents([{ ...base, type: 'join', source: { type: 'group', groupId: 'C1' } }], Date.now())
    expect(lc.replyTo).toHaveBeenCalledWith('rt1', expect.any(Array))
    expect(text()).toBe(GREETING_MESSAGE)
  })

  it('leave → markInactive(groupId) · ไม่มี replyToken ก็ไม่ error', async () => {
    await handleEvents([{ mode: 'active', type: 'leave', source: { type: 'group', groupId: 'C9' } }], Date.now())
    expect(group.markInactive).toHaveBeenCalledWith('C9')
    expect(lc.replyTo).not.toHaveBeenCalled()
  })

  it('message ในกลุ่มที่ไม่มี userId + ผูก <โค้ด> → consumeBindCode(lineGroupId, code) แล้ว reply ผลสำเร็จ', async () => {
    bind.consumeBindCode.mockResolvedValue({ outcome: 'OK', groupName: 'ทีม', shopNames: ['ร้าน ก', 'ร้าน ข'] })
    await handleEvents([groupMsg('ผูก ABCD-2345')], Date.now())
    expect(bind.consumeBindCode).toHaveBeenCalledWith(expect.objectContaining({ lineGroupId: 'C1', code: 'ABCD2345' }))
    expect(text()).toBe(bindSuccessMessage('ทีม', ['ร้าน ก', 'ร้าน ข']))
  })

  it('ทุกผลที่ไม่ใช่ OK ของ INVALID/RATE_LIMITED/NOT_PAID ตอบข้อความเดียวกันทุกตัวอักษร', async () => {
    const out: string[] = []
    for (const outcome of ['INVALID', 'RATE_LIMITED', 'NOT_PAID']) {
      bind.consumeBindCode.mockResolvedValue({ outcome })
      await handleEvents([groupMsg('ผูก ABCD-2345')], Date.now())
      out.push(text())
    }
    expect(new Set(out)).toEqual(new Set([BIND_FAILED_MESSAGE]))
  })

  it('ผูกที่เป็น redelivery → ข้าม (ไม่นับ attempt ซ้ำ ไม่ตอบ)', async () => {
    await handleEvents([groupMsg('ผูก ABCD-2345', { deliveryContext: { isRedelivery: true } })], Date.now())
    expect(bind.consumeBindCode).not.toHaveBeenCalled()
    expect(lc.replyTo).not.toHaveBeenCalled()
  })

  it('standby ข้ามทุกชนิด', async () => {
    await handleEvents([groupMsg('ผูก ABCD-2345', { mode: 'standby' }), { ...base, mode: 'standby', type: 'join', source: { type: 'group', groupId: 'C1' } }], Date.now())
    expect(bind.consumeBindCode).not.toHaveBeenCalled()
    expect(lc.replyTo).not.toHaveBeenCalled()
  })

  it('แชทเดี่ยว: ข้อความ → ช่วยเหลือสั้น ๆ · ไม่ถูกตีเป็นการผูก · ไม่ใช่ข้อความ → เมิน', async () => {
    const single = (message: unknown) => ({ ...base, type: 'message', source: { type: 'user', userId: 'U1' }, message })
    await handleEvents([single({ id: '1', type: 'text', text: 'ผูก ABCD-2345' })], Date.now())
    expect(text()).toBe(SINGLE_CHAT_HELP_MESSAGE)
    expect(bind.consumeBindCode).not.toHaveBeenCalled()
    vi.clearAllMocks()
    await handleEvents([single({ id: '2', type: 'sticker' }), { ...base, type: 'follow', source: { type: 'user', userId: 'U1' } }], Date.now())
    expect(lc.replyTo).not.toHaveBeenCalled()
  })

  it('room / ชนิดไม่รู้จัก / ไม่ใช่ text / ข้อความทั่วไป → เมินเงียบ ไม่ error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await handleEvents(
      [
        { ...groupMsg('ผูก ABCD-2345'), source: { type: 'room', roomId: 'R1' } },
        { ...base, type: 'memberJoined', source: { type: 'group', groupId: 'C1' } },
        groupMsg('x', { message: { id: '1', type: 'image' } }),
        groupMsg('สรุปวันนี้ครับ'),
        groupMsg('สวัสดีครับทุกคน'),
        null, 'junk', 42, {}, { type: 'message' },
      ],
      Date.now(),
    )
    expect(lc.replyTo).not.toHaveBeenCalled()
    expect(bind.recordAndCountRate).not.toHaveBeenCalled()
    expect(err).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('event หนึ่งล้ม → event ถัดไปยังถูกทำ · log ไม่มีข้อความผู้ใช้/โค้ด', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    bind.consumeBindCode.mockRejectedValueOnce(new Error('db down'))
    await handleEvents([groupMsg('ผูก ABCD-2345'), { ...base, type: 'join', source: { type: 'group', groupId: 'C2' } }], Date.now())
    expect(text()).toBe(GREETING_MESSAGE)
    const logged = JSON.stringify(err.mock.calls)
    expect(logged).not.toContain('db down') // L-3: ไม่ log message
    expect(logged).toContain('Error')
    expect(logged).not.toContain('ABCD2345')
    err.mockRestore()
  })

  it('ซอร์ส: import จาก line-client ได้เฉพาะ replyTo · ไม่ import send.service (allow-list)', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/services/line-report-command.service.ts', 'utf8')
    const lcImports = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@\/lib\/line-report\/line-client'/g)]
      .flatMap((m) => m[1].split(',').map((x) => x.trim().replace(/^type\s+/, '')).filter(Boolean))
    expect(lcImports).toEqual(['replyTo', 'SendResult'])
    expect(src).not.toMatch(/line-report-send\.service/)
    expect(src).not.toMatch(/pushToGroup|message\/push/)
  })

  it('ผูก: เกิน 50 วินาทีจาก event.timestamp → ไม่เรียก reply (และไม่ push แทน)', async () => {
    await handleEvents([groupMsg('ผูก ABCD-2345', { timestamp: Date.now() - 90_000 })], Date.now())
    expect(lc.replyTo).not.toHaveBeenCalled()
    expect(lc.pushToGroup).not.toHaveBeenCalled()
  })
})
