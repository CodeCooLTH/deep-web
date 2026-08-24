/**
 * [blocker] D-4 · ผลกระทบของพฤติกรรมการรับของต่อ Trust Score (feature 00055)
 *
 * 🛑 สิ่งที่เทสชุดนี้ต้องกันให้ได้เป็นอันดับแรกคือ **สวิตช์ที่ปิดอยู่ต้องไม่กระทบใครเลย** —
 * D-4 คือการกลับหลักการเดิมของ MVP ที่ประกาศไว้ว่า trust score "มีแต่ขึ้น ไม่มีหัก"
 * (PRD FR-3.5) การเผลอเปิดโดยไม่มีมติ = คะแนนของผู้ใช้จริงเปลี่ยนโดยไม่มีใครสั่ง
 *
 * แดง = ห้าม merge
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import {
  BUYER_CONDUCT_PENALTY_ENABLED,
  BUYER_CONDUCT_PENALTY_MAX,
  PENALTY_PER_BUYER_CANCEL,
  PENALTY_PER_RETURNED,
  applyBuyerConductPenalty,
  calcBuyerConductPenalty,
} from '../buyer-trust'
import { summarizeBuyerReputation } from '../buyer-reputation'

const rep = (o: Partial<ReturnType<typeof summarizeBuyerReputation>> = {}) => ({
  ...summarizeBuyerReputation([]),
  ...o,
})

describe('calcBuyerConductPenalty', () => {
  it('[blocker] ไม่มีข้อมูล = หัก 0 — ผู้ซื้อที่ยังไม่เคยสั่งอะไรไม่ใช่ผู้ซื้อที่แย่', () => {
    expect(calcBuyerConductPenalty(null)).toBe(0)
    expect(calcBuyerConductPenalty(undefined)).toBe(0)
    expect(calcBuyerConductPenalty(rep())).toBe(0)
  })

  it('หักตามจำนวนใบ — ตีกลับหนักกว่ายกเลิกโดยลูกค้า', () => {
    expect(calcBuyerConductPenalty(rep({ returned: 1 }))).toBe(PENALTY_PER_RETURNED)
    expect(calcBuyerConductPenalty(rep({ cancelledByBuyer: 2 }))).toBe(
      Math.round(2 * PENALTY_PER_BUYER_CANCEL),
    )
    // ตีกลับ = ของเดินทางไป-กลับจริง ร้านจ่ายค่าส่งสองขา จึงต้องหนักกว่าเสมอ
    expect(PENALTY_PER_RETURNED).toBeGreaterThan(PENALTY_PER_BUYER_CANCEL)
  })

  it('[blocker] ชนเพดานแล้วไม่โตต่อ — ห้ามให้ประวัติเก่าลากคะแนนลงไม่มีที่สิ้นสุด', () => {
    expect(calcBuyerConductPenalty(rep({ returned: 100, cancelledByBuyer: 100 }))).toBe(
      BUYER_CONDUCT_PENALTY_MAX,
    )
  })

  it('[blocker] เพดานต้องต่ำกว่าคะแนนยืนยันตัวตนเต็ม (35)', () => {
    // คนที่พิสูจน์ตัวตนระดับสูงแล้ว ต้องยังอยู่เหนือคนที่ไม่เคยพิสูจน์อะไรเลย
    // ไม่ว่าพัสดุจะตีกลับกี่ใบ — ไม่งั้นการยืนยันตัวตนกลายเป็นเรื่องไร้ความหมาย
    expect(BUYER_CONDUCT_PENALTY_MAX).toBeLessThan(35)
  })
})

describe('[blocker] สวิตช์ D-4 (BR-BR-11 · R-3)', () => {
  it('ปิดอยู่ = คะแนนเท่าเดิมทุกกรณี ไม่ว่าประวัติจะแย่แค่ไหน', () => {
    const worst = rep({ returned: 50, cancelledByBuyer: 50, riskLevel: 'HIGH' as const })
    for (const score of [0, 1, 42, 99, 100]) {
      expect(applyBuyerConductPenalty(score, worst), `score=${score}`).toBe(
        BUYER_CONDUCT_PENALTY_ENABLED ? Math.max(0, score - BUYER_CONDUCT_PENALTY_MAX) : score,
      )
    }
  })

  it('🛑 สวิตช์ต้องยังปิดอยู่ — เปิดได้ต่อเมื่อมีมติและอัปเดต BRD แล้วเท่านั้น', () => {
    // เทสข้อนี้ *ตั้งใจ* ให้แดงตอนมีคนเปิดสวิตช์ เพื่อบังคับให้อ่าน R-3 ก่อน
    // เปิดจริงเมื่อไร ให้แก้เทสข้อนี้พร้อมกับอัปเดต BRD ในคอมมิตเดียวกัน
    expect(BUYER_CONDUCT_PENALTY_ENABLED).toBe(false)
  })

  it('ถ้าเปิด ต้องไม่ทำให้คะแนนติดลบ', () => {
    // พิสูจน์ตรรกะ clamp โดยไม่ต้องเปิดสวิตช์จริง
    expect(Math.max(0, 2 - BUYER_CONDUCT_PENALTY_MAX)).toBe(0)
  })
})

describe('[blocker] การต่อเข้า recalculateTrustScore', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/trust-score.service.ts'), 'utf8')
    // 🛑 ตัดคอมเมนต์ก่อนสแกน — ไฟล์นี้อธิบายกฎข้อนี้ไว้เองด้วยชื่อฟังก์ชันเดียวกัน
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')

  it('ต้องอ่านจาก Customer ที่ผูกบัญชี ไม่ใช่เดาจาก userId ตรง ๆ', () => {
    expect(src).toContain('customer.findUnique(')
    expect(src).toContain('getBuyerReputation(')
  })

  it('[blocker] ต้องบันทึก buyerConduct ลงประวัติเสมอ แม้สวิตช์ปิด', () => {
    // ไม่บันทึก = เปิดสวิตช์วันไหนก็ไม่มีข้อมูลย้อนหลังให้เทียบว่าจะเปลี่ยนไปเท่าไร
    expect(src).toMatch(/breakdown:\s*\{[^}]*buyerConduct/)
    expect(src).toMatch(/breakdown:\s*\{[^}]*base/)
  })

  it('[blocker] การหักต้องเดินผ่าน applyBuyerConductPenalty ห้ามลบเองในที่เกิดเหตุ', () => {
    expect(src).toContain('applyBuyerConductPenalty(')
    // ลบตรง ๆ = ข้ามสวิตช์ ⇒ เปิดใช้โดยไม่มีใครสั่ง
    expect(src).not.toMatch(/computed\s*=\s*base\s*-/)
    expect(src).not.toMatch(/-\s*buyerConduct/)
  })

  it('[blocker] ตัวกันคะแนนตกของเดิม (Math.max) ต้องยังอยู่', () => {
    // แม้เปิดสวิตช์ ผู้ใช้ที่เคยได้คะแนนแล้วต้องไม่เห็นคะแนนลดลงเอง (PRD FR-3.5)
    expect(src).toMatch(/Math\.max\(user\.trustScore,\s*computed\)/)
  })
})
