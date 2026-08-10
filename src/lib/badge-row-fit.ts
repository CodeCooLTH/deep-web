/**
 * badgeRowFit — แถวเหรียญบนหัวโปรไฟล์ใส่ได้กี่ใบก่อนล้น
 *
 * 🛑 ทำไมต้องคำนวณ ไม่ใช่ตั้งค่าคงที่: รอบแรกผมเขียนเป็น "มือถือ 3 ใบ / เดสก์ท็อป 5 ใบ" แล้วซ่อน
 * ใบที่เกินด้วยคลาส `hidden sm:block` — ผลคือร้านที่มี 7 เหรียญบนจอ 960px **ขึ้นปุ่มย่อ/กาง
 * ทั้งที่ยังเหลือที่ว่างอีกครึ่งแถว** (user ทัก 2026-08-10: "ทำไมมันมี icon ย่อ ตลอด ทั้ง ๆ ที่
 * ร้านนี้ได้ไม่เต็ม ต้องมีเฉพาะกรณีมันล้นสิ")
 *
 * ต้นเหตุคือผมตอบคำถามผิดข้อ — โจทย์คือ "ล้นไหม" ซึ่งขึ้นกับ *ความกว้างจริงของกล่อง* แต่ผมไป
 * ตอบว่า "จอขนาดไหน" ซึ่งเป็นตัวแทนที่หยาบเกินไป breakpoint บอกได้แค่ว่าจอกว้างเท่าไร ไม่ได้บอก
 * ว่ากล่องที่เหรียญอยู่กว้างเท่าไร (คอนเทนเนอร์มี padding, หน้าถูกจำกัดที่ 960px, และรางแชท
 * ก็เรนเดอร์หน้านี้ในความกว้างของตัวเองได้)
 *
 * ฟังก์ชันบริสุทธิ์แยกไฟล์ + เทส `[blocker]` ตาม docs/conventions/ui-boolean-needs-a-testable-home.md
 * — ตรรกะแบบนี้ถ้าฝังในเทอร์นารีกลาง JSX แล้วเขียนกลับด้าน จะไม่มีอะไรจับได้เลย
 */

/** ความกว้างของช่องเหรียญ 1 ใบ (px) — ต้องตรงกับ `is-[76px]` ที่ ProfileHero ใช้ */
export const BADGE_ITEM_WIDTH = 76;

/** ระยะห่างระหว่างใบ (px) — ต้องตรงกับ `gap-x-3` (0.75rem = 12px) */
export const BADGE_ROW_GAP = 12;

export type BadgeRowFit = {
  /** จำนวนเหรียญที่แสดงได้จริงในแถวเดียว */
  visible: number;
  /** จำนวนที่เหลือ — 0 = ไม่ล้น ห้าม render ปุ่มกาง */
  overflow: number;
};

/**
 * @param containerWidth ความกว้างที่วัดได้จริงของแถว (px) — ส่ง 0 ตอนยังวัดไม่ได้
 * @param total          จำนวนเหรียญทั้งหมดที่ร้านมี
 *
 * 🛑 `containerWidth <= 0` (ตอน SSR หรือเฟรมแรกก่อน ResizeObserver ยิง) คืน "แสดงครบ ไม่ล้น"
 * ไม่ใช่ "ซ่อนไว้ก่อน" — เดาว่าล้นแล้วผิด ผู้ใช้เห็นเหรียญกระพริบหายไปตอนโหลด ส่วนเดาว่าไม่ล้น
 * แล้วผิด ใบที่เกินถูก `overflow-hidden` ของแถวตัดไว้เฉย ๆ จนกว่าจะวัดเสร็จ (ไม่มีอะไรขยับ)
 */
export function badgeRowFit(containerWidth: number, total: number): BadgeRowFit {
  if (total <= 0) return { visible: 0, overflow: 0 };
  if (containerWidth <= 0) return { visible: total, overflow: 0 };

  const slots = Math.max(
    1,
    Math.floor((containerWidth + BADGE_ROW_GAP) / (BADGE_ITEM_WIDTH + BADGE_ROW_GAP)),
  );

  if (total <= slots) return { visible: total, overflow: 0 };

  // ล้นแล้ว — ต้องกันช่องสุดท้ายไว้ให้ปุ่มกาง ไม่งั้นปุ่มจะไปดันใบสุดท้ายตกแถว
  // แล้วกลายเป็นว่า "ปุ่มที่มีไว้กันการตกแถว" เป็นตัวทำให้ตกแถวเสียเอง
  const visible = Math.max(1, slots - 1);
  return { visible, overflow: total - visible };
}
