/**
 * [blocker] เมนูข้างต้อง "ไม่ขยับ" เมื่อเมนูที่ active อยู่ในสายตาอยู่แล้ว
 *
 * บั๊กจริง 2026-08-27: เปิดหน้าแชทครั้งแรกแล้วแถบเมนูซ้ายเลื่อนลงเอง หัวรายการหลุดจอ
 * ไม่มี gate ไหนของโปรเจกต์จับได้ (tsc/build/eslint/theme-guard ผ่านหมด สูตรเลขถูกตามชนิดทุกตัว
 * สิ่งที่ผิดคือ *มันเลื่อนทั้งที่ไม่ต้องเลื่อน*)
 */
import { describe, it, expect } from 'vitest'
import { computeMenuScrollTarget } from '@/lib/menu-scroll'

/** กล่องสูง 600 เนื้อหา 1400 อยู่บนสุด */
const box = { scrollTop: 0, clientHeight: 600, scrollHeight: 1400 }

describe('[blocker] computeMenuScrollTarget', () => {
  it('เห็นครบอยู่แล้ว → null (ห้ามขยับ) — นี่คือเคสของหน้าแชทที่ user รายงาน', () => {
    expect(computeMenuScrollTarget({ ...box, itemTop: 120, itemHeight: 44 })).toBeNull()
  })

  it('ชิดขอบล่างพอดี (ล่างสุดของชิ้น = ล่างสุดของกรอบ) ยังนับว่าเห็นครบ', () => {
    expect(computeMenuScrollTarget({ ...box, itemTop: 556, itemHeight: 44 })).toBeNull()
  })

  /**
   * 🛑 สองเคสนี้เติมเข้ามาเพราะ mutation "ถอดกิ่ง *เห็นครบแล้วไม่ขยับ* ทิ้ง" แล้วเทสยังเขียว
   * (docs/conventions/mutation-silence-means-weak-corpus.md) — เคสอื่นทั้งหมดมี `scrollTop: 0`
   * พอดี ผลของสูตร "เลื่อนน้อยที่สุด" จึงถูก clamp กลับมาเป็น 0 = เท่ากับ scrollTop เดิม แล้ว
   * ด่านท้ายฟังก์ชัน ("ปัดแล้วได้ที่เดิม → null") กลบร่องรอยของกิ่งที่หายไปพอดีเป๊ะ
   * ต้องมี input ที่ **กล่องถูกเลื่อนมาแล้ว** เท่านั้นถึงจะแยกสองกิ่งนี้ออกจากกันได้
   * ห้ามลบทิ้งเพราะคิดว่าซ้ำกับเคสข้างบน
   */
  it('กล่องเลื่อนมาแล้วและเมนูที่ active เห็นครบ → null (ไม่ใช่เด้งกลับไปบนสุด)', () => {
    // กรอบมองเห็น 200–800 · ชิ้นอยู่ 250–294 = เห็นครบ
    expect(computeMenuScrollTarget({ ...box, scrollTop: 200, itemTop: 250, itemHeight: 44 })).toBeNull()
  })

  it('กล่องเลื่อนมาแล้วและชิ้นอยู่ท้ายกรอบพอดี → null', () => {
    // กรอบ 200–800 · ชิ้น 750–794
    expect(computeMenuScrollTarget({ ...box, scrollTop: 200, itemTop: 750, itemHeight: 44 })).toBeNull()
  })

  it('ล้นขอบล่างไป 1px → เลื่อนน้อยที่สุดให้ชิดล่าง ไม่ใช่จัดกึ่งกลาง', () => {
    // itemBottom 601 − clientHeight 600 = 1
    expect(computeMenuScrollTarget({ ...box, itemTop: 557, itemHeight: 44 })).toBe(1)
  })

  it('อยู่เหนือกรอบ → ชิดบน', () => {
    expect(computeMenuScrollTarget({ ...box, scrollTop: 400, itemTop: 100, itemHeight: 44 })).toBe(100)
  })

  it('clamp ท้ายรายการ — ห้ามเลื่อนเกิน scrollHeight − clientHeight', () => {
    expect(computeMenuScrollTarget({ ...box, itemTop: 1380, itemHeight: 44 })).toBe(800)
  })

  it('clamp ค่าติดลบเป็น 0', () => {
    expect(computeMenuScrollTarget({ ...box, scrollTop: 50, itemTop: -20, itemHeight: 44 })).toBe(0)
  })

  it('กล่องยังไม่ถูก layout (clientHeight = 0) → null ไม่ใช่ 0', () => {
    expect(computeMenuScrollTarget({ itemTop: 900, itemHeight: 44, scrollTop: 0, clientHeight: 0, scrollHeight: 0 })).toBeNull()
  })

  it('เนื้อหาสั้นกว่ากรอบ (ไม่มีอะไรให้เลื่อน) → null', () => {
    expect(computeMenuScrollTarget({ itemTop: 10, itemHeight: 44, scrollTop: 0, clientHeight: 600, scrollHeight: 300 })).toBeNull()
  })
})
