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

  it('ทุกทางเข้าที่มีลิงก์ใช้ได้ไม่ต้องกรอกเบอร์: ล็อกอินบัญชีอื่นค้าง + ใบจอง', () => {
    expect(page).toMatch(/if \(!session \|\| !viewerUserId \|\| viaSmsLink\)/)
    expect(page).toMatch(/viaSmsLink = !!smsCode && order\.buyerUserId !== viewerUserId/)
    // ใบจองไม่มีจอ guest — ต้องไปจอเปิดอัตโนมัติด้วย ไม่ใช่ redirect ไปกรอกเบอร์
    expect(page).toMatch(/order\.type === 'BOOKING' && !smsCode/)
    expect(page).toMatch(/<SmsAutoEnter/)
  })

  it('จอเปิดอัตโนมัติยิง signIn ครั้งเดียว (โค้ดใช้ได้ครั้งเดียว — Strict Mode/effect ซ้ำ = ลิงก์ตาย)', () => {
    const auto = strip(readFileSync('src/app/(marketing)/o/[token]/SmsAutoEnter.tsx', 'utf8'))
    expect(auto).toMatch(/if \(fired\.current\) return/)
    expect(auto).toMatch(/signIn\('sms-link'/)
  })
})

const read = (f: string) => strip(readFileSync(f, 'utf8'))

describe('[blocker] รีวิวได้หลังยืนยันรับเท่านั้น (แบบ Grab — 2026-10-04)', () => {
  it('service ปฏิเสธทุกสถานะที่ไม่ใช่ CONFIRMED (รวม SHIPPED)', () => {
    const svc = read('src/services/review.service.ts')
    expect(svc).toMatch(/if \(order\.status !== "CONFIRMED"\)/)
    expect(svc).not.toMatch(/\["CONFIRMED", "SHIPPED"\]/)
  })
  it('หน้าออเดอร์เปิดการ์ดรีวิวเฉพาะ CONFIRMED', () => {
    const ui = read('src/app/(marketing)/o/[token]/OrderDetailMobile.tsx')
    expect(ui).toMatch(/const canReview = !order\.hasReview && order\.status === 'CONFIRMED'/)
  })
})

describe('[blocker] คำที่ป้อน Trust Score ต้องไม่เอียง/ไม่อ้างเกินจริง (audit คำ 2026-10-04)', () => {
  it('คำกำกับดาวสมดุล — 3 ดาว = พอใช้', () => {
    const f = read('src/app/(marketing)/o/[token]/ReviewForm.tsx')
    expect(f).toMatch(/STAR_LABELS = \['แย่มาก', 'แย่', 'พอใช้', 'ดี', 'ดีมาก'\]/)
  })
  it('ตราประทับอ้างว่า "ได้รับแล้ว" เฉพาะเมื่อผู้ซื้อกดเอง', () => {
    const ui = read('src/app/(marketing)/o/[token]/OrderDetailMobile.tsx')
    expect(ui).toMatch(/order\.confirmation\.byBuyer\s*\?[\s\S]{0,120}'ได้รับแล้ว'[\s\S]{0,40}: 'สำเร็จ'/)
    const pg = read('src/app/(marketing)/o/[token]/page.tsx')
    expect(pg).toMatch(/byBuyer: confirmEvent\?\.type === 'BUYER_CONFIRMED'/)
  })
})
