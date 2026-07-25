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

// สร้าง Intl.DateTimeFormat ครั้งเดียว (module singleton) แล้ว reuse — การ construct formatter
// แพงกว่าการ format มาก; list หลายสิบแถวเดิมสร้างใหม่ทุกแถว → cache แล้วเร็วขึ้นชัด (ทั้งระบบ)
const BKK_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23', // 00–23 (กัน "24:00" ของบาง engine)
})

/** ดึงส่วนประกอบวันเวลาใน timezone ไทย (ปีเป็น ค.ศ., เลข ASCII) */
function partsInBangkok(d: Date): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { type, value } of BKK_FMT.formatToParts(d)) out[type] = value
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

/**
 * "256907" — ปี พ.ศ. (4 หลัก) + เดือน (2 หลัก) ติดกัน, timezone ไทย
 * ใช้ประกอบเลขคำสั่งซื้อ (orderNo: `DP` + period + โค้ด 8 หลักของ publicToken) — ดู src/lib/order-no.ts
 * คืน '' ถ้า parse ไม่ได้ (caller ต้องกันเอง — เลขคำสั่งซื้อไม่ควรเกิดจากวันที่ invalid)
 */
export function orderPeriodTH(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return ''
  const p = partsInBangkok(d)
  const year = Number(p.year) + BE_OFFSET
  return `${year}${p.month}`
}

/**
 * "2026/07/25" — เส้นทางโฟลเดอร์ชาร์ดไฟล์อัปโหลด ปี ค.ศ./เดือน/วัน (timezone ไทย)
 * NOTE: ใช้ ค.ศ. (Gregorian) ไม่ใช่ พ.ศ. — path เก็บไฟล์ควรเป็นปีสากล; กันไฟล์กองรวมโฟลเดอร์เดียว
 * (storage: uploads/YYYY/MM/DD/uuid.ext). caller ส่ง `new Date()` เข้ามา (runtime — pure ที่นี่)
 */
export function uploadDatePrefix(input: Date | string | number): string {
  const d = toValidDate(input)
  if (!d) return '' // ไม่ควรเกิด (caller ส่ง new Date() ที่ valid เสมอ)
  const p = partsInBangkok(d)
  return `${p.year}/${p.month}/${p.day}`
}

const THAI_MONTHS_ABBR = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

/**
 * "มิ.ย. 2568" — เดือนย่อไทย + ปี พ.ศ. (ไม่มีวัน, timezone ไทย)
 * ใช้แสดง "เข้าร่วมเมื่อ" ที่ไม่ต้องการความละเอียดระดับวัน (เช่น /u/[username] memberSince)
 */
export function formatMonthYearTH(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  const p = partsInBangkok(d)
  const year = Number(p.year) + BE_OFFSET
  const monthIdx = Number(p.month) - 1
  return `${THAI_MONTHS_ABBR[monthIdx] ?? '—'} ${year}`
}

/**
 * "01 ส.ค. 2569" — วันที่ล้วนแบบไทย (วัน + เดือนย่อไทย + ปี พ.ศ., timezone ไทย)
 * รูปแบบวันที่มาตรฐานฝั่ง buyer — อ่านง่ายกว่า ISO. ใช้กับ context ที่ไม่ต้องมีเวลา (เช่น วันคั่นแชท)
 */
export function formatDateTH(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  const p = partsInBangkok(d)
  const year = Number(p.year) + BE_OFFSET
  const monthIdx = Number(p.month) - 1
  return `${p.day} ${THAI_MONTHS_ABBR[monthIdx] ?? '—'} ${year}`
}

/**
 * "01 ส.ค. 2569 19:30" — วันที่ไทย + เวลา HH:mm (ระดับนาที, timezone ไทย, 24 ชม.)
 * timestamp มาตรฐานฝั่ง buyer (วันที่สั่งซื้อ/รีวิว ฯลฯ) — ไม่โชว์วินาที
 */
export function formatDateTimeTH(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  const p = partsInBangkok(d)
  const year = Number(p.year) + BE_OFFSET
  const monthIdx = Number(p.month) - 1
  return `${p.day} ${THAI_MONTHS_ABBR[monthIdx] ?? '—'} ${year} ${p.hour}:${p.minute}`
}

/**
 * "19:30" — เวลาล้วน HH:mm (ระดับนาที, timezone ไทย, 24 ชม.)
 * ใช้คู่กับวันที่ที่แยกแสดงอยู่แล้ว เช่น เวลาข้อความในแชท / inbox ของวันนี้
 */
export function formatTimeHM(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  const p = partsInBangkok(d)
  return `${p.hour}:${p.minute}`
}

