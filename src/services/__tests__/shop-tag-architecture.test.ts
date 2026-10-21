import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 00083 — จุดเรียก applyKeywordTags ต้องเป็นเซตเดียวกับ 00061 (TC-046 · TC-047 · TD-004) */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')

const FILES = walk('src').filter(
  (f) => !/\.(test|spec)\.tsx?$/.test(f) && !f.includes('__tests__'),
)
const callers = (fn: string, def: string) =>
  FILES.filter((f) => f !== def && new RegExp(`\\b${fn}\\(`).test(strip(readFileSync(f, 'utf8')))).sort()

const TAG_DEF = 'src/services/shop-tag-auto.service.ts'
const ORDER_DEF = 'src/services/auto-order-detect.service.ts'
const SET = [
  'src/app/api/channels/facebook/webhook/route.ts',
  'src/services/chat-outbox.service.ts',
  'src/services/chat.service.ts',
]

describe('00083 จุดเรียกตัวติดแท็ก', () => {
  it('[blocker] TC-046 เซตผู้เรียก = เซตของ detectAutoOrderTrigger', () => {
    const tag = callers('applyKeywordTags', TAG_DEF)
    expect(tag).toEqual(callers('detectAutoOrderTrigger', ORDER_DEF))
    expect(tag).toEqual(SET)
  })

  it('[blocker] TC-047 ไม่ await · อยู่ใน runAfterResponse/after · webhook มี .catch · มาก่อน 00061', () => {
    for (const f of SET) {
      const code = strip(readFileSync(f, 'utf8'))
      expect(code, f).not.toMatch(/await\s+applyKeywordTags/)
      const wrap = f.includes('webhook') ? 'after' : 'runAfterResponse'
      expect(code, f).toMatch(new RegExp(`${wrap}\\(\\s*\\(\\)\\s*=>\\s*applyKeywordTags\\(`))
      expect(code.indexOf('applyKeywordTags('), f).toBeGreaterThan(-1)
      expect(code.indexOf('applyKeywordTags('), f).toBeLessThan(code.indexOf('detectAutoOrderTrigger('))
    }
    expect(strip(readFileSync(SET[0], 'utf8'))).toMatch(/applyKeywordTags\([^)]*\)\.catch\(/)
  })
})
