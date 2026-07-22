import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// เข้ารหัส page access token ก่อนเก็บลง ShopChannel.accessTokenEnc (feature 00018)
// AES-256-GCM: ได้ทั้งความลับและ integrity (auth tag) — ciphertext ที่ถูกแก้จะถอดไม่ผ่าน
// รูปแบบที่เก็บ: "<ivBase64>.<tagBase64>.<cipherBase64>"

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 12 // ความยาวมาตรฐานของ GCM

function key(): Buffer {
  const raw = process.env.CHANNEL_TOKEN_KEY
  if (!raw) throw new Error('CHANNEL_TOKEN_KEY_MISSING')
  const buf = Buffer.from(raw, 'hex')
  if (buf.length !== 32) throw new Error('CHANNEL_TOKEN_KEY_INVALID') // ต้องเป็น hex 64 ตัว = 32 byte
  return buf
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.')
}

export function decryptToken(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('CHANNEL_TOKEN_MALFORMED')
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}
