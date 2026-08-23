import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * [blocker] feature 00053 (TC-B6) — ด่านกัน "ราคาโผล่ที่จุดที่ลืมไล่"
 *
 * ฟีเจอร์ "ซ่อนราคา" ที่ยังโชว์ราคาอยู่จุดหนึ่ง **แย่กว่าไม่มีฟีเจอร์** เพราะร้านเชื่อไปแล้วว่า
 * ปิดสำเร็จ · ราคาบนหน้าร้านกระจายอยู่ 4 จุดคนละไฟล์ (การ์ดสินค้า · ป๊อปอัป · ห้องพัก · มัดจำบริการ)
 * และไม่มี gate ไหนของโปรเจกต์เห็นเรื่องนี้เลย — `tsc`/build/theme-guard ผ่านหมดเพราะการพิมพ์
 * `฿` เป็นโค้ดที่ถูกต้องทุกตัวอักษร สิ่งที่ผิดคือ *มันไม่ได้อยู่ใต้เงื่อนไข*
 *
 * กติกา: ไฟล์ใดในซับทรีหน้าร้านที่พิมพ์สัญลักษณ์ `฿` ต้องอ้างถึง `showPrices` ในไฟล์เดียวกัน
 * (จะรับเป็น prop แล้วเช็ค หรือส่งต่อให้ลูกก็ได้ — สิ่งที่ด่านนี้กันคือ "พิมพ์ราคาโดยไม่รู้จัก
 * สวิตช์เลย" ซึ่งเป็นรูปร่างของความผิดพลาดจริง)
 *
 * 🛑 ต้องตัดคอมเมนต์ทิ้งก่อนสแกน — ไฟล์ที่ทำถูกกฎมักเป็นไฟล์ที่เขียนคำอธิบายกฎนั้นไว้ด้วย
 * (บทเรียนเดิมของ grep gate ใน HR9 ที่แดงค้างจากคำเตือนของตัวเอง 2026-08-02→03)
 */
const ROOT = join(process.cwd(), 'src/views/pages/user-profile')

/** ไฟล์ที่ยกเว้นพร้อมเหตุผล — ว่างอยู่ตอนนี้ ถ้าจะเพิ่มต้องเขียนเหตุผลกำกับเสมอ */
const EXEMPT: Record<string, string> = {}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

/** ตัดคอมเมนต์ (บล็อกและบรรทัดเดียว) ออกก่อนสแกน */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('[blocker] ราคาบนหน้าร้านต้องอยู่ใต้สวิตช์ showPrices', () => {
  it('ทุกไฟล์ที่พิมพ์ ฿ ในซับทรีหน้าร้าน ต้องรู้จัก showPrices', () => {
    const offenders = walk(ROOT)
      .filter((f) => !(f.replace(process.cwd() + '/', '') in EXEMPT))
      .filter((f) => {
        const code = stripComments(readFileSync(f, 'utf8'))
        return code.includes('฿') && !code.includes('showPrices')
      })
      .map((f) => f.replace(process.cwd() + '/', ''))

    expect(offenders).toEqual([])
  })

  it('ด่านนี้สแกนเจอไฟล์จริง (กันเคสที่ path เพี้ยนแล้วเทสผ่านเพราะไม่มีไฟล์ให้ตรวจ)', () => {
    const files = walk(ROOT)
    expect(files.length).toBeGreaterThan(10)
    expect(files.some((f) => stripComments(readFileSync(f, 'utf8')).includes('฿'))).toBe(true)
  })
})
