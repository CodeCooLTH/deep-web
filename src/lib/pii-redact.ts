/**
 * กรองข้อมูลส่วนบุคคลออกจากข้อความก่อนส่งเข้า AI (feature 00023 / ข้อกำหนดจาก 00019)
 *
 * ข้อกำหนด: ห้ามส่งเบอร์โทร อีเมล ที่อยู่ ของลูกค้าเข้าโมเดลภายนอก แต่ ChatBot ต้องอ่าน
 * "คำถามของลูกค้า" ซึ่งลูกค้าพิมพ์อะไรมาก็ได้ — จึงต้องกรองที่ชั้นนี้ ไม่ใช่หวังว่าลูกค้าจะไม่พิมพ์
 *
 * WARNING (ขอบเขตที่ทำได้จริง): เบอร์โทร/อีเมล/เลขบัตร/เลขบัญชี จับได้แน่นอนด้วยรูปแบบตัวเลข
 * แต่ **ที่อยู่ไม่มีรูปแบบตายตัว** — ที่ทำได้คือจับบรรทัดที่มีคำบอกตำแหน่งไทย (ต./อ./จ./ซอย/หมู่ ฯลฯ)
 * คู่กับรหัสไปรษณีย์ 5 หลัก ซึ่งครอบที่อยู่ที่เขียนเต็มรูปแบบได้ แต่ไม่ครอบ "อยู่หลังเซเว่นปากซอย 12"
 * ถ้าต้องการความมั่นใจมากกว่านี้ต้องเปลี่ยนไปใช้โมเดลจำแนก ไม่ใช่ regex
 *
 * แทนที่ด้วยป้ายกำกับ (ไม่ใช่ลบทิ้ง) เพราะ AI ยังต้องเข้าใจว่าประโยคนั้นพูดถึงอะไร
 * เช่น "ส่งไป [ที่อยู่] ค่าส่งเท่าไร" ยังตอบได้ แต่ "ส่งไป ค่าส่งเท่าไร" อ่านไม่รู้เรื่อง
 */

// NAME/CONTACT/NUMBER ใช้เฉพาะเส้นทาง reversible (redactPii เดิมไม่สร้างชนิดเหล่านี้)
export type PiiKind = 'PHONE' | 'EMAIL' | 'NATIONAL_ID' | 'BANK_ACCOUNT' | 'ADDRESS' | 'NAME' | 'CONTACT' | 'NUMBER'

export interface RedactResult {
  text: string
  /** ชนิดที่เจอ (ไม่เก็บค่าจริง — log ได้โดยไม่ทำให้ log กลายเป็นที่เก็บ PII เสียเอง) */
  found: PiiKind[]
}

const LABEL: Record<PiiKind, string> = {
  PHONE: '[เบอร์โทร]',
  EMAIL: '[อีเมล]',
  NATIONAL_ID: '[เลขบัตรประชาชน]',
  BANK_ACCOUNT: '[เลขบัญชี]',
  ADDRESS: '[ที่อยู่]',
  NAME: '[ชื่อ]',
  CONTACT: '[ติดต่อ]',
  NUMBER: '[ตัวเลข]',
}

/** คำบอกตำแหน่งไทย — ใช้ร่วมกับรหัสไปรษณีย์เท่านั้น ลำพังคำเดียวจับที่อยู่ไม่ได้ */
const ADDRESS_HINT =
  /(ต\.|อ\.|จ\.|ถ\.|ซ\.|หมู่|ซอย|ถนน|แขวง|เขต|ตำบล|อำเภอ|จังหวัด|หมู่บ้าน|คอนโด|เลขที่)/

/**
 * เลข 13 หลักติดกันหรือคั่นด้วย - / เว้นวรรค = เลขบัตรประชาชน
 * ต้องตรวจก่อนเบอร์โทร ไม่งั้นเบอร์โทรจะกินตัวเลข 10 หลักแรกของเลขบัตรไป
 */
