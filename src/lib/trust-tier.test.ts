// trust-tier.test.ts — Vitest unit tests สำหรับ getTierAccentColor (Impeccable remediation S-B7)
// + regression getTierColor() เดิม (ต้องไม่ถูกรื้อ)

import { describe, it, expect } from 'vitest'
import { getTierColor, getTierAccentColor, getTierGradient } from './trust-tier'

// -------------------------------------------------------------------------
// getTierAccentColor — เคสบังคับจาก Controller
// -------------------------------------------------------------------------
describe('getTierAccentColor', () => {
  it('ทั้ง 5 tier คืนค่าต่างกันครบ ไม่มีคู่ไหนซ้ำ', () => {
    const scores = [95, 85, 75, 65, 45] // A+, A, B+, B, C (ตัวแทนแต่ละ tier)
    const colors = scores.map(getTierAccentColor)
    expect(new Set(colors).size).toBe(5)
  })

  it('bug ที่กำลังแก้: Deep Classic ต้องไม่เท่ากับ Deep Gold', () => {
    const classic = getTierAccentColor(45) // C
    const gold = getTierAccentColor(75) // B+
    expect(classic).not.toBe(gold)
  })

  it('D กับ C (ทั้งคู่ Deep Classic) ยังคืนสีเดียวกัน (rollup ตาม SSOT)', () => {
    expect(getTierAccentColor(10)).toBe(getTierAccentColor(45))
  })

  // boundary ของแต่ละช่วงเกรด (ขอบล่าง/ขอบบน)
  it('boundary A+ (90) → Deep Star #7367F0', () => {
    expect(getTierAccentColor(90)).toBe('#7367F0')
    expect(getTierAccentColor(100)).toBe('#7367F0')
  })

  it('boundary A (80-89) → Deep Diamond #00BAD1', () => {
    expect(getTierAccentColor(80)).toBe('#00BAD1')
    expect(getTierAccentColor(89)).toBe('#00BAD1')
  })

  it('boundary B+ (70-79) → Deep Gold #FF9F43', () => {
    expect(getTierAccentColor(70)).toBe('#FF9F43')
    expect(getTierAccentColor(79)).toBe('#FF9F43')
  })

  it('boundary B (60-69) → Deep Silver #7a7689', () => {
    expect(getTierAccentColor(60)).toBe('#7a7689')
    expect(getTierAccentColor(69)).toBe('#7a7689')
  })

  it('boundary C (40-59) → Deep Classic #b36700', () => {
    expect(getTierAccentColor(40)).toBe('#b36700')
    expect(getTierAccentColor(59)).toBe('#b36700')
  })

  it('boundary D (0-39) → Deep Classic #b36700', () => {
    expect(getTierAccentColor(0)).toBe('#b36700')
    expect(getTierAccentColor(39)).toBe('#b36700')
  })
})

// -------------------------------------------------------------------------
// Regression — getTierColor() เดิมต้องไม่ถูกแก้/รื้อ (พิสูจน์ยังคืนค่าเหมือนเดิมทุกกรณี)
// -------------------------------------------------------------------------
describe('getTierColor (regression — ต้องไม่เปลี่ยนจากของเดิม)', () => {
  it('A+ (90-100) → secondary', () => {
    expect(getTierColor(90)).toBe('secondary')
    expect(getTierColor(100)).toBe('secondary')
  })

  it('A (80-89) → info', () => {
    expect(getTierColor(80)).toBe('info')
    expect(getTierColor(89)).toBe('info')
  })

  it('B+ (70-79) → warning', () => {
    expect(getTierColor(70)).toBe('warning')
    expect(getTierColor(79)).toBe('warning')
  })

  it('B (60-69) → default', () => {
    expect(getTierColor(60)).toBe('default')
    expect(getTierColor(69)).toBe('default')
  })

  it('C (40-59) → warning (ยังเป็นค่าเดิม — คู่กับ B+ นี่แหละคือบั๊กที่ getTierAccentColor แก้)', () => {
    expect(getTierColor(40)).toBe('warning')
    expect(getTierColor(59)).toBe('warning')
  })

  it('D (0-39) → warning', () => {
    expect(getTierColor(0)).toBe('warning')
    expect(getTierColor(39)).toBe('warning')
  })
})

// -------------------------------------------------------------------------
// getTierGradient — S-B9 (Impeccable remediation Phase B): sync กับ ramp ที่อนุมัติแล้ว
// -------------------------------------------------------------------------
describe('getTierGradient', () => {
  it('ทั้ง 5 tier คืน gradient ต่างกันครบ ไม่มีคู่ไหนซ้ำ', () => {
    const scores = [95, 85, 75, 65, 45] // A+, A, B+, B, C (ตัวแทนแต่ละ tier)
    const gradients = scores.map(getTierGradient)
    expect(new Set(gradients).size).toBe(5)
  })

  it('ไม่มี Tailwind hex เก่าหลงเหลือ (เดิม #F59E0B/#0EA5E9/#F97316/#C2410C/#B45309/#FCD34D/#FDBA74/#6558E8/#A79DF5/#0284C7/#7DD3FC)', () => {
    const oldHexPattern = /#F59E0B|#0EA5E9|#F97316|#C2410C|#B45309|#FCD34D|#FDBA74|#6558E8|#A79DF5|#0284C7|#7DD3FC/i
    const scores = [95, 85, 75, 65, 45, 10]
    scores.forEach((score) => {
      expect(getTierGradient(score)).not.toMatch(oldHexPattern)
    })
  })

  it('Deep Star (A+) → primary canonical ramp', () => {
    expect(getTierGradient(90)).toBe('linear-gradient(135deg, #5a4ee0 0%, #7367F0 45%, #b3acf8 100%)')
  })

  it('Deep Diamond (A) → signal-cyan canonical ramp', () => {
    expect(getTierGradient(80)).toBe('linear-gradient(135deg, #009eb2 0%, #00BAD1 45%, #8ee5ee 100%)')
  })

  it('Deep Gold (B+) → warning-amber canonical ramp', () => {
    expect(getTierGradient(70)).toBe('linear-gradient(135deg, #e08400 0%, #FF9F43 45%, #ffd1a3 100%)')
  })

  it('Deep Silver (B) → ink tonalRamp', () => {
    expect(getTierGradient(60)).toBe('linear-gradient(135deg, #454155 0%, #7a7689 45%, #bdbbc7 100%)')
  })

  it('Deep Classic (C, D) → warning-amber tonalRamp เข้มกว่า Gold', () => {
    expect(getTierGradient(45)).toBe('linear-gradient(135deg, #5c3300 0%, #b36700 45%, #FF9F43 100%)')
    expect(getTierGradient(10)).toBe(getTierGradient(45))
  })
})
