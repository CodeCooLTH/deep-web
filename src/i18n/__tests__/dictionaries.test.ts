/**
 * เทสความครบถ้วนของคำแปล (feature 00047)
 *
 * 🛑 เทสชุดนี้ไม่ได้ทำงานซ้ำกับ `tsc` — มันปิดช่องที่ `tsc` ปิดไม่ได้
 *
 * `const en: Dictionary` บังคับได้แค่ว่า **"คีย์ครบ"** ไม่ได้บังคับว่า **"แปลจริง"**
 * ใครก็อปเนื้อ th.ts ทั้งก้อนไปวางใน en.ts แล้ว `tsc` เขียวหมดทุกบรรทัด ผู้ใช้ที่เลือก
 * ภาษาอังกฤษก็จะเห็นภาษาไทยเต็มจอโดยไม่มีอะไรฟ้อง ซึ่งเป็นความล้มเหลวของฟีเจอร์นี้ทั้งฟีเจอร์
 * (เป้าหมายเดียวคือให้ Meta App Reviewer อ่าน UI ออก)
 *
 * และปิดช่องที่ใหญ่กว่านั้นอีกช่อง: **การถอดด่านออกทั้งอัน** — ถ้ามีคนเปลี่ยน
 * `const en: Dictionary` เป็น `Partial<Dictionary>` หรือ `Record<string, unknown>`
 * `tsc` จะเงียบสนิทตลอดไป (บทเรียน docs/conventions/rule-must-be-enforced-not-described.md:
 * ก่อน mark ว่าเสร็จต้องชี้ได้ว่าโค้ดบรรทัดไหนบังคับ + เทสตัวไหนแดงถ้าเอาบรรทัดนั้นออก)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { th } from '../dictionaries/th'
import { en } from '../dictionaries/en'
import { DEFAULT_LOCALE, LOCALES, isLocale, toLocale } from '../locales'

/** แบนโครงสร้างซ้อนให้เป็น path เดียว เช่น "topbar.language.buttonLabel" */
function flatten(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out[path] = value
    else if (value && typeof value === 'object') Object.assign(out, flatten(value, path))
    else throw new Error(`ค่าใน dictionary ต้องเป็นสตริงหรืออ็อบเจกต์เท่านั้น แต่ "${path}" เป็น ${typeof value}`)
  }
  return out
}

const THAI_CHAR = /[฀-๿]/

/**
 * คีย์ที่ "ตั้งใจให้เป็นภาษาไทยในฝั่งอังกฤษ"
 *
 * ชื่อภาษาต้องเขียนด้วยภาษาของตัวเองเสมอ (FR-I18N-01) — คนที่อ่านไทยไม่ออกต้องหา "English" เจอ
 * และคนที่อ่านไทยออกต้องหา "ไทย" เจอ ไม่ว่ากำลังอยู่โหมดไหน
 *
 * 🛑 การเพิ่มคีย์เข้า allow-list นี้คือการยกเว้นด่าน — ต้องมีเหตุผลว่าทำไมคำนั้น
 * "ต้องเป็นภาษาไทยแม้ในโหมดอังกฤษ" ไม่ใช่ "ยังไม่ได้แปล"
 */
const THAI_ALLOWED_IN_EN = new Set<string>(['language.th'])