const NATIONAL_ID_RE = /(?<!\d)\d[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d(?!\d)/g

/** เบอร์ไทย: 0xxxxxxxx(x) หรือ +66xxxxxxxxx — ยอมให้มี - หรือเว้นวรรคคั่น */
const PHONE_RE = /(?<![\d+])(?:\+ ?66[\s-]?|0)\d(?:[\s-]?\d){7,8}(?!\d)/g

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/** เลขบัญชีธนาคาร 10–15 หลัก (ที่เหลือหลังกรองเลขบัตร/เบอร์ไปแล้ว) */
const BANK_RE = /(?<!\d)\d{10,15}(?!\d)/g

/**
 * แทนที่ PII ในข้อความด้วยป้ายกำกับ
 *
 * ลำดับสำคัญ: เลขบัตร → เบอร์ → อีเมล → เลขบัญชี → ที่อยู่ — เพราะรูปแบบที่ยาวกว่า
 * ต้องได้สิทธิ์จับก่อน ไม่งั้นรูปแบบสั้นจะกินชิ้นส่วนของมันไปแล้วเหลือเศษตัวเลขลอย ๆ
 */
export function redactPii(input: string): RedactResult {
  const found = new Set<PiiKind>()
  let text = input

  const apply = (re: RegExp, kind: PiiKind) => {
    text = text.replace(re, () => {
      found.add(kind)
      return LABEL[kind]
    })
  }

  apply(NATIONAL_ID_RE, 'NATIONAL_ID')
  apply(PHONE_RE, 'PHONE')
  apply(EMAIL_RE, 'EMAIL')
  apply(BANK_RE, 'BANK_ACCOUNT')

  // ที่อยู่ตรวจทีละบรรทัด — ถ้าบรรทัดนั้นมีทั้งคำบอกตำแหน่งและรหัสไปรษณีย์ ถือว่าทั้งบรรทัดคือที่อยู่
  // ตัดทั้งบรรทัดเพราะที่อยู่ไม่มีขอบเขตชัด การตัดแค่บางคำจะเหลือเศษที่ยังระบุตัวคนได้
  text = text
    .split('\n')
    .map((line) => {
      if (ADDRESS_HINT.test(line) && /(?<!\d)\d{5}(?!\d)/.test(line)) {
        found.add('ADDRESS')
        return LABEL.ADDRESS
      }
      return line
    })
    .join('\n')

  return { text, found: [...found] }
}

// ───────────────────────── แบบมีตารางคืนค่า (00019-ext Typhoon auto-suggest) ─────────────────────────
// เพิ่มแบบ additive: redactPii ข้างบนไม่ถูกแตะ เพราะ ai-enhance/auto-reply พึ่งพฤติกรรมเดิมอยู่

/** ตารางจับคู่ป้าย → ค่าจริง อยู่ในหน่วยความจำของ request เดียว ห้ามเก็บ DB/log */
export interface PiiVault {
  readonly table: ReadonlyMap<string, string>
}

export function createPiiVault(): PiiVault {
  return { table: new Map<string, string>() }
}

/**
 * เบอร์ฝั่ง reversible กว้างกว่า PHONE_RE เดิมนิดเดียว: ยอมให้มีตัวคั่นหลังเลข 0 นำหน้า (0-2123-4567)
 * ที่ redactPii เดิมปล่อยหลุด — ไม่แก้ตัวเดิมเพราะมีผู้ใช้อื่นพึ่งอยู่ (parity test ใช้ corpus ที่ไม่มีรูปแบบนี้)
 */
const PHONE_RE_REVERSIBLE = /(?<![\d+])(?:\+ ?66[\s-]?|0)[\s-]?\d(?:[\s-]?\d){7,8}(?!\d)/g

/** ชื่อป้ายแบบไม่มีวงเล็บ ใช้สร้าง regex จับป้ายทั้งตอน defang และตอน restore */
const LABEL_NAMES = Object.values(LABEL).map((l) => l.slice(1, -1))
const TOKEN_RE = new RegExp(`\\[(${LABEL_NAMES.join('|')})(?:#(\\d+))?\\]`, 'g')

/**
 * ป้ายมีลำดับ [เบอร์โทร#1] — ค่าเดียวกันได้ป้ายเดิม ต่างค่าได้เลขถัดไป (นับต่อชนิด)
 * ใช้ Map ที่ vault ถือ (cast เพราะ interface เปิดแค่ readonly ให้ผู้ใช้ภายนอก)
 */
function tokenFor(vault: PiiVault, kind: PiiKind, value: string): string {
  const table = vault.table as Map<string, string>
  const name = LABEL[kind].slice(1, -1)
  const prefix = `[${name}#`
  let count = 0
  for (const [tok, val] of table) {
    if (!tok.startsWith(prefix)) continue
    if (val === value) return tok
    count++
  }
  const tok = `${prefix}${count + 1}]`
  table.set(tok, value)
  return tok
}

// ───────── ตัวช่วยฝั่ง reversible (เอียงไปทางปิดบังเกิน เพราะผลลัพธ์ออกไปหา Typhoon ที่ห้ามมีข้อมูลส่วนบุคคล) ─────────

/** ตัวคั่นที่คนใช้แทน "-" ในเบอร์/เลขบัญชี: จุด, en/em dash, non-breaking hyphen, figure dash, minus */
// ตัวคั่นระหว่างเลข: อักขระใดก็ได้ที่ไม่ใช่ตัวอักษร/ตัวเลข/":" (กันเวลา 14:30) ติดกันไม่เกิน 2 ตัว ("-\n" ขึ้นบรรทัดใหม่)
// ponytail: "100, 200, 300" (≥9 หลัก) ถูกปิดด้วย — เอียงไปทางปิดเกิน; ถ้าราคารายการโดนบ่อยค่อยจำกัดชนิดตัวคั่น
const DIGIT_RUN_RE = /\d+(?:[^\p{L}\p{N}:]{1,2}\d+)+/gu

/**
 * ทำสำเนาข้อความให้เป็นรูปที่ regex จับได้: เลขไทย/fullwidth → ASCII, ตัดอักขระความกว้างศูนย์,
 * `+66 (0)` → `+66`, และเปลี่ยนตัวคั่นแปลก ๆ เป็น "-" เฉพาะในชุดตัวเลขที่ยาวพอเป็นเบอร์/บัญชี (≥9 หลัก)
 * (ไม่แตะทศนิยมราคา เช่น 99.50)
 */
export function normalizeForPii(input: string): string {
  let t = input
    .replace(/[​-‍⁠﻿­]/g, '')
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50))
    .replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10))
    .replace(/＋/g, '+')
  t = t.replace(/\+ ?66[\s-]*\(\s*0\s*\)/g, '+66')
  t = t.replace(DIGIT_RUN_RE, (m) => (m.replace(/\D/g, '').length >= 9 ? m.replace(/\D+/g, (x) => (x === ' ' || x === '-' ? x : '-')) : m))
  return t
}

