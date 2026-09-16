/**
 * [blocker] กดปุ่มล็อกอินครั้งแรกแล้วต้องไม่ "ไม่เกิดอะไรขึ้น" (แก้ 2026-09-16)
 *
 * ## อาการจริง
 *
 * ลบแอปแล้วติดตั้งใหม่ → เปิดครั้งแรก → กด Sign in with Apple → **เงียบสนิท**
 * ต้องกดครั้งที่สองถึงไป · **คนตรวจของ Apple ทำท่านี้เป๊ะทุกครั้ง** (ติดตั้งจาก TestFlight
 * แล้วกดล็อกอินทันที) ⇒ นี่คือรูปร่างของการถูกตีกลับข้อ 2.1(a)
 *
 * ## สองสาเหตุที่ปิดด้วยกลไกเดียว
 *
 * 1. **ยังไม่ hydrate** — เปลือกแอปเอา skeleton ออกตอน `onLoadEnd` ซึ่งเกิดก่อน React
 *    ผูก `onClick` เสร็จ ⇒ เห็นปุ่มแต่ไม่มีใครรับการกด
 * 2. **คุกกี้ CSRF ยังไม่ถูกสร้าง** — ไม่มี `SessionProvider` และไม่มีใครเรียก
 *    `getCsrfToken()` ⇒ คุกกี้เกิดตอนกดปุ่มพอดี แล้ว POST ตามมาทันที · ไม่ทันก็เด้งกลับ
 *    หน้าเดิมเงียบ ๆ (`next-auth/core/index.js:242` → `/signin?csrf=true`)
 *
 * `useEffect` ทำงาน = hydrate เสร็จแน่นอน · เปิดปุ่มหลัง `getCsrfToken()` จบ = คุกกี้พร้อม
 *
 * 🛑 เทสนี้สแกนซอร์สเพราะรีโปไม่มี jsdom — จับ "กลไกหายไป" ได้ ซึ่งคือสิ่งที่พังจริง
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { th } from '@/i18n/dictionaries/th'
import { en } from '@/i18n/dictionaries/en'

const ROOT = process.cwd()
const FORM = 'src/app/(paces)/seller/auth/sign-in/components/SignInForm.tsx'
const NOTICE = 'src/app/(paces)/seller/auth/sign-in/components/OAuthErrorNotice.tsx'

/** ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนี้ไว้ด้วย */
const code = (rel: string) =>
  readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('[blocker] ปุ่มล็อกอินต้องไม่ตายเงียบตอนกดครั้งแรก', () => {
  const form = code(FORM)

  it('🛑 ต้องอุ่นคุกกี้ CSRF ตอนเปิดหน้า ไม่ใช่รอให้สร้างตอนกดปุ่ม', () => {
    expect(form, 'ไม่เรียก getCsrfToken = คุกกี้เกิดตอนกดพอดี แล้วชนกับ POST ของตัวเอง').toMatch(
      /getCsrfToken\(\)/,
    )
    expect(form, 'ต้องอยู่ใน useEffect (= ทำงานหลัง hydrate)').toMatch(/useEffect\(/)
  })

  it('🛑 ต้องเปิดปุ่มแม้การอุ่นคุกกี้ล้ม — ไม่งั้นเน็ตสะดุด = ล็อกอินไม่ได้ทั้งหน้า', () => {
    expect(
      /\.finally\(/.test(form),
      'ใช้ .then อย่างเดียว = ล้มแล้วปุ่มค้างปิดตลอดกาล ซึ่งแย่กว่าอาการเดิม',
    ).toBe(true)
  })

  it('🛑 ปุ่ม OAuth ทุกปุ่มต้องถูกปิดจนกว่าจะพร้อม', () => {
    const handlers = ['handleApple', 'handleFacebook', 'handleLine', 'handleInstagram']
    for (const h of handlers) {
      const i = form.indexOf(`onClick={${h}}`)
      expect(i, `ไม่พบปุ่ม ${h}`).toBeGreaterThan(-1)
      /* ดูเฉพาะช่วงสั้น ๆ หลัง onClick — กันไปแมตช์ disabled ของปุ่มอื่น */
      expect(
        form.slice(i, i + 120),
        `ปุ่ม ${h} ยังกดได้ก่อนหน้าพร้อม = ตายเงียบเหมือนเดิม`,
      ).toContain('disabled={!oauthReady}')
    }
  })

  it('ปุ่มที่ยังกดไม่ได้ต้องดูออกด้วยตา ไม่ใช่ดูเหมือนปกติทุกประการ', () => {
    expect(form, 'ไม่มีสไตล์ตอน disabled = ผู้ใช้ไม่รู้ว่าทำไมกดไม่ติด').toContain(
      'disabled:opacity-60',
    )
  })
})

describe('[blocker] ถ้ายังพลาด ต้องไม่เงียบ', () => {
  it('🛑 ต้องอ่าน `?csrf=true` ที่ next-auth เด้งกลับมา', () => {
    expect(
      code(NOTICE),
      'ไม่มีใครอ่าน = ผู้ใช้เห็นแค่ "กดแล้วไม่ไปไหน" เหมือนเดิมทุกประการ',
    ).toContain("get('csrf')")
  })

  it('🛑 มีข้อความทั้งไทยและอังกฤษ และต้องบอกให้กดอีกครั้ง', () => {
    for (const msg of [th.auth.signIn.oauthError.csrfNotReady, en.auth.signIn.oauthError.csrfNotReady]) {
      expect(msg.trim().length).toBeGreaterThan(0)
      expect(msg, `ต้องบอกทางออก: ${msg}`).toMatch(/อีกครั้ง|again/i)
    }
  })

  it('ห้ามโยนศัพท์เทคนิคใส่ผู้ใช้', () => {
    for (const msg of [th.auth.signIn.oauthError.csrfNotReady, en.auth.signIn.oauthError.csrfNotReady]) {
      for (const jargon of ['CSRF', 'csrf', 'token', 'cookie', 'hydrate']) {
        expect(msg, `หลุดคำว่า ${jargon}: ${msg}`).not.toContain(jargon)
      }
    }
  })
})
