/**
 * ShipmentFooterSpec — สัญญาระหว่าง "แผงเนื้อหา" ของ iShip กับ footer ที่ค้างอยู่ของโมดัล
 *
 * ที่มา: Impeccable critique 2026-08-04 (P0) — ปุ่มหลักเดิมเป็น element ตัวสุดท้ายของ
 * ฟอร์มสูง ~1,600px จึงเลื่อนหายไปกับเนื้อหา ร้านต้องปัดหาปุ่มที่เสียเงินจริงทุกครั้ง
 * ปุ่มจึงถูกย้ายขึ้นไปอยู่ `footer` slot ของ IShipModalShell ที่ไม่เลื่อนตามเนื้อหา
 *
 * ส่งขึ้นมาเฉพาะ "ค่าที่เอาไว้วาดปุ่ม" ซึ่งเป็น primitive ล้วน — **ไม่ส่ง handler ขึ้นมา
 * โดยเจตนา** การ submit จริงวิ่งผ่าน attribute `form=` ของ HTML (ปุ่มวางนอก `<form>`
 * ได้ถ้าอ้าง id ถูก) เหตุผล: ถ้าส่ง closure ขึ้นมาเก็บใน state ของผู้เรียก จะได้ closure
 * ที่ค้างค่าฟอร์มของ render รอบก่อนทุกครั้งที่ effect ไม่ได้ publish ซ้ำ ซึ่งแปลว่า
 * "กดปุ่มแล้วส่งข้อมูลเก่า" — ความผิดพลาดชนิดที่ไม่มีอะไรฟ้อง
 *
 * ผลพลอยได้: การผูก `<form>` จริงทำให้กด Enter ในช่องกรอกแล้ว submit ได้ตามมาตรฐาน
 * (เดิมแผง iShip เป็น `<div>` + ปุ่ม onClick ล้วน Enter จึงไม่ทำอะไรเลย)
 */
export interface ShipmentFooterSpec {
  /** id ของ `<form>` ที่ปุ่มใน footer จะยิง submit ไปหา */
  formId: string
  label: string
  /** ชื่อ icon ของ tabler — ห้าม emoji (Hard Rule 12) */
  icon: string
  /** กำลังส่งคำขออยู่ — โมดัลใช้ทั้งวาด spinner และกันปิดระหว่างทาง */
  busy: boolean
}

/**
 * ผู้เรียกส่ง setter ของ state ตรง ๆ ได้เลย (setState ของ React มี identity คงที่)
 * แผงลูกจึงใส่ prop นี้ใน dependency ของ effect ได้โดยไม่เกิดลูป
 */
export type ShipmentFooterReporter = (spec: ShipmentFooterSpec | null) => void
