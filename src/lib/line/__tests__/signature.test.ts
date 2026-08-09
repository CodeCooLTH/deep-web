import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'

const SECRET = 'test_channel_secret_0123456789ab'
const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('base64')

describe('validateSignature', () => {
  it('ลายเซ็นถูกต้อง → true', async () => {
    const { validateSignature } = await import('@/lib/line/signature')
    const body = JSON.stringify({ destination: 'U123', events: [] })
    expect(validateSignature(body, SECRET, sign(body))).toBe(true)
  })

  it('body ถูกแก้หลังเซ็น → false', async () => {
    const { validateSignature } = await import('@/lib/line/signature')
    const sig = sign('{"destination":"U123"}')
    expect(validateSignature('{"destination":"evil"}', SECRET, sig)).toBe(false)
  })

  it('secret ผิด (คนละ channel) → false', async () => {
    const { validateSignature } = await import('@/lib/line/signature')
    const body = JSON.stringify({ destination: 'U123', events: [] })
    const sig = sign(body, 'wrong_secret')
    expect(validateSignature(body, SECRET, sig)).toBe(false)
  })

  it('header เป็น null → false ไม่ throw', async () => {
    const { validateSignature } = await import('@/lib/line/signature')
    expect(validateSignature('{}', SECRET, null)).toBe(false)
  })

  it('header เป็นสตริงว่าง → false ไม่ throw', async () => {
    const { validateSignature } = await import('@/lib/line/signature')
    expect(validateSignature('{}', SECRET, '')).toBe(false)
  })

  it('channelSecret เป็นสตริงว่าง → false ไม่ throw', async () => {
    const { validateSignature } = await import('@/lib/line/signature')
    const body = '{}'
    expect(validateSignature(body, '', sign(body))).toBe(false)
  })

  it('header รูปแบบผิด (ไม่ใช่ base64 ที่ decode แล้วยาวเท่า digest) → false ไม่ throw', async () => {
    const { validateSignature } = await import('@/lib/line/signature')
    expect(validateSignature('{}', SECRET, 'not-a-valid-signature')).toBe(false)
  })

  it('ลายเซ็นยาวไม่เท่ากับ digest (สั้นกว่ามาก) → false ไม่ throw', async () => {
    const { validateSignature } = await import('@/lib/line/signature')
    expect(validateSignature('{}', SECRET, 'YWJj')).toBe(false)
  })

  it('redelivery — ลายเซ็นเดิมของ body เดิม ยัง validate ผ่านซ้ำได้ (ไม่ผูกกับ state)', async () => {
    const { validateSignature } = await import('@/lib/line/signature')
    const body = JSON.stringify({ destination: 'U123', events: [{ type: 'message' }] })
    const sig = sign(body)
    expect(validateSignature(body, SECRET, sig)).toBe(true)
    expect(validateSignature(body, SECRET, sig)).toBe(true)
  })
})

// ยืนยันว่าไฟล์นี้ไม่ได้เทียบลายเซ็นด้วย === (BR-LINE-05 บังคับ timing-safe) — เผื่อมีคนย้อนกลับไป
// แก้เป็นเทียบ string ตรง ๆ ทีหลังโดยไม่รู้ตัวว่าเข้าใจกฎผิด ให้เทสนี้เตือนตรง ๆ ในซอร์สโค้ด ไม่ใช่แค่
// พึ่งการอ่าน diff ตอน review
describe('validateSignature — ต้อง timing-safe', () => {
  it('เนื้อไฟล์ signature.ts ต้องไม่มีการเทียบลายเซ็นด้วย === (grep source โดยตรง)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/line/signature.ts'),
      'utf-8',
    )
    // เอาเฉพาะบรรทัดที่ไม่ใช่คอมเมนต์ แล้วเช็คว่าไม่มี "received ===" หรือ "expected ===" (การเทียบ
    // ลายเซ็นตรง ๆ) — length ยังเทียบด้วย === ได้ปกติ (ไม่ใช่การเทียบเนื้อลายเซ็น)
    const codeLines = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
    expect(codeLines).toContain('timingSafeEqual')
    expect(codeLines).not.toMatch(/received\s*===/)
    expect(codeLines).not.toMatch(/expected\s*===/)
  })
})
