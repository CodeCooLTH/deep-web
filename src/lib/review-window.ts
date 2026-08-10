/**
 * review-window — หน้าต่างเวลาที่ผู้ซื้อแก้ไข/ลบรีวิวของตัวเองได้ (feature 00041, BR-BOE-17)
 *
 * 🛑 ทำไมอยู่ที่ `lib/` ไม่ใช่ใน `review.service.ts`:
 * ตรรกะนี้ต้องถูกเรียกจาก **สองฝั่ง** — server (ด่านจริงที่ปฏิเสธคำขอ) และ client (ตัดสินว่า
 * จะโชว์ปุ่มแก้ไข/ลบไหม + นับถอยหลัง). แต่ `review.service.ts` import prisma และ badge.service
 * ⇒ ดึงเข้า client component ไม่ได้เลย ถ้าปล่อยไว้ที่นั่น ฝั่ง UI จะต้องเขียนเงื่อนไข 24 ชม.
 * ขึ้นมาเองเป็นชุดที่สอง แล้ววันหนึ่งสองชุดจะไม่ตรงกัน (ปุ่มโชว์อยู่แต่กดแล้วโดนปฏิเสธ)
 * — คลาสเดียวกับที่ `chat-channel.ts` ต้องถูกแยกออกมาด้วยเหตุผลเดียวกัน
 */

/** 24 ชั่วโมง — SSOT ห้าม hardcode เลขนี้ที่อื่น */
export const REVIEW_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * ยังอยู่ในหน้าต่างแก้ไขไหม
 *
 * 🛑 นับจาก `createdAt` ของใบแรกเสมอ **ไม่ใช่ `updatedAt`** — ถ้านับจากเวลาที่แก้ล่าสุด
 * การแก้ทีละนิดจะยืดหน้าต่างไปได้เรื่อย ๆ ไม่รู้จบ ซึ่งเท่ากับไม่มีหน้าต่างเลย
 *
 * รับ `now` เป็นพารามิเตอร์เพื่อให้เทสฉีดเวลาได้โดยไม่ต้องรอ 24 ชม.จริง
 */
export function canEditReview(createdAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - createdAt.getTime() <= REVIEW_EDIT_WINDOW_MS
}

/**
 * ข้อความบอกเวลาที่เหลือ เช่น "แก้ไขได้อีก 6 ชม. 12 นาที"
 *
 * หมดเวลาแล้วคืนค่าว่าง — ผู้เรียกต้องไม่ render อะไรเลย **ไม่ใช่แสดงว่า "หมดเวลาแล้ว"**
 * เพราะรีวิวยังแสดงอยู่ปกติ ไม่มีอะไรผิดพลาดที่ต้องแจ้งผู้ใช้
 */
export function formatEditWindowLeft(createdAtIso: string, now: Date = new Date()): string {
  const left = new Date(createdAtIso).getTime() + REVIEW_EDIT_WINDOW_MS - now.getTime()

  // 🛑 `< 0` ไม่ใช่ `<= 0` — ต้องตรงกับ `canEditReview` ที่ใช้ `<=` เป๊ะ ๆ
  // เดิมเขียน `<= 0` แล้วเทสจับได้ว่าตรงเส้น 24 ชม.พอดี ปุ่มยังโชว์ (เพราะ canEditReview ผ่าน)
  // แต่บรรทัดนับถอยหลังหายไปเฉย ๆ — สองฟังก์ชันที่ตอบคำถามเดียวกันห้ามมีขอบคนละที่
  if (left < 0) return ''

  const totalMinutes = Math.floor(left / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  // เหลือไม่ถึง 1 นาที — "อีก 0 นาที" อ่านแล้วเหมือนหมดเวลาไปแล้ว ทั้งที่ยังกดได้อยู่
  if (totalMinutes === 0) return 'แก้ไขได้อีกไม่ถึง 1 นาที'

  // เหลือไม่ถึงชั่วโมง → บอกเป็นนาทีอย่างเดียว ("อีก 0 ชม. 12 นาที" อ่านแล้วสะดุด)
  if (hours === 0) return `แก้ไขได้อีก ${minutes} นาที`
  return `แก้ไขได้อีก ${hours} ชม. ${minutes} นาที`
}
