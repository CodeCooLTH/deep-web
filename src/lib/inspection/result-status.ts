// result-status.ts — SSOT ของ "สถานะที่แสดง" ของผลตรวจ (feature 00060)
//
// InspectionResult เป็นตาราง **append-only ที่เก็บประวัติ ไม่ใช่ตารางสถานะปัจจุบัน**
// การอ่านสถานะจึงมี 2 ขั้นเสมอ และทั้งสองขั้นอยู่ในไฟล์นี้ที่เดียว:
//   1) latestResultPerCheck() — เลือกแถวล่าสุดต่อ (checkKey, roomId)
//   2) resolveResultStatus()  — แปลงแถวนั้นเป็น 1 ใน 5 สถานะที่แสดง
//
// 🛑 ห้ามหน้าจอไหน query เองหรือคำนวณสถานะเอง — ทุก surface (สาธารณะ/ร้าน/ผู้ตรวจ/แอดมิน/แอป)
//    เรียกสองฟังก์ชันนี้ เหตุผลคือ boolean ที่ตัดสินว่า UI แสดงอะไรต้องมีที่ให้เทสจับ
//    (docs/conventions/ui-boolean-needs-a-testable-home.md)
//
// 🛑 DB เก็บแค่ 3 ค่า (PASS/FAIL/NOT_APPLICABLE) — `RECHECK` กับ `NO_DATA` เป็นผลลัพธ์ของ
//    การคำนวณ ห้ามเก็บลงคอลัมน์เด็ดขาด เพราะจะเน่าเงียบทันทีที่เวลาเดินผ่านเส้น expiresAt
//    โดยไม่มีใครเขียนทับ (นี่คือเหตุผลที่ cron ไม่มีงาน "อัปเดตสถานะหมดอายุ")

import type { InspectionCheckKey } from './checks'

/** ค่าที่เก็บจริงในคอลัมน์ `InspectionResult.outcome` */
export type InspectionOutcome = 'PASS' | 'FAIL' | 'NOT_APPLICABLE'

/** สถานะที่แสดงบนหน้าจอ — 5 ค่า มากกว่าที่เก็บใน DB 2 ค่า */
export type InspectionDisplayStatus = 'PASS' | 'FAIL' | 'RECHECK' | 'NO_DATA' | 'NOT_APPLICABLE'

/**
 * คำไทยของแต่ละสถานะ — SSOT ที่เดียว (Hard Rule 16)
 * 🛑 ห้ามพิมพ์คำว่า "รอตรวจซ้ำ"/"ยังไม่มีข้อมูล" ซ้ำที่หน้าจอไหนอีก ให้อ่านจากตัวนี้
 */
export const DISPLAY_STATUS_LABEL_TH: Record<InspectionDisplayStatus, string> = {
  PASS: 'ผ่าน',
  FAIL: 'ไม่ผ่าน',
  RECHECK: 'รอตรวจซ้ำ',
  NO_DATA: 'ยังไม่มีข้อมูล',
  NOT_APPLICABLE: 'ไม่เกี่ยวข้องกับที่พักประเภทนี้',
}

/**
 * แถวผลตรวจเท่าที่ตรรกะสถานะต้องใช้ — รับเป็น structural type เพื่อให้เทสสร้างเองได้
 * โดยไม่ต้องพึ่ง Prisma client (และเพื่อให้ผู้เรียกส่ง DTO ที่ตัดฟิลด์ลับออกแล้วเข้ามาได้)
 */
export type InspectionResultRow = {
  id: string
  checkKey: InspectionCheckKey
  /** null = ข้อที่ผูกกับร้าน (scope SHOP) · มีค่า = ผูกกับที่พักหลังนั้น (scope ROOM) */
  roomId: string | null
  outcome: InspectionOutcome
  /** เวลาที่ "ผลนี้" ถูกตัดสินครั้งแรก — ไม่เปลี่ยนอีกตลอดอายุแถว ใช้เรียงหาแถวล่าสุด */
  checkedAt: Date
  /** เวลาที่ยืนยันผลเดิมล่าสุด — ใช้แสดง "ตรวจล่าสุดเมื่อไร" และเป็นฐานของ expiresAt */
  lastConfirmedAt: Date
  /** null = ไม่มีวันหมดอายุ (ไม่ใช่ "หมดอายุแล้ว") */
  expiresAt: Date | null
  /** มีค่า = ถูกทำให้เป็นโมฆะก่อนกำหนด เช่นร้านเปลี่ยนภาพประกาศ (FR-INS-028) */
  invalidatedAt: Date | null
}

