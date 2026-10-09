import 'server-only'
import type { SuggestContext, SuggestTurn } from '@/lib/gemini'
import {
  createPiiVault,
  redactPii,
  redactPiiReversible,
  type PiiKind,
  type PiiVault,
} from '@/lib/pii-redact'

/** โยนเมื่อปิดบังไม่สำเร็จ — caller ต้องไม่เรียก provider ภายนอก (fail-closed, BR-AIT-01) */
export class SanitizeError extends Error {}

export interface SanitizeInput {
  turns: SuggestTurn[]
  shopName: string
  instruction?: string
  contextBlock?: string
  customerNote?: string | null
  knownCustomerNames: string[]
  adminNames: string[]
  /** ค่าตัวอักษรที่ระบบรู้ว่าเป็นข้อมูลลูกค้า (เบอร์/ที่อยู่ใน CRM) — จับที่อยู่ที่ไม่มีรหัสไปรษณีย์ */
  knownLiterals?: string[]
  /** ONLINE_SALES | SERVICE_QUEUE | LODGING — ค่าจาก enum ของระบบ ไม่ใช่ข้อความอิสระ */
  vertical?: string
}

/**
 * แบรนด์: สร้างได้จาก sanitizeForExternalAi เท่านั้น (ไม่ export ค่า symbol — ไม่มีใครปลอมชนิดนี้ได้โดยไม่ cast)
 * ผู้ให้บริการภายนอกที่ห้ามมี PII (Typhoon) รับเฉพาะชนิดนี้ → compiler กันการส่งของดิบ
 */
declare const sanitizedBrand: unique symbol

export interface SanitizeOutput {
  readonly [sanitizedBrand]: true
  vertical: string
  turns: SuggestTurn[]
  shopName: string
  instruction: string
  contextBlock: string
  customerName: null
  customerNote: string | null
  vault: PiiVault
  foundKinds: PiiKind[]
}

const LITERAL_LABEL = '[ข้อมูลลูกค้า]'

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** ชื่อเต็ม (≥2 ตัวอักษร) + แต่ละท่อน ≥3 ตัวอักษร (ท่อนสั้นกัดคำทั่วไปจนข้อความเพี้ยน) เรียงยาวก่อน — ภาษาไทยไม่มีขอบคำ จึงเทียบเป็นสตริงย่อยตรง ๆ */
function nameVariants(names: string[]): string[] {
  const set = new Set<string>()
  for (const n of names) {
    const full = n.trim()
    if (full.length >= 2) set.add(full)
    for (const part of full.split(/\s+/)) if (part.length >= 3) set.add(part)
  }
  return [...set].sort((a, b) => b.length - a.length)
}

function replaceAllCI(text: string, needles: string[], to: string): string {
  let out = text
  for (const n of needles) out = out.replace(new RegExp(escapeRe(n), 'giu'), to)
  return out
}

/**
 * ด่านเดียวของทุก string ที่จะออกไปหา provider ภายนอก
 * mode 'typhoon': ไม่ส่ง customerNote เลย (ข้อความอิสระของแอดมินคุมไม่ได้) · 'gemini': redact แล้วส่งได้
 * ชื่อดิบ (customerName) ไม่ส่งในทั้งสองโหมด — ใช้ "ลูกค้า" แทน
 */
export type SanitizedPayload = SanitizeOutput

/** ctx สำหรับ prompt ประกอบจาก payload ที่ผ่าน sanitize แล้วเท่านั้น */
export function sanitizedContext(p: SanitizedPayload): SuggestContext {
  return {
    shopName: p.shopName,
    vertical: p.vertical,
    instruction: p.instruction,
    contextBlock: p.contextBlock,
    customerName: null,
    customerNote: p.customerNote,
  }
}

export function sanitizeForExternalAi(input: SanitizeInput, mode: 'typhoon' | 'gemini'): SanitizedPayload {
  try {
    const vault = createPiiVault()
    const found = new Set<PiiKind>()
    const customerNames = nameVariants(input.knownCustomerNames)
    const adminNames = nameVariants(input.adminNames)
    const literals = [...new Set((input.knownLiterals ?? []).map((l) => l.trim()).filter((l) => l.length >= 2))].sort(
      (a, b) => b.length - a.length,
    )

    // ชื่อ/literal ก่อน PII: ถ้าทำหลัง ชื่อสั้นอาจไปกัดป้าย [เลขบัญชี#1] จนคืนค่าไม่ได้
    const scrub = (s: string): string => {
      if (typeof s !== 'string') throw new SanitizeError('not a string')
      let t = replaceAllCI(s, literals, LITERAL_LABEL)
      t = replaceAllCI(t, customerNames, 'ลูกค้า')
      t = replaceAllCI(t, adminNames, 'แอดมิน')
      const r = redactPiiReversible(t, vault)
      r.found.forEach((k) => found.add(k))
      // ตรวจซ้ำด้วย redactPii เดิม: ถ้ายังมีอะไรหลุด = ตัวปิดบังพัง → ห้ามส่ง
      if (redactPii(r.text).found.length > 0) throw new SanitizeError('residual pii after redaction')
      return r.text
    }

    const out = {
      vertical: input.vertical ?? 'ONLINE_SALES',
      turns: input.turns.map((t) => ({ role: t.role, text: scrub(t.text) })),
      shopName: scrub(input.shopName),
      instruction: scrub(input.instruction ?? ''),
      contextBlock: scrub(input.contextBlock ?? ''),
      customerName: null,
      customerNote: mode === 'typhoon' || !input.customerNote ? null : scrub(input.customerNote),
      vault,
      foundKinds: [...found],
    } as SanitizeOutput
    return out
  } catch (e) {
    if (e instanceof SanitizeError) throw e
    // ไม่แนบ message เดิม: อาจมีเนื้อความลูกค้าติดมา
    throw new SanitizeError('sanitize failed')
  }
}
