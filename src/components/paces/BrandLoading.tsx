'use client'

/**
 * BrandLoading — จอโหลดแบรนด์ Deep **ตัวเดียวของทั้งระบบ** (รวมเป็นหนึ่งเดียว 2026-09-17)
 *
 * ## ทำไมต้องรวม
 *
 * ก่อนหน้านี้มีจอโหลด "หลังล็อกอิน" อีกแบบหนึ่งต่างหาก (โลโก้เต็ม + สปินเนอร์แยกอยู่ข้างล่าง)
 * ซึ่ง **ไม่เหมือนจอตอนเปิดแอปครั้งแรกเลย** — หัวหน้าเห็นแล้วทักทันทีว่า "มันมีอยู่แล้วปะ
 * ใช้แบบเดียวกันสิ" · ของสิ่งเดียวกันสองหน้าตา = Hard Rule 16 ตรงตัว
 *
 * ⇒ ยกภาษาการออกแบบมาไว้ที่เดียว แล้วให้ทุกที่เรียกใช้ตัวนี้
 *
 * Base: src/app/(paces)/seller/loading.tsx (จอเปิดแอปครั้งแรก — ต้นฉบับของภาษานี้)
 *   ซึ่ง Base เดิมมาจาก src/components/paces/ShopSwitchOverlay.tsx
 *   (มาร์กกลางจอ + วงแหวนหมุนติดขอบ + ข้อความหลัก/รอง)
 *
 * ## 🛑 ห้ามฝังคำลงในไฟล์นี้
 *
 * รับ `title`/`subLabel` เป็น prop เท่านั้น — จอโหลดคือ **จอแรกที่ผู้ใช้เห็น** ถ้าฝังไทยตายตัว
 * คนที่ตั้งภาษาอังกฤษ (และทีมรีวิวของ Apple) จะเห็นไทยแวบหนึ่งทุกครั้ง
 * มีด่าน `boot-loading.test.ts` บังคับข้อนี้อยู่
 *
 * ## 🛑 ห้ามใส่ชื่อ/รูปร้าน
 *
 * รูปร้าน + วงแหวน สงวนไว้สื่อ **"กำลังสลับร้าน"** (`ShopSwitchOverlay`) เท่านั้น
 * เอามาใช้กับการโหลดธรรมดาด้วยเมื่อไหร่ ผู้ใช้จะไม่เหลือสัญญาณให้แยกสองเหตุการณ์
 */
import logoMark from '@/assets/images/logo-deep-mark.png'

export default function BrandLoading({
  title,
  subLabel,
  ariaLabel,
}: {
  title: string
  subLabel: string
  ariaLabel: string
}) {
  return (
    <div
      className="fixed inset-0 z-100 flex flex-col items-center justify-center gap-3 bg-white"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      /* จอเปิดแอปครั้งแรกมีสคริปต์แก้ `style` ของ node นี้นอก React (ซ่อนเมื่อเปิดซ้ำใน session
         เดิม) — บอก React ไม่ต้องเทียบตอน hydrate · ที่เรียกใช้ที่อื่นไม่มีผลข้างเคียง */
      suppressHydrationWarning
    >
      <div className="relative flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- โลโก้ static ที่ import มาแล้ว
            next/image จะเพิ่ม JS + layout pass ให้จอที่ต้องขึ้นเร็วที่สุดในแอปโดยไม่ได้อะไรกลับมา */}
        <img src={logoMark.src} alt="" className="size-14 object-contain" />
        {/* วงแหวนบางวิ่งรอบมาร์ก — ตัวเดียวกับ ShopSwitchOverlay ให้จอโหลดทั้งแอปพูดภาษาเดียวกัน */}
        <span
          className="border-primary absolute -inset-2 animate-spin rounded-full border-2 border-t-transparent"
          aria-hidden="true"
        />
      </div>
      <p className="text-default-800 text-sm font-semibold">{title}</p>
      <p className="text-default-500 text-xs">{subLabel}</p>
    </div>
  )
}
