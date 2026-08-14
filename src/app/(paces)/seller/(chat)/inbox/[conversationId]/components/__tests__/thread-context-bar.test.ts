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
const STRIP = join(process.cwd(), DIR, 'ThreadChipStrip.tsx')

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

  it('ยังไหลเข้าแถวชิปอยู่ (ไม่มีใครถอดกลับไปเป็นบล็อกซ้อน)', () => {
    // 🛑 2026-08-14: เดิมข้อนี้เช็ค `<ThreadContextBar items={contextItems}` ตรงตัว แล้วแดงทันที
    // ที่ 3 แถบถูกยุบเป็น `ThreadChipStrip` **ทั้งที่ของยังครบทุกอย่าง** — ด่านที่ผูกกับ *วิธีเขียน*
    // พังเมื่อ refactor ไม่ใช่เมื่อของหาย (รอยเดิม: ด่าน provider="apple" ที่แดงตอนแถวถูกรวบเป็น .map)
    // เช็ค "ของยังถูกส่งเข้าแถวเดียวกัน" แทน ซึ่งเป็นเจตนาจริงของข้อนี้
    expect(src).toMatch(/<ThreadChipStrip/)
    expect(src).toMatch(/\.\.\.contextItems\.map/)
    expect(src).toMatch(/\.\.\.threadStatuses\.map/)
  })
})

describe('ชิป "ที่มา" — โทนต้องเบากว่าชิปคำเตือนที่อยู่แถวเดียวกัน', () => {
  const src = readFileSync(STRIP, 'utf8')

  it('โทน context ไม่มีพื้นสี semantic', () => {
    // ตัดคอมเมนต์ออกก่อน: หัวไฟล์ *พูดถึง* คลาสพวกนี้เพื่ออธิบายว่าทำไมถึงห้ามใช้
    // (บทเรียน HR9 2026-08-02→08-03: gate ที่ match คำเปล่า ๆ จะแดงตลอดกาลกับไฟล์ที่ทำถูกกฎ)
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    // ตอนนี้ไฟล์เดียวถือทุกโทน (คำเตือน *ต้อง* มีพื้นสี) จึงเช็คเฉพาะบรรทัดของ `context`
    const line = code.split('\n').find((l) => l.trim().startsWith('context:'))
    expect(line, 'ไม่เจอโทน context ใน TONE_CLS').toBeTruthy()
    expect(line).not.toMatch(/bg-(danger|warning|info|success|primary)\//)
    // และคำเตือนต้องยังมีพื้นสีอยู่จริง ไม่งั้น "เบากว่า" ไม่มีความหมาย
    expect(code).toMatch(/danger:\s*'bg-danger\/15/)
  })

  it('ปุ่มยุบ/กางประกาศสถานะให้ screen reader (WCAG 4.1.2)', () => {
    expect(src).toMatch(/aria-expanded/)
  })
})
