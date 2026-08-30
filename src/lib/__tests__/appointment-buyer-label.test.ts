import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  APPOINTMENT_STATUS_LABEL,
  APPOINTMENT_STATUS_LABEL_BUYER,
  type AppointmentStatus,
} from '@/lib/appointments'

/**
 * [blocker] ป้ายสถานะนัดมี 2 ชุด — ของร้าน กับ ของผู้ซื้อ
 *
 * ชุดของร้านเรียกผู้ซื้อว่า "ลูกค้า" — พอเอาไปแปะบนหน้าของผู้ซื้อเอง เขาจะอ่านว่า
 * *"ลูกค้ายืนยันแล้ว"* เกี่ยวกับตัวเอง คือถูกพูดถึงเป็นบุคคลที่สามบนหน้าที่เป็นของเขา
 * (อาการนี้อยู่บน prod มาตั้งแต่ 00024 ไม่มีใครทัก จนมาเจอตอนทำ mockup 2026-08-28)
 *
 * 🛑 แดง = ห้าม merge
 */
const ROOT = process.cwd()
const BUYER_DIR = 'src/app/(marketing)/o/[token]'

const ALL: AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED_BY_BUYER',
  'RESCHEDULE_REQUESTED',
  'COMPLETED',
  'NO_SHOW',
]

describe('[blocker] ป้ายสถานะนัดฝั่งผู้ซื้อ', () => {
  it('ต้องมีครบทุกสถานะ ไม่มีช่องว่าง', () => {
    /* ขาดสักค่าแล้ว UI จะได้ `undefined` ไปแสดงเป็นชิปเปล่า — และเป็นค่าที่ผลิตได้จริง
       ทั้ง 5 ตัว (`RESCHEDULE_REQUESTED`/`NO_SHOW` ยังไม่เคยเกิดบน prod แต่โค้ดผลิตได้) */
    for (const s of ALL) {
      expect(APPOINTMENT_STATUS_LABEL_BUYER[s], s).toBeTruthy()
      expect(APPOINTMENT_STATUS_LABEL_BUYER[s].trim(), s).not.toBe('')
    }
  })

  it('ห้ามเรียกผู้ซื้อว่า "ลูกค้า" — เขาคือคนที่กำลังอ่านอยู่', () => {
    for (const s of ALL) {
      expect(APPOINTMENT_STATUS_LABEL_BUYER[s], s).not.toMatch(/ลูกค้า/)
    }
  })

  it('SCHEDULED ต้องบอกว่าผู้ซื้อต้องลงมือ ไม่ใช่แค่รายงานข้อเท็จจริง', () => {
    /* 🛑 ตรงขั้นนี้ **ผู้ซื้อคือคนที่ต้องทำ** — ป้ายที่ไม่บอกว่าต้องทำอะไรบนหน้าที่รอเขาอยู่
       คือป้ายที่เสียเปล่า (ชุดของร้านเขียนว่า "นัดแล้ว" ซึ่งเป็นข้อเท็จจริงเฉย ๆ) */
    expect(APPOINTMENT_STATUS_LABEL_BUYER.SCHEDULED).toMatch(/คุณ/)
    expect(APPOINTMENT_STATUS_LABEL_BUYER.SCHEDULED).not.toBe(APPOINTMENT_STATUS_LABEL.SCHEDULED)
  })

  it('ค่าที่ไม่มีมุมมองต้องใช้คำเดียวกันทั้งสองชุด', () => {
    /* `COMPLETED`/`NO_SHOW` เป็นข้อเท็จจริงของงาน ไม่ได้พูดถึงใครเป็นพิเศษ —
       แต่งให้ต่างคือสร้างคำที่สองของสิ่งเดียวกันโดยไม่มีเหตุผล (HR16) */
    for (const s of ['COMPLETED', 'NO_SHOW'] as const) {
      expect(APPOINTMENT_STATUS_LABEL_BUYER[s], s).toBe(APPOINTMENT_STATUS_LABEL[s])
    }
  })

  it('หน้าผู้ซื้อห้ามใช้ป้ายชุดของร้าน', () => {
    /* 🛑 ด่านนี้คือตัวที่ทำให้กฎ "บังคับได้" ไม่ใช่แค่ "เขียนไว้" — ไฟล์ใหม่ในโฟลเดอร์นี้
       ที่เผลอ import ชุดของร้านจะแดงทันที โดยไม่ต้องมีใครจำกฎได้ */
    const dir = join(ROOT, BUYER_DIR)
    const offenders: string[] = []
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.tsx') && !f.endsWith('.ts')) continue
      const src = readFileSync(join(dir, f), 'utf8')
        .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(?<!:)\/\/.*$/gm, (m) => ' '.repeat(m.length))
      // ต้องไม่มี `APPOINTMENT_STATUS_LABEL` ที่ไม่ได้ลงท้ายด้วย `_BUYER`
      if (/APPOINTMENT_STATUS_LABEL(?!_BUYER)/.test(src)) offenders.push(f)
    }
    expect(offenders, 'หน้าผู้ซื้อต้องใช้ APPOINTMENT_STATUS_LABEL_BUYER เท่านั้น').toEqual([])
  })
})
