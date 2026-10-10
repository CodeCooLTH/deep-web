'use client'

/**
 * chat-sound — เสียงเตือนข้อความใหม่ในหน้าแชท (feature 00018, user สั่ง 2026-07-23)
 *
 * ทำไม Web Audio ไม่ใช่ไฟล์เสียง: เสียง beep สั้น ๆ สังเคราะห์เองได้ตรง ๆ ไม่ต้องเพิ่ม asset
 * เข้า repo (และไม่ต้องเถียงเรื่อง license ของไฟล์เสียงฟรี) ปรับความดัง/ความยาวได้ในโค้ดจุดเดียว
 *
 * autoplay policy: เบราว์เซอร์บล็อกเสียงจนกว่าผู้ใช้จะ interact กับหน้าเว็บก่อน — เราไม่ฝืน
 * (ไม่มี workaround ที่ถูกกติกา) แค่พยายาม resume AudioContext เมื่อมี gesture แรก แล้วถ้ายัง
 * ไม่ได้ก็เงียบไปเฉย ๆ ไม่ throw ไม่เด้ง error ใส่ผู้ใช้
 *
 * การปิดเสียง 2 ระดับตามที่ user สั่ง:
 *   1) ระดับแอป (ปุ่มบน ChatHeader) — ปิดแล้วเงียบทุกเธรด
 *   2) ระดับรายเธรด (ปุ่มในหัวเธรด) — ใช้ได้เมื่อระดับแอปเปิดเสียงอยู่
 * เก็บใน localStorage (ต่ออุปกรณ์/เบราว์เซอร์ ไม่ sync ข้ามเครื่อง — เป็นความชอบของ "ที่นั่งทำงาน"
 * ไม่ใช่ของบัญชี) + ยิง event ให้ทุก component ที่ subscribe อัปเดตพร้อมกันในแท็บเดียวกัน
 */

const GLOBAL_KEY = 'deep.chat.sound.muted'
const CONV_PREFIX = 'deep.chat.sound.muted.'
export const CHAT_SOUND_EVENT = 'deep:chat-sound-changed'

function readFlag(key: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false // โหมด private/ปิด storage — ถือว่าไม่ปิดเสียง
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    if (value) window.localStorage.setItem(key, '1')
    else window.localStorage.removeItem(key)
  } catch {
    // เขียนไม่ได้ = ใช้ได้แค่รอบนี้ ไม่ต้องแจ้งผู้ใช้
  }
  window.dispatchEvent(new CustomEvent(CHAT_SOUND_EVENT))
}

export const isChatSoundMuted = () => readFlag(GLOBAL_KEY)
export const setChatSoundMuted = (muted: boolean) => writeFlag(GLOBAL_KEY, muted)

export const isConversationMuted = (conversationId: string) => readFlag(CONV_PREFIX + conversationId)
export const setConversationMuted = (conversationId: string, muted: boolean) =>
  writeFlag(CONV_PREFIX + conversationId, muted)

// ── เสียง ────────────────────────────────────────────────────────────────────
// user สั่ง 2026-07-24: ใช้ไฟล์เสียง public/sounds/sound-new-chat-msg.m4a แทน beep สังเคราะห์
const SOUND_SRC = '/sounds/sound-new-chat-msg.m4a'

// เล่นผ่าน Web Audio ไม่ใช่ <audio> (2026-10-10 · แอปผู้ขาย iOS)
// 🛑 <audio>/new Audio() ใน WKWebView = "สื่อที่กำลังเล่น" ⇒ iOS ขึ้นแผงควบคุมเพลง (▶ ⏪ ⏩ "ไม่ได้เล่นอยู่")
//    ค้างบนหน้าล็อกหลังเสียงแชทดังครั้งเดียว · AudioContext ขึ้นแผงนี้ก็ต่อเมื่อหน้าเว็บตั้ง
//    navigator.audioSession.type = 'playback' | 'play-and-record' (WebKit AudioContext::isNowPlayingEligible)
//    ⇒ ห้ามตั้ง audioSession เป็นสองค่านั้น และห้ามกลับไปใช้ <audio> เป็นทางหลัก
// ผลข้างเคียงที่ยอมรับ: iOS เงียบตามสวิตช์ปิดเสียงของเครื่อง (เหมือนเสียงแจ้งเตือนทั่วไป)
// <audio> เหลือเป็นทางสำรองเฉพาะเบราว์เซอร์ที่ไม่มี Web Audio หรือถอดไฟล์ m4a ไม่ได้
let ctx: AudioContext | null = null
let bufferPromise: Promise<AudioBuffer | null> | null = null
let fallbackEl: HTMLAudioElement | null = null
/** เสียงที่กำลังดังอยู่ — พัก context เมื่อเหลือ 0 เท่านั้น (ข้อความติดกันจากคนละร้านเล่นซ้อนกันได้) */
let activeSources = 0