/** เลขบัญชีที่มีตัวคั่น (123-4-56789-0, 1234 5678 90) — ตัวคั่นเดี่ยวเท่านั้น 10–15 หลัก */
const BANK_SEP_RE = /(?<!\d)\d(?:[ -]?\d){9,18}(?!\d)/g
/** เลขที่ตามหลังคำว่าบัญชี/account ตั้งแต่ 6 หลัก (รวมตัวคั่น) — ปิดเฉพาะส่วนตัวเลข */
const ACCT_LABELED_RE =
  /((?:เลขที่บัญชี|เลขบัญชี|บัญชี|acct|account|a\/c)\s*(?:no\.?|number|เลขที่)?\s*[:：]?\s*)(\d(?:[ -]?\d){5,})(?!\d)/gi
/** ด่านสุดท้าย: เลขยาว ≥9 หลักที่เหลือ (EX123456789TH ฯลฯ) */
const LONG_DIGITS_RE = /(?<!\d)\d(?:[ .-]?\d){8,}(?!\d)/g

const AT = String.raw`(?:\s*[(\[]\s*at\s*[)\]]\s*|\s+at\s+)`
const DOT = String.raw`(?:\s*[(\[]\s*dot\s*[)\]]\s*|\s+dot\s+|\.)`
/** อีเมลอำพราง: x (at) gmail.com · x at gmail dot com */
const OBF_EMAIL_RE = new RegExp(
  `[A-Za-z0-9._%+-]+${AT}(?:[A-Za-z0-9-]+${DOT})+[A-Za-z]{2,}(?![A-Za-z])`,
  'gi',
)
const PROFILE_URL_RE =
  /(?<![A-Za-z0-9.-])(?:https?:\/\/)?(?:www\.|m\.)?(?:facebook\.com|fb\.com|fb\.me|m\.me|line\.me|lin\.ee|instagram\.com|tiktok\.com|twitter\.com|x\.com|t\.me)\/\S*/gi
const LINE_ID_RE = /(?<![A-Za-z])(?:line\s*id|ไอดีไลน์|ไลน์\s*ไอดี|ไลน์|line)\s*[:：=]?\s*@?[A-Za-z0-9._-]{3,}/gi
const HANDLE_RE = /(?<![\w@/])@[A-Za-z0-9._]{3,}/g
/** `ชื่อ`/`ชื่อผู้รับ` ตามด้วยช่องว่างหรือ : แล้วค่า — ปิดทั้งที่เหลือของบรรทัด ("ชื่อสินค้า" ไม่โดนเพราะไม่มีช่องว่างคั่น) */
const NAME_RE = /(ชื่อ(?:ผู้รับ)?(?:\s*[:：]\s*|[ \t]+))([^\n]+)/g

