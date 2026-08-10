import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import fg from 'fast-glob'

/**
 * ด่านกันของหลุดกลับ — App Store Guideline 3.1.1 (rejection 2026-08-04)
 *
 * 🛑 ทำไมต้องเป็นเทสสแกนไฟล์ ไม่ใช่เทสพฤติกรรมธรรมดา:
 *
 * แอปผู้ขายเป็น **WebView ที่โหลดเว็บสด** — ถ้ามีคนเผลอเพิ่มปุ่ม/ลิงก์ที่พาไปจ่ายเงินกลับเข้ามา
 * บนเว็บ **มันจะโผล่ในแอปทันทีโดยไม่ต้องอัปเดตแอปเลย** ต่างจากแอป native ปกติที่ของใหม่จะโผล่
 * ก็ต่อเมื่อผ่านรีวิวรอบใหม่ ความเสี่ยงจึงสูงกว่ามาก และโทษของการ "ผ่านแล้วมีของโผล่ทีหลัง"
 * หนักกว่าโดนปฏิเสธตั้งแต่แรก (Apple เรียกว่า bait and switch — หนักสุดคือปิดบัญชีนักพัฒนา)
 *
 * เทสนี้จึงบังคับว่า: ทุกไฟล์ในโซนผู้ขายที่มีลิงก์ไปหน้าจ่ายเงิน **ต้องรู้จัก hidePayments**
 * ไม่ทางใดก็ทางหนึ่ง — ผ่าน prop, ผ่าน hook, หรืออยู่หลัง guard ที่ redirect ทิ้งไปแล้ว
 *
 * ถ้าเทสนี้แดง: อย่าเพิ่ม path ลง allow-list มั่ว ๆ ให้ไปดูก่อนว่าจุดนั้นเข้าถึงได้จากในแอปไหม
 * ถ้าเข้าถึงได้ ต้องซ่อนจริง ไม่ใช่ปิดปากเทส
 */

const SELLER_DIR = join(process.cwd(), 'src/app/(paces)/seller')

/** ลิงก์ที่พาไปหน้าจ่ายเงินโดยตรง */
const PAYMENT_LINK = /href=["'{`]?\s*['"`]?\/(wallet|business|subscriptions)\b/

/**
 * ไฟล์ที่อยู่ "หลังด่าน" อยู่แล้ว — เข้าถึงจากในแอปไม่ได้เลยเพราะหน้าที่ครอบมัน redirect ทิ้ง
 * ก่อนจะ render (ดู guard `shouldHidePayments()` ที่หัวไฟล์ page.tsx ของแต่ละหน้า)
 *
 * 🛑 เพิ่มรายการที่นี่ได้เฉพาะเมื่อพิสูจน์แล้วว่า **หน้าที่ครอบมันมี guard จริง** — ไม่ใช่เพราะ
 * "คิดว่าคงไม่มีใครเข้าถึง"
 */
const BEHIND_ROUTE_GUARD = [
  'seller/(dashboard)/business/',      // /business → redirect('/dashboard')
  'seller/(dashboard)/subscriptions/', // /subscriptions → redirect('/dashboard')
  'seller/(dashboard)/inventory/',     // /inventory → redirect เมื่อยังไม่สมัคร; การ์ด upsell ซ่อนด้วย hidePayments
  'seller/(dashboard)/wallet/',        // /wallet → ปุ่ม/โมดัล/ตารางคำขอ ซ่อนด้วย hidePayments
]

/**
 * สำนวน guard ที่ยอมรับ — ต้องมี "การตัดสินใจ" อยู่ในไฟล์จริง ไม่ใช่แค่เอ่ยถึงชื่อตัวแปร
 *
 * 🛑 เดิมเทสนี้เช็คแค่ว่าไฟล์ "มีคำว่า hidePayments ไหม" ซึ่งอ่อนเกินไป — พิสูจน์ด้วย mutation
 * แล้วพบว่าถอด `{!hidePayments && (` ออกจาก CompactHero ทิ้ง เทสยังเขียวอยู่ เพราะคำว่า
 * hidePayments ยังเหลือใน type กับ destructure. ด่านที่ผ่านตลอดคือด่านที่ไม่มีอยู่จริง
 */
const GUARD_IDIOMS = [/!hidePayments/, /hidePayments \?/]

function relative(file: string): string {
  return file.replace(process.cwd() + '/src/app/(paces)/', '')
}

describe('ห้ามมีทางไปจ่ายเงินที่หลุด hidePayments (App Store 3.1.1)', () => {
  const files = fg.sync(['**/*.tsx'], { cwd: SELLER_DIR, absolute: true })

  it('มีไฟล์ให้สแกนจริง (กันเทสผ่านเพราะหาไฟล์ไม่เจอ)', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('[blocker] ทุกไฟล์ที่ลิงก์ไปหน้าจ่ายเงิน ต้องรู้จัก hidePayments หรืออยู่หลัง guard', () => {
    const offenders: string[] = []

    for (const file of files) {
      const rel = relative(file)
      if (BEHIND_ROUTE_GUARD.some((p) => rel.startsWith(p))) continue
      const src = readFileSync(file, 'utf8')
      if (!PAYMENT_LINK.test(src)) continue
      if (GUARD_IDIOMS.some((re) => re.test(src))) continue

      offenders.push(rel)
    }

    expect(offenders).toEqual([])
  })
})
