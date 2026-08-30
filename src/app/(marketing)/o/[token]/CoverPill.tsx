'use client'

/**
 * CoverPill — พิลบนปกของหน้าออเดอร์ `/o/[token]` — **ทรงเดียวสำหรับทุกใบบนปก**
 *
 * 🛑 มีไฟล์นี้เพราะพิลบนปกเคยถูกประกอบแยกกัน 2 ที่ แล้วค่าไม่ตรงกันสักตัว
 * (หัวหน้าทัก 2026-08-30: "ฝั่งซ้ายขวามันไม่เท่ากันปะนะ มันต่างกันอ่ะ"):
 *
 *   |            | ตราแบรนด์ (ซ้าย)        | ปุ่มช่วยเหลือ/แชร์ (ขวา)      |
 *   |------------|-------------------------|------------------------------|
 *   | ความสูง     | 31px                    | 44px                         |
 *   | ตัวอักษร    | 13px                    | 11px                         |
 *   | ไอคอน      | 16px                    | 15px                         |
 *   | พื้น        | `background.paper` ทึบ   | ขาว .93 + blur + ขอบ          |
 *
 * ต่างกันครบทุกมิติทั้งที่อยู่แถวเดียวกันห่างกันไม่กี่ร้อย px — สายตาจับได้ทันทีแต่บอกไม่ถูก
 * ว่าอะไรผิด · ทางแก้ที่ยั่งยืนคือ **ให้มันเป็นของชิ้นเดียวกันจริง ๆ** ไม่ใช่ไล่จูนค่าให้ตรง
 * (ค่าที่จูนตรงวันนี้จะเพี้ยนอีกครั้งวันที่มีคนแก้ข้างใดข้างหนึ่ง)
 *
 * 🛑 `minHeight: 44` ตาม `PRODUCT.md` §Accessibility — ปกเป็นพื้นที่ที่นิ้วโป้งเอื้อมถึงยาก
 * อยู่แล้ว (มุมบนสุดของจอ) การให้พื้นที่แตะเล็กกว่าเกณฑ์ที่นั่นแย่กว่าที่อื่น
 *
 * Base: src/app/(marketing)/o/[token]/BrandHomeLink.tsx (พิลตราแบรนด์เดิม)
 */
import type { ReactNode } from 'react'

import Box from '@mui/material/Box'
import NextLink from 'next/link'

/**
 * ── กล่องนอก = **พื้นที่แตะ** · กล่องใน = **พิลที่ตาเห็น** ──
 *
 * 🛑 แยกสองชั้นเพราะสองค่านี้ขัดกันโดยธรรมชาติ: `PRODUCT.md` บังคับพื้นที่แตะ 44px
 * แต่พิลสูง 44px กับตัวอักษร 13px **ไม่ได้สัดส่วนกัน** — อ่านเป็นก้อนใหญ่ที่มีตัวหนังสือนิดเดียว
 * (หัวหน้าทัก 2026-08-30: "มันใหญ่ไปนะ ไม่สมส่วนกับ text เลย")
 *
 * ท่านี้ได้ทั้งคู่: นิ้วได้ 44px · ตาเห็นพิล 34px ซึ่งเป็นสัดส่วนเดียวกับม็อกอัพ v5
 * (`.deep-pill` ~30 · `.cover-action` 36) · เป็นท่าเดียวกับที่ชิปเบอร์โทรใน feature 00014
 * แยก "พื้นที่แตะ 44" ออกจาก "ก้อนสี 24" ไว้แล้ว
 */
const hitAreaSx = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  p: 0,
  border: 'none',
  bgcolor: 'transparent',
  color: 'text.primary',
  cursor: 'pointer',
  textDecoration: 'none',
  /* `<button>` ได้ font ของ form control จากเบราว์เซอร์ ต้องดึงกลับมาเป็นของหน้า
     🛑 `fontFamily` ไม่ใช่ `font` — `font` เป็น shorthand ที่รีเซ็ต size/weight ทั้งชุด */
  fontFamily: 'inherit',
  flexShrink: 0,
} as const

/** ทรงพิลบนปก — จุดเดียวทั้งซ้ายและขวา ห้ามก็อปค่าไปเขียนซ้ำที่อื่น */
export const coverPillSx = {
  /* 34 = ความสูงที่พอดีกับตัวอักษร 13px — พื้นที่แตะ 44px มาจาก `hitAreaSx` ที่ครอบอยู่ */
  minHeight: 34,
  px: 2.5,
  borderRadius: '9999px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 1.25,
  /**
   * พื้นทึบของธีม ไม่ใช่ขาวโปร่ง — ปกเป็น **รูปของร้าน** ที่สว่างมืดไม่แน่นอน
   * พื้นโปร่งทำให้ตัวหนังสือของพิลอ่านยากบนรูปบางใบ (คลาสเดียวกับ `TILE_SCRIM`)
   */
  bgcolor: 'background.paper',
  color: 'text.primary',
  boxShadow: 'var(--mui-customShadows-sm)',
  /* 13px = ขั้น "Label" ของ ramp (DESIGN.md §Typography) — ตัวเดียวกับที่ตราแบรนด์ใช้มาตลอด */
  fontSize: '0.8125rem',
  fontWeight: 700,
  lineHeight: 1,
  whiteSpace: 'nowrap',
} as const

/**
 * 🛑 **ไฟล์นี้ต้องเป็น `'use client'` และต้องเลือกแท็กเอง — ห้ามรับ `component` เป็น prop**
 *
 * `BrandHomeLink` เป็น **server component** ส่วน `Box` ของ MUI เป็น client component
 * ⇒ การส่ง `component={NextLink}` (ซึ่งเป็น *ฟังก์ชัน*) ข้ามเส้น server→client ทำให้
 * Next โยน `Functions cannot be passed directly to Client Components` แล้ว
 * **ทั้งหน้าเป็น 500** (เกิดจริง 2026-08-30 — ผมทำพังเองตอนรวมพิลสองฝั่ง)
 *
 * 🛑 `tsc`/`eslint`/เทสทั้ง 4382 ตัวผ่านหมด เพราะเทสสแกน *ซอร์ส* ไม่ได้เรนเดอร์จริง —
 * จับได้ตอนเปิดหน้าด้วยเบราว์เซอร์เท่านั้น
 *
 * ทางแก้: รับแค่ค่าที่ serialize ได้ (`href` เป็นสตริง) แล้วให้ไฟล์นี้ซึ่งอยู่ฝั่ง client
 * เป็นคนเลือกแท็กเอง ⇒ ไม่มีฟังก์ชันข้ามเส้นอีก
 */
export default function CoverPill({
  href,
  external = false,
  children,
  ...rest
}: {
  /** ปลายทาง — ไม่ใส่ = เป็น `<button>` */
  href?: string
  /** ลิงก์ออกนอกเว็บ ⇒ ใช้ `<a>` ธรรมดา ไม่ใช่ `next/link` */
  external?: boolean
  children: ReactNode
} & Record<string, unknown>) {
  const inner = (
    <Box component='span' sx={coverPillSx}>
      {children}
    </Box>
  )

  if (href != null && external) {
    return (
      <Box component='a' href={href} sx={hitAreaSx} {...rest}>
        {inner}
      </Box>
    )
  }

  if (href != null) {
    return (
      <Box component={NextLink} href={href} sx={hitAreaSx} {...rest}>
        {inner}
      </Box>
    )
  }

  return (
    <Box component='button' type='button' sx={hitAreaSx} {...rest}>
      {inner}
    </Box>
  )
}
