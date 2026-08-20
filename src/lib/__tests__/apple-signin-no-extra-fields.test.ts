import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] หลัง Sign in with Apple ห้ามถามข้อมูลที่ Apple ให้มาแล้ว (Guideline 4 - Design)
 *
 * ## บั๊กที่ด่านนี้กัน (Apple ตีกลับ 2026-08-19)
 *
 * *"users are required to provide their name and/or email address after using Sign in with
 * Apple even though that information is already provided by the Authentication Services
 * framework"*
 *
 * 🛑 ของจริงเราไม่เคยถามชื่อหรืออีเมล — `displayName` ดึงจาก provider อัตโนมัติ
 * (`register/page.tsx` ส่ง `user.displayName` เข้า API เอง) สิ่งที่ถามคือ **ชื่อผู้ใช้ (handle)**
 * กับ **เบอร์โทร** เท่านั้น
 *
 * แต่ป้าย "ชื่อผู้ใช้" ขึ้นต้นด้วยคำว่า "ชื่อ" ⇒ คนรีวิวที่อ่านผ่านตัวแปลภาษาเห็นเป็น
 * "Name of user" แล้วสรุปว่าเราถามชื่อ — **เถียงว่าเขาอ่านผิดไม่ช่วยอะไร** จึงตัดช่องนั้น
 * ออกจากเส้นทางของ Apple ไปเลย เหลือแค่ยืนยันเบอร์ (ซึ่งเป็นข้อกำหนดของธุรกิจไทย
 * ไม่ใช่ข้อมูลที่ Apple ให้มา และ Apple ไม่ได้พูดถึงเบอร์)
 *
 * 🛑 แดง = ห้าม merge
 */

const ROOT = process.cwd()
const REL = 'src/app/(paces)/seller/register/page.tsx'

/** ลบเนื้อคอมเมนต์แต่คงจำนวนบรรทัด — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย */
const blankComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, (m, indent: string) => indent)

const code = () => blankComments(readFileSync(join(ROOT, REL), 'utf8'))

describe('[blocker] เส้นทางหลัง Sign in with Apple', () => {
  it('ต้องซ่อนช่องชื่อผู้ใช้เมื่อมาจาก Apple', () => {
    const c = code()
    expect(c, 'ต้องรู้ว่ามาจาก provider ไหน').toMatch(/providerFromUsername\(user\.username\) === 'apple'/)
    expect(c, 'ต้องมีตัวตัดสินว่าจะซ่อนไหม').toMatch(/const hideUsername = isApple/)
    expect(c, 'ต้องเอาไปซ่อนบล็อกจริง ไม่ใช่คำนวณแล้วทิ้ง').toMatch(
      /hideUsername \? 'hidden'/,
    )
  })

  it('[blocker] ซ่อนได้เฉพาะตอนชื่อที่ระบบตั้งให้ใช้ได้จริง', () => {
    /**
     * 🛑 ถ้าซ่อนโดยไม่ดูผลตรวจ ผู้ใช้จะกด "ถัดไป" ไม่ผ่านโดยไม่มีอะไรบอก เพราะ `submitInfo`
     * บังคับ `uStatus === 'ok'` — เกิดได้จริงเมื่อบัญชีค้างยังถือชื่อนั้นอยู่ (เคส 2026-08-15)
     */
    expect(code(), 'ต้องผูกกับผลตรวจ ไม่ใช่ซ่อนดื้อ ๆ').toMatch(/isApple && uStatus === 'ok'/)
  })

  it('[blocker] ห้ามมีช่องกรอกชื่อจริงหรืออีเมลในหน้านี้', () => {
    /**
     * `displayName` ต้องมาจาก provider เสมอ (`user.displayName`) — ถ้าวันหนึ่งมีคนเพิ่ม
     * ช่องให้กรอกเอง จะกลับไปผิดข้อเดิมทันที
     */
    const c = code()
    expect(c, 'displayName ต้องมาจาก provider ไม่ใช่จากช่องกรอก').toMatch(
      /displayName: \(user\.displayName \|\| 'ร้านค้า'\)/,
    )
    expect(c, 'ห้ามมี input ที่ผูกกับ state ชื่อจริง/อีเมล').not.toMatch(
      /value=\{(?:displayName|email|fullName)\}/,
    )
  })
})
