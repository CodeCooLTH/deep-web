/**
 * [blocker] เปิด/ปิดเธรดคอมเมนต์ต้อง sync URL ด้วย history API ดิบ ห้ามผ่าน router ของ Next
 *
 * ที่มา (user เจอเองบน prod พร้อมวิดีโอจาก iPhone 2026-08-20):
 * แตะแถวในแท็บ "ความคิดเห็น" บนมือถือ → เธรดขึ้นทันที **แต่แถบบนของแอปกับแถบแท็บยังค้างอยู่**
 * อีกราว 1 วินาทีถึงจะหาย ⇒ จอขยายเป็น **2 ขยัก** (เฟรมยืนยัน: เธรดขึ้นวินาทีที่ 2.33 · แถบหาย 3.33)
 *
 * กลไก: `openThread` เปลี่ยน 2 อย่างคู่กัน — `setSelectedId` (เธรดเรนเดอร์ทันที เพราะเป็น React state)
 * กับ URL `?post=` ส่วน `ChatHeader`/`InboxTabs` ตัดสินว่าจะซ่อนตัวเองไหมผ่าน `isChatThreadPath()`
 * ซึ่งอ่านจาก `useSearchParams()` = **อ่านจาก URL** พอ URL ขยับช้ากว่า state หนึ่งรอบเซิร์ฟเวอร์
 * สองอย่างที่ควรเปลี่ยนพร้อมกันจึงเปลี่ยนคนละจังหวะ
 *
 * ทำไม router ถึงช้า: `comments/page.tsx` เป็น `dynamic = 'force-dynamic'` และ `CommentsPage()`
 * **ไม่รับ props ไม่ได้อ่าน `searchParams` เลยสักตัว** ⇒ `router.push('?post=…')` บังคับให้ server
 * เรนเดอร์ทั้งหน้าใหม่เพื่อได้ผลลัพธ์ที่เหมือนเดิมทุกไบต์ แล้ว `useSearchParams()` ถึงจะขยับ
 * (URL ที่ user ส่งมามี `&_rsc=` ต่อท้าย = หลักฐานตรง ๆ ว่ามีการขอ RSC payload จริง)
 *
 * ทำไม history API ถึงเร็ว: Next แพตช์ `pushState`/`replaceState` ไว้ให้เอง โดยเขียนกำกับในซอร์ส
 * ว่า *"Ensures usePathname and useSearchParams hold the newly provided url"*
 * (`node_modules/next/dist/client/components/app-router.js:236`) ⇒ ขยับในเฟรมเดียวกัน ไม่มี round-trip
 *
 * 🛑 เคสที่สองที่เทสนี้กัน **อันตรายกว่าบั๊กเดิม**: effect ทิศ `postParam → selectedId`
 * คือตัวเดียวที่รับ `popstate` เมื่อผู้ใช้กดปุ่ม back จริง/ปัดกลับบน iOS. ตอนใช้ router ยังมีกลไก
 * ของ Next ช่วยอยู่บ้าง แต่พอย้ายมาใช้ history API ดิบแล้ว **ถ้าใครลบ effect นี้ทิ้งตอน refactor
 * เธรดจะไม่ปิดเลยเมื่อกด back** (URL เปลี่ยนแต่จอค้าง) ซึ่งไม่มี `tsc`/build/theme-guard ตัวไหนเห็น
 * — safepay-ux ระบุข้อนี้เป็น regression guard ข้อแรกตอนตรวจ Design Spec
 *
 * ทำไมสแกนซอร์ส: vitest ตั้ง `environment: "node"` และรีโปไม่มี jsdom/testing-library จึง render
 * component จริงไม่ได้ (แพตเทิร์นเดียวกับ `inbox-list-no-empty-early-return.test.ts`)
 *
 * 🛑 ต้องตัดคอมเมนต์ก่อนสแกน: ไฟล์ที่ทำ *ถูก* คือไฟล์ที่เขียนคำเตือนของกฎนี้ไว้ด้วย และคำเตือนนั้น
 * อ้างชื่อ `router.push`/`router.replace` เต็ม ๆ ⇒ สแกนดิบจะแดงค้างตลอดกาลจากคำเตือนของตัวเอง
 * แล้วถูกบันทึกเป็น "หนี้" ทั้งที่ไม่มีการละเมิดเลย (เกิดมาแล้วกับ grep gate ของ HR9 2026-08-02→03)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = join(
  process.cwd(),
  'src/app/(paces)/seller/(chat)/inbox/comments/CommentsClient.tsx',
)

/**
 * ตัดคอมเมนต์ทิ้ง — บล็อก `/* *\/` และบรรทัดที่ *เริ่มต้น* ด้วย `//` หรือ `*` เท่านั้น
 * จงใจไม่ตัด `//` กลางบรรทัด เพราะจะกิน `https://...` ในสตริงไปด้วย
 * (ยกมาจาก `inbox-list-no-empty-early-return.test.ts` — กติกาเดียวกันต้องตัดเหมือนกัน)
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

/** ตัวฟังก์ชัน `openThread` เท่านั้น — `router.push` ที่อื่นในไฟล์ (เช่นพาไปห้องแชท) ถูกต้องอยู่แล้ว */
function openThreadBlock(src: string): string {
  const start = src.indexOf('const openThread = useCallback(')
  expect(start, 'หา openThread ในซอร์สไม่เจอ — เปลี่ยนชื่อฟังก์ชันแล้วต้องแก้เทสนี้ด้วย').toBeGreaterThan(-1)
  const end = src.indexOf('\n  )', start)
  expect(end, 'หาจุดจบของ openThread ไม่เจอ').toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('[blocker] sync เธรดคอมเมนต์กับ URL', () => {
  const stripped = stripComments(readFileSync(SOURCE, 'utf8'))

  it('openThread ต้องใช้ history.pushState/replaceState ไม่ใช่ router', () => {
    const block = openThreadBlock(stripped)

    expect(block, 'เปิดเธรดใหม่ต้อง pushState เพื่อให้กด back ครั้งเดียวกลับรายการ').toContain(
      'window.history.pushState',
    )
    expect(block, 'สลับโพสต์/ปิดเธรดต้อง replaceState เพื่อไม่ให้ history บวมทีละโพสต์').toContain(
      'window.history.replaceState',
    )

    // แดงตรงนี้ = "2 ขยัก" กลับมาแล้ว: แถบบน/แถบแท็บจะหายช้ากว่าเธรดหนึ่งรอบเซิร์ฟเวอร์
    expect(block, 'router.push ใน openThread = บังคับ RSC round-trip ที่ไม่มีผลลัพธ์อะไรเปลี่ยน').not.toContain(
      'router.push',
    )
    expect(block, 'router.replace ใน openThread = ปัญหาเดียวกับ router.push').not.toContain(
      'router.replace',
    )
  })

  it('ต้องคง effect ทิศ URL → state ไว้ ไม่งั้นกด back แล้วเธรดไม่ปิด', () => {
    // history API ดิบไม่ได้บอก React ว่าต้องปิดเธรด — effect ตัวนี้คือตัวเดียวที่รับ popstate
    expect(stripped, 'ลบ effect นี้ = กด back/ปัดกลับ iOS แล้ว URL เปลี่ยนแต่เธรดค้าง (หนักกว่าบั๊กเดิม)').toMatch(
      /setSelectedId\(\(prev\) => \(prev === postParam \? prev : postParam\)\)/,
    )
    expect(stripped, 'effect ต้องผูกกับ postParam เท่านั้น ไม่งั้นไม่ยิงตอน URL เปลี่ยน').toMatch(
      /\}, \[postParam\]\)/,
    )
  })
})
