/**
 * ด่านกันทางลัด — webhook ต้อง **อ่านช่วงผ่อนผันจริง** ไม่ใช่ส่ง null ให้ผ่าน ๆ ไป
 *
 * `applyAppleNotification` บังคับพารามิเตอร์ที่สองไว้แล้ว แต่ TypeScript พอใจกับ `null`
 * ⇒ คนที่รีบแก้ให้ compile ผ่านจะเติม `null` แล้วจบ ซึ่งทำให้ BR-IAP-14 ตายเงียบ ๆ
 * เหมือนเดิมทุกประการ · ด่านนี้ดูที่ **โค้ด** ว่าไปหยิบ `signedRenewalInfo` มาจริง
 *
 * 🛑 `gracePeriodExpiresDate` อยู่ใน signedRenewalInfo ซึ่งเป็น JWS คนละก้อนกับ
 * signedTransactionInfo — ต้อง verify แยกอีกครั้ง ห้ามถอดแบบไม่ตรวจลายเซ็น
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
/** ด่านต้องดู *โค้ด* ไม่ใช่คำอธิบาย — ไฟล์นี้เล่าเหตุผลไว้ยาวและมีชื่อสัญลักษณ์ในคอมเมนต์ */
const code = (rel: string) =>
  readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const WEBHOOK = 'src/app/api/webhooks/apple-iap/route.ts'

describe('[blocker] webhook ต้องส่งช่วงผ่อนผันเข้า applyAppleNotification', () => {
  it('🛑 อ่าน `signedRenewalInfo` จาก payload ของการแจ้งเตือน', () => {
    expect(
      code(WEBHOOK),
      'webhook ไม่ได้แตะ signedRenewalInfo เลย ⇒ ไม่มีวันรู้ว่ามีช่วงผ่อนผัน (BR-IAP-14)',
    ).toContain('signedRenewalInfo')
  })

  it('🛑 ใช้ `readAppleGracePeriod` แปลค่า ไม่ใช่ล้วง field เอง', () => {
    expect(code(WEBHOOK)).toContain('readAppleGracePeriod')
  })

  it('🛑 renewal info ต้องผ่าน `verifyAppleJws` — ห้ามถอดแบบไม่ตรวจลายเซ็น', () => {
    const src = code(WEBHOOK)
    const renewalLine = src.split('\n').find((l) => l.includes('signedRenewalInfo') && l.includes('verifyAppleJws'))
    const verifiesSomewhere = /verifyAppleJws<[^>]*RenewalPayload>/.test(src) || Boolean(renewalLine)
    expect(
      verifiesSomewhere,
      'อ่าน signedRenewalInfo โดยไม่ verify = ใครก็ยัดช่วงผ่อนผันยาว ๆ มาใช้ฟรีได้',
    ).toBe(true)
  })

  it('ไม่ส่ง `null` ตายตัวให้พารามิเตอร์ช่วงผ่อนผัน', () => {
    expect(code(WEBHOOK)).not.toMatch(/applyAppleNotification\([^)]*,\s*null\s*\)/)
  })
})
