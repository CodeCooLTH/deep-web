import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseQueueDateParam } from '../queue-date-param'

/**
 * [blocker] `?date=` ของ `/queues` — ทั้งฝั่งส่งและฝั่งรับต้องตรงกัน
 *
 * บั๊กที่ด่านนี้กัน (หัวหน้าแจ้ง 2026-08-19): ไทล์ "นัดวันนี้ N" พาไป `/queues` เปล่า ๆ
 * ⇒ เปิดมาเจอ **ปฏิทินทั้งเดือน** ต้องจิ้มหาวันเอง
 *
 * 🛑 ฟีเจอร์นี้พังได้ 2 ทิศที่ไม่มี gate ไหนเห็น:
 *   1. ฝั่งส่งเลิกแนบ `?date=` (กลับไปเป็นบั๊กเดิมเป๊ะ) — กันที่ `money-received-today.test.ts`
 *   2. **ฝั่งรับเลิกอ่าน** — ลิงก์ยังมี `?date=` ครบทุกตัวอักษร แต่ไม่มีใครเอาไปใช้
 *      อาการที่ผู้ใช้เห็นเหมือนกันเป๊ะกับข้อ 1 ทั้งที่โค้ดคนละที่ ⇒ ต้องมีด่านของตัวเอง
 *
 * 🛑 แดง = ห้าม merge
 */

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** ลบเนื้อคอมเมนต์แต่คงจำนวนบรรทัด — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย */
const blankComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, (m, indent: string) => indent)

describe('parseQueueDateParam', () => {
  it('รับวันที่รูปแบบถูกและมีอยู่จริง', () => {
    expect(parseQueueDateParam('2026-08-19')).toBe('2026-08-19')
    expect(parseQueueDateParam('2024-02-29')).toBe('2024-02-29') // ปีอธิกสุรทิน
  })

  it('[blocker] ไม่มี param → null (ต้องทำงานเหมือนเดิมทุกอย่าง)', () => {
    /**
     * เส้นทางที่มีผู้ใช้อยู่แล้ว: เปิด `/queues` จากเมนู — ห้ามเปลี่ยนพฤติกรรมเดิม
     * (มือถือ = ไม่เด้งชีต · เดสก์ท็อป = เปิดที่เดือนปัจจุบัน)
     */
    expect(parseQueueDateParam(null)).toBeNull()
    expect(parseQueueDateParam(undefined)).toBeNull()
    expect(parseQueueDateParam('')).toBeNull()
  })

  it('[blocker] รูปแบบผิด → null ไม่ใช่ Invalid Date', () => {
    /**
     * ค่านี้มาจาก URL ⇒ ใครพิมพ์อะไรมาก็ได้ `new Date('abc')` **ไม่ throw** แต่ทำให้
     * ปฏิทินเรนเดอร์เพี้ยนเงียบ ๆ — ต้องตกเป็น null แล้วถอยไปพฤติกรรมเดิม
     */
    for (const bad of ['abc', '2026-8-19', '19-08-2026', '2026-08-19T10:00', '2026/08/19']) {
      expect(parseQueueDateParam(bad), bad).toBeNull()
    }
  })

  it('[blocker] วันที่ไม่มีอยู่จริง → null (regex อย่างเดียวไม่พอ)', () => {
    /**
     * `2026-02-31` ผ่าน `^\d{4}-\d{2}-\d{2}$` ทุกตัวอักษร แต่ JS จะม้วนไปเป็น 03-03 ให้เอง
     * ⇒ ผู้ใช้ขอวันหนึ่ง ได้อีกวันหนึ่ง โดยไม่มีอะไรฟ้อง
     */
    expect(parseQueueDateParam('2026-02-31')).toBeNull()
    expect(parseQueueDateParam('2026-13-01')).toBeNull()
    expect(parseQueueDateParam('2025-02-29')).toBeNull() // ปีปกติ
  })
})

describe('[blocker] ทั้งสองจอของ /queues ต้องอ่าน ?date= ผ่านนิยามเดียวกัน', () => {
  /**
   * `QueuesCalendarSwitch` mount **ตัวเดียว** ตามความกว้าง ⇒ ถ้าฝั่งใดฝั่งหนึ่งไม่อ่าน
   * ผู้ใช้ครึ่งหนึ่งจะเจอบั๊กเดิมอยู่ โดยอีกครึ่งบอกว่าแก้แล้ว
   */
  const SCREENS = [
    ['มือถือ/แท็บเล็ต', 'src/components/safepay/appointment-board/AppointmentMonthBoard.tsx'],
    ['เดสก์ท็อป', 'src/app/(paces)/seller/(dashboard)/queues/components/AppointmentCalendar.tsx'],
  ] as const

  for (const [label, rel] of SCREENS) {
    it(`${label} — ต้องเรียก parseQueueDateParam ห้ามเขียนกฎเอง`, () => {
      const code = blankComments(read(rel))
      expect(code, `${rel}: ต้องอ่าน ?date= จาก URL`).toMatch(/useSearchParams\(\)/)
      expect(code, `${rel}: ต้องกรองผ่านนิยามร่วม`).toMatch(/parseQueueDateParam\(/)
      /**
       * 🛑 ห้ามก็อป regex ไปเขียนซ้ำในจอ (HR16) — วันที่ด้านหนึ่งรับ `2026-02-31`
       * อีกด้านไม่รับ คือรูปร่างของบั๊กที่ไม่มีใครหาเจอ
       */
      expect(code, `${rel}: ห้ามเขียนกฎวันที่ซ้ำในไฟล์จอ`).not.toMatch(
        /\\d\{4\}-\\d\{2\}-\\d\{2\}/,
      )
    })
  }

  it('มือถือ — ต้องเปิดชีตครั้งเดียว ผู้ใช้ปิดแล้วห้ามเด้งกลับ', () => {
    /**
     * `?date=` ค้างอยู่ใน URL ตลอด ⇒ effect ที่ผูกกับมันตรง ๆ จะสั่งเปิดชีตใหม่ทุก re-render
     * = **ผู้ใช้ปิดชีตไม่ลง** ซึ่งแย่กว่าบั๊กเดิมที่กำลังแก้อยู่
     */
    const code = blankComments(
      read('src/components/safepay/appointment-board/AppointmentMonthBoard.tsx'),
    )
    expect(code, 'ต้องมีธงกันเปิดซ้ำ').toMatch(/autoOpened/)
    expect(code, 'ต้องรอ isCompact รู้ค่าก่อน (null = ยังไม่รู้ความกว้าง)').toMatch(
      /isCompact === null/,
    )
  })
})
