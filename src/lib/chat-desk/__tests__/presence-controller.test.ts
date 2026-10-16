import { describe, expect, it, vi } from 'vitest'
import {
  createPresenceReader,
  createPresenceTracker,
  type PresenceChannelLike,
  type PresenceClientLike,
  type PresenceReaderState,
} from '../presence-controller'
import { presenceTopic } from '../constants'

/** Supabase ปลอม: จำช่อง/ค่า key/track ที่เรียก และจำลอง presenceState แบบ key-ต่อ-คน */
function fakeClient() {
  const channels: Array<{
    topic: string; key: string | undefined; tracked: unknown[]; handlers: Record<string, () => void>
    status: ((s: string) => void) | null; state: Record<string, unknown>; removed: boolean
  }> = []
  const client: PresenceClientLike = {
    channel(topic, opts) {
      const rec = { topic, key: opts?.config.presence.key, tracked: [] as unknown[], handlers: {} as Record<string, () => void>, status: null as ((s: string) => void) | null, state: {} as Record<string, unknown>, removed: false }
      channels.push(rec)
      const ch: PresenceChannelLike = {
        on(_t, f, cb) { rec.handlers[f.event] = cb; return ch },
        subscribe(cb) { rec.status = cb },
        track(p) { rec.tracked.push(p) },
        presenceState: () => rec.state,
      }
      ;(rec as unknown as { ch: PresenceChannelLike }).ch = ch
      return ch
    },
    removeChannel(ch) { const r = channels.find((c) => (c as unknown as { ch: unknown }).ch === ch); if (r) r.removed = true },
  }
  return { client, channels }
}

describe('createPresenceTracker (AC-CD-27/28)', () => {
  it('ลงชื่อทุกร้านด้วย key ของร้านนั้น หลัง SUBSCRIBED เท่านั้น · payload ไม่มี userId', () => {
    const { client, channels } = fakeClient()
    const t = createPresenceTracker({ client, keys: [{ shopId: 's1', key: 'k1' }, { shopId: 's2', key: 'k2' }], now: () => 123 })
    t.start()
    expect(channels.map((c) => [c.topic, c.key])).toEqual([[presenceTopic('s1'), 'k1'], [presenceTopic('s2'), 'k2']])
    expect(channels.every((c) => c.tracked.length === 0)).toBe(true)
    channels[0].status!('SUBSCRIBED')
    expect(channels[0].tracked).toEqual([{ at: 123 }])
    expect(channels[1].tracked).toEqual([])
    channels[1].status!('CHANNEL_ERROR')
    expect(channels[1].tracked).toEqual([])
    expect(JSON.stringify(channels[0].tracked)).not.toMatch(/user/i)
  })

  it('retrack เฉพาะช่องที่ SUBSCRIBED แล้ว · stop ถอดทุกช่อง', () => {
    const { client, channels } = fakeClient()
    const t = createPresenceTracker({ client, keys: [{ shopId: 's1', key: 'k1' }, { shopId: 's2', key: 'k2' }], now: () => 1 })
    t.start()
    channels[0].status!('SUBSCRIBED')
    t.retrack()
    expect(channels[0].tracked).toHaveLength(2)
    expect(channels[1].tracked).toHaveLength(0)
    t.stop()
    expect(channels.every((c) => c.removed)).toBe(true)
    t.retrack()
    expect(channels[0].tracked).toHaveLength(2)
  })

  it('สอง instance ที่ใช้ key เดียวกัน (สองแท็บ) → presenceState มี key เดียว', () => {
    // จำลองพฤติกรรม Supabase: state เป็น map key → metas · ผู้ลงชื่อสองตัวคีย์เดียวกันทับกัน
    const state: Record<string, unknown[]> = {}
    const mkClient = (): PresenceClientLike => ({
      channel(_t, opts) {
        const key = opts!.config.presence.key
        const ch: PresenceChannelLike = {
          on: () => ch, subscribe: (cb) => cb('SUBSCRIBED'), presenceState: () => state,
          track: (p) => { (state[key] ??= []).push(p) },
        }
        return ch
      },
      removeChannel: () => {},
    })
    for (let i = 0; i < 2; i++) createPresenceTracker({ client: mkClient(), keys: [{ shopId: 's1', key: 'same' }] }).start()
    expect(Object.keys(state)).toEqual(['same'])
  })
})

describe('createPresenceReader (AC-CD-29/31)', () => {
  const setup = (readyTimeoutMs = 10_000) => {
    vi.useFakeTimers()
    const f = fakeClient()
    const seen: PresenceReaderState[] = []
    const r = createPresenceReader({ client: f.client, shopId: 's1', onChange: (s) => seen.push(s), readyTimeoutMs })
    return { ...f, seen, r }
  }

  it('เลื่อน subscribe ไป 1 tick · ไม่ส่ง key และไม่ประกาศตัวเลย · ready เมื่อ sync แรก', () => {
    const { channels, seen, r } = setup()
    r.start()
    expect(channels).toHaveLength(0)
    vi.advanceTimersByTime(0)
    expect(channels).toHaveLength(1)
    expect(channels[0].topic).toBe(presenceTopic('s1'))
    expect(channels[0].key).toBeUndefined()
    expect(r.getState().status).toBe('connecting')
    channels[0].state = { kA: [{}], kB: [{}] }
    channels[0].handlers.sync()
    expect(seen.at(-1)).toEqual({ status: 'ready', keys: ['kA', 'kB'] })
    channels[0].state = { kA: [{}] }
    channels[0].handlers.leave()
    expect(seen.at(-1)).toEqual({ status: 'ready', keys: ['kA'] })
    expect(channels[0].tracked).toEqual([])
    r.stop()
    expect(channels[0].removed).toBe(true)
    vi.useRealTimers()
  })

  it('ไม่ sync ใน 10 วินาที → unavailable (ไม่ใช่ ready ว่าง)', () => {
    const { channels, seen, r } = setup()
    r.start()
    vi.advanceTimersByTime(9_999)
    expect(seen).toEqual([])
    vi.advanceTimersByTime(1)
    expect(seen.at(-1)).toEqual({ status: 'unavailable', keys: [] })
    expect(channels[0].tracked).toEqual([])
    vi.useRealTimers()
  })

  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])('%s → unavailable ทันที', (status) => {
    const { channels, seen, r } = setup()
    r.start()
    vi.advanceTimersByTime(0)
    channels[0].status!(status)
    expect(seen.at(-1)).toEqual({ status: 'unavailable', keys: [] })
    vi.useRealTimers()
  })

  it('stop ก่อน subscribe → ไม่สร้างช่อง · หลัง stop ไม่ emit อีก', () => {
    const { channels, seen, r } = setup()
    r.start()
    r.stop()
    vi.advanceTimersByTime(20_000)
    expect(channels).toHaveLength(0)
    expect(seen).toEqual([])
    vi.useRealTimers()
  })
})
