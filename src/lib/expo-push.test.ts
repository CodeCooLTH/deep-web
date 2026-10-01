import { describe, it, expect, vi, afterEach } from 'vitest'
import { composeForPlatform, sendExpoPush, sendExpoPushWithStatus } from './expo-push'

afterEach(() => vi.unstubAllGlobals())

describe('sendExpoPush', () => {
  it('ข้าม token ที่ไม่ใช่ Expo (ไม่ยิง fetch)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const invalid = await sendExpoPush(['random-token'], 't', 'b')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(invalid).toEqual([])
  })

  it('คืน token ที่ DeviceNotRegistered (ไว้ลบ)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const invalid = await sendExpoPush(
      ['ExponentPushToken[aaa]', 'ExponentPushToken[bbb]'],
      't',
      'b',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(invalid).toEqual(['ExponentPushToken[bbb]'])
  })

  it('fetch error → คืน [] (best-effort ไม่ throw)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const invalid = await sendExpoPush(['ExponentPushToken[x]'], 't', 'b')
    expect(invalid).toEqual([])
  })
})

describe('sendExpoPushWithStatus (00066)', () => {
  it('res.ok → delivered=true + คืน invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) }),
    )
    const r = await sendExpoPushWithStatus(['ExponentPushToken[a]'], 't', 'b')
    expect(r).toEqual({ invalid: [], delivered: true })
  })
  it('HTTP ไม่ ok → delivered=false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => null }))
    const r = await sendExpoPushWithStatus(['ExponentPushToken[a]'], 't', 'b')
    expect(r.delivered).toBe(false)
  })
  it('fetch throw → delivered=false ไม่ throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')))
    expect((await sendExpoPushWithStatus(['ExponentPushToken[a]'], 't', 'b')).delivered).toBe(false)
  })
  it('ไม่มี token รูป Expo → ไม่ยิง fetch', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await sendExpoPushWithStatus(['x'], 't', 'b')).toEqual({ invalid: [], delivered: false })
    expect(f).not.toHaveBeenCalled()
  })
  it('sendExpoPush เดิมยังคืนแค่ invalid แม้ ok=true (wrapper)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }),
      }),
    )
    expect(await sendExpoPush(['ExponentPushToken[z]'], 't', 'b')).toEqual(['ExponentPushToken[z]'])
  })
})

/**
 * [blocker] Android ไม่มีบรรทัด subtitle — ส่งชุดเดียวกับ iOS = "ใครทัก" หายเงียบ ๆ
 * (แชทผู้ขาย: เพจ / คนส่ง / ข้อความ — user กำหนดลำดับ 2026-08-08)
 */
describe('[blocker] composeForPlatform — Android ได้ชื่อคนส่งนำหน้าข้อความ', () => {
  const lines = { title: 'BT Premium', subtitle: 'สมชาย', body: 'สนใจครับ' }
  it('android → ยกบรรทัดกลางไปนำหน้า body · ไม่ส่ง subtitle', () => {
    expect(composeForPlatform('android', lines)).toEqual({ title: 'BT Premium', body: 'สมชาย: สนใจครับ' })
  })
  it('ios / ไม่รู้ platform → คงเดิม (แถวเก่ามาจากแอป iOS ล้วน)', () => {
    expect(composeForPlatform('ios', lines)).toEqual(lines)
    expect(composeForPlatform(null, lines)).toEqual(lines)
  })
  it('android ไม่มี subtitle → body เดิม ไม่มี ": " ลอย ๆ', () => {
    expect(composeForPlatform('android', { title: 't', body: 'b' })).toEqual({ title: 't', body: 'b' })
    expect(composeForPlatform('android', { title: 't', subtitle: '  ', body: 'b' })).toEqual({ title: 't', body: 'b' })
  })
  it('payload ที่ยิงจริง: แต่ละเครื่องได้ข้อความตาม platform ของตัวเอง', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) })
    vi.stubGlobal('fetch', f)
    await sendExpoPushWithStatus(
      [
        { token: 'ExponentPushToken[i]', platform: 'ios' },
        { token: 'ExponentPushToken[a]', platform: 'android' },
      ],
      'BT Premium',
      'สนใจครับ',
      undefined,
      { subtitle: 'สมชาย' },
    )
    const sent = JSON.parse(f.mock.calls[0][1].body)
    expect(sent[0]).toMatchObject({ to: 'ExponentPushToken[i]', subtitle: 'สมชาย', body: 'สนใจครับ' })
    expect(sent[1]).toMatchObject({ to: 'ExponentPushToken[a]', body: 'สมชาย: สนใจครับ' })
    expect(sent[1].subtitle).toBeUndefined()
  })
})
