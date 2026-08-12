/**
 * stub ของแพ็กเกจ `server-only` สำหรับ vitest
 *
 * แพ็กเกจนั้นเป็น guard ตอน build ของ Next: ตัว entry ฝั่ง "client" มีแค่ `throw new Error(...)`
 * เพื่อให้ bundler ระเบิดถ้ามีใครเผลอ import โมดูล server เข้า client component
 * vitest ไม่ได้เป็น Next bundler จึง resolve ไปเจอ entry ตัวนั้นแล้ว **ไฟล์เทสตายทั้งไฟล์ตั้งแต่ import**
 * ("This module cannot be imported from a Client Component module") ซึ่งไม่เกี่ยวกับสิ่งที่เทสจะทดสอบเลย
 *
 * 🛑 ทำเป็น stub ว่าง ไม่ใช่ปิด guard: กติกา server-only ยังบังคับจริงตอน `next build` เหมือนเดิม
 * ที่ตัดออกคือเฉพาะใน test runner ซึ่งไม่มีเส้นแบ่ง client/server ให้ปกป้องอยู่แล้ว
 */
export {}
