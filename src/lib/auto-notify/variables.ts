// feature 00078 — SSOT ตัวแปรเทมเพลตต่อชนิด (เท่าตาราง PRD §3.4 เป๊ะ) + parser/validator · pure module
// ห้ามเพิ่มตัวแปรนอกตารางนี้โดยไม่ผ่านเอกสาร (ตัวแปรใหม่ = เปลี่ยน PRD §3.4 ก่อน)
import { AUTO_NOTIFY_TEMPLATE_MAX_CHARS, type AutoNotifyKind } from './ledger-constants'

export interface TemplateVariable {
  name: string
  /** ค่าตัวอย่างในเมนูตัวแปร/ตัวอย่างข้อความ */
  sample: string
}

const v = (name: string, sample: string): TemplateVariable => ({ name, sample })

const SHOP = v('ชื่อร้าน', 'ร้านดีดี')
const CUSTOMER = v('ชื่อลูกค้า', 'สมชาย')
const ORDER_NO = v('เลขคำสั่งซื้อ', 'A2569-0042')
const SERVICE = v('บริการ', 'ตัดผมชาย')
const WHEN = v('วันเวลานัด', '8 ส.ค. 2569 · 19:00–20:00')
const START = v('เวลาเริ่มงาน', '8 ส.ค. 2569 19:05')
const LINK_JOB = v('ลิงก์งาน', 'https://deepthailand.app/o/abc123')

export const TEMPLATE_VARIABLES: Record<AutoNotifyKind, readonly TemplateVariable[]> = {
  ORDER_SUMMARY: [
    SHOP,
    CUSTOMER,
    ORDER_NO,
    v('วันที่สั่งซื้อ', '07-06-2569'),
    v('รายการสินค้า', 'เสื้อยืดสีขาว และอีก 2 รายการ'),
    v('ยอดสุทธิ', '฿1,290'),
    v('ลิงก์คำสั่งซื้อ', 'https://deepthailand.app/o/abc123'),
    v('คำเรียกรายการ', 'คำสั่งซื้อ'),
  ],
  TRACKING: [
    SHOP,
    CUSTOMER,
    ORDER_NO,
    v('ขนส่ง', 'Flash Express'),
    v('เลขพัสดุ', 'TH0123456789'),
    v('ลิงก์ติดตามพัสดุ', 'https://app.iship.cloud/tracking?track=TH0123456789'),
    v('ลิงก์คำสั่งซื้อ', 'https://deepthailand.app/o/abc123'),
  ],
  SERVICE_BOOKED: [
    SHOP,
    CUSTOMER,
    ORDER_NO,
    WHEN,
    SERVICE,
    v('ยอดรวม', '฿500'),
    v('ยอดมัดจำที่ตกลงไว้', '฿100'),
    LINK_JOB,
  ],
  SERVICE_STARTED: [SHOP, CUSTOMER, SERVICE, WHEN, START, LINK_JOB],
  SERVICE_CLOSED: [SHOP, CUSTOMER, SERVICE, WHEN, START, v('เวลาปิดงาน', '8 ส.ค. 2569 19:50'), LINK_JOB],
  // 00086 — ไม่มีเวลาทำเสร็จ/ชื่อช่าง: ชื่อพนักงานภายในไม่ส่งถึงลูกค้า (API §4.16) · รูปอยู่หลังลิงก์
  SERVICE_FINISHED: [SHOP, CUSTOMER, SERVICE, LINK_JOB],
}

export const variableNamesOf = (kind: AutoNotifyKind): string[] => TEMPLATE_VARIABLES[kind].map((x) => x.name)

/** ตัวแปรที่เป็น "ลิงก์" — เทมเพลตที่ไม่มีสักตัวให้เตือน (ไม่บล็อก) */
const LINK_VARIABLES = new Set(['ลิงก์คำสั่งซื้อ', 'ลิงก์ติดตามพัสดุ', 'ลิงก์งาน'])

/** นับเป็น code point (Array.from) — ฟังก์ชันเดียวใช้ทั้ง client/Valibot/server เพื่อให้ตรงกับ DB CHECK (TFR-014) */
export const countCodePoints = (s: string): number => Array.from(s).length

export const hasLoneSurrogate = (s: string): boolean =>
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s)

export type TemplateSegment = { type: 'text'; text: string } | { type: 'var'; name: string }

// ชั้นเดียว ไม่ซ้อน ไม่ข้ามบรรทัด · `{` ที่ไม่มีคู่ถือเป็นข้อความธรรมดา (parse เป็น lossless — editor-text พึ่งข้อนี้)
const VAR_RE = /\{([^{}\n]*)\}/g

export function parseTemplate(body: string): TemplateSegment[] {
  const out: TemplateSegment[] = []
  let last = 0
  for (const m of body.matchAll(VAR_RE)) {
    const at = m.index ?? 0
    if (at > last) out.push({ type: 'text', text: body.slice(last, at) })
    out.push({ type: 'var', name: m[1] })
    last = at + m[0].length
  }
  if (last < body.length) out.push({ type: 'text', text: body.slice(last) })
  return out
}

export type TemplateIssueCode =
  | 'UNKNOWN_VARIABLE'
  | 'WRONG_KIND_VARIABLE'
  | 'BLANK'
  | 'TOO_LONG'
  | 'NUL'
  | 'SURROGATE'
export interface TemplateIssue {
  code: TemplateIssueCode
  name?: string
}

const ALL_KNOWN = new Set(Object.values(TEMPLATE_VARIABLES).flatMap((l) => l.map((x) => x.name)))

export function validateTemplate(kind: AutoNotifyKind, body: string): TemplateIssue[] {
  const issues: TemplateIssue[] = []
  if (body.includes('\u0000')) issues.push({ code: 'NUL' })
  if (hasLoneSurrogate(body)) issues.push({ code: 'SURROGATE' })
  if (body.trim() === '') issues.push({ code: 'BLANK' })
  if (countCodePoints(body) > AUTO_NOTIFY_TEMPLATE_MAX_CHARS) issues.push({ code: 'TOO_LONG' })
  const allowed = new Set(variableNamesOf(kind))
  const seen = new Set<string>()
  for (const s of parseTemplate(body)) {
    if (s.type !== 'var' || allowed.has(s.name) || seen.has(s.name)) continue
    seen.add(s.name)
    issues.push({ code: ALL_KNOWN.has(s.name) ? 'WRONG_KIND_VARIABLE' : 'UNKNOWN_VARIABLE', name: s.name })
  }
  return issues
}

/** เตือน (ไม่บล็อก): เทมเพลตไม่มีลิงก์สักตัว — ลูกค้าจะไม่มีทางเปิดดูรายละเอียด */
export const templateHasLinkVariable = (body: string): boolean =>
  parseTemplate(body).some((s) => s.type === 'var' && LINK_VARIABLES.has(s.name))
