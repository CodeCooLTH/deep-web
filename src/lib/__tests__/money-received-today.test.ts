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

describe('คอลัมน์เงินรายวันในตารางชีตยอดขาย', () => {
  const SHEET =
    'src/app/(paces)/seller/(dashboard)/dashboard/components/SalesChartSheet.tsx'

  it('[blocker] ตารางต้องตัดสินจากชุดข้อมูล ไม่ใช่รับ prop vertical แยกทาง', () => {
    /**
     * 🛑 ถ้าหน้าจอรับ `vertical` มาอีกทางแล้วเอามาตัดสินเอง มันจะเพี้ยนกับ service ได้:
     * ส่ง vertical ถูกแต่ service ไม่ได้คิดชุดข้อมูลมา ⇒ ขึ้นหัวคอลัมน์ "รับจริง" ที่ว่าง
     * ทั้งคอลัมน์ · ตัดสินจาก **การมีอยู่ของข้อมูล** ⇒ หัวกับตัวเลขมาจากแหล่งเดียวกันเสมอ
     */
    const code = stripComments(read(SHEET))
    expect(code, 'ต้อง derive จาก receivedValues').toMatch(
      /isService\s*=\s*series\.receivedValues != null/,
    )
  })

  it('[blocker] "ยอดขาย" กับ "รับจริง" ต้องเป็นคนละคอลัมน์ ห้ามยุบเป็นตัวเดียว (HR16)', () => {
    /**
     * 🛑 "เงินที่เข้าจริง" ≠ "ยอดขายตามบิล" — ร้านที่เก็บมัดจำมีสองเลขนี้ต่างกันเสมอ
     * เดิมบทเรียนนี้อยู่กับการ์ด "รับจริงวันนี้" ที่ถูกถอดออก 2026-08-23 · ตอนนี้สองเลขนั้น
     * **อยู่บรรทัดเดียวกัน** ซึ่งดีกว่าเดิม (ความต่างมองเห็นได้ ไม่ต้องอธิบาย) แต่มีเงื่อนไข:
     * ต้องยังเป็นคนละช่อง และต้องมี "ค้างรับ" เป็นตัวเชื่อมให้เห็นว่าลบกันได้ลงตัว
     * ยุบเมื่อไหร่ = กลับไปเป็นเลขเดียวที่แปลได้สองอย่าง ซึ่งคือรูปร่างของบั๊ก HR16
     *
     * 🛑 เหลือ 3 ช่อง (ไม่มี "มัดจำ" แล้ว) ตั้งแต่ 2026-08-23 — มัดจำเป็น subset ที่บวกไม่ได้
     * ผู้ขายบวกรวมกับ "รับจริง" แล้วเกินยอดขาย จึงถามว่าระบบคำนวณผิดไหม (ดู v9 หัวไฟล์ชีต)
     */
    const code = read(SHEET)
    for (const label of ['ยอดขาย', 'รับจริง', 'ค้างรับ']) {
      expect(code, `หัวคอลัมน์ต้องมี "${label}"`).toContain(`>${label}<`)
    }
    expect(code, 'ห้ามเอาคอลัมน์ "มัดจำ" กลับมา — มันบวกกับคอลัมน์ข้าง ๆ ไม่ได้').not.toContain(
      '>มัดจำ<',
    )
  })

  it('[blocker] ค้างรับต้องลบจากยอดขายของแถวเดียวกัน ไม่ใช่ตัวเลขจากคนละแกน', () => {
    /**
     * 🛑 ทุกคอลัมน์ในตารางนี้ผูกกับ `Order.createdAt` — ถ้าเงินรับจริงถูก bucket ด้วย
     * `receivedAt` มันจะเป็นคอลัมน์เดียวที่อยู่คนละแกน แล้ว `ยอดขาย − รับจริง` จะ
     * **ลบข้ามแกน**: วันที่เก็บเงินก้อนที่เหลือของงานเมื่อวานได้ค้างรับติดลบ
     * เลขทั้งสองตัว "ถูก" ในตัวเอง จึงไม่มี tsc/build/เทสตัวไหนฟ้อง
     * (เคยเขียนผิดแบบนี้จริงในร่างแรกของฟีเจอร์นี้ — ดู `sumReceivedByBucket` ที่ถูกถอดออก)
     */
    const svc = stripComments(read('src/services/dashboard.service.ts'))

    // ต้องสะสมในลูปเดียวกับ values (ซึ่ง bucket ด้วย createdAt) ไม่ใช่ query แยก
    const valuesAt = svc.indexOf('values[idx] += amt')
    const recvAt = svc.indexOf('receivedValues[idx] +=')
    expect(valuesAt, 'ต้องมีการสะสม values').toBeGreaterThan(-1)
    expect(recvAt, 'receivedValues ต้องสะสมในลูปเดียวกับ values').toBeGreaterThan(valuesAt)
    expect(recvAt - valuesAt, 'ต้องอยู่ในลูปเดียวกัน ไม่ใช่คนละที่ในไฟล์').toBeLessThan(1200)

    // ห้ามกลับไป bucket ด้วยเวลาที่รับเงิน
    expect(svc, 'ห้าม bucket เงินด้วย receivedAt').not.toContain('receivedAt')

    // ฝั่งจอต้องลบจาก r.value ของแถวเดียวกัน ไม่ใช่ยอดอื่น
    expect(stripComments(read(SHEET)), 'ค้างรับต้องเป็น r.value - r.received').toMatch(
      /r\.value - r\.received/,
    )
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

/* 🛑 describe "แถบสถานะการเก็บเงินบนแถวเงิน" (3 เคส) ถูกถอดออก 2026-08-23 พร้อมกับ
   `MoneyTodayRow` · `getMoneyReceivedToday` · `countUnpaidJobsToday` ที่มันปักหมุด
   — user สั่งเอาแถว "รับจริงวันนี้" ออกจากหน้าแรก แล้วย้ายเป็นคอลัมน์รายวันในตาราง

   บทเรียนที่ยังมีชีวิตอยู่ ย้ายไปแล้วทั้งหมด ไม่ได้หายไปกับโค้ด:
     · "ห้ามตัดสินจากยอดเงินว่ามีงานไหม" → ไม่มีสถานะให้ตัดสินอีกแล้ว (ตารางแสดงเลขตรง ๆ)
     · "เกณฑ์วันของสองเลขบนการ์ดเดียวกันต้องตรงกัน" → describe แรกของไฟล์นี้ ซึ่งยังบังคับ
       `appointmentDayBounds` = `thaiTodayBounds` อยู่ (เป็นตัวที่กว้างกว่าและยังมีผู้ใช้จริง)
     · "รับจริง ≠ ยอดขาย (HR16)" → describe "คอลัมน์เงินรายวัน…" ข้างบน

   ห้ามเขียนด่านใหม่ที่อ้างชื่อฟังก์ชันเหล่านั้น — มันไม่มีอยู่แล้ว ด่านจะแดงถาวรโดยไม่มี
   ใครแก้ได้ แล้วคนถัดไปจะปิดมันทิ้งพร้อมกับด่านที่ยังใช้ได้ในไฟล์เดียวกัน */
