// ขนาดรูปที่ใช้จอง box ใน <img> กัน layout shift — รับ metadata จาก sharp แล้วคืนขนาดที่ "ผู้ชมเห็นจริง"
// ไม่ clamp สัดส่วน: รูปยาว/แบนผิดปกติต้องจองตามจริง ไม่งั้น box ไม่ตรงกับรูปตอนโหลดเสร็จ

/** เพดานสมเหตุผล — ค่าเกินนี้ถือว่า metadata เสีย ไม่ใช่รูปจริง */
export const MAX_IMAGE_DIMENSION = 20000;

export type ImageSize = { width: number; height: number };

const valid = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n > 0 && n <= MAX_IMAGE_DIMENSION;

export function normalizeImageSize(meta: {
  width?: number;
  height?: number;
  orientation?: number;
  pageHeight?: number;
}): ImageSize | null {
  // GIF/WebP เคลื่อนไหว: sharp คืน height = ผลรวมทุกเฟรม ต้องใช้ pageHeight (ความสูงเฟรมเดียว)
  const h = meta.pageHeight ?? meta.height;
  const w = meta.width;
  if (!valid(w) || !valid(h)) return null;
  // EXIF orientation 5–8 = หมุน 90° ภาพที่เห็นจึงสลับกว้าง/สูง
  return (meta.orientation ?? 1) >= 5 ? { width: h, height: w } : { width: w, height: h };
}

/** attribute ของ <img> — null = ไม่รู้ขนาด ไม่ใส่อะไร */
export function imageBoxAttrs(size: ImageSize | null): { width?: number; height?: number } {
  return size ? { width: size.width, height: size.height } : {};
}
