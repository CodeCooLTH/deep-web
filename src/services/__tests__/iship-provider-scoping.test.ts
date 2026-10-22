import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * [blocker] 00084 — ทุกการเข้าถึง ShopShippingAccount / OrderShipment ของ iShip ต้องรู้จัก provider
 *
 * ทำไมสแกนซอร์ส: tsc จับได้แค่ findUnique/update/upsert ที่ where เป็น { shopId } (DB เลิก shopId @unique)
 * แต่ updateMany/findMany/count ที่ลืม provider ผ่านคอมไพล์เงียบ ๆ แล้วไปแก้/ล้างแถว FLASH ของร้านเดียวกัน
 * (เช่น iShip 401 mark แถว Flash เป็น TOKEN_INVALID · ถอด iShip แล้วล้าง key ของ Flash)
 */

const SRC = 'src'
const files = execFileSync('grep', ['-rlE', '--include=*.ts', '--include=*.tsx', 'shopShippingAccount|orderShipment', SRC], { encoding: 'utf8' })
  .trim().split('\n').filter((f) => f && !f.includes('__tests__') && !f.includes('/flash/'))

/** คืนข้อความของการเรียก `<prefix>.method(...)` ทั้งก้อน (จับคู่วงเล็บ) */
function callsOf(text: string, re: RegExp): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = []
  for (const m of text.matchAll(re)) {
    let depth = 0
    let i = m.index! + m[0].length - 1 // ตำแหน่ง '('
    const start = i
    for (; i < text.length; i++) {
      if (text[i] === '(') depth++
      else if (text[i] === ')' && --depth === 0) break
    }
    out.push({ text: text.slice(start, i + 1), line: text.slice(0, m.index).split('\n').length })
  }
  return out
}

describe('[blocker] ShopShippingAccount ต้องระบุ provider', () => {
  const acct = files.flatMap((f) =>
    callsOf(readFileSync(f, 'utf8'), /shopShippingAccount\s*\.\s*(findUnique|findUniqueOrThrow|update|upsert|updateMany|findMany|findFirst|count|deleteMany|delete)\s*\(/g)
      .map((c) => ({ ...c, file: f })),
  )

  it('พบจุดเรียกจริง (กัน regex เสียแล้วผ่านเงียบ)', () => {
    expect(acct.length).toBeGreaterThan(10)
  })

  it('findUnique/update/upsert ใช้ compound shopId_provider ทุกจุด — ไม่มี where: { shopId } เดี่ยว', () => {
    const bad = files.flatMap((f) => {
      const t = readFileSync(f, 'utf8')
      return callsOf(t, /shopShippingAccount\s*\.\s*(?:findUnique|findUniqueOrThrow|update|upsert)\s*\(/g)
        .filter((c) => !c.text.includes('shopId_provider'))
        .map((c) => `${f}:${c.line}`)
    })
    expect(bad).toEqual([])
  })

  it('updateMany/findMany/findFirst/count/deleteMany ต้องมี provider ในเงื่อนไข (ยกเว้นที่ประกาศตั้งใจนับทั้งสองผู้ให้บริการ)', () => {
    // inbox/page.tsx: ตั้งใจนับทั้ง ISHIP+FLASH = "ร้านมีขนส่งที่ติดตามสถานะได้" (SDS CS-22) — มีคอมเมนต์กำกับในไฟล์
    const bad = files.flatMap((f) => {
      const t = readFileSync(f, 'utf8')
      return callsOf(t, /shopShippingAccount\s*\.\s*(?:updateMany|findMany|findFirst|count|deleteMany)\s*\(/g)
        .filter((c) => !/provider/.test(c.text))
        .filter(() => !(f.includes('(chat)/inbox/page.tsx') && /00084 CS-22/.test(t)))
        .map((c) => `${f}:${c.line}`)
    })
    expect(bad).toEqual([])
  })
})

describe('[blocker] OrderShipment ใน iship.service.ts — query ที่ผูก id/trackingNo/refCode ต้องกรอง provider', () => {
  const t = readFileSync('src/services/iship.service.ts', 'utf8')
  const calls = callsOf(t, /orderShipment\s*\.\s*(?:findFirst|findMany|updateMany)\s*\(/g)

  // ตั้งใจไม่กรอง (พร้อมเหตุผล) — แถวที่ถูก resolve มาจาก query ที่กรอง provider แล้ว หรือเป็นด่านระดับตาราง
  const ALLOW: { re: RegExp; why: string }[] = [
    { re: /id: (?:shipmentId|shipment\.id), (?:problemAt|returnStartedAt|returnedAt|deliveredAt|returnDispatchedAt|codSettledAt): null/, why: 'write-once milestone ของแถวที่ resolve ด้วย provider แล้ว' },
    { re: /trackingNo: \{ in: trackNos \}/, why: 'ด่านเลขซ้ำระดับตาราง (partial unique ครอบทุก provider)' },
    { re: /where: \{ trackingNo \}/, why: 'ด่านเลขซ้ำระดับตาราง ก่อนผูก/นำเข้า' },
  ]
  const BINDS = /\b(?:id|trackingNo|refCode|ticketPickupId)\s*(?::|,|\})/

  it('พบจุดเรียกจริง', () => expect(calls.length).toBeGreaterThan(15))

  it('ไม่มี query ที่ผูก id/trackingNo/refCode โดยไม่มี provider และไม่อยู่ใน allow-list', () => {
    const bad = calls
      .filter((c) => BINDS.test(c.text.split(/\bselect\s*:/)[0]) && !/provider/.test(c.text))
      .filter((c) => !ALLOW.some((a) => a.re.test(c.text)))
      .map((c) => `iship.service.ts:${c.line}`)
    expect(bad).toEqual([])
  })

  it('ชุดตามสถานะ (syncShipmentStatuses) กรอง provider ISHIP', () => {
    const c = calls.find((x) => x.text.includes('status: "CREATED"') && x.text.includes('trackingNo: { not: null }'))
    expect(c?.text).toMatch(/provider: "ISHIP"/)
  })
})

describe('[blocker] UI ของ iShip ไม่ยิง /api/seller/flash ตรง ๆ', () => {
  it('ทุก fetch ไป flash ผ่าน useIShipUrl()/ishipUrl() ต่อ ?shopId=', () => {
    let lines: string[] = []
    try {
      lines = execFileSync('grep', ['-rnE', '--include=*.ts', '--include=*.tsx', "fetch\\(['\"`]/api/seller/flash", 'src/components/safepay'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    } catch { /* ไม่เจอ = ดี */ }
    expect(lines).toEqual([])
  })
})
