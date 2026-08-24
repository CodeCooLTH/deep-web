'use client'

/**
 * HighlightText — เน้นช่วงของข้อความที่ตรงกับคำค้น (feature 00058)
 *
 * 🛑 ไม่มี pattern "เน้นคำในข้อความ" ใน Paces theme เลย (ตรวจแล้ว — Hard Rule 1)
 * ตัวนี้จึง **ประกอบจาก token ที่มีอยู่** ไม่ได้ประดิษฐ์ primitive ใหม่:
 * `bg-{semantic}/15` + `text-{semantic}-ink` เป็น idiom ของ badge soft-tone ที่ใช้อยู่ทั่วระบบ
 * (`paces-component-reference.md` §6) — ไม่มี arbitrary value สักตัว
 *
 * ใช้ `text-primary-ink` ไม่ใช่ `text-primary` เพราะตัวหลังวัดได้ 4.17:1 = ตก AA สำหรับข้อความ
 * (ตัวเลขนี้เขียนกำกับไว้เองใน `_root.css`) — และเป็นสีเดียวกัน ไม่ได้เปลี่ยนเฉด
 * (`docs/conventions/contrast-fix-keeps-hue.md`)
 *
 * เหตุผลที่ใช้ primary (น้ำเงิน) ไม่ใช่ warning/success: การ์ดออเดอร์ใช้เขียวสื่อ "ยืนยันแล้ว"
 * และเหลืองสื่อ "รอ" อยู่แล้ว การไฮไลต์ที่ยืมสีเหล่านั้นมาจะพูดสิ่งที่ตัวเองไม่ได้หมายถึง
 */

import { Fragment } from 'react'

import { isNumericSearchToken, searchDigitsOnly, tokenizeSearchQuery } from '@/lib/order-search'

type Range = { start: number; end: number }

/** รวมช่วงที่ทับกัน — คำค้นหลายคำที่ตรงคาบเกี่ยวกันต้องไม่ถูกตัดซ้อนจนข้อความหาย */
function mergeRanges(ranges: Range[]): Range[] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const out: Range[] = [sorted[0]]
  for (const r of sorted.slice(1)) {
    const last = out[out.length - 1]
    if (r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push({ ...r })
  }
  return out
}

function findRanges(text: string, query: string): Range[] {
  const lower = text.toLowerCase()
  const ranges: Range[] = []
  let numericFallback = false

  for (const token of tokenizeSearchQuery(query)) {
    const needle = token.toLowerCase()
    let from = lower.indexOf(needle)
    let found = false
    while (from !== -1) {
      ranges.push({ start: from, end: from + needle.length })
      found = true
      from = lower.indexOf(needle, from + needle.length)
    }
    if (found) continue

    /**
     * ไม่เจอแบบตรงตัว แต่ตรงหลังตัดสัญลักษณ์ (เก็บ `081-234-5678` ผู้ใช้พิมพ์ `0812345678`)
     *
     * 🛑 เน้น "ทั้งก้อน" ไม่ใช่คำนวณตำแหน่งย้อนกลับ — ตำแหน่งในสตริงที่ตัดขีดออกแล้ว
     * ไม่ใช่ตำแหน่งเดียวกับสตริงที่มีขีด การ map กลับคือบ่อเกิดของ off-by-one ที่จะไปตัด
     * กลางตัวอักษรไทย ส่วนการเน้นทั้งก้อนอ่านได้ถูกต้องเสมอและอธิบายตัวเองได้
     */
    if (isNumericSearchToken(token)) {
      const digits = searchDigitsOnly(token)
      if (digits && searchDigitsOnly(text).includes(digits)) numericFallback = true
    }
  }

  if (numericFallback && ranges.length === 0) return [{ start: 0, end: text.length }]
  return mergeRanges(ranges)
}

type Props = {
  text: string
  /** คำค้นดิบจากช่องพิมพ์ — ถ้าว่างหรือสั้นเกิน ข้อความจะถูกเรนเดอร์ตามปกติ ไม่มี wrapper เพิ่ม */
  query?: string
  /**
   * ข้อความแม่มีสีของตัวเองอยู่แล้ว (เช่นเลขคำสั่งซื้อที่เป็นลิงก์ `text-primary`)
   * → เน้นด้วยพื้นหลังอย่างเดียว ไม่ทับสีตัวอักษร ไม่งั้นจะได้น้ำเงินสองเฉดในลิงก์เดียว
   */
  inheritColor?: boolean
}

export default function HighlightText({ text, query, inheritColor = false }: Props) {
  if (!query || !query.trim()) return <>{text}</>
  const ranges = findRanges(text, query)
  if (ranges.length === 0) return <>{text}</>

  const parts: React.ReactNode[] = []
  let cursor = 0
  ranges.forEach((r, i) => {
    if (r.start > cursor) parts.push(<Fragment key={`t${i}`}>{text.slice(cursor, r.start)}</Fragment>)
    parts.push(
      <mark
        key={`m${i}`}
        className={
          inheritColor
            ? 'rounded bg-primary/15 px-0.5 font-semibold text-inherit'
            : 'rounded bg-primary/15 px-0.5 font-semibold text-primary-ink'
        }
      >
        {text.slice(r.start, r.end)}
      </mark>,
    )
    cursor = r.end
  })
  if (cursor < text.length) parts.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>)

  return <>{parts}</>
}
