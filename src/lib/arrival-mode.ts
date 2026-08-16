/**
 * arrival-mode — "ลูกค้ารายนี้เข้ามารับบริการยังไง" (feature ร้านบริการ)
 *
 * หัวหน้าถามตรง ๆ (2026-08-15): *"อยากรู้ว่าคนนี้เข้ามารับบริการยังไง … บางคนเข้ารับโต้ง ๆ
 * เลยต้องมีหลายแบบ"* — ระบบตอบไม่ได้เลยก่อนหน้านี้ เพราะเก็บแค่ "มีเวลานัดไหม" (มี/ไม่มี)
 * ซึ่งยุบ 3 สถานการณ์ที่ต่างกันสิ้นเชิงให้เหลือ 2 ค่า
 *
 * ## 🛑 ทำไม derive ไม่ใช่เพิ่มคอลัมน์
 *
 * ธงที่เก็บในแถวคือ **ภาพนิ่ง ณ เวลาที่เขียน** ไม่ใช่ความจริงปัจจุบัน — ร้านเลื่อนนัด/แก้เวลา
 * ทีหลังได้ แล้วธงจะค้างบอกเรื่องเก่า โดยไม่มีอะไรฟ้อง (`stored-flag-vs-owner-truth.md`)
 * ที่สำคัญกว่านั้น: **ออเดอร์ 21 ใบบน prod เกิดก่อนที่จะมีธง** ⇒ เพิ่มคอลัมน์แล้วต้อง backfill
 * ด้วยการเดา ซึ่งคือการแต่งข้อเท็จจริงขึ้นมา · การ derive ให้คำตอบกับข้อมูลเก่าทันทีโดยไม่ต้องเดา
 *
 * ## เกณฑ์
 *
 * | ค่า | เกณฑ์ | ความหมายกับร้าน |
 * |---|---|---|
 * | `UNSCHEDULED` | ไม่มี `serviceStart` | **ยังไม่มีที่ยืนในตารางงาน** — ต้องกด "เริ่มงานเลย" ก่อน |
 * | `WALK_IN` | เวลานัด ≈ เวลาที่เปิดบิล | เดินเข้ามาแล้วเปิดบิลตรงนั้น |
 * | `BOOKED` | เวลานัดอยู่หลังเวลาเปิดบิลอย่างมีนัยยะ | จองล่วงหน้าไว้ |
 *
 * เกณฑ์ `WALK_IN` ถูกทำให้ **จริงโดยการก่อสร้าง**: ปุ่ม "เริ่มงานเลย" ตั้ง `serviceStart = เวลาที่กด`
 * ⇒ ส่วนต่างเป็น ~0 เสมอ ไม่ต้องพึ่งการเดา
 */

/** ระยะที่ยังถือว่า "เปิดบิลตอนลูกค้ามาถึง" — กว้างพอสำหรับการกรอกฟอร์มจริง */
export const WALK_IN_WINDOW_MIN = 30;

export type ArrivalMode = "UNSCHEDULED" | "WALK_IN" | "BOOKED";

export interface ArrivalModeMeta {
  label: string;
  /** คำอธิบายสั้นสำหรับ tooltip/legend — ต้องบอก *สิ่งที่เกิดขึ้น* ไม่ใช่ชื่อเกณฑ์ */
  hint: string;
  icon: string;
  /** คลาส Paces — โทนต้องสื่อ "ต้องลงมือ" vs "เป็นข้อเท็จจริงแล้ว" */
  cls: string;
}

export const ARRIVAL_MODE_META: Record<ArrivalMode, ArrivalModeMeta> = {
  /**
   * 🛑 `UNSCHEDULED` ใช้โทน warning เพราะเป็น **สถานะที่ร้านต้องลงมือ** ไม่ใช่ป้ายบอกประเภท
   * ตราบใดที่ยังอยู่สถานะนี้ งานใบนั้นหายจากตารางงานทั้งวัน (query กรองด้วย serviceStart)
   */
  UNSCHEDULED: {
    label: "ยังไม่ระบุเวลา",
    hint: "งานนี้ยังไม่โผล่ในตารางงาน — กด “เริ่มงานเลย” เมื่อลูกค้ามาถึง",
    icon: "clock-question",
    cls: "bg-warning/15 text-warning-ink",
  },
  WALK_IN: {
    label: "เดินเข้ามา",
    hint: "ลูกค้ามาถึงร้านแล้วเปิดบิลตรงนั้น ไม่ได้จองล่วงหน้า",
    icon: "walk",
    cls: "bg-default-100 text-default-800",
  },
  BOOKED: {
    label: "จองล่วงหน้า",
    hint: "นัดเวลาไว้ก่อนวันเข้ารับบริการ",
    icon: "calendar-event",
    cls: "bg-default-100 text-default-800",
  },
};

/**
 * ลูกค้ารายนี้เข้ามายังไง
 *
 * รับ ISO string หรือ Date ก็ได้ (แถวที่ข้าม RSC boundary มาแล้วถือ ISO)
 */
export function resolveArrivalMode(order: {
  serviceStart: string | Date | null | undefined;
  createdAt: string | Date;
}): ArrivalMode {
  if (!order.serviceStart) return "UNSCHEDULED";
  const start = new Date(order.serviceStart).getTime();
  const created = new Date(order.createdAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(created)) return "UNSCHEDULED";
  /**
   * 🛑 เทียบ **ทางเดียว** ห้ามใช้ `Math.abs` — สิ่งที่นิยาม "จองล่วงหน้า" คือ
   * *เวลานัดอยู่หลังเวลาเปิดบิลอย่างมีนัยยะ* เท่านั้น ทุกอย่างที่เหลือคือบิลที่ถูกเปิด
   * ตอนหรือหลังงานเกิดขึ้น = ไม่ได้จองมาก่อน
   *
   * ร่างแรกใช้ `Math.abs` แล้ว mutation จับได้ว่าเทสไม่แดงเมื่อถอดออก — ไล่ดูแล้วพบว่า
   * ตัว `abs` เองต่างหากที่ผิด: บิลที่เปิดย้อนหลัง (feature 00033 ให้ร้านย้อนวันได้ถึง 90 วัน)
   * จะมีส่วนต่างติดลบก้อนใหญ่ แล้ว `abs` จะอ่านเป็น "จองล่วงหน้า" ทั้งที่ร้านแค่มากรอกทีหลัง
   */
  return start - created > WALK_IN_WINDOW_MIN * 60_000 ? "BOOKED" : "WALK_IN";
}

/**
 * ประโยคเต็มที่ตอบคำถามของหัวหน้า — **วิธีเข้ารับ + ช่องทางที่ติดต่อมา**
 *
 * สองแกนนี้ต่างกันและต้องอยู่ด้วยกันถึงจะตอบได้ว่า "คนนี้มายังไง":
 *   · วิธีเข้ารับ  = จองล่วงหน้า / เดินเข้ามา   (แกนเวลา)
 *   · ช่องทาง     = เพจไหน / หน้าร้าน          (แกนที่มา)
 *
 * `channelLabel` เป็น null ได้ (ออเดอร์ที่สร้างในระบบตรง ๆ) — ตัดวลีนั้นทิ้งทั้งก้อน
 * ไม่ใช่เติมคำว่า "ไม่ทราบ" ซึ่งอ่านเหมือนระบบพัง
 */
export function arrivalSummary(mode: ArrivalMode, channelLabel: string | null): string {
  const base = ARRIVAL_MODE_META[mode].label;
  return channelLabel ? `${base} · จาก${channelLabel}` : base;
}
