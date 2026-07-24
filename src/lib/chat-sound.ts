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

/** กันเสียงซ้ำซ้อน: หน้าแชทมีทั้งรายการ (InboxList) และเธรดที่ subscribe realtime คนละ channel
 *  ข้อความใหม่ 1 ข้อความจึงอาจทริกเกอร์ 2 ที่พร้อมกัน — throttle ที่ระดับ module ให้ดังครั้งเดียว */
let lastPlayedAt = 0
const MIN_GAP_MS = 1200

/**
 * playChatBeep — เล่นไฟล์เสียงแจ้งเตือนข้อความใหม่
 * conversationId: ถ้าส่งมา จะเช็ค mute รายเธรดด้วย
 */
export function playChatBeep(conversationId?: string): void {
  if (isChatSoundMuted()) return
  if (conversationId && isConversationMuted(conversationId)) return

  const now = Date.now()
  if (now - lastPlayedAt < MIN_GAP_MS) return
  lastPlayedAt = now

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
