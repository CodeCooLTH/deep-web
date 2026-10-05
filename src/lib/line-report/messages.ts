/**
 * messages.ts — ข้อความที่บอทตอบในกลุ่ม LINE (ไทยล้วน · ห้ามราคา/฿/ลิงก์สมัคร/คำว่า SafePay)
 * ใช้ร่วมได้ทั้งแอป iOS/Android — ไม่มี CTA ซื้อ
 */

/** 🛑 ข้อความเดียวสำหรับ "ผิด/หมดอายุ/ใช้แล้ว/โดนจำกัดรอบ/ตรวจซ้ำไม่ผ่าน" — ต้องเหมือนกันทุกตัวอักษร (AC-06-4) */
export const BIND_FAILED_MESSAGE =
  'ผูกกลุ่มไม่สำเร็จ โค้ดไม่ถูกต้องหรือหมดอายุ กรุณาสร้างโค้ดใหม่ที่ Deep แล้วลองอีกครั้ง'

export const GREETING_MESSAGE =
  'สวัสดีครับ ผมคือบอทรายงานสรุปยอดของ Deep\nเจ้าของร้านสร้างโค้ดผูกกลุ่มที่ Deep แล้วพิมพ์ในกลุ่มนี้ว่า ผูก ตามด้วยโค้ด 8 ตัว เช่น ผูก ABCD-1234'

export function bindSuccessMessage(groupName: string, shopNames: readonly string[]): string {
  const name = groupName ? `กลุ่ม "${groupName}"` : 'กลุ่มนี้'
  return `ผูก${name}สำเร็จแล้ว\nร้านที่รวมในรายงาน: ${shopNames.join(', ')}\nพิมพ์ สรุปวันนี้ หรือ สรุปเดือนนี้ เพื่อดูยอดได้ทุกเมื่อ`
}

export const ALREADY_BOUND_SELF_MESSAGE = 'กลุ่มนี้ผูกกับบัญชีของคุณอยู่แล้ว'
export const ALREADY_BOUND_OTHER_MESSAGE = 'กลุ่มนี้ผูกกับบัญชีอื่นอยู่แล้ว ผูกซ้ำไม่ได้'
export const NOT_BOUND_MESSAGE =
  'กลุ่มนี้ยังไม่ได้ผูกกับร้านใน Deep เจ้าของร้านสร้างโค้ดผูกกลุ่มที่ Deep แล้วพิมพ์ ผูก ตามด้วยโค้ด 8 ตัวในกลุ่มนี้'
export const COMMAND_RATE_LIMITED_MESSAGE = 'ถามถี่เกินไป กรุณารอสักครู่แล้วลองใหม่'
export const PACKAGE_PAUSED_MESSAGE = 'รายงานของกลุ่มนี้หยุดส่งชั่วคราว'
export const FINAL_NOTICE_MESSAGE =
  'รายงานสรุปยอดของกลุ่มนี้หยุดส่งชั่วคราว เมื่อเจ้าของร้านกลับมาใช้งานได้ รายงานจะส่งต่อโดยอัตโนมัติ'
export const SINGLE_CHAT_HELP_MESSAGE = 'บอทนี้ทำงานในกลุ่ม LINE — ตั้งค่าที่ Deep'
