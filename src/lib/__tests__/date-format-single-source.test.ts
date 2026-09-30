import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  THAI_MONTHS_ABBR,
  THAI_MONTHS_FULL,
  WEEKDAY_SHORT_TH,
  WEEKDAY_TH,
  formatYearTH,
  toBuddhistYear,
} from '@/lib/format-date'

/**
 * [blocker] วันที่ทั้งระบบต้องผ่านตัวกลาง `src/lib/format-date.ts` (docs/conventions/date-format.md)
 *
 * ที่มา 2026-09-30: user สั่ง "ระบบเรามี format วันที่ตัวกลางอยู่ เรียกใช้แบบเดียวกันทั้งระบบ"
 * สแกนแล้วเจอของที่เขียนเองนอกตัวกลาง **25 จุดใน 20 ไฟล์** — ตารางชื่อเดือนซ้ำ 5 ชุด · `+ 543` เอง 6 ที่
 * · `Intl`/`toLocaleString` กับ Date 5 ที่ · ตัดวันด้วย UTC 6 ที่ (ในนั้นมีบั๊กจริง: ยอดรายเดือนบนหน้าหลัก
 * และช่วงวันที่เองในแท็บค่าใช้จ่ายเลื่อนไป 1 วัน) · ฟังก์ชันเวลาสัมพัทธ์ซ้ำ 3 ชุด
 *
 * กฎเขียนไว้ใน convention ตั้งแต่ 2026-06-16 แต่ด่านเป็น "grep ให้ reviewer รันเอง" ⇒ ไม่มีใครรัน
 * (rule-must-be-enforced-not-described.md) — ไฟล์นี้คือด่านที่รันเองใน CI
 *
 * 🛑 ตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนี้ไว้ด้วย
 */

const SRC = join(process.cwd(), 'src')

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, withFileTypes: true })
    .filter(
      (e) =>
        e.isFile() &&
        /\.tsx?$/.test(e.name) &&
        !e.name.includes('.test.') &&
        !e.name.includes('.spec.') &&
        !(e.parentPath ?? '').includes('__tests__'),
    )
    .map((e) => join(e.parentPath ?? SRC, e.name))
}

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/[ \t]\/\/ .*$/gm, '')

const FILES = sourceFiles().map((abs) => ({ rel: relative(process.cwd(), abs), src: strip(readFileSync(abs, 'utf8')) }))

/** ไฟล์ที่ละเมิดกฎ ยกเว้นรายชื่อที่อนุญาต (แต่ละรายต้องมีเหตุผลกำกับ) */
function offenders(re: RegExp, allow: string[] = []): string[] {
  return FILES.filter((f) => !allow.includes(f.rel) && re.test(f.src)).map((f) => f.rel)
}

const CENTRAL = 'src/lib/format-date.ts'

