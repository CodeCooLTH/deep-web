/**
 * scam-link-detector.ts — Rule-based scam-link heuristic (feat 00011 ext #3, S-28)
 *
 * ทำไม pure function ล้วน (ไม่ import DB/network/prisma):
 * - testable ล้วนด้วย Vitest ไม่ต้อง mock อะไร
 * - เรียกได้ทั้งฝั่ง server (sendMessage tx) และในอนาคตถ้าต้องใช้ client-side preview
 * - BR-SCAM-01: ไม่พึ่ง external API — ทุก signal คำนวณในระบบเอง
 *
 * Threshold design (ตาม §Heuristic Rules ของ req doc):
 * - ต้องมี URL อย่างน้อย 1 อัน (R-URL gate) ไม่งั้น flagged=false ทันที (FR-SCAM-02
 *   กัน false-positive — URL เฉย ๆ ไม่พอ ต้องมี risk signal เพิ่ม)
 * - FR-SCAM-07: ถ้าทุก URL ในข้อความชี้ deepthailand.app (+subdomain) → ไม่ flag เสมอ
 *   (ลิงก์ /o/{token} /u/{username} ของแพลตฟอร์มเองต้อง paste ได้อิสระ)
 * - strong rule (R-SHORTENER/R-IP-URL/R-LOOKALIKE/R-CRED-IN-URL) แค่ 1 ก็พอ flag
 * - weak rule (R-FREE-TLD/R-KEYWORD) ต้องอย่างน้อย 2 ตัวถึงจะ flag (กัน false-positive
 *   สูง — ข้อความมีคำว่า "ธนาคาร" เฉย ๆ ไม่ควรโดน)
 * - score = strong*2 + weak*1 (นับต่อ "ชนิด rule" ที่ match ไม่ใช่ต่อจำนวน URL)
 */

export interface ScamDetectResult {
  flagged: boolean
  matchedRules: string[]
  score: number
}

// -----------------------------------------------------------------------
// Rule catalogue
// -----------------------------------------------------------------------
const STRONG_RULES = ['R-SHORTENER', 'R-IP-URL', 'R-LOOKALIKE', 'R-CRED-IN-URL'] as const
const WEAK_RULES = ['R-FREE-TLD', 'R-KEYWORD'] as const

// watchlist ตัวย่อลิงก์ยอดนิยม (R-SHORTENER)
const SHORTENER_DOMAINS = [
  'bit.ly',
  'tinyurl.com',
  'is.gd',
  'cutt.ly',
  'shorturl.at',
  't.co',
  'rebrand.ly',
  'tiny.cc',
  's.id',
]

// TLD ฟรีที่มิจฉาชีพนิยมใช้ (R-FREE-TLD)
const FREE_TLDS = ['tk', 'ml', 'ga', 'cf', 'gq']

// เป้าหมายที่เช็ค lookalike (R-LOOKALIKE) — โดเมนแพลตฟอร์มเอง + ธนาคารไทย watchlist สั้น ๆ
const LOOKALIKE_TARGETS = [
  'deepthailand.app',
  'kbank.co.th',
  'scb.co.th',
  'bangkokbank.com',
  'ktb.co.th',
  'krungsri.com',
  'gsb.or.th',
  'ttbbank.com',
]

// คำเสี่ยงหลอกลวง (R-KEYWORD) — ไทย + อังกฤษ (DG-D: locked)
const SCAM_KEYWORDS = [
  'โอนเงิน',
  'ธนาคาร',
  'รหัส otp',
  'ลิงก์ด่วน',
  'ยืนยันบัญชี',
  'ด่วนที่สุด',
  'คลิกลิงก์',
  'verify your account',
  'urgent',
  'click here',
]