function suspendIfIdle(context: AudioContext): void {
  if (activeSources === 0) void context.suspend().catch(() => {})
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    try {
      ctx = new AC()
    } catch {
      return null
    }
  }
  return ctx
}

/** โหลด + ถอดไฟล์ครั้งเดียว · ล้มแล้วรอบหน้าลองใหม่ (เน็ตหลุดชั่วคราว) */
function loadBuffer(context: AudioContext): Promise<AudioBuffer | null> {
  if (!bufferPromise) {
    bufferPromise = fetch(SOUND_SRC)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => context.decodeAudioData(data))
      .catch(() => {
        bufferPromise = null
        return null
      })
  }
  return bufferPromise
}

function playFallback(): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return
  if (!fallbackEl) {
    fallbackEl = new Audio(SOUND_SRC)
    fallbackEl.preload = 'auto'
  }
  fallbackEl.currentTime = 0
  void fallbackEl.play().catch(() => {})
}

/**
 * เล่นเสียง 1 ครั้ง — เงียบเมื่อเบราว์เซอร์ยังไม่อนุญาต (ไม่ throw)
 * context ถูกพักหลังเสียงจบทุกครั้ง: ไม่เปลืองแบตตอนไม่มีเสียง และ context ที่สคริปต์พักไว้
 * ไม่มีสิทธิ์ขึ้นแผงควบคุมเพลงเลย (กันอีกชั้น)
 */
function playSound(): void {
  const context = getContext()
  if (!context) return playFallback()
  void (async () => {
    try {
      if (context.state !== 'running') await context.resume()
      const buffer = await loadBuffer(context)
      if (!buffer) return playFallback()
      if (context.state !== 'running') return // ยังไม่มี gesture — เงียบตามกติกา autoplay
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      activeSources += 1
      source.onended = () => {
        source.disconnect()
        activeSources -= 1
        suspendIfIdle(context)
      }
      source.start()
    } catch {
      // resume ถูกบล็อก/context พัง — เงียบ
    }
  })()
}

// กันเสียงซ้ำซ้อน — throttle "รายร้าน" (user สั่ง 2026-07-24: หลายร้านต้องไม่แข่งกันดัง)
// หน้าแชทมีทั้งรายการ (InboxList) และเธรด (thread) subscribe realtime คนละ channel — ข้อความเดียว
// ทริกเกอร์หลายที่พร้อมกัน จึง throttle. key = shopId เพื่อให้ต่างร้านมี rate-limit ของตัวเอง
// (ในแท็บเดียว รายการ+เธรดของร้านเดียวกันใช้ key เดียว = dedup กันเอง ยังทำงาน)
//
// ค่านี้ทำ 2 หน้าที่พร้อมกัน (ตั้งใจให้เป็นกลไกเดียว ไม่ซ้อน 2 ชั้น):
//   1. dedup ข้อความ "เดียวกัน" ที่ทริกเกอร์จากหลายที่ — list+thread+หลายแท็บ ยิงห่างกันแค่ ~ไม่กี่ ms
//   2. เว้นระยะระหว่างข้อความ "คนละอัน" ที่มาติดกันเร็ว ๆ ให้รวบเป็นเสียงเดียว
//
// 3000ms (user สั่ง 2026-07-30 "ดังทุกข้อความ แต่เว้นระยะ") — ประวัติของค่านี้:
//   1200ms → 400ms (2026-07-26) เพราะตอนนั้นความน่ารำคาญจาก spam ถูกกันด้วยเงื่อนไข "เทิร์นใหม่"
//   ที่ InboxList อยู่แล้ว ค่านี้จึงเหลือหน้าที่ dedup ล้วน ๆ
//   เงื่อนไขนั้นถูกถอดออก 2026-07-30 (มันทำให้ข้อความที่ 2 เป็นต้นไปในเทิร์นเดียวกันเงียบสนิท)
//   → หน้าที่คุมความถี่ย้ายมาอยู่ที่ค่านี้แทน จึงต้องกว้างพอที่จะรวบ spam รัว ๆ
//
// ผลลัพธ์: ข้อความที่ห่างกัน ≥ 3 วิ มีเสียงของตัวเองครบทุกอัน; รัวกว่านั้นรวบเป็นเสียงเดียว
// หมายเหตุ: throttle key = shopId → ข้อความจากลูกค้า 2 คนที่มาห่างกันไม่ถึง 3 วิ จะได้เสียงเดียว
// (ยอมรับได้ตามที่ user เลือก — จุดประสงค์คือ "ไม่รัวเป็นปืนกล" ไม่ใช่นับจำนวนเสียงให้ตรงจำนวนข้อความ)
const MIN_GAP_MS = 3000
const GLOBAL_THROTTLE_KEY = '__all__' // ใช้เมื่อไม่รู้ shopId (เช่น ChatWidget) — ยัง throttle แต่ไม่แยกร้าน
const lastPlayedByShop = new Map<string, number>()

