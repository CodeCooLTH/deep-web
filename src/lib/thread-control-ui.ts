/**
 * thread-control-ui — แปลผลของการขอสิทธิ์คุมเธรดจาก Meta เป็น "หน้าจอทำอะไร"
 *
 * ทำไมต้องเป็นฟังก์ชันบริสุทธิ์แยกไฟล์ ไม่ใช่ if/else ในตัว component: ค่าที่ตัดสินคือ
 * **ปลดล็อกช่องพิมพ์ไหม** ซึ่งถ้าเขียนกลับด้านแล้วจะไม่มีอะไรจับได้เลย (`tsc`/build/theme-guard
 * ผ่านหมดเพราะ boolean ถูกชนิดทุกประการ) — เกณฑ์ตาม `docs/conventions/ui-boolean-needs-a-testable-home.md`
 * และคำที่ผู้ขายเห็นก็ต้องมีที่อยู่เดียวตาม HR16
 *
 * 🛑 **`REQUESTED` ไม่ใช่ "เกือบสำเร็จ" — มันคือ "ไม่สำเร็จ"** พิสูจน์บน prod 2026-08-26:
 * `request_thread_control` ตอบ `success:true` (Meta *รับคำขอ*) แล้วข้อความที่ส่งตามไป 25 วินาที
 * ต่อมายังโดน `(#10) another app is controlling this thread` และไม่มี event ตอบกลับจากเจ้าของ
 * เธรด (Page Inbox ของ Meta) เข้ามาเลยสักตัว ⇒ เจ้าของเธรดไม่มีตัวตอบคำขอ
 *
 * เดิมสถานะนี้ปลดล็อกช่องพิมพ์พร้อมแถบเหลือง "อาจส่งไม่ผ่าน" ด้วยเหตุผลว่า *"อาจส่งผ่าน ดีกว่า
 * บล็อกทั้งที่อาจส่งได้"* — เหตุผลนั้นใช้ได้ตอนที่ยังไม่รู้ผล พอรู้แล้วว่าไม่มีทางผ่าน การเปิดช่อง
 * พิมพ์กลายเป็นการเชิญให้ผู้ขายพิมพ์ทิ้ง ซึ่งคืออาการเดียวกับบั๊กที่ฟีเจอร์นี้ถูกสร้างมาแก้
 *
 * ยังยิง `request_thread_control` ต่อไป (เป็นช็อตเดียวที่มีเมื่อ `take` ถูกบล็อก) และยังแยกค่า
 * `REQUESTED` ไว้ใน `ChatHandoverEvent` — วันที่ Meta เริ่มตอบคำขอจริง จะเห็นจากตารางนั้นก่อน
 * แล้วค่อยกลับมาแก้ไฟล์นี้ที่เดียว
 */

/** ต้องตรงกับ `ConversationControlResult['outcome']` ฝั่ง service */
export type ThreadControlOutcomeName = 'TAKEN' | 'REQUESTED' | 'FAILED'

export type ThreadControlUiState = {
  /** ปลดล็อกช่องพิมพ์ให้ส่งข้อความได้ไหม */
  unlocked: boolean
  /** แสดงบล็อกแดงพร้อมทางออกไป Business Suite ไหม */
  blocked: boolean
  toast: string
  toastTone: 'success' | 'error'
}

export function describeThreadControlOutcome(outcome: ThreadControlOutcomeName): ThreadControlUiState {
  if (outcome === 'TAKEN') {
    return {
      unlocked: true,
      blocked: false,
      toast: 'ได้สิทธิ์ควบคุมแชทนี้แล้ว พิมพ์ตอบลูกค้าได้ตามปกติ',
      toastTone: 'success',
    }
  }
  if (outcome === 'REQUESTED') {
    return {
      unlocked: false,
      blocked: true,
      // ต่างจาก FAILED ตรง *คำอธิบายว่าเกิดอะไรขึ้น* เท่านั้น — สิ่งที่ผู้ขายต้องทำต่อเหมือนกันเป๊ะ
      toast: 'Meta รับคำขอแล้วแต่ยังไม่ให้สิทธิ์ — ต้องรับดูแลแชทเองที่ Business Suite',
      toastTone: 'error',
    }
  }
  return {
    unlocked: false,
    blocked: true,
    toast: 'Meta ปฏิเสธคำขอควบคุมแชทนี้',
    toastTone: 'error',
  }
}