describe('[blocker] วันที่ทั้งระบบผ่าน format-date.ts ที่เดียว', () => {
  it('เดินไฟล์เจอจริง (ไม่ใช่เขียวเพราะสแกนไม่เจออะไร)', () => {
    expect(FILES.length).toBeGreaterThan(500)
    expect(FILES.some((f) => f.rel === CENTRAL)).toBe(true)
  })

  it('ห้าม toLocaleDateString / toLocaleTimeString / Intl.DateTimeFormat นอกตัวกลาง', () => {
    expect(offenders(/toLocaleDateString\(|toLocaleTimeString\(|Intl\.DateTimeFormat\(/, [CENTRAL])).toEqual([])
  })

  it('ห้าม toLocaleString ที่มีตัวเลือกของวันที่ (year/month/day/hour/...)', () => {
    // toLocaleString กับตัวเลข/เงินยังใช้ได้ — ด่านนี้จับเฉพาะตัวที่ส่งตัวเลือกของวันเวลาเข้าไป
    expect(
      offenders(/toLocaleString\([^)]*\{[^}]*\b(year|month|day|hour|minute|weekday|timeZone|dateStyle|timeStyle)\s*:/),
    ).toEqual([])
  })

  it('ห้ามบวก 543 เอง — ใช้ toBuddhistYear / formatYearTH', () => {
    // order-search-sql.ts: เป็นนิพจน์ SQL ที่ Postgres คำนวณเลขออเดอร์ (DP+ปี พ.ศ.) ให้ตรงกับที่
    // formatOrderNo ผลิต — ต้องรันในฐานข้อมูล จึงเรียกฟังก์ชัน TS ไม่ได้
    expect(offenders(/\+\s*543\b/, [CENTRAL, 'src/lib/order-search-sql.ts'])).toEqual([])
  })

  it('ห้ามโชว์ปี ค.ศ. จาก getFullYear() ในข้อความ — ใช้ formatYearTH / formatMonthYearTH', () => {
    // จับ template literal ที่ getFullYear() อยู่ติดข้อความไทย/©/ตัวคั่นเดือน-ปี "m/y"
    // (คีย์ภายใน "YYYY-MM-DD" ของ input ไม่โดน เพราะไม่มีตัวอักษรไทย/© และคั่นด้วย "-")
    // ที่มา 2026-10-01: footer หน้า buyer โชว์ "© 2026" และ API ร้านคืน "9/2026"
    expect(
      offenders(
        /`[^`]*[\u0E00-\u0E7F©][^`]*\$\{[^}]*get(UTC)?FullYear\(\)|\$\{[^}]*get(UTC)?FullYear\(\)[^}]*\}[^`]*[\u0E00-\u0E7F©]|\}\/\$\{[^}]*get(UTC)?FullYear\(\)/,
        [CENTRAL],
      ),
    ).toEqual([])
  })

  it('ช่องวันที่ของเบราว์เซอร์ต้องมีป้าย พ.ศ. กำกับ (BeDateHint หรือข้อความผ่านตัวกลาง)', () => {
    // ช่อง date/datetime-local แสดงปีตามเครื่อง (ส่วนใหญ่ ค.ศ.) — ที่มา 2026-10-01 "วันที่เราใช้ พ.ศ. แปลงให้ครบ"
    const withNative = FILES.filter((f) => /type=["'](date|datetime-local)["']/.test(f.src))
    expect(withNative.length, 'ไม่เจอช่องวันที่เลย — ด่านนี้สแกนไม่เจออะไร').toBeGreaterThan(5)
    const bad = withNative
      .filter((f) => !/<BeDateHint\b|\bformatDate(TH|Time|TimeTH)?\(/.test(f.src))
      .map((f) => f.rel)
    expect(bad).toEqual([])
  })

  it('ห้ามประกาศตารางชื่อเดือนไทยเอง — ใช้ THAI_MONTHS_ABBR / THAI_MONTHS_FULL', () => {
    expect(offenders(/['"`](ม\.ค\.|มกราคม)['"`]\s*,/, [CENTRAL])).toEqual([])
  })

  it('ห้ามประกาศตารางชื่อวันเอง — ใช้ WEEKDAY_SHORT_TH / WEEKDAY_TH', () => {
    expect(offenders(/\[\s*['"`]อา['"`]\s*,|['"`]อาทิตย์['"`]\s*,\s*['"`]จันทร์/, [CENTRAL])).toEqual([])
  })

  it('ห้ามเขียนฟังก์ชันเวลาสัมพัทธ์ซ้ำ — ใช้ relativeTimeTh จาก relative-time-th.ts', () => {
    expect(offenders(/function\s+relativeTimeTh\b/, ['src/lib/relative-time-th.ts'])).toEqual([])
  })

  it('date-fns ใช้ได้เฉพาะที่ลงทะเบียนไว้', () => {
    // RecentActivityFeed: ป้าย "2 ชั่วโมงที่แล้ว" ต้องสลับภาษาตาม dictionary (th/en) — ตัวกลางเป็นไทยล้วน
    // จุดใหม่ต้องเพิ่มชื่อที่นี่พร้อมเหตุผล ไม่ใช่ import เพิ่มเงียบ ๆ
    expect(
      offenders(/from ['"]date-fns/, ['src/app/(paces)/seller/(dashboard)/dashboard/components/RecentActivityFeed.tsx']),
    ).toEqual([])
  })
})

describe('[blocker] ตัวกลางที่ export ใหม่ให้ค่าถูก', () => {
  it('ตารางเดือน/วันครบ 12/7 ช่อง และเริ่มที่ ม.ค./อาทิตย์', () => {
    expect(THAI_MONTHS_ABBR).toHaveLength(12)
    expect(THAI_MONTHS_FULL).toHaveLength(12)
    expect(THAI_MONTHS_ABBR[0]).toBe('ม.ค.')
    expect(THAI_MONTHS_FULL[11]).toBe('ธันวาคม')
    expect(WEEKDAY_SHORT_TH).toHaveLength(7)
    expect(WEEKDAY_TH[0]).toBe('อาทิตย์')
  })

  it('toBuddhistYear บวก 543', () => {
    expect(toBuddhistYear(2026)).toBe(2569)
  })

  it('formatYearTH ตัดปีด้วยเวลาไทย ไม่ใช่ UTC', () => {
    // 31 ธ.ค. 2025 18:00 UTC = 1 ม.ค. 2026 01:00 น. เวลาไทย ⇒ ต้องเป็นปีใหม่แล้ว
    // getFullYear() บน server UTC จะได้ 2025 → 2568 (บั๊กเดิมของ footer หน้าโปรไฟล์)
    expect(formatYearTH(new Date('2025-12-31T18:00:00Z'))).toBe('2569')
    expect(formatYearTH(null)).toBe('—')
  })
})
