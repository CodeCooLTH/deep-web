// (00025 ส่วนขยาย 2026-08-12) — "สายที่เชื่อมแล้วยังใช้งานได้อยู่ไหม" ของช่องทาง LINE
//
// 🛑 ไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ล้วน (ไม่แตะ DB ไม่ยิง LINE ไม่รู้จัก React) เพราะกติกาข้างในนี้
// ตัดสิน **สิ่งที่ผู้ใช้เห็น** — ป้ายสถานะบนการ์ดช่องทาง และสีของมัน. ถ้าปล่อยให้เขียนเป็นเทอร์นารี
// ใน JSX แล้ววันหนึ่งมีใครเขียนกลับด้าน จะไม่มีอะไรจับได้เลย: `tsc`/build/detector/theme-guard
// ผ่านหมดเพราะมันเป็น boolean ที่ถูกต้องตามชนิดทุกประการ สิ่งที่ผิดคือ *ความหมาย* ไม่ใช่ *รูปแบบ*
// (docs/conventions/ui-boolean-needs-a-testable-home.md — บทเรียนปุ่ม "ย่อกลับ" 2026-08-09)
//
// AC-CH-23/24/25 ของ EXTENSIONS-2026-08-12-connection-health.md

import { TOKEN_EXPIRING_DAYS, SECRET_MISMATCH_MIN_FAILS } from './constants'

/** สถานะสุขภาพของช่องทาง LINE — เรียงตาม "ร้านเสียหายเร็วแค่ไหนถ้าไม่แก้" ไม่ใช่ตามลำดับที่เขียนโค้ด */
export type LineChannelHealth =
  /** ลายเซ็น webhook ไม่ผ่าน = ข้อความลูกค้าเข้าไม่ถึงเราเลย และ LINE ยังรายงานว่าส่งสำเร็จ */
  | 'SECRET_MISMATCH'
  /** LINE ปฏิเสธ access token แล้วจริง — ส่งออกไม่ได้ */
  | 'TOKEN_INVALID'
  /** ยังไม่ได้วาง webhook URL ในคอนโซล LINE */
  | 'WEBHOOK_NOT_SET'
  /** วาง URL แล้วแต่สวิตช์ "Use webhook" ปิดอยู่ */
  | 'WEBHOOK_INACTIVE'
  /** webhook ชี้ไป URL อื่นที่ไม่ใช่ของเรา */
  | 'WEBHOOK_POINTS_ELSEWHERE'
  /** token ชนิด 30 วัน และเหลือน้อยกว่าเกณฑ์เตือน */
  | 'TOKEN_EXPIRING'
  /** ผ่านทุกด่านที่ตรวจได้ — 🛑 สถานะเดียวที่ใช้สีเขียวได้ (Verified-Means-Green) */
  | 'HEALTHY'

export interface LineWebhookProbe {
  /** URL ที่ตั้งไว้ในคอนโซล LINE — `null` = LINE ตอบว่ายังไม่ได้ตั้ง */
  endpoint: string | null
  /** สวิตช์ "Use webhook" */
  active: boolean
  /** endpoint ชี้มาที่ instance นี้ของเราจริงไหม (เทียบแบบ normalize แล้ว) */
  matchesUs: boolean
}

export interface LineChannelHealthInput {
  /** `ShopChannel.status` — 'ACTIVE' | 'TOKEN_INVALID' | 'DISCONNECTED' */
  status: string
  /** `null` = token ไม่หมดอายุ (long-lived) **หรือ** ยังไม่เคยอ่าน — ทั้งสองกรณีห้ามเตือน */
  tokenExpiresAt: Date | null
  /** เหตุผลที่ event ขาเข้าถูกปฏิเสธล่าสุด */
  inboundFailReason: string | null
  /**
   * จำนวนครั้งที่ถูกปฏิเสธติดกัน (รีเซ็ตเป็น 0 ทุกครั้งที่ ingest สำเร็จ)
   *
   * 🛑 **มีอยู่เพราะเหตุผลด้านความปลอดภัย ไม่ใช่เพื่อความสวยงาม:** `x-line-signature` คือ
   * authentication เพียงอย่างเดียวของ webhook ⇒ คำขอที่ลายเซ็นไม่ผ่านคือ **คำขอที่ไม่ผ่านการยืนยัน
   * ตัวตน** ใครก็ยิงเข้ามาได้ถ้ารู้ `destination` (bot userId ซึ่งกึ่งสาธารณะ). ถ้าให้ครั้งเดียว
   * พลิกการ์ดเป็น "Channel secret ไม่ตรง" ได้ = เปิดช่องให้คนนอกทำให้ร้านเห็นคำเตือนเท็จ แล้วร้าน
   * จะไปไล่แก้ credential ที่ไม่ได้พัง ⇒ ต้องเห็นซ้ำถึงเกณฑ์ก่อนจึงเชื่อ
   */
  inboundFailCount: number
  /** ผลตรวจ webhook ล่าสุด — 🛑 `null` = **ยังไม่เคยตรวจ** ไม่ใช่ "ตรวจแล้วไม่ผ่าน" */
  webhook: LineWebhookProbe | null
}

