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
import { readFileSync, readdirSync } from 'node:fs'
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

describe('[blocker] ทุกที่ที่มีปุ่ม Apple ต้องใช้แผ่นของระบบ — ไล่เอง ไม่ใช้รายชื่อ', () => {
  /**
   * 🛑 **ด่านนี้เกิดจากความผิดพลาดจริงของรอบ 2026-09-27**
   *
   * ตอนไล่ขอบเขตของ Guideline 4 ผมนับ "หน้าที่มีฟอร์มล็อกอิน" ได้ **2 หน้า** แล้วเขียนลง
   * เอกสารว่า *"ขอบเขต — 2 จุด ไม่ใช่จุดเดียว"* · ของจริงมี **3 ที่** เพราะเกณฑ์ที่ถูกคือ
   * **"ปุ่มล็อกอินเจ้าอื่นอยู่ที่ไหน"** ไม่ใช่ "หน้าไหนเป็นหน้าล็อกอิน" — ที่ที่หลุดคือหน้า
   * รับคำเชิญ `/i/[slug]` ซึ่ง **เขียนเหตุผลของ Guideline 4.8 ไว้เองบนโค้ดที่ละเมิด
   * Guideline 4 อยู่** และผ่านทุก gate มาได้เพราะ `signIn('apple')` ถูกทุกตัวอักษร
   *
   * ⇒ ด่านนี้จึง **ค้นหาไฟล์เอง** จากโลโก้ Apple ที่ต้องมีบนปุ่มทุกปุ่ม (`bxl:apple`)
   * ห้าม hardcode รายชื่อไฟล์ เพราะรายชื่อที่คนเขียนคือสิ่งที่พลาดมาแล้ว
   * (คลาสเดียวกับด่านของ `useListBusy` ที่สแกนผู้เรียกทั้ง `src/` แทนการไล่ชื่อ)
   */
  /* 🛑 เดินโฟลเดอร์ด้วย fs ไม่ใช่เรียก `rg` — runner ของ CI ไม่มี ripgrep ติดตั้ง
     (ร่างแรกใช้ `rg` แล้ว `spawnSync ENOENT` ⇒ ทั้งบล็อกล้มก่อนตรวจอะไรเลย) */
  const surfaces = readdirSync(join(ROOT, 'src/app'), { recursive: true, encoding: 'utf8' })
    .filter((rel) => rel.endsWith('.tsx'))
    .map((rel) => join('src/app', rel))
    .filter((rel) => readFileSync(join(ROOT, rel), 'utf8').includes('bxl:apple'))

  it('🛑 ต้องเจอทุกที่ที่มีปุ่ม Apple — เจอน้อยกว่า 3 ที่แปลว่าตัวค้นหาพัง ไม่ใช่ว่าของหาย', () => {
    /* ถ้า rg หาไม่เจอ (เปลี่ยนวิธีวางโลโก้/ย้ายโฟลเดอร์) ด่านทั้งบล็อกจะเงียบและผ่านฟรี
       — ซึ่งคือรูปร่างของ "ด่านที่ไม่มีใครเรียก" ที่โปรเจกต์นี้เจอซ้ำมาหลายรอบ */
    expect(surfaces.length, `เจอ ${surfaces.length} ไฟล์: ${surfaces.join(', ')}`).toBeGreaterThanOrEqual(3)
  })

  for (const rel of surfaces) {
    it(`🛑 ${rel.split('/').pop()} — ต้องลองแผ่นของระบบก่อน และห้ามเปิดหน้าเว็บ Apple จากในแอป`, () => {
      const src = code(rel)
      expect(src, 'ไม่เคยเช็คว่าอยู่ในแอปไหม = พาไปหน้าเว็บของ Apple ทุกครั้ง').toMatch(
        /canUseAppleNative\(/,
      )

      /**
       * 🛑 **ต้องหา "จุดที่เรียก" ไม่ใช่ occurrence แรกของชื่อ — บรรทัด `import` ก็ match**
       *
       * ร่างแรกใช้ `src.indexOf('canUseAppleNative(')` ซึ่งไปเจอบรรทัด import ของ
       * `ConnectedAccountsClient` ⇒ **ด่านผ่านฟรีไม่ว่าไฟล์นั้นทำอะไร** (mutation ที่ถอดการแก้
       * ของรอบนี้ออก ยังเขียว 2 ครั้ง) — ซ้ำรอยเดิมที่รีโปนี้เขียนเตือนตัวเองไว้แล้วใน
       * `docs/conventions/rule-must-be-enforced-not-described.md`
       */
      const lines = src.split('\n')
      /**
       * 🛑 **ต้องจับ "บรรทัดที่ตัดสินใจ" ไม่ใช่ทุกที่ที่ชื่อนี้โผล่**
       *
       * `ConnectedAccountsClient` มี `canUseAppleNative()` **2 ที่**: ตัวที่อ่านความสามารถ
       * เก็บใส่ state (`const read = () => setAppleNativeAvailable(canUseAppleNative(window))`)
       * กับตัวที่เป็นเงื่อนไขของสาขาจริง (`if (provider === 'apple' && canUseAppleNative(...))`)
       * ตัวแรกอยู่ก่อนในไฟล์ ⇒ ด่านรุ่นก่อนไปตัดบล็อกผิดก้อนแล้วแดงทั้งที่โค้ดถูก
       * (เจอตอนเพิ่มปุ่ม "เชื่อมในแอป" 2026-09-30)
       *
       * เกณฑ์: บรรทัดนั้นต้องเป็น `if (...)` หรือ `const x = canUseAppleNative(...)`
       * ซึ่งเป็นสองรูปเดียวที่ใช้ตัดสินใจจริงในรีโปนี้
       */
      const callLine = lines.findIndex(
        (ln) =>
          ln.includes('canUseAppleNative(') &&
          !/^\s*import\b/.test(ln) &&
          (/\bif\s*\(/.test(ln) || /^\s*const\s+\w+\s*=\s*canUseAppleNative\(/.test(ln)),
      )
      expect(
        callLine,
        'ไม่มีบรรทัดไหนใช้ canUseAppleNative ตัดสินใจเลย = มีแต่ import หรือเก็บค่าไว้เฉย ๆ',
      ).toBeGreaterThan(-1)

      /**
       * 🛑 **ตัดขอบสาขาด้วยการนับปีกกา ไม่ใช่ "ตัดถึงบรรทัดที่เรียกทางเว็บ"**
       *
       * ร่างที่สองตัดจากจุดเรียกไปจนถึง `signIn(...)` ซึ่ง **กินโค้ดที่อยู่นอกสาขาเข้ามาด้วย**
       * (ใน `/account` มีบล็อกเตรียมคุกกี้ link-intent คั่นอยู่ และมันมี `return` ของตัวเอง
       * ที่เยื้องเท่ากันพอดี) ⇒ mutation ที่ถอด `return` ของสาขาในแอปออก **ยังเขียว**
       * เพราะด่านไปเจอ `return` ของบล็อกอื่น — พิสูจน์ได้ตอนสั่งพิมพ์ค่าที่ด่านคำนวณจริงออกมาดู
       * ไม่ใช่ตอนอ่านโค้ดด่าน (`mutation-silence-means-weak-corpus.md`)
       */
      const openLine = lines.findIndex((ln, i) => i >= callLine && ln.trimEnd().endsWith('{'))
      expect(openLine, 'หาจุดเปิดบล็อกของสาขา "อยู่ในแอป" ไม่เจอ').toBeGreaterThan(-1)

      const head = lines.slice(0, openLine).reduce((n, ln) => n + ln.length + 1, 0)
      const openAt = head + lines[openLine].lastIndexOf('{')
      let depth = 0
      let closeAt = -1
      for (let i = openAt; i < src.length; i++) {
        if (src[i] === '{') depth++
        else if (src[i] === '}' && --depth === 0) {
          closeAt = i
          break
        }
      }
      expect(closeAt, 'ปีกกาไม่สมดุล — ตัดขอบสาขาไม่ได้').toBeGreaterThan(openAt)
      const branch = src.slice(openAt + 1, closeAt)

      /**
       * 🛑 ทางเว็บมี **2 รูปเขียน** — `signIn('apple', …)` (หน้าล็อกอิน/หน้ารับคำเชิญ) และ
       * `signIn(provider, …)` (การ์ดเชื่อมบัญชีที่วนทุกเจ้าในลิสต์เดียว)
       * ด่านที่มองหารูปเขียนเดียวคือด่านที่เว้นช่องไว้ให้รูปเขียนที่สอง
       */
      expect(
        branch,
        'เปิดหน้าเว็บของ Apple จากในสาขา "อยู่ในแอป" = Guideline 4 กลับมา',
      ).not.toMatch(/signIn\((?:'apple'|provider)/)

      /**
       * 🛑 **คำสั่งสุดท้ายของสาขาต้องเป็น `return`** — ไม่ใช่ "มี return อยู่ที่ไหนก็ได้"
       *
       * เกณฑ์ที่ถูกคือ *"ไม่มีทางไหลออกจากสาขานี้ไปเปิดหน้าเว็บของ Apple"* · เช็คว่ามี `return`
       * สักตัวจะถูกหลอกด้วย `return` ของเคสอื่น (`done`/`cancelled`) ที่มีอยู่แล้วเสมอ
       */
      expect(
        branch.trimEnd().endsWith('return'),
        `คำสั่งสุดท้ายของสาขาในแอปไม่ใช่ return ⇒ ไหลลงไปเปิดหน้าเว็บของ Apple ต่อ (ลงท้ายด้วย: ${JSON.stringify(branch.trimEnd().slice(-60))})`,
      ).toBe(true)
    })
  }
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
