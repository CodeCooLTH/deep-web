import { describe, expect, it } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * [blocker] `ChatMessage.updatedAt` เป็น `@updatedAt` ของ Prisma ⇒ Prisma เขียนให้เองทุก
 * `update`/`updateMany` **แต่ raw SQL ไม่ผ่าน Prisma** ถ้ามีใครเขียน `UPDATE "ChatMessage"`
 * ด้วย `$executeRaw` แถวนั้นจะมี `updatedAt` ค้างอยู่ค่าเดิม ⇒ delta แกน `updatedAt`
 * มองไม่เห็นการเปลี่ยนแปลงนั้นเลย และไม่มีอะไรฟ้อง (ชนิดถูก คิวรีสำเร็จ)
 *
 * ยืนยันแล้ว 2026-09-14: ตอนเขียนด่านนี้ทั้ง `src/` ไม่มี raw write บน ChatMessage เลยสักจุด
 *
 * 🛑 ด่านรุ่นแรกยิง `rg -U` ตรง ๆ ผ่าน execSync — แต่ execSync spawn ผ่าน `/bin/sh` ที่ไม่มี
 * `rg` เป็น binary จริงในเครื่องนี้ (`rg` ที่ใช้ได้ตอน interactive คือ shell function ของ
 * Claude Code เท่านั้น ไม่ถูกส่งต่อเข้า child process) — ยืนยันแล้วว่า `execSync('rg --version')`
 * ได้ "command not found" แล้ว `|| true` กลืน error นั้นเป็นสตริงว่างเปล่า ⇒ ด่านเขียวเสมอไม่ว่า
 * จะมี raw write หรือไม่ (คลาสเดียวกับ "ด่านที่เขียนไว้ ≠ ด่านที่บังคับได้"). แก้ด้วยท่าเดียวกับ
 * `order-no-write-paths.test.ts`: ใช้ `grep` (BSD, มีจริงที่ /usr/bin/grep) คัด "ไฟล์ผู้ต้องสงสัย"
 * ที่มีคำว่า executeRaw เท่านั้น แล้วให้ JS regex (รองรับ `[\s\S]` + lazy quantifier เต็มรูปแบบ
 * ซึ่ง BSD grep ทำไม่ได้) ตัดสินจริงจากเนื้อไฟล์
 */
describe('[blocker] ห้าม raw SQL เขียน ChatMessage', () => {
  it('ไม่มี UPDATE/INSERT/DELETE บน "ChatMessage" ผ่าน $executeRaw ใน src/', () => {
    const out = execSync(`grep -rlF 'executeRaw' src --include='*.ts' --include='*.tsx' || true`, {
      encoding: 'utf8',
    }).trim()
    const files = out.split('\n').filter(Boolean)
    const pattern = /executeRaw[\s\S]{0,400}?(UPDATE|INSERT INTO|DELETE FROM)\s+"ChatMessage"/
    const offenders = files.filter((f) => pattern.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
