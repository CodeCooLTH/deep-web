/**
 * apple-native-client — ขอให้เปลือก native เปิดแผ่น Sign in with Apple แล้วรอผล
 * (feature 00040 · ภาคผนวก 7)
 *
 * โมดูลบริสุทธิ์: รับ "ท่อ" เข้ามาทางพารามิเตอร์ ไม่แตะ `window` เอง ⇒ เทสได้ครบทุกเส้นทาง
 * รวมเส้นที่จำลองยาก (native เงียบ · คำตอบสลับคำขอ) โดยไม่ต้องมี DOM
 * โครงสร้างยกมาจาก `iap-client.ts` ซึ่งใช้งานจริงบน prod แล้ว — ตั้งใจให้เหมือนกัน
 *
 * ## 🛑 ทำไมต้องจับคู่ด้วย requestId
 *
 * ช่องทางกลับจาก native เป็น **event เดียวร่วมกันทั้งหน้า** ไม่ใช่ callback ต่อคำขอ
 * ไม่จับคู่ = คำตอบของการกดครั้งก่อน (ที่ผู้ใช้ยกเลิกไปแล้ว) จะไปปลุกคำขอปัจจุบัน
 *
 * ## 🛑 ทำไมต้องมี timeout
 *
 * native อาจไม่ตอบเลย — บิลด์เก่าที่ยังไม่มีโมดูลนี้จะเมินข้อความเราเงียบ ๆ
 * ไม่มี timeout = ปุ่มหมุนตลอดกาล ซึ่งเป็นอาการเดียวกับบั๊ก 2.1(a) ที่เคยโดนตีกลับ
 *
 * ⚠️ ตัวกรองหลักของบิลด์เก่าคือ `nativeSupportsAppleSignIn()` ไม่ใช่ timeout —
 * timeout เป็นตาข่ายชั้นสอง สำหรับกรณีที่เปลือกประกาศความสามารถแล้วแต่ค้างกลางทาง
 */
import {
  buildAppleSignInRequest,
  parseAppleSignInResult,
  type AppleSignInRequest,
  type AppleSignInResult,
} from '@/lib/apple-bridge-protocol'

export interface AppleNativeTransport {
  post: (msg: AppleSignInRequest) => void
  /** ฟังคำตอบดิบจาก native — คืนฟังก์ชันเลิกฟัง */
  subscribe: (onRaw: (raw: unknown) => void) => () => void
}

/**
 * เพดานเวลารอผลจากแผ่นของระบบ (มิลลิวินาที)
 *
 * 🛑 ตั้งยาวโดยตั้งใจ — **Apple เป็นเจ้าของเวลาช่วงนี้ ไม่ใช่เรา**: ผู้ใช้อาจต้องกรอกรหัส
 * Apple ID · ผ่าน 2FA · กดยอมรับเงื่อนไขที่ Apple เพิ่งอัปเดต · เลือกว่าจะซ่อนอีเมลไหม
 * ตั้งสั้นเมื่อไหร่ = เราโกหกผู้ใช้ว่าล้มเหลวทั้งที่เขายังทำอยู่
 * (บทเรียนตรงกับ `IAP_TIMEOUT_MS.purchase` ซึ่งหัวหน้าเจอบน TestFlight 2026-09-10)
 */
export const APPLE_NATIVE_TIMEOUT_MS = 300_000

export interface AppleNativeClientOptions {
  timeoutMs?: number
  newId?: () => string
  /** สร้าง nonce ดิบ — ฉีดเข้ามาได้เพื่อให้เทสคาดเดาค่าได้ */
  newNonce?: () => string
}

/**
 * ค่าสุ่มสำหรับ nonce — ใช้ `crypto.getRandomValues` ไม่ใช่ `Math.random`
 *
 * 🛑 `Math.random` เดาได้ ⇒ ผู้โจมตีที่เดา nonce ล่วงหน้าได้ จะเตรียมโทเคนที่ผ่านด่าน
 * กันเล่นซ้ำของเซิร์ฟเวอร์ไว้ก่อนได้ · ทุกเบราว์เซอร์ที่เรารองรับมี `crypto` อยู่แล้ว
 * แต่ยัง fallback ไว้เพื่อไม่ให้หน้าพังทั้งหน้าในสภาพแวดล้อมแปลก ๆ (เช่นตอน SSR)
 */
