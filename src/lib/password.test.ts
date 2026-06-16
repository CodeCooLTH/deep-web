import { describe, it, expect } from 'vitest'
import { isStrongPassword, hashPassword, verifyPassword } from './password'

describe('password', () => {
  it('requires >=8 chars with letter + number + special', () => {
    expect(isStrongPassword('Abcd123!')).toBe(true)
    expect(isStrongPassword('short1!')).toBe(false)
    expect(isStrongPassword('abcdefgh')).toBe(false)
    expect(isStrongPassword('abcd1234')).toBe(false)
    expect(isStrongPassword('!!!!!!!!')).toBe(false)
    expect(isStrongPassword('a'.repeat(1001) + '1!')).toBe(false)
  })
  it('hashes and verifies round-trip', async () => {
    const hash = await hashPassword('Abcd123!')
    expect(hash).not.toBe('Abcd123!')
    expect(await verifyPassword('Abcd123!', hash)).toBe(true)
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })
})
