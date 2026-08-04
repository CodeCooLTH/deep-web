/**
 * ShipmentFooterSpec — สัญญาระหว่างแผงเนื้อหา iShip กับ footer ที่ไม่เลื่อนตามเนื้อหาของโมดัล
 *
 * **ส่งขึ้นมาแต่ primitive ไม่ส่ง handler โดยเจตนา** — การ submit จริงวิ่งผ่าน attribute `form=`
 * ของ HTML ถ้าส่ง closure ขึ้นมาเก็บใน state ของผู้เรียกแทน จะได้ closure ที่ค้างค่าฟอร์มของ
 * render รอบก่อนทุกครั้งที่ effect ไม่ได้ publish ซ้ำ = "กดปุ่มแล้วส่งข้อมูลเก่า" ที่ไม่มีอะไรฟ้อง
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

/** ผู้เรียกส่ง setter ของ state ตรง ๆ ได้ (identity คงที่) แผงลูกจึงใส่ใน dependency ได้ไม่เกิดลูป */
export type ShipmentFooterReporter = (spec: ShipmentFooterSpec | null) => void
