/**
 * format-date — ฟอร์แมตวันที่/เวลามาตรฐานเดียวของทั้งระบบ (กฎ: docs/conventions/date-format.md)
 *
 * รูปแบบมาตรฐาน (ห้าม format วันที่เองที่อื่น — ใช้ 2 ฟังก์ชันนี้เท่านั้น):
 *   - formatDateTime(d) → "2569-06-07 10:06:13"  (พ.ศ. + เวลา HH:mm:ss)
 *   - formatDate(d)     → "2569-06-07"            (พ.ศ. วันที่ล้วน)
 *
 * รายละเอียด:
 *   - ปี = พ.ศ. (ค.ศ. + 543)
 *   - เดือน/วัน/เวลา เติม 0 นำหน้า 2 หลัก, ปฏิทินสากล (ASCII) ไม่ใช่เลขไทย
 *   - format ใน timezone ไทย (Asia/Bangkok) เสมอ — server เป็น UTC ก็ได้วันเวลาไทยตรง
 *   - 24 ชั่วโมง (00–23)
 *   - input รับ Date | ISO string | epoch ms; ค่าไม่ valid → "—"
 *
 * pure module (ไม่มี import) → ใช้ได้ทั้ง RSC และ client component
 */

const TZ = 'Asia/Bangkok'
const BE_OFFSET = 543

/** ดึงส่วนประกอบวันเวลาใน timezone ไทย (ปีเป็น ค.ศ., เลข ASCII) */
function partsInBangkok(d: Date): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23', // 00–23 (กัน "24:00" ของบาง engine)
  })
  const out: Record<string, string> = {}
  for (const { type, value } of fmt.formatToParts(d)) out[type] = value
  return out
}

/** แปลง input ใด ๆ เป็น Date ที่ valid; null ถ้า parse ไม่ได้ */
function toValidDate(input: Date | string | number | null | undefined): Date | null {
  if (input == null) return null
  const d = input instanceof Date ? input : new Date(input)
  return isNaN(d.getTime()) ? null : d
}

/** "2569-06-07 10:06:13" — วันที่ + เวลา (พ.ศ., timezone ไทย) */
export function formatDateTime(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  const p = partsInBangkok(d)
  const year = Number(p.year) + BE_OFFSET
  return `${year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`
}

/** "2569-06-07" — วันที่ล้วน (พ.ศ., timezone ไทย) */
export function formatDate(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  const p = partsInBangkok(d)
  const year = Number(p.year) + BE_OFFSET
  return `${year}-${p.month}-${p.day}`
}

/**
 * "10:06:13" — เวลาล้วน HH:mm:ss (timezone ไทย, 24 ชม.)
 * ใช้เฉพาะ context ที่แสดง "เวลาล้วน" คู่กับวันที่ที่แยกแสดงอยู่แล้ว เช่น นาฬิกา live
 * (รูปแบบตรงกับส่วนเวลาของ formatDateTime). อย่าใช้แทน formatDateTime ในการแสดง timestamp
 */
export function formatTime(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  const p = partsInBangkok(d)
  return `${p.hour}:${p.minute}:${p.second}`
}
