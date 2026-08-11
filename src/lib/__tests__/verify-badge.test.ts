/**
 * [blocker] ป้ายยืนยันต้องพูดคำเดียวกันและสีเดียวกันทุกจอ — feature 00041
 *
 * ป้ายนี้โผล่บนสองจอที่ผู้ซื้อคนเดียวกันเห็น **ห่างกันไม่กี่วินาที**:
 * `/o/{token}` (หน้าออเดอร์สาธารณะ) แล้วกดเข้าสู่ระบบไปเจอ `OrderLinkShell` ต่อทันที
 * ถ้าคำหรือสีไม่ตรงกัน ผู้ใช้สังเกตได้ทันที และมันบั่นทอนสิ่งเดียวที่ป้ายนี้มีไว้ทำ (HR16)
 *
 * 🛑 แดง = ห้าม merge
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import { resolveVerifyBadge, VERIFY_BADGE_PALETTE } from '../verify-badge'

describe('resolveVerifyBadge', () => {
  // 🛑 L1 = ยืนยันเบอร์ด้วย OTP ซึ่งซื้อซิมเติมเงินที่ร้านสะดวกซื้อก็ทำได้
  // ให้เขียวเท่าร้านที่ส่งเอกสารให้แอดมินตรวจ = ทำให้สัญญาณเฟ้อ (Verified-Means-Green)
  it('L1 ไม่ใช่สีเขียว', () => {
    expect(resolveVerifyBadge(1)).toMatchObject({ tone: 'neutral', label: 'ยืนยันเบอร์แล้ว' })
  })

  it('L2 เขียว · L3 ทอง — แยกระดับจริง ไม่ใช่ป้ายเดียวกันหมด', () => {
    expect(resolveVerifyBadge(2)).toMatchObject({ tone: 'green' })
    expect(resolveVerifyBadge(3)).toMatchObject({ tone: 'gold' })
    expect(resolveVerifyBadge(2)?.label).not.toBe(resolveVerifyBadge(3)?.label)
  })

  // ไม่มีป้ายเลย ไม่ใช่ป้ายที่เขียนว่า "ยังไม่ยืนยัน" — ไม่ประจานร้านใหม่
  it('L0 ไม่มีป้าย', () => {
    expect(resolveVerifyBadge(0)).toBeNull()
  })

  it('ระดับเกิน 3 ยังได้ป้ายสูงสุด ไม่ใช่หลุดเป็น null', () => {
    expect(resolveVerifyBadge(9)).toMatchObject({ tone: 'gold' })
  })

  // ตัวอักษรต้องเป็นเฉด ink — สี main บนพื้นจางวัดได้ 1.8–3.5:1 ซึ่งตก AA ทุกคู่
  it('ทุกโทนมีคู่สีครบ และตัวอักษรไม่ใช่สี main ของธีม', () => {
    for (const tone of ['neutral', 'green', 'gold'] as const) {
      const p = VERIFY_BADGE_PALETTE[tone]

      expect(p.bg).toBeTruthy()
      expect(p.fg).toBeTruthy()
    }
    expect(VERIFY_BADGE_PALETTE.green.fg).not.toBe('#28C76F')
    expect(VERIFY_BADGE_PALETTE.gold.fg).not.toBe('#FF9F43')
  })
})

describe('ทุกจอที่แสดงป้ายนี้อ่านจาก SSOT เดียว', () => {
  const CALLERS = [
    'src/app/(marketing)/o/[token]/GuestOrderView.tsx',
    'src/app/(marketing)/auth/sign-in/OrderLinkShell.tsx',
  ]

  it('ไม่มีจอไหนถือรายชื่อระดับ/คำของตัวเอง', () => {
    for (const p of CALLERS) {
      const src = readFileSync(join(process.cwd(), p), 'utf8')

      expect(src).toContain('resolveVerifyBadge')
      // ฟังก์ชันท้องถิ่นชื่อเดิมที่เคยมีในไฟล์ sign-in — ห้ามกลับมา
      expect(src).not.toMatch(/function verifyBadge\s*\(/)
    }
  })

  it('ไม่มีจอไหนแปลโทนเป็นสีเอง', () => {
    const shell = readFileSync(join(process.cwd(), CALLERS[1]), 'utf8')

    expect(shell).toContain('VERIFY_BADGE_PALETTE')
    expect(shell).not.toContain('bg-success/15 text-success')
  })
})
