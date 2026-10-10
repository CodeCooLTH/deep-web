import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NEW_PASSWORD_MESSAGES as M, newPasswordError, passwordStrength } from '@/lib/new-password-rules'
import { isStrongPassword } from '@/lib/password'
import {
  buildSetPasswordHtml,
  readSetPasswordForm,
} from '@/app/(paces)/seller/(dashboard)/account/components/set-password-dialog'

/**
 * [blocker] ป๊อปอัปตั้งรหัสผ่านใหม่ในหน้าบัญชี = หน้าตา/กติกาเดียวกับหน้า "ตั้งรหัสผ่านใหม่" (2026-10-10)
 * user: "รหัสผ่านใหม่ เงื่อนไข ปุ่มดูรหัส ทุกอย่างต้องเหมือนกับหน้า login · ตอนนี้เปิดดูรหัสผ่านไม่ได้"
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const DIR = 'src/app/(paces)/seller/'

/** DOM จิ๋วพอให้ readSetPasswordForm อ่านค่าได้ (vitest รันใน node) */
const form = (v: Record<string, string>) => ({
  querySelector: (sel: string) => ({ value: v[sel.replace('#', '')] ?? '' }),
}) as unknown as ParentNode

describe('newPasswordError — ลำดับ/ข้อความเดียวกับ Yup ของหน้า new-pass', () => {
  it('ไล่ทีละข้อ', () => {
    expect(newPasswordError('', '')).toBe(M.required)
    expect(newPasswordError('a1!', 'a1!')).toBe(M.min)
    expect(newPasswordError('12345678!', '')).toBe(M.letter)
    expect(newPasswordError('abcdefgh!', '')).toBe(M.number)
    expect(newPasswordError('abcdefg1', '')).toBe(M.special)
    expect(newPasswordError('abcdef1!', '')).toBe(M.confirmRequired)
    expect(newPasswordError('abcdef1!', 'abcdef1?')).toBe(M.mismatch)
    expect(newPasswordError('abcdef1!', 'abcdef1!')).toBeNull()
  })

  it('ผ่านฝั่งจอ ⇒ ผ่าน server ด้วย (ไม่ให้ผู้ใช้เจอ "ผ่าน" แล้วโดน server ตีกลับ)', () => {
    for (const pw of ['abcdef1!', 'Pass_word1', 'รหัสabc12', 'a1 bcdefg']) {
      if (newPasswordError(pw, pw) === null) expect(isStrongPassword(pw), pw).toBe(true)
    }
  })

  it('แถบความแข็งแรงสูตรเดิม', () => {
    expect(passwordStrength('')).toBe(0)
    expect(passwordStrength('abcdefgh')).toBe(1)
    expect(passwordStrength('Abcdefg1!')).toBe(4)
  })
})

describe('[blocker] ป๊อปอัป', () => {
  it('มีช่องรหัสใหม่ + ยืนยัน ทั้งคู่มีปุ่มดูรหัส · แถบความแข็งแรง · คำอธิบายกติกา', () => {
    const html = buildSetPasswordHtml('095xxxx429')
    expect(html).toContain('id="pw-new"')
    expect(html).toContain('id="pw-confirm"')
    expect(html).toContain('data-pw-toggle="pw-new"')
    expect(html).toContain('data-pw-toggle="pw-confirm"')
    expect(html.match(/class="strong-bar"/g)).toHaveLength(4)
    expect(html).toContain('≥8 ตัว มีตัวอักษร ตัวเลข และอักขระพิเศษ')
  })

  it('เบอร์ถูก escape ก่อนลง HTML', () => {
    expect(buildSetPasswordHtml('<img src=x onerror=1>')).not.toContain('<img')
  })

  it('readSetPasswordForm: OTP ก่อน แล้วกติการหัสผ่าน · ผ่านหมดได้ค่าพร้อมส่ง', () => {
    expect(readSetPasswordForm(form({ 'pw-otp': '12', 'pw-new': 'abcdef1!', 'pw-confirm': 'abcdef1!' }))).toEqual({
      error: 'รหัส OTP ต้องเป็นตัวเลข 6 หลัก',
    })
    expect(readSetPasswordForm(form({ 'pw-otp': '123456', 'pw-new': 'abcdef1!', 'pw-confirm': 'x' }))).toEqual({ error: M.mismatch })
    expect(readSetPasswordForm(form({ 'pw-otp': ' 123456 ', 'pw-new': 'abcdef1!', 'pw-confirm': 'abcdef1!' }))).toEqual({
      otp: '123456',
      password: 'abcdef1!',
    })
  })

  it('ConnectedAccountsClient ใช้ตัวช่วยชุดนี้ ไม่เขียนกติกาเอง', () => {
    const c = read(DIR + '(dashboard)/account/components/ConnectedAccountsClient.tsx')
    expect(c).toMatch(/html: buildSetPasswordHtml\(String\(sent\.value\)\)/)
    expect(c).toMatch(/didOpen: \(popup\) => wireSetPasswordDialog\(popup\)/)
    expect(c).toMatch(/readSetPasswordForm\(Swal\.getPopup\(\) \?\? document\)/)
    expect(c).not.toContain('id="pw-new" class="form-input" type="password"')
  })

  it('หน้า new-pass ใช้ข้อความ/รูปแบบชุดเดียวกัน', () => {
    const f = read(DIR + 'auth/new-pass/components/NewPassForm.tsx')
    expect(f).toMatch(/\.min\(8, NEW_PASSWORD_MESSAGES\.min\)/)
    expect(f).toMatch(/\.oneOf\(\[Yup\.ref\('password'\)\], NEW_PASSWORD_MESSAGES\.mismatch\)/)
  })
})

describe('[blocker] กล่องข้อความหลายบรรทัดต้องใช้ form-textarea (ร้านบริการ)', () => {
  it('ที่อยู่บนใบเสร็จ + คำอธิบายประเภทงาน', () => {
    for (const p of [
      '(dashboard)/shop/components/ShopReceiptProfileField.tsx',
      '(dashboard)/settings/job-types/components/ResourceForm.tsx',
    ]) {
      const src = read(DIR + p)
      expect(src, p).toMatch(/<textarea[^>]*?className="form-textarea"/)
      expect(src, p).not.toMatch(/<textarea[^>]*?className="form-input"/)
    }
  })
})
