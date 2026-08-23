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

  it('[R-23] เช็คถูกเขียวผูกกับ lastShopMsgId เท่านั้น — ห้ามมีสาขาที่ให้เขียวกับทุกข้อความที่ยืนยันแล้ว', () => {
    // 🛑 กฎที่ไฟล์ ChatThread เขียนไว้เอง (~บรรทัด 250 และคอมเมนต์บันได): "เขียวสงวนไว้กับสิ่งที่
    // ยืนยันแล้วเท่านั้น" — เจตนาคือให้มัน **เด่น** ถ้าโรยเช็คถูกเขียวท้ายทุกเบิร์สต์ สัญญาณที่ควรเด่น
    // ("อ่านแล้ว") จะจมหายไป และมันคือการเปลี่ยนที่ผู้ใช้เห็นซึ่งไม่มีใครขอ (scope ไหล)
    //
    // ด่านนี้จับ "เงื่อนไขที่เป็นจริงถาวร" ไม่ใช่จับชื่อตัวแปร — ตัวแปรชื่ออะไรก็ได้ที่ derive จาก
    // mine/!failed/!queued/_status แล้วเอาไปคุม text-success จะโดนหมด. สิ่งเดียวที่ผ่านได้คือ
    // เงื่อนไขที่มี `lastShopMsgId` (ใบล่าสุดใบเดียว) ซึ่งเป็นสิ่งที่เจ้าของระบบสั่งไว้เอง
    // ("ถ้ารัวๆ ก็ให้ อ่านแล้วจังหวะสุดท้ายก็พอ")
    const src = code(CHAT_THREAD)
    const offenders: string[] = []
    let from = 0
    for (;;) {
      const at = src.indexOf('text-success', from)
      if (at === -1) break
      from = at + 1
      const ctx = src.slice(Math.max(0, at - 700), at)
      // สนใจเฉพาะจุดที่เป็น "สถานะของข้อความ" (อยู่ในเทอร์นารี/เงื่อนไขที่อ้าง mine หรือ m._status)
      if (!/\bmine\b|\bm\._status\b/.test(ctx.slice(-260))) continue
      if (!/lastShopMsgId/.test(ctx.slice(-260))) offenders.push(src.slice(Math.max(0, at - 260), at + 40))
    }
    expect(
      offenders,
      `เช็คถูก/ข้อความสีเขียวที่ไม่ได้ผูกกับ lastShopMsgId (= จะเป็นจริงถาวรกับทุกข้อความ):\n${offenders.join('\n---\n')}`,
    ).toEqual([])
  })

  it('ทุกจุดที่เรียกบันไดสถานะ ป้อน queued เข้า prop sending', () => {
    // 🛑 เทสนี้เขียนใหม่ใน Fix round 2 — ของเดิมนับจำนวนจุดที่ render คำว่า "กำลังส่ง" แล้วบังคับว่า
    // ทุกจุดต้องดู `queued`. หลัง P5 รวมบันไดเป็น component เดียว **คำนั้นเหลือแหล่งเดียว** เกณฑ์
    // ">= 2 จุด" จึงเป็นเท็จโดยโครงสร้าง ไม่ใช่เพราะ guard หาย
    // คุณสมบัติที่ของเดิมกันไว้ ("แถวในคิวต้องอ่านว่ากำลังส่ง ไม่ใช่ส่งแล้ว") ย้ายมาอยู่ที่นี่:
    // component เดียวตัดสินคำทั้งหมดแล้ว ⇒ สิ่งที่ต้องกันคือ **ผู้เรียกป้อน queued เข้าไปครบทุกที่**
    // ถ้าผู้เรียกไหนลืม แถวในคิวของ surface นั้นจะตกไปกิ่งบันได = ขึ้น "ส่งแล้ว" ทันที
    const src = code(CHAT_THREAD)
    const calls = src.match(/<ShopDeliveryStatus[\s\S]*?\/>/g) ?? []
    expect(calls.length, 'ต้องมีผู้เรียก 2 ที่').toBe(2)
    const bad = calls.filter((c) => !/sending=\{[^}]*queued/.test(c))
    expect(bad, `ผู้เรียกที่ไม่ได้ป้อน queued เข้า sending:\n${bad.join('\n---\n')}`).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Fix round 2 — ผลจาก /impeccable critique (2026-08-23)
// ทุกข้อในกลุ่มนี้ **ไม่มี gate อัตโนมัติตัวไหนจับได้** (detector สะอาด · tsc ผ่าน · contrast ผ่าน)
// เป็นเรื่องความหมายล้วน จึงต้องมีด่านที่จับ "รูปร่างของเงื่อนไข" ไม่ใช่ "ชื่อตัวแปร"
// ─────────────────────────────────────────────────────────────────────────────

describe('[blocker] P2 — ข้อความกันส่งซ้ำต้องมองเห็นได้จริง ไม่ใช่ tooltip', () => {
  it('ประโยค "ไม่ต้องส่งซ้ำ" เป็นเนื้อหาที่ render จริง ไม่ได้อยู่ใน title=/aria-label', () => {
    // 🛑 มือถือไม่มี hover และผู้ขายทำงานบนมือถือเป็นหลัก (PRODUCT.md) ⇒ ประโยคที่เขียนมาเพื่อกัน
    // อาการ "คิดว่าค้างเลยส่งซ้ำ" (อาการเดียวกับบั๊กต้นเรื่องของ CR นี้) จะไม่มีวันถึงคนที่ต้องการมัน
    // กฎนี้โปรเจกต์เขียนไว้เองแล้วที่ docs/conventions/aria-name-requires-supporting-role.md
    const src = code(CHAT_THREAD)
    expect(src, 'ต้องมีประโยคนี้อยู่ในไฟล์').toContain('ไม่ต้องส่งซ้ำ')
    // ห้ามอยู่ในค่าของ attribute ใด ๆ (title=, aria-label=, alt=) — จับที่ *รูปแบบ* ไม่ใช่ชื่อ attribute
    const inAttr = src.match(/[a-zA-Z-]+=\{?"[^"]*ไม่ต้องส่งซ้ำ[^"]*"/g) ?? []
    expect(inAttr, `ประโยคนี้ไปอยู่ใน attribute (มือถือมองไม่เห็น):\n${inAttr.join('\n')}`).toEqual([])
  })

  it('ไม่มี title= ค้างอยู่บน span สถานะ "กำลังส่ง" (จะถูกอ่านซ้ำสองรอบ)', () => {
    expect(code(CHAT_THREAD)).not.toMatch(/title="กำลังส่ง/)
  })
})

describe('[blocker] P3 — สถานะที่เปลี่ยนเองต้องถูกประกาศ', () => {
  it('ทุก span สถานะการส่งใน ShopDeliveryStatus มี role="status"', () => {
    // สถานะชุดนี้ (QUEUED→SENT→ได้รับแล้ว→อ่านแล้ว) เปลี่ยนโดยผู้ใช้ไม่ได้กดอะไร — ถ้าไม่ประกาศ
    // ผู้ใช้ screen reader ไม่มีทางรู้เลยว่าข้อความออกไปหรือยัง. กลุ่มเป้าหมายที่ PRODUCT.md ระบุ
    // รวมผู้สูงวัย/digital-literacy ต่ำ ⇒ สถานะที่ควรถูกประกาศที่สุดคือสถานะที่เงียบที่สุด
    const src = code(CHAT_THREAD)
    const start = src.indexOf('function ShopDeliveryStatus')
    expect(start, 'หา ShopDeliveryStatus ไม่เจอ').toBeGreaterThan(-1)
    // ตัดที่ปลายฟังก์ชัน = ฟังก์ชันถัดไปที่ประกาศระดับบนสุด
    const end = src.indexOf('\nfunction ', start + 10)
    const body = src.slice(start, end)
    const returned = body.match(/<span[^>]*>/g) ?? []
    expect(returned.length, 'ต้องมี span สถานะอย่างน้อย 4 ตัว (กำลังส่ง + บันได 3 ขั้น)').toBeGreaterThanOrEqual(4)
    const missing = returned.filter((t) => !t.includes('role="status"'))
    expect(missing, `span สถานะที่ไม่มี role="status":\n${missing.join('\n')}`).toEqual([])
  })
})

describe('[blocker] P5 — บันไดสถานะต้องมาจากแหล่งเดียว', () => {
  it('คำว่า อ่านแล้ว/ได้รับแล้ว/ส่งแล้ว ปรากฏเป็นเนื้อหา JSX ได้ที่ละ 1 ครั้งเท่านั้น', () => {
    // 🛑 เดิมบันไดถูกเขียนซ้ำ 2 ที่ในไฟล์เดียวกัน แล้ว **หลุดจากกันจริง**: บล็อกอัลบั้มมีแค่ 2 ขั้น
    // (ขาด "ได้รับแล้ว") และไม่จัดการ failed ⇒ กลุ่มรูปที่ยิงไม่ออกขึ้นว่า "ส่งแล้ว"
    // สถานะเดียวกันอ่านได้คนละคำขึ้นกับว่าส่งรูปใบเดียวหรือหลายใบ = รูปร่างของ HR16
    // tsc มองไม่เห็นเพราะสตริงถูกต้องทั้งคู่ — การนับจำนวนแหล่งคือด่านเดียวที่กันการหลุดซ้ำได้
    const src = code(CHAT_THREAD)
    for (const word of ['อ่านแล้ว', 'ได้รับแล้ว', 'ส่งแล้ว']) {
      // นับเฉพาะที่เป็น "เนื้อหาที่ผู้ใช้อ่าน" (ตามหลัง > ของ JSX) ไม่นับ aria-label/คอมเมนต์
      const rendered = src.match(new RegExp(`>\\s*${word}`, 'g')) ?? []
      expect(rendered.length, `"${word}" ถูกเรนเดอร์จาก ${rendered.length} ที่ — ต้องมาจากแหล่งเดียว`).toBe(1)
    }
  })

  it('บล็อกอัลบั้มเรียกบันไดตัวเดียวกับบับเบิลเดี่ยว (ไม่เขียนเอง)', () => {
    const src = code(CHAT_THREAD)
    const uses = src.match(/<ShopDeliveryStatus/g) ?? []
    expect(uses.length, 'ต้องถูกเรียก 2 ที่: บับเบิลเดี่ยว + บล็อกอัลบั้ม').toBe(2)
  })
})

describe('[blocker] P4 — ปุ่มกู้คืนของข้อความที่ส่งไม่สำเร็จต้องแตะได้จริงบนมือถือ', () => {
  // 🛑 CR นี้เปิดทางใหม่ไปสู่ FAILED: เพดานคิว 3 นาทีทำให้ "ส่งไม่สำเร็จ" กลายเป็นผลลัพธ์ปกติ
  // (เดิมมาจาก error ตอนส่งทันทีเท่านั้น) ⇒ คลัสเตอร์กู้คืนที่เคยเป็นทางเดินรองกลายเป็นทางเดินหลัก
  // ปุ่มเดิม text-xs + `-m-1 … p-1` ให้ hit box ~24px เทียบกับเกณฑ์ 44px ที่ PRODUCT.md ประกาศเอง
  //
  // ด่านนี้จับ "รูปร่าง" ไม่ใช่ชื่อ: ปุ่มไหนก็ตามในคลัสเตอร์นี้ต้องมี padding ที่พาไปถึง 44px บนมือถือ
  /** คลัสเตอร์กู้คืน = ก้อน JSX ใต้เงื่อนไข failed (ลองใหม่ / เหตุผล / ยกเลิก) */
  function failedCluster(src: string): string {
    const start = src.indexOf('{failed && (')
    expect(start, 'หาคลัสเตอร์ failed ไม่เจอ').toBeGreaterThan(-1)
    const end = src.indexOf('{m.edited &&', start)
    expect(end).toBeGreaterThan(start)
    return src.slice(start, end)
  }

  it('ทุกปุ่มในคลัสเตอร์มี padding ระดับ 44px บนมือถือ (p-3 ขึ้นไป) และย่อลงเฉพาะ lg:', () => {
    const cluster = failedCluster(code(CHAT_THREAD))
    const classNames = cluster.match(/className="[^"]*"/g) ?? []
    // ต้องเจอปุ่มจริงอย่างน้อย 3 ตัว (ลองใหม่ · เหตุผล (i) · ยกเลิก) — กันเคส "เขียวเพราะหาไม่เจอ"
    const buttons = (cluster.match(/<button/g) ?? []).length
    expect(buttons, 'ต้องมีปุ่มอย่างน้อย 3 ตัวในคลัสเตอร์').toBeGreaterThanOrEqual(3)
    // นับเฉพาะ className ที่เป็นของปุ่ม (มี rounded = ปุ่มกดได้ในคลัสเตอร์นี้ทุกตัวมี)
    const btnClasses = classNames.filter((c) => c.includes('rounded'))
    expect(btnClasses.length).toBeGreaterThanOrEqual(3)
    const tooSmall = btnClasses.filter((c) => !/\bp-3\b/.test(c))
    expect(
      tooSmall,
      `ปุ่มที่ hit box ต่ำกว่าเกณฑ์ 44px บนมือถือ (ไม่มี p-3):\n${tooSmall.join('\n')}`,
    ).toEqual([])
  })

  it('ปุ่ม "ยกเลิก" มีเส้นใต้ถาวร ไม่ใช่โผล่เฉพาะตอน hover', () => {
    // มือถือไม่มี hover ⇒ `hover:underline` อย่างเดียวทำให้มันเป็นข้อความเปล่าที่อยู่ห่างจาก
    // "ลองใหม่" แค่หนึ่งนิ้ว — ไม่มีอะไรบอกว่ากดได้ และไม่มีอะไรแยกมันจากตัวหนังสือรอบ ๆ
    const cluster = failedCluster(code(CHAT_THREAD))
    const hoverOnly = (cluster.match(/className="[^"]*"/g) ?? []).filter(
      (c) => /hover:underline/.test(c) && !/(^|[\s"])underline[\s"]/.test(c),
    )
    expect(hoverOnly, `affordance ที่มีเฉพาะตอน hover:\n${hoverOnly.join('\n')}`).toEqual([])
  })
})
