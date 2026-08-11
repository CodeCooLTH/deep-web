/**
 * chat-reaction-toggle — "กดอิโมจิตัวนี้แล้วผลลัพธ์คืออะไร" ที่เดียวของระบบ (2026-08-11)
 *
 * 🛑 ทำไมต้องเป็นฟังก์ชันแยก ไม่ใช่บรรทัดเดียวใน handler: ค่าที่ฟังก์ชันนี้คืน **คือ body ที่ยิงขึ้น
 * Meta** (`sender_action: react` เมื่อมีค่า / `unreact` เมื่อเป็น null) เขียนผิดเมื่อไหร่คือส่ง
 * "ถอนรีแอ็กชัน" ไปแทน "กดรีแอ็กชัน" ซึ่งฝั่งลูกค้าไม่เห็นอะไรเลยและฝั่งเราลบค่าทิ้ง — อาการที่ได้คือ
 * "กดแล้วขึ้นแป๊บนึงแล้วหาย" ซึ่ง **หน้าตาเหมือนบั๊กการแสดงผล** ทั้งที่เป็นเรื่องของ payload
 * (`docs/conventions/ui-boolean-needs-a-testable-home.md`)
 *
 * บั๊กจริงที่พาให้ต้องมีไฟล์นี้ (user report prod 2026-08-04 แล้วซ้ำอีกครั้ง 2026-08-11):
 * ของเดิมคำนวณค่านี้ **ข้างใน updater ของ `setMessages`** แล้วอ่านออกมาใช้ต่อในบรรทัดถัดไป
 *
 *     let next = null
 *     setMessages(prev => prev.map(m => { next = …; return … }))   // ← updater ยังไม่ถูกเรียก
 *     fetch(…, { body: JSON.stringify({ emoji: next }) })          // ← next ยังเป็น null เสมอ
 *
 * React ไม่เรียก updater ของ `setState` แบบซิงโครนัส ณ จุดที่เรียก — มันถูกเก็บไว้รันตอน render
 * รอบถัดไป บรรทัด `fetch` จึงทำงาน **ก่อน** ค่าจะถูกเขียนทุกครั้ง ผลคือทุกการกดรีแอ็กชันตั้งแต่วันแรก
 * ส่ง `{"emoji": null}` = unreact. UI มองว่าติด (updater รันตอน render จริง) แต่ DB/Meta เป็น null
 *
 * `tsc` มองไม่เห็นเพราะชนิดถูกทุกตัวอักษร (`string | null` ทั้งคู่) และไม่มี error ใด ๆ เกิดขึ้นเลย
 * — รอบก่อนจึงไปแก้ที่ ingestReactionEvent (ผู้เขียนคนที่สอง) ซึ่งไม่ใช่ต้นเหตุ อาการเลยกลับมา
 */

/**
 * @param current อิโมจิที่อยู่บนข้อความนี้ ณ ตอนนี้ (null = ยังไม่มีใครกด)
 * @param tapped  อิโมจิที่เพิ่งกด — ค่าดิบไม่มี variation selector (ตรงกับที่ Meta ส่งมาให้เรา)
 * @returns อิโมจิใหม่ที่จะเก็บ/ยิงไป Meta — `null` แปลว่า "ถอนรีแอ็กชัน" เท่านั้น ห้ามแปลว่า "ไม่รู้"
 */
export function resolveReactionToggle(current: string | null | undefined, tapped: string): string | null {
  // กดตัวเดิมซ้ำ = ถอนออก ตามพฤติกรรม Messenger; กดตัวใหม่ทับของเดิม = เปลี่ยนเป็นตัวใหม่
  return current === tapped ? null : tapped
}
