// chat-queued-ui-gates.test.ts — [blocker] จอผู้ขายต้องไม่โกหกว่า "ส่งแล้ว" ตอนแถวยังอยู่ในคิว
//
// 🛑 ทำไมต้องเป็นเทสสแกนซอร์ส: รีโปนี้ตั้ง `environment: "node"` (ไม่มี jsdom/testing-library)
// เรนเดอร์ ChatThread เพื่อยืนยันด้วย DOM ไม่ได้ — และสิ่งที่ต้องกันคือ **เงื่อนไข boolean** ที่ถูกต้อง
// ตามชนิดทุกตัวอักษรไม่ว่าจะเขียนกลับด้านหรือไม่ ⇒ `tsc`/build/eslint/theme-guard ผ่านหมดทุกกรณี
// (ดู docs/conventions/ui-boolean-needs-a-testable-home.md)
//
// สิ่งที่ด่านนี้กันไว้ทีละข้อ:
//   1. `postMessage` กลับไปเขียน `_status: 'sent'` → เช็คถูกเขียวบนข้อความที่ยังไม่ออกจากระบบ
//   2. ปุ่มที่ต้องอ้าง mid ของช่องทาง (ตอบกลับ/รีแอ็กชัน/สติกเกอร์) โผล่บนแถว QUEUED → กดแล้ว 4xx
//      เพราะฝั่งช่องทางยังไม่มีข้อความให้อ้างถึง
//   3. บันได "อ่านแล้ว/ได้รับแล้ว/ส่งแล้ว" เกาะแถว QUEUED
//   4. จุดที่ยังอ่าน `_status === 'sent'` ค้างไว้ — ค่านั้นไม่ถูก assign อีกแล้ว เงื่อนไขจะเป็นเท็จ
//      **ตลอดกาลอย่างเงียบ ๆ** (เคสจริงที่เกือบหลุด: effect รีเฟรชแคปชันโควตา LINE)
//
// 🛑 ต้อง stripComments ก่อนสแกนทุกครั้ง — ไฟล์ที่ "ทำถูกกฎ" คือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย
// (ทั้งสองไฟล์มีคอมเมนต์อ้าง `_status: 'sent'` เพื่ออธิบายว่าทำไมถึงถอดออก) ด่านที่ match คำเปล่า ๆ
// จะแดงค้างตลอดกาลแล้วถูกบันทึกเป็น "หนี้" ทั้งที่ไม่มีการละเมิดเลย — เกิดมาแล้วกับ grep gate ของ
// HR9 (2026-08-02→03) และกับด่านของ component-declared-in-render (2026-08-12)

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

const CHAT_THREAD = 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx'
const CHAT_HOOK = 'src/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts'

/**
 * ตัดคอมเมนต์ออกให้เหลือแต่ "โค้ดที่ทำงานจริง"
 *
 * เดินทีละตัวอักษรพร้อมจำว่าตอนนี้อยู่ในสตริงหรือไม่ — ตัดแบบ regex เปล่า ๆ ไม่ได้เพราะ `//` ที่อยู่
 * ใน URL ภายในสตริงจะกินโค้ดที่เหลือของบรรทัดนั้นไปด้วย (= false negative ที่มองไม่เห็น)
 */
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
      // คงบรรทัดว่างไว้เพื่อไม่ให้โค้ดสองก้อนที่คนละบรรทัดถูกเชื่อมติดกันจนสแกนเพี้ยน
      out += '\n'
      continue
    }
    out += c
    i += 1
  }
  return out
}

function code(rel: string): string {
  return stripComments(readFileSync(join(ROOT, rel), 'utf8'))
}

/** ตัดข้อความยาว ๆ ให้อ่านง่ายตอนเทสแดง (ไม่มีผลกับการตัดสิน) */
function around(src: string, index: number, before = 240): string {
  return src.slice(Math.max(0, index - before), index + 60)
}

describe('[blocker] postMessage ต้องไม่ประกาศว่า "ส่งแล้ว" ตอน POST ตอบกลับ', () => {
  it('ไม่มี `_status: \'sent\'` เหลืออยู่ในโค้ดของ hook', () => {
    // POST ตอบ 202 = "เข้าคิวแล้ว" ไม่ใช่ "ถึงลูกค้าแล้ว" — คืนบรรทัดนี้กลับมาเมื่อไหร่คือการติด
    // เช็คถูกให้ข้อความที่ยังไม่ออกจากระบบ ซึ่งคืออาการของบั๊กที่ CR นี้ตั้งใจแก้ เป๊ะ ๆ
    expect(code(CHAT_HOOK)).not.toMatch(/_status:\s*'sent'/)
  })

  it("`'sent'` ถูกถอดออกจาก union ของ `_status` แล้ว (type ที่ไม่มีใคร assign = type ที่โกหก)", () => {
    const decl = code(CHAT_HOOK).match(/_status\?:[^\n]*/)
    expect(decl, 'หา declaration ของ _status ไม่เจอ — โครงไฟล์เปลี่ยน ให้ปรับด่านนี้ตาม').toBeTruthy()
    expect(decl![0]).not.toContain("'sent'")
  })

  it('ไม่มีจุดไหนอ่าน `_status === \'sent\'` ค้างไว้ (จะเป็นเท็จตลอดกาลอย่างเงียบ ๆ)', () => {
    // 🛑 เคสจริงที่เกือบหลุด: effect รีเฟรชแคปชันโควตา LINE หา "ข้อความที่เพิ่งส่งสำเร็จ" จากค่านี้
    // ถ้าไม่ย้ายไปอ่าน deliveryStatus แคปชันจะค้างค่าเก่าถาวรโดยไม่มี type error ใด ๆ เตือน
    for (const rel of [CHAT_THREAD, CHAT_HOOK]) {
      expect(code(rel), rel).not.toMatch(/_status\s*[!=]==\s*'sent'/)
    }
  })
})

