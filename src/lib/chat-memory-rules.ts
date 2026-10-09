// กฎ pure ของความจำแชท (00019-ext-mem) — ไม่มี server-only เพื่อให้เทส mutation ได้ตรง ๆ
import { createPiiVault, normalizeForPii, redactPii, redactPiiReversible, restorePii, type PiiKind } from '@/lib/pii-redact'
import {
  CHAT_MEMORY_MAX,
  MEMORY_AI_COOLDOWN_MS,
  MEMORY_AI_FIRST_MIN_BUYER,
  MEMORY_AI_FIRST_MIN_MESSAGES,
  MEMORY_AI_MIN_NEW_MESSAGES,
  MEMORY_SHRINK_BASE_MIN,
  MEMORY_SHRINK_RATIO,
} from '@/lib/chat-memory-types'

const HARD_PII_KINDS: ReadonlySet<PiiKind> = new Set(['PHONE', 'EMAIL', 'NATIONAL_ID', 'BANK_ACCOUNT', 'NUMBER', 'CONTACT'])

// ที่อยู่ละเอียด: เลขบ้าน 99/9 หรือคำบอกตำแหน่งใกล้ตัวเลข (ซอยสุขุมวิท 5 / 12 ถนน…) — ระดับเขต/จังหวัดล้วนไม่เข้า
const ADDR_DETAIL_RE =
  /(?<![\d/])\d{1,4}\/\d{1,4}(?![\d/])|\d[^\n]{0,25}?(?:ซอย|ซ\.|ถนน|ถ\.|หมู่|ม\.|เลขที่|คอนโด|ห้อง|ชั้น|ตึก)|(?:ซอย|ซ\.|ถนน|ถ\.|หมู่|ม\.|เลขที่|คอนโด|ห้อง|ชั้น|ตึก)[^\n]{0,25}?\d/

function hasHardPiiReversible(text: string): boolean {
  const found = redactPiiReversible(text, createPiiVault()).found
  return found.some((k) => HARD_PII_KINDS.has(k)) || (found.includes('ADDRESS') && ADDR_DETAIL_RE.test(text))
}

export function normalizeMemoryText(raw: string): string {
  return raw.replace(/(?:\r?\n)+/g, ' ').trim()
}

export function canUseProducts(i: { productCount: number; interestedCount: number }): boolean {
  return i.productCount >= 1 || i.interestedCount >= 1
}

export function baseHasPii(base: string): boolean {
  return redactPii(base).found.length > 0
}

export function validateAiMemory(
  out: string,
  base: string,
): { ok: true; text: string } | { ok: false; outcome: 'REJECTED_PII' | 'REJECTED_FORMAT' | 'REJECTED_SHRINK' } {
  const text = out.trim()
  // หลายย่อหน้า = มีบรรทัดว่างคั่น หรือขึ้นบรรทัดใหม่ — ความจำต้องเป็นย่อหน้าเดียว
  if (!text || text.length > CHAT_MEMORY_MAX || /\r?\n/.test(text)) {
    return { ok: false, outcome: 'REJECTED_FORMAT' }
  }
  // ป้ายที่ไม่มีใน vault ว่าง = โมเดลคัดลอกป้าย PII มา; '[ข้อมูลลูกค้า]' = ป้าย scrub ของ sanitize
  if (
    restorePii(text, createPiiVault()).unresolved.length > 0 ||
    text.includes('[ข้อมูลลูกค้า]') ||
    // normalize ก่อน: redactPii ดิบพลาดเบอร์คั่นด้วยจุด (081.234.5678)
    redactPii(normalizeForPii(text)).found.length > 0 ||
    // ตัวจับแบบ reversible กว้างกว่า (0-2123-4567, เลขยาว ≥9 หลัก, LINE id/@handle) — นับเฉพาะชนิดตัวเลข/ติดต่อ
    // ไม่นับ ADDRESS/NAME ของตัวนี้: ความจำเก็บระดับเขตได้ และ "คุณมุก" ไม่ใช่ PII ตามกฎ BR-MEM-03
    hasHardPiiReversible(text)
  ) {
    return { ok: false, outcome: 'REJECTED_PII' }
  }
  if (base.length >= MEMORY_SHRINK_BASE_MIN && text.length < base.length * MEMORY_SHRINK_RATIO) {
    return { ok: false, outcome: 'REJECTED_SHRINK' }
  }
  return { ok: true, text }
}

export function shouldAttemptMemoryUpdate(i: {
  newMessageCount: number
  totalMessages: number
  buyerMessages: number
  hasText: boolean
  msSinceLastAiRun: number | null
  force: boolean
}): { ok: true } | { ok: false; outcome: 'SKIPPED_FEW_MESSAGES' | 'SKIPPED_COOLDOWN' } {
  if (i.force) return { ok: true }
  const enough = i.hasText
    ? i.newMessageCount >= MEMORY_AI_MIN_NEW_MESSAGES
    : i.totalMessages >= MEMORY_AI_FIRST_MIN_MESSAGES && i.buyerMessages >= MEMORY_AI_FIRST_MIN_BUYER
  if (!enough) return { ok: false, outcome: 'SKIPPED_FEW_MESSAGES' }
  if (i.msSinceLastAiRun !== null && i.msSinceLastAiRun < MEMORY_AI_COOLDOWN_MS) {
    return { ok: false, outcome: 'SKIPPED_COOLDOWN' }
  }
  return { ok: true }
}
