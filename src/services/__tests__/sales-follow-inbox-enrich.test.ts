import { beforeEach, describe, expect, it, vi } from 'vitest'

const getRows = vi.fn()
vi.mock('../sales-follow-bot.service', () => ({ getFollowBotRowSummaries: (...a: unknown[]) => getRows(...a) }))

import { enrichWithFollowBot } from '../sales-follow-inbox-enrich'

const S = { sentRounds: 1, totalRounds: 3, awaitingShop: false, finalPending: null }

// ปีกกา: ห้ามคืนค่า mock จาก hook — vitest จะเรียกมันเป็น teardown
beforeEach(() => {
  getRows.mockReset()
})

describe('enrichWithFollowBot', () => {
  it('กล่องรวมหลายร้าน: 1 ครั้งต่อร้าน แยกตาม shopId ของแต่ละห้อง', async () => {
    getRows.mockImplementation(async (shopId: string, ids: string[]) => new Map(ids.map((id) => [id, shopId === 'A' ? S : null])))
    const out = await enrichWithFollowBot([
      { id: 'c1', shopId: 'A' }, { id: 'c2', shopId: 'B' }, { id: 'c3', shopId: 'A' },
    ])
    expect(getRows).toHaveBeenCalledTimes(2)
    expect(getRows).toHaveBeenCalledWith('A', ['c1', 'c3'])
    expect(out.map((r) => r.followBot)).toEqual([S, null, S])
  })
  it('service ล้ม = followBot null ทุกแถว ไม่ throw (รายการแชทต้องยังโหลดได้)', async () => {
    getRows.mockRejectedValue(new Error('db'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await enrichWithFollowBot([{ id: 'c1', shopId: 'A' }])).toEqual([{ id: 'c1', shopId: 'A', followBot: null }])
    spy.mockRestore()
  })
  it('รายการว่าง = ไม่ยิง query', async () => {
    expect(await enrichWithFollowBot([])).toEqual([])
    expect(getRows).not.toHaveBeenCalled()
  })
})
