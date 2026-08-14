/**
 * [blocker] `useT()`/`useLocale()` ต้องอยู่ในไฟล์ที่มี 'use client' เท่านั้น — และ getT() ห้ามอยู่ในไฟล์ client
 *
 * ที่มา (prod ล่ม 2026-08-14 18:29 น. — user เจอเอง): หน้าแรกผู้ขาย `seller.deepthailand.app`
 * ตอบ 500 ทั้งหน้าให้ทุกคน ตั้งแต่วินาทีที่ `873a63a6` ขึ้น prod (17:48 น.)
 *   Error: Attempted to call useT() from the server but useT is on the client.
 *   digest: '1923900057'
 * ต้นเหตุ: คอมมิตนั้นต่อสาย i18n เข้า `CompactHero.tsx` ด้วย `useT()` (client hook) ทั้งที่ไฟล์นั้น
 * เป็น **RSC** มาแต่ไหนแต่ไร — หัวไฟล์ของ `AccountSwitcherLauncher.tsx` เขียนเหตุผลไว้ตรงตัวว่า
 * "ทำไมเป็น client component แยก: CompactHero เป็น RSC" ⇒ ความรู้มีอยู่ในโฟลเดอร์เดียวกันแล้ว
 * แต่ไม่มีอะไรบังคับ (`docs/conventions/rule-must-be-enforced-not-described.md`)
 *
 * 🛑 ไม่มี gate ไหนของโปรเจกต์จับได้เลย — คอมมิตนั้นพิสูจน์ไว้เองว่า `tsc` 0 · `next build` exit 0 ·
 * vitest 2809 เขียว. เพราะชนิดถูกทุกตัวอักษร (client reference มี type ของ hook จริง) และหน้านี้เป็น
 * dynamic (อ่าน session) ⇒ **ไม่มีอะไรลองเรนเดอร์มันตอน build** ความผิดพลาดจึงโผล่ตอน render
 * บนเครื่องจริงเท่านั้น = ผู้ใช้เป็นคนเจอเสมอ
 *
 * ทางที่ถูกมีอยู่แล้วและพี่น้องในโฟลเดอร์เดียวกันใช้อยู่: `getT()` จาก `@/i18n/server`
 * (`OrderStatusBand` · `StatisticCard` · `ActivityTimeline` · `TopSellingProducts`)
 *
 * แดง = มีคนต่อสาย client hook เข้า server component (หรือทิศกลับ) อีกครั้ง
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name !== 'node_modules') walk(full, out)
    } else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) {
      out.push(full)
    }
  }
  return out
}

/**
 * 🛑 ตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ทำ *ถูก* คือไฟล์ที่เขียนคำเตือนของกฎนี้ไว้ด้วย
 * (`src/lib/customer-behavior.ts` · `customer-file-library.ts` · `(paces)/layout.tsx` ทั้งสาม
 *  พูดถึง `useT()` ในคอมเมนต์เพื่ออธิบายว่าทำไมถึง *ไม่* เรียกมัน) ⇒ สแกนดิบจะแดงค้างตลอดกาล
 * จากคำเตือนของตัวเอง แล้วถูกบันทึกเป็น "หนี้" ทั้งที่ไม่มีการละเมิดเลย — เกิดมาแล้วกับ grep gate
 * ของ HR9 เมื่อ 2026-08-02→03 และกับด่านของ Sign in with Apple เมื่อ 2026-08-12
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return !t.startsWith('//') && !t.startsWith('*')
    })
    .join('\n')
}

/** directive ต้องเป็นสตริงลอยของตัวเอง ไม่ใช่คำว่า use client ที่โผล่กลางโค้ด */
function hasUseClient(src: string): boolean {
  return /^\s*['"]use client['"]\s*;?\s*$/m.test(src)
}

/** การ "เรียก" hook — ไม่นับบรรทัด import ที่แค่พาชื่อเข้ามา */
const CALLS_CLIENT_HOOK = /(?<!\.)\buse(?:T|Locale)\s*\(/
const IMPORTS_SERVER_I18N = /from\s+['"]@\/i18n\/server['"]/

describe('เส้น client/server ของ i18n', () => {
  const files = walk('src')

  it("ไฟล์ที่เรียก useT()/useLocale() ต้องมี 'use client'", () => {
    const offenders = files.filter((f) => {
      const src = stripComments(readFileSync(f, 'utf8'))
      return CALLS_CLIENT_HOOK.test(src) && !hasUseClient(src)
    })
    expect(
      offenders,
      "server component เรียก client hook ไม่ได้ — ใช้ `const t = await getT()` จาก '@/i18n/server' แทน",
    ).toEqual([])
  })

  it("ไฟล์ที่มี 'use client' ต้องไม่ import @/i18n/server", () => {
    const offenders = files.filter((f) => {
      const src = stripComments(readFileSync(f, 'utf8'))
      return hasUseClient(src) && IMPORTS_SERVER_I18N.test(src)
    })
    expect(offenders, "client component ใช้ `useT()` จาก '@/i18n/LocaleProvider' แทน").toEqual([])
  })

  it('ทางที่ถูกยังอยู่ครบทั้งสองฝั่ง (ถ้าย้าย/เปลี่ยนชื่อ ด่านข้างบนจะกลายเป็นด่านเปล่า)', () => {
    expect(readFileSync('src/i18n/server.ts', 'utf8')).toMatch(/export async function getT\(/)
    expect(readFileSync('src/i18n/LocaleProvider.tsx', 'utf8')).toMatch(/export function useT\(/)
  })
})
