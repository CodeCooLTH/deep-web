/**
 * auto-reply-schedule — "ตอนนี้อยู่ในเวลาทำงานของ DeepBot หรือยัง" (feature 00023)
 *
 * user 2026-07-31: "บางคนอยากให้ทำงานช่วง 18.00-9.00 เพื่อแทน admin ตอนหลับ / บางคนอยากให้ทำทั้งวัน"
 *
 * ฟังก์ชันบริสุทธิ์ทั้งไฟล์ (ไม่แตะ DB ไม่แตะ config) เพราะสองเรื่องที่พลาดง่ายที่สุดของฟีเจอร์นี้
 * — timezone กับช่วงข้ามเที่ยงคืน — ต้องทดสอบได้โดยไม่ต้องมีฐานข้อมูล
 */

/** UTC+7 ตายตัว ประเทศไทยไม่เคยมี DST — บวกออฟเซ็ตแล้วอ่านด้วย getUTC* ได้ค่าตรงเสมอ */
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000

export const MINUTES_PER_DAY = 1440
/** ทุกวัน = จันทร์(1) + อังคาร(2) + ... + อาทิตย์(64) */
export const ALL_DAYS_MASK = 127

export type ActiveSchedule = {
  /** "ALWAYS" = ทำงานตลอด | "WINDOW" = เฉพาะช่วงที่กำหนด */
  activeScheduleMode: string
  activeStartMin: number | null
  activeEndMin: number | null
  /** bitmask จันทร์=bit0 ... อาทิตย์=bit6 */
  activeDays: number
}

/**
 * นาทีจากเที่ยงคืน + วันในสัปดาห์แบบ ISO (จันทร์=1 ... อาทิตย์=7) ตามเวลาไทย
 *
 * ไม่ใช้ Intl ที่นี่ต่างจาก format-date.ts ตั้งใจ: ที่นั่นต้องการ "ข้อความสำหรับแสดงผล"
 * (ปี พ.ศ., ชื่อเดือนไทย) ส่วนที่นี่ต้องการ "ตัวเลขไปคำนวณ" การ parse ข้อความกลับเป็นเลข
 * เพื่อเอามาบวกลบเป็นขั้นตอนที่พังเงียบได้ทั้งที่ผลลัพธ์เท่ากันเป๊ะ
 */
export function bangkokNowParts(now: Date): { minuteOfDay: number; isoWeekday: number } {
  const shifted = new Date(now.getTime() + BKK_OFFSET_MS)
  const minuteOfDay = shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  // getUTCDay(): 0=อาทิตย์ ... 6=เสาร์ → ISO: จันทร์=1 ... อาทิตย์=7
  const isoWeekday = shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay()
  return { minuteOfDay, isoWeekday }
}

/** วันนั้นถูกเปิดไว้ใน bitmask ไหม (isoWeekday 1-7) */
export function isDayEnabled(days: number, isoWeekday: number): boolean {
  return (days & (1 << (isoWeekday - 1))) !== 0
}

/** ถอยไปหนึ่งวันแบบวนรอบสัปดาห์ (อาทิตย์ 7 → เสาร์ 6, จันทร์ 1 → อาทิตย์ 7) */
function previousIsoWeekday(isoWeekday: number): number {
  return isoWeekday === 1 ? 7 : isoWeekday - 1
}

/**
 * ตอนนี้ DeepBot ทำงานอยู่ไหม
 *
 * WARNING: ช่วงข้ามเที่ยงคืน (end <= start เช่น 18:00→09:00) ยึด **วันที่เริ่ม** เป็นเจ้าของช่วง
 * ตั้งจันทร์ 18:00-09:00 = คืนวันจันทร์ยาวถึงเช้าวันอังคาร ดังนั้นตอนตี 3 ของวันอังคาร
 * ต้องไปดูว่า "วันจันทร์" เปิดไว้ไหม ไม่ใช่วันอังคาร — นี่คือจุดที่โค้ดส่วนใหญ่พลาด
 * (เช็คแค่ `isDayEnabled(days, today)` จะตัดคนที่ทักตอนตี 3 ทิ้งทั้งที่ร้านตั้งใจให้ตอบ)
 *
 * fail-open ทุกกรณีที่ตั้งค่าไม่ครบ: ค่าที่อ่านไม่ได้ต้องไม่ทำให้บอทเงียบ เพราะอาการ
 * "เงียบโดยไม่มีเหตุผล" คือสิ่งที่ทำให้ร้านไล่บั๊กไม่เจอมาแล้วรอบหนึ่งวันนี้
 */
export function isWithinSchedule(schedule: ActiveSchedule, now: Date): boolean {
  if (schedule.activeScheduleMode !== 'WINDOW') return true

  const { activeStartMin: start, activeEndMin: end, activeDays: days } = schedule
  if (start == null || end == null) return true
  if (!Number.isInteger(start) || !Number.isInteger(end)) return true

  const { minuteOfDay, isoWeekday } = bangkokNowParts(now)

  // start === end: ครอบคลุมทั้งวัน (เงื่อนไขข้ามคืนด้านล่างจะเป็นจริงเสมอ) — Valibot กันไม่ให้
  // ตั้งค่านี้อยู่แล้ว แต่ถ้าหลุดมาทางอื่น "ทำงานทั้งวันในวันที่เปิดไว้" คือการตีความที่ปลอดภัยกว่า
  if (start < end) {
    // ช่วงในวันเดียว เช่น 09:00-18:00
    return isDayEnabled(days, isoWeekday) && minuteOfDay >= start && minuteOfDay < end
  }

  // ช่วงข้ามคืน เช่น 18:00-09:00
  if (minuteOfDay >= start) return isDayEnabled(days, isoWeekday) // ครึ่งหัวค่ำ = ของวันนี้
  if (minuteOfDay < end) return isDayEnabled(days, previousIsoWeekday(isoWeekday)) // ครึ่งเช้า = ของเมื่อวาน
  return false
}

/** "18:00" → 1080 ; คืน null ถ้ารูปแบบไม่ถูกหรืออยู่นอกช่วง */
export function parseHhMm(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/** 1080 → "18:00" */
export function formatHhMm(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60)
  const m = minuteOfDay % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
