/**
 * [blocker] claim ของ direct upload — ผูก fileId กับคนที่ขอ
 *
 * ทำไมเป็น blocker: `POST /api/uploads/commit` **ลบไฟล์** ที่ตรวจแล้วไม่ผ่าน ถ้า claim ปลอม
 * ได้หรือไม่ผูก userId ก็จะกลายเป็นช่องให้ลบไฟล์ของร้านอื่นด้วยการส่ง fileId ที่หลุดมา
 * (fileId เป็น uuid เดายาก แต่ "เดายาก" ไม่ใช่ authorization — มันหลุดไปกับลิงก์/HTML/log ได้)
 *
 * ตั้ง NEXTAUTH_SECRET ก่อน import เพราะโมดูล fail-closed ตอน load (throw ถ้าไม่มี secret)
 * และใช้ dynamic import เพื่อให้ลำดับนั้นเกิดจริง — `import` ปกติถูก hoist ขึ้นไปก่อนทุกบรรทัด
 */

import { describe, it, expect } from 'vitest'

process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'test-secret-for-upload-ticket'
const { signUploadTicket, verifyUploadTicket, TICKET_TTL_SECONDS } = await import('@/lib/upload-ticket')

const base = {
  fileId: '2026/08/10/11111111-2222-3333-4444-555555555555.jpg',
  userId: 'user-1',
  purpose: 'IMAGE' as const,
  maxSize: 10 * 1024 * 1024,
}

describe('signUploadTicket / verifyUploadTicket', () => {
  it('round-trip คืนค่าที่เซ็นไว้ครบ', () => {
    const claim = verifyUploadTicket(signUploadTicket(base))
    expect(claim).not.toBeNull()
    expect(claim?.fileId).toBe(base.fileId)
    expect(claim?.userId).toBe('user-1')
    expect(claim?.purpose).toBe('IMAGE')
    expect(claim?.maxSize).toBe(base.maxSize)
  })

  it('พก conversationId ไปด้วยเมื่อเป็น CHAT — commit ต้องใช้ตรวจกฎช่องทางซ้ำกับขนาดจริง', () => {
    const token = signUploadTicket({ ...base, purpose: 'CHAT', conversationId: 'conv-1' })
    expect(verifyUploadTicket(token)?.conversationId).toBe('conv-1')
  })

  it('แก้ payload แล้ว signature ไม่ผ่าน — ยก maxSize เองไม่ได้', () => {
    const token = signUploadTicket(base)
    const [payload, sig] = token.split('.')
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    decoded.maxSize = 999 * 1024 * 1024
    const forged = `${Buffer.from(JSON.stringify(decoded)).toString('base64url')}.${sig}`
    expect(verifyUploadTicket(forged)).toBeNull()
  })

  it('เปลี่ยน userId เองไม่ได้ (ป้องกันการ commit/ลบไฟล์ของคนอื่น)', () => {
    const token = signUploadTicket(base)
    const [payload, sig] = token.split('.')
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    decoded.userId = 'user-2'
    expect(verifyUploadTicket(`${Buffer.from(JSON.stringify(decoded)).toString('base64url')}.${sig}`)).toBeNull()
  })

  it('token เพี้ยน/ว่าง/ไม่มีจุดคั่น → null ไม่ throw', () => {
    expect(verifyUploadTicket('')).toBeNull()
    expect(verifyUploadTicket('ไม่ใช่โทเคน')).toBeNull()
    expect(verifyUploadTicket('aaaa.bbbb')).toBeNull()
    expect(verifyUploadTicket(signUploadTicket(base) + 'x')).toBeNull()
  })

  it('หมดอายุแล้วใช้ไม่ได้', () => {
    // ประกอบ payload ที่ exp ผ่านไปแล้วด้วย secret ตัวจริง = ลายเซ็นถูกแต่หมดอายุ
    const expired = { ...base, exp: Date.now() - 1000 }
    const payloadB64 = Buffer.from(JSON.stringify(expired)).toString('base64url')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('node:crypto') as typeof import('node:crypto')
    const sig = crypto
      .createHmac('sha256', process.env.NEXTAUTH_SECRET as string)
      .update(`upload-ticket.v1.${payloadB64}`)
      .digest('base64url')
    expect(verifyUploadTicket(`${payloadB64}.${sig}`)).toBeNull()
  })

  it('อายุ ticket ยาวพอให้อัปโหลด 25MB บนเน็ตมือถือช้า ๆ (≥ 10 นาที)', () => {
    expect(TICKET_TTL_SECONDS).toBeGreaterThanOrEqual(600)
  })
})
