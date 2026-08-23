/**
 * profile-sort — การเรียงกริดสินค้าบนหน้าร้านสาธารณะ (feature 00053 TFR-006/TFR-007)
 *
 * ฟังก์ชันบริสุทธิ์ล้วน ไม่มี React ไม่มี Prisma — วางที่นี่เพราะ "boolean/ตรรกะที่ตัดสินว่า UI
 * จะแสดงอะไร ต้องมีบ้านที่เทสจับได้" (docs/conventions/ui-boolean-needs-a-testable-home.md)
 * ตัวเรียงที่เขียนกลับด้านแล้วยังคอมไพล์ผ่านทุกตัวอักษร คือคลาสบั๊กที่ tsc/build/detector
 * มองไม่เห็นเลย — mutation test เป็นด่านเดียวที่จับได้
 */

/**
 * โหมดเรียงของกริด "สินค้าทั้งหมด" บนหน้าร้าน
 *
 * ผู้ใช้เคาะ 2026-08-23 ว่ามีชิปแค่ 2 ตัว (ขายดี · ยอดนิยม) — `DEFAULT` ไม่มีชิปของตัวเอง
 * มันคือสถานะ "ไม่ได้เลือกชิปไหนเลย" ซึ่งเกิดตอนเปิดหน้าครั้งแรกและตอนกดชิปเดิมซ้ำเพื่อยกเลิก
 */
export type ProfileSortMode = 'DEFAULT' | 'BEST_SELLING' | 'POPULAR'

/** ชิปที่ผู้ใช้กดได้จริง — `DEFAULT` ไม่อยู่ในนี้เพราะไม่มีปุ่ม (ดูคอมเมนต์ของ ProfileSortMode) */
export const PROFILE_SORT_CHIPS = ['BEST_SELLING', 'POPULAR'] as const

/**
 * เพดานจำนวนสินค้าที่ดึงมาแสดงในกริด "สินค้าทั้งหมด" ของหน้าร้าน
 *
 * 🛑 ตัวเลขนี้ผูกกับความหมายของชิป ไม่ใช่แค่เรื่อง performance — ก่อนหน้านี้หน้าร้านดึงมา 12 ใบ
 * (เรียงตามวันที่เพิ่ม) ถ้าเอา 12 ใบนั้นมาเรียงตามยอดขายแล้วติดป้ายว่า "ขายดี" ผู้ซื้อจะอ่านว่า
 * "ขายดีของร้านนี้" ทั้งที่จริงคือ "ขายดีในบรรดา 12 ชิ้นที่เพิ่งเพิ่ม" — เลขถูกทุกตัวแต่ความหมายผิด
 * (docs/conventions/partial-data-must-be-labeled-or-filled.md)
 *
 * ถ้าร้านมีสินค้าที่แสดงได้มากกว่านี้ หน้าจอ **ต้องบอก** ว่ากำลังแสดงบางส่วน — ใช้ `isProfileListTruncated()`
 */
export const MAX_PROFILE_PRODUCTS = 48

/**
 * สิ่งที่ตัวเรียงต้องรู้ — ตั้งใจให้แคบที่สุด เพื่อให้เทสสร้าง fixture ได้โดยไม่ต้องพก type ของ UI มาทั้งก้อน
 *
 * 🛑 ทั้งสองช่องเป็น optional เพราะ `SerializedProduct` ประกาศ `likeCount?` ไว้อย่างนั้นจริง
 * (สินค้าที่ serialize ไว้ก่อนมีฟีเจอร์ถูกใจ) — ถ้าบังคับเป็น `number` ที่นี่ TypeScript จะ infer
 * generic ไม่ผ่านแล้วทั้งไฟล์ที่เรียกจะพังเป็นลูกโซ่ · ค่าที่ไม่มีถูกอ่านเป็น 0 ตอนเปรียบเทียบ
 * ซึ่งตรงกับที่การ์ดแสดง (ไม่มียอด = ไม่พิมพ์บรรทัดยอดสะสม)
 */
export type SortableProfileItem = {
  soldCount?: number | null
  likeCount?: number | null
}

/**
 * เรียงรายการตามโหมดที่เลือก — **ไม่แก้ array ต้นฉบับ** และ **เสถียร (stable)**
 *
 * 🛑 ความเสถียรไม่ใช่รายละเอียดตกแต่ง: สินค้าที่ยอดเท่ากันมีเยอะมาก (ร้านใหม่ = 0 ทั้งร้าน)
 * ถ้าตัวเปรียบเทียบให้ผลไม่คงที่ ลำดับการ์ดจะสลับเองทุก re-render ซึ่งอ่านเป็นจอกระตุก
 * `Array.prototype.sort` ของ V8 เป็น stable อยู่แล้ว — comparator จึงต้องคืน 0 เมื่อเท่ากัน
 * ห้าม tie-break ด้วยอย่างอื่น (เช่น ชื่อ) เพราะจะทิ้งลำดับตั้งต้นที่ server จัดมาให้
 */
export function sortProfileProducts<T extends SortableProfileItem>(
  items: readonly T[],
  mode: ProfileSortMode,
): T[] {
  if (mode === 'DEFAULT') return [...items]

  const key: (item: T) => number =
    mode === 'BEST_SELLING' ? (item) => item.soldCount ?? 0 : (item) => item.likeCount ?? 0

  return [...items].sort((a, b) => key(b) - key(a))
}

/**
 * กดชิป → โหมดถัดไป
 *
 * กดชิปที่เลือกอยู่ซ้ำ = ยกเลิกการเลือก กลับไปลำดับตั้งต้น (FR-PPD-14) — จำเป็นเพราะมีแค่ 2 ชิป
 * และไม่มีชิป "ล่าสุด" ให้กดกลับ ถ้าไม่มีทางยกเลิก ผู้ใช้จะติดอยู่กับการเรียงไปตลอดการเยี่ยมชม
 */
export function nextSortMode(current: ProfileSortMode, clicked: ProfileSortMode): ProfileSortMode {
  return current === clicked ? 'DEFAULT' : clicked
}

/**
 * ชุดที่ดึงมาถึงเพดานพอดี = "อาจมีมากกว่านี้" ⇒ ต้องมีป้ายบอกใต้กริด
 *
 * เท่ากับเพดานพอดีอาจแปลว่ามีพอดีจริง ๆ ก็ได้ — ยอมบอกเกินความจำเป็นในเคสนั้น ดีกว่าเงียบในเคส
 * ที่มีของตกหล่นจริง (ผู้ใช้ที่เห็นป้ายแล้วนับได้ครบ เสียแค่ความรำคาญ · ผู้ใช้ที่ไม่เห็นป้ายทั้งที่
 * ของหาย จะสรุปว่าระบบทำของหายแล้วเลิกเชื่อทั้งหน้า)
 */
export function isProfileListTruncated(fetchedCount: number): boolean {
  return fetchedCount >= MAX_PROFILE_PRODUCTS
}
