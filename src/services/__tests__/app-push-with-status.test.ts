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
    expect(sendStatus).toHaveBeenCalledWith([TOK], 't', 'b', { a: 1 }, { subtitle: 's' })
  })
})
