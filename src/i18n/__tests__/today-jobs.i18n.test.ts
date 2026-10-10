import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { en } from '../dictionaries/en'
import { th } from '../dictionaries/th'

/**
 * 00071 T10 → 00047: การ์ด "งานวันนี้" (TodayJobs) ต้องไม่ฝังไทยในโค้ด — ทุกข้อความมาจาก t.dashboard.todayJobs*
 * ตัวสแกนรับซอร์สเพื่อ mutation: ฉีดข้อความไทยเข้าไป → ต้องแดง
 */
const FILE = 'src/app/(paces)/seller/(dashboard)/dashboard/components/TodayJobs.tsx'
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
export const thaiInCode = (src: string) => strip(src).match(/[฀-๿]+/g) ?? []
const THAI = /[฀-๿]/

describe('TodayJobs i18n', () => {
  it('ไม่มีตัวอักษรไทยนอกคอมเมนต์ในคอมโพเนนต์', () => {
    expect(thaiInCode(readFileSync(FILE, 'utf8'))).toEqual([])
  })

  it('ใช้ useT().dashboard และทุกคีย์ todayJobs* ที่อ้างมีใน th และ en (en ไม่มีไทย)', () => {
    const src = readFileSync(FILE, 'utf8')
    expect(src).toMatch(/useT\(\)\.dashboard/)
    const keys = [...new Set([...src.matchAll(/\bt\.(todayJobs\w+)/g)].map((m) => m[1]))]
    expect(keys.length).toBeGreaterThanOrEqual(8)
    for (const k of keys) {
      expect(typeof (th.dashboard as Record<string, unknown>)[k], `th.dashboard.${k}`).toBe('string')
      const e = (en.dashboard as Record<string, unknown>)[k]
      expect(typeof e, `en.dashboard.${k}`).toBe('string')
      expect(THAI.test(e as string), `en.dashboard.${k} ยังเป็นไทย`).toBe(false)
    }
  })

  it('mutation: ฉีดข้อความไทยเข้าโค้ด → ตัวสแกนจับได้ · คอมเมนต์ไทยไม่นับ', () => {
    expect(thaiInCode(`const a = <p>งานวันนี้</p>`)).toEqual(['งานวันนี้'])
    expect(thaiInCode(`// งานวันนี้\nconst a = 1`)).toEqual([])
  })
})
