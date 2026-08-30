/**
 * agent-performance — สูตรทุกตัวของรายงาน "ผลงานแอดมิน" (feature 00059)
 *
 * pure module — ไม่แตะ DB ไม่ import prisma ไม่ import อะไรที่เป็น server-only
 * เหตุผลเดียวกับ `auto-reply-schedule.ts`: สิ่งที่พลาดง่ายที่สุดของรายงานนี้คือ *นิยาม*
 * (ใครนับเป็นแอดมิน · ช่วงรอเริ่มนับตอนไหน · ใบไหนนับเป็นยอดขาย) ไม่ใช่การต่อ SQL —
 * ต้องพิสูจน์ได้ด้วยเทสโดยไม่ต้องมีฐานข้อมูล
 *
 * 🛑 ฉบับ SQL ของสูตรพวกนี้อยู่ที่ `agent-performance-sql.ts` และต้องให้ผลตรงกันเสมอ
 * (แพตเทิร์นเดียวกับ `order-stage.ts` ↔ `order-stage-sql.ts` — แก้ที่นี่ก่อนเสมอ)
 *
 * ── ศัพท์ (Hard Rule 16 — นิยามเดียวทั้งระบบ) ────────────────────────────────
 * "แอดมิน/agent"  = `User` ที่เป็นเจ้าของร้านหรือ `ShopMember` ของร้านนั้น (ไม่มีตาราง Agent แยก)
 * "ตอบโดยคน"      = `senderRole='SHOP' AND autoReplyKind IS NULL AND senderUserId IS NOT NULL`
 *                   สองเงื่อนไขแรกคือเกณฑ์ `sentByHuman` ที่ `channel-chat.service.ts` ใช้อยู่แล้ว
 *                   (บรรทัด 3360/3475) เงื่อนไขที่สามเพิ่มเพราะรายงานนี้ต้อง *ระบุตัวคน* ได้
 * "รอบการรอ"      = ช่วงตั้งแต่ข้อความลูกค้าใบแรกที่ยังไม่ถูกตอบ จนถึงคำตอบของคนใบถัดไป
 */

/** ค่าที่ `ChatMessage.autoReplyKind` เป็นได้เมื่อ "ระบบเป็นผู้ส่ง" — null = คนส่ง */
export const AUTO_REPLY_KINDS = ['AUTO', 'AUTO_TEST'] as const

/**
 * ข้อความหนึ่งใบเท่าที่สูตรตอบเวลาต้องรู้ — ตั้งใจไม่รับ `body`/`type` เข้ามาเลย
 *
 * 🛑 ห้ามเพิ่มเงื่อนไขที่อิง `type` (เช่น "ไม่นับการ์ดสินค้า") โดยไม่แก้ฉบับ SQL พร้อมกัน
 */
export type AgentChatEvent = {
  conversationId: string
  createdAt: Date
  /** ตัวตัดสินลำดับเมื่อ `createdAt` เท่ากันเป๊ะ — Meta ส่งเวลาระดับวินาทีสำหรับข้อความบางชนิด
   *  (ดูคอมเมนต์ `ChatMessage.seq` ใน schema) เรียงด้วยเวลาอย่างเดียวได้ลำดับไม่แน่นอน */
  seq: number
  senderRole: string
  senderUserId: string | null
  autoReplyKind: string | null
  isDeleted: boolean
}

/**
 * ข้อความ "ขาเข้า" ที่ทำให้เกิดหน้าที่ต้องตอบ
 *
 * ข้อความที่ถูกลบ (unsend) ไม่นับ — ลูกค้าถอนคำถามไปแล้ว การจับผู้ขายรอตอบสิ่งที่ไม่มีอยู่
 * ทำให้เวลาตอบเฉลี่ยของคนที่ทำงานถูกต้องแย่ลงโดยไม่มีทางแก้
 */
export function isCustomerMessage(e: AgentChatEvent): boolean {
  return e.senderRole === 'BUYER' && !e.isDeleted
}

/**
 * คำตอบที่ "คนของร้าน" เป็นผู้ส่ง และรู้ว่าเป็นใคร
 *
 * 🛑 ที่ไม่นับ (โดยตั้งใจ ตามข้อ 6 ของโจทย์):
 *   - บอท/คำตอบอัตโนมัติ  → `autoReplyKind` มีค่า
 *   - ข้อความระบบ/webhook  → เข้ามาทาง ingest ด้วย `senderUserId = null`
 *   - คำตอบที่พิมพ์จาก Business Suite ของ Meta → echo กลับมาโดยไม่มีตัวตนคนส่ง
 *     (`senderUserId = null` เช่นกัน) **อันนี้คือคนจริง แต่เราระบุตัวไม่ได้**
 *     จึงต้องรายงานเป็นตัวเลข "ตอบจากนอกระบบ" แยกไว้เสมอ ห้ามกลืนหาย
 *     (docs/conventions/partial-data-must-be-labeled-or-filled.md)
 */
export function isHumanAgentReply(e: AgentChatEvent): boolean {
  return (
    e.senderRole === 'SHOP' &&
    e.autoReplyKind === null &&
    e.senderUserId !== null &&
    !e.isDeleted
  )
}

/** คำตอบฝั่งร้านที่ "ไม่รู้ว่าใครตอบ" — คนตอบจาก Business Suite/แอปของแพลตฟอร์มโดยตรง */
export function isUnattributedShopReply(e: AgentChatEvent): boolean {
  return (
    e.senderRole === 'SHOP' && e.autoReplyKind === null && e.senderUserId === null && !e.isDeleted
  )
}

