/**
 * card-image — รูปสำหรับการ์ด Generic Template ของ Messenger/Instagram (2026-08-11)
 *
 * 🔄 **แก้ 2026-08-11 (รอบสอง) — user สั่งเอง: "ผมชอบรูปเต็ม ๆ แบบนี้"**
 *
 * รอบแรกทำเป็น **1.91:1 + `contain`** เพราะเอกสาร Messenger เขียนว่า *"Messenger scales or crops
 * photos in the generic template that are not 1.91:1"* — อ่านแล้วตีความว่าอะไรที่ไม่ใช่ 1.91:1 จะถูก
 * ครอปเป็นแถบกว้าง จึงยอมได้แถบขาวซ้าย/ขวาแลกกับการเห็นสินค้าครบ
 *
 * 🛑 **หลักฐานจากของจริงบอกคนละอย่าง:** ภาพการ์ด Facebook ที่ user ส่งมาเป็นตัวอย่าง (ร้านอะไหล่
 * มอเตอร์ไซค์) แสดงรูปที่ **สูงกว่า 1.91:1 ชัดเจนและเห็นเต็มใบ** — Messenger ไม่ได้บังคับครอปเป็น
 * แถบกว้างอย่างที่ประโยคนั้นทำให้เข้าใจ. เมื่อไม่ถูกบังคับ การส่งกรอบ **จัตุรัส + `cover`** จึงได้
 * ทั้งรูปที่เต็มกรอบและเสียเนื้อรูปน้อยกว่าเดิมมาก (แนวตั้ง 3:4 เสียราว 25% แทนที่จะเป็น ~72%
 * ถ้าใช้ cover บนกรอบ 1.91:1)
 *
 * กรอบตรงกับการ์ดในแอปผู้ขาย (`ProductCardBubble` = aspect-square + object-cover) โดยตั้งใจ —
 * ผู้ขายกับลูกค้าจะได้เห็นรูปถูกครอปเหมือนกัน ไม่ใช่คนละอย่างกับข้อความใบเดียวกัน
 *
 * ข้อบังคับ: pure — รับ Buffer คืน Buffer ห้ามแตะ storage/prisma (ผู้เรียกคือ route ที่รู้จัก storage)
 */
import sharp from 'sharp'

/** จัตุรัส — ตรงกับกรอบการ์ดในแอปผู้ขาย 1080px เป็นขนาดมาตรฐานที่คมพอบนจอความละเอียดสูง */
export const META_CARD_WIDTH = 1080
export const META_CARD_HEIGHT = 1080

/** เท่ากับเพดานที่ใช้กับ LINE — ไม่มีเลขทางการของ Meta แต่ไฟล์เล็กโหลดเร็วและปลอดภัยกับทุกฝั่ง */
export const META_CARD_MAX_BYTES = 1024 * 1024

const QUALITY = 80

/**
 * ประกอบรูปการ์ดจัตุรัสแบบเต็มกรอบ
 *
 * คืน `null` เมื่อทำไม่สำเร็จ — 🛑 **ห้าม throw**: การ์ดที่ไม่มีรูปยังขายของได้ ส่วนข้อความที่ส่ง
 * ไม่ออกเลยคือความเสียหายจริง (หลักการเดียวกับ buildLinePreviewJpeg)
 */
export async function buildMetaCardJpeg(source: Buffer, maxBytes: number): Promise<Buffer | null> {
  try {
    const out = await sharp(source)
      .rotate() // เคารพ EXIF — ไม่งั้นรูปจากมือถือตะแคงบนการ์ด
      // `cover` = เต็มกรอบเสมอ ไม่มีแถบขาว — ยอมครอปได้เพราะกรอบเป็นจัตุรัส (รูปแนวตั้ง 3:4 เสีย
      // บน-ล่างราว 25%) 🛑 ถ้าวันไหนเปลี่ยนกรอบให้กว้างขึ้น ต้องกลับมาคิดใหม่ ยิ่งกว้าง cover ยิ่ง
      // กินเนื้อรูปแนวตั้งเร็วมาก
      .resize({ width: META_CARD_WIDTH, height: META_CARD_HEIGHT, fit: 'cover' })
      // ยังต้อง flatten: PNG โปร่งใสที่ถูก cover แล้วยังมี alpha อยู่ → JPEG จะได้พื้นดำ
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: QUALITY })
      .toBuffer()
    return out.byteLength <= maxBytes ? out : null
  } catch {
    return null
  }
}
