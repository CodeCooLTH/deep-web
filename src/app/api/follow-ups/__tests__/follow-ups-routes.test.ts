// 00066 T5 [blocker] — route ทุกตัว 401 เมื่อ session ไม่มี id · mapper ครอบทุก *Error ของ service
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
const svc = vi.hoisted(() => ({ called: vi.fn() }))
vi.mock('@/lib/chat-scope', async (orig) => ({
  ...(await orig<typeof import('@/lib/chat-scope')>()),
  resolveChatScope: svc.called,
  resolveConversationShopId: svc.called,
}))

import * as service from '@/services/customer-follow-up.service'
import { getServerSession } from 'next-auth'
import { mapFollowUpError } from '../_shared'
import * as convRoute from '@/app/api/chat/conversations/[id]/follow-ups/route'
import * as idRoute from '../[id]/route'
import * as completeRoute from '../[id]/complete/route'
import * as outcomeRoute from '../[id]/outcome/route'
import * as reopenRoute from '../[id]/reopen/route'
import * as snoozeRoute from '../[id]/snooze/route'
import * as mineRoute from '../mine/route'
import * as boardRoute from '../board/route'

const ID = '11111111-1111-1111-1111-111111111111'
const params = { params: Promise.resolve({ id: ID }) }
const req = (method: string) =>
  new NextRequest(`https://seller.deepthailand.app/api/x`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: '{}' }),
  })

const handlers: [string, (r: NextRequest, c: typeof params) => Promise<Response>, string][] = [
  ['conv GET', convRoute.GET, 'GET'],
  ['conv POST', convRoute.POST, 'POST'],
  ['PATCH', idRoute.PATCH, 'PATCH'],
  ['DELETE', idRoute.DELETE, 'DELETE'],
  ['complete', completeRoute.POST, 'POST'],
  ['outcome', outcomeRoute.POST, 'POST'],
  ['reopen', reopenRoute.POST, 'POST'],
  ['snooze', snoozeRoute.POST, 'POST'],
  ['mine', mineRoute.GET as never, 'GET'],
  ['board', boardRoute.GET as never, 'GET'],
]

describe('ทุก route 401 เมื่อ session ไม่มี id', () => {
  beforeEach(() => vi.clearAllMocks())
  // session มี user แต่ไม่มี id = เคสที่ cast `(session.user as {id}).id` จะปล่อยผ่าน (คลาส session-exists-is-not-identity)
  const sessions: [string, unknown][] = [
    ['null', null],
    ['user ไม่มี id', { user: { name: 'x' } }],
    ['id ว่าง', { user: { id: '' } }],
  ]
  for (const [name, h, method] of handlers) {
    for (const [sname, session] of sessions) {
      it(`${name} · session ${sname}`, async () => {
        vi.mocked(getServerSession).mockResolvedValue(session as never)
        const res = await h(req(method), params)
        expect(res.status).toBe(401)
        expect(svc.called).not.toHaveBeenCalled()
      })
    }
  }
})

describe('mapFollowUpError ครอบทุก *Error ที่ service export', () => {
  const errorClasses = Object.entries(service).filter(
    ([k, val]) => /Error$/.test(k) && typeof val === 'function',
  ) as [string, new () => Error][]
  it('enumerate ได้อย่างน้อย 4 class (กัน filter ว่างแล้วเขียวปลอม)', () => {
    expect(errorClasses.length).toBeGreaterThanOrEqual(4)
  })
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  for (const [name, Cls] of errorClasses) {
    it(`${name} ไม่ตกเป็น 500`, () => {
      const res = mapFollowUpError(new Cls())
      expect(res.status).toBeLessThan(500)
      expect(spy).not.toHaveBeenCalled()
    })
  }
  it('error แปลกหน้า = 500', () => {
    expect(mapFollowUpError(new Error('boom')).status).toBe(500)
  })
})
