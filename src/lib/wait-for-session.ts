/**
 * wait-for-session — ยืนยันว่า session "มองเห็นแล้วจริง" ก่อนพาไปหน้าถัดไป (แก้ 2026-09-17)
 *
 * ## ปัญหาที่แก้
 *
 * ล็อกอินด้วยรหัสผ่าน (`appreview`) แล้ว **ไม่พาเข้าไป ต้องรีเฟรชเอง** (หัวหน้าเจอบน iPhone)
 *
 * `signIn(..., { redirect: false })` คืน `ok: true` ทันทีที่เซิร์ฟเวอร์ตอบ — แต่ `ok` แปลว่า
 * **"เซิร์ฟเวอร์ยอมรับรหัสผ่าน"** ไม่ได้แปลว่า **"เบราว์เซอร์เก็บคุกกี้ลงแล้ว"**
 * ⇒ `router.push('/dashboard')` ที่ตามมาทันที อาจยิงคำขอที่ยังไม่มีคุกกี้ ⇒ proxy เตะกลับ
 *
 * เป็นตระกูลเดียวกับบั๊ก Apple ที่แก้ไปเมื่อ #66 — ต่างกันแค่ทางเข้า (Apple เดินผ่านหน้ารอ
 * ที่ถาม session อยู่แล้ว ส่วนรหัสผ่านยิง `push` ตรง ๆ)
 *
 * ## วิธี
 *
 * ถาม session จากเซิร์ฟเวอร์จริง ๆ (คำขอแยก) จนกว่าจะเห็น แล้วค่อยไปต่อ
 *
 * 🛑 **ต้องมีเพดาน ห้ามวนไม่รู้จบ** — ถ้าถามครบแล้วยังไม่เห็น ต้องคืนค่าให้ผู้เรียกไปต่อได้
 * ไม่ใช่ค้างอยู่กับหน้าจอที่ไม่มีอะไรเกิดขึ้น (ผู้ใช้กดปุ่มแล้วต้องได้ผลลัพธ์เสมอ)
 */

/** คืน `true` เมื่อเห็น session · `false` เมื่อถามครบเพดานแล้วยังไม่เห็น */
export async function waitForSession(
  getSession: () => Promise<unknown>,
  {
    retries = 3,
    delayMs = 250,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  }: {
    retries?: number
    delayMs?: number
    sleep?: (ms: number) => Promise<void>
  } = {},
): Promise<boolean> {
  /* ถามอย่างน้อย 1 ครั้งเสมอ แม้ตั้ง retries = 0 */
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let session: unknown = null
    try {
      session = await getSession()
    } catch {
      /* เน็ตสะดุดชั่วคราว — ถือว่ายังไม่เห็น แล้วลองใหม่ตามเพดาน */
      session = null
    }
    if (session) return true
    if (attempt < retries) await sleep(delayMs)
  }
  return false
}
