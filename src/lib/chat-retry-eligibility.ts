import { UNCERTAIN_SEND_REASON } from './chat-send-queue'

/**
 * "กดลองใหม่มีผลจริงไหม" ของบับเบิลที่ส่งไม่สำเร็จ — ยกออกมาจาก JSX ตาม
 * docs/conventions/ui-boolean-needs-a-testable-home.md (boolean ที่ตัดสิน UI ห้ามอยู่ในเทอร์นารีกลาง
 * JSX เฉย ๆ ต้องมีที่ให้เทสจับ + พิสูจน์ด้วย mutation)
 *
 * เดิม (ก่อน 2026-08-10) ChatThread.tsx ตัดสิน "แสดงปุ่มลองใหม่ไหม" จาก "ประกอบ payload กลับได้
 * ไหม" อย่างเดียว (ชนิดข้อความ/มี body หรือไฟล์แนบ) — ไม่เคยดู *เหตุผล* ที่ทำให้ส่งไม่ออกเลย ผล
 * คือ TOKEN_INVALID/QUOTA_EXCEEDED/CONTACT_BLOCKED ของ LINE (ที่กดซ้ำด้วยเงื่อนไขเดิมไม่มีทางผ่าน)
 * ก็ยังโชว์ปุ่ม "↻ ลองใหม่" เหมือนกับ error ที่ retry ได้จริง (เช่น LINE_UNAVAILABLE/เน็ตหลุด) —
 * คอมเมนต์เดิมในไฟล์นี้เขียนไว้เองแล้วว่า "เขียน 'ลองใหม่' ทั้งที่กดไม่ได้ คือ UI โกหก"
 *
 * `retryable` เป็นสิ่งที่ผู้เรียกต้อง *resolve มาก่อนแล้ว* จากแหล่งที่ถูกต้องตามเส้นทาง (ดู
 * chat-send-failure.ts::SendFailureDescription.retryable) — ฟังก์ชันนี้ไม่รู้และไม่ควรรู้ว่าค่านั้น
 * มาจากไหน แค่รวมกับเงื่อนไข "ประกอบ payload กลับได้ไหม" เดิมเป็นคำตอบเดียว
 */
export function canRetryFailedMessage(input: {
  /** true = แถวนี้บันทึกลง DB แล้ว (deliveryStatus='FAILED') · false = บับเบิล optimistic ที่ยังไม่ถึง server */
  failedPersisted: boolean
  /** ChatMessageView.type ('TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | ...) */
  messageType: string
  /** มีตัวอักษรให้ประกอบข้อความ TEXT กลับไปส่งซ้ำไหม (m.body?.trim()) — เฉพาะเส้นทาง persisted */
  hasTextBody: boolean
  /** มีไฟล์แนบ (imageUrl=fileId) ให้ประกอบกลับไปส่งซ้ำไหม — เฉพาะเส้นทาง persisted */
  hasRetryableAttachment: boolean
  /** มี payload เดิม (hook เก็บไว้ที่ `_retry`) ให้ยิงซ้ำไหม — เฉพาะเส้นทาง optimistic */
  hasOptimisticRetryPayload: boolean
  /** "ลองใหม่มีผลจริงไหม" ตามธรรมชาติของเหตุผล — resolve มาจาก describeSendFailure().retryable
   *  (persisted) หรือ ChatMessageView._retryable (optimistic) มาก่อนแล้ว */
  retryable: boolean
}): boolean {
  // เหตุผลบอกว่ากดซ้ำไม่มีทางผ่าน = ไม่ต้องเช็คอย่างอื่นต่อ ปิดปุ่มเสมอ
  if (!input.retryable) return false
  if (input.failedPersisted) {
    return (input.messageType === 'TEXT' && input.hasTextBody) || input.hasRetryableAttachment
  }
  return input.hasOptimisticRetryPayload
}

