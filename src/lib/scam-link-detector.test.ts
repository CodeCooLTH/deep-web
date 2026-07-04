// scam-link-detector.test.ts — Vitest unit tests สำหรับ detectScamLink (S-28/S-33)
// ครอบ heuristic rules ทุกตัว + acceptance cases ตาม req doc + false-positive fixture (FR-SCAM-08)

import { describe, it, expect } from 'vitest'
import { detectScamLink } from './scam-link-detector'

describe('detectScamLink — R-URL gate', () => {
  it('ไม่มี URL เลย → ไม่ flag แม้มีคำเสี่ยง', () => {
    const r = detectScamLink('โอนเงินด่วนนะครับ ธนาคารกสิกร')
    expect(r.flagged).toBe(false)
    expect(r.matchedRules).toEqual([])
    expect(r.score).toBe(0)
  })

  it('ข้อความว่าง/null/undefined → ไม่ flag', () => {
    expect(detectScamLink('').flagged).toBe(false)
    expect(detectScamLink(null).flagged).toBe(false)
    expect(detectScamLink(undefined).flagged).toBe(false)
  })
})

describe('detectScamLink — strong rules', () => {
  it('R-SHORTENER: bit.ly → flag', () => {
    const r = detectScamLink('กดลิงก์นี้เลย https://bit.ly/abc123')
    expect(r.flagged).toBe(true)
    expect(r.matchedRules).toContain('R-SHORTENER')
    expect(r.score).toBeGreaterThanOrEqual(2)
  })

  it('R-SHORTENER: bare-domain shortener ไม่มี protocol ก็ flag', () => {
    const r = detectScamLink('ดูของที่ tinyurl.com/promo')
    expect(r.flagged).toBe(true)
    expect(r.matchedRules).toContain('R-SHORTENER')
  })

  it('R-IP-URL: IP แทนโดเมน → flag', () => {
    const r = detectScamLink('เข้าสู่ระบบที่ http://192.168.1.5/login')
    expect(r.flagged).toBe(true)
    expect(r.matchedRules).toContain('R-IP-URL')
  })

  it('R-CRED-IN-URL: user:pass@host → flag', () => {
    const r = detectScamLink('login ที่ https://user:pass1234@evil-site.com/verify')
    expect(r.flagged).toBe(true)
    expect(r.matchedRules).toContain('R-CRED-IN-URL')
  })

  it('R-LOOKALIKE: typo-squat deepthailand.app (Levenshtein=1) → flag', () => {
    const r = detectScamLink('เข้า https://deepthailnd.app/promo ด่วน')
    expect(r.flagged).toBe(true)
    expect(r.matchedRules).toContain('R-LOOKALIKE')
  })

  it('R-LOOKALIKE: typo-squat ธนาคาร (kbank.co.th) → flag', () => {
    // โดเมนสลับตัวอักษร kbnak.co.th (Levenshtein=2 จาก kbank.co.th)
    const r = detectScamLink('ยืนยันที่ https://kbnak.co.th/otp')
    expect(r.flagged).toBe(true)
    expect(r.matchedRules).toContain('R-LOOKALIKE')
  })
})

describe('detectScamLink — weak rules (threshold ≥2)', () => {
  it('R-FREE-TLD เดี่ยว ๆ (weak=1) ไม่พอ flag', () => {
    const r = detectScamLink('ดูของที่ http://promo-site.tk/sale')
    expect(r.flagged).toBe(false)
    expect(r.matchedRules).toContain('R-FREE-TLD')
    expect(r.score).toBe(1)
  })

  it('R-KEYWORD เดี่ยว ๆ ไม่มี URL ไม่ flag (ครอบด้วย R-URL gate อยู่แล้ว)', () => {
    const r = detectScamLink('โอนเงินให้หน่อยครับ')
    expect(r.flagged).toBe(false)
  })

  it('R-FREE-TLD + R-KEYWORD (weak=2) → flag', () => {
    const r = detectScamLink('โอนเงินด่วน คลิกที่ http://claim-prize99.tk/free')
    expect(r.flagged).toBe(true)
    expect(r.matchedRules).toContain('R-FREE-TLD')
    expect(r.matchedRules).toContain('R-KEYWORD')
    expect(r.score).toBe(2)
  })

  it('English keyword (urgent) + free TLD → flag', () => {
    const r = detectScamLink('Urgent! verify your account at http://acc-verify.ga/login')
    expect(r.flagged).toBe(true)
    expect(r.matchedRules).toContain('R-KEYWORD')
    expect(r.matchedRules).toContain('R-FREE-TLD')
  })
})

describe('detectScamLink — FR-SCAM-07 allowlist', () => {
  it('deepthailand.app/u/x → ไม่ flag แม้มีคำเสี่ยง', () => {
    const r = detectScamLink('โอนเงินยืนยันบัญชีที่ https://deepthailand.app/u/somchai ด่วนที่สุด')
    expect(r.flagged).toBe(false)
    expect(r.matchedRules).toEqual([])
  })

  it('subdomain ของ deepthailand.app ก็ allowlist', () => {
    const r = detectScamLink('ดูออเดอร์ที่ https://seller.deepthailand.app/o/abc123')
    expect(r.flagged).toBe(false)
  })

  it('ผสม URL ของตัวเอง + URL อื่นที่มี signal → ยัง flag ได้ (ไม่ใช่ทุก URL allowlisted)', () => {
    const r = detectScamLink('เทียบกับ https://deepthailand.app/u/x และ https://bit.ly/scam')
    expect(r.flagged).toBe(true)
    expect(r.matchedRules).toContain('R-SHORTENER')
  })
})

describe('detectScamLink — acceptance cases (req doc)', () => {
  it('youtube URL เดียวไม่มี signal → ไม่ flag', () => {
    const r = detectScamLink('ดูคลิปนี้ https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(r.flagged).toBe(false)
    expect(r.matchedRules).toEqual([])
  })
})

describe('detectScamLink — false-positive fixture (FR-SCAM-08)', () => {
  it('YouTube ไม่ flag', () => {
    expect(detectScamLink('เชิญดูช่อง https://www.youtube.com/c/somechannel').flagged).toBe(false)
  })

  it('Facebook ไม่ flag', () => {
    expect(detectScamLink('ร้านฉันอยู่ที่ https://www.facebook.com/myshop').flagged).toBe(false)
  })

  it('deepthailand.app เอง (bare, ไม่มี protocol) ไม่ flag', () => {
    expect(detectScamLink('เว็บเราคือ deepthailand.app นะ').flagged).toBe(false)
  })

  it('ขนส่งไทยไปรษณีย์ (thailandpost.co.th) ไม่ flag', () => {
    expect(
      detectScamLink('เช็คสถานะพัสดุที่ https://www.thailandpost.co.th/track').flagged,
    ).toBe(false)
  })
})
