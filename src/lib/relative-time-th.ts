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
