/**
 * comment-reply-reason — คำอธิบายภาษาไทยของ "ทำไมการตอบกลับคอมเมนต์ถึงไม่เกิด/ไม่สำเร็จ"
 * (feature 00038) ใช้ในหน้าประวัติ `/settings/comment-reply`
 *
 * 🛑 นี่คือที่เดียวของ mapping ทั้งสองชุด — ห้ามพิมพ์คำพวกนี้ซ้ำที่อื่น (Hard Rule 16)
 *
 * ก่อนหน้านี้ `SKIP_REASON_TEXT` ถูกก็อปไว้ **2 ไฟล์** (`api/shops/comment-reply/logs/route.ts`
 * และ `settings/comment-reply/page.tsx`) พร้อมคอมเมนต์กำกับว่า "แก้ค่าใดค่าหนึ่งต้องแก้อีกไฟล์
 * ด้วยเสมอ" — ซึ่งเป็นคำเตือนที่กันอะไรไม่ได้เลย (หน้าแรกมาจาก page.tsx ส่วนหน้าถัดไปมาจาก route
 * ผู้ใช้เลื่อนหน้าเดียวก็เห็นคำคนละชุดได้ โดยไม่มี tsc/เทสตัวไหนฟ้อง) ตอนนี้ทั้งสองไฟล์ import
 * จากที่นี่
 *
 * pure module — ไม่ import prisma/next ใช้ได้ทั้ง server และ client
 */

import { describeSendFailure } from './chat-send-failure'

/**
 * เหตุผลที่ระบบ **ข้าม** ไม่ตอบ (`CommentReplyLog.skipReason`)
 * โค้ดต้นทาง = `COMMENT_SKIP_REASONS` ใน comment-auto-reply.service.ts
 */
export const SKIP_REASON_TEXT: Record<string, string> = {
  FROM_PAGE: 'คอมเมนต์ของเพจเอง',
  NOT_TOP_LEVEL: 'เป็นการตอบซ้อน ไม่ใช่คอมเมนต์หลัก',
  COMMENT_DELETED: 'คอมเมนต์ถูกลบไปแล้ว',
  NO_SENDER_ID: 'ไม่พบผู้คอมเมนต์',
  CHANNEL_INACTIVE: 'เพจยังไม่ได้เชื่อมต่อ',
  DISABLED: 'ปิดการตอบกลับอัตโนมัติไว้ หรือยังไม่ได้กรอกข้อความ',
  // 🛑 ไม่มี ALREADY_HANDLED แล้ว (2026-08-15) — ค่านั้นเขียนลงฐานไม่ได้เลยตั้งแต่วันแรกเพราะชน
  // partial unique index ตัวเดียวกับที่มันพยายามอธิบาย ตอนนี้ "เคยทักคนนี้บนโพสต์นี้แล้ว" ถูก
  // บันทึกเป็น privateReplyStatus='SKIPPED' + privateErrorMessage='ALREADY_SENT' รายคอมเมนต์แทน
  // (ดู FAIL_REASON_TEXT.ALREADY_SENT ด้านล่าง) ส่วนการตอบใต้คอมเมนต์ไม่มีเพดานนี้แล้ว
  HUMAN_ANSWERED: 'มีคนในทีมตอบคอมเมนต์นี้ไปแล้ว',
  WINDOW_EXPIRED: 'เกิน 7 วันนับจากเวลาคอมเมนต์',
}

