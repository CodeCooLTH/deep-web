import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// [blocker] ลิงก์ SMS ออเดอร์ต้องเผาตอนลูกค้ากดยืนยัน ไม่ใช่ตอนเปิด (GET) — ตัว preview ของแอปแชท
// ยิง GET เองได้ ถ้าเผาตอนเปิด ลูกค้าจะเจอลิงก์ตายทั้งที่ยังไม่เคยกด
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const route = strip(readFileSync('src/app/api/o/sms/[code]/route.ts', 'utf8'))
const page = strip(readFileSync('src/app/(marketing)/o/[token]/page.tsx', 'utf8'))
const auth = strip(readFileSync('src/lib/auth.ts', 'utf8'))

describe('[blocker] SMS order link = one-time, เผาตอนยืนยัน', () => {
  it('GET /api/o/sms/[code] และหน้า /o/[token] ไม่เผาโค้ด', () => {
    expect(route).not.toMatch(/consumeSmsCode\(/)
    expect(page).not.toMatch(/consumeSmsCode\(/)
    expect(route).toMatch(/peekSmsCode\(/)
  })

  it('provider sms-link เผาโค้ดก่อน แล้วสร้างบัญชี + ผูกลูกค้า/ออเดอร์', () => {
    const block = auth.slice(auth.indexOf('id: "sms-link"'), auth.indexOf('id: "mobile-ticket"'))
    const consume = block.indexOf('consumeSmsCode(')
    const upsert = block.indexOf('upsertVerifiedPhoneUser(')
    const link = block.indexOf('guaranteeOrderLink(')
    expect(consume).toBeGreaterThan(-1)
    expect(upsert).toBeGreaterThan(consume)
    expect(link).toBeGreaterThan(upsert)
  })
})
