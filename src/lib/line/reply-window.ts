// (S-14b, feature 00025 TFR-LINE-05) — "หน้าต่างตอบฟรี" ของ LINE
//
// 🛑 LINE ไม่มีหน้าต่าง 24 ชั่วโมงแบบ Meta — สิ่งที่ทำให้ตอบฟรีได้คือ **reply token ที่มากับ event
// และมีอายุ 60 วินาที ใช้ได้ครั้งเดียว** พ้นจากนั้นต้องส่งด้วย push ซึ่งหักโควตา (= เงินของร้าน)
//
// ไฟล์นี้มีอยู่เพราะกติกาเดียวกันนี้ถูกใช้ **สองที่**: ฝั่ง server ตอนตัดสินว่าจะยิง reply หรือ push
// (channel-chat.service.ts) และฝั่งหน้าจอตอนบอกผู้ขายว่า "ข้อความนี้ส่งฟรีไหม" — ถ้าปล่อยให้แต่ละที่
// คำนวณเอง วันที่นิยามขยับ (เช่นเปลี่ยน safety margin) จะขยับแค่ที่เดียวแล้วหน้าจอจะโกหกทันที
// โดยไม่มี tsc/build/เทสตัวไหนฟ้อง เพราะทั้งสองสูตร "ถูก" ในตัวเอง (Hard Rule 16)

import { REPLY_SAFETY_MARGIN_MS } from './constants'

export interface LineReplyWindowInput {
  replyToken: string | null
  replyTokenExpiresAt: Date | null
  replyTokenUsedAt: Date | null
}

/** รูปร่างเดียวกับ subset ของ `getWindowState()` ฝั่ง Meta — ผู้เรียก (หน้าเธรด) จึงไม่ต้องรู้ว่า
 *  ค่ามาจากกติกาของ provider ไหน ส่งต่อลง prop เดิมได้เลย */
export interface LineReplyWindowState {
  open: boolean
  /** เวลาที่เหลือจนหมดสิทธิ์ตอบฟรี (ms) — ปิดแล้วเป็น 0 เสมอ
   *  🛑 ห้ามเอาไปแสดงเป็นตัวเลขนับถอยหลังบนจอ (BRD AC-005-05: เป็น "ข้อมูล ไม่ใช่การนับถอยหลัง")
   *  มีไว้ให้ตัวจับเวลาฝั่ง client พลิก boolean เงียบ ๆ เมื่อถึงเวลาเท่านั้น */
  msRemaining: number
}

/**
 * ตอบฟรีได้อยู่ไหม ณ เวลา `nowMs`
 *
 * เงื่อนไขทั้ง 3 ข้อต้องจริงพร้อมกัน (ตรงกับ `canTryReply` ที่ฝั่งส่งใช้ตัดสินจริง):
 *   1. มี token
 *   2. ยังไม่ถูกใช้ (`replyTokenUsedAt` ว่าง) — token ของ LINE ใช้ได้ครั้งเดียว
 *   3. ยังไม่หมดอายุ **โดยหักกันชน** `REPLY_SAFETY_MARGIN_MS` — กันเคสยิงไปถึง LINE ช้ากว่าที่คำนวณ
 *      แล้วโดนปฏิเสธเพราะ token หมดอายุพอดีระหว่างทาง
 */
export function getLineReplyWindowState(input: LineReplyWindowInput, nowMs: number): LineReplyWindowState {
  if (!input.replyToken || input.replyTokenUsedAt || !input.replyTokenExpiresAt) {
    return { open: false, msRemaining: 0 }
  }
  const msRemaining = input.replyTokenExpiresAt.getTime() - REPLY_SAFETY_MARGIN_MS - nowMs
  if (msRemaining <= 0) return { open: false, msRemaining: 0 }
  return { open: true, msRemaining }
}
