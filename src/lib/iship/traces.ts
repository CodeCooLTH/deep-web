/**
 * traces — ลำดับของ "การเดินทางของพัสดุ" ที่ทุกหน้าจอต้องใช้ร่วมกัน (feature 00022)
 *
 * 🛑 มีอยู่เพราะเคยไม่มี: `getTraces()` (iship.service.ts) คืน `orderBy: { occurredAt: "asc" }`
 * = **เก่าสุดอยู่แถวแรก** แล้วมี 3 หน้าจออ่าน `/api/seller/iship/shipments/[id]/traces` ตัวเดียวกัน
 * แต่เรียงเองแค่ที่เดียว (`ShipmentHoverCard`) อีกสองที่ (`ShipmentStatusView` ในโมดัลแชท และ
 * `ShippingCard` ในหน้าคำสั่งซื้อ) `.slice()` จากอาเรย์ดิบ ⇒
 *   - จุดน้ำเงิน "สถานะปัจจุบัน" (`i === 0`) ไปเกาะเหตุการณ์ **เก่าที่สุด**
 *   - โหมดย่อ 3 แถว โชว์ 3 เหตุการณ์ **เก่าสุด** ⇒ ร้านไม่มีวันเห็นสถานะล่าสุดจนกว่าจะกด "ดูทั้งหมด"
 * (user เจอเองบน prod 2026-08-19 — พัสดุ TH2801925TTA5C)
 *
 * บทเรียนคือ "เรียงเองที่ปลายทาง" กระจายกันไปคนละไฟล์ = รอวันที่คนที่สี่ลืมเรียง ⇒ นิยามลำดับ
 * ต้องอยู่ที่เดียว ผู้เรียกเรียกฟังก์ชันนี้ ห้ามเขียน `.sort()` เองอีก
 */

/**
 * รูปร่างขั้นต่ำที่เรียงได้ — ทุกหน้าจอมี `occurredAt` แต่ชนิดต่างกัน (string จาก API · Date จาก
 * Prisma) และ `ShippingCard` ประกาศไว้เป็น nullable ⇒ ต้องรับ null/undefined ได้ด้วย ไม่ใช่ให้
 * ผู้เรียกไป cast ทิ้ง (cast คือสิ่งที่ปิดตา ไม่ใช่ตัวช่วย)
 */
type Traceable = { occurredAt: string | Date | null | undefined }

/**
 * ใหม่ → เก่า (ล่าสุดอยู่ index 0 เสมอ)
 *
 * - ไม่แก้อาเรย์เดิม (คืนสำเนา) — ผู้เรียกส่ง state ของ React เข้ามาตรง ๆ ได้
 * - เหตุการณ์ที่เวลาเท่ากันเป๊ะคงลำดับเดิมจาก API ไว้ (`Array.prototype.sort` เป็น stable ตั้งแต่ ES2019)
 *   จึงไม่ต้องมี tie-breaker — ขนส่งยิงหลายเหตุการณ์ในวินาทีเดียวกันได้จริง
 * - `occurredAt` ที่ว่าง/แปลงเป็นวันที่ไม่ได้ ถูกดันไปท้ายสุด ไม่ใช่กระเด็นขึ้นหัว: แถวพังต้องไม่
 *   ไปนั่งตำแหน่ง "สถานะล่าสุด" ซึ่งเป็นบรรทัดที่ร้านเชื่อถือมากที่สุด
 *   (🛑 `new Date(null)` = epoch 0 ไม่ใช่ NaN — ต้องเช็ค null เองก่อน ไม่งั้นแถวไม่มีเวลาจะถูก
 *   จัดเป็น "1 ม.ค. 1970" ซึ่งบังเอิญไปท้ายสุดพอดีตอนนี้ แล้วพังเงียบวันที่ลำดับเปลี่ยนเป็น asc)
 */
export function sortTracesNewestFirst<T extends Traceable>(traces: readonly T[]): T[] {
  const at = (v: Traceable['occurredAt']) => (v == null ? Number.NaN : new Date(v).getTime())
  return [...traces].sort((a, b) => {
    const ta = at(a.occurredAt)
    const tb = at(b.occurredAt)
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
    if (Number.isNaN(ta)) return 1
    if (Number.isNaN(tb)) return -1
    return tb - ta
  })
}