describe('i18n dictionaries', () => {
  const thFlat = flatten(th)
  const enFlat = flatten(en)

  it('[blocker] คีย์ของ th กับ en ต้องตรงกันทุกตัว', () => {
    const thKeys = Object.keys(thFlat).sort()
    const enKeys = Object.keys(enFlat).sort()
    expect(enKeys).toEqual(thKeys)
  })

  it('[blocker] ห้ามมีคำแปลที่เป็นค่าว่าง — คำแปลหายแบบเงียบอันตรายกว่าคีย์หาย', () => {
    // คีย์หายถูก tsc จับ แต่ค่าว่างผ่านทุกด่านแล้วไปโผล่เป็นปุ่มเปล่าบนหน้าจอ
    const emptyTh = Object.entries(thFlat).filter(([, value]) => value.trim() === '')
    const emptyEn = Object.entries(enFlat).filter(([, value]) => value.trim() === '')
    expect({ th: emptyTh, en: emptyEn }).toEqual({ th: [], en: [] })
  })

  it('[blocker] คำแปลอังกฤษต้องไม่มีตัวอักษรไทย — จับ "ก็อป th มาวางแล้วลืมแปล"', () => {
    // นี่คือช่องที่ tsc ปิดไม่ได้: `const en: Dictionary` บังคับแค่คีย์ครบ ไม่ได้บังคับว่าแปลแล้ว
    const untranslated = Object.entries(enFlat)
      .filter(([key, value]) => !THAI_ALLOWED_IN_EN.has(key) && THAI_CHAR.test(value))
      .map(([key, value]) => `${key} = "${value}"`)
    expect(untranslated).toEqual([])
  })

  it('[blocker] en.ts ต้องประกาศชนิดเป็น Dictionary เต็ม ห้าม Partial/Record — กันการถอดด่าน', () => {
    // ด่านจริงของ BR-I18N-11 คือบรรทัด `export const en: Dictionary = {` ใน en.ts
    // ถ้ามีคนทำให้มันหลวม (Partial<Dictionary> / Record<string, unknown> / any) tsc จะเงียบ
    // ตลอดไปแล้วคำแปลที่ขาดจะไหลไปถึงผู้ใช้ — เทสนี้คือสิ่งเดียวที่จับได้
    const source = readFileSync(join(__dirname, '../dictionaries/en.ts'), 'utf8')
    expect(source).toMatch(/export const en:\s*Dictionary\s*=/)
    expect(source).not.toMatch(/export const en:\s*(Partial<|Record<|any\b)/)
  })

  it('[blocker] th.ts ต้องไม่ใช้ as const — ไม่งั้น en จะถูกบังคับให้ใส่ค่าไทยตัวเดียวกัน', () => {
    // ถ้าใส่ `as const` ค่าจะกลายเป็น literal type ("บันทึก") แทน string
    // แล้ว `const en: Dictionary` จะคอมไพล์ไม่ผ่านจนกว่าจะใส่ข้อความไทยลงไป = ด่านพังในทางกลับ
    const source = readFileSync(join(__dirname, '../dictionaries/th.ts'), 'utf8')
    expect(source).toMatch(/export const th = \{/)
    expect(source).not.toMatch(/^\}\s+as const/m)
  })
})

describe('toLocale / isLocale — fail-closed (BR-I18N-05)', () => {
  it('ยอมรับเฉพาะภาษาที่ระบบรองรับ', () => {
    for (const locale of LOCALES) expect(isLocale(locale)).toBe(true)
  })

  it('[blocker] ค่าที่ไม่รู้จักต้องถอยไปภาษาไทย ไม่ใช่ปล่อยผ่าน', () => {
    // cookie เขียนได้จาก client ทั้งหมด และคอลัมน์ใน DB เป็น String ไม่มี CHECK constraint
    // ⇒ ค่าที่หลุดเข้ามาต้องไม่ทำให้ค้นหา dictionary ไม่เจอแล้วหน้าจอว่าง
    for (const bad of ['', 'TH', 'th-TH', 'jp', 'null', '../../etc/passwd', '  th  ']) {
      expect(toLocale(bad)).toBe(DEFAULT_LOCALE)
    }
    expect(toLocale(undefined)).toBe(DEFAULT_LOCALE)
    expect(toLocale(null)).toBe(DEFAULT_LOCALE)
    expect(toLocale(42)).toBe(DEFAULT_LOCALE)
    expect(toLocale({ locale: 'en' })).toBe(DEFAULT_LOCALE)
  })

  it('ค่าตั้งต้นของระบบคือไทย (BR-I18N-01) — ผู้ใช้เดิมต้องไม่เห็นอะไรเปลี่ยน', () => {
    expect(DEFAULT_LOCALE).toBe('th')
  })
})
