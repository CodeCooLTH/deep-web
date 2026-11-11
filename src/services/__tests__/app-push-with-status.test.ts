import { describe, it, expect, vi, beforeEach } from 'vitest'

const { findMany, deleteMany, sendStatus } = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  sendStatus: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { pushToken: { findMany, deleteMany } } }))
vi.mock('@/lib/expo-push', async () => {
  const actual = await vi.importActual<typeof import('@/lib/expo-push')>('@/lib/expo-push')
  return { ...actual, sendExpoPushWithStatus: sendStatus, sendExpoPush: vi.fn() }
})

import { pushToUsersWithStatus, pushToUsers } from '../app-push.service'

const TOK = 'ExponentPushToken[a]'
beforeEach(() => vi.clearAllMocks())

describe('pushToUsersWithStatus [blocker 00066 AC-ACT-41]', () => {
  it('ไม่มีผู้รับ / ไม่มีแถว token / token ไม่ใช่รูป Expo → NO_TOKEN และไม่ยิง', async () => {
    expect(await pushToUsersWithStatus([], 't', 'b')).toBe('NO_TOKEN')
    findMany.mockResolvedValueOnce([])
    expect(await pushToUsersWithStatus(['u'], 't', 'b')).toBe('NO_TOKEN')
    findMany.mockResolvedValueOnce([{ token: 'junk' }])
    expect(await pushToUsersWithStatus(['u'], 't', 'b')).toBe('NO_TOKEN')
    expect(sendStatus).not.toHaveBeenCalled()
  })
  it('delivered → SENT · ไม่ delivered → FAILED', async () => {
    findMany.mockResolvedValue([{ token: TOK }])
    sendStatus.mockResolvedValueOnce({ invalid: [], delivered: true })
    expect(await pushToUsersWithStatus(['u'], 't', 'b')).toBe('SENT')
    sendStatus.mockResolvedValueOnce({ invalid: [], delivered: false })
    expect(await pushToUsersWithStatus(['u'], 't', 'b')).toBe('FAILED')
  })
  it('DB ล้ม → FAILED ไม่ throw', async () => {
    findMany.mockRejectedValueOnce(new Error('db'))
    expect(await pushToUsersWithStatus(['u'], 't', 'b')).toBe('FAILED')
  })
  it('ลบ token ที่ invalid', async () => {
    findMany.mockResolvedValue([{ token: TOK }])
    sendStatus.mockResolvedValueOnce({ invalid: [TOK], delivered: true })
    await pushToUsersWithStatus(['u'], 't', 'b')
    expect(deleteMany).toHaveBeenCalledWith({ where: { token: { in: [TOK] } } })
  })
  it('pushToUsers เดิมคืน void และส่ง options ต่อ (wrapper)', async () => {
    findMany.mockResolvedValue([{ token: TOK }])
    sendStatus.mockResolvedValueOnce({ invalid: [], delivered: true })
    expect(await pushToUsers(['u'], 't', 'b', { a: 1 }, { subtitle: 's' })).toBeUndefined()
    expect(sendStatus).toHaveBeenCalledWith([{ token: TOK }], 't', 'b', { a: 1 }, { subtitle: 's' })
  })
  it('ส่ง platform ของแต่ละเครื่องต่อให้ตัวส่ง (Android ประกอบข้อความต่างจาก iOS)', async () => {
    findMany.mockResolvedValue([{ token: TOK, platform: 'android' }])
    sendStatus.mockResolvedValueOnce({ invalid: [], delivered: true })
    await pushToUsers(['u'], 't', 'b', undefined, { subtitle: 's' })
    expect(findMany.mock.calls.at(-1)?.[0]).toMatchObject({ select: { token: true, platform: true } })
    expect(sendStatus).toHaveBeenLastCalledWith([{ token: TOK, platform: 'android' }], 't', 'b', undefined, { subtitle: 's' })
  })
})

describe('[blocker] เสียงแจ้งเตือนส่งต่อถึงตัวส่ง (2026-10-09)', () => {
  it('pushToUsers ส่ง sound/subtitle ต่อให้ sendExpoPushWithStatus ครบ — ไม่ทำหล่นระหว่างทาง', async () => {
    findMany.mockResolvedValue([{ token: TOK, platform: 'ios' }])
    sendStatus.mockResolvedValueOnce({ invalid: [], delivered: true })
    await pushToUsers(['u'], 't', 'b', { type: 'chat' }, { subtitle: 's', sound: 'chat' })
    expect(sendStatus.mock.calls[0][4]).toEqual({ subtitle: 's', sound: 'chat' })
  })
})

describe('[blocker] เลขบนไอคอนรายคน (badgeByUser · 2026-11-11)', () => {
  it('ทุกเครื่องของคนเดียวกันได้เลขของเจ้าของเครื่อง · คนที่ไม่อยู่ใน map ได้ undefined (ไม่แตะเลขเดิม) · ไม่ส่ง userId ต่อ', async () => {
    findMany.mockResolvedValue([
      { userId: 'a', token: 'ExponentPushToken[a1]', platform: 'ios' },
      { userId: 'a', token: 'ExponentPushToken[a2]', platform: 'android' },
      { userId: 'b', token: 'ExponentPushToken[b1]', platform: 'ios' },
    ])
    sendStatus.mockResolvedValueOnce({ invalid: [], delivered: true })
    await pushToUsers(['a', 'b'], 't', 'b', undefined, { badgeByUser: new Map([['a', 3]]) })
    expect(findMany.mock.calls.at(-1)?.[0]).toMatchObject({ select: { userId: true } })
    const targets = sendStatus.mock.calls[0][0] as { token: string; badge?: number; userId?: string }[]
    expect(targets.map((t) => [t.token, t.badge])).toEqual([
      ['ExponentPushToken[a1]', 3],
      ['ExponentPushToken[a2]', 3],
      ['ExponentPushToken[b1]', undefined],
    ])
    expect(targets.every((t) => !('userId' in t))).toBe(true)
  })
})
