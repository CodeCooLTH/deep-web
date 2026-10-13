import { describe, expect, it } from 'vitest'
import { emptyToUndefined, finishDecimalInput, parseDecimalInput, parseIntInput } from '../numeric-input'

describe('parseIntInput', () => {
  it('เก็บเฉพาะเลข', () => {
    expect(parseIntInput('12')).toBe(12)
    expect(parseIntInput('1a2-')).toBe(12)
  })
  it('ตัดที่จุดทศนิยม · แปลงเลขไทย', () => {
    expect(parseIntInput('12.5')).toBe(12)
    expect(parseIntInput('๑๒')).toBe(12)
    expect(parseDecimalInput('๙๙.๕')).toBe(99.5)
  })
  it('ว่าง → ""', () => {
    expect(parseIntInput('')).toBe('')
    expect(parseIntInput('abc')).toBe('')
  })
})

describe('parseDecimalInput', () => {
  it('ค่าที่พิมพ์จบแล้วเป็น number', () => {
    expect(parseDecimalInput('360')).toBe(360)
    expect(parseDecimalInput('12.5')).toBe(12.5)
    expect(parseDecimalInput('12.05')).toBe(12.05)
  })
  it('ค่าที่ยังพิมพ์ไม่จบคงเป็น string — ไม่งั้นจุด/ศูนย์ท้ายหายจากช่อง', () => {
    expect(parseDecimalInput('12.')).toBe('12.')
    expect(parseDecimalInput('1.50')).toBe('1.50')
    expect(parseDecimalInput('0.0')).toBe('0.0')
    expect(parseDecimalInput('.')).toBe('0.')
  })
  it('จุดเดียว + ทศนิยมไม่เกิน 2 ตำแหน่ง', () => {
    expect(parseDecimalInput('1.2.3')).toBe(1.23)
    expect(parseDecimalInput('1.239')).toBe(1.23)
    expect(parseDecimalInput('1.2', 0)).toBe('1.')
  })
  it('ตัด 0 นำหน้าแต่คง 0.x · ทิ้งอักขระอื่น/ติดลบ', () => {
    expect(parseDecimalInput('0360')).toBe(360)
    expect(parseDecimalInput('0.5')).toBe(0.5)
    expect(parseDecimalInput('0')).toBe(0)
    expect(parseDecimalInput('-5')).toBe(5)
    expect(parseDecimalInput('฿1,200')).toBe(1200)
  })
  it('ว่าง → ""', () => {
    expect(parseDecimalInput('')).toBe('')
    expect(parseDecimalInput('abc')).toBe('')
  })
})

describe('finishDecimalInput', () => {
  it('string ที่ค้าง → number · ค่าอื่นคืนเดิม', () => {
    expect(finishDecimalInput('12.')).toBe(12)
    expect(finishDecimalInput('1.50')).toBe(1.5)
    expect(finishDecimalInput(7)).toBe(7)
    expect(finishDecimalInput('')).toBe('')
    expect(finishDecimalInput(undefined)).toBe(undefined)
  })
})

describe('emptyToUndefined', () => {
  it('ว่าง → undefined แต่ 0 ยังเป็น 0', () => {
    expect(emptyToUndefined('')).toBe(undefined)
    expect(emptyToUndefined(0)).toBe(0)
    expect(emptyToUndefined('12.')).toBe('12.')
  })
})