// TLD ที่ "รู้จัก" — ใช้กรอง bare-domain (ไม่มี http/www นำหน้า) กันจับคำภาษาอังกฤษ
// ทั่วไปที่มีจุดผิด ๆ (เช่น "Ms.Anderson") มาเป็น URL เท็จ
const KNOWN_TLDS = new Set([
  'com', 'net', 'org', 'co', 'io', 'app', 'th', 'info', 'biz', 'me', 'tv', 'cc',
  'xyz', 'online', 'site', 'shop', 'store', 'link', 'click', 'top', 'work', 'live',
  'gov', 'edu', 'asia', 'tech', 'id', 'sg', 'my', 'vn', 'uk', 'us', 'ly', 'gd', 'gl',
  'tt', 'tk', 'ml', 'ga', 'cf', 'gq', 'pw', 'one', 'icu', 'fun', 'pro', 'name', 'mobi', 'at',
])
// ccTLD สองระดับที่พบบ่อย (โดยเฉพาะไทย) — bare-domain ที่ลงท้ายด้วยคู่นี้ก็ถือว่ารู้จัก
const KNOWN_TLD_COMBOS = new Set([
  'co.th', 'or.th', 'ac.th', 'go.th', 'in.th', 'net.th', 'mi.th',
  'co.uk', 'com.au', 'co.jp', 'co.kr', 'com.sg',
])

// -----------------------------------------------------------------------
// URL extraction
// -----------------------------------------------------------------------
// ลำดับ alternative สำคัญ: protocol → www → IP → bare-domain (JS regex เลือก
// alternative แรกที่ match ได้ ณ ตำแหน่งเริ่มต้นเดียวกัน — เรียงจากเฉพาะเจาะจงสุดก่อน)
const URL_TOKEN_REGEX =
  /(https?:\/\/[^\s<>"'`)]+)|(www\.[^\s<>"'`)]+)|((?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:\/[^\s<>"'`)]*)?)|((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s<>"'`)]*)?)/g