/** คีย์ประจำขอบเขตของผลตรวจหนึ่งข้อ — `(checkKey, roomId ?? null)` */
/**
 * ชื่อสถานะที่ **สัญญา HTTP** ใช้ (API.md §3.2 ค) — ต่างจากชื่อภายในหนึ่งค่า: `RECHECK` → `RECHECK_DUE`
 *
 * 🛑 อยู่ติดกับ enum ต้นทางโดยตั้งใจ (HR16) — เดิมตัวแปลนี้อยู่ใน `owner-view.ts` ซึ่งเป็นไลบรารี
 *    ของ "หน้าร้าน" ⇒ endpoint ฝั่งผู้ตรวจไม่ได้เรียก แล้วปล่อยค่า `RECHECK` ดิบออก HTTP ทั้งที่
 *    สัญญาเขียนว่า `RECHECK_DUE` · หน้าจอที่ก็อป type ตาม API.md จะ lookup ไม่เจอแล้วป้ายหาย
 *    ทั้งสถานะโดยไม่มี error สักตัว (พบตอนต่อหน้าจอ T13)
 */
export type ApiDisplayStatus = 'PASS' | 'FAIL' | 'RECHECK_DUE' | 'NO_DATA' | 'NOT_APPLICABLE'

const DISPLAY_STATUS_TO_API: Record<InspectionDisplayStatus, ApiDisplayStatus> = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  RECHECK: 'RECHECK_DUE',
  NO_DATA: 'NO_DATA',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
}

/** แปลงชื่อภายใน → ชื่อในสัญญา · ทุก endpoint ที่คืน displayStatus ต้องผ่านตัวนี้เท่านั้น */
export function toApiDisplayStatus(status: InspectionDisplayStatus): ApiDisplayStatus {
  return DISPLAY_STATUS_TO_API[status]
}

export type ResultScopeKey = string

export function resultScopeKey(checkKey: InspectionCheckKey, roomId: string | null): ResultScopeKey {
  return `${checkKey}::${roomId ?? ''}`
}

/**
 * เลือก "แถวล่าสุด" ต่อ (checkKey, roomId)
 *
 * 🛑 สูตรของ "ล่าสุด" คือ `checkedAt DESC, id DESC` เสมอ ทุกที่ ทั้ง SQL และ TS
 *    tie-break ด้วย id ห้ามตัดออก — cron ขั้น 1 เขียนหลายข้อในทรานแซกชันเดียว checkedAt
 *    ซ้ำวินาทีจึงเป็นเรื่องปกติ ไม่ใช่ edge case ถ้าสองฝั่งเรียงไม่เหมือนกัน ป้ายกับไทม์ไลน์
 *    จะไม่ตรงกันแบบสุ่มโดยไม่มีอะไรฟ้อง
 *
 * 🛑 เรียงด้วย `checkedAt` ไม่ใช่ `lastConfirmedAt` — แถวเก่าที่เคยถูกยืนยันซ้ำมานานอาจมี
 *    lastConfirmedAt ใหม่กว่าแถวที่มาแทนที่ได้ในเคส invalidate เรียงผิดฟิลด์ = หยิบแถวที่
 *    ถูกแทนที่ไปแล้วกลับมาแสดง
 *
 * หมายเหตุ: ฝั่ง SQL ใช้ `DISTINCT ON ("shopId", "checkKey", "roomId")` โดยมี shopId เป็น
 * คีย์แรกเสมอ (ที่นี่ไม่ต้องมีเพราะผู้เรียกส่งแถวของร้านเดียวเข้ามาแล้ว) — ต้องมีเทส parity
 * ที่ป้อนแถวชุดเดียวกันเข้าทั้งสองทางแล้วยืนยันว่าได้แถวเดียวกัน
 */
