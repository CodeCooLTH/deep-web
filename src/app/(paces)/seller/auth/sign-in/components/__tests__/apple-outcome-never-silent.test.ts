/**
 * [blocker] ทุกผลลัพธ์ของปุ่ม Apple ต้องเห็นได้บนจอ — ไม่ใช่ toast ที่หายเอง
 * (feature 00040 · ภาคผนวก 7 · แก้ 2.1(a) ตีกลับ 2026-09-27)
 *
 * ## อาการที่ Apple ตีกลับ
 *
 * *"no action took place"* — คนตรวจกด Sign in with Apple บน iPad แล้ว **จอไม่เปลี่ยนอะไรเลย**
 * ตรวจฐานข้อมูลยืนยันว่าทาง native ทำงานถูกทุกขั้นและปฏิเสธการสร้างบัญชีตามที่ Apple สั่ง
 * (ผู้ใช้ใหม่ 0 คนใน 6 ชม.) ⇒ **โค้ดถูก แต่ผู้ใช้ไม่มีทางรู้** เพราะคำตอบทุกแบบถูกส่งด้วย
 * `pacesToast` ซึ่งหายเองใน ~5 วินาที และตัวหน้าไม่เคยเปลี่ยนสภาพ
 *
 * ## 🛑 ทำไมเป็นเทสสแกนซอร์ส
 *
 * รีโปนี้ตั้ง `environment: "node"` และไม่มี jsdom ⇒ mount ฟอร์มนี้ในเทสไม่ได้
 * สแกนซอร์สจับได้แค่ "กลไกหายไป" ซึ่งเป็น**สิ่งที่พังจริงและถูกตีกลับจริง**
 * (ท่าเดียวกับ `first-tap-not-dead.test.ts` ในโฟลเดอร์นี้)
 *
 * 🛑 **ต้องตัดคอมเมนต์ก่อนสแกน** — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำอธิบายของกฎนั้นไว้ด้วย
 * (บทเรียนเดียวกับ grep gate ของ Hard Rule 9 ที่แดงค้างจากคำเตือนตัวเอง 2026-08-02→03)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { en } from '@/i18n/dictionaries/en'
import { th } from '@/i18n/dictionaries/th'

const ROOT = process.cwd()
const FORM = 'src/app/(paces)/seller/auth/sign-in/components/SignInForm.tsx'
const NOTICE = 'src/app/(paces)/seller/auth/sign-in/components/OAuthErrorNotice.tsx'

const code = (rel: string) =>
  readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('[blocker] ในแอป: ปุ่ม Apple ต้องบอกผลทุกทาง', () => {
  const form = code(FORM)
  /** ตัวเนื้อของสาขา "อยู่ในแอป" — กฎทั้งหมดของรอบนี้อยู่ในนี้ */
  const inApp = (() => {
    const at = form.indexOf('if (inApp) {')
    expect(at, 'หาสาขา "อยู่ในแอป" ไม่เจอ — ถ้าถูกถอด ทั้งไฟล์นี้ตรวจอะไรไม่ได้').toBeGreaterThan(-1)
    const web = form.indexOf("signIn('apple',", at)
    expect(web, 'หาทางถอยไปทางเว็บไม่เจอ').toBeGreaterThan(-1)
    return form.slice(at, web)
  })()

  it('🛑 กดแล้วต้องขึ้นสปินเนอร์ทันที + บอก AT ว่ากำลังทำงาน', () => {
    /* จอที่ไม่ขยับเลยหลังกด = คนตรวจสรุปว่าปุ่มเสีย ซึ่งคือคำที่เขาเขียนมาเป๊ะ ๆ */
    expect(form, 'ไม่มีสถานะ "กำลังทำงาน" = จอไม่ขยับตอนกด').toMatch(/setAppleBusy\(true\)/)
    expect(form, 'ไม่บอก assistive tech ว่ากำลังทำงาน').toMatch(/aria-busy=\{appleBusy\}/)
    expect(form, 'ไม่มีสปินเนอร์ในปุ่ม').toMatch(/appleBusy && \(/)
  })

  it('🛑 ผู้ใช้ปัดแผ่นทิ้ง → ต้องมีข้อความ ห้าม return เปล่า', () => {
    /**
     * เส้นทางที่ทีมรีวิวเดินมากที่สุด (เขาไม่อยากผูก Apple ID ส่วนตัวกับแอปที่กำลังตรวจ)
     * เดิม `return` เฉย ๆ ⇒ กดแล้วเงียบ ซึ่งแยกไม่ออกจาก "ปุ่มเสีย" ด้วยตาเปล่า
     */
    const at = inApp.indexOf("outcome.kind === 'cancelled'")
    expect(at, 'ไม่มีสาขารับ "ผู้ใช้ยกเลิก"').toBeGreaterThan(-1)
    const branch = inApp.slice(at, inApp.indexOf('}', at))
    expect(branch, 'ยกเลิกแล้วไม่มีอะไรขึ้นบนจอ = เงียบเหมือนเดิม').toMatch(/setAppleNotice\(/)
  })

  it('🛑 ทาง native ล้มเหลวในแอป → ต้องขึ้นข้อความ ห้ามถอยไปหน้าเว็บของ Apple', () => {
    /**
     * หน้า `appleid.apple.com` คือสิ่งที่ Apple เพิ่งยอมรับว่าเราเอาออกแล้ว (Guideline 4
     * ผ่านรอบ 27 ก.ย.) — เปิดกลับมาในแอปเมื่อไหร่ = เอาข้อที่แก้ผ่านแล้วไปแลกข้อที่กำลังแก้
     */
    expect(inApp, 'ยังถอยไป signIn(\'apple\') จากในแอป = Guideline 4 กลับมา').not.toMatch(
      /signIn\('apple'/,
    )
    /* และเส้นนั้นต้องมีคำตอบให้ผู้ใช้ ไม่ใช่ตกเงียบ */
    expect(inApp, 'ล้มเหลวแล้วไม่บอกอะไรเลย').toMatch(/appleUnavailable/)
    expect(inApp, 'ไม่ได้ชี้ทางออกที่ทำได้จริงบนหน้าเดียวกัน').toMatch(/useUsernameInstead/)
  })

  it('🛑 ทุกสาขาในแอปต้องลงเอยด้วย "มีอะไรเกิดขึ้น"', () => {
    /**
     * เกณฑ์ที่แข็งกว่าการไล่ทีละสาขา: ในสาขา "อยู่ในแอป" จำนวน `return` ต้องไม่มากกว่า
     * จำนวนการกระทำที่ผู้ใช้เห็นได้ (ขึ้นข้อความ · เปลี่ยนหน้า · พาเข้าระบบ)
     * ⇒ ใครเพิ่ม early-return เงียบ ๆ ในอนาคต ด่านนี้แดงทันทีโดยไม่ต้องรู้ชื่อสาขานั้น
     */
    const returns = inApp.match(/\breturn\b/g)?.length ?? 0
    const visible =
      (inApp.match(/setAppleNotice\(t\./g)?.length ?? 0) +
      (inApp.match(/router\.replace\(/g)?.length ?? 0) +
      (inApp.match(/goAfterLogin\(/g)?.length ?? 0) +
      (inApp.match(/setAppleNotice\(\s*\n?\s*`/g)?.length ?? 0)
    expect(visible, `มี return ${returns} ทาง แต่มีการกระทำที่เห็นได้ ${visible}`).toBeGreaterThanOrEqual(
      returns,
    )
  })

  it('🛑 ข้อความต้องค้างบนหน้า ไม่ใช่ toast ที่หายเอง', () => {
    /* คนตรวจอ่านจอช้ากว่า 5 วินาที และเขาถ่ายภาพหน้าจอส่งกลับมาเป็นหลักฐาน */
    expect(form, 'ไม่ได้ render appleNotice ลงหน้า = เก็บข้อความไว้ใน state เฉย ๆ').toMatch(
      /\{appleNotice && \(/,
    )
    expect(form, 'ไม่มี role ให้ screen reader ประกาศ').toMatch(/role="status"/)
  })
})

describe('[blocker] แถบผลลัพธ์ OAuth ต้องค้างบนจอด้วย', () => {
  const notice = code(NOTICE)

  it('🛑 ต้องมีแถบที่ค้างบนหน้า ไม่ใช่มีแต่ toast', () => {
    /**
     * ด่านเดิม (`oauth-error-surfaced.test.ts`) ปักไว้ว่าต้องมี `pacesToast.error()` —
     * ยังจริงและยังต้องมี (มันเรียกสายตาได้ทันที) แต่ **มีอย่างเดียวไม่พอ** เพราะมันหายเอง
     * ⇒ ต้องมีทั้งคู่ ไม่ใช่เลือกอย่าง
     */
    expect(notice, 'ถอด toast ออก = ไม่มีอะไรเรียกสายตาตอนโหลดหน้า').toMatch(/pacesToast\.error\(/)
    expect(notice, 'ไม่มีแถบค้าง = ข้อความหายไปก่อนคนตรวจอ่านจบ').toMatch(/role="alert"/)
  })

  it('🛑 เคส "Apple ID นี้ไม่มีบัญชีผู้ขาย" ต้องบอกทางออกที่ทำได้จริง', () => {
    /* ด่าน 3.1.1 ปฏิเสธการสมัครในแอปอย่างถูกต้อง — แต่การปฏิเสธที่ไม่บอกทางต่อ
       ผู้ใช้อ่านได้แค่ว่า "แอปเสีย" ซึ่งคือสิ่งที่ถูกรายงานกลับมาจริง */
    expect(notice).toMatch(/noSellerAccountInApp/)
    expect(notice).toMatch(/useUsernameInstead/)
  })
})

describe('[blocker] คำ 3 ชุดใหม่ต้องมีทั้งไทย/อังกฤษ และไม่โยนศัพท์เทคนิค', () => {
  const keys = ['useUsernameInstead', 'appleCancelled', 'appleUnavailable'] as const

  for (const key of keys) {
    it(`🛑 ${key} — มีครบสองภาษา ไม่ว่าง`, () => {
      for (const dict of [th, en]) {
        const msg = dict.auth.signIn.oauthError[key]
        expect(typeof msg, `${key} หายไปจากพจนานุกรม`).toBe('string')
        expect(msg.trim().length, `${key} ว่างเปล่า`).toBeGreaterThan(0)
      }
    })
  }

  it('ห้ามโยนศัพท์เทคนิคใส่ผู้ใช้', () => {
    for (const key of keys) {
      for (const dict of [th, en]) {
        const msg = dict.auth.signIn.oauthError[key]
        for (const jargon of ['native', 'token', 'nonce', 'API', 'fallback', 'OAuth']) {
          expect(msg, `หลุดคำว่า ${jargon}: ${msg}`).not.toContain(jargon)
        }
      }
    }
  })

  it('🛑 ข้อความตอนล้มเหลวต้องชี้ทางออก ไม่ใช่บอกแค่ว่าล้มเหลว', () => {
    /* "เข้าสู่ระบบด้วย Apple ไม่สำเร็จ" เฉย ๆ = ทางตัน · ต้องบอกว่าใช้ชื่อผู้ใช้/รหัสผ่านได้ */
    expect(th.auth.signIn.oauthError.useUsernameInstead).toMatch(/ชื่อผู้ใช้|รหัสผ่าน/)
    expect(en.auth.signIn.oauthError.useUsernameInstead).toMatch(/username|password/i)
  })
})
