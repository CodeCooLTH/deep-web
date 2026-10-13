/**
 * ช่องตัวเลขแบบ type="text" (แทน type="number")
 *
 * ทำไมไม่ใช้ type="number": Chrome เดสก์ท็อปวาดลูกศรขึ้น/ลงในช่อง กินพื้นที่จนเลขในช่องแคบ ๆ
 * โดนตัดมองไม่เห็น (ช่องจำนวนหน้าสร้างออเดอร์ — user report 2026-10-13) และหมุนล้อเมาส์บนช่อง
 * ที่โฟกัสอยู่แล้วค่าเปลี่ยนเงียบ ๆ · ใช้คู่กับ inputMode="numeric" / "decimal" ให้มือถือเด้งแป้นตัวเลข
 */

/** จำนวนเต็มบวก: เก็บเฉพาะเลข · ว่าง → '' */
export function parseIntInput(raw: string): number | '' {
  const digits = raw.replace(/\D/g, '')
  return digits === '' ? '' : Number(digits)
}

/**
 * ทศนิยมบวก (เงิน/เปอร์เซ็นต์): เก็บเลข + จุดเดียว + ทศนิยมไม่เกิน `maxDecimals` ตำแหน่ง
 *
 * คืน string เมื่อค่ายังพิมพ์ไม่จบ ("12." / "1.50") — ถ้าแปลงเป็น number ทันที จุด/ศูนย์ท้าย
 * จะหายจากช่องระหว่างพิมพ์ จนพิมพ์ทศนิยมไม่ได้เลย · ให้ caller แปลงกลับด้วย `finishDecimalInput` ตอน blur
 */
export function parseDecimalInput(raw: string, maxDecimals = 2): number | string | '' {
  const cleaned = raw.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  let s =
    dot === -1
      ? cleaned
      : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '').slice(0, maxDecimals)
  // ตัด 0 นำหน้าถ้ามีเลขตาม (0360 → 360) แต่คง 0.5
  s = s.replace(/^0+(?=\d)/, '')
  if (s === '') return ''
  if (s.startsWith('.')) s = '0' + s
  return /\.(\d*0)?$/.test(s) ? s : Number(s)
}

/** ค่าที่ค้างเป็น string ("12.") → number ตอนออกจากช่อง · ค่าอื่นคืนเดิม */
export function finishDecimalInput<T>(value: T): T | number {
  return typeof value === 'string' && value !== '' ? Number(value) : value
}

/** ฟิลด์ optional (ส่วนลด/VAT) ใช้ undefined แทนช่องว่าง — 0 ยังเป็น 0 */
export function emptyToUndefined<T>(value: T | ''): T | undefined {
  return value === '' ? undefined : value
}