export function latestResultPerCheck(
  rows: readonly InspectionResultRow[],
): Map<ResultScopeKey, InspectionResultRow> {
  const latest = new Map<ResultScopeKey, InspectionResultRow>()
  for (const row of rows) {
    const key = resultScopeKey(row.checkKey, row.roomId)
    const current = latest.get(key)
    if (current === undefined || isNewerThan(row, current)) latest.set(key, row)
  }
  return latest
}

/** `a` ใหม่กว่า `b` ตามสูตร `checkedAt DESC, id DESC` */
function isNewerThan(a: InspectionResultRow, b: InspectionResultRow): boolean {
  const ta = a.checkedAt.getTime()
  const tb = b.checkedAt.getTime()
  if (ta !== tb) return ta > tb
  // เวลาชนกัน → ตัดสินด้วย id เรียงจากมากไปน้อย ให้ตรงกับ `ORDER BY "id" DESC` ของ Postgres
  // (uuid ตัวพิมพ์เล็กเป็น ASCII ล้วน ลำดับ byte กับลำดับ UTF-16 ของ JS จึงตรงกัน)
  return a.id > b.id
}

/**
 * แปลงแถวล่าสุด (หรือการไม่มีแถว) เป็นสถานะที่แสดง
 *
 * 🛑 ลำดับการตัดสินสำคัญ ห้ามสลับ:
 *   1. ไม่มีแถว                                      → NO_DATA
 *   2. outcome = NOT_APPLICABLE                      → NOT_APPLICABLE
 *   3. PASS และ (ถูกทำให้เป็นโมฆะ หรือ เลย expiresAt) → RECHECK
 *   4. PASS                                          → PASS
 *   5. FAIL                                          → FAIL
 *
 * ข้อ 3 ต้องมาก่อนข้อ 4 เสมอ ไม่งั้นผลที่หมดอายุแล้วจะยังโชว์ว่า "ผ่าน"
 *
 * 🛑 `now` ต้องรับเข้ามา ห้ามเรียก new Date() ในฟังก์ชัน — ไม่งั้นเทสค่าขอบเขียนไม่ได้
 */
export function resolveResultStatus(
  row: InspectionResultRow | null | undefined,
  now: Date,
): InspectionDisplayStatus {
  if (row == null) return 'NO_DATA'
  if (row.outcome === 'NOT_APPLICABLE') return 'NOT_APPLICABLE'
  if (row.outcome === 'PASS') {
    if (row.invalidatedAt !== null) return 'RECHECK'
    // เทียบด้วย `<` ไม่ใช่ `<=` — ณ วินาทีที่เท่ากันพอดียังถือว่าผ่าน
    // และ expiresAt === null แปลว่า "ไม่มีวันหมดอายุ" ไม่ใช่ "หมดอายุแล้ว"
    if (row.expiresAt !== null && row.expiresAt.getTime() < now.getTime()) return 'RECHECK'
    return 'PASS'
  }
  return 'FAIL'
}

/**
 * วันที่ที่ป้ายบนโปรไฟล์ใช้ตอบคำถาม "ตรวจล่าสุดเมื่อไร"
 *
 * 🛑 ตัวนี้กับ timelineOutcomeChangedAt() สลับกันง่ายมากและสลับแล้วโกหกผู้ใช้ทันที
 *    โดยไม่มีอะไรฟ้อง — ป้ายจะขึ้นวันที่ของการเปลี่ยนผลครั้งสุดท้าย ทำให้ร้านที่ถูกตรวจ
 *    ต่อเนื่องมาตลอดดูเหมือนถูกทิ้งร้างมานาน
 */
export function badgeLastVerifiedAt(row: InspectionResultRow): Date {
  return row.lastConfirmedAt
}

/** วันที่ที่ไทม์ไลน์ใช้ตอบคำถาม "ผลเปลี่ยนเมื่อไร" — คนละคำถามกับด้านบน */
export function timelineOutcomeChangedAt(row: InspectionResultRow): Date {
  return row.checkedAt
}
