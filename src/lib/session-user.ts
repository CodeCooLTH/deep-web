/**
 * sessionUserId — SSOT ของคำถาม "คำขอนี้รู้ไหมว่าเป็นใคร"
 *
 * 🛑 บั๊กที่ไฟล์นี้ถูกสร้างขึ้นมาปิด (user เจอบน prod 2026-08-11, digest 3758181775):
 * `session` callback ใน `lib/auth.ts` เติม `user.id` ให้เฉพาะตอน `token.userId` มีค่า **และ**
 * หาแถว `User` เจอจริง (`if (token.userId)` + `if (user)`) — โทเคนที่ออกก่อนมีฟิลด์นั้น หรือ
 * ผู้ใช้ที่ถูกลบ/purge จะได้ object session ที่ **ไม่เป็น null แต่ไม่มี id**
 *
 * ทั่วทั้งโปรเจกต์เขียนกันว่า `if (!session?.user) <ปฏิเสธ>` แล้วตามด้วย
 * `(session.user as { id: string }).id` ซึ่ง **cast คือสิ่งที่ปิดตา**: TypeScript เชื่อทุกตัวอักษร
 * จึงไม่มี gate ไหนเห็น แต่ runtime ได้ `undefined` แล้วไหลเข้า `prisma.…({ where: { id: undefined } })`
 * ⇒ throw ⇒ ทั้งหน้าเป็น 500 (หน้า `/o/[token]` พังแบบนี้จริงมาแล้ว)
 *
 * กติกาที่ถูกคือ **"มี session" ≠ "รู้ว่าเป็นใคร"** — ด่านต้องตรวจสิ่งที่จะเอาไปใช้จริง (id)
 * ไม่ใช่ตรวจกล่องที่ห่อมันอยู่ (session/user) แล้วเดาว่าข้างในครบ
 *
 * คืน `null` = ปฏิบัติเหมือนไม่ได้ล็อกอิน (ผู้เรียกตัดสินเองว่าจะ 401 / redirect / ตกไปจอ guest)
 * — ห้ามคืนสตริงว่างหรือ throw: ทั้งสองอย่างจะกลายเป็น 500 หรือ query ที่ match ไม่เจอเงียบ ๆ
 */
export function sessionUserId(session: unknown): string | null {
  const id = (session as { user?: { id?: unknown } } | null | undefined)?.user?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
