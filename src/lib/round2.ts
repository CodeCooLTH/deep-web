// round2.ts — ปัดทศนิยม 2 ตำแหน่งสำหรับ "เงิน" ทั้งระบบ (SSOT เดียว — HR16)
//
// `+ Number.EPSILON` ก่อนคูณ 100 จำเป็นจริง ไม่ใช่ของประดับ: `Math.round(1.005 * 100)`
// ได้ 100 (ไม่ใช่ 101) เพราะ 1.005 เก็บใน binary float เป็น 1.00499999999999989
//
// 🛑 ห้ามเขียนสูตรนี้ซ้ำที่อื่น — มีเทสสแกนซอร์ส `[blocker]` บังคับอยู่
// (`src/lib/__tests__/round2-single-definition.test.ts`)
//
// ประวัติ: เคยมีสำเนา 8 ชุดทั่วรีโป (order.service ×2 · order-payment · pnl.service ·
// agent-performance · auto-order-reasons · CartPanel · OrderCreateForm) — 00061 ย้ายฝั่ง
// backend มาที่นี่ครบทั้ง 6 ชุด
//
// ⚠️ ยังเหลือ 2 ชุดที่ยังไม่ย้าย: `CartPanel.tsx` และ `OrderCreateForm.tsx` (ฝั่ง frontend
// ซึ่งการแตะไฟล์ต้องผ่าน ux gate ตาม Hard Rule 8) — ทั้งคู่เป็น "ตัวคำนวณตัวอย่างบนหน้าจอ"
// ที่ไม่ใช่ค่าที่ถูกบันทึก ⇒ drift จะแสดงเป็นตัวเลขพรีวิวเพี้ยน ไม่ใช่ยอดเงินที่ผิดในฐาน
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