/** หนึ่งรอบการรอที่ถูกตอบแล้ว */
export type ResponsePair = {
  conversationId: string
  /** ข้อความลูกค้า *ใบแรก* ของรอบนี้ (ไม่ใช่ใบล่าสุดก่อนตอบ) */
  askedAt: Date
  repliedAt: Date
  agentUserId: string
  waitSec: number
  /** 1 = รอบแรกของเธรดนี้ ⇒ ตัวนี้คือ First Response Time */
  pairNo: number
}

const bySequence = (a: AgentChatEvent, b: AgentChatEvent) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.seq - b.seq

/**
 * จับคู่ "ช่วงรอ" กับ "คำตอบ" ของทุกเธรดที่ส่งเข้ามา
 *
 * อัลกอริทึม (ตรงกับ `buildResponsePairsSql()` บรรทัดต่อบรรทัด):
 *   เดินข้อความของเธรดตามลำดับเวลา
 *   - เจอข้อความลูกค้า **ขณะที่ยังไม่มีรอบค้าง** → เปิดรอบใหม่ จำเวลาใบนั้นไว้
 *   - เจอข้อความลูกค้าซ้ำขณะมีรอบค้างอยู่ → ไม่ทำอะไร (ลูกค้าพิมพ์รัว 5 ใบ = รอ 1 รอบ)
 *   - เจอคำตอบของคน **ขณะมีรอบค้าง** → ปิดรอบ บันทึกคู่ แล้วเคลียร์
 *   - เจอคำตอบของคนขณะไม่มีรอบค้าง → ไม่นับ (ร้านทักเอง/ตอบต่อเนื่องหลายใบ ไม่ใช่การรอ)
 *   - รอบที่ยังค้างตอนจบ = ยังไม่ถูกตอบ → **ไม่มีคู่** (ไม่ใช่ค่า 0 และไม่ใช่ค่าอนันต์)
 *
 * ⇒ ช่วงที่ "ไม่ควรมีใครต้องตอบ" ไม่ถูกนับเลยตั้งแต่ต้น: เวลาระหว่างที่ร้านตอบไปแล้วจนกว่า
 *   ลูกค้าจะพิมพ์มาใหม่ ไม่เคยเข้าสูตร
 */
export function computeResponsePairs(events: AgentChatEvent[]): ResponsePair[] {
  const byConversation = new Map<string, AgentChatEvent[]>()
  for (const e of events) {
    const bucket = byConversation.get(e.conversationId)
    if (bucket) bucket.push(e)
    else byConversation.set(e.conversationId, [e])
  }

  const pairs: ResponsePair[] = []
  for (const [conversationId, msgs] of byConversation) {
    const ordered = [...msgs].sort(bySequence)
    let askedAt: Date | null = null
    let pairNo = 0

    for (const m of ordered) {
      if (isCustomerMessage(m)) {
        if (askedAt === null) askedAt = m.createdAt
        continue
      }
      if (!isHumanAgentReply(m) || askedAt === null) continue

      pairNo += 1
      pairs.push({
        conversationId,
        askedAt,
        repliedAt: m.createdAt,
        agentUserId: m.senderUserId as string,
        // ปัดเป็นวินาทีเต็มตั้งแต่ต้นทาง เหมือน `chat-metrics.service.ts` — หน่วยเล็กกว่านั้น
        // ไม่มีความหมายกับสิ่งที่รายงานนี้ตอบ และทำให้ค่าเฉลี่ยสองฝั่ง (SQL/TS) ต่างกันที่ทศนิยม
        waitSec: Math.round((m.createdAt.getTime() - askedAt.getTime()) / 1000),
        pairNo,
      })
      askedAt = null
    }
  }
  return pairs
}

