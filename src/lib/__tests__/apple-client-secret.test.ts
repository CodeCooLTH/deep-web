import { generateKeyPairSync } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { createAppleClientSecret, isApplePrivateRelayEmail } from '@/lib/apple-client-secret'

/**
 * client secret ของ Apple คือ JWT ที่ต้องเซ็นให้ถูกรูปแบบเป๊ะ — ผิดนิดเดียว Apple ตอบแค่
 * `invalid_client` โดยไม่บอกสาเหตุ ทำให้ debug ยากมาก จึงต้องมีเทสยืนยันโครงสร้างทุกส่วน
 * (App Store Guideline 4.8 — rejection 2026-08-04)
 */

/** คีย์ EC P-256 ของปลอมสำหรับเทส — ไม่ใช่คีย์จริง ไม่มีค่าอะไรถ้าหลุด */
const { privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const INPUT = {
  teamId: 'TEAM123456',
  keyId: 'KEY1234567',
  clientId: 'com.example.app.web',
  privateKey,
  nowSec: 1_800_000_000,
}

function decode(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
}

describe('createAppleClientSecret', () => {
  const jwt = createAppleClientSecret(INPUT)
  const [rawHeader, rawPayload, rawSignature] = jwt.split('.')

  it('ได้ JWT 3 ส่วน', () => {
    expect(jwt.split('.')).toHaveLength(3)
    expect(rawSignature).toBeTruthy()
  })

  it('[blocker] header ต้องเป็น ES256 + kid = Key ID', () => {
    // Apple ใช้ kid หา public key มาตรวจลายเซ็น — ผิด = invalid_client
    expect(decode(rawHeader!)).toMatchObject({ alg: 'ES256', kid: 'KEY1234567' })
  })

  it('[blocker] payload ต้องครบตามสเปกของ Apple', () => {
    // sub ต้องเป็น Services ID ไม่ใช่ bundle id ของแอป — สลับกันคือความผิดพลาดที่พบบ่อยที่สุด
    expect(decode(rawPayload!)).toEqual({
      iss: 'TEAM123456',
      sub: 'com.example.app.web',
      aud: 'https://appleid.apple.com',
      iat: 1_800_000_000,
      exp: 1_800_000_000 + 15777000,
    })
  })

  it('[blocker] อายุต้องไม่เกิน 6 เดือน (เพดานของ Apple)', () => {
    const { iat, exp } = decode(rawPayload!) as { iat: number; exp: number }
    expect(exp - iat).toBeLessThanOrEqual(15777000)
  })

  it('[blocker] ลายเซ็นต้องเป็นรูป P1363 (64 ไบต์) ไม่ใช่ DER', () => {
    // 🛑 ค่า default ของ Node คือ DER ซึ่งยาวไม่คงที่ (~70-72 ไบต์) และ JOSE ไม่รับ
    // ถ้าเทสนี้แดง = ลืม dsaEncoding: 'ieee-p1363' แล้ว Apple จะปฏิเสธทุกครั้งโดยไม่บอกสาเหตุ
    expect(Buffer.from(rawSignature!, 'base64url')).toHaveLength(64)
  })

  it('รับ private key ที่ newline เป็น \\n ตัวอักษร (รูปแบบที่ env var เก็บได้)', () => {
    // Vercel/.env เก็บค่าหลายบรรทัดตรง ๆ ไม่ได้ คนตั้งค่าจึงวางเป็นบรรทัดเดียว
    const escaped = privateKey.replace(/\n/g, '\\n')
    expect(() => createAppleClientSecret({ ...INPUT, privateKey: escaped })).not.toThrow()
  })

  it('private key ใช้ไม่ได้ → throw (ไม่กลืนเงียบ)', () => {
    // ผู้เรียกจับ error นี้แล้วเลือกไม่เปิด provider เลย ดีกว่าให้ปุ่มโผล่แล้วกดไม่ได้
    expect(() => createAppleClientSecret({ ...INPUT, privateKey: 'ไม่ใช่คีย์' })).toThrow()
  })
})

describe('isApplePrivateRelayEmail', () => {
  it('[blocker] จับอีเมลซ่อนของ Apple ได้', () => {
    // ถ้าหลุด = อีเมลปลอมจะถูกใช้จับคู่ประวัติลูกค้าเก่าและกลายเป็นอีเมลของผู้ใช้ในระบบเรา
    expect(isApplePrivateRelayEmail('x7k9m2p@privaterelay.appleid.com')).toBe(true)
    expect(isApplePrivateRelayEmail('X7K9M2P@PrivateRelay.AppleID.com')).toBe(true)
  })

  it('อีเมลจริงต้องไม่ถูกตีเป็นอีเมลซ่อน', () => {
    expect(isApplePrivateRelayEmail('somchai@gmail.com')).toBe(false)
    expect(isApplePrivateRelayEmail('a@apple.com')).toBe(false)
    // โดเมนที่ "ลงท้ายคล้าย" แต่ไม่ใช่ — กันคนเขียน includes() แทน endsWith()
    expect(isApplePrivateRelayEmail('a@privaterelay.appleid.com.evil.co')).toBe(false)
  })

  it('ไม่มีอีเมล → false ไม่ throw', () => {
    expect(isApplePrivateRelayEmail(null)).toBe(false)
    expect(isApplePrivateRelayEmail(undefined)).toBe(false)
  })
})
