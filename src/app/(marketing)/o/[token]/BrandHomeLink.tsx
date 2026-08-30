/**
 * BrandHomeLink — ตราแบรนด์ Deep ที่กดกลับหน้าแรกได้ ใช้ร่วมทุกจอใต้ `/o/[token]`
 *
 * ทำไมต้องมี: เส้นทางนี้เคยมี `layout.tsx` ที่ห่อด้วย `FrontLayout` (header การตลาด + footer)
 * ซึ่งถูกถอดออกแล้ว เพราะ header ของเว็บการตลาดไม่ใช่ chrome ที่เข้ากับหน้าที่ผู้ซื้อกำลัง
 * ตัดสินใจเรื่องเงิน (เมนู "ราคา"/"สมัครสมาชิก" แย่งความสนใจจากหลักฐานของร้าน) แต่สิ่งที่
 * layout ตัวนั้นให้ไว้ถูกอยู่ข้อหนึ่งคือ **ทางออกไปหน้าอื่น** (FR-019) — ถอด chrome ทิ้ง
 * เฉย ๆ โดยไม่คืนทางออก = สร้างบั๊กเดิมกลับมา
 *
 * ตราแบรนด์ยังทำหน้าที่ที่สองด้วย: บอกว่าหน้านี้เป็นหน้าที่ "บุคคลที่สามรับรอง" ไม่ใช่หน้า
 * ที่ร้านทำขึ้นเอง — ถ้าไม่มีเลย หลักฐาน trust ทั้งชุดบนหน้าเสียน้ำหนักไปพร้อมกัน
 * (เหตุผลชุดเดียวกับที่หน้าโปรไฟล์ร้านสาธารณะเพิ่มพิลนี้เข้าไป)
 *
 * 🛑 ใช้ **โลโก้ Deep + `themeConfig.templateName`** ไม่ใช่ `@components/layout/shared/Logo`
 * — ตัวนั้นพก state ยุบ/กาง sidebar ซึ่งไม่มีความหมายบนหน้าสาธารณะ สองบรรทัดนี้คือสิ่งที่
 * มัน render อยู่ข้างในพอดี (ก็อปแพตเทิร์นเดียวกับ `ProfileHero.tsx` ไม่ตั้งของใหม่)
 *
 * Base: src/views/pages/user-profile/v2/ProfileHero.tsx (พิลตราแบรนด์บนปก — E1)
 */
import logoDeepMark from '@/assets/images/logo-deep-mark.png'
import themeConfig from '@configs/themeConfig'

import CoverPill from './CoverPill'

export default function BrandHomeLink({ className = '' }: { className?: string }) {
  return (
    /* 🛑 ทรงพิลมาจาก `CoverPill` ที่เดียว — ห้ามเขียนพื้น/รัศมี/ขนาดตัวอักษรเองอีก
       ปุ่มฝั่งขวาของปกใช้ตัวเดียวกัน ⇒ สองฝั่งเท่ากันเสมอโดยไม่ต้องไล่จูน
       (ดูตารางความต่างที่เคยเกิดขึ้นในหัวไฟล์ `CoverPill`) */
    <CoverPill
      href='/'
      aria-label={`${themeConfig.templateName} — กลับหน้าแรก`}
      className={className}
    >
      {/* โลโก้ Deep ของจริง (เดิมเป็น `VuexyLogo` ของธีม) — มีคำว่า Deep อยู่ข้าง ๆ จึงใช้มาร์ก */}
      {/* eslint-disable-next-line @next/next/no-img-element -- โลโก้ static ที่ import มาแล้ว */}
      <img src={logoDeepMark.src} alt='' className='bs-4 is-auto' />
      {themeConfig.templateName}
    </CoverPill>
  )
}
