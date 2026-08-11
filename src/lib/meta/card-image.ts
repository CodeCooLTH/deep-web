/**
 * card-image — รูปสำหรับการ์ด Generic Template ของ Messenger/Instagram (2026-08-11)
 *
 * ทำไมต้องมีแยกจากฝั่ง LINE: เอกสาร Messenger ระบุว่า **"Messenger scales or crops photos in the
 * generic template that are not 1.91:1"** — รูปสินค้าในระบบเราเป็นจัตุรัสเป็นส่วนใหญ่ ส่งดิบ ๆ ไป
 * Messenger จะครอปกลางภาพเหลือแถบกว้าง = หัวกับท้ายของสินค้าหายไปเกือบครึ่ง (เสื้อโดนตัดคอกับชาย)
 *
 * จึงประกอบรูป 1.91:1 ให้เองด้วย `fit: 'contain'` บนพื้นขาว — ได้แถบขาวซ้าย/ขวาแทนการตัดเนื้อหาทิ้ง
 * ซึ่งสำหรับ "รูปสินค้าที่ลูกค้ากำลังตัดสินใจซื้อ" การเห็นของครบสำคัญกว่าการเต็มกรอบ
 * (บทเรียนเดียวกับ docs/conventions/user-supplied-image-assets.md — object-cover กินเนื้อหา)
 *
 * ข้อบังคับ: pure — รับ Buffer คืน Buffer ห้ามแตะ storage/prisma (ผู้เรียกคือ route ที่รู้จัก storage)
 */
import sharp from 'sharp'

/** 1.91:1 ตามที่เอกสาร Messenger ระบุ — 1200×628 เป็นขนาดมาตรฐานของอัตราส่วนนี้ */
export const META_CARD_WIDTH = 1200
export const META_CARD_HEIGHT = 628

/** เท่ากับเพดานที่ใช้กับ LINE — ไม่มีเลขทางการของ Meta แต่ไฟล์เล็กโหลดเร็วและปลอดภัยกับทุกฝั่ง */
export const META_CARD_MAX_BYTES = 1024 * 1024

const QUALITY = 80

/**
 * ประกอบรูปการ์ด 1.91:1 พื้นขาว
 *
 * คืน `null` เมื่อทำไม่สำเร็จ — 🛑 **ห้าม throw**: การ์ดที่ไม่มีรูปยังขายของได้ ส่วนข้อความที่ส่ง
 * ไม่ออกเลยคือความเสียหายจริง (หลักการเดียวกับ buildLinePreviewJpeg)
 */
export async function buildMetaCardJpeg(source: Buffer, maxBytes: number): Promise<Buffer | null> {
  try {
    const out = await sharp(source)
      .rotate() // เคารพ EXIF — ไม่งั้นรูปจากมือถือตะแคงบนการ์ด
      .resize({
        width: META_CARD_WIDTH,
        height: META_CARD_HEIGHT,
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } }) // PNG โปร่งใส → พื้นขาว ไม่ใช่ดำ
      .jpeg({ quality: QUALITY })
      .toBuffer()
    return out.byteLength <= maxBytes ? out : null
  } catch {
    return null
  }
}
