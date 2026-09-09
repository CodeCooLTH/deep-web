/**
 * iap-bridge-protocol — รูปร่างข้อความระหว่างหน้าเว็บกับเปลือก native เรื่องการซื้อ (feature 00064)
 *
 * โมดูลบริสุทธิ์: ไม่แตะ `window` ไม่แตะ React ⇒ เทสได้ตรง ๆ และ **ใช้อ้างอิงข้ามรีโปได้**
 * (ฝั่งแอปอยู่คนละรีโป ไม่มี type ตัวไหนเชื่อมให้ — ถ้าพิมพ์ชื่อต่างกันจะเงียบสนิทไม่มี error
 * บทเรียนเดียวกับที่ `SellerWebView` เขียนเตือนไว้เองเรื่อง `deep:push-permission`)
 *
 * ## ทำไมปุ่มอยู่เว็บแต่การซื้ออยู่ native
 *
 * StoreKit เรียกจากเว็บไม่ได้เลย — เป็นข้อเดียวในฟีเจอร์นี้ที่ native จำเป็นจริง ๆ
 * ส่วน UI ทั้งหมดยังอยู่ในเว็บตามหลัก WebView-first (UI ซ้ำสองที่ = หลุด sync แน่นอน)
 *
 * ## 🛑 ของที่ native ส่งกลับมา ต้องตรวจก่อนเชื่อทุกครั้ง
 *
 * ค่ามาถึงเว็บผ่าน `injectJavaScript` ซึ่งเขียนลง `window` — โค้ดหน้าอื่นเขียนทับได้
 * และ **ราคาที่แสดงต้องมาจาก StoreKit เท่านั้น** (Apple ตรวจข้อนี้ตรง ๆ)
 * ⇒ รูปร่างไม่ครบ = ตกทั้งใบ ห้ามเติมค่าเริ่มต้นให้เอง
 */

/** ชื่อ event ที่ native ยิงหลังตั้ง `window.__DEEP_IAP_RESULT__` — **ต้องตรงกับฝั่งแอปเป๊ะ** */
export const IAP_RESULT_EVENT = 'deep:iap-result'

/** สินค้าหนึ่งตัวตามที่ StoreKit รายงานมา */
export interface IapProduct {
  productId: string
  displayName: string
  /** 🛑 ข้อความที่ StoreKit จัดรูปแบบมาแล้ว (เช่น `฿249`) — ห้ามเป็นตัวเลขให้เราจัดเอง */
  displayPrice: string
}

/**
 * เหตุผลที่ทำไม่สำเร็จ — ค่าที่ไม่รู้จักถูกยุบเป็น `FAILED` เสมอ
 *
 * 🛑 `TIMEOUT` เป็นของ **ฝั่งเว็บล้วน** — เกิดตอนเรารอ native แล้วไม่มีคำตอบ ไม่ใช่ค่าที่ native
 * ส่งมาได้ · `parseIapResult` จึงไม่รับค่านี้จากสาย (ส่งมาก็ยุบเป็น `FAILED`) มิฉะนั้นแอปที่
 * ถูกแก้ไขจะแกล้งบอกว่า "หมดเวลา" เพื่อให้เว็บแสดงข้อความที่ชวนให้ผู้ใช้กดซ้ำได้เรื่อย ๆ
 */
export type IapFailure = 'CANCELLED' | 'UNAVAILABLE' | 'FAILED' | 'TIMEOUT'

/** ค่าที่ **สาย** ส่งมาได้จริง — TIMEOUT ไม่อยู่ในนี้โดยตั้งใจ */
const WIRE_FAILURES = ['CANCELLED', 'UNAVAILABLE', 'FAILED'] as const

export type IapRequestSpec =
  | { kind: 'products'; requestId: string }
  | { kind: 'purchase'; requestId: string; productId: string }
  | { kind: 'restore'; requestId: string }
  /** สั่งปิดธุรกรรม — **หลังเซิร์ฟเวอร์ยืนยันว่าเปิดสิทธิ์แล้วเท่านั้น** ดู `IapPurchase` */
  | { kind: 'finish'; requestId: string; transactionId: string }

export type IapRequest =
  | { type: 'deep:iap-products'; requestId: string }
  | { type: 'deep:iap-purchase'; requestId: string; productId: string }
  | { type: 'deep:iap-restore'; requestId: string }
  | { type: 'deep:iap-finish'; requestId: string; transactionId: string }