// ── ประสานข้ามแท็บ (user report 2026-07-24: เปิดหลายแท็บ เสียงดังซ้อนกัน) ──
// แต่ละแท็บเป็น process แยก เบราว์เซอร์ไม่ dedup ให้เอง — ใช้ BroadcastChannel ให้แท็บที่กำลังจะเล่น
// "ประกาศ" (พร้อม shopId) แล้วทุกแท็บ (รวมตัวเอง) ยึด throttle รายร้านเดียวกัน → ข้อความของร้านหนึ่ง
// ดังครั้งเดียวทั้ง browser แต่ **ต่างร้านไม่กลบกัน**. race window = latency ของ message (~ไม่กี่ ms)
// << MIN_GAP_MS จึง dedup ได้แทบทุกกรณี ไม่ต้องทำ leader-election
let soundChannel: BroadcastChannel | null = null
function getSoundChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null
  if (!soundChannel) {
    soundChannel = new BroadcastChannel('deep-chat-sound')
    soundChannel.onmessage = (e: MessageEvent) => {
      // แท็บอื่นเพิ่งเล่นของร้านนี้ → ดัน throttle ของร้านนั้นในแท็บนี้ตามไป กันเล่นซ้ำ
      const at = typeof e.data?.playedAt === 'number' ? e.data.playedAt : 0
      const key = typeof e.data?.shopKey === 'string' ? e.data.shopKey : GLOBAL_THROTTLE_KEY
      if (at > (lastPlayedByShop.get(key) ?? 0)) lastPlayedByShop.set(key, at)
    }
  }
  return soundChannel
}

/**
 * playChatBeep — เล่นไฟล์เสียงแจ้งเตือนข้อความใหม่
 * opts.shopId — key ของ throttle (ต่างร้านไม่แข่งกันดัง); ไม่ระบุ = throttle รวม (ChatWidget)
 * opts.conversationId — เช็ค mute รายเธรด
 */
export function playChatBeep(opts: { shopId?: string | null; conversationId?: string } = {}): void {
  if (isChatSoundMuted()) return
  if (opts.conversationId && isConversationMuted(opts.conversationId)) return

  const key = opts.shopId ?? GLOBAL_THROTTLE_KEY
  const now = Date.now()
  if (now - (lastPlayedByShop.get(key) ?? 0) < MIN_GAP_MS) return // throttle รายร้าน (ในแท็บ + ข้ามแท็บ)
  lastPlayedByShop.set(key, now)
  // ประกาศให้แท็บอื่นก่อนเล่น — แท็บที่ประกาศทีหลังภายใน MIN_GAP_MS (ร้านเดียวกัน) จะเงียบ; ต่างร้านไม่เกี่ยว
  getSoundChannel()?.postMessage({ playedAt: now, shopKey: key })

  playSound()
}

/**
 * ฟังตัวอย่างเสียงแชท — ปุ่ม "ฟังเสียง" ในหน้า /account (2026-10-09)
 * ไม่ผ่าน throttle/สวิตช์ปิดเสียงของ playChatBeep เพราะผู้ใช้กดเองตั้งใจฟัง
 */
export function previewChatSound(): void {
  playSound()
}

/** ปลดล็อกเสียงตอน gesture แรกของผู้ใช้ (คลิก/แตะ/กดคีย์) — เรียกครั้งเดียวจาก ChatHeader
 *  resume AudioContext ภายใน gesture ครั้งเดียว ⇒ ครั้งถัดไปเบราว์เซอร์ยอมให้ resume เองได้โดยไม่ต้องมี
 *  gesture ตรงจังหวะ · โหลดไฟล์รอไว้ด้วย แล้วพักกลับ (ไม่เปลืองแบต) */
export function primeChatSound(): () => void {
  if (typeof window === 'undefined') return () => {}
  let primed = false
  const unlock = () => {
    if (primed) return
    const context = getContext()
    if (!context) return
    primed = true
    void context
      .resume()
      .then(() => {
        void loadBuffer(context)
        suspendIfIdle(context)
      })
      .catch(() => {
        primed = false // ยังไม่สำเร็จ → ลองใหม่ gesture หน้า
      })
  }
  const opts = { passive: true } as const
  window.addEventListener('pointerdown', unlock, opts)
  window.addEventListener('keydown', unlock, opts)
  return () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
}
