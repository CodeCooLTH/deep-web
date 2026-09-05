// auto-checks.ts — ข้อตรวจอัตโนมัติของขั้นที่ 1 (feature 00060 · T8 งานที่ 3)
//
// 🛑 **ทะเบียนนี้ต้องครบทั้ง 6 ข้อเสมอ และข้อที่ยังตัดสินไม่ได้ต้องประกาศตัวว่ายังตัดสินไม่ได้**
//    ไม่ใช่หายไปเงียบ ๆ จากลูป — ข้อที่หายจากลูปคือข้อที่ไม่มีใครรู้ว่ามันไม่เคยถูกตรวจ
//    (ผู้ซื้อเห็น "ยังไม่มีข้อมูล" เหมือนกันทั้งกรณี "ตรวจแล้วไม่มีข้อมูล" และ "ไม่มีใครเขียนโค้ด")
//
// 🛑 **ห้าม fallback เป็น PASS เมื่อแหล่งข้อมูลล่ม** — ระบบค้นฐานมิจฉาชีพล่มหนึ่งวัน
//    ต้องแปลว่า "วันนี้ยังไม่ได้ตรวจ" (ผลเดิมอยู่ต่อจนหมดอายุใน 1 วันแล้วตกเป็น "รอตรวจซ้ำ")
//    ไม่ใช่ "ตรวจแล้วสะอาด" — นี่คือข้อที่ผิดแล้วเราออกคำรับรองเท็จให้ร้านที่อยู่ในฐานจริง

import { INSPECTION_CHECKS, type InspectionCheckKey } from './checks'
import type { InspectionOutcome } from './result-status'

/** ข้อตรวจ 6 ข้อของขั้นที่ 1 — ทั้งหมด method=AUTO (AC-INS-03-1) */
export type Step1AutoCheckKey =
  | 'scam_db'
  | 'phone_identity'
  | 'account_age'
  | 'chat_response_speed'
  | 'complaints'
  | 'duplicate_listing'

export type AutoCheckSkipReason =
  /** แหล่งข้อมูลมีอยู่จริงแต่รอบนี้ไม่มีข้อมูลให้ตัดสิน ⇒ ต้องได้ "ยังไม่มีข้อมูล" ไม่ใช่ "ไม่ผ่าน" */
  | 'NO_SOURCE_DATA'
  /** เกณฑ์ผ่าน/ไม่ผ่านของข้อนี้ยังไม่มีมติ — ห้ามตั้งเส้นเอง เพราะป้ายนี้เป็นคำรับรองต่อผู้ซื้อ */
  | 'CRITERIA_NOT_DECIDED'
  /** ยังไม่มีกลไกตรวจจับ — ต่างจาก "ตรวจแล้วไม่พบ" คนละความหมายกันคนละเรื่อง */
  | 'NO_DETECTOR'

export type AutoCheckVerdict =
  | { kind: 'RECORD'; outcome: InspectionOutcome }
  | { kind: 'SKIP'; reason: AutoCheckSkipReason }

export type AutoCheckFacts = {
  /** พบในฐานมิจฉาชีพไหม — 🛑 `null` = ค้นไม่สำเร็จรอบนี้ ห้ามตีเป็น "ไม่พบ" */
  scamFound: boolean | null
  /** ระดับยืนยันตัวตนสูงสุดของร้าน (0 = ยังไม่เคยยืนยัน) · null = อ่านไม่ได้ */
  verificationLevel: number | null
  /** อายุบัญชีร้านเป็นวัน */
  accountAgeDays: number | null
  /** % การตอบแชทจาก cron chat-response-metrics · null = ตัวอย่างไม่พอ/ยังไม่เคยคำนวณ */
  chatResponseRate: number | null
  /** จำนวนออเดอร์ที่ผู้ซื้อทักท้วงแล้วยังไม่ถูกปิดเรื่อง · null = อ่านไม่ได้ */
  openComplaintCount: number | null
}

export type AutoCheckDef = {
  /** ทำไมข้อนี้ยังตัดสินไม่ได้ (ถ้ายังตัดสินไม่ได้) — ให้คนอ่านโค้ดเห็นสถานะจริงโดยไม่ต้องเดา */
  evaluate: (facts: AutoCheckFacts) => AutoCheckVerdict
}