/** เช็คว่า bare-domain token (ไม่มี http/www นำหน้า) มี TLD ที่รู้จักไหม */
function hasKnownTld(raw: string): boolean {
  const hostPart = raw.split(/[/?#]/)[0].toLowerCase()
  const labels = hostPart.split('.')
  if (labels.length < 2) return false
  const last = labels[labels.length - 1]
  const lastTwo = labels.slice(-2).join('.')
  return KNOWN_TLDS.has(last) || KNOWN_TLD_COMBOS.has(lastTwo)
}

/** ดึงรายการ URL-like token ทั้งหมดในข้อความ (dedupe, กัน bare-domain เท็จ) */
function extractUrls(text: string): string[] {
  const matches = text.match(URL_TOKEN_REGEX)
  if (!matches) return []

  const result: string[] = []
  const seen = new Set<string>()
  for (const raw of matches) {
    const isProtocol = /^https?:\/\//i.test(raw)
    const isWww = /^www\./i.test(raw)
    const isIp = /^(?:\d{1,3}\.){3}\d{1,3}/.test(raw)
    // bare-domain (ไม่มี signal ชัดว่าเป็น URL) ต้องมี TLD ที่รู้จักเท่านั้นถึงจะนับ
    if (!isProtocol && !isWww && !isIp && !hasKnownTld(raw)) continue

    const norm = raw.toLowerCase()
    if (seen.has(norm)) continue
    seen.add(norm)
    result.push(raw)
  }
  return result
}

// -----------------------------------------------------------------------
// Host parsing helpers
// -----------------------------------------------------------------------
/** ดึง hostname ล้วน (ตัด scheme/credential/path/query/port) จาก URL token */
function extractHost(rawUrl: string): string {
  let s = rawUrl.trim().replace(/^https?:\/\//i, '')
  const atIdx = s.indexOf('@')
  if (atIdx !== -1) s = s.slice(atIdx + 1) // ตัด user:pass@ ทิ้ง เอาแค่ host จริง
  s = s.split(/[/?#]/)[0]
  s = s.split(':')[0] // ตัด port
  return s.toLowerCase()
}

/** host แบบไม่มี "www." นำหน้า — ใช้เทียบ shortener/free-tld/lookalike */
function baseHostOf(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host
}

/** FR-SCAM-07: allowlist — host ที่เป็น deepthailand.app หรือ subdomain ของมัน */
function isAllowlistedHost(host: string): boolean {
  return host === 'deepthailand.app' || host.endsWith('.deepthailand.app')
}

/** R-CRED-IN-URL: มี "user:pass@host" ฝังอยู่ก่อน path ไหม */
function hasCredInUrl(rawUrl: string): boolean {
  const withoutScheme = rawUrl.replace(/^https?:\/\//i, '')
  const atIdx = withoutScheme.indexOf('@')
  if (atIdx === -1) return false
  const before = withoutScheme.slice(0, atIdx)
  // ต้องมี ':' ก่อน '@' (รูปแบบ user:pass@host) และไม่มี '/' คั่น (ไม่ใช่ path ปกติ)
  return before.includes(':') && !before.includes('/')
}

function isShortener(baseHost: string): boolean {
  return SHORTENER_DOMAINS.some(d => baseHost === d || baseHost.endsWith('.' + d))
}

function isIpHost(baseHost: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(baseHost)
}

function isFreeTld(baseHost: string): boolean {
  return FREE_TLDS.some(tld => baseHost === tld || baseHost.endsWith('.' + tld))
}

/** Levenshtein distance — เขียนเองใน lib (ห้าม import package ใหม่) */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  const dp: number[] = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j

  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = temp
    }
  }
  return dp[n]
}

/** R-LOOKALIKE: Levenshtein ≤2 กับ deepthailand.app หรือธนาคาร watchlist (ไม่นับ exact match) */
function isLookalike(baseHost: string): boolean {
  for (const target of LOOKALIKE_TARGETS) {
    if (baseHost === target) continue
    const dist = levenshtein(baseHost, target)
    if (dist > 0 && dist <= 2) return true
  }
  return false
}

function hasScamKeyword(text: string): boolean {
  const lower = text.toLowerCase()
  return SCAM_KEYWORDS.some(kw => lower.includes(kw))
}

// -----------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------
const EMPTY_RESULT: ScamDetectResult = { flagged: false, matchedRules: [], score: 0 }

/**
 * ตรวจข้อความหา risk signal ของลิงก์หลอกลวง — pure function ล้วน (BR-SCAM-01)
 * ไม่ import DB/network — เรียกได้ทั้งใน service layer และ test โดยตรง
 */
export function detectScamLink(text: string | null | undefined): ScamDetectResult {
  if (!text) return EMPTY_RESULT

  // R-URL gate: ไม่มี URL เลย → ไม่ flag ทันที (FR-SCAM-02)
  const urls = extractUrls(text)
  if (urls.length === 0) return EMPTY_RESULT

  const hosts = urls.map(extractHost)

  // FR-SCAM-07: ทุก URL ชี้ deepthailand.app (+subdomain) → ไม่ flag เสมอ
  if (hosts.every(isAllowlistedHost)) return EMPTY_RESULT

  const matchedRules = new Set<string>()

  // ประเมิน strong rule เฉพาะ URL ที่ไม่ได้ allowlist (กัน false-positive จากลิงก์ตัวเอง)
  for (let i = 0; i < urls.length; i++) {
    const host = hosts[i]
    if (isAllowlistedHost(host)) continue

    const baseHost = baseHostOf(host)
    if (isShortener(baseHost)) matchedRules.add('R-SHORTENER')
    if (isIpHost(baseHost)) matchedRules.add('R-IP-URL')
    if (isLookalike(baseHost)) matchedRules.add('R-LOOKALIKE')
    if (hasCredInUrl(urls[i])) matchedRules.add('R-CRED-IN-URL')
    if (isFreeTld(baseHost)) matchedRules.add('R-FREE-TLD')
  }

  // R-KEYWORD ตรวจทั้งข้อความ (ไม่ผูกกับ URL ตัวใดตัวหนึ่ง)
  if (hasScamKeyword(text)) matchedRules.add('R-KEYWORD')

  const strongCount = STRONG_RULES.filter(r => matchedRules.has(r)).length
  const weakCount = WEAK_RULES.filter(r => matchedRules.has(r)).length
  const score = strongCount * 2 + weakCount * 1

  // ผ่านจุดนี้แปลว่ามี URL ที่ไม่ allowlisted อย่างน้อย 1 อันแล้ว (เช็คด้านบนแล้ว)
  const flagged = strongCount >= 1 || weakCount >= 2

  return { flagged, matchedRules: Array.from(matchedRules), score }
}
