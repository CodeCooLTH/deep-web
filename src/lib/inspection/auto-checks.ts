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

/**
 * ข้อเท็จจริงของ **ที่พักรายหลัง** — ข้อที่ `scope==='ROOM'` ต้องตัดสินด้วยชุดนี้ ไม่ใช่ชุดของร้าน
 * (ข้อเดียวที่ใช้ตอนนี้คือ `duplicate_listing` ซึ่งผลต่างกันได้ระหว่างหลังในร้านเดียวกัน)
 */
export type RoomAutoCheckFacts = {
  /** จำนวนรูปที่ห้องนี้ประกาศไว้ทั้งหมด */
  totalImageCount: number
  /** จำนวนรูปที่คำนวณลายนิ้วมือ (sha256) สำเร็จแล้ว */
  hashedImageCount: number
  /** จำนวนรูปที่เนื้อไฟล์ตรงกับของร้านอื่นที่ **ประกาศไว้ก่อนเรา** */
  copiedFromOtherShopCount: number
  /** true = ค้นลายนิ้วมือรอบนี้ไม่สำเร็จ ⇒ "ยังไม่มีข้อมูล" ห้ามตีเป็น "ไม่พบว่าซ้ำ" */
  lookupFailed: boolean
}

// ── เกณฑ์ผ่าน (OQ-12 · เคาะโดย user 2026-09-06) ────────────────────────────
//
// 🛑 ตัวเลขสองตัวนี้คือ **คำรับรองต่อผู้ซื้อ** ไม่ใช่ค่าคงที่ภายใน — เปลี่ยนเมื่อไหร่แปลว่า
//    ป้ายของร้านที่เคยผ่านอาจร่วงในวันรุ่งขึ้นโดยที่ร้านไม่ได้ทำอะไรผิด ⇒ ต้องมีมติก่อนทุกครั้ง

/** อายุบัญชีขั้นต่ำที่ถือว่า "ผ่าน" — 30 วัน (มติ user: ร้านใหม่ที่จ่ายเงินไม่ควรรอ 3 เดือน) */
export const ACCOUNT_AGE_MIN_DAYS = 30

/**
 * อัตราการตอบแชทขั้นต่ำที่ถือว่า "ผ่าน" — 80%
 *
 * เลือก 80 เพราะเป็น **ช่องว่างจริงในข้อมูล** (ค่าที่มีอยู่บน prod เกาะกันสองกลุ่ม: 56/67 กับ
 * 99/100/100/100) ไม่ใช่เลขกลม ๆ ที่เลือกเพราะฟังดูดี
 *
 * 🛑 ตัวเลขที่ป้อนเข้ามาต้องผ่าน `resolveChatResponse()` มาก่อนแล้วเสมอ — นั่นคือที่ที่เกณฑ์
 *    "ตัวอย่างพอไหม" (`CHAT_RESPONSE_MIN_SAMPLE`) ถูกบังคับ ถ้าอ่าน `Shop.chatResponseRate`
 *    ดิบ ๆ จะได้ป้าย "ผ่าน" จากบทสนทนาเดียว ขณะที่หน้าร้านสาธารณะเลือกจะไม่พูดอะไรเลย
 *    (คำเดียวกันสองนิยาม = Hard Rule 16)
 */
export const CHAT_RESPONSE_MIN_RATE_PERCENT = 80

/**
 * 🛑 แยกตาม scope ด้วย **ชนิด** ไม่ใช่ด้วยคอมเมนต์ — ข้อที่ผูกรายหลังต้องรับข้อเท็จจริงรายหลัง
 *    ถ้าปล่อยให้ทุกข้อรับ `AutoCheckFacts` เหมือนกัน ข้อรายหลังจะถูกตัดสินครั้งเดียวแล้ว
 *    fan-out ผลเดียวกันไปทุกหลัง = ออกคำรับรองให้หลังที่ไม่เคยถูกตรวจ (ผิด FR-INS-029)
 *    และเป็นความผิดที่ `tsc` มองไม่เห็นเลยถ้าพารามิเตอร์เป็นชนิดเดียวกัน
 */
export type AutoCheckDef =
  | { kind: 'SHOP'; evaluate: (facts: AutoCheckFacts) => AutoCheckVerdict }
  | { kind: 'ROOM'; evaluateRoom: (facts: RoomAutoCheckFacts) => AutoCheckVerdict }

/**
 * 🛑 ประกาศเป็น `Record<Step1AutoCheckKey, …>` เพื่อให้ `tsc` บังคับความครบ —
 *    grep จับ object key ไม่ได้ (docs/conventions/enum-value-removal.md)
 */
