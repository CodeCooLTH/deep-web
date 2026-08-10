/**
 * Layout ของหน้าออเดอร์สาธารณะ `/o/{token}` — feature 00041 (FR-019)
 *
 * Base: src/app/(marketing)/(buyer-app)/layout.tsx (FrontLayout shell) — ยกเฉพาะส่วน chrome
 *
 * ก่อนหน้านี้เส้นทางนี้ **ไม่มี layout ของตัวเองเลย** จึงไม่มี header/footer — ผู้ซื้อที่เพิ่ง
 * ล็อกอินสำเร็จมาถึงหน้านี้แล้วไปไหนต่อไม่ได้ ต้องกดย้อนกลับหรือพิมพ์ URL เอง
 *
 * 🛑 สองจุดที่ตัดสินต่างจาก UX-Design-Spec โดยตั้งใจ (บันทึกไว้ให้ทบทวนตอน review):
 *
 * 1. **ไม่สร้าง header เวอร์ชัน "เบา" แยกสำหรับ guest** — spec เสนอให้ strip `FrontMenu`
 *    ออกโดยให้เหตุผลว่า "guest ไม่มีเมนูให้กด" แต่เปิดโค้ดแล้วพบว่า `Header` เดิมแยกสองสถานะ
 *    ให้อยู่แล้ว (guest → ปุ่มเข้าสู่ระบบ/สมัคร · authed → แจ้งเตือน + เมนูบัญชี) และ
 *    `FrontMenu` คือเมนูของเว็บ (หน้าแรก/ราคา) ที่ guest กดได้จริงและ *ควร* กดได้ —
 *    คนที่กำลังชั่งใจว่า "Deep นี่ของจริงไหม" คือคนที่ได้ประโยชน์จากการเดินดูเว็บที่สุด
 *    การสร้าง component ใหม่จากศูนย์เพื่อตัดเมนูออกยังขัด HR1 ด้วย
 *
 * 2. **ไม่ใส่ `AccountSidebar`** ที่ spec เสนอไว้สำหรับผู้ที่ล็อกอินแล้ว — layout นี้ครอบ
 *    *ทุกสถานะ* ของเส้นทางนี้ รวมหน้ากรอก OTP (`ClaimOtpPrompt`/`PhoneVerifyPrompt`) และ
 *    หน้าที่ถูกบล็อก (`OrderAccessBlock`) ซึ่งเป็นจอที่ต้องการโฟกัสเดียว การมีเมนูบัญชี
 *    ขนาบข้างจอกรอก OTP จะกลายเป็นสิ่งรบกวนที่ไม่มีใครขอ — FR-019 ต้องการแค่ "ออกไปหน้าอื่นได้"
 *    ซึ่ง header ให้ครบแล้ว
 */
import type { ChildrenType } from '@core/types'
import FrontLayout from '@components/layout/front-pages'

export default function PublicOrderLayout({ children }: ChildrenType) {
  // solidHeader: หน้านี้ไม่มี hero โปร่งแบบ landing — header ต้องทึบตั้งแต่แรกไม่ต้องรอ scroll
  return <FrontLayout solidHeader>{children}</FrontLayout>
}
