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
 *
 * ## 🛑 "ครั้งแรก" ต้องถูกบังคับ ไม่ใช่แค่เขียนไว้ (แก้ 2026-08-23 · user เจอบน prod)
 *
 * คอมเมนต์ข้างบนอ้างมาตลอดว่าจอนี้ขึ้น "ตอนเข้าโซนผู้ขายครั้งแรก" แต่กลไกที่ใช้จริง
 * (route-level fallback) แปลว่า **"ทุกครั้งที่ layout ของโซนนี้ suspend"** ซึ่งรวมถึง
 * การโหลดหน้าใหม่ทุกครั้ง — ไม่ใช่ครั้งแรก
 * (`docs/conventions/rule-must-be-enforced-not-described.md`)
 *
 * อาการที่ผู้ใช้เจอ: **กดสลับร้าน 1 ครั้ง เห็นจอโหลด 3 ใบซ้อนกัน**
 *   1. `ShopSwitchOverlay` (โลโก้ร้าน + "กำลังสลับไปที่ร้าน …") ค้าง ≥3 วิ
 *   2. `useShopSwitcher` สั่ง `window.location.href` = **โหลดเอกสารใหม่ทั้งใบ**
 *   3. ⇒ จอนี้ (โลโก้ Deep) ขึ้นมาอีกใบ แล้วตามด้วย skeleton ของหน้าปลายทาง
 * โลโก้สองอันคนละใบต่อกัน อ่านเป็น "จอซ้อนกัน" (user: *"มันดันไปซ้อนกับ logo deep"*)
 *
 * แก้ด้วยธงระดับ **session** (ไม่ใช่ localStorage — ปิดแอปแล้วเปิดใหม่ควรได้จอต้อนรับอีกครั้ง)
 *
 * 🛑 ซ่อนด้วย **inline script ที่วางต่อท้าย div** ไม่ใช่ `useEffect` — `useEffect` ทำงาน
 * *หลัง* hydration ⇒ โลโก้ Deep จะกะพริบให้เห็นก่อนหายไปทุกครั้ง ซึ่งแย่กว่าเดิม
 * สคริปต์ที่อยู่ถัดจาก element ในเอกสารเดียวกันทำงาน **ระหว่าง parse ก่อน paint แรก**
 * ⇒ ผู้ใช้ไม่เห็นอะไรเลย (แพตเทิร์นเดียวกับสคริปต์กันจอกะพริบตอนสลับธีม)
 */

import logoMark from '@/assets/images/logo-deep-mark.png'
import { useT } from '@/i18n/LocaleProvider'

/**
 * คีย์ธง — `sessionStorage` ไม่ใช่ `localStorage`
 *
 * ปิดแอป/แท็บแล้วเปิดใหม่ = การ "เปิดครั้งแรก" รอบใหม่จริง ๆ ควรได้จอต้อนรับอีกครั้ง
 * ส่วนการสลับร้าน/รีโหลดระหว่างใช้งาน อยู่ใน session เดียวกัน จึงข้ามไป
 */
const BOOTED_KEY = 'deep_seller_booted'

/**
 * สคริปต์กันจอซ้ำ — ทำงาน **ระหว่าง parse** ก่อน paint แรก
 *
 * `document.currentScript.previousElementSibling` = div ที่อยู่ก่อนหน้าทันที (จอโหลดใบนี้)
 * ⇒ ไม่ต้องพึ่ง id ที่อาจชนกับใครในอนาคต และไม่ต้องรอ DOM ทั้งหน้า
 *
 * 🛑 ห่อ try/catch — `sessionStorage` โยนได้ในโหมดส่วนตัวของบางเบราว์เซอร์ ถ้าปล่อยให้ throw
 * จอโหลดจะค้างอยู่ทั้งที่ควรหาย (หรือแย่กว่านั้น สคริปต์ตายกลางคันแล้วธงไม่ถูกตั้ง)
 * พังแล้วต้อง **แสดงจอต่อไปตามปกติ** ไม่ใช่ซ่อน — เห็นจอซ้ำยังดีกว่าจอขาวเปล่า
 */
const SKIP_IF_BOOTED = `(function(){try{
var el=document.currentScript.previousElementSibling;
if(sessionStorage.getItem('${BOOTED_KEY}')==='1'){el.style.display='none'}
else{sessionStorage.setItem('${BOOTED_KEY}','1')}
}catch(e){}})()`

export default function SellerBootLoading() {
  const t = useT()

  return (
    <>
    <div
      className="fixed inset-0 z-100 flex flex-col items-center justify-center gap-3 bg-white"
      role="status"
      aria-live="polite"
      aria-label={t.appLoading.ariaLabel}
      /* สคริปต์ข้างล่างแก้ `style` ของ node นี้นอก React — บอก React ไม่ต้องเทียบตอน hydrate
         (ค่านี้ไม่เคยถูก React เขียนทับ เพราะ fallback ตัวนี้ render ครั้งเดียวแล้วถูกทิ้ง) */
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
      <p className="text-default-800 text-sm font-semibold">{t.appLoading.title}</p>
      <p className="text-default-500 text-xs">{t.appLoading.subLabel}</p>
    </div>
    {/* 🛑 ต้องเป็น inline + sync และอยู่ **ต่อท้าย div** เท่านั้น — `async`/`defer`/`next/script`
        ทำงานหลังจอถูกวาดไปแล้ว ซึ่งคือสิ่งที่กำลังแก้อยู่พอดี · ย้ายขึ้นไปก่อน div ก็ไม่ได้
        เพราะตอนนั้น `previousElementSibling` ยังไม่มีตัวตน */}
    <script dangerouslySetInnerHTML={{ __html: SKIP_IF_BOOTED }} />
    </>
  )
}