/** คำบอกตำแหน่ง (ฝั่ง reversible กว้างกว่า ADDRESS_HINT เดิม) — ตัวย่อ ม./ซ./ต. ฯลฯ ไม่นับ "ม.ค." */
const ADDRESS_HINT_REVERSIBLE =
  /ที่อยู่|บ้านเลขที่|เลขที่|หมู่บ้าน|หมู่|ซอย|ถนน|ตำบล|แขวง|อำเภอ|เขต|จังหวัด|กทม|คอนโด|อาคาร|(?<![ก-ฮ])[มซถตอจ]\.(?![ก-ฮ]{1,2}\.)|\b(?:soi|road|moo|tambon|amphoe|khet|bangkok|village|condo)\b|\brd\b/i
/** บ้านเลขที่แบบ 99/9 (ไม่ใช่วันที่ 12/10/2026) */
const HOUSE_NO_RE = /(?<![\d/])\d{1,4}\/\d{1,4}(?![\d/])/
/** ตำบล/อำเภอ/จังหวัด — มี ≥2 กลุ่มในบรรทัดเดียว = ที่อยู่แม้ไม่มีตัวเลข */
const ADMIN_UNIT_RES = [
  /(?<![ก-ฮ])ต\.|ตำบล|แขวง/,
  /(?<![ก-ฮ])อ\.(?![ก-ฮ]{1,2}\.)|อำเภอ|เขต/,
  /(?<![ก-ฮ])จ\.|จังหวัด/,
]
const isAddressLine = (bare: string) =>
  (ADDRESS_HINT_REVERSIBLE.test(bare) && /\d/.test(bare)) ||
  HOUSE_NO_RE.test(bare) ||
  ADMIN_UNIT_RES.filter((r) => r.test(bare)).length >= 2

// จุดเริ่มที่อยู่: บ้านเลขที่ 12/3 · คำบอกตำแหน่งที่ตามด้วยเลข · หรือหน่วยปกครอง (ต./อ./จ. …) ตัวแรก
const ADDR_START_RE =
  /ที่อยู่|(?<![\d/])\d{1,4}\/\d{1,4}(?![\d/])|(?:บ้านเลขที่|เลขที่|หมู่บ้าน|หมู่|ซอย|ถนน|(?<![ก-ฮ])[มซ]\.)\s*\d|(?<![ก-ฮ])[ตอจ]\.(?![ก-ฮ]{1,2}\.)|ตำบล|แขวง|อำเภอ|เขต|จังหวัด|กทม/g
// จุดจบที่อยู่: รหัสไปรษณีย์ หรือ จังหวัด+ชื่อ / กทม / กรุงเทพ — เอาตัวท้ายสุดที่เจอ
const ADDR_END_RE =
  /(?<!\d)\d{5}(?!\d)|(?:(?<![ก-ฮ])จ\.|จังหวัด)\s*[ก-๛]+|กรุงเทพ(?:มหานคร|ฯ)?|กทม\.?/g

/**
 * บรรทัดเดียวที่มีที่อยู่ปนกับข้อความอื่น ("สั่งเสื้อ 2 ตัว ส่งที่ 12/3 … 10540 โทร …") → ปิดเฉพาะช่วงที่อยู่
 * หาขอบเขตไม่ได้ (ไม่มีจุดจบ) → คืน null ให้ปิดทั้งบรรทัดเหมือนเดิม (fail-safe)
 */
function narrowAddressSpan(line: string): { before: string; addr: string; after: string } | null {
  ADDR_START_RE.lastIndex = 0
  const m = ADDR_START_RE.exec(line)
  if (!m) return null
  // ถอยไปเอาเลขบ้านที่อยู่ติดหน้าคำบอกตำแหน่ง ("12 ซอย…")
  const pre = line.slice(0, m.index).match(/\d[\d/]*\s*$/)
  const start = pre ? m.index - pre[0].length : m.index
  let end = -1
  for (const e of line.matchAll(ADDR_END_RE)) {
    if (e.index! >= start) end = Math.max(end, e.index! + e[0].length)
  }
  if (end < 0) return null
  return { before: line.slice(0, start), addr: line.slice(start, end), after: line.slice(end) }
}

/**
 * ปิดบังแบบคืนค่าได้ — ใช้ regex ตัวเดียวกับ redactPii แต่เข้มกว่า (normalize ก่อน, เบอร์/บัญชี/บัตรมีตัวคั่น,
 * อีเมล/โซเชียลอำพราง, ที่อยู่ที่ไม่มีรหัสไปรษณีย์, ด่านเลขยาวสุดท้าย) · parity test ใช้เฉพาะ corpus ที่ redactPii เดิมรองรับ
 * E-16: ป้ายที่ลูกค้าพิมพ์เลียนแบบมาเอง ต้อง defang (เปลี่ยน [ ] เป็น ( )) ก่อนทุกอย่าง
 * ไม่งั้นป้ายปลอมจะปนกับป้ายจริงของ request นี้ และอาจถูก restore เป็นค่าของคนอื่น
 */
