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

let audioEl: HTMLAudioElement | null = null

function getAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null
  if (!audioEl) {
    audioEl = new Audio(SOUND_SRC)
    audioEl.preload = 'auto'
  }
  return audioEl
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

  const el = getAudio()
  if (!el) return
  el.currentTime = 0 // reset ให้เล่นซ้ำได้ทันทีแม้เสียงก่อนยังไม่จบ
  // play() reject ถ้าเบราว์เซอร์บล็อก (ยังไม่ interact) หรือไฟล์โหลดไม่ได้ — เงียบตามกติกา ไม่ throw
  void el.play().catch(() => {})
}

/** ปลดล็อกเสียงตอน gesture แรกของผู้ใช้ (คลิก/แตะ/กดคีย์) — เรียกครั้งเดียวจาก ChatHeader
 *  เล่นเงียบ (volume 0) 1 ครั้งเพื่อให้เบราว์เซอร์อนุญาต play() ครั้งถัดไปโดยไม่ต้องมี gesture ตรงจังหวะ */
export function primeChatSound(): () => void {
  if (typeof window === 'undefined') return () => {}
  let primed = false
  const unlock = () => {
    if (primed) return
    const el = getAudio()
    if (!el) return
    primed = true
    const prevVol = el.volume
    el.volume = 0
    void el
      .play()
      .then(() => {
        el.pause()
        el.currentTime = 0
        el.volume = prevVol
      })
      .catch(() => {
        el.volume = prevVol
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
