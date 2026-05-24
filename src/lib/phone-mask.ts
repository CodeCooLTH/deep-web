/**
 * maskPhone — ซ่อนเลขกลางของเบอร์โทรศัพท์ไทย (10 หลัก)
 *
 * เหตุผล: client ต้องการแสดงเบอร์แบบบางส่วนเพื่อให้ผู้ใช้ยืนยันว่าใช่เบอร์ตัวเอง
 * โดยไม่เปิดเผยเบอร์เต็มบน UI (ส่วนเต็มส่งเฉพาะ endpoint ที่ signIn/send OTP ต้องการ)
 *
 * รูปแบบ: 3 หลักแรก + "-xxx-" + 4 หลักสุดท้าย
 * ตัวอย่าง: '0812345678' → '081-xxx-5678'
 *
 * ถ้าเบอร์ไม่ครบ 10 หลักหรือไม่ใช่ตัวเลขล้วน → คืน "***" (fail-safe)
 */
export function maskPhone(phone: string): string {
  // รับเฉพาะตัวเลข 10 หลัก — ถ้าไม่ตรง pattern คืน placeholder
  if (!/^\d{10}$/.test(phone)) return '***'
  const first3 = phone.slice(0, 3)
  const last4 = phone.slice(6)
  return `${first3}-xxx-${last4}`
}
