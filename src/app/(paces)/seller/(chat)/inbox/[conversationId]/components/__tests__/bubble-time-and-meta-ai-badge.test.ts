// bubble-time-and-meta-ai-badge.test.ts — [blocker] กฎ UI ของ Task 7 (2026-09-14) ที่ไม่มีด่านอื่นจับได้
//
// 🛑 ทำไมต้องสแกนซอร์ส: vitest ตั้ง environment "node" (ไม่มี jsdom) และทั้ง 3 ข้อด้านล่าง
// ถูกต้องตามชนิดทุกตัวอักษรไม่ว่าจะเขียนผิดหรือถูก ⇒ tsc/build/eslint ผ่านหมด
//   (a) R20 — role="status" บน <button> เขียนทับ role ปุ่ม screen reader ไม่รู้ว่ากดได้
//   (b) R19 — data-message-bubble เป็น <div> (role generic) aria-label ถูกทิ้งเงียบ ๆ ⇒ ต้องมี
//       title (เมาส์) + sr-only (screen reader) ครบทั้ง 2 เส้นทางเรนเดอร์ (บับเบิลเดี่ยว + อัลบั้ม)
//   (c) ป้าย Meta AI ต้องเป็นไอคอน brand-meta และห้ามสี primary (One Voice — ไม่ใช่ของแอปเรา)
//
// 🛑 ตัดคอมเมนต์ก่อนสแกนเสมอ — ChatThread เขียนคำเตือนของกฎเหล่านี้ไว้ในคอมเมนต์ด้วย

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const CHAT_THREAD = 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx'

/** เดินทีละตัวอักษรพร้อมจำว่าอยู่ในสตริงไหม — regex เปล่า ๆ จะกิน `//` ใน URL ของสตริง */
function stripComments(src: string): string {
  let out = ''
  let i = 0
  let quote: string | null = null
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (quote) {
      if (c === '\\') {
        out += c + (next ?? '')
        i += 2
        continue
      }
      if (c === quote) quote = null
      out += c
      i += 1
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c
      out += c
      i += 1
      continue
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1
      i += 2
      out += '\n'
      continue
    }
    out += c
    i += 1
  }
  return out
}

const code = stripComments(readFileSync(join(process.cwd(), CHAT_THREAD), 'utf8'))

describe('[blocker] ChatThread — เวลาเต็มบนบับเบิล / ปุ่มข้อความใหม่ / ป้าย Meta AI', () => {
  it('(a) R20: ไม่มี role="status" บน <button>', () => {
    const offenders: string[] = []
    for (const hit of code.matchAll(/role="status"/g)) {
      const open = code.lastIndexOf('<', hit.index)
      if (/^<button\b/.test(code.slice(open))) offenders.push(code.slice(open, hit.index + 13))
    }
    expect(offenders).toEqual([])
  })

  it('(b) R19: ทั้ง 2 เส้นทาง data-message-bubble มี title + sr-only "ส่งเมื่อ" ด้วย formatDateTimeTH', () => {
    const hits = [...code.matchAll(/<div\s+data-message-bubble\b/g)]
    expect(hits.length).toBe(2)
    for (const hit of hits) {
      const rest = code.slice(hit.index)
      // ปลายแท็กเปิด = `>` ตัวแรกที่ไม่ใช่ `=>`
      const tagEnd = rest.search(/[^=]>/) + 1
      const openTag = rest.slice(0, tagEnd)
      expect(openTag).toMatch(/title=\{formatDateTimeTH\(/)
      // sr-only ต้องเป็นลูกตัวแรก ก่อนป้าย/quote/เนื้อหา
      // `{\n}` = ซากของ JSX comment หลังตัดคอมเมนต์ ไม่นับเป็นลูก
      expect(rest.slice(tagEnd + 1).replace(/^(\s|\{\s*\})+/, '')).toMatch(
        /^<span className="sr-only">ส่งเมื่อ \{formatDateTimeTH\(/,
      )
    }
  })

  it('(c) ป้าย Meta AI ใช้ brand-meta และไม่ใช้ bg-primary/text-primary', () => {
    const badge = code.match(/<span\b(?:(?!<span\b)[\s\S])*?icon="brand-meta"[\s\S]*?Meta AI\s*<\/span>/)
    expect(badge).not.toBeNull()
    expect(badge![0]).not.toMatch(/\b(bg|text)-primary\b/)
  })
})
