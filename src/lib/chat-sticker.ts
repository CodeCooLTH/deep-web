import { giphyMessageKind } from '@/lib/giphy-message-kind'

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
  if ((payload as { kind?: unknown }).kind === 'sticker') return true

  /**
   * ขาเข้า Instagram (2026-08-27) — marker `payload.kind` ใช้ไม่ได้เพราะนี่คือ **payload ของ Meta**
   * ไม่ใช่ของเรา (`{sender, message, recipient}`) และ Meta ส่งสติกเกอร์มาเป็น
   * `attachments[0].type = "image"` เหมือนรูปถ่ายจริงทุกประการ
   *
   * ผลที่ผู้ใช้เห็นตอนยังไม่มีสาขานี้: สติกเกอร์แมวขึ้นเต็มความกว้างรูปปกติ **พร้อมปุ่ม "บันทึกรูป"**
   * ขณะที่สติกเกอร์ที่ส่งจาก Deep เอง (ติด `kind:'sticker'`) แสดงถูก — สองใบติดกันในเธรดเดียว
   * หน้าตาไม่เหมือนกัน (user แจ้ง 2026-08-27)
   *
   * 🛑 เฉพาะ `ct=s` (สติกเกอร์) — **GIF (`ct=g`) ไม่ใช่สติกเกอร์**: มันมีพื้นหลัง ควรกว้างเท่ารูปปกติ
   * และควรบันทึกได้ การเหมารวมว่า "มาจาก GIPHY = สติกเกอร์" จะย่อ GIF จนดูไม่ออกว่าเป็นอะไร
   */
  const url = (payload as { message?: { attachments?: Array<{ payload?: { url?: unknown } }> } })
    .message?.attachments?.[0]?.payload?.url
  return typeof url === 'string' && giphyMessageKind(url) === 'sticker'
}

/**
 * ซ่อนปุ่ม "บันทึกรูป" ใต้สื่อไหม (user สั่ง 2026-08-27: *"พวก sticker + gif หรือ thumbup
 * ต้องไม่มีบันทึกรูป + save image"*)
 *
 * แยกออกจาก `isSticker` โดยตั้งใจ เพราะสองอย่างนี้ตอบคนละคำถาม:
 *   `isSticker`  → **ความกว้าง** ของรูป (สติกเกอร์แคบกว่ารูปจริง `max-w-36`)
 *   ตัวนี้        → **มีปุ่มบันทึกไหม**
 * GIF ต้องกว้างเท่ารูปปกติ (มีพื้นหลัง ย่อแล้วดูไม่ออกว่าเป็นอะไร) แต่**ไม่ควรมีปุ่มบันทึก**
 * เหมือนกับสติกเกอร์ — รวมสองเรื่องนี้เป็นธงเดียวเมื่อไหร่ ต้องยอมเสียอย่างหนึ่งเสมอ
 *
 * `.gif` = ภาพเคลื่อนไหว ไม่ใช่รูปถ่ายที่ผู้ขายจะเก็บไว้ใช้งาน (สลิป/รูปสินค้าเป็น jpg/png)
 * ⇒ ใช้นามสกุลของไฟล์ที่ mirror ไว้เป็นเกณฑ์ ซึ่งครอบทุกที่มา: สติกเกอร์ที่เราส่งเอง ·
 * สติกเกอร์/GIF ที่ลูกค้าส่งจากแอป · โดยไม่ต้องรู้ว่ามาจากคลังไหน
 *
 * 🛑 ที่ยัง**ครอบไม่ถึง**: echo ของสติกเกอร์ที่เราส่งออกไป — Meta โฮสต์ใหม่บน `lookaside.fbsbx.com`
 * แล้ว **แปลงเป็น `.jpg`** (ภาพนิ่ง) ⇒ แยกจากรูปถ่ายจริงไม่ได้เลยจากฝั่งเรา ตกไปพึ่งเกณฑ์ขนาดรูป
 * (`STICKER_MAX_PX`) อย่างเดียว
 */
export function hidesDownloadAffordance(storageKey: string, isSticker: boolean): boolean {
  if (isSticker) return true
  // ตัด query string ก่อน (fileId บางเส้นทางมี `?` ต่อท้าย) แล้วเทียบนามสกุลแบบ case-insensitive
  return /\.gif$/i.test(storageKey.split('?')[0])
}
