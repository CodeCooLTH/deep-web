// poller เดียวคุมทุกสาเหตุการดึง snapshot (SDS TD-09) — inject fetch/timer/visibility เพื่อเทสด้วย fake timers
import { POLL_INTERVAL_MS, SIGNAL_DEBOUNCE_MS } from './constants'

export type PollResponse = {
  status: number
  headers: { get(name: string): string | null }
  json(): Promise<unknown>
}

export type SnapshotPollerOptions<T> = {
  fetchSnapshot: (signal: AbortSignal) => Promise<PollResponse>
  onData: (data: T) => void
  /** ดึงไม่สำเร็จ (เครือข่าย/5xx/429) — ผู้ใช้ยังเห็นข้อมูลเดิมได้ */
  onError: (reason: 'network' | 'http' | 'rate-limited') => void
  /** 403 = สิทธิ์หาย → poller หยุดถาวร */
  onForbidden: () => void
  isVisible?: () => boolean
  /** ผูก visibilitychange — คืนฟังก์ชันถอด */
  subscribeVisibility?: (cb: () => void) => () => void
  pollMs?: number
  minGapMs?: number
}

const DEFAULT_RETRY_AFTER_MS = 10_000

export function createSnapshotPoller<T>(opts: SnapshotPollerOptions<T>) {
  const pollMs = opts.pollMs ?? POLL_INTERVAL_MS
  const minGapMs = opts.minGapMs ?? SIGNAL_DEBOUNCE_MS
  const isVisible = opts.isVisible ?? (() => true)

  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let gapTimer: ReturnType<typeof setTimeout> | null = null
  let inflight: AbortController | null = null
  let lastFetchAt = -Infinity
  let backoffUntil = 0
  let dirty = false
  let started = false
  let dead = false // 403 หรือ stop() แล้ว

  const clearTimers = () => {
    if (pollTimer) clearTimeout(pollTimer)
    if (gapTimer) clearTimeout(gapTimer)
    pollTimer = gapTimer = null
  }

  const schedulePoll = () => {
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
    if (dead || !started || !isVisible()) return
    pollTimer = setTimeout(request, Math.max(pollMs, backoffUntil - Date.now()))
  }

  async function run() {
    const ctl = new AbortController()
    inflight = ctl
    lastFetchAt = Date.now()
    try {
      const res = await opts.fetchSnapshot(ctl.signal)
      if (ctl.signal.aborted) return
      if (res.status === 403) {
        dead = true
        clearTimers()
        opts.onForbidden()
        return
      }
      if (res.status === 429) {
        const sec = Number(res.headers.get('Retry-After'))
        backoffUntil = Date.now() + (Number.isFinite(sec) && sec > 0 ? sec * 1000 : DEFAULT_RETRY_AFTER_MS)
        opts.onError('rate-limited')
      } else if (res.status >= 200 && res.status < 300) {
        const data = (await res.json()) as T
        if (!ctl.signal.aborted) opts.onData(data)
      } else {
        opts.onError('http')
      }
    } catch {
      if (!ctl.signal.aborted) opts.onError('network')
    } finally {
      if (inflight === ctl) inflight = null
      if (!dead && !ctl.signal.aborted) {
        schedulePoll()
        if (dirty) {
          dirty = false
          request()
        }
      }
    }
  }

  /** ทุกสาเหตุ (poll/signal/refresh/กลับมามองเห็น) ผ่านที่นี่: in-flight เดียว + ช่วงห่างขั้นต่ำ + เคารพ backoff */
  function request() {
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
    if (dead || !started || !isVisible()) return
    if (inflight) {
      dirty = true
      return
    }
    if (gapTimer) return // มีคำขอรอคิวอยู่แล้ว = รวมเป็นรอบเดียว
    const wait = Math.max(lastFetchAt + minGapMs - Date.now(), backoffUntil - Date.now(), 0)
    if (wait > 0) {
      gapTimer = setTimeout(() => {
        gapTimer = null
        request()
      }, wait)
      return
    }
    void run()
  }

  const onVisibility = () => {
    if (!started || dead) return
    if (isVisible()) request()
    else {
      clearTimers()
      dirty = false
      inflight?.abort()
      inflight = null
    }
  }
  let unsubVis: (() => void) | null = null

  return {
    start() {
      if (started || dead) return
      started = true
      unsubVis = opts.subscribeVisibility?.(onVisibility) ?? null
      request()
    },
    stop() {
      started = false
      dead = true
      clearTimers()
      inflight?.abort()
      inflight = null
      unsubVis?.()
      unsubVis = null
    },
    /** สัญญาณ realtime / ปุ่มรีเฟรช — ไม่ถี่กว่า minGapMs */
    signal: request,
    refresh: request,
  }
}

export type SnapshotPoller = ReturnType<typeof createSnapshotPoller>
