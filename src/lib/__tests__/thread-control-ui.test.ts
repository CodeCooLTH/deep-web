import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describeThreadControlOutcome } from '@/lib/thread-control-ui'

const ROOT = process.cwd()
const CHAT_THREAD = 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx'

/**
 * 🛑 [blocker] ทั้งไฟล์
 *
 * บั๊กต้นเรื่อง (prod 2026-08-26): ปุ่ม "ตอบเอง" ปลดล็อกช่องพิมพ์ทั้งที่ Meta ยังไม่ให้สิทธิ์
 * ⇒ ผู้ขายพิมพ์เสร็จแล้วโดน `(#10) another app is controlling this thread` ทุกครั้ง
 *
 * เกณฑ์ที่เทสนี้ยึด: **มีผลลัพธ์เดียวเท่านั้นที่ปลดล็อกช่องพิมพ์ได้ คือ `TAKEN`**
 * (= Meta ยืนยันแล้วว่าเราเป็นเจ้าของเธรด) ที่เหลือต้องบล็อกและชี้ทางไป Business Suite
 */
describe('[blocker] describeThreadControlOutcome', () => {
  it('TAKEN เท่านั้นที่ปลดล็อกช่องพิมพ์', () => {
    expect(describeThreadControlOutcome('TAKEN').unlocked).toBe(true)
    expect(describeThreadControlOutcome('REQUESTED').unlocked).toBe(false)
    expect(describeThreadControlOutcome('FAILED').unlocked).toBe(false)
  })

  it('REQUESTED ต้องบล็อก ไม่ใช่ "เกือบสำเร็จ" — พิสูจน์บน prod แล้วว่าส่งไม่ผ่าน', () => {
    // request_thread_control ตอบ success:true = Meta *รับคำขอ* ไม่ใช่ *ให้สิทธิ์*
    // (เธรด 4de6ccf1… 2026-08-26 06:17:54 → ข้อความที่ส่งตามไป 25 วิต่อมาโดน #10)
    const r = describeThreadControlOutcome('REQUESTED')
    expect(r.blocked).toBe(true)
    expect(r.toastTone).toBe('error')
  })

  it('ไม่มีผลลัพธ์ไหนที่ทั้งปลดล็อกและบล็อกพร้อมกัน (สองค่านี้ขัดกันเสมอ)', () => {
    for (const o of ['TAKEN', 'REQUESTED', 'FAILED'] as const) {
      const r = describeThreadControlOutcome(o)
      expect(r.unlocked, o).toBe(!r.blocked)
    }
  })

  it('ทุกผลลัพธ์มี toast ที่ไม่ว่าง — ผู้ขายต้องรู้เสมอว่ากดแล้วเกิดอะไร', () => {
    for (const o of ['TAKEN', 'REQUESTED', 'FAILED'] as const) {
      expect(describeThreadControlOutcome(o).toast.trim().length, o).toBeGreaterThan(0)
    }
  })

  it('REQUESTED กับ FAILED ต้องพูดคนละคำ (คนละสาเหตุ แม้ทางออกเดียวกัน)', () => {
    expect(describeThreadControlOutcome('REQUESTED').toast).not.toBe(
      describeThreadControlOutcome('FAILED').toast,
    )
  })

  it('ChatThread ต้องตัดสินผ่าน SSOT ตัวนี้ ไม่ใช่เทียบ outcome เอง', () => {
    // กันการ "เผลอ" เขียน if (outcome === 'REQUESTED') กลับเข้าไปในตัว component อีก ซึ่งคือ
    // รูปร่างของบั๊กเดิมเป๊ะ ๆ — ตัดคอมเมนต์ก่อนสแกน ไม่งั้นคำอธิบายของกฎนี้เองจะทำให้แดงค้าง
    // (บทเรียนเดียวกับ grep gate ของ HR9 ที่แดงจากคำเตือนตัวเองเมื่อ 2026-08-02)
    const src = readFileSync(join(ROOT, CHAT_THREAD), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
    expect(src).toContain('describeThreadControlOutcome(')
    expect(src).not.toMatch(/outcome\s*===\s*'REQUESTED'/)
    expect(src).not.toMatch(/outcome\s*===\s*'TAKEN'/)
  })
})
