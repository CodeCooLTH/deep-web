import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * ด่านกัน "ล็อกฝั่งผู้ขายไว้เฉพาะคนที่มีร้านแล้ว" กลับมา
 *
 * 🛑 baseline 2026-06-16 (Task 9) เขียน acceptance ว่า provider `seller-credentials` ต้อง
 * "reject non-seller" → reviewer สั่งให้ใส่ `if (!user.isShop) return null`. ตอนนั้นถูก เพราะ
 * ยุคนั้น "เป็นผู้ขาย" = "มีร้าน" เสมอ (ร้านถูกสร้างให้ตอน signup)
 *
 * แต่ feature 00012 (Lazy Personal shop, 2026-07) เลิก auto-create ร้านตอน login แล้วให้
 * `/choose-shop` เป็นคนรับเคส "ล็อกอินได้แต่ยังไม่มีร้าน" แทน — ตั้งแต่นาทีนั้นด่านเดิม
 * กลายเป็นกุญแจที่ล็อกประตูบานที่ 00012 เพิ่งเปิดไว้ **โดยไม่มีอะไรฟ้องเลย** (`tsc`/build/เทส
 * เขียวหมด เพราะสองกฎ "ถูก" ในตัวเองทั้งคู่ สิ่งที่ผิดคือมันขัดกัน)
 *
 * ผลบน prod 2026-08-23: บัญชีที่ยังไม่เปิดร้าน 48 คน (46 ไม่มีรหัสผ่าน · 35 มีแต่ AuthAccount
 * ชนิด PHONE) เข้าฝั่งผู้ขายไม่ได้เลยสักทาง — login โดนด่านนี้ ส่วน sign-up โดนด่านเบอร์ซ้ำ —
 * และคนที่ถูกเชิญเป็นพนักงาน (accept invite ไม่ set `isShop` โดยเจตนา) ก็โดนด้วยมาตลอด
 *
 * เหตุผลที่ต้องเป็นด่าน ไม่ใช่คอมเมนต์: บรรทัด `if (!user.isShop) return null` อ่านแล้ว
 * "ดูปลอดภัยกว่า" เสมอสำหรับคนที่มาทีหลังและไม่รู้ที่มา — และการเติมกลับจะเงียบสนิท
 * (ผู้ใช้เห็นแค่ "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" ทั้งที่กรอกถูก จึงไม่มีใครรายงานว่าเป็นบั๊ก)
 */

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกตามกฎคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย (บทเรียน HR9) */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

/**
 * ตัดเอาเฉพาะตัว provider ที่ระบุ — ห้ามสแกนทั้ง `auth.ts` เพราะคำว่า `isShop` มีอยู่ที่อื่น
 * โดยชอบธรรม (session/jwt callback select คอลัมน์นี้ไปแสดงผล) ⇒ สแกนทั้งไฟล์จะแดงตลอดกาล
 */
function providerBlock(src: string, id: string): string {
  const start = src.indexOf(`id: "${id}"`)
  expect(start, `หา provider ${id} ใน auth.ts ไม่เจอ — เปลี่ยนชื่อ id แล้วต้องแก้เทสนี้ด้วย`).toBeGreaterThan(-1)
  const next = src.indexOf('CredentialsProvider({', start)
  return src.slice(start, next === -1 ? src.length : next)
}

describe('เข้าฝั่งผู้ขายด้วยรหัสผ่าน — ห้ามบังคับว่าต้องมีร้านก่อน', () => {
  const auth = stripComments(read('src/lib/auth.ts'))
  const seller = providerBlock(auth, 'seller-credentials')

  it('[blocker] seller-credentials ห้ามมีด่าน isShop', () => {
    /**
     * การเข้าถึง "ร้าน" ถูกกั้นด้วย activeShopId + membership ที่ jwt callback และ layout อยู่แล้ว
     * (`(dashboard)/layout.tsx` → `if (!active) redirect('/choose-shop')`) ไม่ใช่ที่ธงใบนี้ —
     * คนที่ไม่มีร้านล็อกอินเข้ามาจึงไม่มีอะไรให้แตะ นอกจากกด "เปิดร้านของฉัน"
     */
    expect(seller, 'seller-credentials ต้องไม่ตัดสินจาก user.isShop').not.toMatch(/\bisShop\b/)
  })

  it('[blocker] ด่านที่ยังต้องอยู่ครบ — admin / บัญชีที่ถูกลบ / ไม่มีรหัสผ่าน', () => {
    // กันการ "ลบด่านทั้งยวง" ไปพร้อมกับด่าน isShop
    expect(seller, 'admin ต้องใช้ provider แยก').toMatch(/if \(user\.isAdmin\) return null;/)
    expect(seller, 'บัญชีที่ถูกลบต้องถูกปฏิเสธเงียบ ๆ').toMatch(/if \(isDeletedUser\(user\)\) return null;/)
    expect(seller, 'ไม่มี passwordHash = ล็อกอินด้วยรหัสผ่านไม่ได้').toMatch(
      /if \(user\.passwordHash == null\) return null;/,
    )
    expect(seller, 'ต้องยังเทียบรหัสผ่านจริง').toMatch(/verifyPassword\(/)
  })

  it('[blocker] ปลายทางของคนที่ล็อกอินได้แต่ยังไม่มีร้าน ต้องยังมีอยู่', () => {
    /**
     * ถอด `/choose-shop` ออกเมื่อไร ด่านข้างบนจะกลายเป็นการปล่อยให้คนไม่มีร้านเข้ามาค้างกลางอากาศ
     * — สองอย่างนี้ต้องอยู่หรือไปพร้อมกันเสมอ
     */
    const dashboardLayout = stripComments(read('src/app/(paces)/seller/(dashboard)/layout.tsx'))
    expect(dashboardLayout).toMatch(/redirect\('\/choose-shop'\)/)
  })
})
