import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { excludeDraftedWhere, withoutDrafted } from '@/lib/order-visibility'

/**
 * 00061 — ด่านบังคับของ "ร่างต้องไม่ถูกนับเป็นออเดอร์จริง" (DATABASE.md §C · TC-ACO-U01)
 *
 * ทำไมต้องเป็นเทสสแกนซอร์ส ไม่ใช่เทสพฤติกรรม: ร่างถูกเก็บใน **ตาราง `Order` แถวเดียวกับ
 * ออเดอร์จริง** ⇒ ไม่มีชนิดข้อมูล ไม่มี FK ไม่มี CHECK ตัวไหนแยกมันออกให้เลย ทุก query ที่
 * นับเงิน/นับจำนวนต้องกรองเอง 100% และ **การลืมกรองไม่ทำให้อะไรพัง** — มันแค่ทำให้ตัวเลข
 * บนหน้าจอโตขึ้นอย่างสมเหตุสมผล ซึ่งไม่มี `tsc`/build/eslint ตัวไหนมองเห็น
 */

const ROOTS = ['src/services', 'src/lib', 'src/app']
const CANCELLED_RE = /status:\s*\{\s*not:\s*['"]CANCELLED['"]/
/** `.order.` เท่านั้น — `prisma.orderShipment.`/`prisma.orderPayment.` ต้องไม่ match */
const ORDER_QUERY_RE = /\.order\.(findMany|findFirst|findUnique|findUniqueOrThrow|count|aggregate|groupBy)\b|(?:^|[^\w])order:\s*\{/
const HANDLED_RE = /DRAFTED|withoutDrafted|excludeDraftedWhere|drafted-ok/

const LOOKBACK = 12
const LOOKAHEAD = 12

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/**
 * 🛑 ต้องตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ทำถูกกฎคือไฟล์ที่มักเขียนคำอธิบายกฎนั้นไว้ด้วย
 * (`order-visibility.ts` เขียนตัวอย่าง "ท่าที่ผิด" ไว้ในคอมเมนต์ตรง ๆ) ถ้าไม่ตัด ด่านจะแดง
 * ค้างจากคำเตือนของตัวเอง — รอยเดิมของ HR9 grep gate เมื่อ 2026-08-02
 */
function stripComments(src: string): string[] {
  return src.split('\n').map((line) => {
    const noLine = line.replace(/\/\/.*$/, '')
    return noLine.replace(/\/\*.*?\*\//g, '')
  })
}

describe('excludeDraftedWhere — ด่านสแกนซอร์ส (00061)', () => {
  it('[blocker] ทุก query ของ Order ที่ใช้ deny-list `status: { not: "CANCELLED" }` ต้องตัด DRAFTED ด้วย', () => {
    const offenders: string[] = []

    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const lines = stripComments(readFileSync(file, 'utf8'))
        lines.forEach((line, i) => {
          if (!CANCELLED_RE.test(line)) return
          const before = lines.slice(Math.max(0, i - LOOKBACK), i + 1).join('\n')
          // ตัวกรองนี้อยู่บน Order จริงหรือเปล่า — ถ้าไม่ใช่ (OrderShipment/Appointment/Booking)
          // ก็ไม่เกี่ยวกับกฎนี้เลย
          if (!ORDER_QUERY_RE.test(before)) return
          const window = lines.slice(Math.max(0, i - LOOKBACK), i + LOOKAHEAD).join('\n')
          if (HANDLED_RE.test(window)) return
          offenders.push(`${file}:${i + 1}  ${line.trim()}`)
        })
      }
    }

    expect(offenders, `พบ query ของ Order ที่ยังไม่ตัด DRAFTED:\n${offenders.join('\n')}`).toEqual([])
  })

  it('[blocker] SQL ดิบที่แตะตาราง "Order" ต้องพูดถึง DRAFTED (คร่า แต่ดีกว่าไม่มี)', () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const src = readFileSync(file, 'utf8')
        if (!/\$queryRaw|\$executeRaw/.test(src)) continue
        if (!/"Order"/.test(src)) continue
        if (HANDLED_RE.test(src)) continue
        offenders.push(file)
      }
    }
    expect(offenders, `SQL ดิบที่แตะ "Order" แต่ไม่พูดถึง DRAFTED เลย:\n${offenders.join('\n')}`).toEqual([])
  })

  it('withoutDrafted รวมเป็น notIn ตัวเดียว — ห้ามคืน object ที่มี key `status` ซ้อนกัน', () => {
    expect(excludeDraftedWhere).toEqual({ status: { not: 'DRAFTED' } })
    expect(withoutDrafted()).toEqual({ status: { not: 'DRAFTED' } })
    expect(withoutDrafted('CANCELLED')).toEqual({ status: { notIn: ['DRAFTED', 'CANCELLED'] } })
    expect(withoutDrafted(['CANCELLED', 'ARCHIVED'])).toEqual({
      status: { notIn: ['DRAFTED', 'CANCELLED', 'ARCHIVED'] },
    })
  })
})
