import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { thaiTodayBounds } from '@/lib/date-range'
import { appointmentDayBounds } from '@/lib/appointment-day'

/**
 * "เงินที่รับวันนี้" บนหน้าแรกของร้านบริการ (feature 00050 · AC-SQ-04)
 *
 * สองกับดักที่ผิดแล้วเงียบสนิท:
 *   1. **"วันนี้" สองนิยามบนจอเดียว** — ไทล์ "นัดวันนี้" กับการ์ดเงินตัดวันคนละแบบ
 *      แล้วผู้ขายเห็นเลขที่ไม่สอดคล้องกันโดยไม่มีอะไรฟ้อง (บทเรียน 00033)
 *   2. **ตกเป็น 0 เมื่อ query ล้ม** — "รับเงินวันนี้ ฿0.00" ที่ผิด เป็นข้ออ้างให้ร้านไปตาม
 *      เก็บเงินจากคนที่จ่ายมาแล้ว (`partial-data-must-be-labeled-or-filled.md`)
 */

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('"วันนี้" ต้องมีนิยามเดียวทั้งหน้าแรก', () => {
  it('[blocker] ขอบวันของไทล์ "นัดวันนี้" ต้องเท่ากับขอบวันของการ์ดเงิน เป๊ะทุกมิลลิวินาที', () => {
    /**
     * เดินทั้งสองทางบน `now` ชุดเดียวกัน — รวมเคสขอบที่อันตรายที่สุด: หลังเที่ยงคืนไทย
     * ไม่กี่นาที (ซึ่ง UTC ยังเป็นเมื่อวาน) และก่อนเที่ยงคืนไทยไม่กี่นาที
     */
    for (const iso of [
      '2026-08-15T00:01:00+07:00',
      '2026-08-15T23:59:59+07:00',
      '2026-08-15T06:59:00+07:00',
      '2026-08-15T07:01:00+07:00',
      '2026-01-01T00:00:00+07:00',
    ]) {
      const now = new Date(iso)
      const appt = appointmentDayBounds('today', now)
      const money = thaiTodayBounds(now)
      expect(money.from.toISOString(), `from ต่างกันที่ ${iso}`).toBe(appt.from.toISOString())
      expect(money.to.toISOString(), `to ต่างกันที่ ${iso}`).toBe(appt.to.toISOString())
    }
  })

  it('[blocker] ช่วงต้องเป็น [from, to) กว้าง 24 ชม. พอดี', () => {
    const { from, to } = thaiTodayBounds(new Date('2026-08-15T13:00:00+07:00'))
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000)
  })

  it('[blocker] appointment-day ต้องเรียก thaiTodayBounds ไม่คำนวณขอบวันเอง', () => {
    /**
     * เทสข้างบนพิสูจน์ว่า "วันนี้เท่ากัน" — แต่ถ้าสองที่คำนวณเองเหมือนกันโดยบังเอิญ
     * วันที่คนหนึ่งแก้ อีกฝั่งจะเงียบ ๆ ต่างออกไป ด่านนี้ผูกที่ **โครงสร้าง** ไม่ใช่ผลลัพธ์
     */
    const code = stripComments(read('src/lib/appointment-day.ts'))
    /**
     * 🛑 ตรวจ **เฉพาะตัว `appointmentDayBounds`** ไม่ใช่ทั้งไฟล์ — ร่างแรกห้าม `thaiMidnightUtc`
     * ทั้งไฟล์แล้วแดงทันที เพราะ `thaiDateBounds` (ขอบของ *วันที่ที่ระบุ*) ใช้มันโดยชอบธรรม
     * สองฟังก์ชันตอบคนละคำถาม กฎที่ห้ามคือ "อย่าคำนวณ **วันนี้** เอง" ไม่ใช่ "ห้ามใช้ชื่อนี้"
     * (ด่านต้องตรวจ *สิ่งที่ห้าม* ไม่ใช่ *การสะกด* — บทเรียนซ้ำจาก HR9 grep gate)
     */
    const start = code.indexOf('export function appointmentDayBounds')
    expect(start, 'ต้องมีฟังก์ชัน appointmentDayBounds').toBeGreaterThan(-1)
    const next = code.indexOf('\nexport ', start + 1)
    const fn = code.slice(start, next === -1 ? undefined : next)
    expect(fn, 'ต้องเรียก thaiTodayBounds').toContain('thaiTodayBounds(')
    expect(fn, 'ห้ามประกอบเที่ยงคืนเองในตัวที่ตอบว่า "วันนี้"').not.toContain('thaiMidnightUtc(')
  })
})

