import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { formatDateTH, formatDayMonthShortYearTH } from '@/lib/format-date'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src/app/(paces)/seller/(dashboard)/orders/[token]/components/ShippingActivity.tsx')
const read = () => readFileSync(SRC, 'utf8')
/** ด่านต้องดู *โค้ด* ไม่ใช่คำอธิบาย — ไฟล์นั้นเล่าเหตุผลไว้ยาวและมีชื่อฟังก์ชันอยู่ในคอมเมนต์ด้วย */
const code = () => read().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * ด่านของบั๊กที่หัวหน้าเจอเอง 2026-08-31 — ประวัติออเดอร์บนมือถือ "วันที่/รูป/ชื่อ ไม่ตรงกันสักอัน"
 *
 * 🛑 ต้นเหตุไม่ใช่ CSS ที่เขียนผิด แต่เป็น **เจตนาที่เขียนไว้ในคอมเมนต์แล้วไม่เคยมีโค้ดบังคับ**
 * คอมเมนต์เดิมเขียนว่า "(ปีตัดออกที่จอเล็ก)" ขณะที่โค้ดเรียก `formatDateTH` ซึ่งคืนปีเต็มเสมอ
 * ⇒ วัดจอจริง 390px: ปีเต็มกว้างสุด 80px แต่คอลัมน์เป็น `w-14` = 56px ⇒ ตกบรรทัดทุกใบ
 * กล่องวันที่สูง 59px ขณะที่รูปโปรไฟล์สูง 36px ⇒ เวลาห้อยต่ำกว่ารูปไป 23px
 *
 * คลาสเดียวกับ `docs/conventions/rule-must-be-enforced-not-described.md`:
 * กฎที่ "เขียนไว้" ยังไม่ใช่กฎที่ "บังคับได้"
 */
describe('[blocker] คอลัมน์วันที่ในประวัติออเดอร์', () => {
  /* วัดด้วยฟอนต์ Anuphan ครบ 12 เดือนบนจอจริง 2026-08-31 (text-xs) */
  const FULL_MAX_PX = 80
  const SHORT_MAX_PX = 64
  /* w-18 = 4.5rem = 72px · md:w-25 = 6.25rem = 100px */
  const MOBILE_COL_PX = 72
  const DESKTOP_COL_PX = 100

  it('ตัวเลขที่ยกมาต้องยังจริง — สตริงที่ยาวที่สุดของทั้งสองรูปแบบ', () => {
    /* ไม่วัดพิกเซล (ไม่มี DOM ในชุดเทสนี้) แต่ตรึง **จำนวนตัวอักษร** ไว้แทน:
       ถ้ามีใครเปลี่ยนรูปแบบวันที่ให้ยาวขึ้น เทสนี้แดงก่อนที่หน้าจอจะตกบรรทัดอีกรอบ */
    const d = new Date('2026-04-28T10:00:00+07:00')
    expect(formatDateTH(d)).toBe('28 เม.ย. 2569')
    expect(formatDayMonthShortYearTH(d)).toBe('28 เม.ย. 69')
    expect(formatDayMonthShortYearTH(d).length).toBeLessThan(formatDateTH(d).length)
  })

  it('🛑 มือถือต้องใช้ปี 2 หลัก · เดสก์ท็อปใช้ปีเต็ม — ห้ามยุบเหลือรูปแบบเดียว', () => {
    const c = code()
    expect(c, 'มือถือต้องเรียก formatDayMonthShortYearTH').toMatch(
      /md:hidden[\s\S]{0,80}formatDayMonthShortYearTH\(/,
    )
    expect(c, 'เดสก์ท็อปต้องเรียก formatDateTH').toMatch(/md:inline[\s\S]{0,80}formatDateTH\(/)
  })

  it('🛑 คอลัมน์ต้องกว้างพอสำหรับรูปแบบที่ใช้จริงในแต่ละจอ', () => {
    const c = code()
    const mobile = c.match(/className="w-(\d+) shrink-0 md:w-(\d+)"/)
    expect(mobile, 'ไม่เจอคลาสความกว้างของคอลัมน์วันที่').not.toBeNull()
    const toPx = (n: string) => Number(n) * 4 // สเกลของ Tailwind: 1 = 0.25rem = 4px
    const mobilePx = toPx(mobile![1])
    const desktopPx = toPx(mobile![2])
    expect(mobilePx, `มือถือ ${mobilePx}px ต้อง ≥ ${SHORT_MAX_PX}px`).toBeGreaterThanOrEqual(SHORT_MAX_PX)
    expect(desktopPx, `เดสก์ท็อป ${desktopPx}px ต้อง ≥ ${FULL_MAX_PX}px`).toBeGreaterThanOrEqual(FULL_MAX_PX)
    /* ตรึงค่าที่วัดแล้วไว้ด้วย — กันการ "ย่อให้พอดีเป๊ะ" ซึ่งไม่เหลือที่ให้การปัดเศษ */
    expect(mobilePx).toBe(MOBILE_COL_PX)
    expect(desktopPx).toBe(DESKTOP_COL_PX)
  })
})
