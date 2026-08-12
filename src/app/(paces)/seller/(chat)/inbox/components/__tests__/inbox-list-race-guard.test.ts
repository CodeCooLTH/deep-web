/**
 * [blocker] กันแถวของ "ตัวกรองเก่า" ไหลกลับเข้ารายการแชท
 *
 * ที่มา 2026-08-10 (user เจอเองบน prod): กดแท็บ "ปิดงาน"/"สแปม" แล้วเห็นแถวของแท็บ "ทั้งหมด"
 * โผล่ปนมา — ต้นเหตุคือ `InboxList` ยิง fetch 3 ทาง (เปลี่ยนตัวกรอง / loadMore / poll 20 วิ +
 * broadcast realtime) โดย **ไม่มีอะไรผูกผลลัพธ์กับตัวกรองที่ใช้ยิงมันออกไป** ผลของแท็บที่ผู้ใช้
 * ออกไปแล้วจึงมาถึงทีหลังและถูกเขียน/merge ทับชุดใหม่
 *
 * `refreshFirstPage` อันตรายที่สุดเพราะมันตั้งใจ **merge** (กันแถวจาก loadMore หายกลางคัน)
 * — merge ที่ไม่เช็คลายเซ็นเท่ากับเก็บแถวข้ามตัวกรองไว้ตลอดไป และมันถูกยิงเองทุก 20 วิ
 * จึงเกิดซ้ำได้แม้ผู้ใช้ไม่กดอะไรอีก
 *
 * ทำไมเป็นเทสที่อ่านซอร์ส: การพิสูจน์ race ต้อง render hook จริง + คุมลำดับ response ซึ่งทำที่นี่
 * ไม่ได้ (vitest ตั้ง `environment: "node"` และรีโปไม่มี jsdom/testing-library) — สิ่งที่ตรวจได้และ
 * ตรงกับต้นเหตุคือ **ยังมีด่านเทียบลายเซ็นอยู่ก่อนทุกจุดที่เขียน state** (แพตเทิร์นเดียวกับ
 * `useListBusy-deps.test.ts`)
 *
 * แดง = มีคนถอดด่านออก (หรือย้ายไฟล์) → รายการข้ามตัวกรองจะกลับมา ห้าม merge
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FILE = join(
  process.cwd(),
  'src/app/(paces)/seller/(chat)/inbox/components/InboxList.tsx',
)

describe('InboxList — ด่านเทียบลายเซ็นตัวกรองก่อนเขียนรายการ', () => {
  const src = readFileSync(FILE, 'utf8')

  it('มีลายเซ็นของชุดที่กำลังแสดง + ของชุดที่อยู่ใน state', () => {
    expect(src).toMatch(/listSignatureRef\s*=\s*useRef\(/)
    expect(src).toMatch(/itemsSignatureRef\s*=\s*useRef\(/)
  })

  it('ทุกจุดที่ await ผลรายการต้องทิ้งผลของตัวกรองเก่า (เจอด่าน ≥ 2 ที่: fetchList + refreshFirstPage)', () => {
    const guards = src.match(/if\s*\(sig\s*!==\s*listSignatureRef\.current\)\s*return/g) ?? []
    expect(guards.length).toBeGreaterThanOrEqual(2)
  })

  it('การ merge ของ refreshFirstPage ต้องไม่ต่อท้ายด้วย prev ที่มาจากลายเซ็นอื่น', () => {
    // ต้องมี base ที่คัดจาก itemsSignatureRef ไม่ใช่ใช้ prev ตรง ๆ
    //
    // 🛑 อัปเดต 2026-08-12: เดิมบังคับ "รูปเดียว" (`itemsSignatureRef.current === sig ? prev : []`
    // เขียนติดกันเป็นบรรทัดเดียว) แล้วแดงทันทีที่โค้ดยกเงื่อนไขนั้นเป็นตัวแปร `comparable`
    // — ซึ่งเป็น refactor ที่ **ทำให้ดีขึ้น** (predicate เดียวกันถูกใช้คุมเสียงแจ้งเตือนด้วย)
    // เทสต้องผูกกับ *เจตนา* ไม่ใช่ *การจัดวางตัวอักษร*: (1) มีการเทียบลายเซ็นของชุดที่อยู่ใน state
    // กับลายเซ็นของผลที่เพิ่งได้ (2) base มาจากผลการเทียบนั้น ไม่ใช่ prev ตรง ๆ
    expect(src).toMatch(/itemsSignatureRef\.current\s*===\s*sig/)
    expect(src).toMatch(/const\s+base\s*=\s*\w+\s*\?\s*prev\s*:\s*\[\]/)
    // และห้ามกลับไปเป็นรูปเดิมที่ merge prev ทั้งก้อน
    expect(src).not.toMatch(/\[\s*\.\.\.data\.items,\s*\.\.\.prev\.filter/)
  })

  it('ลายเซ็นถูกตั้งก่อนยิง fetch เมื่อตัวกรองเปลี่ยน (ไม่ใช่ตั้งทีหลังใน effect อื่น)', () => {
    const effect = src.slice(src.indexOf('listSignatureRef.current = listSignature'))
    // บรรทัดถัดไปในบล็อกเดียวกันต้องเป็นการข้าม run แรกแล้วเรียก fetchList
    expect(effect.slice(0, 400)).toMatch(/isFirstRun[\s\S]*fetchList\(\{\s*append:\s*false\s*\}\)/)
  })
})
