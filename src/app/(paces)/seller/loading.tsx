'use client'

/**
 * loading.tsx ระดับ `seller/` — จอโหลด **ตอนเข้าโซนผู้ขายครั้งแรก** เท่านั้น
 *
 * ## ทำไมวางไว้ระดับนี้ ไม่ใช่เขียน logic "โชว์ครั้งแรกครั้งเดียว" เอง
 *
 * หัวหน้าเคาะ 2026-08-20: *"ถ้าหน้าอื่นๆ logo deep ก็ OK ถ้าพวกโหลดหน้า แต่เราจะทำทุกหน้าเหรอ
 * **เอาแค่หน้าตอนแรกไหม**"* ⇒ ต้องการจอแบรนด์เฉพาะตอนเปิด ไม่ใช่ทุกครั้งที่กดเมนู
 *
 * Next เลือก fallback จาก `loading.tsx` ที่ **ใกล้ segment ที่เปลี่ยนที่สุด** ⇒ กลไกนี้ให้ผลตรง
 * ตามที่สั่งโดยไม่ต้องเขียนเงื่อนไขเอง:
 *   · เปิดเว็บ/แอปครั้งแรก → ยังไม่มี layout ของ (dashboard) → fallback ตัวนี้ทำงาน
 *   · กดเมนูสลับหน้า (/orders → /products) → layout เดิมอยู่แล้ว → ใช้ `loading.tsx` ของหน้านั้น
 *
 * 🛑 **ห้ามเอาจอนี้ไปแทน skeleton ของ 16 หน้า** — skeleton ที่เลียนโครงหน้าจริง *รู้สึกเร็วกว่า*
 * overlay ทับจอเปล่า เพราะผู้ใช้เห็นล่วงหน้าว่าหน้ากำลังจะมีอะไร การเปลี่ยนเป็นโลโก้กลางจอ
 * สวยขึ้นแต่ **ถอยหลังเรื่องความรู้สึกเร็ว** (พี่ Bar ยืนยันกับหัวหน้าแล้ว: *"หน้าอื่นๆเป็น
 * Skeleton เหมือนเดิมนะ"*)
 *
 * ## ทำไมโลโก้ Deep ไม่ใช่รูปร้าน
 *
 * รูปร้าน + วงแหวนหมุน สงวนไว้สื่อ **"กำลังสลับร้าน"** (`ShopSwitchOverlay`) ถ้าเอามาใช้กับ
 * การโหลดธรรมดาด้วย ความหมายจะจืดลงจนไม่เหลือสัญญาณให้แยกสองเหตุการณ์
 *
 * 🛑 และทางเทคนิคก็ใช้ไม่ได้อยู่แล้ว: fallback นี้ทำงาน **ก่อน** `(dashboard)/layout.tsx`
 * เรียก `requireActiveShop()` ⇒ ณ จังหวะนี้ระบบยังไม่รู้ว่า active อยู่ร้านไหน
 * เดาแล้วกระพริบเปลี่ยนทีหลัง แย่กว่าไม่บอกเลย
 *
 * ## ทำไมต้อง 'use client'
 *
 * ต้องใช้ `useT()` — จอนี้คือ **จอแรกที่ผู้ใช้เห็น** ถ้าฝังไทยตายตัว คนที่ตั้งภาษาอังกฤษ
 * (และ App Reviewer) จะเห็นไทยแวบหนึ่งทุกครั้งที่เปิดแอป กฎเดียวกับที่ `dashboard/loading.tsx`
 * เขียนไว้แล้ว · ห้ามทำเป็น async server component: fallback ที่ suspend เองจะไม่มีอะไรให้แสดง
 *
 * Base: src/components/paces/ShopSwitchOverlay.tsx (ภาษาการออกแบบ: มาร์กกลางจอ + วงแหวนหมุน
 *   ติดขอบ + ข้อความหลัก/รอง) — ธีม `theme/paces/.../preloader/Preloader.tsx` เป็นหน้าเดโมที่
 *   ตั้งเวลาปลอม 1 วินาที ใช้เป็นโครงจริงไม่ได้ ยกมาเฉพาะ pattern `fixed inset-0 + bg-white`
 */

import logoMark from '@/assets/images/logo-deep-mark.png'
import { useT } from '@/i18n/LocaleProvider'

export default function SellerBootLoading() {
  const t = useT()

  return (
    <div
      className="fixed inset-0 z-100 flex flex-col items-center justify-center gap-3 bg-white"
      role="status"
      aria-live="polite"
      aria-label={t.appLoading.ariaLabel}
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
      <p className="text-default-800 text-sm font-semibold">{t.appLoading.title}</p>
      <p className="text-default-500 text-xs">{t.appLoading.subLabel}</p>
    </div>
  )
}
