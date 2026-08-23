/**
 * ด่านกัน `SalesSeries` สองนิยามเพี้ยนจากกัน
 *
 * ## ทำไมถึงมีสองนิยาม (และทำไมยุบเป็นอันเดียวไม่ได้)
 *
 * `src/services/dashboard.service.ts` = SSOT ฝั่งเซิร์ฟเวอร์ · ไฟล์นั้น import prisma
 * `…/dashboard/_constants/command-center.ts` = มิเรอร์ฝั่ง client เพราะ `SalesChartCard.tsx`
 * และ `SalesChartSheet.tsx` เป็น `'use client'` — import จาก service จะลาก prisma เข้า bundle
 *
 * ## 🛑 ทำไมต้องมีด่าน ไม่ใช่แค่คอมเมนต์
 *
 * คอมเมนต์เหนือมิเรอร์เขียนไว้ว่า *"shape ต้องตรงกับ SalesSeries ใน dashboard.service.ts เสมอ"*
 * ซึ่งเป็น **กฎที่เขียนไว้แต่บังคับไม่ได้** — เติมฟิลด์ที่ service แล้วลืมเติมที่มิเรอร์
 * `tsc` จะไม่แดง (คนละ type คนละไฟล์) แต่หน้าจอจะอ่านฟิลด์นั้นไม่เจอ **เงียบ ๆ**
 * แล้วคอลัมน์จะว่างทั้งคอลัมน์โดยไม่มีอะไรฟ้อง
 * (`docs/conventions/rule-must-be-enforced-not-described.md`)
 *
 * เจอเองตอนเพิ่ม `depositValues`/`receivedValues` เมื่อ 2026-08-23 — เติมที่ service แล้ว
 * `tsc` แดงที่หน้าจอพอดีเพราะบังเอิญมีโค้ดอ่านฟิลด์นั้นอยู่ · ถ้าเติมฟิลด์ที่ยังไม่มีใครอ่าน
 * มันจะเงียบสนิทจนกว่าจะมีคนไปใช้แล้วงงว่าทำไมไม่มีค่า
 *
 * ## เกณฑ์
 *
 * เทียบ **รายชื่อฟิลด์** ของทั้งสองฝั่ง ต้องเท่ากันเป๊ะ — อ่านจากซอร์สเพราะ type หายไปตอน runtime
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

/** ดึงชื่อฟิลด์ระดับบนสุดของ type/interface ที่ชื่อ `SalesSeries` ออกจากซอร์ส */
function fieldsOf(rel: string): string[] {
  const src = readFileSync(join(ROOT, rel), 'utf8')
  const start = src.search(/export (?:type|interface) SalesSeries\b[^{]*\{/)
  expect(start, `ไม่เจอ SalesSeries ใน ${rel}`).toBeGreaterThan(-1)

  const open = src.indexOf('{', start)
  let depth = 0
  let end = open
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }

  const body = src
    .slice(open + 1, end)
    // ตัดคอมเมนต์ก่อน ไม่งั้นคำใน jsdoc ที่ลงท้ายด้วย `:` จะถูกนับเป็นฟิลด์
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')

  // เอาเฉพาะฟิลด์ระดับบนสุด (depth 0 ภายใน body)
  const out: string[] = []
  let d = 0
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (d === 0) {
      const m = /^([A-Za-z_$][\w$]*)\??\s*:/.exec(trimmed)
      if (m) out.push(m[1])
    }
    d += (line.match(/[{[(]/g) ?? []).length - (line.match(/[}\])]/g) ?? []).length
  }
  return [...new Set(out)].sort()
}

describe('SalesSeries — service กับมิเรอร์ฝั่ง client', () => {
  const SERVICE = 'src/services/dashboard.service.ts'
  const MIRROR = 'src/app/(paces)/seller/(dashboard)/dashboard/_constants/command-center.ts'

  it('[blocker] รายชื่อฟิลด์ต้องเท่ากันเป๊ะทั้งสองฝั่ง', () => {
    const service = fieldsOf(SERVICE)
    const mirror = fieldsOf(MIRROR)

    expect(service.length, 'อ่านฟิลด์ฝั่ง service ไม่ออก — เช็ค regex ของด่านนี้').toBeGreaterThan(5)

    const missingInMirror = service.filter((f) => !mirror.includes(f))
    const extraInMirror = mirror.filter((f) => !service.includes(f))

    expect(
      missingInMirror,
      `เติมฟิลด์ที่ service แล้วลืมเติมที่ ${MIRROR} — หน้าจอจะอ่านไม่เจอแบบเงียบ ๆ`,
    ).toEqual([])
    expect(
      extraInMirror,
      `มิเรอร์มีฟิลด์ที่ service ไม่ได้ส่งมา — หน้าจอจะรอค่าที่ไม่มีวันมาถึง`,
    ).toEqual([])
  })

  it('[blocker] คู่เงินของร้านบริการต้องมาเป็นคู่เสมอ', () => {
    /* 🛑 `receivedValues` เป็นตัวที่หน้าจอใช้ตัดสินว่า "ร้านนี้เป็นร้านบริการไหม" ⇒ ถ้ามีตัวเดียว
       ตารางจะโชว์หัวคอลัมน์ "มัดจำ" ที่ไม่มีวันมีค่า หรือกลับกัน */
    for (const rel of [SERVICE, MIRROR]) {
      const f = fieldsOf(rel)
      expect(f.includes('depositValues'), `${rel} ขาด depositValues`).toBe(true)
      expect(f.includes('receivedValues'), `${rel} ขาด receivedValues`).toBe(true)
    }
  })
})
