import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * [blocker] แท็บหน้าร้านต้องไม่ถอดเนื้อหาทิ้งเมื่อสลับแท็บ (user เจอเองบน prod 2026-08-23)
 *
 * อาการ: "tab สินค้ามันโหลดรูปใหม่ทุกรอบ ทั้ง ๆ ที่เคยโหลดแล้ว" — แท็บสินค้าของร้านหนึ่งมี
 * รูป 22 ใบ ใบละ ~200KB พอ panel เขียนว่า `{i === active && t.content}` การออกจากแท็บจะถอด
 * `<img>` ทั้งชุดออกจาก DOM แล้วกลับมาสร้างใหม่หมด `loading="lazy"` เริ่มนับหนึ่งอีกรอบ
 *
 * 🛑 ไม่มี gate ไหนของโปรเจกต์จับคลาสนี้ได้เลย — `tsc`/build/eslint/theme-guard ผ่านหมดเพราะ
 * `{i === active && t.content}` เป็นโค้ดที่ถูกต้องทุกตัวอักษร สิ่งที่ผิดคือ *ผลข้างเคียงต่อ
 * lifecycle* ซึ่งเห็นได้จากการกดใช้จริงเท่านั้น (คลาสเดียวกับ component-declared-in-render.md)
 * ด่านนี้จึงอ่านซอร์สตรง ๆ — รีโปนี้ไม่มี jsdom/testing-library ให้ยืนยันใน DOM
 *
 * 🛑 ตัดคอมเมนต์ก่อนสแกน: ไฟล์ที่ทำถูกกฎคือไฟล์ที่เขียนคำอธิบายกฎนั้นไว้ด้วย (บทเรียน grep gate
 * ของ HR9 ที่แดงค้างจากคำเตือนของตัวเอง 2026-08-02→03)
 */
const FILE = 'src/views/pages/user-profile/v2/ProfileTabs.tsx'

function code(): string {
  const src = readFileSync(join(process.cwd(), FILE), 'utf8')
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('[blocker] ProfileTabs ต้องเก็บแท็บที่เคยเปิดไว้ใน DOM', () => {
  it('panel ต้อง render ตาม "เคยเปิดแล้ว" ไม่ใช่ "กำลัง active"', () => {
    const src = code()
    expect(src).toContain('visited.has(i) && t.content')
    expect(src).not.toContain('i === active && t.content')
  })

  it('ทุกทางที่เปลี่ยนแท็บต้องผ่าน go() ที่บันทึก visited — ห้ามเรียก setActive ตรง ๆ ใน handler', () => {
    const src = code()
    // setActive ถูกเรียกได้ที่เดียวคือใน go() · ที่เหลือ (onClick / ปุ่มลูกศร) ต้องเรียก go()
    const setActiveCalls = src.match(/setActive\(/g) ?? []
    expect(setActiveCalls).toHaveLength(1)
    expect(src).toContain('onClick={() => go(i)}')
    expect(src).toContain('go(next)')
  })

  it('visited เริ่มจากแท็บที่เปิดอยู่จริง ไม่ใช่ 0 ตายตัว (deep link ?p= เปิดแท็บสินค้ามาเลย)', () => {
    const src = code()
    expect(src).toContain('new Set([initialIndex])')
    expect(src).not.toMatch(/new Set\(\[0\]\)/)
  })
})