/** ค่าเฉลี่ย (ปัดเป็นจำนวนเต็ม) — `null` เมื่อไม่มีตัวอย่างเลย ห้ามคืน 0 */
export function average(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

/**
 * มัธยฐาน — คู่กับ `average` เสมอบนหน้าจอ
 *
 * ทำไมต้องมีทั้งคู่: ระบบนี้ไม่มีตาราง "เวลาทำการ" ให้หักช่วงที่ร้านปิด (ยืนยันแล้ว —
 * `auto-reply-schedule.ts` เป็นเวลาทำงานของ *บอท* ซึ่งมักตั้งไว้ตรงข้ามกับเวลาที่คนอยู่)
 * ⇒ ข้อความที่เข้ามาตอนตีสองแล้วตอบตอนเก้าโมงจะดันค่าเฉลี่ยขึ้นเป็นชั่วโมงทั้งที่ทีมทำงานปกติ
 * มัธยฐานทนต่อเคสนี้ ค่าเฉลี่ยไม่ทน — แสดงตัวเดียวคือการเลือกโกหกด้านใดด้านหนึ่ง
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

/**
 * อัตราการปิดการขาย = เธรดที่ปิดได้ / เธรดที่ **เข้าเกณฑ์** × 100
 *
 * 🛑 คืน `null` เมื่อตัวหารเป็น 0 — ห้ามคืน 0 เด็ดขาด "ไม่มีเธรดให้ปิด" กับ "ปิดไม่ได้เลยสักเธรด"
 * เป็นคนละเรื่องกันโดยสิ้นเชิง และตัวเลข 0% จะทำให้แอดมินที่ยังไม่ได้รับงานดูเหมือนทำงานล้มเหลว
 */
export function conversionRatePct(converted: number, qualified: number): number | null {
  if (qualified <= 0) return null
  return Math.round((converted / qualified) * 1000) / 10
}

/** SLA % = เธรดที่ตอบทันเกณฑ์ / เธรดที่ต้องมีการตอบครั้งแรก × 100 — `null` เมื่อไม่มีตัวหาร */
export function slaAchievementPct(within: number, required: number): number | null {
  if (required <= 0) return null
  return Math.round((within / required) * 1000) / 10
}

/* ────────────────────────────────────────────────────────────────────────────
 * กติกาการยกความดีความชอบของออเดอร์ (Attribution)
 * ──────────────────────────────────────────────────────────────────────────── */

export type AttributionBasis = 'ORDER_ACTOR' | 'CONVERSATION_OWNER' | 'UNATTRIBUTED'

export type OrderAttribution = { agentUserId: string | null; basis: AttributionBasis }

/**
 * ใครควรได้เครดิตของออเดอร์ใบนี้
 *
 * 1. **`Order.createdByUserId`** — ระบบมีของที่ดีกว่า "เจ้าของเธรด" อยู่แล้ว: คอลัมน์นี้คือ
 *    *หลักฐานการกระทำ* ที่ `createOrder` เขียนไว้ตอนกดสร้างจริง (schema.prisma: "คนที่กด
 *    สร้างออเดอร์นี้") ไม่ใช่ค่าที่ derive ทีหลัง โจทย์ระบุเองว่า "ถ้าระบบมีกลไก audit ที่ดีกว่า
 *    ให้ใช้ตัวนั้น" — นี่คือตัวนั้น
 *
 * 2. **เจ้าของเธรด ณ เวลาที่ออเดอร์ถูกสร้าง** = คนที่ตอบแชทเป็นคนสุดท้าย *ก่อน* เวลาสร้าง
 *    ใช้เมื่อข้อ 1 ว่าง ซึ่งเกิดได้ 2 กรณีตามที่ schema เขียนไว้เอง: ออเดอร์เก่าก่อน migration
 *    2026-08-04 และออเดอร์ที่ระบบออกให้เอง (ปิดประมูล)
 *
 *    🛑 นี่ไม่ใช่ "ใครส่งข้อความล่าสุด" — ข้อความล่าสุดของเธรดมักเป็นของ *ลูกค้า* หรือของบอท
 *    เกณฑ์นี้มองเฉพาะ "คำตอบของคน" เท่านั้น และมองย้อนหลังจากเวลาสร้างออเดอร์ ไม่ใช่จากตอนนี้
 *    (ถ้าอ่านจากตอนนี้ ออเดอร์เมื่อวานจะเปลี่ยนเจ้าของทุกครั้งที่มีคนอื่นเข้าไปตอบเธรดวันนี้)
 *
 * 3. ไม่เข้าทั้งสองข้อ → `UNATTRIBUTED` — ยอดยังถูกนับในภาพรวมร้าน แต่ไม่ขึ้นกับแอดมินคนไหน
 *    และต้องแสดงเป็นแถว "ไม่ระบุ" บนหน้าจอ ห้ามหารเฉลี่ยไปให้ทุกคนและห้ามซ่อน
 *
 * `createdByIsShopMember` — บัญชีที่หลุดจากร้านไปแล้ว (ลาออก) ยังอยู่ในคอลัมน์เดิม
 * ให้เครดิตต่อได้ แต่ผู้เรียกต้องเป็นคนตัดสินว่าจะแสดงชื่อยังไง (ดู service)
 */
export function attributeOrder(input: {
  createdByUserId: string | null
  conversationOwnerUserId: string | null
}): OrderAttribution {
  if (input.createdByUserId) {
    return { agentUserId: input.createdByUserId, basis: 'ORDER_ACTOR' }
  }
  if (input.conversationOwnerUserId) {
    return { agentUserId: input.conversationOwnerUserId, basis: 'CONVERSATION_OWNER' }
  }
  return { agentUserId: null, basis: 'UNATTRIBUTED' }
}

/**
 * เจ้าของเธรด ณ เวลาหนึ่ง = คนที่ตอบเป็นคนสุดท้ายก่อนเวลานั้น
 * (ฟังก์ชันบริสุทธิ์แยกออกมาเพราะเป็นครึ่งที่ผิดง่ายที่สุดของกติกาข้อ 2 ข้างบน)
 */
export function resolveConversationOwnerAt(
  events: AgentChatEvent[],
  at: Date,
): string | null {
  let owner: string | null = null
  for (const e of [...events].sort(bySequence)) {
    if (e.createdAt.getTime() > at.getTime()) break
    if (isHumanAgentReply(e)) owner = e.senderUserId
  }
  return owner
}

/* ────────────────────────────────────────────────────────────────────────────
 * การแสดงผล
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * เวลาตอบเป็นคำที่คนอ่านออก: 32 → "32 วิ" · 84 → "1 น. 24 วิ" · 7325 → "2 ชม. 2 น."
 *
 * 🛑 ทำไมไม่ใช้ `formatDurationTH()` ของ `appointments.ts` (Hard Rule 16 — ตอบไว้ตรงนี้เลย
 * เพื่อไม่ให้คนถัดไปต้องเดา): ตัวนั้นรับ **นาที** และเป็นคำเรียก "ระยะเวลาบริการที่ร้านตั้งไว้"
 * ซึ่งไม่มีความหมายต่ำกว่านาที — เวลาตอบแชทส่วนใหญ่อยู่ระหว่าง 10–120 วินาที ปัดเป็นนาที
 * แล้วทั้งคอลัมน์จะกลายเป็น "0 นาที" หรือ "1 นาที" เหมือนกันหมดจนเรียงลำดับไม่มีความหมาย
 * สองอันนี้จึงเป็นคนละหน่วยคนละความหมาย ไม่ใช่ของซ้ำ — และห้ามยุบรวมกัน
 *
 * `null` = ไม่มีตัวอย่าง (ไม่เคยถูกตอบ) → คืน "—" ให้หน้าจอ ห้ามคืน "0 วิ"
 */
export function formatResponseDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—'
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s} วิ`
  const m = Math.floor(s / 60)
  if (m < 60) {
    const rest = s % 60
    return rest === 0 ? `${m} น.` : `${m} น. ${rest} วิ`
  }
  const h = Math.floor(m / 60)
  const restMin = m % 60
  if (h < 24) return restMin === 0 ? `${h} ชม.` : `${h} ชม. ${restMin} น.`
  const d = Math.floor(h / 24)
  const restHour = h % 24
  return restHour === 0 ? `${d} วัน` : `${d} วัน ${restHour} ชม.`
}

/** เปอร์เซ็นต์ที่อาจไม่มีค่า — "—" ไม่ใช่ "0%" (เหตุผลเดียวกับ `conversionRatePct`) */
export function formatPercent(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—'
  return `${pct}%`
}

/* ────────────────────────────────────────────────────────────────────────────
 * ชั้นที่ 2 — จากเธรดดิบ → ตัวชี้วัด
 *
 * 🛑 นี่คือ *ข้อกำหนด* ของรายงานทั้งฉบับ ไม่ใช่โค้ดสำรอง: ตัวเลขที่ขึ้นจอถูกคำนวณด้วย SQL
 * (`agent-performance-sql.ts` + service) เพื่อไม่ต้องขนข้อความลงมาที่แอป แต่ "ความหมาย"
 * ของทุกตัวเลขถูกนิยามและพิสูจน์ที่นี่ ถ้าสองฝั่งไม่ตรงกัน ให้ถือว่าฝั่ง SQL ผิดเสมอ
 * ──────────────────────────────────────────────────────────────────────────── */

export type OrderInput = {
  orderId: string
  createdAt: Date
  /** `Order.createdByUserId` — หลักฐานว่าใครกดสร้าง (null ได้ ดู `attributeOrder`) */
  createdByUserId: string | null
  /** ผ่านเกณฑ์ `countsAsRevenue()` ของ `order-revenue.ts` แล้วหรือยัง — ผู้เรียกตัดสินมาก่อน */
  countsAsRevenue: boolean
  /** `Order.totalAmount` เป็นตัวเลข (Decimal ถูกแปลงมาแล้ว) */
  amount: number
}

export type ConversationInput = {
  conversationId: string
  /** เวลาที่เธรดถูกเปิด (`Conversation.createdAt`) — ตัวกำหนดว่าเธรดนี้อยู่ในช่วงไหน */
  startedAt: Date
  lastMessageAt: Date
  isSpam: boolean
  /** `Conversation.channel` — 'DEEP' | 'MESSENGER' | 'INSTAGRAM' | 'LINE' (ดู `chat-channel.ts`) */
  channel: string
  /** ที่มาของเธรด — `Conversation.referralSource` ('ADS' | 'SHORTLINK') · null = ทักเข้ามาเอง */
  referralSource: string | null
  events: AgentChatEvent[]
  orders: OrderInput[]
}

/** ผลย่อยของเธรดหนึ่ง — หนึ่งแถวต่อเธรด (ไม่ใช่ต่อข้อความ) */
export type ConversationFact = {
  conversationId: string
  startedAt: Date
  lastMessageAt: Date
  isSpam: boolean
  channel: string
  referralSource: string | null
  /** null = ไม่เคยมีคนตอบเลย (บอทตอบ/ตอบจากนอกระบบ/ไม่มีใครตอบ ก็ให้ค่านี้เหมือนกัน) */
  firstResponseSec: number | null
  firstResponderUserId: string | null
  /** เวลารอของ *ทุก* รอบที่ถูกตอบ (รวมรอบแรก) — ฐานของ Average Response Time */
  responseSamples: { agentUserId: string; waitSec: number }[]
  /** แอดมินทุกคนที่ตอบในเธรดนี้อย่างน้อย 1 ครั้ง */
  repliedAgentUserIds: string[]
  /** เธรดนี้เคยมีลูกค้าทักเข้ามาไหม — เธรดที่ร้านเปิดเองแล้วลูกค้าไม่เคยตอบไม่ต้องมี SLA */
  hasInbound: boolean
  /** มีคำตอบฝั่งร้านที่ระบุตัวคนไม่ได้กี่ใบ (Business Suite) — ใช้ติดป้ายความครบของข้อมูล */
  unattributedReplyCount: number
  orders: (OrderInput & { attribution: OrderAttribution })[]
  /** เวลาปิดการขาย = ออเดอร์ที่นับเป็นยอดขาย *ใบแรก* − ข้อความลูกค้าใบแรก (วินาที) */
  timeToCloseSec: number | null
}

export function computeConversationFact(input: ConversationInput): ConversationFact {
  // ตรึง conversationId ของทุกใบให้เป็นของเธรดนี้ก่อนเสมอ — ผู้เรียกบางทาง (เทส/ตัวประกอบ
  // ข้อมูล) ส่ง event ที่ยังไม่ได้ติดคีย์เธรดมา ถ้าไม่ตรึง `computeResponsePairs` จะจัดกลุ่ม
  // ผิดก้อนแล้วคืนลิสต์ว่างอย่างเงียบ ๆ (เวลาตอบหายทั้งเธรดโดยไม่มี error)
  const events = input.events.map((e) =>
    e.conversationId === input.conversationId ? e : { ...e, conversationId: input.conversationId },
  )
  const pairs = computeResponsePairs(events)
  const first = pairs.find((p) => p.pairNo === 1) ?? null

  const repliedAgentUserIds = [
    ...new Set(events.filter(isHumanAgentReply).map((e) => e.senderUserId as string)),
  ]

  const firstInbound = events.filter(isCustomerMessage).sort(bySequence)[0]

  const orders = input.orders.map((o) => ({
    ...o,
    attribution: attributeOrder({
      createdByUserId: o.createdByUserId,
      conversationOwnerUserId: resolveConversationOwnerAt(events, o.createdAt),
    }),
  }))

  // 🛑 "ใบแรกที่นับเป็นยอดขาย" เรียงด้วย createdAt ของออเดอร์ ไม่ใช่ลำดับที่ส่งเข้ามา —
  // 00033 ให้ผู้ขายเลือกวันที่ของออเดอร์เองได้ ลำดับใน array จึงไม่ใช่ลำดับเวลา
  const firstRevenueOrder = orders
    .filter((o) => o.countsAsRevenue)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]

  return {
    conversationId: input.conversationId,
    startedAt: input.startedAt,
    lastMessageAt: input.lastMessageAt,
    isSpam: input.isSpam,
    channel: input.channel,
    referralSource: input.referralSource,
    firstResponseSec: first ? first.waitSec : null,
    firstResponderUserId: first ? first.agentUserId : null,
    responseSamples: pairs.map((p) => ({ agentUserId: p.agentUserId, waitSec: p.waitSec })),
    repliedAgentUserIds,
    hasInbound: firstInbound !== undefined,
    unattributedReplyCount: events.filter(isUnattributedShopReply).length,
    orders,
    timeToCloseSec:
      firstRevenueOrder && firstInbound
        ? Math.max(
            0,
            Math.round(
              (firstRevenueOrder.createdAt.getTime() - firstInbound.createdAt.getTime()) / 1000,
            ),
          )
        : null,
  }
}

/**
 * เธรดนี้ "เข้าเกณฑ์" ให้นับเป็นตัวหารของอัตราการปิดการขายไหม
 *
 * 🛑 โจทย์ห้ามใช้ "เธรดทั้งหมด" เป็นตัวหาร — เกณฑ์ที่เลือกและเหตุผล:
 *   1. **ต้องมีลูกค้าทักเข้ามาจริง** — เธรดที่ร้านเปิดค้างไว้เองยังไม่ใช่โอกาสขาย
 *   2. **ต้องมีคนของร้านตอบอย่างน้อย 1 ครั้ง** — เธรดที่ไม่มีใครตอบเลย "ปิดการขายไม่ได้"
 *      โดยสภาพ การเอามาหารทำให้ทีมที่รับงานเยอะดูแย่ลงเพราะงานที่ไม่มีใครแตะ
 *      (เธรดกลุ่มนี้ไม่ได้หายไปไหน — มันคือตัวที่ทำให้ SLA ตก ซึ่งเป็นที่ที่ควรเห็นมัน)
 *   3. **ต้องไม่ใช่สแปม** — `Conversation.isSpam` เป็นธงที่ร้านกดเอง เธรดสแปมไม่ใช่โอกาสขาย
 *
 * ไม่ใช้ `isHidden` เป็นเกณฑ์: ธงนั้น auto-unhide ตัวเองเมื่อลูกค้าทักใหม่ (ดู schema) จึงเป็น
 * สถานะชั่วคราวของกล่องข้อความ ไม่ใช่คำตัดสินว่าเธรดนี้ไม่ใช่โอกาสขาย
 */
export function isQualifiedConversation(f: ConversationFact): boolean {
  return f.hasInbound && !f.isSpam && f.repliedAgentUserIds.length > 0
}

/**
 * เธรดนี้ "ถูกตอบจากนอกระบบล้วน ๆ" ไหม — มีคำตอบฝั่งร้าน แต่ไม่มีสักใบที่ระบุตัวคนได้
 *
 * 🛑 เกณฑ์นี้มีอยู่เพราะข้อมูลจริงบน prod บังคับให้มี (วัด 2026-08-27):
 * BT Premium สาขาพุทธมณฑลสาย 3 มี 834 เธรดใน 30 วัน **ตอบไปแล้ว 830** แต่ทีมพิมพ์จาก
 * Facebook Business Suite ทั้งหมด ซึ่ง Meta ไม่ส่งชื่อผู้พิมพ์กลับมา
 *
 * ถ้าไม่แยกกลุ่มนี้ออก เธรดพวกนี้จะถูกนับว่า "ไม่มีใครตอบ" ⇒ SLA ของร้านนั้นเป็น 0%
 * และการ์ด "ยังไม่มีใครตอบ" จะขึ้น 830 ทั้งที่ลูกค้าได้รับคำตอบครบทุกห้อง
 * = ตัวเลขที่ผิดข้อเท็จจริง ไม่ใช่แค่ตัวเลขที่ไม่สมบูรณ์
 *
 * ผู้ใช้เคาะ 2026-08-27: **"เอาเฉพาะฝั่งที่เค้าตอบผ่านระบบ"** ⇒ วัดเฉพาะสิ่งที่วัดได้จริง
 * แล้วรายงานกลุ่มที่วัดไม่ได้แยกออกมาเป็นตัวเลขของตัวเอง (ห้ามกลืน ห้ามเดา)
 */
export function isAnsweredOutsideSystem(f: ConversationFact): boolean {
  return f.unattributedReplyCount > 0 && f.repliedAgentUserIds.length === 0
}

/** เธรดนี้ปิดการขายได้ไหม — "มีออเดอร์ที่นับเป็นยอดขายอย่างน้อย 1 ใบ" (ไม่ว่ากี่ใบก็นับ 1) */
export function isConvertedConversation(f: ConversationFact): boolean {
  return f.orders.some((o) => o.countsAsRevenue)
}

export type PerformanceMetrics = {
  conversations: number
  qualifiedConversations: number
  convertedConversations: number
  conversionRatePct: number | null
  ordersCreated: number
  revenue: number
  firstResponseAvgSec: number | null
  firstResponseMedianSec: number | null
  responseAvgSec: number | null
  responseMedianSec: number | null
  responseSampleCount: number
  slaRequired: number
  slaWithin: number
  slaPct: number | null
  timeToCloseAvgSec: number | null
  /** เธรดที่ **ไม่มีใครตอบเลยจริง ๆ** — ไม่รวมเธรดที่ถูกตอบจากนอกระบบ */
  unansweredConversations: number
  /** เธรดที่ถูกตอบแล้ว แต่ตอบจากนอกระบบ ⇒ วัดผลงานรายคนไม่ได้ (ต้องแสดงแยกเสมอ) */
  answeredOutsideSystemConversations: number
  unattributedReplyCount: number

  /* ── เส้นทาง "ตอบแชท → เปิดบิล" (ผู้ใช้สั่ง 2026-08-27) ──────────────────────
   *
   * 🛑 ทำไมต้องมีแยกจาก `ordersCreated`/`convertedConversations`: สองตัวนั้นตอบว่า
   * **"ใครได้เครดิต"** ซึ่งยกให้คนเดียวเสมอ — แต่ข้อมูลจริงบน prod บอกว่ามีคนที่
   * *คุยจนลูกค้าตัดสินใจ* แล้ว *คนอื่นเป็นคนเปิดบิล* (BT ธัญบุรี 30 วัน: แอดมินคนหนึ่ง
   * ตอบแชท 54 ห้อง มีบิลออกมา 4 ใบ แต่เปิดเอง 0 ใบ)
   *
   * ถ้ารายงานมีแต่คอลัมน์เครดิต คนแบบนั้นจะขึ้น "—" ทั้งแถว = อ่านได้ว่าไม่ได้สร้างมูลค่าอะไรเลย
   * ซึ่งไม่จริง กลุ่มนี้จึงตอบคนละคำถาม: **"ใครมีส่วนในยอด"** ไม่ใช่ "ใครทำยอดได้"
   *
   * ทั้งหมดคิดจากเฉพาะ **เธรดที่คนนั้นตอบเอง** (ไม่ใช่เธรดที่แค่ถูกยกเครดิตให้)
   * และ **ไม่ต้องมี query เพิ่ม** — ข้อมูลอยู่ใน `ConversationFact.orders` ครบแล้ว
   */
  /** เธรดที่คนนี้ตอบเองอย่างน้อย 1 ครั้ง (ฐานของกรวยด้านล่าง) */
  repliedConversations: number
  /** ในนั้น มีบิลออกมากี่เธรด (ไม่สนว่าใครเปิด) */
  conversationsWithOrder: number
  /** ในนั้น ปิดการขายได้กี่เธรด (ไม่สนว่าใครได้เครดิต) */
  conversationsWithClosedOrder: number
  /** บิลบนเธรดที่คนนี้ตอบ ซึ่ง **คนอื่น** เป็นเจ้าของเครดิต (0 = ปิดเองทั้งหมด) */
  ordersCreatedByOthers: number
}

const EMPTY_METRICS: PerformanceMetrics = {
  conversations: 0, qualifiedConversations: 0, convertedConversations: 0, conversionRatePct: null,
  ordersCreated: 0, revenue: 0, firstResponseAvgSec: null, firstResponseMedianSec: null,
  responseAvgSec: null, responseMedianSec: null, responseSampleCount: 0,
  slaRequired: 0, slaWithin: 0, slaPct: null, timeToCloseAvgSec: null,
  unansweredConversations: 0, answeredOutsideSystemConversations: 0, unattributedReplyCount: 0,
  repliedConversations: 0, conversationsWithOrder: 0, conversationsWithClosedOrder: 0,
  ordersCreatedByOthers: 0,
}

/**
 * ตัวชี้วัดระดับ "ทั้งร้าน" ของกลุ่มเธรดที่ส่งเข้ามา
 *
 * ตัวหารของ SLA = เธรดที่ *ต้องมีการตอบครั้งแรก* = มีลูกค้าทักเข้ามาและไม่ใช่สแปม
 * (เธรดที่ไม่เคยถูกตอบอยู่ในตัวหารและนับเป็น "ไม่ทัน" — ดู `meetsFirstResponseSla`)
 */
export function summarizeShop(
  facts: ConversationFact[],
  slaLimitSec: number,
): PerformanceMetrics {
  if (facts.length === 0) return { ...EMPTY_METRICS }

  const qualified = facts.filter(isQualifiedConversation)
  const converted = qualified.filter(isConvertedConversation)
  /**
   * ตัวหารของ SLA = เธรดที่ต้องมีการตอบครั้งแรก **และวัดได้จริง**
   *
   * 🛑 ตัด "เธรดที่ตอบจากนอกระบบล้วน ๆ" ออกจากตัวหาร — ไม่ใช่การผ่อนเกณฑ์ แต่เป็นการไม่
   * ตัดสินสิ่งที่ไม่มีข้อมูล: เธรดพวกนั้นถูกตอบแล้วจริง เราแค่ไม่รู้ว่าเมื่อไรและใครตอบ
   * การนับเป็น "ไม่ทัน" คือการกล่าวหาโดยไม่มีหลักฐาน · การนับเป็น "ทัน" ก็เป็นการเดาเข้าข้าง
   * ⇒ เอาออกจากทั้งตัวตั้งและตัวหาร แล้วรายงานจำนวนแยกให้เห็นแทน
   *
   * เธรดที่ **ไม่มีใครตอบเลย** ยังอยู่ในตัวหารและนับว่าไม่ทันเหมือนเดิม (นั่นคือสิ่งที่ SLA มีไว้จับ)
   */
  const answeredOutside = facts.filter(isAnsweredOutsideSystem)
  const slaPool = facts.filter(
    (f) => f.hasInbound && !f.isSpam && !isAnsweredOutsideSystem(f),
  )
  const firstSamples = facts
    .map((f) => f.firstResponseSec)
    .filter((v): v is number => v !== null)
  const allSamples = facts.flatMap((f) => f.responseSamples.map((s) => s.waitSec))
  const closeSamples = facts
    .map((f) => f.timeToCloseSec)
    .filter((v): v is number => v !== null)
  const revenueOrders = facts.flatMap((f) => f.orders.filter((o) => o.countsAsRevenue))

  return {
    conversations: facts.length,
    qualifiedConversations: qualified.length,
    convertedConversations: converted.length,
    conversionRatePct: conversionRatePct(converted.length, qualified.length),
    ordersCreated: facts.reduce((n, f) => n + f.orders.length, 0),
    revenue: round2(revenueOrders.reduce((sum, o) => sum + o.amount, 0)),
    firstResponseAvgSec: average(firstSamples),
    firstResponseMedianSec: median(firstSamples),
    responseAvgSec: average(allSamples),
    responseMedianSec: median(allSamples),
    responseSampleCount: allSamples.length,
    slaRequired: slaPool.length,
    slaWithin: slaPool.filter(
      (f) => f.firstResponseSec !== null && f.firstResponseSec <= slaLimitSec,
    ).length,
    slaPct: slaAchievementPct(
      slaPool.filter((f) => f.firstResponseSec !== null && f.firstResponseSec <= slaLimitSec).length,
      slaPool.length,
    ),
    timeToCloseAvgSec: average(closeSamples),
    unansweredConversations: slaPool.filter((f) => f.firstResponseSec === null).length,
    answeredOutsideSystemConversations: answeredOutside.length,
    unattributedReplyCount: facts.reduce((n, f) => n + f.unattributedReplyCount, 0),
    // ระดับร้าน: "เธรดที่มีคนของร้านตอบ" = qualified อยู่แล้ว จึงใช้ชุดเดียวกันเพื่อไม่ให้
    // เกิดนิยามที่สองของคำเดียวกัน (HR16)
    repliedConversations: qualified.length,
    conversationsWithOrder: qualified.filter((f) => f.orders.length > 0).length,
    conversationsWithClosedOrder: converted.length,
    // ระดับร้านไม่มีความหมายของ "คนอื่นเปิดให้" — ทุกใบอยู่ในร้านเดียวกัน
    ordersCreatedByOthers: 0,
  }
}

export type AgentPerformanceRow = PerformanceMetrics & { agentUserId: string }

/**
 * แตกตัวชี้วัดรายแอดมิน
 *
 * ── ขอบเขตของแต่ละคน ────────────────────────────────────────────────────────
 * เธรดหนึ่งเป็นของแอดมิน A เมื่อ **A ตอบในเธรดนั้นอย่างน้อยหนึ่งครั้ง** หรือ
 * **A เป็นเจ้าของออเดอร์ที่ผูกกับเธรดนั้น**
 *
 * 🛑 ข้อสองไม่ใช่ของแถม — ถ้าไม่มี จะเกิดเคสที่ B คุยแชทแต่ A เป็นคนเปิดบิล แล้ว A ได้
 * "เธรดที่ปิดได้" โดยไม่มี "เธรดที่เข้าเกณฑ์" รองรับ ⇒ อัตราการปิดการขายเกิน 100%
 *
 * ⇒ ผลข้างเคียงที่ต้องบอกบนหน้าจอ: เธรดที่มีสองคนช่วยกันตอบถูกนับให้ **ทั้งคู่**
 * ผลรวมคอลัมน์ "เธรด" ของทุกแถวจึงมากกว่าตัวเลขรวมของร้านได้ ส่วนคอลัมน์ที่ผูกกับออเดอร์
 * (ออเดอร์/ยอดขาย/ปิดได้) ยกให้คนเดียวเสมอ ผลรวมจึงตรงกับร้านพอดี
 *
 * เวลาตอบของแต่ละคนนับเฉพาะรอบที่ **คนนั้นเป็นคนตอบ** ไม่ใช่ทุกรอบของเธรดที่เขาเคยแตะ
 * และ SLA รายคนนับเฉพาะเธรดที่ **เขาเป็นคนตอบครั้งแรก** (เธรดที่ไม่มีใครตอบเลยไม่มีเจ้าของ
 * จึงตกเป็นภาระของร้าน ไม่ใช่ของใครคนใดคนหนึ่ง — ผลรวม SLA รายคนจึงไม่เท่ากับของร้าน)
 */
export function summarizeByAgent(
  facts: ConversationFact[],
  slaLimitSec: number,
): AgentPerformanceRow[] {
  const scope = new Map<string, ConversationFact[]>()
  const push = (agentUserId: string, f: ConversationFact) => {
    const bucket = scope.get(agentUserId)
    if (bucket) {
      if (!bucket.includes(f)) bucket.push(f)
    } else scope.set(agentUserId, [f])
  }

  for (const f of facts) {
    for (const agentUserId of f.repliedAgentUserIds) push(agentUserId, f)
    for (const o of f.orders) {
      if (o.attribution.agentUserId) push(o.attribution.agentUserId, f)
    }
  }

  const rows: AgentPerformanceRow[] = []
  for (const [agentUserId, owned] of scope) {
    const qualified = owned.filter(
      (f) => isQualifiedConversation(f) && f.repliedAgentUserIds.includes(agentUserId),
    )
    const agentOrders = owned.flatMap((f) =>
      f.orders.filter((o) => o.attribution.agentUserId === agentUserId),
    )
    const convertedIds = new Set(
      owned
        .filter((f) => f.orders.some((o) => o.countsAsRevenue && o.attribution.agentUserId === agentUserId))
        .map((f) => f.conversationId),
    )
    // ตัวหารต้องครอบตัวตั้งเสมอ — ออเดอร์ที่ยกให้คนนี้ในเธรดที่เขาไม่ได้ตอบ ก็ยังต้องมีที่ยืน
    // ในตัวหาร ไม่งั้นอัตราจะเกิน 100% (ดูคอมเมนต์หัวฟังก์ชัน)
    const qualifiedIds = new Set(qualified.map((f) => f.conversationId))
    for (const id of convertedIds) qualifiedIds.add(id)

    /**
     * กรวย "ตอบแชท → เปิดบิล" — ฐานคือเธรดที่ **ตอบเอง** เท่านั้น
     * (ไม่ใช่ `owned` ซึ่งรวมเธรดที่แค่ถูกยกเครดิตให้ด้วย — ถ้าใช้ `owned` ตัวเลข "ตอบแชท"
     *  จะโตขึ้นจากเธรดที่เขาไม่เคยพิมพ์อะไรเลย แล้วกรวยจะโกหกตั้งแต่ขั้นแรก)
     */
    const repliedConvs = owned.filter((f) => f.repliedAgentUserIds.includes(agentUserId))
    const ordersOnRepliedConvs = repliedConvs.flatMap((f) => f.orders)

    const firstOwned = owned.filter((f) => f.firstResponderUserId === agentUserId)
    const firstSamples = firstOwned
      .map((f) => f.firstResponseSec)
      .filter((v): v is number => v !== null)
    const mySamples = owned.flatMap((f) =>
      f.responseSamples.filter((s) => s.agentUserId === agentUserId).map((s) => s.waitSec),
    )
    const closeSamples = owned
      .filter((f) => f.orders.some((o) => o.countsAsRevenue && o.attribution.agentUserId === agentUserId))
      .map((f) => f.timeToCloseSec)
      .filter((v): v is number => v !== null)
    const withinSla = firstOwned.filter(
      (f) => f.firstResponseSec !== null && f.firstResponseSec <= slaLimitSec,
    ).length
    const revenue = agentOrders
      .filter((o) => o.countsAsRevenue)
      .reduce((sum, o) => sum + o.amount, 0)

    rows.push({
      agentUserId,
      conversations: owned.length,
      qualifiedConversations: qualifiedIds.size,
      convertedConversations: convertedIds.size,
      conversionRatePct: conversionRatePct(convertedIds.size, qualifiedIds.size),
      ordersCreated: agentOrders.length,
      revenue: round2(revenue),
      firstResponseAvgSec: average(firstSamples),
      firstResponseMedianSec: median(firstSamples),
      responseAvgSec: average(mySamples),
      responseMedianSec: median(mySamples),
      responseSampleCount: mySamples.length,
      slaRequired: firstOwned.length,
      slaWithin: withinSla,
      slaPct: slaAchievementPct(withinSla, firstOwned.length),
      timeToCloseAvgSec: average(closeSamples),
      // เธรดที่ไม่มีใครตอบเลย และเธรดที่ตอบจากนอกระบบ ไม่มีเจ้าของ — ไม่ยัดให้ใคร
      unansweredConversations: 0,
      answeredOutsideSystemConversations: 0,
      unattributedReplyCount: 0,
      repliedConversations: repliedConvs.length,
      conversationsWithOrder: repliedConvs.filter((f) => f.orders.length > 0).length,
      conversationsWithClosedOrder: repliedConvs.filter((f) =>
        f.orders.some((o) => o.countsAsRevenue),
      ).length,
      ordersCreatedByOthers: ordersOnRepliedConvs.filter(
        (o) => o.attribution.agentUserId !== agentUserId,
      ).length,
    })
  }

  return rows.sort((a, b) => b.revenue - a.revenue || b.conversations - a.conversations)
}

/** ปัดทศนิยม 2 ตำแหน่ง — เหมือน `round2` ของ `order.service.ts`/`pnl.service.ts` */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/* ────────────────────────────────────────────────────────────────────────────
 * ตัวกรอง — ฉบับ "ความหมาย"
 *
 * ตัวจริงที่ผู้ใช้กดกรองทำงานที่ `WHERE` ของ SQL (จำกัดของที่อ่านตั้งแต่ต้นทาง ไม่ใช่ดึงมา
 * แล้วค่อยกรอง — feedback_rsc_dal_authz) ฟังก์ชันกลุ่มนี้คือ *นิยาม* ของตัวกรองแต่ละแกน
 * ที่พิสูจน์ได้ด้วยเทส และเป็นตัวที่ SQL ต้องเลียนแบบ
 * ──────────────────────────────────────────────────────────────────────────── */

export type ReportFilters = {
  /** ช่วงเวลา `[from, to)` — เทียบกับ "เวลาที่เธรดถูกเปิด" (ดูหมายเหตุ cohort ใน SDS §4.1) */
  from: Date
  to: Date
  channel?: string | null
  /** 'ADS' | 'SHORTLINK' | 'DIRECT' — 'DIRECT' = ไม่มี referral (ลูกค้าทักเข้ามาเอง) */
  source?: string | null
  shopChannelId?: string | null
}

/** ที่มาของเธรดในรูปที่ผู้ใช้เลือกได้ — `null` ในฐานข้อมูลแปลว่า "ทักเข้ามาเอง" */
export function normalizeSource(referralSource: string | null): 'ADS' | 'SHORTLINK' | 'DIRECT' {
  return referralSource === 'ADS' || referralSource === 'SHORTLINK' ? referralSource : 'DIRECT'
}

/**
 * เธรดที่อยู่ในขอบเขตของรายงาน
 *
 * 🛑 ขอบเป็น `[from, to)` — ปลายเปิดเสมอ เหมือน `resolveDateRange()` ของ `date-range.ts`
 * (ครึ่งเปิดคือสิ่งเดียวที่ทำให้ "ช่วงก่อนหน้า" ต่อกันพอดีโดยไม่นับวันคาบเกี่ยวซ้ำ)
 */
export function selectCohort(facts: ConversationFact[], f: ReportFilters): ConversationFact[] {
  return facts.filter((c) => {
    if (c.startedAt.getTime() < f.from.getTime()) return false
    if (c.startedAt.getTime() >= f.to.getTime()) return false
    if (f.channel && c.channel !== f.channel) return false
    if (f.source && normalizeSource(c.referralSource) !== f.source) return false
    return true
  })
}
