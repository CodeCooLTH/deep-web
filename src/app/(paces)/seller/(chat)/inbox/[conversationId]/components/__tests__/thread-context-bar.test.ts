/**
 * [blocker] แถบ "ที่มาของแชท" — ลำดับความสำคัญ + โทนสี
 *
 * ที่มา 2026-08-11 (user รายงานพร้อมภาพ prod): "panel ด้านบน มันซ้อนกันเยอะ จนใช้ยาก"
 * → รวมชื่อร้าน/คอมเมนต์/โฆษณาเป็นแถบเดียวยุบได้ (`ThreadContextBar`)
 *
 * สองข้อที่เทสนี้ตรึงไว้ **แดงเมื่อไหร่ห้าม merge**:
 *
 *  1. **ชื่อร้านต้องเป็นรายการแรกเสมอ** — แถบนี้โชว์แค่ `items[0]` ตอนยุบ ถ้าชื่อร้านตกไปอยู่
 *     หลัง `+N` ผู้ขายหลายร้านจะตอบลูกค้า **ในนามร้านผิด** ซึ่งถอนคืนไม่ได้ (ข้อความออกไปแล้ว)
 *     ต่างจากการไม่เห็นว่าแชทมาจากโฆษณาชิ้นไหน ซึ่งกดกางดูได้ตลอดเวลา
 *     คอมเมนต์เดิมของบล็อกนั้นเขียนไว้เองว่าเป็นข้อมูลที่ต้องรู้ "ก่อนพิมพ์"
 *
 *  2. **แถบนี้ห้ามมีพื้นสี semantic** — `ThreadStatusBar` ที่อยู่ถัดลงมาใช้ `bg-danger/15` /
 *     `bg-warning/15` / `bg-info/15` เป็นสัญญาณว่า "มีอะไรผิดปกติ" ถ้าแถบบริบทมีพื้นสีด้วย
 *     สองแถบสีวางติดกันจะอ่านเป็นบล็อกเดียวที่แยกไม่ออกว่าอันไหนคือสิ่งที่ต้องรีบจัดการ
 *
 * ทำไมเป็นเทสที่อ่านซอร์ส: vitest ของรีโปนี้ตั้ง `environment: "node"` และไม่มี jsdom/
 * testing-library — render component ไม่ได้ สิ่งที่ตรวจได้และตรงกับต้นเหตุคือลำดับการ push
 * และคลาสที่ใช้ (แพตเทิร์นเดียวกับ `inbox-list-race-guard.test.ts` / `useListBusy-deps.test.ts`)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components'
const THREAD = join(process.cwd(), DIR, 'ChatThread.tsx')
const BAR = join(process.cwd(), DIR, 'ThreadContextBar.tsx')

describe('ThreadContextBar — ลำดับความสำคัญของที่มา', () => {
  const src = readFileSync(THREAD, 'utf8')

  /**
   * ตำแหน่งของ `key: '<name>'` ในไฟล์ — ลำดับใน array = ลำดับที่ push จริง
   *
   * 🛑 ต้อง throw เมื่อไม่เจอ ห้ามคืน -1: `indexOf` ที่คืน -1 จะ "น้อยกว่า" ทุกค่าเสมอ
   * ⇒ เทสลำดับจะ **เขียวตอนที่รายการนั้นหายไปทั้งก้อน** ซึ่งเป็นความล้มเหลวที่แย่กว่าลำดับผิด
   * (พิสูจน์ด้วย mutation แล้วว่าของเดิมรอด — เปลี่ยน key ทิ้งแล้วเทสลำดับยังเขียว 3 ข้อ)
   */
  const posOf = (key: string) => {
    const i = src.indexOf(`key: '${key}'`)
    if (i < 0) throw new Error(`ไม่พบ key: '${key}' ใน ChatThread.tsx — ที่มานี้หายไปหรือถูกเปลี่ยนชื่อ`)
    return i
  }

  it('ประกอบครบทั้ง 3 ที่มา (ชื่อร้าน / คอมเมนต์ / โฆษณา)', () => {
    expect(posOf('shop')).toBeGreaterThan(-1)
    expect(posOf('comment')).toBeGreaterThan(-1)
    expect(posOf('ad')).toBeGreaterThan(-1)
  })

  it('ชื่อร้านถูก push ก่อนคอมเมนต์และโฆษณาเสมอ (ตัวแรก = ตัวที่โชว์ตอนยุบ)', () => {
    expect(posOf('shop')).toBeLessThan(posOf('comment'))
    expect(posOf('shop')).toBeLessThan(posOf('ad'))
  })

  it('คอมเมนต์มาก่อนโฆษณา (คอมเมนต์ถือคำถามจริงของลูกค้า · โฆษณาปิดถาวรได้อยู่แล้ว)', () => {
    expect(posOf('comment')).toBeLessThan(posOf('ad'))
  })

  it('ยังส่งรายการเข้า ThreadContextBar อยู่ (ไม่มีใครถอดแถบกลับไปเป็น 3 บล็อกซ้อน)', () => {
    expect(src).toMatch(/<ThreadContextBar\s+items=\{contextItems\}/)
  })
})

describe('ThreadContextBar — โทนสีต้องเบากว่าแถบคำเตือนที่อยู่ใต้มัน', () => {
  const src = readFileSync(BAR, 'utf8')

  it('ไม่มีพื้นสี semantic ในตัวแถบ', () => {
    // ตัดคอมเมนต์ออกก่อน: หัวไฟล์ *พูดถึง* คลาสพวกนี้เพื่ออธิบายว่าทำไมถึงห้ามใช้
    // (บทเรียน HR9 2026-08-02→08-03: gate ที่ match คำเปล่า ๆ จะแดงตลอดกาลกับไฟล์ที่ทำถูกกฎ)
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/bg-(danger|warning|info|success)\//)
    expect(code).not.toMatch(/bg-primary\//)
  })

  it('ปุ่มยุบ/กางประกาศสถานะให้ screen reader (WCAG 4.1.2)', () => {
    expect(src).toMatch(/aria-expanded/)
  })
})
