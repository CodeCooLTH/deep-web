'use client'

/**
 * RscTiming — โยนเวลาที่ RSC ของหน้าเธรดใช้ไปในแต่ละเฟส ออกมาที่ console ของเบราว์เซอร์
 *
 * ที่มา (2026-08-16): waterfall จากเครื่องผู้ใช้จริงชี้ว่า `?_rsc=` ของหน้านี้ใช้ **1.24 วินาที**
 * ขณะที่ payload แค่ 1.5 kB ⇒ เวลาเกือบทั้งหมดคือ server รอ query/network ไม่ใช่การส่งข้อมูล
 * และ `messages?take=30` (230ms) **เริ่มไม่ได้จนกว่าตัวนี้จะจบ** เพราะ ChatThread ไม่ได้รับ
 * ข้อความมาจาก server เลย ต้อง mount ก่อนถึงจะยิงเอง
 *
 * 🛑 ทำไมไม่ใช้ `Server-Timing` เหมือน `/api/chat/.../messages`: **page ของ App Router ตั้ง
 * response header เองไม่ได้** (ทำได้เฉพาะ route handler / middleware ซึ่งไม่รู้เวลาที่ใช้ render)
 * และ `console.log` ฝั่ง server ก็อ่านย้อนหลังไม่ได้บนแพลนนี้ (`runtime-logs` = 404) — ช่องทางเดียว
 * ที่เวลาเดินทางกลับไปถึงเครื่องที่ร้องเรียนได้จริงคือส่งลง client แล้ว log
 *
 * 🛑 **เปิดด้วย `?debug=timing` เท่านั้น** — ปกติ component นี้ไม่ถูก render เลยสักครั้ง
 * (page เช็ค searchParams ก่อนตัดสินใจ render) จึงไม่มีต้นทุนและไม่มีอะไรหลุดไปหาผู้ขายทั่วไป
 */
import { useEffect } from 'react'

export default function RscTiming({ marks }: { marks: [string, number][] }) {
  useEffect(() => {
    const total = marks.reduce((sum, [, ms]) => sum + ms, 0)
    // eslint-disable-next-line no-console -- นี่คือช่องทางส่งผลวัดกลับไปหาคนที่กำลังดู DevTools อยู่
    console.log(
      `[rsc-timing] total=${total.toFixed(1)}ms\n` +
        marks
          .slice()
          .sort((a, b) => b[1] - a[1])
          .map(([name, ms]) => `  ${ms.toFixed(1).padStart(8)}ms  ${name}`)
          .join('\n'),
    )
  }, [marks])
  return null
}
