/**
 * order-options — SSOT ของตัวเลือก "ช่องทางการขาย" และ "วิธีชำระเงิน" ในฟอร์มสร้างออเดอร์
 *
 * IMPORTANT: ต้องมีชุดเดียวสำหรับทั้งมือถือและเดสก์ท็อป
 *
 * เดิมแยกกันสองชุด — เดสก์ท็อป (CartPanel) มี 5 ช่องทาง/6 วิธีชำระ ส่วนมือถือ
 * (ChannelPaymentSelect) มี 4/3 โดยขาด PROMPTPAY / CARD / OTHER แต่ทั้งคู่อ่าน-เขียน
 * localStorage key เดียวกัน ผลคือ:
 *   ตั้ง "พร้อมเพย์" เป็นค่าเริ่มต้นจากเดสก์ท็อป → เปิดหน้าเดิมบนมือถือ → lookup ไม่เจอ
 *   → chip แสดง "—" ทั้งที่ค่าในฟอร์มยังเป็น PROMPTPAY และ **จะถูกบันทึกลง DB แบบนั้น**
 * ผู้ขายเห็นขีดกลาง ไม่รู้ว่าออเดอร์ระบุวิธีชำระอะไร และแก้ไม่ได้เพราะ sheet ไม่มีตัวเลือกนั้น
 * (impeccable critique 2026-07-31 P1 — ขัด PRODUCT.md design principle 5 "ไม่ซ่อนข้อมูลสำคัญ")
 *
 * icon ใช้เฉพาะฝั่งมือถือ (PickerOption) — เดสก์ท็อปใช้แค่ value/label
 */

export type OrderOption = {
  value: string
  label: string
  /** tabler icon name (ไม่มี prefix) — ใช้ใน picker ของมือถือ */
  icon: string
}

export const CHANNEL_OPTIONS: OrderOption[] = [
  { value: 'STOREFRONT', label: 'หน้าร้าน', icon: 'building-store' },
  { value: 'FACEBOOK', label: 'Facebook', icon: 'brand-facebook' },
  { value: 'LINE', label: 'LINE', icon: 'brand-line' },
  { value: 'TIKTOK', label: 'TikTok / TikTok Shop', icon: 'brand-tiktok' },
  { value: 'OTHER', label: 'อื่นๆ', icon: 'dots' },
]

export const PAYMENT_OPTIONS: OrderOption[] = [
  { value: 'CASH', label: 'เงินสด', icon: 'cash' },
  { value: 'TRANSFER', label: 'โอนเงิน', icon: 'building-bank' },
  { value: 'PROMPTPAY', label: 'พร้อมเพย์', icon: 'qrcode' },
  { value: 'CARD', label: 'บัตรยอดเงิน/เดบิต', icon: 'credit-card' },
  { value: 'COD', label: 'เก็บเงินปลายทาง', icon: 'truck-delivery' },
  { value: 'OTHER', label: 'อื่นๆ', icon: 'dots' },
]

/**
 * หา label ของค่าที่บันทึกอยู่ — ถ้าไม่รู้จักให้คืนค่าดิบ ไม่ใช่ "—"
 * ผู้ใช้ต้องเห็นเสมอว่าค่าที่จะถูกบันทึกคืออะไร แม้เป็นค่าเก่าที่ถอดออกจากลิสต์ไปแล้ว
 */
export function labelOf(options: OrderOption[], value: string | undefined | null): string {
  if (!value) return ''
  return options.find((o) => o.value === value)?.label ?? value
}
