import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * [blocker] เสียงแชทต้องเล่นผ่าน Web Audio ไม่ใช่ <audio> (2026-10-10)
 *
 * ที่มา: แอปผู้ขาย iOS (WKWebView) — <audio> ทำให้ iOS ขึ้นแผงควบคุมเพลง "ไม่ได้เล่นอยู่" ค้างบนหน้าล็อก
 * หลังเสียงแชทดังครั้งเดียว · AudioContext ไม่ขึ้นแผงนี้ ตราบที่หน้าเว็บไม่ตั้ง audioSession เป็น playback
 */

type FakeSource = { buffer: unknown; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; onended: (() => void) | null }

let sources: FakeSource[]
let ctxState: 'running' | 'suspended'
let allowResume: boolean
let decodeFails: boolean
let audioCtor: ReturnType<typeof vi.fn>
let audioPlay: ReturnType<typeof vi.fn>
let resume: ReturnType<typeof vi.fn>
let suspend: ReturnType<typeof vi.fn>
let listeners: Record<string, () => void>

function installWindow(withAudioContext: boolean) {
  class FakeAudioContext {
    get state() {
      return ctxState
    }
    resume = resume
    suspend = suspend
    destination = {}
    decodeAudioData = vi.fn(async () => {
      if (decodeFails) throw new Error('decode')
      return { duration: 1.2 }
    })
    createBufferSource = () => {
      const s: FakeSource = { buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), onended: null }
      sources.push(s)
      return s
    }
  }
  const win: Record<string, unknown> = {
    addEventListener: (type: string, fn: () => void) => {
      listeners[type] = fn
    },
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
  if (withAudioContext) win.AudioContext = FakeAudioContext
  vi.stubGlobal('window', win)
}

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.resetModules()
  sources = []
  ctxState = 'suspended'
  allowResume = true
  decodeFails = false
  listeners = {}
  resume = vi.fn(async () => {
    if (!allowResume) throw new Error('NotAllowedError')
    ctxState = 'running'
  })
  suspend = vi.fn(async () => {
    ctxState = 'suspended'
  })
  audioPlay = vi.fn(async () => {})
  audioCtor = vi.fn(function (this: Record<string, unknown>) {
    this.play = audioPlay
    this.currentTime = 0
  })
  vi.stubGlobal('Audio', audioCtor)
  vi.stubGlobal('BroadcastChannel', undefined)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('[blocker] เล่นผ่าน AudioContext — ไม่สร้าง <audio>', () => {
  it('playChatBeep: เล่นจาก buffer และไม่แตะ Audio เลย', async () => {
    installWindow(true)
    const { playChatBeep } = await import('@/lib/chat-sound')
    playChatBeep({ shopId: 's1' })
    await flush()
    expect(sources).toHaveLength(1)
    expect(sources[0].start).toHaveBeenCalledTimes(1)
    expect(sources[0].buffer).toEqual({ duration: 1.2 })
    expect(audioCtor).not.toHaveBeenCalled()
  })

  it('previewChatSound (ปุ่มฟังเสียงในหน้าบัญชี) ก็ใช้ทางเดียวกัน', async () => {
    installWindow(true)
    const { previewChatSound } = await import('@/lib/chat-sound')
    previewChatSound()
    await flush()
    expect(sources).toHaveLength(1)
    expect(audioCtor).not.toHaveBeenCalled()
  })

  it('เสียงจบ ⇒ พัก context · เสียงซ้อน 2 อัน ⇒ พักหลังอันสุดท้ายจบเท่านั้น', async () => {
    installWindow(true)
    const { playChatBeep } = await import('@/lib/chat-sound')
    playChatBeep({ shopId: 's1' })
    playChatBeep({ shopId: 's2' }) // คนละร้าน ไม่ติด throttle
    await flush()
    expect(sources).toHaveLength(2)
    sources[0].onended?.()
    expect(suspend).not.toHaveBeenCalled()
    sources[1].onended?.()
    expect(suspend).toHaveBeenCalledTimes(1)
  })

  it('เบราว์เซอร์ยังไม่อนุญาต (resume ถูกบล็อก) ⇒ เงียบ ไม่ throw ไม่ถอยไป <audio>', async () => {
    installWindow(true)
    allowResume = false
    const { playChatBeep } = await import('@/lib/chat-sound')
    expect(() => playChatBeep({ shopId: 's1' })).not.toThrow()
    await flush()
    expect(sources).toHaveLength(0)
    expect(audioCtor).not.toHaveBeenCalled()
  })

  it('gesture แรก ⇒ resume + โหลดไฟล์รอ แล้วพักกลับ', async () => {
    installWindow(true)
    const { primeChatSound } = await import('@/lib/chat-sound')
    primeChatSound()
    listeners.pointerdown()
    await flush()
    expect(resume).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/sounds/sound-new-chat-msg.m4a')
    expect(suspend).toHaveBeenCalledTimes(1)
  })
})

describe('ทางสำรอง <audio> — เฉพาะเมื่อ Web Audio ใช้ไม่ได้', () => {
  it('ไม่มี AudioContext ⇒ เล่นด้วย <audio>', async () => {
    installWindow(false)
    const { playChatBeep } = await import('@/lib/chat-sound')
    playChatBeep({ shopId: 's1' })
    await flush()
    expect(audioCtor).toHaveBeenCalledWith('/sounds/sound-new-chat-msg.m4a')
    expect(audioPlay).toHaveBeenCalledTimes(1)
  })

  it('ถอดไฟล์ไม่ได้ ⇒ เล่นด้วย <audio> · รอบหน้าลองถอดใหม่', async () => {
    installWindow(true)
    decodeFails = true
    const { previewChatSound } = await import('@/lib/chat-sound')
    previewChatSound()
    await flush()
    expect(audioPlay).toHaveBeenCalledTimes(1)
    decodeFails = false
    previewChatSound()
    await flush()
    expect(sources).toHaveLength(1)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('[blocker] ห้ามเปิดสิทธิ์แผงควบคุมเพลง', () => {
  it('ไม่มีที่ไหนตั้ง navigator.audioSession เป็น playback / play-and-record', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/chat-sound.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
    expect(src).not.toMatch(/audioSession/)
    expect(src).toMatch(/createBufferSource\(\)/)
  })
})
