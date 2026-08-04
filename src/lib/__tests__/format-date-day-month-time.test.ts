// regression ของบั๊ก "NaN ส.ค." — ปลายทางการเรนเดอร์ (Impeccable critique 2026-08-04)
//
// คู่กับ src/lib/iship/unlinked.test.ts ที่คุมฝั่ง normalize: ตัวนั้นพิสูจน์ว่า input ทุกรูป
// กลายเป็น ISO เดียวกัน ตัวนี้พิสูจน์ว่า ISO นั้นแสดงผลเป็นวันเวลาไทยที่ถูกต้อง
// เดิมงานนี้อยู่ในตาราง MONTHS ที่ component เขียนเอง จึงไม่เคยมีเทสคุมเลย

import { describe, expect, it } from 'vitest'
import { formatDayMonthTimeTH } from '@/lib/format-date'

describe('formatDayMonthTimeTH', () => {
  it('แปลง ISO เป็นวัน+เดือนย่อ+เวลาไทย ไม่มีปี', () => {
    // 02:00Z = 09:00 เวลาไทย
    expect(formatDayMonthTimeTH('2026-08-01T02:00:00.000Z')).toBe('1 ส.ค. 09:00')
  })

  it('ข้ามวันเมื่อแปลงเป็นเวลาไทยแล้ว (17:00Z = เที่ยงคืนวันถัดไป)', () => {
    expect(formatDayMonthTimeTH('2026-07-31T17:00:00.000Z')).toBe('1 ส.ค. 00:00')
  })

  it('ครบทั้ง 12 เดือน — กัน off-by-one ของ index เดือน', () => {
    const got = Array.from({ length: 12 }, (_, i) =>
      // วันที่ 15 เที่ยงวันไทย = 05:00Z ปลอดภัยจากการข้ามเดือน
      formatDayMonthTimeTH(`2026-${String(i + 1).padStart(2, '0')}-15T05:00:00.000Z`),
    )
    expect(got).toEqual([
      '15 ม.ค. 12:00', '15 ก.พ. 12:00', '15 มี.ค. 12:00', '15 เม.ย. 12:00',
      '15 พ.ค. 12:00', '15 มิ.ย. 12:00', '15 ก.ค. 12:00', '15 ส.ค. 12:00',
      '15 ก.ย. 12:00', '15 ต.ค. 12:00', '15 พ.ย. 12:00', '15 ธ.ค. 12:00',
    ])
  })

  it('null/undefined/ค่าที่แปลงไม่ได้ → เส้นประ ไม่ใช่ NaN', () => {
    expect(formatDayMonthTimeTH(null)).toBe('—')
    expect(formatDayMonthTimeTH(undefined)).toBe('—')
    expect(formatDayMonthTimeTH('ไม่ใช่วันที่')).toBe('—')
    // รูปที่เคยทำให้เกิดบั๊ก: ถ้าหลุด normalize มาถึงตรงนี้ ก็ต้องไม่ขึ้น NaN
    expect(formatDayMonthTimeTH('01T09:00:00')).toBe('—')
  })
})
