import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hashDetailToken, isWellFormedToken, newDetailToken } from '../detail-token'

describe('detail-token', () => {
  it('22 ตัว base64url · hash = sha256 hex 64 ตัว · hash ตรงกับ token', () => {
    const { token, hash } = newDetailToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(isWellFormedToken(token)).toBe(true)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashDetailToken(token)).toBe(hash)
    expect(hash).not.toContain(token)
  })
  it('ไม่ซ้ำใน 10,000 ครั้ง', () => {
    expect(new Set(Array.from({ length: 10000 }, () => newDetailToken().token)).size).toBe(10000)
  })
  it('isWellFormedToken ปฏิเสธรูปผิด', () => {
    for (const s of ['', 'a'.repeat(21), 'a'.repeat(23), 'a'.repeat(21) + '+', 'a'.repeat(21) + ' ', null, 5]) expect(isWellFormedToken(s)).toBe(false)
  })
  it('ซอร์สไม่ใช้ Math.random', () => {
    expect(readFileSync(join(__dirname, '../detail-token.ts'), 'utf8')).not.toMatch(/Math\.random/)
  })
})
