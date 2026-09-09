/**
 * iap-client — ขอของจากเปลือก native แล้วรอคำตอบ (feature 00064)
 *
 * โมดูลบริสุทธิ์: รับ "ท่อ" เข้ามาทางพารามิเตอร์ ไม่แตะ `window` เอง ⇒ เทสได้ครบทุกเส้นทาง
 * รวมทั้งเส้นที่จำลองยาก (native เงียบ · คำตอบสลับคำขอ) โดยไม่ต้องมี DOM
 *
 * ## 🛑 ทำไมต้องจับคู่ด้วย requestId
 *
 * ช่องทางกลับจาก native เป็น **event เดียวร่วมกันทั้งหน้า** ไม่ใช่ callback ต่อคำขอ
 * ถ้าไม่จับคู่ คำตอบของ "ขอราคา" จะไปปลุกคำขอ "กดซื้อ" ที่ค้างอยู่ ⇒ จอบอกว่าซื้อสำเร็จ
 * ทั้งที่ยังไม่ได้จ่ายเงิน — ความผิดพลาดที่แพงที่สุดเท่าที่ฟีเจอร์นี้จะทำได้
 *
 * ## 🛑 ทำไมต้องมี timeout
 *
 * native อาจไม่ตอบเลย — แอปเวอร์ชันเก่าที่ยังไม่รู้จักข้อความนี้ (ผู้ใช้ไม่ได้อัปเดต) หรือ
 * StoreKit ค้าง · ไม่มี timeout = ปุ่มหมุนตลอดกาลโดยไม่มีอะไรบอกผู้ใช้ ซึ่งเป็นอาการเดียวกับ
 * บั๊ก 2.1(a) ที่ Apple เพิ่งตีกลับมา
 */
import { buildIapRequest, parseIapResult, type IapRequest, type IapResult, type IapRequestSpec } from '@/lib/iap-bridge-protocol'

export interface IapTransport {
  post: (msg: IapRequest) => void
  /** ฟังคำตอบดิบจาก native — คืนฟังก์ชันเลิกฟัง */
  subscribe: (onRaw: (raw: unknown) => void) => () => void
}

/** คำขอที่ยังไม่มี id — ตัว client แจก id เอง คนเรียกไม่ต้องรู้เรื่องนี้ */
export type IapAsk =
  | { kind: 'products' }
  | { kind: 'purchase'; productId: string }
  | { kind: 'restore' }

export interface IapClientOptions {
  /** ค่าปริยาย 60 วินาที — ยาวพอให้ผู้ใช้กรอกรหัส Apple ID และยืนยันด้วย Face ID */
  timeoutMs?: number
  newId?: () => string
}

const DEFAULT_TIMEOUT_MS = 60_000

/**
 * `transport` เป็น `null` = ไม่ได้เปิดอยู่ในแอป ⇒ ตอบ `UNAVAILABLE` ทันที
 *
 * ตอบทันทีสำคัญกว่าที่คิด: ถ้าปล่อยให้ไปรอจนหมดเวลา ผู้ใช้บนเบราว์เซอร์จะเห็นปุ่มหมุนหนึ่งนาที
 * ก่อนได้ข้อความ ทั้งที่เรารู้คำตอบตั้งแต่วินาทีแรก
 */
export function createIapClient(transport: IapTransport | null, options: IapClientOptions = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const newId = options.newId ?? (() => `iap-${Math.random().toString(36).slice(2)}-${Date.now()}`)

  function request(ask: IapAsk): Promise<IapResult> {
    const requestId = newId()
    if (!transport) {
      return Promise.resolve({ requestId, ok: false, reason: 'UNAVAILABLE' })
    }

    return new Promise<IapResult>((resolve) => {
      let done = false
      /* ประกาศก่อนใช้ใน handler — handler อาจถูกเรียกทันทีที่ subscribe ในบางท่อ */
      let unsubscribe: (() => void) | null = null
      let timer: ReturnType<typeof setTimeout> | null = null

      const finish = (result: IapResult) => {
        if (done) return /* กันคำตอบที่มาทีหลัง (หรือ timeout) เขียนทับผลที่จบไปแล้ว */
        done = true
        if (timer) clearTimeout(timer)
        unsubscribe?.()
        resolve(result)
      }

      unsubscribe = transport.subscribe((raw) => {
        const parsed = parseIapResult(raw)
        /* ของที่รูปร่างพัง หรือของคนอื่น → เมินเฉย ห้ามจบคำขอนี้ */
        if (!parsed || parsed.requestId !== requestId) return
        finish(parsed)
      })

      timer = setTimeout(() => finish({ requestId, ok: false, reason: 'TIMEOUT' }), timeoutMs)

      const spec = { ...ask, requestId } as IapRequestSpec
      transport.post(buildIapRequest(spec))
    })
  }

  /**
   * สั่งปิดธุรกรรม — **ยิงแล้วจบ ไม่รอคำตอบ**
   *
   * 🛑 ห้ามใช้ `request()` กับคำสั่งนี้: จะมีคำขอค้างรอคำตอบที่ไม่มีวันมา กิน listener กับ
   * ตัวจับเวลาไว้ 60 วินาทีต่อการซื้อหนึ่งครั้ง (ตอนกู้คืนหลายใบพร้อมกันยิ่งกองกัน)
   *
   * เรียกได้เฉพาะ **หลังเซิร์ฟเวอร์ยืนยันว่าเปิดสิทธิ์แล้ว** — ดูเหตุผลใน `IapPurchase`
   */
  function finish(transactionId: string): void {
    if (!transport) return
    transport.post(buildIapRequest({ kind: 'finish', requestId: newId(), transactionId }))
  }

  return { request, finish }
}
