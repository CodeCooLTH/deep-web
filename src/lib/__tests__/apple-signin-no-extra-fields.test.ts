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
/**
 * 🛑 ย้ายไฟล์ 2026-08-25 — `register/page.tsx` กลายเป็น **เปลือก server** ที่กั้นฟอร์มไม่ให้
 * โผล่ในแอป iOS (Apple Guideline 3.1.1) ส่วน **ตัวฟอร์มจริงย้ายมาที่นี่** ไม่ได้แก้ตรรกะข้างใน
 *
 * ด่านต้องตามไปที่ไฟล์ที่ *มีฟอร์มอยู่จริง* ไม่ใช่ค้างที่ชื่อไฟล์เดิม — ถ้าค้าง มันจะสแกน
 * เปลือกเปล่า ๆ ที่ไม่มีช่องกรอกสักช่อง แล้ว **เขียวตลอดกาลโดยไม่ได้กันอะไรเลย**
 * (ด่านที่ผูกกับ path พังเงียบตอน refactor — อันตรายกว่าแดง เพราะไม่มีใครรู้ว่ามันตายไปแล้ว)
 */
const REL = 'src/app/(paces)/seller/register/RegisterClient.tsx'

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

  it('[blocker] ต้องซ่อนเป็น "ค่าตั้งต้น" และโชว์กลับเฉพาะตอนยืนยันแล้วว่าใช้ไม่ได้', () => {
    /**
     * 🛑 **ข้อนี้เคยเขียนกลับด้าน และนั่นคือเหตุผลที่ Apple ตีกลับซ้ำ**
     *
     * ของเดิมบังคับให้เป็น `isApple && uStatus === 'ok'` ⇒ `uStatus` เริ่มที่ `'idle'` ⇒
     * **เฟรมแรกช่อง "ชื่อผู้ใช้" โผล่เต็มตา** แล้วค่อยหายหลัง fetch กลับมา และถ้า fetch ล้ม
     * (`.catch` ตั้งกลับเป็น `'idle'`) ช่องค้างอยู่ตลอดไป — คนรีวิวของ Apple เห็นช่องนั้นจริง
     * แล้วตีกลับด้วยข้อความเดิมเป๊ะรอบที่สอง (2026-08-21) ทั้งที่แพตช์รอบแรกขึ้น prod แล้ว
     *
     * เทสตัวเดิม "เขียว" ตลอดเพราะมันปักหมุด **สตริงของโค้ด** ไม่ใช่ **พฤติกรรม** —
     * เป็นคลาสเดียวกับที่รีโปนี้เจอมาแล้ว: เทสที่ยืนยันพฤติกรรมที่เป็นบั๊กให้เขียวต่อไป
     *
     * เจตนาเดิมยังถูกและต้องรักษาไว้: ถ้าชื่อที่ระบบตั้งให้ใช้ไม่ได้จริง (บัญชีค้างถือไว้ —
     * เคส 2026-08-15) **ต้องโชว์ช่องกลับมา** ไม่ใช่ปล่อยให้กดถัดไปไม่ได้เงียบ ๆ
     * ⇒ ตอนนี้บังคับ 2 อย่างคู่กันแทน: ซ่อนไว้ก่อน + ปุ่มถัดไปต้องไม่ผูกกับช่องที่ซ่อนอยู่
     */
    const c = code()
    const line = c.split('\n').find((l) => l.includes('const hideUsername ='))
    expect(line, 'ไม่เจอบรรทัด hideUsername').toBeDefined()

    expect(line, 'ห้ามกลับไปผูกกับ uStatus === ok (ช่องจะโผล่หนึ่งจังหวะก่อนหาย)').not.toMatch(
      /uStatus === 'ok'/,
    )
    expect(line, 'ต้องโชว์กลับเมื่อชื่อซ้ำ').toMatch(/uStatus !== 'taken'/)
    expect(line, 'ต้องโชว์กลับเมื่อชื่อผิดกติกา').toMatch(/uStatus !== 'invalid'/)

    const guard = c.split('\n').find((l) => l.includes('กรุณาตั้งชื่อผู้ใช้ที่ใช้ได้'))
    expect(guard, 'ไม่เจอด่านของปุ่มถัดไป').toBeDefined()
    expect(guard, 'ห้ามบล็อกปุ่มถัดไปด้วยสถานะของช่องที่ผู้ใช้มองไม่เห็น').toMatch(/!hideUsername/)
  })

  it('[blocker] ห้ามมีช่องกรอกชื่อจริงหรืออีเมลในหน้านี้', () => {
    /**
     * `displayName` ต้องมาจาก provider เสมอ (`user.displayName`) — ถ้าวันหนึ่งมีคนเพิ่ม
     * ช่องให้กรอกเอง จะกลับไปผิดข้อเดิมทันที
     */
    const c = code()
    /* 🛑 เดิมบังคับสตริง `(user.displayName || 'ร้านค้า')` ตรง ๆ ซึ่งล็อกบั๊กไว้อีกตัว:
       ผู้ใช้ Apple ทุกคน `displayName` เป็น `"User"` (ค่าสำรองใน signIn callback เพราะ Apple
       ไม่ได้ส่งชื่อมาทาง ID token) ⇒ ร้านที่สร้างจะชื่อ "User" บนหน้าสาธารณะที่ผู้ซื้อเห็น
       เจตนาที่ต้องรักษาคือ "ชื่อมาจาก provider ไม่ใช่จากช่องกรอก" — ไม่ใช่สตริงเฉพาะตัวนั้น */
    expect(c, 'ชื่อต้อง derive จาก session ไม่ใช่ state ของช่องกรอก').toMatch(
      /const realName = user\.displayName/,
    )
    expect(c, 'ต้องกรองค่าสำรอง "User" ทิ้ง ไม่ให้กลายเป็นชื่อร้าน/ข้อความบนจอ').toMatch(
      /user\.displayName !== 'User'/,
    )
    expect(c, 'ห้ามมี input ที่ผูกกับ state ชื่อจริง/อีเมล').not.toMatch(
      /value=\{(?:displayName|email|fullName)\}/,
    )
  })

  it('[blocker] ทั้งเส้นทางหลัง Apple ห้ามมีช่องกรอกชื่อคน', () => {
    /**
     * 🛑 ครอบ **ทั้งเส้นทาง** ไม่ใช่แค่หน้าแรก — คนที่ล็อกอิน Apple แล้วเดินต่อจะเจอ
     * `/register` → `/onboarding` ถ้าหน้าใดหน้าหนึ่งถามชื่อคน ก็ผิดข้อเดิมเหมือนกัน
     *
     * เกณฑ์ที่ใช้จับคือสัญญาณที่ชัดที่สุด 2 อย่างของ "ช่องกรอกชื่อคน":
     *   · `autoComplete="name"` — บอกเบราว์เซอร์ตรง ๆ ว่าช่องนี้คือชื่อคน
     *   · placeholder ที่เขียนว่า "ชื่อ-นามสกุล"
     *
     * ตัวอย่างของจริงที่มีอยู่ในรีโปและ **ต้องไม่หลุดเข้าเส้นทางนี้**:
     * `i/[slug]/components/PhoneAuthSteps.tsx` (สมัครด้วยเบอร์บนหน้าเชิญพนักงาน) มีช่อง
     * "ชื่อที่แสดง" ที่ใช้ทั้งสองสัญญาณ — ตรวจแล้วว่าอยู่คนละเส้นทาง (เลือก "สมัครด้วยเบอร์"
     * เท่านั้นถึงจะเจอ) แต่ถ้าวันหนึ่งมีคนย้ายมาใช้ร่วมกัน ด่านนี้จะจับได้ทันที
     */
    /* ชี้ไฟล์ที่มีฟอร์มจริง — `page.tsx` ของทั้งสองเป็นเปลือก server แล้ว (ดูหมายเหตุที่ REL) */
    const PATH = [
      'src/app/(paces)/seller/register/RegisterClient.tsx',
      'src/app/(paces)/seller/onboarding/OnboardingClient.tsx',
    ]
    const offenders: string[] = []
    for (const rel of PATH) {
      const c = blankComments(readFileSync(join(ROOT, rel), 'utf8'))
      if (/autoComplete="name"/.test(c)) offenders.push(`${rel} → autoComplete="name"`)
      if (/ชื่อ-นามสกุล/.test(c)) offenders.push(`${rel} → placeholder ชื่อ-นามสกุล`)
    }
    expect(offenders, 'ชื่อคนต้องมาจาก provider ไม่ใช่ให้ผู้ใช้กรอก').toEqual([])
  })
})
