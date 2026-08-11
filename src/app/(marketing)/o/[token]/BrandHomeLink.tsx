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
 * 🛑 ใช้ `VuexyLogo` + `themeConfig.templateName` ไม่ใช่ `@components/layout/shared/Logo`
 * — ตัวนั้นพก state ยุบ/กาง sidebar ซึ่งไม่มีความหมายบนหน้าสาธารณะ สองบรรทัดนี้คือสิ่งที่
 * มัน render อยู่ข้างในพอดี (ก็อปแพตเทิร์นเดียวกับ `ProfileHero.tsx` ไม่ตั้งของใหม่)
 *
 * Base: src/views/pages/user-profile/v2/ProfileHero.tsx (พิลตราแบรนด์บนปก — E1)
 */
import NextLink from 'next/link'

import VuexyLogo from '@core/svg/Logo'
import themeConfig from '@configs/themeConfig'

export default function BrandHomeLink({ className = '' }: { className?: string }) {
  return (
    <NextLink
      href='/'
      aria-label={`${themeConfig.templateName} — กลับหน้าแรก`}
      /* p-2.5 เป็น hit-area ที่มองไม่เห็น ดัน tap target รวมให้ถึง 44px ตามเกณฑ์ AA
         ขณะที่พิลที่ตาเห็นยังสูงราว 30px (ไม่ให้แย่งสายตาไปจากชื่อร้าน) */
      className={`p-2.5 no-underline ${className}`}
    >
      <span className='inline-flex items-center gap-1.5 rounded-full plb-1.5 pli-3 bg-[var(--mui-palette-background-paper)] shadow-sm'>
        <VuexyLogo className='text-primary' style={{ fontSize: 16 }} />
        <span className='text-[13px] font-bold text-[var(--mui-palette-text-primary)]'>
          {themeConfig.templateName}
        </span>
      </span>
    </NextLink>
  )
}
