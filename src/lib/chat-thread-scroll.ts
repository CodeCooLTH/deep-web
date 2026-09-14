import { compareMessages } from '@/lib/chat-message-merge'

/**
 * chat-thread-scroll — การตัดสินใจเรื่องจอของห้องแชท (ส่วนขยาย 00018, 2026-09-14)
 *
 * ทำไมต้องยกออกมาเป็นฟังก์ชัน: boolean ที่ตัดสินว่า UI จะทำหรือไม่ทำอะไร ต้องมีที่ให้เทสจับ
 * (docs/conventions/ui-boolean-needs-a-testable-home.md) — เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม"
 * แต่คือ "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม" ซึ่งเคยพลาดมาแล้วกับปุ่มย่อกลับที่เขียน
 * กลับด้านแล้วผ่านทุก gate (2026-08-09)
 */

/**
 * ข้อความใหม่เข้ามาแล้วควรเลื่อนจอตามไหม — ตามเฉพาะตอนอยู่ล่างสุด (R9, 2026-09-14)
 *
 * 🛑 ไม่มีกิ่ง "ร้านส่งเองให้ตามเสมอ" โดยตั้งใจ — แถว SHOP ใหม่มาจากบอท เพื่อนร่วมทีม echo ของ
 *    Business Suite และ Meta AI ด้วย ถ้าตามทุกใบ คนที่เลื่อนขึ้นไปอ่านของเก่าจะถูกกระชากลงล่าง
 *    ทุกครั้งที่ใครในร้านตอบ · การกดส่งของเราเองเลื่อนลงล่างใน handleSend อยู่แล้ว
 */
export function shouldFollowNewMessages(input: {
  /** จออยู่ล่างสุด (หรือใกล้ล่างสุดในระยะที่ถือว่ากำลังอ่านของล่าสุดอยู่) */
  atBottom: boolean
}): boolean {
  return input.atBottom
}

/**
 * delta คืนครบเพดาน (อาจมีแถวที่ไม่ได้มา) — ต้องโหลดหน้าแรกใหม่แทนที่จอ แต่ **ทำตอนนี้ได้ไหม** (R16)
 *
 * 🛑 ผู้ใช้เลื่อนขึ้นไปอ่านของเก่าอยู่ = เลื่อนการแทนที่ออกไป ห้ามทำทันที — การแทนด้วย 30 ใบใหม่สุด
 *    ลบ DOM ที่ผู้ใช้กำลังอ่านทิ้ง scrollHeight หด scrollTop ถูกบีบ จอเด้ง (ผิด spec §5.4 "ห้ามเด้ง")
 *    และ sentinel บนสุดอาจโผล่แล้วโหลดของเก่าเอง · ขึ้นปุ่ม "ข้อความใหม่" แทน แล้วแทนที่ตอนผู้ใช้
 *    ลงมาถึงล่างสุดเองหรือกดปุ่ม · เคสจริง: กลับมาที่แท็บหลังพักนาน (poll หยุดตอนแท็บซ่อน)
 */
export function shouldDeferFullDeltaReplace(input: { atBottom: boolean }): boolean {
  return !input.atBottom
}

/** sentinel บนสุดถูกมองเห็นแล้ว — โหลดของเก่าต่อได้ไหม */
export function canAutoLoadOlder(input: {
  /**
   * ผู้ใช้เคยเลื่อนจอด้วยตัวเองแล้วอย่างน้อยหนึ่งครั้งในห้องนี้
   * 🛑 ถ้าไม่มีเงื่อนไขนี้ IntersectionObserver จะยิง loadOlder ทันทีที่ mount เมื่อเนื้อหา
   *    ไม่สูงพอจะดัน sentinel ให้พ้นจอ (เธรดสั้น / จอสูง) = โหลดของเก่าเองโดยผู้ใช้ไม่ได้ขอ
   */
  userHasScrolled: boolean
  hasCursor: boolean
  loading: boolean
}): boolean {
  return input.userHasScrolled && input.hasCursor && !input.loading
}

/**
 * แถวที่ "ใหม่จริง" ในชุดที่เพิ่งเข้ามา (R10) — ที่เดียวที่ตัดสินเรื่องนี้ ใช้ทั้งตัวนับปุ่ม "ข้อความใหม่"
 * เสียงเตือน (แถว BUYER ในนี้) และการเลื่อนตาม
 *
 * ใหม่จริง = ไม่เคยอยู่บนจอ **และ** อยู่หลังใบล่าสุดบนจอตามลำดับของเธรด (createdAt แล้ว seq)
 * 🛑 delta คืนแถวเดิมที่ถูกแก้ (รีแอ็กชัน/สถานะส่ง) — นับเข้าไปปุ่มจะชวนเลื่อนลงไปหาของที่ไม่มี
 * 🛑 แถวที่ไล่ดึงย้อนหลังจาก Meta ได้ seq ใหม่แต่เวลาเก่า แทรกกลางเธรด — ไม่ใช่ข้อความใหม่
 *    (นับแล้ว widget จะดังเสียงให้ข้อความลูกค้าเมื่อหลายเดือนก่อน)
 * บับเบิล optimistic (`local-*`) ไม่ใช้เป็นเส้นแบ่ง — เวลาของมันเป็นนาฬิกาเครื่อง client
 */
export function pickNewIncoming<T extends { id: string; createdAt: string; seq?: number }>(
  prev: T[],
  incoming: T[],
): T[] {
  const ids = new Set<string>()
  let newest: T | undefined
  for (const m of prev) {
    ids.add(m.id)
    if (m.id.startsWith('local-')) continue
    if (!newest || compareMessages(m, newest) > 0) newest = m
  }
  return incoming.filter((m) => !ids.has(m.id) && (!newest || compareMessages(m, newest) > 0))
}
