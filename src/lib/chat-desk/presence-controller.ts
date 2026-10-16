// ตรรกะ presence ของโต๊ะแชท (SDS §8) — pure: inject client/timer เข้ามา เทสด้วย fake ได้โดยไม่ต้องมี jsdom/WebSocket · client-safe
import { PRESENCE_READY_TIMEOUT_MS, presenceTopic } from './constants'

/** ส่วนของ RealtimeChannel ที่ใช้จริง — ชนิดแคบเพื่อให้ fake ในเทสเขียนง่าย */
export type PresenceChannelLike = {
  on(type: 'presence', filter: { event: 'sync' | 'join' | 'leave' }, cb: () => void): PresenceChannelLike
  subscribe(cb: (status: string) => void): unknown
  track(payload: { at: number }): unknown
  presenceState(): Record<string, unknown>
}
export type PresenceClientLike = {
  channel(topic: string, opts?: { config: { presence: { key: string } } }): PresenceChannelLike
  removeChannel(channel: PresenceChannelLike): unknown
}

export type PresenceKeyEntry = { shopId: string; key: string }

/**
 * ผู้ลงชื่อ: ทุกร้านในขอบเขตแชท · key ต่อคนต่อร้าน (เปิดหลายแท็บ = key เดียว → presenceState มี 1 key)
 * payload มีแค่เวลา — ห้ามใส่ userId/ชื่อ (คนนอกที่รู้ shopId เข้าช่องได้และเห็น payload)
 */
export function createPresenceTracker(opts: { client: PresenceClientLike; keys: readonly PresenceKeyEntry[]; now?: () => number }) {
  const now = opts.now ?? Date.now
  const channels: PresenceChannelLike[] = []
  const subscribed = new Set<PresenceChannelLike>()

  const announce = (ch: PresenceChannelLike) => ch.track({ at: now() })

  return {
    start() {
      for (const { shopId, key } of opts.keys) {
        const ch = opts.client.channel(presenceTopic(shopId), { config: { presence: { key } } })
        channels.push(ch)
        // track ได้หลัง SUBSCRIBED เท่านั้น
        ch.subscribe((status) => {
          if (status !== 'SUBSCRIBED') return
          subscribed.add(ch)
          announce(ch)
        })
      }
    },
    /** กลับมาเห็นแท็บ → ประกาศซ้ำ (เบราว์เซอร์อาจหยุด heartbeat ตอนแท็บซ่อน แล้ว Supabase ตัดคีย์ไปแล้ว) */
    retrack() {
      for (const ch of subscribed) announce(ch)
    },
    stop() {
      for (const ch of channels) opts.client.removeChannel(ch)
      channels.length = 0
      subscribed.clear()
    },
  }
}

export type PresenceReaderStatus = 'connecting' | 'ready' | 'unavailable'
export type PresenceReaderState = { status: PresenceReaderStatus; keys: string[] }

// ── ผู้อ่าน (หน้าโต๊ะแชท) ── ต้องอยู่ท้ายไฟล์: เทส chat-desk-sources สแกนตั้งแต่บรรทัดข้างล่างนี้ไปจนจบไฟล์ว่าไม่มีการลงชื่อ

/**
 * ผู้อ่านอย่างเดียว: ไม่ลงชื่อเอง จึงไม่ทำให้เจ้าของที่เปิดแต่โต๊ะแชทดูเหมือนออนไลน์ (BR-CD-22)
 * ready เมื่อได้ sync แรก · ไม่ sync ใน readyTimeoutMs หรือช่องพัง (CHANNEL_ERROR/TIMED_OUT/CLOSED) → unavailable
 * (UI ต้องแสดง "—" ไม่ใช่ 0) · start() เลื่อนไป 1 tick เพื่อให้ cleanup ของผู้ลงชื่อ (SPA nav) จบก่อนเข้าช่องเดียวกัน
 */
export function createPresenceReader(opts: {
  client: PresenceClientLike
  shopId: string
  onChange: (s: PresenceReaderState) => void
  readyTimeoutMs?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (id: unknown) => void
}) {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>))
  let state: PresenceReaderState = { status: 'connecting', keys: [] }
  let channel: PresenceChannelLike | null = null
  let stopped = false
  let startTimer: unknown = null
  let readyTimer: unknown = null

  const emit = (next: PresenceReaderState) => {
    if (stopped) return
    state = next
    opts.onChange(state)
  }
  const fail = () => {
    clearTimer(readyTimer)
    emit({ status: 'unavailable', keys: [] })
  }
  const sync = () => {
    if (!channel) return
    clearTimer(readyTimer)
    emit({ status: 'ready', keys: Object.keys(channel.presenceState()) })
  }

  return {
    getState: () => state,
    start() {
      startTimer = setTimer(() => {
        if (stopped) return
        // ไม่ส่ง config.presence.key — ผู้อ่านไม่ประกาศตัว key สุ่มของ client จึงไม่ปรากฏใน state
        const ch = opts.client.channel(presenceTopic(opts.shopId))
        channel = ch
        ch.on('presence', { event: 'sync' }, sync)
          .on('presence', { event: 'join' }, sync)
          .on('presence', { event: 'leave' }, sync)
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') fail()
          })
        readyTimer = setTimer(() => {
          if (state.status === 'connecting') fail()
        }, opts.readyTimeoutMs ?? PRESENCE_READY_TIMEOUT_MS)
      }, 0)
    },
    stop() {
      stopped = true
      clearTimer(startTimer)
      clearTimer(readyTimer)
      if (channel) opts.client.removeChannel(channel)
      channel = null
    },
  }
}