/**
 * ธุรกรรมหนึ่งใบที่ซื้อ/กู้คืนมาได้
 *
 * 🛑 ต้องมี `transactionId` คู่กับใบเซ็นเสมอ — StoreKit ส่งธุรกรรมที่ยัง **ไม่ถูกปิด** กลับมา
 * ทุกครั้งที่เปิดแอปจนกว่าเราจะสั่งปิด (กลไกกู้คืนในตัว BR-IAP-11) · ไม่มีเลขใบ = สั่งปิดไม่ได้
 * = ธุรกรรมค้างวนกลับมาตลอดกาล
 */
export interface IapPurchase {
  jws: string
  transactionId: string
}

export type IapResult =
  | { requestId: string; ok: true; kind: 'products'; products: IapProduct[] }
  | ({ requestId: string; ok: true; kind: 'purchase' } & IapPurchase)
  | { requestId: string; ok: true; kind: 'restore'; items: IapPurchase[] }
  | { requestId: string; ok: false; reason: IapFailure }

/** ข้อความที่เว็บส่งไปให้ native — prefix `deep:iap-` คือสิ่งที่ฝั่งแอป allow-list ไว้ */
export function buildIapRequest(spec: IapRequestSpec): IapRequest {
  switch (spec.kind) {
    case 'products':
      return { type: 'deep:iap-products', requestId: spec.requestId }
    case 'purchase':
      return { type: 'deep:iap-purchase', requestId: spec.requestId, productId: spec.productId }
    case 'restore':
      return { type: 'deep:iap-restore', requestId: spec.requestId }
    case 'finish':
      return { type: 'deep:iap-finish', requestId: spec.requestId, transactionId: spec.transactionId }
  }
}

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0

function readProduct(v: unknown): IapProduct | null {
  if (typeof v !== 'object' || v === null) return null
  const p = v as Record<string, unknown>
  if (!str(p.productId) || !str(p.displayName) || !str(p.displayPrice)) return null
  return { productId: p.productId, displayName: p.displayName, displayPrice: p.displayPrice }
}

/**
 * แปลของที่ native ส่งกลับมา — `null` = ไม่น่าเชื่อถือ ทิ้งทั้งใบ
 *
 * 🛑 ห้าม throw: ตัวเรียกอยู่ใน event handler ของ `window` การ throw ที่นั่นไม่มีใครรับ
 * และจะทำให้คำขอที่รออยู่ค้างตลอดกาลแทนที่จะขึ้นข้อความบอกผู้ใช้
 */
export function parseIapResult(raw: unknown): IapResult | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (!str(r.requestId)) return null

  if (r.ok === false) {
    const reason: IapFailure = WIRE_FAILURES.find((k) => k === r.reason) ?? 'FAILED'
    return { requestId: r.requestId, ok: false, reason }
  }
  if (r.ok !== true) return null

  if (r.kind === 'products') {
    if (!Array.isArray(r.products)) return null
    const products: IapProduct[] = []
    for (const item of r.products) {
      const p = readProduct(item)
      /* 🛑 ตัวเดียวพัง = ตกทั้งใบ — โชว์ไม่ครบ 3 tier แย่กว่าไม่โชว์เลย
         เพราะผู้ใช้จะเลือกจากของที่เห็นโดยไม่รู้ว่ามีตัวที่เหมาะกว่าหายไป */
      if (!p) return null
      products.push(p)
    }
    return { requestId: r.requestId, ok: true, kind: 'products', products }
  }

  if (r.kind === 'purchase') {
    /* ไม่มีใบเซ็น = พิสูจน์กับเซิร์ฟเวอร์ไม่ได้ · ไม่มีเลขใบ = สั่งปิดธุรกรรมไม่ได้
       ⇒ ขาดอย่างใดอย่างหนึ่งก็ถือว่าไม่สำเร็จ */
    if (!str(r.jws) || !str(r.transactionId)) return null
    return { requestId: r.requestId, ok: true, kind: 'purchase', jws: r.jws, transactionId: r.transactionId }
  }

  if (r.kind === 'restore') {
    if (!Array.isArray(r.items)) return null
    const items: IapPurchase[] = []
    for (const raw of r.items) {
      if (typeof raw !== 'object' || raw === null) return null
      const it = raw as Record<string, unknown>
      if (!str(it.jws) || !str(it.transactionId)) return null
      items.push({ jws: it.jws, transactionId: it.transactionId })
    }
    /* ว่างได้ — แปลว่าไม่มีอะไรให้กู้คืน ไม่ใช่ความผิดพลาด */
    return { requestId: r.requestId, ok: true, kind: 'restore', items }
  }

  /* ชนิดที่ไม่รู้จัก = ฝั่งหนึ่งเพิ่มของใหม่ฝ่ายเดียว ⇒ fail-closed ดังกว่าเงียบ */
  return null
}