/**
 * เหตุผลที่ระบบ **พยายามแล้วล้มเหลว** (`CommentReplyLog.errorMessage`)
 *
 * ค่าที่ลงคอลัมน์นี้มี 3 ชนิดปนกัน ตามที่ service เขียนจริง:
 *   1. โค้ดของเราเอง (`PrivateReplySkipReason` / error ที่ `replyToComment` โยน) — แปลด้วยตารางนี้
 *   2. ข้อความดิบของ Meta (อังกฤษ เช่น `(#551) This person isn't available right now.`)
 *      — ส่งต่อให้ `describeSendFailure()` ซึ่งเป็น SSOT ของการแปล error ฝั่ง Meta อยู่แล้ว
 *      **ห้ามสร้างตารางแปล Meta ชุดที่สองที่นี่**
 *   3. ข้อความไทยที่ service ประกอบเองแล้ว (`ส่งสำเร็จแต่บันทึกห้องแชทไม่สำเร็จ: …`) — ผ่านทั้งดุ้น
 */
export const FAIL_REASON_TEXT: Record<string, string> = {
  COMMENT_NOT_FOUND: 'ไม่พบคอมเมนต์นี้แล้ว (อาจถูกลบไปก่อนระบบจะตอบ)',
  COMMENT_DELETED: 'คอมเมนต์ถูกลบไปแล้ว',
  FORBIDDEN: 'ไม่มีสิทธิ์ในเพจนี้',
  CHANNEL_INACTIVE: 'เพจนี้เชื่อมต่อไม่อยู่แล้ว — เชื่อม Facebook Page ใหม่อีกครั้ง',
  CHANNEL_TOKEN_UNAVAILABLE: 'อ่านสิทธิ์ของเพจไม่ได้ — เชื่อม Facebook Page ใหม่อีกครั้ง',
  WINDOW_EXPIRED: 'เกิน 7 วันนับจากเวลาคอมเมนต์ — ทักแชทไม่ได้อีก',
  ALREADY_SENT: 'ทักคนนี้ไปแล้วก่อนหน้านี้',
  EMPTY_TEXT: 'ยังไม่ได้กรอกข้อความที่จะส่ง',
  SEND_FAILED: 'ส่งไม่สำเร็จ — ปลายทางปฏิเสธ',
}

/** คำอธิบายของ `skipReason` (null = ไม่มีเหตุผลเก็บไว้) */
export function describeSkipReason(skipReason: string | null | undefined): string | null {
  const raw = (skipReason ?? '').trim()
  if (!raw) return null
  // ไม่รู้จัก → คืนโค้ดดิบ ดีกว่ากลืนหายจนซัพพอร์ตสืบอะไรไม่ได้
  return SKIP_REASON_TEXT[raw] ?? raw
}

/**
 * คำอธิบายของ `errorMessage` (null = ไม่มีอะไรเก็บไว้)
 *
 * user สั่ง 2026-08-09: *"ตรงไม่สำเร็จ … อยากให้แสดงรายละเอียดเลย ว่าไม่สำเร็จเพราะอะไร"*
 * — ก่อนหน้านี้คอลัมน์นี้ถูกเก็บมาตลอดแต่ไม่เคยถูกส่งออกไปหน้าจอเลยสักครั้ง ป้าย "ไม่สำเร็จ"
 * จึงเป็นทางตัน: ร้านรู้ว่าพลาดแต่ไม่รู้ว่าต้องทำอะไรต่อ และไม่รู้ด้วยซ้ำว่าแก้ได้เองไหม
 */
