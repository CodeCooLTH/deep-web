import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotPoller, type PollResponse } from '../poller'

const res = (status: number, body: unknown = {}, retryAfter?: string): PollResponse => ({
  status,
  headers: { get: (n) => (n === 'Retry-After' ? (retryAfter ?? null) : null) },
  json: async () => body,
})

function setup(responses: PollResponse[] | (() => PollResponse) = () => res(200, { v: 1 })) {
  let visible = true
  let visCb: (() => void) | null = null
  const fetchSnapshot = vi.fn(async () =>
    typeof responses === 'function' ? responses() : (responses.shift() ?? res(200, { v: 1 })),
  )
  const onData = vi.fn()
  const onError = vi.fn()
  const onForbidden = vi.fn()
  const p = createSnapshotPoller<unknown>({
    fetchSnapshot,
    onData,
    onError,
    onForbidden,
    isVisible: () => visible,
    subscribeVisibility: (cb) => ((visCb = cb), () => (visCb = null)),
  })
  return {
    p, fetchSnapshot, onData, onError, onForbidden,
    setVisible(v: boolean) { visible = v; visCb?.() },
  }
}

beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }))
afterEach(() => vi.useRealTimers())

describe('createSnapshotPoller', () => {
  it('ดึงทันทีตอน start แล้ววนทุก 8 วินาที', async () => {
    const t = setup()
    t.p.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.fetchSnapshot).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(7_999)
    expect(t.fetchSnapshot).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(t.fetchSnapshot).toHaveBeenCalledTimes(2)
    expect(t.onData).toHaveBeenCalledTimes(2)
    t.p.stop()
  })

  it('แท็บซ่อน: ไม่มี timer เหลือ · กลับมา fetch ทันที', async () => {
    const t = setup()
    t.p.start()
    await vi.advanceTimersByTimeAsync(0)
    t.setVisible(false)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(t.fetchSnapshot).toHaveBeenCalledTimes(1)
    t.setVisible(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(t.fetchSnapshot).toHaveBeenCalledTimes(2)
    t.p.stop()
  })

  it('signal รัว ๆ รวมเป็นรอบเดียว และห่างจากรอบก่อน >= 2 วินาที', async () => {
    const t = setup()
    t.p.start()
    await vi.advanceTimersByTimeAsync(0)
    for (let i = 0; i < 5; i++) t.p.signal()
    await vi.advanceTimersByTimeAsync(1_999)
    expect(t.fetchSnapshot).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(t.fetchSnapshot).toHaveBeenCalledTimes(2)
    t.p.stop()
  })

  it('signal ระหว่าง in-flight ไม่เปิดคำขอซ้อน แต่ดึงอีกรอบหลังจบ', async () => {
    let release: (r: PollResponse) => void = () => {}
    const t = setup()
    t.fetchSnapshot.mockImplementationOnce(() => new Promise<PollResponse>((r) => (release = r)))
    t.p.start()
    await vi.advanceTimersByTimeAsync(0)
    t.p.signal()
    expect(t.fetchSnapshot).toHaveBeenCalledTimes(1)
    release(res(200))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(t.fetchSnapshot).toHaveBeenCalledTimes(2)
    t.p.stop()
  })

  it('429 เคารพ Retry-After (ไม่ดึงก่อนเวลา)', async () => {
    const t = setup([res(429, {}, '30')])
    t.p.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.onError).toHaveBeenCalledWith('rate-limited')
    await vi.advanceTimersByTimeAsync(29_000)
    expect(t.fetchSnapshot).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(t.fetchSnapshot).toHaveBeenCalledTimes(2)
    t.p.stop()
  })

  it('403 หยุดถาวร + เรียก onForbidden ครั้งเดียว', async () => {
    const t = setup([res(403)])
    t.p.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.onForbidden).toHaveBeenCalledTimes(1)
    t.p.signal()
    t.p.refresh()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(t.fetchSnapshot).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('5xx/เครือข่ายล้ม: แจ้ง error แล้วยังวนต่อ', async () => {
    const t = setup([res(500)])
    t.p.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.onError).toHaveBeenCalledWith('http')
    await vi.advanceTimersByTimeAsync(8_000)
    expect(t.onData).toHaveBeenCalledTimes(1)
    t.p.stop()
  })
})
