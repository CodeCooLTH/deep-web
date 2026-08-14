/**
 * [blocker] เก็บ/เอาออกจากคลังไฟล์ ต้องส่งสัญญาณให้แผงลูกค้าโหลดกริดใหม่ (feature 00048)
 *
 * ที่มา (user เจอเองบน prod 2026-08-14): กด "เก็บเข้าคลัง" → toast ขึ้นว่าสำเร็จ → กริดในแผง
 * ยังเขียนว่า "ยังไม่มีไฟล์ที่เก็บไว้" จนกว่าจะรีเฟรชหน้าเอง
 *
 * ต้นเหตุ: `toggleLibrary` (ChatThread) อัปเดตแค่ `savedFiles` ซึ่งเป็น state ของ **เธรด** แล้วจบ
 * ส่วน `CustomerFileLibrarySection` โหลดครั้งเดียวตอน mount (dep = conversationId) —
 * ทางแก้คลังอื่น ๆ *ทุกทาง* รีเฟรชครบหมด (`onRemoved`/`onPatched`/`onChanged` ของ viewer+modal)
 * เพราะมันเกิด **ในแผงเอง** ส่ง callback ถึงกันได้ ⇒ ขาดทางเดียวพอดีคือทางที่ผู้ใช้ใช้จริง
 * ซึ่งเป็นทางเดียวที่ข้าม subtree (ปุ่มอยู่ในเธรด กริดอยู่ในแผง — พี่น้องกันบนเดสก์ท็อป)
 *
 * 🛑 ไม่มี gate ไหนของโปรเจกต์จับได้เลย: `tsc`/build/eslint/theme-guard เขียวหมด เพราะโค้ด
 * ถูกทุกตัวอักษร — สิ่งที่ขาดคือ *การมีอยู่ของสัญญาณ* ไม่ใช่ความผิดของบรรทัดไหน
 *
 * ทำไมสแกนซอร์ส: vitest ตั้ง `environment: "node"` รีโปไม่มี jsdom/testing-library จึง render
 * component + ยิง CustomEvent จริงไม่ได้ (แพตเทิร์นเดียวกับ `inbox-list-race-guard.test.ts`)
 *
 * 🛑 ตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ทำ *ถูก* คือไฟล์ที่เขียนคำอธิบายอ้างชื่อฟังก์ชัน/ค่าคงที่
 * เหล่านี้ไว้ด้วย ถ้าไม่ตัด ด่านจะเขียวจากคอมเมนต์ของตัวเอง (false negative — อันตรายกว่าแดงปลอม
 * เพราะไม่มีใครไปดู) เช่นเดียวกับที่ HR9 grep gate เคยแดงปลอมจากคอมเมนต์ตัวเองเมื่อ 08-02→03
 *
 * แดง = มีคนถอดสัญญาณออก (หรือย้ายไปยิงก่อนรู้ผลจาก API) → กริดจะกลับไปโกหกผู้ขายอีกรอบ
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const THREAD = join(
  process.cwd(),
  'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx',
)
const SECTION = join(
  process.cwd(),
  'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/CustomerFileLibrarySection.tsx',
)

/** ตัดคอมเมนต์ทิ้ง — บล็อก `/* *\/` และบรรทัดที่ *เริ่มต้น* ด้วย `//` หรือ `*` */
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

const thread = stripComments(readFileSync(THREAD, 'utf8'))
const section = stripComments(readFileSync(SECTION, 'utf8'))

describe('คลังไฟล์ — สัญญาณจากเธรดถึงแผงลูกค้า', () => {
  it('ยังมี toggleLibrary อยู่ (ถ้าไม่เจอ แปลว่าโค้ดถูกรื้อ แล้วด่านนี้กลายเป็นด่านเปล่า)', () => {
    expect(thread).toMatch(/async function toggleLibrary\(/)
  })

  it('toggleLibrary ยิง emitLibraryChanged หลังรู้ว่า API สำเร็จแล้วเท่านั้น', () => {
    const body = thread.slice(thread.indexOf('async function toggleLibrary('))
    const okGuard = body.indexOf('if (!res.ok) throw')
    const emit = body.indexOf('emitLibraryChanged(')
    const rollback = body.indexOf('} catch {')

    expect(okGuard, 'ไม่เจอด่านเช็ค res.ok').toBeGreaterThan(-1)
    expect(emit, 'toggleLibrary ไม่ยิงสัญญาณเลย — แผงจะไม่รู้ว่าคลังเปลี่ยน').toBeGreaterThan(-1)
    // ยิงก่อนรู้ผล = สั่งให้แผงไปดึงค่าที่ยังไม่เปลี่ยน (และตอน fail คือค่าที่ผิด)
    expect(emit, 'ยิงสัญญาณก่อนเช็ค res.ok').toBeGreaterThan(okGuard)
    // ต้องอยู่ในเส้นสำเร็จ ไม่ใช่ใน catch
    expect(emit, 'ยิงสัญญาณอยู่ใน catch (เส้นที่ล้มเหลว)').toBeLessThan(rollback)
  })

  it('แผงลูกค้าฟังสัญญาณแล้วโหลดกริดใหม่', () => {
    expect(section).toMatch(/addEventListener\(\s*LIBRARY_CHANGED_EVENT/)
    expect(section).toMatch(/removeEventListener\(\s*LIBRARY_CHANGED_EVENT/)
    // ตัวจัดการต้องเรียก refresh จริง ไม่ใช่แค่ subscribe เปล่า ๆ — ดูช่วงตั้งแต่ต้น effect
    // (ตัวจัดการถูกประกาศก่อน addEventListener เสมอ) จนถึงบรรทัดที่ subscribe
    const subscribeAt = section.search(/addEventListener\(\s*LIBRARY_CHANGED_EVENT/)
    const handlerBlock = section.slice(Math.max(0, subscribeAt - 500), subscribeAt)
    expect(handlerBlock, 'subscribe แล้วแต่ตัวจัดการไม่ได้โหลดกริดใหม่').toContain('refresh()')
  })

  it('ทั้งสองฝั่งอ้างค่าคงที่ตัวเดียวกันจาก lib (ห้ามพิมพ์ชื่อ event เอง)', () => {
    expect(thread).toMatch(/import \{[^}]*emitLibraryChanged[^}]*\} from '@\/lib\/customer-file-library'/)
    expect(section).toMatch(/import \{[^}]*LIBRARY_CHANGED_EVENT[^}]*\} from '@\/lib\/customer-file-library'/)
    // สตริงดิบห้ามโผล่ในไฟล์ component — ชื่อ event ที่พิมพ์เองสองที่ทำให้หลุดกันได้เงียบ ๆ
    expect(thread).not.toContain("'deep:library-changed'")
    expect(section).not.toContain("'deep:library-changed'")
  })
})
