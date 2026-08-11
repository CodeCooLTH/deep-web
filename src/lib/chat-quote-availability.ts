/**
 * "ตอบกลับแบบอ้างข้อความ" (quote reply) บน LINE ต้องใช้ quoteToken ของข้อความที่ถูกอ้างถึง —
 * ข้อความที่เข้ามาก่อนระบบเริ่มเก็บ token (หรือสื่อบางชนิดที่ LINE ไม่คืน token ให้) จึงอ้างไม่ได้
 * ตลอดไป. ระบบยัง "ส่งได้ตามปกติ" (ถอยไปส่งแบบข้อความธรรมดา ไม่ผูก reply_to — ถูกแล้ว ห้ามทำให้
 * ส่งไม่ออก) แต่เดิมถอยเงียบสนิท: ผู้ขายเห็นบล็อกอ้างอิงครบเหมือนสำเร็จทุกประการทั้งฝั่งเรา ขณะที่
 * ในแอป LINE ของลูกค้ามาเป็นข้อความธรรมดา (bug report 2026-08-10)
 *
 * `shouldWarnQuoteUnavailable` = ฟังก์ชันบริสุทธิ์ตัวเดียวที่ตัดสินว่า "ควรเตือนผู้ขายไหม" — ยกออกมา
 * จาก JSX ตาม docs/conventions/ui-boolean-needs-a-testable-home.md (boolean ที่ตัดสิน UI ห้ามอยู่ใน
 * เทอร์นารีกลาง JSX เฉย ๆ ต้องมีที่ให้เทสจับ + พิสูจน์ด้วย mutation)
 */

/**
 * @param channel ช่องทางของเธรด ('DEEP' | 'MESSENGER' | 'INSTAGRAM' | 'LINE')
 * @param quotable ข้อความที่กำลังถูกอ้างถึง มี quoteToken จริงไหม (คำนวณที่ server จาก
 *   `rawMessage.payload.quoteToken`) — `undefined`/`null` = ยังไม่รู้/ช่องทางที่ยังไม่คำนวณให้
 * @param carrierIsShop **ตัวที่แบกกล่องอ้างอิง** เป็นของร้าน (SHOP) ไหม — ไม่ใช่ "ข้อความที่ถูกอ้างถึง
 *   เป็นของร้านไหม" (ตัวนั้นเกือบทุกครั้งเป็นของลูกค้า). สองจุดเรียกจึงหมายถึงสิ่งเดียวกัน: บับเบิลใน
 *   เธรด = `mine` ของบับเบิลนั้น · แถบ "กำลังตอบกลับ…" = `true` เสมอ เพราะฉบับที่กำลังจะส่งเป็นของร้าน
 *   แน่นอน. 🛑 เดิมชื่อ `mine` แล้วจุดเรียกที่สองเขียน `mine: true` ค้างไว้ ซึ่งอ่านผิดได้ทันทีว่า
 *   "ข้อความที่ถูกอ้างถึงเป็นของร้าน" — ตรรกะถูกแต่ชื่อหลอก จึงเปลี่ยนชื่อให้ตรงกับสิ่งที่มันตัดสินจริง
 *
 *   เหตุผลที่ต้องมีพารามิเตอร์นี้เลย: กล่องอ้างอิงบนบับเบิล **ของลูกค้า** ก็มีได้ (ลูกค้า quote มาจาก
 *   แอป LINE) แต่ร้านทำอะไรกับ quote ของลูกค้าไม่ได้ เตือนไปก็ไม่มีอะไรให้ทำ
 *
 * 🛑 gate เฉพาะ `channel === 'LINE'` ตอนนี้ — Messenger/IG มีช่องโหว่ชนิดเดียวกัน (Meta ปฏิเสธ
 * reply_to แล้ว retry แบบไม่ quote เงียบ ๆ เหมือนกัน — ดู channel-chat.service.ts ตรง catch ของ
 * sendOutboundMessage) แต่รอบนี้ยังไม่เปลี่ยนพฤติกรรมฝั่ง Meta — ตั้งชื่อพารามิเตอร์กลาง ๆ (quotable
 * ไม่ใช่ lineQuotable) ไว้เผื่อวันหน้าต่อยอดให้ Meta โดยไม่ต้องออกแบบสัญญาใหม่
 */
export function shouldWarnQuoteUnavailable(input: {
  channel: string
  quotable: boolean | null | undefined
  carrierIsShop: boolean
}): boolean {
  return input.channel === 'LINE' && input.carrierIsShop === true && input.quotable === false
}

/**
 * id ของข้อความที่กล่อง quote ควร "กระโดดไปหา" เมื่อผู้ขายแตะ — `null` = กล่องนี้กดไม่ได้
 * (user report 2026-08-11: กล่อง quote เป็น <div> เฉย ๆ กดไปหาข้อความต้นทางไม่ได้เลย)
 *
 * 🛑 อยู่ที่นี่ไม่ใช่ในเทอร์นารีกลาง JSX เพราะถ้าเขียนกลับด้าน ผลคือ **ปุ่มไม่ทำงานเลยทุกกรณี**
 * ซึ่งผ่าน tsc/build/detector/grep ครบทุกด่าน (ชนิดถูกทุกประการ ที่ผิดคือความหมาย) —
 * docs/conventions/ui-boolean-needs-a-testable-home.md
 *
 * `local-…` = บับเบิล optimistic ที่ client สร้างเองก่อน POST กลับมา ยังไม่มีแถวจริงใน DOM ให้
 * กระโดดไปหา — เงื่อนไขเดียวกับที่ฝั่งส่งใช้ตัดสินว่าจะแนบ `replyToMessageId` ไปกับ request ไหม
 */
export function quoteJumpTargetId(quoteId: string | null | undefined): string | null {
  if (!quoteId) return null
  return quoteId.startsWith('local-') ? null : quoteId
}
