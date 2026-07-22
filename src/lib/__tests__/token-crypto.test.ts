import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  // key 32 byte เป็น hex 64 ตัว
  process.env.CHANNEL_TOKEN_KEY = 'a'.repeat(64)
})

describe('token-crypto', () => {
  it('encrypt แล้ว decrypt กลับได้ค่าเดิม', async () => {
    const { encryptToken, decryptToken } = await import('@/lib/token-crypto')
    const plain = 'EAAG_fake_page_access_token_1234567890'
    expect(decryptToken(encryptToken(plain))).toBe(plain)
  })

  it('ciphertext ต่างกันทุกครั้งแม้ plaintext เดิม (IV สุ่ม)', async () => {
    const { encryptToken } = await import('@/lib/token-crypto')
    expect(encryptToken('same')).not.toBe(encryptToken('same'))
  })

  it('ciphertext ที่ถูกแก้ไข → throw (auth tag ไม่ผ่าน)', async () => {
    const { encryptToken, decryptToken } = await import('@/lib/token-crypto')
    const enc = encryptToken('secret')
    const [iv, tag, data] = enc.split('.')
    const tampered = `${iv}.${tag}.${Buffer.from('evil').toString('base64')}`
    expect(() => decryptToken(tampered)).toThrow()
    expect(decryptToken(enc)).toBe('secret') // ของเดิมยังถอดได้
    void data
  })
})