// Bangkok = UTC+7 ตายตัว ไม่มี DST → คำนวณ "วันที่ตามปฏิทินไทย" ด้วย offset คงที่ได้ปลอดภัย
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000
/** index ของวัน (จำนวนวันนับจาก epoch) ตามปฏิทินไทย — ใช้เทียบ "วันนี้/เมื่อวาน" */
function bangkokDayIndex(d: Date): number {
  return Math.floor((d.getTime() + BKK_OFFSET_MS) / 86_400_000)
}

/**
 * "วันนี้ 16:07" / "เมื่อวาน 18:20" / "3 ก.ค. 10:15" / "3 ก.ค. 68 10:15" — เวลาย่อแบบ relative
 * ใช้ในลิสต์ที่ต้องกวาดตาเร็ว (การ์ดออเดอร์ seller) ไม่ใช่ timestamp ทางการ (นั่นใช้ formatDateTime)
 *  - วันเดียวกับวันนี้ (ปฏิทินไทย) → "วันนี้ HH:mm"
 *  - เมื่อวาน → "เมื่อวาน HH:mm"
 *  - ปีเดียวกับปัจจุบัน → "D MMM(ย่อไทย) HH:mm"
 *  - ต่างปี → "D MMM(ย่อไทย) {ปี พ.ศ. 2 หลัก} HH:mm" (กันสับสนออเดอร์ข้ามปี)
 * หมายเหตุ: อ้างอิง "วันนี้" จาก new Date() ตอน render — ใช้ในการ์ด list ที่ยอมรับ relative time ได้
 */
/**
 * เวลาแบบสั้นที่สุดสำหรับ "รายการแชท" — user สั่ง 2026-07-23: "18 นาทีที่แล้ว กินพื้นที่ไปหน่อย
 * ให้แสดงแค่ 18 น., 18 ชม., 1 วัน, เกิน 7 วันแสดง 16 ก.ค. และถ้าไม่ใช่ปีปัจจุบันแสดง 16 ก.ค. 68"
 *
 *  <1 นาที → "เมื่อกี้" · <60 นาที → "18 น." · <24 ชม. → "18 ชม." · ≤7 วัน → "1 วัน"
 *  >7 วัน ปีนี้ → "16 ก.ค." · ต่างปี → "16 ก.ค. 68" (พ.ศ. 2 หลัก)
 *
 * นับ "วัน" ด้วยวันตามปฏิทินไทย (bangkokDayIndex) ไม่ใช่ 24 ชม.เป๊ะ — ข้อความเมื่อคืนควรอ่านว่า
 * "1 วัน" ไม่ใช่ "13 ชม." ตามที่คนไทยเข้าใจ. อยู่ในไฟล์นี้เพราะเป็น SSOT ของการ format วันที่
 * ทั้งระบบ (docs/conventions/date-format.md — ห้ามเรียก Intl/toLocaleDateString เองที่ component)
 */
export function formatChatListTime(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  const now = new Date()
  const diffMs = Math.max(0, now.getTime() - d.getTime())
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'เมื่อกี้'
  if (min < 60) return `${min} น.`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ชม.`
  const diffDays = bangkokDayIndex(now) - bangkokDayIndex(d)
  if (diffDays <= 7) return `${Math.max(1, diffDays)} วัน`
  const p = partsInBangkok(d)
  const monthAbbr = THAI_MONTHS_ABBR[Number(p.month) - 1] ?? '—'
  const dayNoPad = String(Number(p.day)) // "16 ก.ค." ไม่ใช่ "16 ก.ค." แบบเติมศูนย์
  if (Number(p.year) === Number(partsInBangkok(now).year)) return `${dayNoPad} ${monthAbbr}`
  return `${dayNoPad} ${monthAbbr} ${String(Number(p.year) + BE_OFFSET).slice(-2)}`
}

export function formatRelativeDayTime(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  const p = partsInBangkok(d)
  const hm = `${p.hour}:${p.minute}`
  const now = new Date()
  const diffDays = bangkokDayIndex(now) - bangkokDayIndex(d)
  if (diffDays === 0) return `วันนี้ ${hm}`
  if (diffDays === 1) return `เมื่อวาน ${hm}`
  const monthAbbr = THAI_MONTHS_ABBR[Number(p.month) - 1] ?? '—'
  const dayNoPad = String(Number(p.day)) // "3 ก.ค." ไม่ใช่ "03 ก.ค."
  const sameYear = Number(p.year) === Number(partsInBangkok(now).year)
  if (sameYear) return `${dayNoPad} ${monthAbbr} ${hm}`
  const beShort = String(Number(p.year) + BE_OFFSET).slice(-2) // ปี พ.ศ. 2 หลัก
  return `${dayNoPad} ${monthAbbr} ${beShort} ${hm}`
}
