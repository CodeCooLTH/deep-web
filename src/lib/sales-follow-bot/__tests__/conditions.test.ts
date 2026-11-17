// FR-FA-8 — evaluateConditions / possibleStages / hasLimitingCondition (ตัวเดียวที่ตัวแนบและตัวตัดสิน run ใช้)
import { describe, expect, it } from 'vitest'
import { evaluateConditions, hasLimitingCondition, possibleStages, tagKeysOfRules, type ConditionRule } from '../conditions'

const stage = (op: 'is' | 'is_not', ...values: string[]): ConditionRule => ({ field: 'stage', op, values: values as never })
const tag = (op: 'has_any' | 'has_all' | 'has_none', ...values: string[]): ConditionRule => ({ field: 'tag', op, values })
const F = (o: { stageKey?: string; tags?: string[]; shop?: string[] } = {}) => ({
  stageKey: (o.stageKey ?? 'NOT_BOUGHT') as never,
  contactTags: o.tags ?? [],
  shopTagKeys: new Set(o.shop ?? ['a', 'b', 'k']),
})

describe('evaluateConditions — ทุก op', () => {
  it('stage is / is_not', () => {
    expect(evaluateConditions([stage('is', 'NOT_BOUGHT', 'BILLED')], 'ALL', F()).ok).toBe(true)
    expect(evaluateConditions([stage('is', 'BILLED')], 'ALL', F()).ok).toBe(false)
    expect(evaluateConditions([stage('is_not', 'BILLED')], 'ALL', F()).ok).toBe(true)
    expect(evaluateConditions([stage('is_not', 'NOT_BOUGHT')], 'ALL', F()).ok).toBe(false)
  })
  it('tag has_any / has_all / has_none', () => {
    expect(evaluateConditions([tag('has_any', 'a', 'b')], 'ALL', F({ tags: ['b'] })).ok).toBe(true)
    expect(evaluateConditions([tag('has_any', 'a', 'b')], 'ALL', F({ tags: [] })).ok).toBe(false)
    expect(evaluateConditions([tag('has_all', 'a', 'b')], 'ALL', F({ tags: ['a', 'b'] })).ok).toBe(true)
    expect(evaluateConditions([tag('has_all', 'a', 'b')], 'ALL', F({ tags: ['a'] })).ok).toBe(false)
    expect(evaluateConditions([tag('has_none', 'k')], 'ALL', F({ tags: [] })).ok).toBe(true)
    expect(evaluateConditions([tag('has_none', 'k')], 'ALL', F({ tags: ['k'] }))).toEqual({ ok: false, blamedTag: 'k' })
  })
  it('เทียบชื่อแท็กด้วย key เดียวกับ tagNameKey (ตัวพิมพ์ · ช่องว่าง) และคืนชื่อดิบของลูกค้าเป็น blamedTag', () => {
    expect(evaluateConditions([tag('has_none', 'vip')], 'ALL', F({ tags: ['  VIP '], shop: ['vip'] }))).toEqual({ ok: false, blamedTag: '  VIP ' })
  })
})

describe('ALL / ANY', () => {
  const rules = [stage('is', 'BILLED'), tag('has_any', 'a')]
  it('ALL ต้องผ่านทุกแถว · ANY ผ่านแถวใดแถวหนึ่ง', () => {
    expect(evaluateConditions(rules, 'ALL', F({ tags: ['a'] })).ok).toBe(false)
    expect(evaluateConditions(rules, 'ANY', F({ tags: ['a'] })).ok).toBe(true)
    expect(evaluateConditions(rules, 'ANY', F()).ok).toBe(false)
    expect(evaluateConditions(rules, 'ALL', F({ stageKey: 'BILLED', tags: ['a'] })).ok).toBe(true)
  })
  it('ตัวอย่างร้านธนภัทร์: ยังไม่ซื้อ + ไม่มีแท็ก รอคีย์ออเดอร์ — ติดแท็กกลางทาง = ไม่ตรง', () => {
    const r = [stage('is', 'NOT_BOUGHT'), tag('has_none', 'k')]
    expect(evaluateConditions(r, 'ALL', F()).ok).toBe(true)
    expect(evaluateConditions(r, 'ALL', F({ tags: ['k'] })).ok).toBe(false)
  })
  it('ไม่มีกฎ = ไม่ตรง (fail-closed ทั้ง ALL และ ANY)', () => {
    expect(evaluateConditions([], 'ALL', F()).ok).toBe(false)
    expect(evaluateConditions([], 'ANY', F()).ok).toBe(false)
  })
})

describe('แท็กที่ร้านลบแล้ว', () => {
  it('has_none ข้ามแท็กที่ลบ · has_any ใช้ที่เหลือ · has_any ลบหมด = ไม่ตรง · has_all ที่หาย = ไม่ตรง (fail-closed)', () => {
    expect(evaluateConditions([tag('has_none', 'gone')], 'ALL', F({ tags: ['gone'], shop: [] })).ok).toBe(true)
    expect(evaluateConditions([tag('has_any', 'a', 'gone')], 'ALL', F({ tags: ['a'], shop: ['a'] })).ok).toBe(true)
    expect(evaluateConditions([tag('has_any', 'gone')], 'ALL', F({ tags: ['gone'], shop: [] })).ok).toBe(false)
    expect(evaluateConditions([tag('has_all', 'a', 'gone')], 'ALL', F({ tags: ['a', 'gone'], shop: ['a'] })).ok).toBe(false)
  })
})

describe('hasLimitingCondition / possibleStages / tagKeysOfRules', () => {
  it('ALL: อย่างน้อยหนึ่งแถว is/has_any/has_all · ANY: ทุกแถว', () => {
    expect(hasLimitingCondition([], 'ALL')).toBe(false)
    expect(hasLimitingCondition([stage('is_not', 'BILLED'), tag('has_none', 'k')], 'ALL')).toBe(false)
    expect(hasLimitingCondition([stage('is_not', 'BILLED'), tag('has_all', 'k')], 'ALL')).toBe(true)
    expect(hasLimitingCondition([stage('is', 'BILLED'), tag('has_none', 'k')], 'ANY')).toBe(false)
  })
  it('possibleStages: ไม่มีแถวสถานะ = ทั้ง 7 · ALL ตัดกัน · ANY+แท็ก = ทั้ง 7', () => {
    expect(possibleStages([tag('has_any', 'a')], 'ALL')).toHaveLength(7)
    expect(possibleStages([stage('is', 'BILLED', 'SHIPPED'), stage('is_not', 'SHIPPED')], 'ALL')).toEqual(['BILLED'])
    expect(possibleStages([stage('is', 'BILLED'), tag('has_any', 'a')], 'ANY')).toHaveLength(7)
    expect(possibleStages([stage('is', 'BILLED'), stage('is', 'SHIPPED')], 'ANY')).toEqual(['BILLED', 'SHIPPED'])
  })
  it('tagKeysOfRules ไม่ซ้ำ', () => {
    expect(tagKeysOfRules([tag('has_any', 'a', 'b'), tag('has_none', 'a'), stage('is', 'BILLED')])).toEqual(['a', 'b'])
  })
})