describe('การ์ดเงินที่รับวันนี้ ต้องไม่โกหกตอนไม่รู้', () => {
  it('[blocker] query ล้ม → ต้องเป็น undefined ห้ามตกเป็น 0', () => {
    /**
     * `?? undefined` ไม่ใช่ `?? 0` — ต่างกันแค่ตัวอักษรเดียวแต่คนละความหมายคนละเรื่อง:
     * `0` แปลว่า "วันนี้ไม่มีเงินเข้าเลย" ส่วนความจริงคือ "เราไม่รู้"
     */
    const code = stripComments(read('src/app/(paces)/seller/(dashboard)/dashboard/page.tsx'))
    expect(code, 'ต้องรับผลด้วย ?? undefined').toMatch(
      /moneyReceivedToday\s*=\s*moneyTodayRes\.value\s*\?\?\s*undefined/,
    )
    expect(code, 'ห้ามตั้งค่าตั้งต้นเป็นตัวเลข').not.toMatch(
      /let moneyReceivedToday[^\n]*=\s*\{/,
    )
  })

  it('[blocker] ต้องยิงเฉพาะร้านบริการ — ร้านอื่นไม่ต้องเสีย query', () => {
    const code = stripComments(read('src/app/(paces)/seller/(dashboard)/dashboard/page.tsx'))
    /**
     * 🛑 ตรวจว่า **ทุกการเรียก query เรื่องเงิน อยู่หลังด่าน vertical** ไม่ใช่ผูกกับรูปประโยค
     * ร่างแรกเขียน `vertical === 'SERVICE_QUEUE' ? getMoneyReceivedToday(` ตรง ๆ แล้วแดงทันที
     * ที่โค้ดถูก refactor เป็น `? Promise.all([...])` ทั้งที่ด่านยังอยู่ครบ
     * (ด่านต้องตรวจ *สิ่งที่ห้าม* ไม่ใช่ *การสะกด* — บทเรียนซ้ำจาก HR9 grep gate)
     */
    const gateAt = code.indexOf("vertical === 'SERVICE_QUEUE'")
    expect(gateAt, 'ต้องมีด่าน vertical').toBeGreaterThan(-1)
    for (const fn of ['getMoneyReceivedToday(', 'countUnpaidJobsToday(']) {
      const callAt = code.indexOf(fn, gateAt)
      expect(callAt, `${fn} ต้องถูกเรียกหลังด่าน vertical`).toBeGreaterThan(gateAt)
      // ต้องอยู่ใกล้ ๆ ด่าน (ในนิพจน์เดียวกัน) ไม่ใช่หลุดไปอยู่คนละที่ในไฟล์
      expect(callAt - gateAt, `${fn} ต้องอยู่ในนิพจน์เดียวกับด่าน`).toBeLessThan(200)
    }
  })

  it('[blocker] แถวเงินห้ามเรียกตัวเองว่า "ยอดขาย" — คนละนิยามกับ /sales (HR16)', () => {
    /**
     * 🛑 "เงินที่เข้าจริง" ≠ "ยอดขายตามบิล" — ร้านที่เก็บมัดจำมีสองเลขนี้ต่างกันเสมอ
     * ถ้าการ์ดใช้คำว่า "ยอดขาย" ผู้ขายจะเอาไปเทียบกับ `/sales` แล้วสรุปว่าระบบคำนวณผิดทั้งหน้า
     * และต้อง **บอกความต่างบนจอ ไม่ใช่แค่คอมเมนต์**
     */
    const src = read(
      'src/app/(paces)/seller/(dashboard)/dashboard/components/MoneyTodayRow.tsx',
    )
    const jsxText = stripComments(src)
    expect(jsxText, 'ข้อความบนจอห้ามใช้คำว่า "ยอดขาย"').not.toMatch(/>[^<]*ยอดขาย(?!ตามบิล)/)
    expect(src, 'ต้องอธิบายความต่างจากยอดขายบนจอ').toContain('ไม่ใช่ยอดขายตามบิล')
  })
})

describe('ไทล์ "นัดวันนี้" ต้องพาไปตารางงาน (AC-SQ-05)', () => {
  const BAND = 'src/app/(paces)/seller/(dashboard)/dashboard/components/OrderStatusBand.tsx'

  it('[blocker] ต้องลิงก์ /queues ไม่ใช่ /orders', () => {
    /**
     * 🛑 นี่คือมติที่ **ย้อนของเดิม** — 2026-08-10 user เคยสั่งให้เปลี่ยนจาก `/queues` มาเป็น
     * `/orders?apptDay=today` ด้วยเหตุผลที่ถูกในตอนนั้น (ไทล์ทั้ง 4 ในแถบควรไปที่เดียวกัน)
     * แล้ว 2026-08-15 หัวหน้า+user กลับมติ เพราะร้านบริการอ่าน "ใครมากี่โมง" จากตารางเวลา
     *
     * ด่านนี้มีไว้กัน "แก้กลับ" โดยไม่รู้ประวัติ — เหตุผลเดิมยังฟังขึ้นอยู่ ใครอ่านโค้ดเฉย ๆ
     * จะเห็นว่าไทล์เดียวในแถบไปคนละที่แล้วคิดว่าเป็นความพลาด
     *
     * 🛑 จับ `/queues` แบบ **ขึ้นต้น** ไม่ใช่ทั้งสตริงเป๊ะ — ร่างแรกของด่านนี้เขียน
     * `'\/queues'` ปิดท้ายด้วย quote จึงแดงทันทีที่เติม `?date=` เข้าไป ทั้งที่ปลายทาง
     * ยังถูกทุกประการ. ด่านที่ผูกกับ *วิธีสะกด* พังตอน refactor แล้วคนถัดไปจะปิดมันทิ้ง
     * (รอยเดิม: `provider="apple"` 2026-08-12 · `indexOf('WHEN NOT EXISTS (')` 2026-08-10)
     */
    const code = readFileSync(join(ROOT, BAND), 'utf8')
    const tile = code.slice(code.indexOf('appointmentToday !== undefined'))
    expect(tile, 'ไทล์นัดวันนี้ต้องพาไป /queues').toMatch(/href:\s*[`']\/queues[?`']/)
    expect(tile, 'ห้ามกลับไป /orders?apptDay=').not.toMatch(/href:\s*'\/orders\?apptDay=/)
  })

  it('[blocker] ต้องส่ง ?date= ของวันนี้ไปด้วย ไม่ใช่ /queues เปล่า ๆ', () => {
    /**
     * บั๊กที่ด่านนี้กัน (หัวหน้าแจ้ง 2026-08-19): *"ตอนกดนัดวันนี้ มันไม่เข้าไปที่ตารางงาน
     * ของวันนี้ด้วย มันไปโผล่หน้า calendar รวม"*
     *
     * `/queues` เปล่า ๆ เปิดมาเป็นปฏิทินทั้งเดือน ⇒ ไทล์ที่เขียนว่า "นัดวันนี้ N" พาไปที่ที่
     * ยังต้องจิ้มหาวันเอง — **ป้ายสัญญาอย่าง ปลายทางให้อีกอย่าง** ซึ่งเป็นบั๊กที่ `tsc`/build/
     * theme-guard มองไม่เห็นเลย เพราะ `'/queues'` เป็นสตริงที่ถูกทุกตัวอักษร
     *
     * 🛑 ต้องเป็น `thaiDayKey` ตัวเดียวกับที่ตัวนับบนไทล์ใช้ตัดสิน "วันนี้" — ถ้าคำนวณวันเอง
     * ตรงนี้ ช่วงเที่ยงคืนตามเวลาไทยจะเลื่อนกันได้ แล้วไทล์บอก N แต่เปิดไปเจอวันว่าง
     */
    const code = readFileSync(join(ROOT, BAND), 'utf8')
    const tile = code.slice(code.indexOf('appointmentToday !== undefined'))
    expect(tile, 'ต้องแนบ ?date= ไปกับปลายทาง').toMatch(/\/queues\?date=/)
    expect(tile, 'วันต้องมาจาก thaiDayKey ไม่ใช่คำนวณเอง').toMatch(/thaiDayKey\(/)
  })

  it('[blocker] ตัวกรอง ?apptDay= ต้องยังอยู่ — เปลี่ยนปลายทางไทล์ ไม่ใช่ถอดฟีเจอร์', () => {
    /**
     * ของที่ยังมีผู้ใช้อยู่จริง (ชีตตารางงานรายวันลิงก์เข้ามา) — การเปลี่ยนลิงก์ไทล์แล้วเผลอ
     * ลบตัวกรองทิ้ง จะทำให้ทางเข้าที่เหลือกลายเป็นลิงก์ตาย โดยไม่มีอะไรฟ้อง
     */
    for (const rel of [
      'src/lib/appointment-day.ts',
      'src/app/(paces)/seller/(dashboard)/orders/components/OrdersList.tsx',
      'src/components/safepay/appointment-board/AppointmentDaySheet.tsx',
    ]) {
      expect(readFileSync(join(ROOT, rel), 'utf8'), `${rel}: ตัวกรอง apptDay ต้องยังอยู่`).toContain(
        'apptDay',
      )
    }
  })
})

describe('แถบสถานะการเก็บเงินบนแถวเงิน (หัวหน้า: "อยากให้รู้ยังไง")', () => {
  const CARD = 'src/app/(paces)/seller/(dashboard)/dashboard/components/MoneyTodayRow.tsx'

  it('[blocker] "มีงานวันนี้ไหม" ต้องตัดสินจากจำนวนงาน ห้ามตัดสินจากยอดเงิน', () => {
    /**
     * 🛑 บั๊กที่ร่างแรกมีจริง: ใช้ `money.total > 0` เป็นเงื่อนไขสถานะเขียว ⇒ งานที่ลูกค้า
     * จ่ายมัดจำมาตั้งแต่เมื่อวานจะทำให้ `total = 0` ทั้งที่วันนี้มีงานจริงและเก็บครบแล้ว
     * การ์ดจะขึ้น "วันนี้ไม่มีงานที่ต้องเก็บเงิน" ซึ่งผิดข้อเท็จจริง
     * (คลาสเดียวกับ `0` ที่ถูกใช้แทน "ไม่รู้" — `partial-data-must-be-labeled-or-filled.md`)
     */
    const code = stripComments(read(CARD))
    expect(code, 'ต้องใช้ jobsToday ตัดสิน').toMatch(/\(jobsToday \?\? 0\) > 0/)
    expect(code, 'ห้ามใช้ยอดเงินตัดสินว่ามีงานไหม').not.toMatch(/\) : money\.total > 0 \?/)
  })

  it('[blocker] เขียวได้เฉพาะตอนไม่มีงานค้างจริง (Verified-Means-Green)', () => {
    /**
     * 🛑 ยึด **แถบสถานะ** ไม่ใช่ `bg-success/15` ตัวแรกในไฟล์ — วงกลมไอคอนหัวการ์ดใช้คลาส
     * เดียวกันและอยู่ก่อนหน้า ⇒ ร่างแรกเทียบตำแหน่งผิดจุดแล้วแดงทั้งที่โค้ดถูก
     */
    const code = stripComments(read(CARD))
    const warnAt = code.indexOf('money.unpaidJobs > 0')
    const greenAt = code.indexOf('เก็บเงินครบทุกงานของวันนี้แล้ว')
    expect(warnAt, 'ต้องเช็คงานค้างก่อน').toBeGreaterThan(-1)
    expect(greenAt, 'ต้องมีข้อความสถานะเขียว').toBeGreaterThan(-1)
    expect(warnAt, 'เงื่อนไขงานค้างต้องมาก่อนสถานะเขียว').toBeLessThan(greenAt)
  })

  it('[blocker] เกณฑ์วันของ "งานค้าง" ต้องตรงกับ appointmentDayWhere เป๊ะ', () => {
    /**
     * เลขสองตัวบนการ์ดเดียวกัน (ค้าง N งาน · มีงานวันนี้กี่งาน) มาจากคนละ query —
     * เกณฑ์วันต่างกันแม้แต่ขอบเดียว = ขึ้น "เก็บครบแล้ว" สีเขียวทั้งที่ยังมีงานค้าง
     */
    const sql = read('src/services/order-payment.service.ts')
    const fn = sql.slice(sql.indexOf('export async function countUnpaidJobsToday'))
    expect(fn, 'ต้องมีสาขา serviceEnd IS NOT NULL').toMatch(
      /serviceEnd" IS NOT NULL AND o\."serviceEnd" > \$\{from\} AND o\."serviceStart" < \$\{to\}/,
    )
    expect(fn, 'ต้องมีสาขา serviceEnd IS NULL').toMatch(
      /serviceEnd" IS NULL AND o\."serviceStart" >= \$\{from\} AND o\."serviceStart" < \$\{to\}/,
    )
    expect(fn, 'ต้องตัดใบยกเลิก').toContain(`status" <> 'CANCELLED'`)
  })
})
