/**
 * [blocker] ห้ามผู้เรียก `InboxList` กั้นการ render ด้วย "รายการว่าง"
 *
 * ที่มา (user เจอเองบน prod 2 ครั้ง ห่างกัน 1 วัน):
 *   2026-08-13 — `inbox/page.tsx` (<1024px) early-return เป็น empty state ตอน `items` ว่าง
 *   2026-08-14 — `_components/ChatRail.tsx` (rail ≥1024px) ทำ **แบบเดียวกันเป๊ะ** และยังไม่ถูกแก้
 *
 * ทำไมมันร้ายแรง: กลไกที่ทำให้รายการแชทอัปเดตอยู่ใน `InboxList` **ทั้งหมด** — subscribe realtime
 * `chat:shop:{id}`, poll ทุก 20 วิ, refresh ตอน focus/visibility. กั้นไม่ให้มัน mount ตอนรายการว่าง
 * = ตัดขาดทุกเส้นทางพร้อมกัน ⇒ ลูกค้า "คนแรก" ที่ทักเข้ามาไม่ขึ้นในรายการจนกว่าผู้ใช้จะ F5 เอง
 * ซึ่งเป็นเคสที่สำคัญที่สุดของกล่องข้อความพอดี (คนที่ยังไม่เคยคุยกัน = คนที่ร้านอยากตอบเร็วที่สุด)
 * ส่วนลูกค้าเก่าที่ทักซ้ำเด้งทันที — กลับหัวกับความสำคัญพอดี
 *
 * และมันไม่ดูเหมือนของพัง: badge "ข้อความ" บนแท็บยังเด้งขึ้น เพราะ `InboxTabs` poll
 * `/api/chat/inbox-tab-counts` ของตัวเองแยกอีกเส้น ⇒ จอเดียวกันบอก "1" กับ "ยังไม่มีข้อความ" พร้อมกัน
 *
 * 🛑 รอบ 08-13 ปิดบั๊กด้วย **คอมเมนต์ยาว ๆ ในไฟล์ที่แก้** อย่างเดียว ไม่มีด่านไหนบังคับ — ไฟล์พี่น้อง
 * ที่ทำผิดแบบเดียวกันจึงรอดมาอีก 1 วันโดยไม่มีอะไรฟ้อง (`tsc`/build/theme-guard เขียวหมด เพราะโค้ด
 * ถูกทุกตัวอักษร สิ่งที่ผิดคือ *เงื่อนไขที่ครอบมันอยู่*) — ดู `rule-must-be-enforced-not-described.md`
 *
 * ทำไมสแกนซอร์ส: vitest ตั้ง `environment: "node"` และรีโปไม่มี jsdom/testing-library จึง render
 * component จริงไม่ได้ (แพตเทิร์นเดียวกับ `inbox-list-race-guard.test.ts`)
 *
 * 🛑 ต้องตัดคอมเมนต์ก่อนสแกน: ไฟล์ที่ทำ *ถูก* คือไฟล์ที่เขียนคำเตือนของกฎนี้ไว้ด้วย และคำเตือนนั้น
 * อ้างโค้ดผิดตัวอย่างเต็ม ๆ (`if (items.length === 0) return <SellerEmptyState/>`) ⇒ สแกนดิบจะแดง
 * ค้างตลอดกาลจากคำเตือนของตัวเอง แล้วถูกบันทึกเป็น "หนี้" ทั้งที่ไม่มีการละเมิดเลย
 * (เกิดมาแล้วกับ grep gate ของ HR9 2026-08-02→03 และด่าน `component-declared-in-render`)
 *
 * แดง = มีคนกั้น `<InboxList>` ด้วยรายการว่างอีก → ข้อความแรกของลูกค้าใหม่จะเงียบอีกรอบ
 * ทางแก้ที่ถูกคือ **ปล่อยให้ InboxList render แล้วให้มันแสดง empty state ของมันเอง**
 * (มันแยก "ยังไม่มีใครทัก" ออกจาก "กรองแล้วไม่เจอ" ด้วย `isChatListFiltering` ให้แล้ว)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** ตัวไฟล์ component เอง — empty state ของมันอยู่ในนี้โดยตั้งใจ (นั่นคือที่ที่ถูกต้อง) */
const COMPONENT = '(chat)/inbox/components/InboxList.tsx'

const ROOT = join(process.cwd(), 'src/app/(paces)/seller')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walk(full, out)
    } else if (name.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

/**
 * ตัดคอมเมนต์ทิ้ง — บล็อก `/* *\/` (ครอบ `{/* *\/}` ของ JSX ด้วย) และบรรทัดที่ *เริ่มต้น* ด้วย
 * `//` หรือ `*` เท่านั้น. จงใจไม่ตัด `//` กลางบรรทัด เพราะจะกิน `https://...` ในสตริงไปด้วย
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

const consumers = walk(ROOT)
  .filter((f) => !f.endsWith(join(...COMPONENT.split('/'))))
  .map((f) => ({ file: f, code: stripComments(readFileSync(f, 'utf8')) }))
  .filter((f) => /<InboxList[\s/>]/.test(f.code))

describe('ผู้เรียก InboxList — ห้ามกั้นการ render ด้วยรายการว่าง', () => {
  it('เจอผู้เรียกจริง (ถ้าเป็น 0 แปลว่าไฟล์ถูกย้าย/เปลี่ยนชื่อ แล้วด่านนี้กลายเป็นด่านเปล่า)', () => {
    expect(consumers.length).toBeGreaterThanOrEqual(2)
  })

  it.each(consumers.map((c) => c.file))('%s ไม่มีเงื่อนไข ".length === 0" คุมการ render', (file) => {
    const { code } = consumers.find((c) => c.file === file)!
    const offenders = code.match(/\w*[Ii]tems\??\.length\s*===?\s*0/g) ?? []
    expect(offenders).toEqual([])
  })

  it('InboxList เป็นเจ้าของ empty state "ยังไม่มีข้อความ" ที่เดียว', () => {
    const owner = readFileSync(join(ROOT, ...COMPONENT.split('/')), 'utf8')
    expect(owner).toContain('ยังไม่มีข้อความ')
    for (const { file, code } of consumers) {
      expect(code, `${file} ไม่ควรมี empty state ของตัวเอง — ต้องปล่อยให้ InboxList แสดง`).not.toContain(
        'ยังไม่มีข้อความ',
      )
    }
  })
})
