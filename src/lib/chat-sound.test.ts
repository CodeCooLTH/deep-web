import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// สภาพแวดล้อม node: จำลอง window/document/Audio/navigator.locks ให้พอสำหรับ chat-sound
// locks จำลองแบบ "ใช้ร่วมกันทุกแท็บ" — หลายแท็บ = หลาย module instance ที่เห็น lock ชุดเดียวกัน
function setupEnv() {
  const held = new Set<string>()
  const plays = { count: 0 }
  let visibility: 'visible' | 'hidden' = 'visible'
  const docListeners: Array<() => void> = []
  vi.stubGlobal('window', { localStorage: { getItem: () => null }, dispatchEvent: () => {} })
  vi.stubGlobal('document', {
    get visibilityState() {
      return visibility
    },
    addEventListener: (_: string, fn: () => void) => docListeners.push(fn),
  })
  vi.stubGlobal(
    'Audio',
    class {
      currentTime = 0
      play() {
        plays.count++
        return Promise.resolve()
      }
    },
  )
  vi.stubGlobal('navigator', {
    locks: {
      request: async (name: string, _o: unknown, cb: (l: object | null) => Promise<void>) => {
        if (held.has(name)) return cb(null)
        held.add(name)
        try {
          await cb({})
        } finally {
          held.delete(name)
        }
      },
    },
  })
  const setVisibility = (v: 'visible' | 'hidden') => {
    visibility = v
    docListeners.forEach((fn) => fn())
  }
  return { plays, setVisibility }
}

async function freshTab() {
  vi.resetModules()
  return import('./chat-sound')
}

describe('playChatBeep', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('หลายแท็บได้ข้อความพร้อมกัน → ดังครั้งเดียว', async () => {
    const { plays } = setupEnv()
    const tabs = [await freshTab(), await freshTab(), await freshTab()]
    vi.advanceTimersByTime(9000) // พ้นช่วงเงียบหลังเปิดหน้า
    tabs.forEach((t) => t.playChatBeep({ shopId: 's1' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(plays.count).toBe(1)
  })

  it('ต่างร้านไม่กลบกัน · พ้น MIN_GAP แล้วดังได้อีก', async () => {
    const { plays } = setupEnv()
    const t = await freshTab()
    vi.advanceTimersByTime(9000)
    t.playChatBeep({ shopId: 's1' })
    t.playChatBeep({ shopId: 's2' })
    await vi.advanceTimersByTimeAsync(3100)
    t.playChatBeep({ shopId: 's1' })
    await vi.advanceTimersByTimeAsync(0)
    expect(plays.count).toBe(3)
  })

  it('กลับเข้าหน้า (เปิดแอป) แล้ว refetch เจอข้อความเก่า → เงียบ', async () => {
    const { plays, setVisibility } = setupEnv()
    const t = await freshTab()
    vi.advanceTimersByTime(9000)
    setVisibility('hidden')
    vi.advanceTimersByTime(60_000)
    setVisibility('visible')
    vi.advanceTimersByTime(1000) // refetch หน่วง 400ms + network
    t.playChatBeep({ shopId: 's1' })
    await vi.advanceTimersByTimeAsync(0)
    expect(plays.count).toBe(0)
  })
})