export const STEP1_AUTO_CHECKS: Record<Step1AutoCheckKey, AutoCheckDef> = {
  // ── ตัดสินได้แล้ว ─────────────────────────────────────────────────────────
  scam_db: {
    kind: 'SHOP',
    evaluate: (f) => {
      if (f.scamFound === null) return { kind: 'SKIP', reason: 'NO_SOURCE_DATA' }
      return { kind: 'RECORD', outcome: f.scamFound ? 'FAIL' : 'PASS' }
    },
  },
  phone_identity: {
    kind: 'SHOP',
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
    kind: 'SHOP',
    evaluate: (f) => {
      if (f.openComplaintCount === null) return { kind: 'SKIP', reason: 'NO_SOURCE_DATA' }
      // "ผ่าน" ของข้อนี้แปลว่า **ไม่มีข้อร้องเรียนที่ยังค้าง** ไม่ใช่ "ไม่เคยมีเรื่องร้องเรียนเลย"
      // (เรื่องที่ปิดแล้วไม่ถูกนับ — ร้านที่แก้ปัญหาให้ลูกค้าจบไม่ควรถูกลงโทษตลอดไป)
      return { kind: 'RECORD', outcome: f.openComplaintCount === 0 ? 'PASS' : 'FAIL' }
    },
  },

  // ── เกณฑ์ที่เพิ่งเคาะ 2026-09-06 (ปิด OQ-12/OQ-13) ────────────────────────
  account_age: {
    kind: 'SHOP',
    evaluate: (f) => {
      if (f.accountAgeDays === null) return { kind: 'SKIP', reason: 'NO_SOURCE_DATA' }
      // 🛑 ร้านที่ยังไม่ถึงเกณฑ์ได้ `FAIL` ซึ่งฝั่งผู้ซื้อยุบเป็น "ยังไม่มีข้อมูล" (ไม่มีคำว่า
      //    "ไม่ผ่าน" โผล่หน้าสาธารณะ) — ร้านใหม่ไม่ได้ทำอะไรผิด แค่ยังไม่มีอะไรให้รับรอง
      return { kind: 'RECORD', outcome: f.accountAgeDays >= ACCOUNT_AGE_MIN_DAYS ? 'PASS' : 'FAIL' }
    },
  },
  chat_response_speed: {
    kind: 'SHOP',
    evaluate: (f) => {
      // `null` ที่มาถึงตรงนี้แปลได้อย่างเดียวว่า "ตัวอย่างไม่พอจะพูด" — ผู้เก็บข้อเท็จจริง
      // บังคับ `resolveChatResponse()` มาแล้ว (ดูคอมเมนต์ที่ CHAT_RESPONSE_MIN_RATE_PERCENT)
      if (f.chatResponseRate === null) return { kind: 'SKIP', reason: 'NO_SOURCE_DATA' }
      return {
        kind: 'RECORD',
        outcome: f.chatResponseRate >= CHAT_RESPONSE_MIN_RATE_PERCENT ? 'PASS' : 'FAIL',
      }
    },
  },
  duplicate_listing: {
    kind: 'ROOM',
    evaluateRoom: (f) => decideDuplicateListing(f),
  },
}

/**
 * ตัดสิน "ที่พักหลังนี้เอารูปของร้านอื่นมาประกาศไหม" (OQ-13 · มติ user: เทียบรูปด้วย hash ข้ามร้าน)
 *
 * 🛑 **ลำดับของกฎคือตัวฟีเจอร์เอง** — หลักฐานฝั่งบวก (เจอรูปที่ก็อปมา) สรุปได้ทันทีแม้ข้อมูลไม่ครบ
 *    แต่คำกล่าวฝั่งลบ ("ไม่ได้ก็อปใคร") ต้องมีความครอบคลุมเต็มร้อยถึงจะพูดได้ — สลับสองข้อนี้
 *    แล้วจะได้ป้าย "ผ่าน" จากรูปที่แฮชสำเร็จ 2 ใน 10 ใบ ซึ่งคือคำรับรองที่อ้างจากข้อมูลที่ไม่มี
 *
 * 🛑 **นับเฉพาะร้านที่ประกาศ "ก่อน" เรา** — ถ้านับร้านอื่นทั้งหมด เหยื่อที่ถูกมิจฉาชีพก็อปรูปไป
 *    จะตกเป็น "ไม่ผ่าน" พร้อมกับคนก็อป ทั้งที่เป็นฝ่ายถูกกระทำ (ตัวตัดสินอยู่ที่ผู้เก็บข้อเท็จจริง)
 */
export function decideDuplicateListing(f: RoomAutoCheckFacts): AutoCheckVerdict {
  if (f.lookupFailed) return { kind: 'SKIP', reason: 'NO_SOURCE_DATA' }
  // ห้องที่ยังไม่มีรูปเลย = ไม่มีอะไรให้เทียบ ไม่ใช่ "สะอาด"
  if (f.totalImageCount === 0) return { kind: 'SKIP', reason: 'NO_SOURCE_DATA' }
  if (f.copiedFromOtherShopCount > 0) return { kind: 'RECORD', outcome: 'FAIL' }
  if (f.hashedImageCount < f.totalImageCount) return { kind: 'SKIP', reason: 'NO_SOURCE_DATA' }
  return { kind: 'RECORD', outcome: 'PASS' }
}

export const STEP1_AUTO_CHECK_KEYS = Object.keys(STEP1_AUTO_CHECKS) as Step1AutoCheckKey[]

/** ข้อของขั้น 1 ที่ผูกกับที่พักรายหลัง — cron ต้องวนต่อ Room ไม่ใช่ต่อร้าน */
export function isRoomScopedAutoCheck(key: Step1AutoCheckKey): boolean {
  return INSPECTION_CHECKS[key as InspectionCheckKey].scope === 'ROOM'
}
