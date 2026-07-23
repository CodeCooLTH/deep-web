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
let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

/** กันเสียงซ้ำซ้อน: หน้าแชทมีทั้งรายการ (InboxList) และเธรดที่ subscribe realtime คนละ channel
 *  ข้อความใหม่ 1 ข้อความจึงอาจทริกเกอร์ 2 ที่พร้อมกัน — throttle ที่ระดับ module ให้ดังครั้งเดียว */
let lastPlayedAt = 0
const MIN_GAP_MS = 1200

/**
 * playChatBeep — ดัง 2 โน้ตสั้น ๆ (ขึ้นเสียง) ดังพอรู้ตัวแต่ไม่รบกวนคนรอบข้าง
 * conversationId: ถ้าส่งมา จะเช็ค mute รายเธรดด้วย
 */
export function playChatBeep(conversationId?: string): void {
  if (isChatSoundMuted()) return
  if (conversationId && isConversationMuted(conversationId)) return

  const now = Date.now()
  if (now - lastPlayedAt < MIN_GAP_MS) return
  lastPlayedAt = now

  const audio = getCtx()
  if (!audio || audio.state !== 'running') return // ยังไม่เคย interact กับหน้า → เงียบตามกติกาเบราว์เซอร์

  const t0 = audio.currentTime
  for (const [i, freq] of [880, 1170].entries()) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    // envelope สั้น ๆ กัน "ป๊อก" ตอนเริ่ม/จบ (ตัดคลื่นดิบ ๆ จะได้ยินเป็นเสียงกระแทก)
    const start = t0 + i * 0.09
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.09, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.085)
    osc.connect(gain).connect(audio.destination)
    osc.start(start)
    osc.stop(start + 0.09)
  }
}

/** ปลดล็อกเสียงตอน gesture แรกของผู้ใช้ (คลิก/แตะ/กดคีย์) — เรียกครั้งเดียวจาก ChatHeader */
export function primeChatSound(): () => void {
  if (typeof window === 'undefined') return () => {}
  const unlock = () => {
    getCtx()
  }
  const opts = { passive: true } as const
  window.addEventListener('pointerdown', unlock, opts)
  window.addEventListener('keydown', unlock, opts)
  return () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
}
