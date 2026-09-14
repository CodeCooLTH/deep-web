// bubble-time-and-meta-ai-badge.test.ts — [blocker] กฎ UI ของ Task 7 (2026-09-14) ที่ไม่มีด่านอื่นจับได้
//
// 🛑 ทำไมต้องสแกนซอร์ส: vitest ตั้ง environment "node" (ไม่มี jsdom) และทั้ง 3 ข้อด้านล่าง
// ถูกต้องตามชนิดทุกตัวอักษรไม่ว่าจะเขียนผิดหรือถูก ⇒ tsc/build/eslint ผ่านหมด
//   (a) R20 — role="status" บน <button> เขียนทับ role ปุ่ม screen reader ไม่รู้ว่ากดได้
//       + (m2) live region ต้อง mount ค้างนอกเงื่อนไข count>0 · ปุ่มซ่อนตอน quickOpen
//   (b) R19/R23/P2-b — data-message-bubble เป็น <div> (role generic) aria-label ถูกทิ้งเงียบ ๆ ⇒
//       sr-only "เวลา …" หลังเนื้อหา ครบ 2 เส้นทาง (บับเบิลเดี่ยว + อัลบั้ม) · ห้าม title ที่ระดับบับเบิล
//       (ลูกที่กดได้รับ tooltip ไปซ้อน popover) — title อยู่ที่ <p> ของเนื้อข้อความแทน
//   (c) ป้าย Meta AI: ไอคอน brand-meta · ห้ามสี primary (One Voice) · ป้ายไทยพร้อมประโยค sr-only
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

/** ช่วง [เปิด, ปิด] ของวงเล็บ `(` ตัวแรกหลัง `from` — ข้ามสตริง (stripComments ตัดคอมเมนต์แล้ว) */
function parenBlock(src: string, from: number): [number, number] {
  const open = src.indexOf('(', from)
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') i += 1
      else if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '(') depth += 1
    else if (c === ')' && --depth === 0) return [open, i]
  }
  throw new Error('วงเล็บไม่ปิด')
}

describe('[blocker] ChatThread — เวลาบนบับเบิล / ปุ่มข้อความใหม่ / ป้าย Meta AI', () => {
  it('(a) R20: ไม่มี role="status" บน <button>', () => {
    const offenders: string[] = []
    for (const hit of code.matchAll(/role="status"/g)) {
      const open = code.lastIndexOf('<', hit.index)
      if (/^<button\b/.test(code.slice(open))) offenders.push(code.slice(open, hit.index + 13))
    }
    expect(offenders).toEqual([])
  })

  it('(a/m2) live region อยู่นอกเงื่อนไข count>0 · ปุ่มอยู่ในเงื่อนไขที่ซ่อนตอน quickOpen', () => {
    const cond = code.search(/\{unseenNewCount > 0 && !quickOpen && \(/)
    expect(cond).toBeGreaterThan(-1)
    const [s, e] = parenBlock(code, cond)
    const btn = code.indexOf('clearUnseen()', s)
    expect(btn > s && btn < e).toBe(true)
    const live = code.indexOf('<span role="status" className="sr-only">')
    expect(live).toBeGreaterThan(-1)
    expect(live > s && live < e).toBe(false)
  })

  it('(b) R23 + P2-b: บับเบิลไม่มี title · sr-only "เวลา" อยู่หลังเนื้อหา ครบ 2 เส้นทาง', () => {
    const hits = [...code.matchAll(/<div\s+data-message-bubble\b/g)].map((h) => h.index)
    expect(hits.length).toBe(2)
    const end = code.indexOf('unseenNewCount > 0 &&', hits[1])
    const regions = [
      { anchor: '<PhotoAlbum', src: code.slice(hits[0], hits[1]) },
      { anchor: '{m.body}', src: code.slice(hits[1], end) },
    ]
    for (const r of regions) {
      // ปลายแท็กเปิด = `>` ตัวแรกที่ไม่ใช่ `=>`
      const tagEnd = r.src.search(/[^=]>/) + 1
      expect(r.src.slice(0, tagEnd)).not.toMatch(/\btitle=/)
      const sr = r.src.indexOf('<span className="sr-only">เวลา {formatDateTimeTH(')
      expect(sr).toBeGreaterThan(r.src.indexOf(r.anchor))
      expect(r.src.indexOf(r.anchor)).toBeGreaterThan(-1)
      expect(r.src).toContain('{formatChatBubbleTime(')
    }
    // title เวลาเต็มย้ายไปอยู่ที่ <p> ของเนื้อข้อความ (ไม่ใช่กล่องที่มีปุ่ม/การ์ด/รูป)
    expect(code).toMatch(/<p\s+title=\{formatDateTimeTH\(m\.createdAt\)\}\s+className=\{`[^`]*`\}\s*>\s*\{m\.body\}/)
  })

  it('(c) ป้าย Meta AI: brand-meta · ไม่มี primary · ป้ายไทย + ประโยค sr-only', () => {
    const badge = code.match(
      /<span\b(?:(?!<span\b)[\s\S])*?icon="brand-meta"[\s\S]*?<span className="sr-only">เอเจนต์ AI ของ Meta ตอบข้อความนี้แทนร้าน<\/span>\s*<\/span>/,
    )
    expect(badge).not.toBeNull()
    expect(badge![0]).not.toMatch(/\b(bg|text|border)-primary\b/)
    expect(badge![0]).toContain('<span aria-hidden="true">AI ของ Meta</span>')
    expect(badge![0]).toContain('title="เอเจนต์ AI ของ Meta ตอบข้อความนี้แทนร้าน"')
  })
})
