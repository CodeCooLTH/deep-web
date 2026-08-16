/**
 * relativeTimeTh — แปลง timestamp เป็นข้อความ relative ภาษาไทยสั้น ๆ
 * ใช้ใน header ของ Paces toast ("เมื่อสักครู่", "2 นาทีที่แล้ว")
 */
export function relativeTimeTh(fromMs: number, nowMs: number = Date.now()): string {
  const sec = Math.max(0, Math.floor((nowMs - fromMs) / 1000))
  if (sec < 10) return 'เมื่อสักครู่'
  if (sec < 60) return `${sec} วินาทีที่แล้ว`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} นาทีที่แล้ว`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`
  const day = Math.floor(hr / 24)
  return `${day} วันที่แล้ว`
}

/**
 * ระยะเวลาแบบ **ไม่มีคำว่า "ที่แล้ว"** — สำหรับประโยคที่เอาไปต่อท้ายเอง
 * เช่น "ค้างขั้นนี้ 2 ชั่วโมง" ของ Command Center (00049)
 *
 * 🛑 แยกฟังก์ชันแทนการ `.replace('ที่แล้ว','')` เพราะ "เมื่อสักครู่" ไม่มีคำนั้นอยู่เลย
 * การตัดสตริงจะได้ "ค้างขั้นนี้ เมื่อสักครู่" ซึ่งอ่านไม่รู้เรื่อง — ต้องเป็น "ไม่ถึงนาที"
 */
export function durationTh(fromMs: number, nowMs: number = Date.now()): string {
  const sec = Math.max(0, Math.floor((nowMs - fromMs) / 1000))
  if (sec < 60) return 'ไม่ถึงนาที'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} นาที`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ชั่วโมง`
  const day = Math.floor(hr / 24)
  return `${day} วัน`
}
