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
