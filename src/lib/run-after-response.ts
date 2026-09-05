// run-after-response — สั่งงานที่ "ต้องเกิดขึ้น แต่ผู้ใช้ไม่ควรรอ"
//
// ห่อ `after()` ของ Next แทนการเรียกตรง เพราะฟังก์ชันที่ต้องใช้มันอยู่ใน **service** ซึ่งถูก
// เรียกจากทั้ง request handler และจากที่ที่ไม่มี request scope (cron/สคริปต์/เทส) —
// `after()` โยน error เมื่อไม่มี request scope ⇒ เรียกตรงจะทำให้ cron ล้มทั้งรอบ
//
// 🛑 นี่ไม่ใช่ "ยิงแล้วลืม" ที่พึ่งได้ 100% — บน serverless งานที่ลงทะเบียนไว้ถูกฆ่าก่อนจบได้
// ทุกผู้เรียกต้องมีตัวเก็บกวาด (watchdog) เป็น safety net เสมอ ไม่ใช่พึ่งตัวนี้อย่างเดียว
import { after } from 'next/server'

export function runAfterResponse(task: () => Promise<unknown>): void {
  const guarded = () =>
    task().catch((e) => {
      // กลืน error โดยตั้งใจ — งานเบื้องหลังล้มต้องไม่ทำให้สิ่งที่ผู้ใช้เพิ่งทำสำเร็จกลายเป็น error
      // แต่ต้องดังพอให้เห็นใน log (เงียบสนิท = ฟีเจอร์ที่ไม่ทำงานโดยไม่มีใครรู้)
      console.error('[run-after-response] task failed', e)
    })

  try {
    after(guarded)
  } catch {
    // ไม่มี request scope (cron/สคริปต์/เทส) — รันทันทีแบบไม่รอผล
    void guarded()
  }
}
