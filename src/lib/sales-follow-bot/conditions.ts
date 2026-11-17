// 00095 FR-FA-8/BR-FA-11 — เงื่อนไขการเริ่มติดตามแบบแถว (pure: ไม่แตะ DB ไม่ import node:crypto → client ใช้ได้)
// ตัวเดียวทั้งตัวแนบ (eligibleToAttach) และตัวตัดสิน run (decideRun) — HR16: นิยามเดียว
import { SALES_STAGE_KEYS, type SalesStageKey } from './constants'

export const CONDITION_MATCHES = ['ALL', 'ANY'] as const
export type ConditionMatch = (typeof CONDITION_MATCHES)[number]
export const STAGE_OPS = ['is', 'is_not'] as const
export const TAG_OPS = ['has_any', 'has_all', 'has_none'] as const
export type StageOp = (typeof STAGE_OPS)[number]
export type TagOp = (typeof TAG_OPS)[number]
export const MAX_RULES = 10
export const MAX_RULE_VALUES = 20

/** แถวที่เก็บใน DB (tag values = nameKey) */
export type ConditionRule =
  | { field: 'stage'; op: StageOp; values: SalesStageKey[] }
  | { field: 'tag'; op: TagOp; values: string[] }

/** key เดียวกับ tagNameKey (src/lib/shop-tag-match.ts) — ไม่ import เพราะลาก node:crypto เข้า client */
export const tagKeyOf = (s: string): string => s.normalize('NFC').toLowerCase().trim()

/** แถว "จำกัดวง" = ทำให้คนที่ตรงน้อยกว่าทั้งร้าน: is / has_any / has_all (is_not / has_none ครอบเกือบทุกคน) */
export const isLimitingRule = (r: ConditionRule): boolean => r.op === 'is' || r.op === 'has_any' || r.op === 'has_all'

/** ต้องมีแถวที่จำกัดวง: ALL = อย่างน้อยหนึ่งแถว · ANY = ทุกแถว (มีแถว "ไม่ใช่" เพียงแถวเดียวใน ANY ก็ครอบเกือบทั้งร้านแล้ว) */
export function hasLimitingCondition(rules: readonly ConditionRule[], match: ConditionMatch): boolean {
  if (rules.length === 0) return false
  return match === 'ALL' ? rules.some(isLimitingRule) : rules.every(isLimitingRule)
}

/** ชุดสถานะที่แถว stage แถวเดียวยอมรับ */
const stageSet = (r: Extract<ConditionRule, { field: 'stage' }>): SalesStageKey[] =>
  r.op === 'is' ? [...new Set(r.values)] : SALES_STAGE_KEYS.filter((k) => !r.values.includes(k))

/**
 * ชุดสถานะที่บอท "อาจ" ตรง (ใช้คัดห้องล่วงหน้า + ตรวจช่องทางชน) — เกินจริงได้ ขาดจริงไม่ได้
 * ALL: ตัดกันของแถว stage (ไม่มีแถว stage = ทุกสถานะ) · ANY: มีแถวแท็กเมื่อไร = ทุกสถานะ ไม่งั้นรวมกันของแถว stage
 */
export function possibleStages(rules: readonly ConditionRule[], match: ConditionMatch): SalesStageKey[] {
  const stageRules = rules.filter((r): r is Extract<ConditionRule, { field: 'stage' }> => r.field === 'stage')
  const all = [...SALES_STAGE_KEYS]
  if (stageRules.length === 0) return all
  if (match === 'ALL') return all.filter((k) => stageRules.every((r) => stageSet(r).includes(k)))
  if (rules.some((r) => r.field === 'tag')) return all
  return all.filter((k) => stageRules.some((r) => stageSet(r).includes(k)))
}

/** บอทไม่จำกัดสถานะ = อาจตรงทุกสถานะ (แทน salesStatuses ว่างเดิม) */
export const isStageUnrestricted = (rules: readonly ConditionRule[], match: ConditionMatch): boolean =>
  possibleStages(rules, match).length === SALES_STAGE_KEYS.length

export interface ConditionFacts {
  stageKey: SalesStageKey
  /** ชื่อแท็กดิบของลูกค้า (ผ่าน tagKeyOf ตอนเทียบ) */
  contactTags: readonly string[]
  /** nameKey ของ ShopTag ทั้งหมดของร้าน — ไว้แยกแท็กที่ร้านลบแล้ว */
  shopTagKeys: ReadonlySet<string>
}
export interface ConditionResult {
  ok: boolean
  /** ชื่อแท็กของลูกค้าที่ทำให้แถว has_none ไม่ผ่าน (ไว้บอกในบรรทัดระบบ) */
  blamedTag?: string
}

function ruleMatches(r: ConditionRule, f: ConditionFacts, have: Set<string>): boolean {
  if (r.field === 'stage') return r.op === 'is' ? r.values.includes(f.stageKey) : !r.values.includes(f.stageKey)
  const usable = r.values.filter((k) => f.shopTagKeys.has(k)) // แท็กที่ร้านลบแล้วข้าม
  if (r.op === 'has_none') return !usable.some((k) => have.has(k))
  // fail-closed: has_all ที่แท็กหาย = ไม่ตรง · has_any ที่แท็กหายหมด = ไม่ตรง
  if (r.op === 'has_all') return r.values.length > 0 && usable.length === r.values.length && usable.every((k) => have.has(k))
  return usable.some((k) => have.has(k))
}

/** ไม่มีกฎ = ไม่ตรง (fail-closed — ไม่ให้บอทที่กฎว่างทักทั้งร้าน) */
export function evaluateConditions(rules: readonly ConditionRule[], match: ConditionMatch, f: ConditionFacts): ConditionResult {
  if (rules.length === 0) return { ok: false }
  const have = new Set(f.contactTags.map(tagKeyOf))
  const results = rules.map((r) => ruleMatches(r, f, have))
  const ok = match === 'ALL' ? results.every(Boolean) : results.some(Boolean)
  if (ok) return { ok }
  const blamed = rules.flatMap((r, i) => (!results[i] && r.field === 'tag' && r.op === 'has_none' ? f.contactTags.filter((t) => r.values.includes(tagKeyOf(t))) : []))[0]
  return blamed ? { ok, blamedTag: blamed } : { ok }
}

/** แท็กทุกตัวที่กฎอ้างถึง (key) — ไว้หาแท็กที่ถูกลบ/แปลงชื่อ */
export const tagKeysOfRules = (rules: readonly ConditionRule[]): string[] =>
  [...new Set(rules.flatMap((r) => (r.field === 'tag' ? r.values : [])))]
