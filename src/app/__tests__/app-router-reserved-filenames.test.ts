/**
 * ด่านกัน "ไฟล์ชื่อชนกับ convention ของ App Router" — feature 00061 (2026-09-08)
 *
 * ที่มา: `settings/auto-reply/order-agent/template.ts` เก็บ *ข้อความแม่แบบ* (array ของสตริง)
 * แต่ `template` เป็นชื่อไฟล์สงวนของ App Router ⇒ Next หยิบไปเป็น segment template แล้ว
 * เรนเดอร์ `export default` ของมัน ซึ่งไม่มี ⇒ ได้ module namespace object ⇒ **ทั้งหน้าพัง**
 * ด้วย "Element type is invalid ... but got: object" — เจอบน prod ทันทีที่ผู้ใช้เปิดหน้าแรก
 *
 * 🛑 ไม่มี gate ไหนของโปรเจกต์จับได้เลย: `tsc` เขียว (ไฟล์ถูกทุกตัวอักษร) · `eslint` เขียว ·
 * `next build` เขียว (build ไม่เรนเดอร์เพจ dynamic) · theme-guard ไม่เกี่ยว
 * สิ่งที่ผิดคือ **ชื่อไฟล์** ไม่ใช่เนื้อในไฟล์
 *
 * เกณฑ์: ไฟล์ใน `src/app/**` ที่ชื่อตรงกับ convention ซึ่ง Next เรนเดอร์เป็นคอมโพเนนต์
 * **ต้องมี default export** ถ้าไฟล์นั้นตั้งใจเป็นโมดูลข้อมูล ให้เปลี่ยนชื่อ ไม่ใช่ยัด default ปลอม
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const APP_DIR = join(process.cwd(), 'src/app')

/**
 * ชื่อที่ Next เรนเดอร์เป็น React component (ดู `FILE_TYPES` + `HTTP_ACCESS_FALLBACKS` ใน
 * `next/dist/build/webpack/loaders/next-app-loader/index.js`)
 *
 * 🛑 `route` ไม่อยู่ในลิสต์โดยตั้งใจ — เป็นไฟล์ handler (export GET/POST) ไม่ใช่คอมโพเนนต์
 */
const COMPONENT_CONVENTIONS = new Set([
  'layout',
  'template',
  'page',
  'error',
  'loading',
  'not-found',
  'global-error',
  'global-not-found',
  'default',
  'forbidden',
  'unauthorized',
])

const EXTS = ['.ts', '.tsx', '.js', '.jsx']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

describe('ชื่อไฟล์ที่ App Router สงวนไว้', () => {
  it('[blocker] ทุกไฟล์ที่ชื่อชนกับ convention ต้องมี default export จริง', () => {
    const offenders: string[] = []
    for (const file of walk(APP_DIR)) {
      const name = file.slice(file.lastIndexOf('/') + 1)
      const ext = EXTS.find((e) => name.endsWith(e))
      if (!ext) continue
      const base = name.slice(0, -ext.length)
      if (!COMPONENT_CONVENTIONS.has(base)) continue
      // ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ *อธิบายกฎนี้* ต้องไม่ทำให้ด่านของตัวเองแดง
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
      // ครอบทั้ง 3 รูป: `export default …` · `export { X as default }` ·
      // `export { default } from '…'` (หน้า /m/* ที่ re-export หน้าจริงมาทั้งดุ้น)
      const hasDefault =
        /\bexport\s+default\b/.test(src) || /\bexport\s*\{[^}]*\bdefault\b[^}]*\}/.test(src)
      if (!hasDefault) offenders.push(`${file.replace(process.cwd() + '/', '')} — ไม่มี default export`)
    }
    expect(
      offenders,
      'ไฟล์เหล่านี้ถูก Next หยิบไปเรนเดอร์เป็นคอมโพเนนต์ของ segment แล้วจะพังทั้งหน้า ' +
        '("Element type is invalid ... but got: object") — เปลี่ยนชื่อไฟล์ ไม่ใช่เติม default ปลอม:\n' +
        offenders.join('\n'),
    ).toEqual([])
  })
})
