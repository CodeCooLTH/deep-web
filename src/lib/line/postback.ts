/**
 * postback — แปลง event "ลูกค้าแตะปุ่ม" ของ LINE เป็นข้อความที่ผู้ขายอ่านรู้เรื่อง (2026-08-11)
 *
 * postback เกิดได้ 3 ทาง: ปุ่มใน Flex Message · Quick Reply · Rich Menu — ทั้งสามยังไม่มีตัวส่งจริง
 * ในรอบนี้ (การ์ดออเดอร์ใช้ปุ่ม `uri` ซึ่งเปิดลิงก์ตรงไม่ผ่าน webhook) ตัวรับต้องมาก่อนเสมอเพราะ
 * **วันที่เราส่งปุ่มออกไปแล้วยังไม่มีตัวรับ = ลูกค้ากดแล้วเงียบหาย** ซึ่งแย่กว่าไม่มีปุ่มเลย
 *
 * `data` เป็นสตริงที่ **เราเป็นคนกำหนดเองตอนสร้างปุ่ม** (LINE ส่งกลับมาดิบ ๆ ไม่ตีความ) — รูปแบบที่
 * เลือกคือ query string เพราะอ่านออกด้วยตาตอน debug และแยก field ได้โดยไม่ต้องมี schema
 *
 * ข้อบังคับ: pure — ห้าม import prisma/storage (ถูกเรียกจาก webhook route ที่ต้องตอบ 200 เร็ว)
 */

/** LINE จำกัด postback.data ที่ 300 ตัวอักษร — ข้อความที่เราประกอบก็ไม่ควรยาวกว่าที่บับเบิลอ่านไหว */
const MAX_LABEL = 120

/**
 * แปลง `params` ของ datetimepicker เป็นข้อความ — LINE ส่งกลับมาเป็น key ใดคีย์หนึ่งใน 3 ตัวนี้
 * ตาม `mode` ที่เราตั้งไว้ตอนสร้างปุ่ม (`datetime` / `date` / `time`)
 */
function describeParams(params?: Record<string, unknown>): string | null {
  if (!params) return null
  for (const key of ['datetime', 'date', 'time'] as const) {
    const v = params[key]
    if (typeof v === 'string' && v) return v
  }
  return null
}

/**
 * ข้อความที่จะบันทึกเป็นบับเบิลขาเข้าในเธรด
 *
 * ลำดับความสำคัญ: `label` ที่เราแนบมากับ data (อ่านง่ายที่สุด) → `action` → data ดิบ
 * 🛑 ต้องคืนข้อความที่ไม่ว่างเสมอ — บับเบิลว่างในเธรดคือสิ่งที่ผู้ขายตีความไม่ได้เลยว่าเกิดอะไรขึ้น
 * (บทเรียนเดียวกับ placeholder ของสื่อที่ mirror ไม่ผ่าน — TFR-LINE-09)
 */
export function describeLinePostback(data: string, params?: Record<string, unknown>): string {
  let label = ''
  try {
    const qs = new URLSearchParams(data)
    label = (qs.get('label') || qs.get('action') || '').trim()
  } catch {
    // data ที่ไม่ใช่ query string (ปุ่มที่สร้างจากที่อื่น เช่น rich menu ที่ตั้งค่าใน LINE OA Manager)
    label = ''
  }

  const picked = describeParams(params)
  const head = label || data.trim()
  const text = picked ? `${head} (${picked})` : head

  return `ลูกค้าแตะปุ่ม: ${text.slice(0, MAX_LABEL)}`
}