describe('[blocker] ปุ่มที่ต้องอ้าง mid ต้องปิดสำหรับแถวที่ยังอยู่ในคิว', () => {
  it('`canReply` (ปุ่ม hover เดสก์ท็อป) มี !queued อยู่ในเงื่อนไข', () => {
    const decl = code(CHAT_THREAD).match(/const canReply =[^\n]*(\n[^\n]*)?/)
    expect(decl, 'หา declaration ของ canReply ไม่เจอ').toBeTruthy()
    expect(decl![0]).toContain('!queued')
  })

  it('ทุก <ReplyMessageButton> / <ReactMessageButton> ในไฟล์ถูก gate ด้วย canReply หรือ !queued', () => {
    // 🛑 ครอบ **ทั้งไฟล์** ไม่ระบุบรรทัดตายตัว — เพราะจุดที่พลาดจริงคือบล็อกอัลบั้มรูป (item K)
    // ซึ่งอยู่คนละที่กับบับเบิลปกติและเดิม render ปุ่มทั้งสองแบบ *ไม่มีเงื่อนไขเลย*. มันรอดมาได้
    // เพราะอัลบั้มถูกประกอบจากข้อความที่ persist แล้วเท่านั้น — แต่แถว QUEUED เป็นแถว persist จริง
    // ที่มี id จริง จึงหลุดช่องนี้ทันทีที่ฟีเจอร์คิวขึ้น (E-12: ส่งรูปกริดสร้างหลายแถว QUEUED พร้อมกัน)
    const src = code(CHAT_THREAD)
    const hits: string[] = []
    for (const tag of ['<ReplyMessageButton', '<ReactMessageButton']) {
      let from = 0
      for (;;) {
        const at = src.indexOf(tag, from)
        if (at === -1) break
        const prefix = around(src, at)
        if (!/(canReply|!queued)\s*&&/.test(prefix)) hits.push(`${tag} @${at}\n…${prefix}`)
        from = at + tag.length
      }
    }
    // ต้องเจอปุ่มจริงอย่างน้อย 4 ตัว (บับเบิลปกติ 2 + อัลบั้ม 2) — กันเคส "เขียวเพราะหาไม่เจอ"
    // ซึ่งเป็นความล้มเหลวที่หน้าตาเหมือนความสำเร็จที่สุดของเทสสแกนซอร์ส
    expect((src.match(/<(Reply|React)MessageButton/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(hits, `ปุ่มที่ยังไม่ถูก gate:\n${hits.join('\n---\n')}`).toEqual([])
  })

  it('เมนูกดค้างมือถือ: ตอบกลับ + สติกเกอร์ ต้องเช็ค QUEUED ทั้งคู่', () => {
    const src = code(CHAT_THREAD)
    const start = src.indexOf('const actionTargetActions')
    const end = src.indexOf('const actionTargetReactions')
    expect(start, 'หา actionTargetActions ไม่เจอ').toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const block = src.slice(start, end)
    // 2 จุด = reply + sticker · ทั้งคู่ผูก reply_to จึงต้องการ mid เหมือนกัน (order/copy/คลัง ไม่ต้อง)
    expect((block.match(/deliveryStatus\s*!==\s*'QUEUED'/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('รีแอ็กชันในเมนูกดค้างคืนลิสต์ว่างเมื่อแถวยังอยู่ในคิว', () => {
    const src = code(CHAT_THREAD)
    const start = src.indexOf('const actionTargetReactions')
    expect(start).toBeGreaterThan(-1)
    const block = src.slice(start, start + 700)
    expect(block).toMatch(/deliveryStatus\s*===\s*'QUEUED'/)
  })
})

describe('[blocker] บันได "อ่านแล้ว/ได้รับแล้ว/ส่งแล้ว" ต้องไม่เกาะแถวที่ยังอยู่ในคิว', () => {
  it('`lastShopMsgId` ข้ามแถว QUEUED ตั้งแต่ต้นทาง', () => {
    // แก้ที่ต้นทางไม่ใช่ไล่เติม !queued ทีละจุดที่ใช้ค่านี้ — ค่านี้ถูกอ่าน 3 ที่ (บับเบิลปกติ 2 +
    // อัลบั้ม 1) การกันที่ปลายทางแปลว่าคนเพิ่มที่ใช้งานรายที่ 4 ต้องรู้กฎนี้เอง
    const src = code(CHAT_THREAD)
    const start = src.indexOf('const lastShopMsgId')
    expect(start).toBeGreaterThan(-1)
    const decl = src.slice(start, start + 400)
    expect(decl).toMatch(/deliveryStatus\s*!==\s*'QUEUED'/)
  })

  it('สปินเนอร์ "กำลังส่ง" ครอบทั้งบับเบิล optimistic และแถวในคิว', () => {
    const src = code(CHAT_THREAD)
    // ทุกจุดที่เรนเดอร์คำว่า "กำลังส่ง" ต้องมี queued อยู่ในเงื่อนไขที่คุมมัน (บับเบิลปกติ + อัลบั้ม)
    const hits: string[] = []
    let from = 0
    for (;;) {
      const at = src.indexOf('กำลังส่ง\n', from)
      if (at === -1) break
      if (!/queued/.test(around(src, at, 400))) hits.push(around(src, at, 400))
      from = at + 1
    }
    expect((src.match(/กำลังส่ง\n/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(hits, `จุดที่โชว์ "กำลังส่ง" แต่ไม่ได้ดู queued:\n${hits.join('\n---\n')}`).toEqual([])
  })
})
