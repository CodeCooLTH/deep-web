import type { Metadata } from 'next'

/**
 * ไอคอนของเว็บ Deep — **นิยามเดียวของทั้งระบบ** (Hard Rule 16)
 *
 * ## ทำไมต้องรวมไว้ที่เดียว
 *
 * 🛑 ก่อนหน้านี้ favicon ถูกประกาศแยกกัน 2 ที่ และ **ทั้งคู่เป็นโลโก้ของธีม ไม่ใช่ของ Deep**:
 *   · `(marketing)/layout.tsx` → `/icon.svg` = ตัว **"V" ของ Vuexy** บนพื้นม่วง `#7367F0`
 *   · `(paces)/layout.tsx`     → `paces-favicon.ico` = ตัว **"H" ของธีม Paces**
 *
 * ผลคือผู้ใช้เห็นโลโก้คนละตัวกันเมื่อสลับระหว่าง `deepthailand.app` กับ `seller.deepthailand.app`
 * และไม่มีที่ไหนเป็นแบรนด์ Deep เลย — คลาสเดียวกับที่ Apple ตีกลับ build 1.0(3) ด้วย
 * Guideline 2.3.8 (ส่ง asset ที่เป็น template ของธีมออกไปโดยไม่ได้เปลี่ยน)
 *
 * ## ทำไมประกาศ `icons` ตรง ๆ แทนที่จะพึ่ง file convention ของ Next
 *
 * `src/app/favicon.ico` + `src/app/apple-icon.png` ทำงานเองก็จริง **แต่ `metadata.icons` ที่ประกาศ
 * ใน layout ชนะเสมอ** — รีโปนี้มี layout ที่ประกาศไว้ทั้ง 2 route group และไม่มี root layout ให้
 * ยึดเป็นตัวกลาง ⇒ ถ้าลบ override ทิ้งเฉย ๆ จะกลายเป็นการพึ่งพฤติกรรมที่ยืนยันไม่ได้จากการอ่านโค้ด
 * วิธีนี้ตรวจได้ด้วยตาว่า layout ไหนชี้ไปที่ไหน
 *
 * ## ข้อกำหนดของไฟล์ (ห้ามแก้จากความจำ — สร้างด้วย `scripts/generate-web-icons.mjs`)
 *
 * 🛑 `apple` **ต้องเป็น PNG ที่ไม่มี alpha channel** — iOS ดูว่า "มีแชนเนล alpha ไหม" ไม่ได้ดูว่า
 * โปร่งจริงไหม ไฟล์ที่ทึบทุกพิกเซลแต่ยังพกแชนเนลมา เสี่ยงถูก composite เป็นพื้นดำบนหน้าจอโฮม
 */
export const SITE_ICONS: Metadata['icons'] = {
  icon: '/favicon.ico',
  apple: '/deep-icon-180.png',
}