export function describeCommentReplyFailure(errorMessage: string | null | undefined): string | null {
  const raw = (errorMessage ?? '').trim()
  if (!raw) return null
  const known = FAIL_REASON_TEXT[raw]
  if (known) return known
  // ที่เหลือคือข้อความจากฝั่ง Meta (หรือไทยที่ประกอบมาแล้ว) — ใช้ตัวแปลกลางของโปรเจกต์
  // `.text` = เหตุผลล้วนไม่มีคำนำหน้า "ส่งไม่สำเร็จ — " เพราะ UI มีป้าย "ไม่สำเร็จ" ของตัวเองอยู่แล้ว
  // (ถ้าใช้ `.message` จะอ่านได้ว่า "ไม่สำเร็จ ส่งไม่สำเร็จ — …")
  //
  // 🛑 **fall-through บรรทัดนี้ไปเจอ "ตาข่าย" ที่มีปรัชญาตรงข้ามกับ `describeSkipReason` ข้างบน**
  // (บันทึกไว้ 2026-08-23 รอบแก้ 2 ของ CR คิวส่งข้อความ — F-2 · **จงใจไม่แก้พฤติกรรม**)
  //
  //   • `describeSkipReason` (ห่างจากบรรทัดนี้ ~15 บรรทัด) ประกาศไว้ตรงตัวว่า *"ไม่รู้จัก → คืนโค้ดดิบ
  //     ดีกว่ากลืนหายจนซัพพอร์ตสืบอะไรไม่ได้"* ซึ่งตรงกับที่ user สั่งเมื่อ 2026-08-09 ว่าอยากเห็น
  //     "รายละเอียดเลย ว่าไม่สำเร็จเพราะอะไร"
  //   • แต่ `describeSendFailure` เพิ่ง (2026-08-23) มีตาข่าย `INTERNAL_CODE_SHAPE` ที่กลืนสตริงรูป
  //     รหัสภายใน (`^[A-Z][A-Z0-9_]{2,}$`) ให้กลายเป็น **"ไม่ทราบสาเหตุ"** — ตรงข้ามกันพอดี
  //     ตาข่ายนั้นถูกสร้างเพื่อบับเบิลแชท (ที่ผู้ขายทั่วไปอ่าน) ไม่ได้ออกแบบมาเพื่อหน้าประวัตินี้
  //     (ที่คนดูคือคนกำลังสืบว่าทำไมบอทไม่ตอบ)
  //
  // **วันนี้ยังไม่มีรหัสไหนไหลมาถึงตรงนี้แล้วโดนกลืน** (ยืนยัน 2026-08-23): ผู้เขียนคอลัมน์คือ
  // `comment-auto-reply.service.ts:296` ซึ่งเขียน `err.message` ของ `replyToComment()` ดิบ ๆ และ
  // `replyToComment` โยนแค่ 4 รหัส — `COMMENT_NOT_FOUND` · `FORBIDDEN` · `COMMENT_DELETED` ·
  // `CHANNEL_INACTIVE` — ซึ่งอยู่ใน `FAIL_REASON_TEXT` ครบทุกตัว จึงถูกดักด้วย `known` ข้างบนก่อนเสมอ
  //
  // 🛑 **จะรู้ได้อย่างไรว่าวันหนึ่งมันเริ่มไหล:** เมื่อมีคนเพิ่ม `throw new Error('<รหัสใหม่>')`
  // **ในตัว `replyToComment` เอง** แล้วไม่ได้เติมคีย์นั้นใน `FAIL_REASON_TEXT` — อาการที่เห็นคือ
  // หน้าประวัติขึ้น "ไม่ทราบสาเหตุ" แทนรหัสจริง (ไม่ใช่ error ไม่ใช่จอเปล่า จึงไม่มีอะไรฟ้อง
  // นอกจากคนที่กำลังนั่งอ่านหน้านั้นอยู่) ตรวจด้วยการ **ไล่ในตัวฟังก์ชัน ไม่ใช่ทั้งไฟล์**:
  //   S=$(rg -n 'export async function replyToComment' src/services/page-comment.service.ts | cut -d: -f1)
  //   sed -n "$S,+80p" src/services/page-comment.service.ts | rg -o "throw new Error\('[A-Z_]+'"
  // แล้วเทียบรายชื่อที่ได้กับคีย์ของ `FAIL_REASON_TEXT`
  // (สแกนทั้งไฟล์จะได้ `POST_NOT_FOUND` ติดมาด้วย ซึ่งเป็นของฟังก์ชันระดับโพสต์คนละเส้นทาง
  // ไม่เคยลงคอลัมน์นี้ — false positive ที่เสียเวลาไล่)
  return describeSendFailure(raw).text
}
