/**
 * chat-sticker — ตัวตัดสินเดียวว่า "ข้อความนี้เป็นสติกเกอร์ไหม" (2026-08-10)
 *
 * สติกเกอร์ทุกช่องทางถูกเก็บเป็น `ChatMessage.type = 'IMAGE'` เหมือนรูปที่ลูกค้าส่ง (mirror รูป
 * มาไว้ที่ storage ของเราแล้วอ้างด้วย `imageUrl`) จึงไม่มีคอลัมน์ไหนบอกได้ตรง ๆ — ร่องรอยอยู่ใน
 * `rawMessage.payload.kind === 'sticker'` ซึ่ง **ทั้งขาเข้าและขาออกติด marker เดียวกัน**:
 *   - ขาเข้า LINE: `rawExtra.kind` ของ `writeLineInboundMessage` (S-7b)
 *   - ขาออก LINE/Meta: `outboundResponse.kind` ตอน `params.sticker` (S-18a + รอบนี้)
 *
 * ทำไมต้องเป็นฟังก์ชันในไฟล์นี้ ไม่ใช่เงื่อนไขในบรรทัดของ route: กฎนี้ถูกใช้ตัดสิน **การแสดงผล**
 * (ขนาดสติกเกอร์ + ต้องมีปุ่ม "บันทึกรูป" ไหม) และเคยพลาดมาแล้วด้วยการเดาจากขนาดรูปจริง
 * (สติกเกอร์ Meta 100px ผ่าน แต่ LINE 320–370px ไม่ผ่าน) — boolean ที่ตัดสิน UI ต้องมีที่ให้เทสจับ
 * (`docs/conventions/ui-boolean-needs-a-testable-home.md`)
 *
 * ต้องทนกับ payload ที่ไม่รู้จักได้เสมอ: `rawMessage` เป็น JSON เสรีจากภายนอก/ของเราเอง
 * ค่าที่ไม่มี/ผิดรูป = ไม่ใช่สติกเกอร์ (fail-safe ไปทางเดิม: แสดงเป็นรูปปกติ)
 */

export function isStickerRawMessage(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const payload = (raw as { payload?: unknown }).payload
  if (!payload || typeof payload !== 'object') return false
  return (payload as { kind?: unknown }).kind === 'sticker'
}
