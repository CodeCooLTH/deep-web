import { describe, expect, it } from 'vitest'
import { fitToChannelLimit, measureForChannel } from '../fit'

const utf8 = (s: string) => new TextEncoder().encode(s).length
const URL_LINE = 'https://deepthailand.app/o/abcdefghijklmnop'

describe('fitToChannelLimit (TC-116)', () => {
  it('ไม่เกิน = คืนเดิมทุกอักษร', () => {
    const t = `สวัสดี\n${URL_LINE}`
    for (const c of ['MESSENGER', 'INSTAGRAM', 'LINE', 'DEEP'] as const) expect(fitToChannelLimit(t, c)).toBe(t)
  })

  it('IG: ไทย 334 ตัว (1002 bytes) เกินและถูกย่อให้ ≤ 1000 bytes · 333 ตัว (999) ไม่แตะ', () => {
    expect(utf8('ก'.repeat(334))).toBe(1002)
    const fit = fitToChannelLimit('ก'.repeat(334), 'INSTAGRAM')
    expect(utf8(fit)).toBeLessThanOrEqual(1000)
    expect(fit.endsWith('…')).toBe(true)
    expect(fitToChannelLimit('ก'.repeat(333), 'INSTAGRAM')).toBe('ก'.repeat(333))
  })

  it('Messenger/DEEP 2000 · LINE 5000 (ขอบ: เท่าเพดานไม่แตะ, เกิน 1 ย่อ)', () => {
    for (const [c, max] of [['MESSENGER', 2000], ['DEEP', 2000], ['LINE', 5000]] as const) {
      expect(fitToChannelLimit('a'.repeat(max), c)).toBe('a'.repeat(max))
      const fit = fitToChannelLimit('a'.repeat(max + 1), c)
      expect(fit.length).toBe(max)
      expect(fit.endsWith('…')).toBe(true)
    }
  })

  it('ไม่ตัดบรรทัด URL — ย่อบรรทัดข้อความยาวสุดแทน', () => {
    const long = 'ข'.repeat(400)
    const text = `หัว\n${long}\n${URL_LINE}`
    const fit = fitToChannelLimit(text, 'INSTAGRAM') // 3 + 1200 + 43 > 1000
    const lines = fit.split('\n')
    expect(lines[0]).toBe('หัว')
    expect(lines[2]).toBe(URL_LINE)
    expect(utf8(fit)).toBeLessThanOrEqual(1000)
  })

  it('ย่อบรรทัดที่ยาวที่สุดก่อน บรรทัดสั้นอื่นคงอยู่', () => {
    const text = `${'ก'.repeat(10)}\n${'ข'.repeat(400)}\n${'ค'.repeat(20)}`
    const lines = fitToChannelLimit(text, 'INSTAGRAM').split('\n')
    expect(lines[0]).toBe('ก'.repeat(10))
    expect(lines[2]).toBe('ค'.repeat(20))
    expect(lines[1].endsWith('…')).toBe(true)
  })

  it('ไม่ตัดกลาง code point (อีโมจิ surrogate pair)', () => {
    // นำหน้าด้วย 'xx' ให้จุดตัดตกกลางคู่ surrogate ถ้าตัดตามหน่วย UTF-16
    const fit = fitToChannelLimit('xx' + '😀'.repeat(300), 'INSTAGRAM') // 1202 bytes
    expect(measureForChannel(fit, 'INSTAGRAM')).toBeLessThanOrEqual(1000)
    expect(fit).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
    expect(Array.from(fit).slice(2, -1).every((c) => c === '😀')).toBe(true)
  })

  it('บรรทัดเดียวย่อไม่พอ → บรรทัดนั้นถูกตัดทิ้ง แล้วย่อบรรทัดยาวถัดไป', () => {
    const text = `${'ก'.repeat(300)}\n${'ข'.repeat(299)}\n${'ค'.repeat(299)}\n${URL_LINE}`
    const lines = fitToChannelLimit(text, 'INSTAGRAM').split('\n')
    expect(lines[0]).toBe('')
    expect(lines[1].endsWith('…')).toBe(true)
    expect(lines[3]).toBe(URL_LINE)
    expect(utf8(lines.join('\n'))).toBeLessThanOrEqual(1000)
  })

  it('มีแต่ลิงก์ล้น = คืนตามเดิม ไม่ตัดลิงก์', () => {
    const t = 'https://x.co/' + 'a'.repeat(2100)
    expect(fitToChannelLimit(t, 'MESSENGER')).toBe(t)
  })
})
