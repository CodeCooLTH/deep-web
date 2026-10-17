// ชนิดของข้อความระบบแจ้ง (AUTO_NOTICE) เท่าที่อ่านได้จากแถวข้อความ → เลือกคีย์ข้อความอ่านออกเสียง/title ของป้าย "ส่งโดยระบบ"
//
// 🛑 แถวไม่ได้เก็บชนิดของ notice (สรุปออเดอร์/เลขพัสดุ/เริ่มงาน/ปิดงาน) — แยกได้แค่การ์ด ORDER (สรุปออเดอร์/นัด)
// ส่วนข้อความตัวอักษร (เลขพัสดุ/เริ่มงาน/ปิดงาน) ใช้ถ้อยคำกลาง "ส่งโดยระบบ" จนกว่าตัวส่ง (T13) จะเก็บชนิดไว้
// ห้ามเดาจากเนื้อความ — เดาผิด = ป้ายบอกผู้ขายผิดเรื่อง
export type SystemNoticeLabelKey = 'sentBySystemOrder' | 'sentBySystem'

export function systemNoticeLabelKey(m: { type: string }): SystemNoticeLabelKey {
  return m.type === 'ORDER' ? 'sentBySystemOrder' : 'sentBySystem'
}