function defaultNonce(): string {
  const g = globalThis as { crypto?: Crypto }
  if (g.crypto?.getRandomValues) {
    const buf = new Uint8Array(32)
    g.crypto.getRandomValues(buf)
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/**
 * `transport` เป็น `null` = ไม่ได้เปิดอยู่ในแอป (หรือเปลือกไม่รองรับ) ⇒ ตอบ `UNAVAILABLE`
 * **ทันที** ไม่ต้องรอหมดเวลา — ผู้เรียกจะได้ถอยไปทางเว็บในวินาทีแรก ไม่ใช่ห้านาทีถัดมา
 */
export function createAppleNativeClient(
  transport: AppleNativeTransport | null,
  options: AppleNativeClientOptions = {},
) {
  const newId = options.newId ?? (() => `apple-${Math.random().toString(36).slice(2)}-${Date.now()}`)
  const newNonce = options.newNonce ?? defaultNonce

  /**
   * ขอให้ native เปิดแผ่น — คืนผลพร้อม **nonce ดิบ** ที่ผู้เรียกต้องส่งต่อให้เซิร์ฟเวอร์
   *
   * 🛑 ผู้เรียกต้องใช้ nonce ที่ฟังก์ชันนี้คืนมา **ห้ามใช้ค่าที่ native ส่งกลับ** —
   * ค่าที่ native ส่งมามีไว้ให้เทียบเท่านั้น ถ้าเอาไปใช้ตรง ๆ แอปที่ถูกแก้ไขจะกำหนด
   * nonce เองได้ ซึ่งทำให้การกันเล่นซ้ำหมดความหมายทั้งอัน
   */
  function signIn(): Promise<{ result: AppleSignInResult; nonce: string }> {
    const requestId = newId()
    const nonce = newNonce()

    if (!transport) {
      return Promise.resolve({ result: { requestId, ok: false, reason: 'UNAVAILABLE' }, nonce })
    }

    return new Promise((resolve) => {
      let done = false
      let unsubscribe: (() => void) | null = null
      let timer: ReturnType<typeof setTimeout> | null = null

      const finish = (result: AppleSignInResult) => {
        /* กันคำตอบที่มาทีหลัง (หรือ timeout) เขียนทับผลที่จบไปแล้ว */
        if (done) return
        done = true
        if (timer) clearTimeout(timer)
        unsubscribe?.()
        resolve({ result, nonce })
      }

      unsubscribe = transport.subscribe((raw) => {
        const parsed = parseAppleSignInResult(raw)
        /* รูปร่างพัง หรือของคำขออื่น → เมินเฉย ห้ามจบคำขอนี้ */
        if (!parsed || parsed.requestId !== requestId) return
        /**
         * 🛑 nonce ที่ตอบกลับต้องตรงกับที่เราส่งไป — ไม่ตรงแปลว่าเป็นคำตอบของคำขออื่น
         * ที่บังเอิญมี requestId ชนกัน หรือเปลือกถูกแก้ไข · ปฏิเสธดีกว่าเอาโทเคนที่
         * ผูกกับ nonce คนละตัวไปให้เซิร์ฟเวอร์ (ซึ่งจะตอบ NONCE_MISMATCH อยู่ดี
         * แต่กว่าจะถึงตรงนั้นเราเสียรอบเครือข่ายไปแล้ว และอ่าน log ยากขึ้น)
         */
        if (parsed.ok && parsed.nonce !== nonce) {
          finish({ requestId, ok: false, reason: 'FAILED' })
          return
        }
        finish(parsed)
      })

      timer = setTimeout(
        () => finish({ requestId, ok: false, reason: 'TIMEOUT' }),
        options.timeoutMs ?? APPLE_NATIVE_TIMEOUT_MS,
      )

      transport.post(buildAppleSignInRequest(requestId, nonce))
    })
  }

  return { signIn }
}