/**
 * แถวนี้ต้อง "ถามยืนยันก่อน" ก่อนจะส่งซ้ำไหม (fix round 2 ของ `/impeccable clarify`)
 *
 * 🛑 ทำไมถึงต้องมีด่านนี้ ทั้งที่ `retryable` เป็น `true` อย่างถูกต้องแล้ว: แถวที่ปิดเพราะ claim ค้าง
 * แปลว่า **เรายิงออกไปแล้วแต่ไม่รู้ผล** — ลำดับงานที่ถูกของผู้ขายคือ
 *   1. ไปเปิดดูในแอปของช่องทางนั้น
 *   2a. ถ้าข้อความอยู่แล้ว → ห้ามส่งซ้ำ
 *   2b. ถ้าไม่อยู่ → ต้องส่งซ้ำได้
 * ⇒ ปิดปุ่ม (`retryable: false`) จะตัดขั้น 2b ทิ้ง = ลงโทษคนที่ทำถูกตามคำสั่งของเราเอง
 * ⇒ สิ่งที่ต้องเพิ่มคือ **ด่านความตั้งใจ ไม่ใช่การปิดทาง**
 *
 * แกนของปัญหาคือ **คำเตือนไม่ได้อยู่ในเส้นทางของการกระทำ** — บนบับเบิลมีปุ่ม "↻ ลองใหม่" กดได้ทันที
 * ส่วนถ้อยคำ "ไม่แน่ใจ… เปิดดูก่อน" ซ่อนอยู่หลังปุ่ม `(i)` ที่ต้องกดอีกทีถึงจะเห็น ⇒ เป็นคำเชิญให้ทำ
 * สิ่งที่ถ้อยคำห้าม โดยที่ถ้อยคำนั้นมองไม่เห็น. confirm เอาคำเตือนมาวางขวางเส้นทางนั้นพอดี
 *
 * 🛑 **เฉพาะเหตุผลนี้เหตุผลเดียว** — แถว FAILED อื่น ๆ คือเคสที่ *ปลายทางปฏิเสธ* (เรารู้แน่ว่าไม่ถึง)
 * การเพิ่มขั้นตอนให้เคสพวกนั้นคือแรงเสียดทานเปล่า ๆ กับงานที่ผู้ขายตั้งใจกดมาแล้ว
 */
export function needsUncertainSendConfirm(failureReason: string | null | undefined): boolean {
  return failureReason === UNCERTAIN_SEND_REASON
}

/**
 * ถ้อยคำของ confirm ข้างต้น — **`text` ยกมาจาก `UNCERTAIN_SEND_REASON` ตัวเดียวกันเป๊ะ**
 * ไม่มีสำนวนที่สอง (HR16): ผู้ขายต้องอ่านประโยคเดียวกับที่เห็นบนบับเบิลและใน noti
 *
 * `title` เป็น *คำถามถึงการกระทำ* ไม่ใช่การอธิบายสถานการณ์ซ้ำ — ตัวอธิบายมีตัวเดียวคือ `text`
 *
 * 🛑 ปุ่มยืนยัน **บอกสิ่งที่จะเกิด ไม่ใช่ "ตกลง"** — ผลที่ผู้ขายต้องรับรู้ก่อนกดคือ *ลูกค้าอาจได้
 * 2 ข้อความ* ซึ่งเป็นความเสียหายจริงเพียงอย่างเดียวของการกดผิดในเคสนี้
 * 🛑 ปุ่มยกเลิกคือทางที่ปลอดภัย ⇒ `focusCancel` เพื่อให้ Enter ที่ค้างมาจากช่องพิมพ์ไม่ยืนยันให้เอง
 */
export const UNCERTAIN_RESEND_CONFIRM = {
  title: 'ส่งข้อความนี้ซ้ำ?',
  text: UNCERTAIN_SEND_REASON,
  confirmButtonText: 'ส่งซ้ำ ลูกค้าอาจได้ 2 ข้อความ',
  cancelButtonText: 'ยังไม่ส่ง',
} as const
