/**
 * preview-image — สร้าง "รูปตัวอย่าง" ให้ `previewImageUrl` ของ LINE (S-8 ส่วนขยาย 2026-08-10)
 *
 * ทำไมต้องมี: LINE image/video message บังคับ **2 URL** คือ `originalContentUrl` (รูปเต็ม ≤10MB)
 * กับ `previewImageUrl` (≤1MB, JPEG/PNG เท่านั้น) — เดิม `line-adapter.ts` ใส่ URL เดียวกันทั้งคู่
 * เพราะ "ไฟล์ตัวเต็มก็เป็นรูปอยู่แล้ว" ซึ่งจริงเรื่องชนิดไฟล์ แต่ผิดเรื่องขนาด: รูปจากมือถือปกติ
 * 2–5MB เกินเพดาน preview ทุกใบ. นี่คือไฟล์ที่ปิดช่องว่างนั้น
 *
 * ข้อบังคับ: โมดูลนี้ห้าม import storage/prisma — รับ Buffer คืน Buffer เท่านั้น เพื่อให้เทสได้
 * โดยไม่ต้องมี bucket จริง (ผู้ที่รู้จัก storage คือ channel-chat.service.ts ซึ่งเป็นคนเรียก)
 */
import sharp from 'sharp'

/**
 * ด้านยาวสุดของรูปตัวอย่าง — LINE แสดง preview เป็นบับเบิลเล็กในห้องแชท ไม่ใช่รูปเต็มจอ
 * (แตะแล้วถึงโหลด `originalContentUrl` ตัวจริง) 1024px จึงเกินพอและทำให้ไฟล์เล็กลงมากในขั้นเดียว
 */
export const PREVIEW_MAX_EDGE = 1024

/**
 * คุณภาพ JPEG — ขั้นเดียวพอ ไม่ต้องมี "บันไดไล่ลด"
 *
 * วัดจริงก่อนตัดสิน (2026-08-10): รูป noise 4000×3000 ที่บีบยากที่สุดเท่าที่ประกอบได้ ต้นทาง 14.3MB
 * ย่อลง 1024px/q80 แล้วได้ **124 KB** = ต่ำกว่าเพดาน 1MB ราว 8 เท่า. เวอร์ชันแรกของไฟล์นี้เขียนบันได
 * 4 ขั้นไว้ "เผื่อ" แล้วพบตอนทดสอบด้วย mutation ว่าขั้นที่ 2–4 ไม่มีทางถูกเรียกเลย — โค้ดที่พิสูจน์
 * ไม่ได้ว่าทำงานคือโค้ดที่ไม่รู้ว่าถูกหรือผิด ตัดทิ้งดีกว่าเก็บไว้ให้ดูปลอดภัย
 */
const PREVIEW_QUALITY = 80

/**
 * ย่อรูปให้เป็น JPEG ที่ไม่เกิน `maxBytes`
 *
 * คืน `null` เมื่อทำไม่สำเร็จ (ไฟล์ไม่ใช่รูปที่ sharp อ่านได้ / ย่อแล้วยังเกินเป้า) —
 * 🛑 **ห้าม throw**: ผู้เรียกต้องส่งข้อความออกไปได้เสมอ การที่รูปตัวอย่างไม่สวยเป็นเรื่องเล็กกว่า
 * การที่ข้อความของร้านไม่ถึงลูกค้ามาก (ผู้เรียกจะถอยไปใช้ URL รูปเต็มเป็น preview ตามพฤติกรรมเดิม)
 *
 * `withoutEnlargement` สำคัญ: รูปที่เล็กกว่า 1024px อยู่แล้วต้องไม่ถูกขยายขึ้น — การขยายทำให้ไฟล์
 * ใหญ่ขึ้นและเบลอ ซึ่งสวนทางกับเป้าหมายทั้งสองข้อของฟังก์ชันนี้
 */
export async function buildLinePreviewJpeg(
  source: Buffer,
  maxBytes: number,
): Promise<Buffer | null> {
  try {
    const out = await sharp(source)
      .rotate() // เคารพ EXIF orientation — ไม่งั้น preview ตะแคงคนละทางกับรูปเต็ม
      .resize({
        width: PREVIEW_MAX_EDGE,
        height: PREVIEW_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: PREVIEW_QUALITY })
      .toBuffer()
    return out.byteLength <= maxBytes ? out : null
  } catch {
    // sharp อ่านไฟล์นี้ไม่ได้ (ไฟล์เสีย/ไม่ใช่รูปจริงแม้นามสกุลจะบอกว่าใช่)
    return null
  }
}
