import { describe, it, expect, vi, afterEach } from 'vitest'
import { sendExpoPush } from './expo-push'

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