/**
 * 🛑 ประกาศเป็น `Record<Step1AutoCheckKey, …>` เพื่อให้ `tsc` บังคับความครบ —
 *    grep จับ object key ไม่ได้ (docs/conventions/enum-value-removal.md)
 */
export const STEP1_AUTO_CHECKS: Record<Step1AutoCheckKey, AutoCheckDef> = {
  // ── ตัดสินได้แล้ว ─────────────────────────────────────────────────────────
  scam_db: {
    evaluate: (f) => {
      if (f.scamFound === null) return { kind: 'SKIP', reason: 'NO_SOURCE_DATA' }
      return { kind: 'RECORD', outcome: f.scamFound ? 'FAIL' : 'PASS' }
    },
  },
  phone_identity: {
    evaluate: (f) => {
      // ระดับ 0 = ยังไม่เคยยืนยัน = **ยังไม่มีข้อมูล** ไม่ใช่ "ไม่ผ่าน" (SRS §9 · ร้านที่ยัง
      // ไม่ส่งยืนยันไม่ได้แปลว่าตัวตนมีปัญหา การตีเป็น FAIL คือการกล่าวหาโดยไม่มีการตรวจ)
      if (f.verificationLevel === null || f.verificationLevel < 1) {
        return { kind: 'SKIP', reason: 'NO_SOURCE_DATA' }
      }
      return { kind: 'RECORD', outcome: 'PASS' }
    },
  },
  complaints: {
    evaluate: (f) => {
      if (f.openComplaintCount === null) return { kind: 'SKIP', reason: 'NO_SOURCE_DATA' }
      // "ผ่าน" ของข้อนี้แปลว่า **ไม่มีข้อร้องเรียนที่ยังค้าง** ไม่ใช่ "ไม่เคยมีเรื่องร้องเรียนเลย"
      // (เรื่องที่ปิดแล้วไม่ถูกนับ — ร้านที่แก้ปัญหาให้ลูกค้าจบไม่ควรถูกลงโทษตลอดไป)
      return { kind: 'RECORD', outcome: f.openComplaintCount === 0 ? 'PASS' : 'FAIL' }
    },
  },

  // ── ยังตัดสินไม่ได้ — รอมติ/รอกลไก (ต้องไม่หายไปจากทะเบียน) ────────────────
  account_age: {
    // ข้อมูลมีครบ (Shop.createdAt) แต่ **ไม่มีมติว่ากี่วันถึงเรียกว่าผ่าน** — การตั้งเส้นเอง
    // แปลว่าเราออกคำรับรองต่อผู้ซื้อด้วยตัวเลขที่ไม่มีใครตัดสิน (OQ ของ 00060)
    evaluate: () => ({ kind: 'SKIP', reason: 'CRITERIA_NOT_DECIDED' }),
  },
  chat_response_speed: {
    // เดียวกัน — `Shop.chatResponseRate` มีอยู่แล้วจาก cron chat-response-metrics
    // แต่ "ตอบเร็วพอ" คือกี่เปอร์เซ็นต์/กี่นาที ยังไม่มีมติ
    evaluate: () => ({ kind: 'SKIP', reason: 'CRITERIA_NOT_DECIDED' }),
  },
  duplicate_listing: {
    // 🛑 ยังไม่มีตัวตรวจจับการประกาศซ้ำข้ามบัญชีบน Deep เลย — ห้ามคืน PASS เด็ดขาด
    //    "ไม่มีตัวตรวจ" กับ "ตรวจแล้วไม่พบว่าซ้ำ" ต่างกันคนละเรื่อง และข้อนี้เป็นข้อที่
    //    ผู้ซื้อใช้ตัดสินว่าที่พักนี้ถูกเอาไปประกาศโดยมิจฉาชีพหรือเปล่า
    evaluate: () => ({ kind: 'SKIP', reason: 'NO_DETECTOR' }),
  },
}

export const STEP1_AUTO_CHECK_KEYS = Object.keys(STEP1_AUTO_CHECKS) as Step1AutoCheckKey[]

/** ข้อของขั้น 1 ที่ผูกกับที่พักรายหลัง — cron ต้องวนต่อ Room ไม่ใช่ต่อร้าน */
export function isRoomScopedAutoCheck(key: Step1AutoCheckKey): boolean {
  return INSPECTION_CHECKS[key as InspectionCheckKey].scope === 'ROOM'
}
