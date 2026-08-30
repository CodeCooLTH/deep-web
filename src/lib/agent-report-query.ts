/**
 * agent-report-query — แปลง query string ของรายงานผลงานแอดมินเป็นตัวกรอง (feature 00059)
 *
 * pure module — ใช้ร่วมกันระหว่าง page (RSC) กับ API route
 *
 * 🛑 ต้องมีตัวเดียว: หน้าจอโหลดครั้งแรกด้วย RSC แล้วค่อยยิง API ตอนเปลี่ยนตัวกรอง
 * ถ้าสองทางแปลง query คนละชุด ตัวเลขจะเปลี่ยนตอนกดกรองทั้งที่ไม่ควรเปลี่ยน
 * (บทเรียนเดียวกับ `order-stage.service.ts` ที่หน้าแรกกับ API เคยคำนวณคนละที่)
 */

import { resolveDateRange, thaiMidnightUtc } from '@/lib/date-range'
import { CHAT_CHANNELS } from '@/lib/chat-channel'
import type { ReportFilters } from '@/lib/agent-performance'

/**
 * เพดานความยาวช่วงที่ยอมให้ขอได้ต่อครั้ง — กันคำขอที่ลากทั้งปีแล้วดึงรอบการรอเป็นหมื่นแถว
 *
 * 🛑 อยู่ในไฟล์ pure ไม่ใช่ใน service — ตัวแปลง query ถูก import จากทั้งฝั่ง server และฝั่ง
 * client (ปุ่มเลือกช่วงต้องรู้เพดานเพื่อบอกผู้ใช้ก่อนกด) service มี `import 'server-only'`
 * การดึงค่าคงที่ตัวเดียวจากที่นั่นจะลากทั้ง prisma เข้า bundle ฝั่ง client
 */
export const MAX_RANGE_DAYS = 92

export const REPORT_SOURCES = ['ADS', 'SHORTLINK', 'DIRECT'] as const
export type ReportSource = (typeof REPORT_SOURCES)[number]

const DAY_MS = 24 * 60 * 60 * 1000

export type RawReportQuery = {
  from?: string | null
  to?: string | null
  channel?: string | null
  source?: string | null
  shopChannelId?: string | null
  agentId?: string | null
}

export type ParsedReportQuery = {
  filters: ReportFilters
  agentId: string | null
  /** ค่าที่ echo กลับไปให้ UI เติมในช่องกรอง — "YYYY-MM-DD" (วันสุดท้ายแบบ **รวม**) */
  label: { from: string; to: string }
  /** ผู้ใช้ขอช่วงที่ยาวเกินเพดาน แล้วถูกหั่นให้สั้นลง — หน้าจอต้องบอก ห้ามหั่นเงียบ ๆ */
  clamped: boolean
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function parseIsoDay(value: string | null | undefined): [number, number, number] | null {
  if (!value || !ISO_DATE.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return [y, m - 1, d]
}

const isoOf = (d: Date) => new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)

/**
 * ค่าตั้งต้น = **7 วันล่าสุด** ตามนิยามของ `resolveDateRange('7d')` ที่ระบบใช้อยู่แล้ว
 * (วันนี้ย้อนหลัง 6 วัน รวมวันนี้ ตัดวันด้วยเที่ยงคืนเวลาไทย) — ห้ามนิยาม "7 วัน" ขึ้นใหม่
 */
export function parseReportQuery(q: RawReportQuery): ParsedReportQuery {
  const fromParts = parseIsoDay(q.from)
  const toParts = parseIsoDay(q.to)

  let from: Date
  let toExcl: Date
  if (fromParts && toParts) {
    from = thaiMidnightUtc(fromParts[0], fromParts[1], fromParts[2])
    toExcl = thaiMidnightUtc(toParts[0], toParts[1], toParts[2] + 1)
  } else {
    const preset = resolveDateRange('7d')
    from = preset.orderRange.gte
    toExcl = preset.orderRange.lt
  }

  // ช่วงกลับหัว (ผู้ใช้พิมพ์สลับ) → สลับให้ ไม่ใช่คืนช่วงว่างซึ่งอ่านเป็น "ไม่มีข้อมูล"
  if (toExcl.getTime() <= from.getTime()) {
    const swapped = new Date(from.getTime() + DAY_MS)
    from = new Date(toExcl.getTime() - DAY_MS)
    toExcl = swapped
  }

  let clamped = false
  if (toExcl.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    from = new Date(toExcl.getTime() - MAX_RANGE_DAYS * DAY_MS)
    clamped = true
  }

  const channel = CHAT_CHANNELS.includes((q.channel ?? '') as (typeof CHAT_CHANNELS)[number])
    ? (q.channel as string)
    : null
  const source = REPORT_SOURCES.includes((q.source ?? '') as ReportSource)
    ? (q.source as ReportSource)
    : null

  return {
    filters: {
      from,
      to: toExcl,
      channel,
      source,
      shopChannelId: q.shopChannelId?.trim() || null,
    },
    agentId: q.agentId?.trim() || null,
    label: { from: isoOf(from), to: isoOf(new Date(toExcl.getTime() - DAY_MS)) },
    clamped,
  }
}
