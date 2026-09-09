import 'server-only'

/**
 * apple/server-api — ตั๋วเข้า App Store Server API (feature 00064 · BR-IAP-15)
 *
 * ใช้โดย **ตัวเดินตรวจซ้ำ** เท่านั้น — เส้นทางให้สิทธิ์ปกติไม่ต้องเรียก Apple เลย
 * (ตรวจลายเซ็นออฟไลน์ที่ `jws.ts`) ที่นี่มีไว้ถามเมื่อ **ข่าวหาย**
 *
 * ## ทำไมต้องมี
 *
 * webhook หายได้จริง — Apple ยิงตอนที่เราล่มหรือกำลัง deploy พอดี ข่าวนั้นหายไปเลย
 * พึ่ง webhook อย่างเดียว = วันหนึ่งจะมีคนใช้ฟรีตลอดไปโดยไม่มีใครรู้
 *
 * ## 🛑 ES256 ต้องเป็น P-1363 ไม่ใช่ DER
 *
 * `crypto.sign()` ของ Node คืน DER เป็นค่าปริยาย แต่ JWT ต้องการ raw R‖S
 * ⇒ ต้องสั่ง `dsaEncoding: 'ieee-p1363'` · ลืมแล้ว Apple ตอบ 401 ทุกครั้งโดยไม่บอกสาเหตุ
 * และจะดูเหมือน "กุญแจผิด" ทั้งที่กุญแจถูก — เสียเวลาหาสาเหตุนานมาก
 *
 * ## 🛑 ไม่ใช้ไลบรารี JWT
 *
 * `jose` มีใน node_modules จริง แต่มาแบบ transitive (ผ่าน next-auth) การ import ของที่
 * ไม่ได้ประกาศเป็น dependency ตรง ๆ = วันที่ next-auth เปลี่ยนเวอร์ชันแล้วมันหายไป
 * โค้ดนี้จะพังบน prod โดยที่ package.json ไม่มีอะไรบอกใบ้เลย · `node:crypto` ทำได้อยู่แล้ว
 */
import { createPrivateKey, sign as signBuffer } from 'node:crypto'

/** อายุตั๋ว 20 นาที — Apple ปฏิเสธตั๋วที่ยาวเกิน 60 นาที เผื่อไว้เยอะเพราะนาฬิกาอาจเพี้ยน */
const TOKEN_LIFETIME_SECONDS = 20 * 60

export interface AppleApiCredentials {
  keyId: string
  issuerId: string
  bundleId: string
  /** เนื้อในไฟล์ .p8 — รับได้ทั้งขึ้นบรรทัดจริงและแบบ `\n` ที่ Vercel เก็บไว้ */
  privateKeyPem: string
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url')

/**
 * ตั๋วสำหรับเรียก App Store Server API
 *
 * @throws เมื่อกุญแจอ่านไม่ออก — ตั้งใจให้ดัง ไม่ใช่คืนตั๋วเสียแล้วไปเจอ 401 ปลายทาง
 *   ซึ่งแยกไม่ออกจาก "ตั้งค่า issuer ผิด"
 */
export function buildAppleApiJwt(creds: AppleApiCredentials, now: Date = new Date()): string {
  /* 🛑 Vercel เก็บค่าหลายบรรทัดเป็น `\n` ตัวอักษร ไม่ใช่ขึ้นบรรทัดจริง — ไม่แปลงกลับ
     `createPrivateKey` จะพังบน prod ทั้งที่เทสในเครื่องผ่านหมด */
    const pem = creds.privateKeyPem.includes('\\n')
    ? creds.privateKeyPem.replace(/\\n/g, '\n')
    : creds.privateKeyPem
  const key = createPrivateKey(pem)

  const iat = Math.floor(now.getTime() / 1000)
  const header = { alg: 'ES256', kid: creds.keyId, typ: 'JWT' }
  const payload = {
    iss: creds.issuerId,
    iat,
    exp: iat + TOKEN_LIFETIME_SECONDS,
    aud: 'appstoreconnect-v1',
    bid: creds.bundleId,
  }

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  /* 🛑 `dsaEncoding: 'ieee-p1363'` คือหัวใจ — ดูเหตุผลหัวไฟล์ */
  const signature = signBuffer('sha256', Buffer.from(signingInput), {
    key,
    dsaEncoding: 'ieee-p1363',
  })
  return `${signingInput}.${b64url(signature)}`
}

const PRODUCTION_HOST = 'https://api.storekit.itunes.apple.com'
const SANDBOX_HOST = 'https://api.storekit-sandbox.itunes.apple.com'

/**
 * บ้านของ API ตาม environment ที่บันทึกไว้กับใบนั้น
 *
 * 🛑 ถามผิดบ้าน = 404 ทุกครั้งแม้ตั๋วถูก · ค่าที่ไม่รู้จักไปทาง Sandbox โดยตั้งใจ —
 * ถามผิดบ้านแล้วไม่เจอ ปลอดภัยกว่าไปยุ่งกับข้อมูลจริงด้วยความเข้าใจผิด
 */
export function appleApiHost(environment: string | null | undefined): string {
  return environment === 'Production' ? PRODUCTION_HOST : SANDBOX_HOST
}

/** ธุรกรรมล่าสุดของใบหนึ่ง ตามที่ Apple ตอบมาจาก `/inApps/v1/subscriptions/{id}` */
export interface AppleSubscriptionStatus {
  signedTransactionInfo: string
  /** ที่อยู่ของ `gracePeriodExpiresDate` — ไม่มีก็ได้ แปลว่าไม่ได้อยู่ในโหมด billing retry */
  signedRenewalInfo: string | null
}

/**
 * หยิบธุรกรรมของ `originalTransactionId` ที่ถามไป
 *
 * 🛑 หยิบใบแรกมั่ว ๆ ไม่ได้ — บัญชีที่เคยเปลี่ยน tier จะมีหลายใบในกลุ่มเดียวกัน
 * หยิบผิดใบ = เขียนสถานะของแพ็กเกจเก่าทับของปัจจุบัน ลูกค้าถูกลดขั้นโดยไม่มีสาเหตุ
 * และเราจะหาสาเหตุไม่เจอเพราะทุกอย่าง "ทำงานปกติ"
 */
export function readSubscriptionStatus(
  body: unknown,
  originalTransactionId: string,
): AppleSubscriptionStatus | null {
  if (typeof body !== 'object' || body === null) return null
  const data = (body as { data?: unknown }).data
  if (!Array.isArray(data)) return null

  for (const group of data) {
    const txs = (group as { lastTransactions?: unknown })?.lastTransactions
    if (!Array.isArray(txs)) continue
    for (const raw of txs) {
      if (typeof raw !== 'object' || raw === null) continue
      const tx = raw as Record<string, unknown>
      if (tx.originalTransactionId !== originalTransactionId) continue
      if (typeof tx.signedTransactionInfo !== 'string' || tx.signedTransactionInfo.length === 0) return null
      return {
        signedTransactionInfo: tx.signedTransactionInfo,
        signedRenewalInfo:
          typeof tx.signedRenewalInfo === 'string' && tx.signedRenewalInfo.length > 0
            ? tx.signedRenewalInfo
            : null,
      }
    }
  }
  return null
}
