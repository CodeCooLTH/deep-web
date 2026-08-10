/**
 * pickBeepTarget — "รายการแชทชุดนี้มีข้อความใหม่ที่ควรมีเสียงไหม" (SSOT ของเกณฑ์)
 *
 * ที่มา (user report 2026-08-10): "เปิดเข้ามา แต่ unread 0 แล้วนะ ก็คืออ่านไปหมดละ มันยังมีเสียง
 * ตามมาว่า 'ตอบแชทจ้า'" — เกณฑ์เดิมฝังอยู่กลาง callback ของ `setItems` ใน `InboxList.tsx` และเขียนว่า
 * "ไม่มีในลิสต์ก่อนหน้า **หรือ** เวลาข้อความล่าสุดขยับ = มีข้อความใหม่"
 *
 * 🛑 กิ่งแรก (`!before`) ตั้งอยู่บนสมมติฐานเงียบ ๆ ว่า `prev` เป็นแถวของ **ตัวกรองชุดเดียวกัน**
 * ซึ่งไม่จริงทุกครั้งที่ผู้ใช้สลับแท็บ/เปลี่ยนตัวกรอง/พิมพ์ค้นหา/สลับร้าน — ตอนนั้น `prev` เป็นแถวของ
 * ลิสต์คนละชุด **ทุกแถวในผลลัพธ์ใหม่จึงดู "ไม่เคยมี" พร้อมกันหมด** แล้วเสียงดังทั้งที่ไม่มีข้อความใหม่เลย
 * สักข้อความ (และเป็นเสียงพูดว่า "ตอบแชทจ้า" ซึ่งสั่งให้ผู้ใช้ไปทำสิ่งที่ไม่มีอยู่จริง)
 *
 * เงื่อนไข `comparable` ถูกคำนวณอยู่แล้วในไฟล์นั้นเพื่อกันแถวข้ามตัวกรองมาปนตอน merge (`base`) —
 * เป็นคำถามเดียวกันเป๊ะ ("prev ชุดนี้เอามาเทียบได้ไหม") แต่ไม่เคยถูกใช้กับเสียง
 *
 * ทำไมต้องยกออกมาเป็นฟังก์ชัน: ตรรกะนี้เป็น boolean ที่ตัดสินว่าจะเกิดเสียงหรือไม่ ถ้าเขียนกลับด้าน
 * หรือลืมกิ่งใดกิ่งหนึ่ง **ไม่มี gate ไหนของโปรเจกต์จับได้เลย** (tsc/build/detector ผ่านหมด เพราะมันเป็น
 * boolean ที่ถูกต้องตามชนิดทุกประการ) — `docs/conventions/ui-boolean-needs-a-testable-home.md`
 */

export interface BeepCandidate {
  id: string
  shopId: string
  /** 'BUYER' = ลูกค้าเป็นคนพูดล่าสุด — ข้อความที่ร้านส่งเองต้องไม่มีเสียง */
  lastSenderRole: string | null
  /** ISO string */
  lastMessageAt: string
}

export interface BeepBaselineRow {
  id: string
  lastMessageAt: string
}

export function pickBeepTarget(input: {
  /**
   * `prev` ที่ส่งเข้ามาเป็นแถวของ "ลิสต์ชุดเดียวกัน" กับ `items` หรือไม่
   * false = ยังไม่มีฐานให้เทียบ (เพิ่งสลับตัวกรอง/แท็บ/ค้นหา) → **ห้ามมีเสียง** ไม่ว่ากรณีใด
   */
  comparable: boolean
  items: BeepCandidate[]
  previous: BeepBaselineRow[]
}): BeepCandidate | undefined {
  if (!input.comparable) return undefined
  const prevById = new Map(input.previous.map((p) => [p.id, p]))
  return input.items.find((it) => {
    if (it.lastSenderRole !== 'BUYER') return false
    const before = prevById.get(it.id)
    // ไม่มีในลิสต์เดิม (ที่เทียบกันได้) = ลูกค้าใหม่เพิ่งทักครั้งแรก → ต้องมีเสียง
    if (!before) return true
    // เธรดเดิมที่เวลาข้อความล่าสุดขยับ = มีข้อความใหม่จริง
    return new Date(it.lastMessageAt).getTime() > new Date(before.lastMessageAt).getTime()
  })
}