/**
 * ตัดสินสถานะที่ควรแสดง — คืน **ตัวร้ายแรงที่สุดตัวเดียว** (AC-CH-23)
 *
 * กติกาที่ห้ามกลับทิศ:
 * 1. 🛑 `HEALTHY` ต้องผ่าน **ทุก** ด่าน ไม่ใช่แค่ `status === 'ACTIVE'` — การ์ดเดิมขึ้นเขียว
 *    "เชื่อมแล้ว" ได้ทั้งที่ webhook ไม่เคยถูกตั้ง ซึ่งละเมิด Verified-Means-Green มาตลอด
 * 2. 🛑 ข้อมูลที่ **ยังไม่เคยตรวจ** (`webhook === null`) ห้ามตีเป็นความผิด — ข้ามไปพิจารณาข้อถัดไป
 *    (ถ้าตีเป็นผิด ร้านที่เพิ่งเชื่อมจะเห็นสีแดงทันทีทั้งที่ยังไม่มีใครตรวจอะไรเลย)
 * 3. 🛑 `tokenExpiresAt === null` = ไม่หมดอายุ **ห้ามเข้า** `TOKEN_EXPIRING`
 */
export function resolveLineChannelHealth(
  input: LineChannelHealthInput,
  nowMs: number,
): LineChannelHealth {
  // 1) ขาเข้าตาย — ร้ายแรงสุดเพราะลูกค้าทักมาแล้วไม่มีใครเห็นเลย และไม่มีอาการอะไรให้สังเกต
  //    (ต่างจาก token ตาย ซึ่งอย่างน้อยร้านจะเจอ error ตอนกดส่ง)
  //    🛑 ต้องถึงเกณฑ์ก่อน — คำขอที่ลายเซ็นไม่ผ่านคือคำขอที่ไม่ผ่านการยืนยันตัวตน ครั้งเดียว
  //    พิสูจน์อะไรไม่ได้ (ดูคอมเมนต์ที่ `inboundFailCount`)
  if (input.inboundFailReason === 'SIGNATURE_MISMATCH' && input.inboundFailCount >= SECRET_MISMATCH_MIN_FAILS) {
    return 'SECRET_MISMATCH'
  }

  // 2) ขาออกตาย — LINE ปฏิเสธ token มาแล้วจริง (ไม่ใช่การอนุมาน)
  if (input.status === 'TOKEN_INVALID') return 'TOKEN_INVALID'

  // 3) webhook — ตรวจเฉพาะเมื่อ "เคยตรวจแล้ว" เท่านั้น (กติกาข้อ 2)
  if (input.webhook) {
    if (!input.webhook.endpoint) return 'WEBHOOK_NOT_SET'
    if (!input.webhook.matchesUs) return 'WEBHOOK_POINTS_ELSEWHERE'
    if (!input.webhook.active) return 'WEBHOOK_INACTIVE'
  }

  // 4) token ใกล้หมด — เตือนล่วงหน้า ไม่ใช่ความผิดพลาด
  if (input.tokenExpiresAt) {
    const msLeft = input.tokenExpiresAt.getTime() - nowMs
    if (msLeft <= TOKEN_EXPIRING_DAYS * 86_400_000) return 'TOKEN_EXPIRING'
  }

  return 'HEALTHY'
}

/** สถานะนี้แปลว่า "ยังมีอะไรต้องแก้" — ใช้ตัดสินว่าจะแสดงบรรทัดอธิบาย + ปุ่มทางออกไหม */
export function isLineChannelHealthy(health: LineChannelHealth): boolean {
  return health === 'HEALTHY'
}

/**
 * เหลืออีกกี่วันก่อน token หมดอายุ (ปัดขึ้น) — ใช้เขียนคำว่า "อีก N วัน" บนหน้าจอ
 * 🛑 อยู่ที่นี่ที่เดียว ห้ามให้ component คำนวณ `(expiresAt - now) / 86400000` เอง (HR16)
 */
export function daysUntilTokenExpiry(tokenExpiresAt: Date, nowMs: number): number {
  return Math.max(0, Math.ceil((tokenExpiresAt.getTime() - nowMs) / 86_400_000))
}

/**
 * เทียบว่า webhook endpoint ที่ตั้งไว้ในคอนโซล LINE ชี้มาที่เราจริงไหม (D-CH-6 / AC-CH-09)
 *
 * 🛑 เทียบกับ origin ของคำขอปัจจุบัน **ตัวเดียวกับที่เราแสดงให้ร้านคัดลอกไปวาง** ไม่ใช่ hardcode
 * โดเมน prod — ไม่งั้นบน dev จะขึ้นเตือนผิดตลอดแล้วคนจะเรียนรู้ที่จะเมินคำเตือนนั้น (HR16: ค่าที่
 * แสดงกับค่าที่ตรวจต้องมาจากที่เดียวกัน)
 *
 * normalize: ตัด trailing slash + lower-case ทั้งเส้น (host ของ URL ไม่ case-sensitive และร้าน
 * คัดลอกมาวางแล้วเผลอเติม `/` ท้ายเป็นเรื่องปกติ) — ไม่ใช่ `===` ดิบ
 */
export function webhookMatchesOrigin(endpoint: string | null, expectedUrl: string): boolean {
  if (!endpoint) return false
  const norm = (s: string) => s.trim().replace(/\/+$/, '').toLowerCase()
  return norm(endpoint) === norm(expectedUrl)
}