export function redactPiiReversible(input: string, vault: PiiVault): RedactResult {
  const found = new Set<PiiKind>()
  let text = normalizeForPii(input).replace(TOKEN_RE, (m) => `(${m.slice(1, -1)})`)

  const apply = (re: RegExp, kind: PiiKind) => {
    text = text.replace(re, (m) => {
      found.add(kind)
      return tokenFor(vault, kind, m)
    })
  }

  // ชื่อก่อนสุด: ค่าเต็มของบรรทัดเข้า vault ดิบ ๆ (ไม่ออกไปข้างนอก) กันเบอร์/ที่อยู่ในบรรทัดชื่อถูกแยกเป็นป้ายซ้อน
  text = text.replace(NAME_RE, (_m, head: string, val: string) => {
    found.add('NAME')
    return head + tokenFor(vault, 'NAME', val)
  })
  apply(NATIONAL_ID_RE, 'NATIONAL_ID')
  apply(PHONE_RE_REVERSIBLE, 'PHONE')
  apply(OBF_EMAIL_RE, 'EMAIL')
  apply(EMAIL_RE, 'EMAIL')
  apply(PROFILE_URL_RE, 'CONTACT')
  apply(LINE_ID_RE, 'CONTACT')
  apply(HANDLE_RE, 'CONTACT')
  text = text.replace(ACCT_LABELED_RE, (m, head: string, num: string) => {
    if (num.replace(/\D/g, '').length < 6) return m
    found.add('BANK_ACCOUNT')
    return head + tokenFor(vault, 'BANK_ACCOUNT', num)
  })
  apply(BANK_RE, 'BANK_ACCOUNT')
  apply(BANK_SEP_RE, 'BANK_ACCOUNT')
  apply(LONG_DIGITS_RE, 'NUMBER')

  // ที่อยู่: บรรทัดที่มีคำบอกตำแหน่งคู่กับตัวเลขใดก็ได้ (ไม่นับเลขในป้าย) · บรรทัดถัดไปที่มีรหัสไปรษณีย์ 5 หลักรวมเข้ากลุ่มเดียวกัน
  const lines = text.split('\n')
  const out: string[] = []
  let group: string[] | null = null
  const flush = () => {
    if (!group) return
    found.add('ADDRESS')
    // บรรทัดอาจมีป้ายเบอร์/อีเมลที่แทนไปแล้ว — เก็บค่าจริงก่อน ไม่งั้น restore ผ่านเดียวจะเหลือป้ายซ้อน
    const full = group.join('\n')
    const span = group.length === 1 ? narrowAddressSpan(group[0]) : null
    if (span) {
      // ส่วนก่อน/หลังที่อยู่อยู่ในรูปป้ายแล้ว ไม่ต้อง restore; เฉพาะช่วงที่อยู่ที่ต้องเก็บค่าจริง
      out.push(span.before + tokenFor(vault, 'ADDRESS', restorePii(span.addr, vault).text) + span.after)
    } else {
      out.push(tokenFor(vault, 'ADDRESS', restorePii(full, vault).text))
    }
    group = null
  }
  for (const line of lines) {
    const bare = line.replace(TOKEN_RE, '')
    if (isAddressLine(bare)) {
      if (!group) group = []
      group.push(line)
    } else if (group && /(?<!\d)\d{5}(?!\d)/.test(bare)) {
      group.push(line)
    } else {
      flush()
      out.push(line)
    }
  }
  flush()
  text = out.join('\n')

  return { text, found: [...found] }
}

/**
 * คืนค่าจริงแทนป้าย (ผ่านเดียว ไม่ restore ซ้ำในค่าที่เพิ่งใส่)
 * ป้ายที่ไม่มีในตาราง หรือไม่มีเลขลำดับ → คงไว้ใน text และรายงานใน unresolved ให้ caller ทิ้งผลทั้งก้อน
 */
export function restorePii(text: string, vault: PiiVault): { text: string; unresolved: string[] } {
  const unresolved: string[] = []
  const out = text.replace(TOKEN_RE, (tok) => {
    const v = vault.table.get(tok)
    if (v === undefined) {
      unresolved.push(tok)
      return tok
    }
    return v
  })
  return { text: out, unresolved }
}
