/**
 * buyer-trust — ผลกระทบของพฤติกรรมการรับของ ต่อคะแนนความน่าเชื่อถือ (feature 00055 · D-4)
 *
 * pure module — ห้าม import prisma/server-only
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🛑 ข้อเท็จจริงที่ต้องอ่านก่อนแก้ไฟล์นี้ (สำรวจ prod 2026-08-24)
 *
 *   `Customer` ทั้งหมด 477 · ที่ผูกกับ `User` (มีบัญชีจริง) **36 (7.5%)**
 *   ลูกค้าที่มีพัสดุตีกลับ 12 คน · **มีบัญชี 0 คน**
 *
 * `User.trustScore` จึงเป็นปลายทางที่ **เข้าไม่ถึงผู้ซื้อ 92.5%** — ถ้าทำ D-4 เป็น "หักคะแนน
 * User" อย่างเดียว มันจะไม่กระทบใครเลยแม้แต่คนเดียวในวันที่ ship แล้วเราจะบันทึกว่า "ทำ D-4
 * แล้ว" ซึ่งเป็นคลาสเดียวกับ `docs/conventions/known-limitation-vs-unfinished.md` เป๊ะ ๆ
 *
 * ตัวเลขในไฟล์นี้จึงคำนวณจาก **`BuyerReputation` ของ `Customer`** (ครบ 477 คน) แล้วค่อยไหลไป
 * `User.trustScore` เฉพาะคนที่ผูกบัญชีไว้ — ไม่ใช่กลับกัน
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🛑 สวิตช์ยังปิดอยู่ (`BUYER_CONDUCT_PENALTY_ENABLED = false`) ตาม BR-BR-11
 *
 * D-4 คือการ **กลับหลักการเดิมของ MVP** ที่ประกาศไว้ว่า trust score "มีแต่ขึ้น ไม่มีหัก"
 * (PRD FR-3.5 · `recalculateTrustScore` ใช้ `Math.max(user.trustScore, computed)` บังคับอยู่)
 * รอบนี้จึง **คำนวณและบันทึกลงประวัติ แต่ยังไม่เอาไปหักจริง** เพื่อให้เห็นตัวเลขจากข้อมูลจริง
 * ก่อนตัดสินใจเปิด — เปิดได้ด้วยการแก้ค่าคงที่ตัวเดียวบรรทัดเดียว และมีเทสพิสูจน์ว่าตอนปิด
 * คะแนนเท่าเดิมทุกกรณี
 */

import type { BuyerReputation } from './buyer-reputation'

/**
 * เพดานการหัก — 15 คะแนนจาก 100
 *
 * ทำไม 15: เท่ากับ "อายุบัญชี (10) + เหรียญตรา (10)" รวมกันแทบพอดี = หนักพอให้เห็นผลจริง
 * แต่ไม่ล้มคนที่ยืนยันตัวตนระดับสูงแล้ว (verification อย่างเดียว 35) — คนที่พิสูจน์ตัวตนแล้ว
 * ยังต้องอยู่เหนือคนที่ไม่เคยพิสูจน์อะไรเลย ไม่ว่าพัสดุจะตีกลับกี่ใบ
 */
export const BUYER_CONDUCT_PENALTY_MAX = 15

/** หักต่อ "ใบที่พัสดุตีกลับ" 1 ใบ — โตแบบเชิงเส้นจนชนเพดาน อ่านง่ายและอธิบายให้ผู้ใช้ฟังได้ */
export const PENALTY_PER_RETURNED = 3
/** ยกเลิกโดยฝั่งลูกค้าเบากว่าตีกลับครึ่งหนึ่ง — ไม่มีของเดินทาง ร้านยังไม่เสียค่าส่งไป-กลับ */
export const PENALTY_PER_BUYER_CANCEL = 1.5

/**
 * 🛑 สวิตช์เปิดใช้จริง — `false` = คำนวณและบันทึกประวัติ แต่ไม่แตะคะแนนที่แสดง (BR-BR-11 · R-3)
 *
 * เปิดเมื่อไร ให้ตามไปอัปเดต BRD ด้วย ไม่งั้นเอกสารจะบอกว่ายังปิดอยู่ตลอดกาล
 */
export const BUYER_CONDUCT_PENALTY_ENABLED = false

/**
 * calcBuyerConductPenalty — คะแนนที่ควรถูกหัก (จำนวนบวก 0..BUYER_CONDUCT_PENALTY_MAX)
 *
 * คืน **จำนวนบวก** ไม่ใช่ค่าติดลบ เพื่อให้ผู้เรียกเขียน `computed - penalty` ได้ตรงไปตรงมา —
 * ค่าติดลบที่ถูกบวกเข้าไปเป็นรูปแบบที่อ่านผิดง่ายที่สุดเวลาไล่โค้ด
 *
 * 🛑 ไม่มีข้อมูล (`null`) = **หัก 0** ห้ามเดา — ผู้ซื้อที่ยังไม่เคยสั่งอะไรเลยไม่ใช่ผู้ซื้อที่แย่
 */
export function calcBuyerConductPenalty(reputation: BuyerReputation | null | undefined): number {
  if (!reputation) return 0
  const raw =
    reputation.returned * PENALTY_PER_RETURNED +
    reputation.cancelledByBuyer * PENALTY_PER_BUYER_CANCEL
  return Math.min(BUYER_CONDUCT_PENALTY_MAX, Math.round(raw))
}

/**
 * applyBuyerConductPenalty — คะแนนหลังหัก (ไม่ต่ำกว่า 0)
 *
 * เคารพสวิตช์: ปิดอยู่ = คืนค่าเดิมเป๊ะ ๆ ไม่ใช่คืนค่าที่ "หักแล้วแต่ยังไม่บันทึก"
 * (ถ้าคืนค่าที่หักแล้ว ผู้เรียกที่ลืมเช็คสวิตช์จะเอาไปแสดงบนจอทันทีโดยไม่มีอะไรฟ้อง)
 */
export function applyBuyerConductPenalty(
  score: number,
  reputation: BuyerReputation | null | undefined,
): number {
  if (!BUYER_CONDUCT_PENALTY_ENABLED) return score
  return Math.max(0, score - calcBuyerConductPenalty(reputation))
}
