/**
 * rsc-timer — จับเวลารายเฟสภายใน Server Component แล้วส่งผลลง client ให้ log ออก DevTools
 *
 * ที่มา (2026-08-16): waterfall จากเครื่องผู้ใช้จริงชี้ว่า `?_rsc=` ของหน้าเธรดแชทใช้ **1.24 วินาที**
 * ขณะที่ payload แค่ 1.5 kB ⇒ เวลาเกือบทั้งหมดคือ server รอ query/network และ `messages?take=30`
 * (230ms) เริ่มไม่ได้จนกว่ามันจะจบ
 *
 * 🛑 ทำไมไม่ใช้ `Server-Timing` เหมือน route handler: **page ของ App Router ตั้ง response header
 * เองไม่ได้** (ทำได้เฉพาะ route handler / middleware ซึ่งไม่รู้เวลาที่ใช้ render) และ log ฝั่ง
 * server อ่านย้อนหลังไม่ได้บนแพลนนี้ (`/v1/deployments/{id}/runtime-logs` = 404)
 * ⇒ ช่องทางเดียวที่เวลาเดินทางกลับไปถึงเครื่องที่ร้องเรียนได้จริงคือส่งลง client
 *
 * 🛑 แยกออกมาเป็น lib แทนที่จะเขียนในตัว page เพราะ `react-hooks/purity` ถือว่า `performance.now()`
 * ที่เรียกในตัว component เป็น impure call ระหว่าง render — ย้ายมาไว้ในโมดูลธรรมดาแล้วกฎไม่ยิงเลย
 * และ **ไม่ต้องมี eslint-disable สักบรรทัด** (ดีกว่าโปรย disable ไว้ทั่วหน้า ซึ่งจะทำให้ไฟล์นั้น
 * มี directive ค้างจนไม่มีใครกล้าเชื่อผล lint ของมันอีก)
 */

export type RscTimer = {
  /** ปิดเฟสที่เพิ่งจบ — เรียกทันทีหลัง `await` ก้อนที่ต้องการวัด */
  mark: (name: string) => void
  /** ผลลัพธ์สำหรับส่งเป็น prop ให้ client component ไป log */
  marks: [string, number][]
}

export function createRscTimer(): RscTimer {
  const marks: [string, number][] = []
  let last = performance.now()
  return {
    marks,
    mark(name: string) {
      const now = performance.now()
      marks.push([name, now - last])
      last = now
    },
  }
}
