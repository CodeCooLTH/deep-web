'use client'

/**
 * ChatBottomSheet — ท่า "เปิดจากล่าง" อันเดียวของทั้งห้องแชทบนมือถือ
 *
 * user สั่ง 2026-08-16: *"เวลาเรากดพวกนี้ เราให้มันเป็น slide modal up หมดเลยดีป่ะ
 * จะได้ไปในทิศทางเดียวกัน"* + *"panel quickmessage, เลือกสินค้า ให้เป็น slide modal up
 * ใน mobile ให้หมด"*
 *
 * ก่อนหน้านี้ห้องแชทมี **3 ท่าเปิด** ที่ผู้ใช้ต้องเรียนรู้แยกกัน ทั้งที่เป็นการกดปุ่มในแถบเดียวกัน:
 *   · แถบสถานะห้องแชท → sheet จากล่าง
 *   · แถบพัสดุ         → กางในหน้า (ดันความสูงท้ายจอ)
 *   · AI / เลือกสินค้า / ข้อความสำเร็จรูป → แผงแทรกเหนือช่องพิมพ์
 * ตอนนี้เหลือท่าเดียว
 *
 * 🛑 มีที่เดียวโดยตั้งใจ — ถ้าปล่อยให้แต่ละที่ประกอบ sheet เอง มันจะค่อย ๆ เพี้ยนจากกัน
 * (คนละความสูง คนละท่าปิด คนละ z-index) โดยไม่มี tsc/เทสตัวไหนฟ้อง
 *
 * 🛑 ประกอบเองด้วย React state ไม่ใช่ Preline `hs-overlay` ⇒ **ต้องเรียก `useLockBodyScroll`**
 * ตาม `docs/conventions/overlay-scroll-lock.md` — ไม่งั้นบนมือถือลากนิ้วบนแผงแล้วหน้าข้างหลัง
 * เลื่อนตามจนเนื้อหาหลุดกรอบ (อาการที่ user เจอเองบน prod กับ overlay ใบอื่น 2026-08-07)
 * และทุกกล่องเลื่อนข้างในต้องมี `overscroll-contain`
 */

import type { ReactNode } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'

export default function ChatBottomSheet({
  title,
  icon,
  onClose,
  children,
  hideHeader,
  onContentClickCapture,
  /** ใส่เมื่อเนื้อหาข้างในมี negative margin เจาะขอบ (แผง AI/สินค้าใช้ `-mx-4 -mt-3`) */
  contentClassName,
}: {
  title: string
  icon: string
  onClose: () => void
  children: ReactNode
  onContentClickCapture?: (e: React.MouseEvent) => void
  contentClassName?: string
  /**
   * เนื้อหาข้างในมี "หัว" ของตัวเองอยู่แล้ว (ชื่อ + ปุ่มปิด) → ไม่ต้องวาดหัวซ้ำ
   *
   * 🛑 แผงเหนือช่องพิมพ์ทั้ง 3 ตัว (AI / เลือกสินค้า / ข้อความสำเร็จรูป) มีหัวของตัวเองครบ
   * รอบแรกผมห่อโดยไม่เช็ค ⇒ ได้ **หัวซ้อนกัน 2 ชั้น ชื่อเดียวกัน ปุ่มปิด 2 อัน**
   * (user เจอเองบนเครื่อง 2026-08-16) — คลาสเดียวกับเลขออเดอร์ซ้ำในแถบพัสดุก่อนหน้านี้
   * `title` ยังต้องส่งมาเสมอเพราะใช้เป็น `aria-label` ของ dialog ไม่ว่าจะวาดหัวหรือไม่
   */
  hideHeader?: boolean
}) {
  useLockBodyScroll(true)
  return (
    <>
      {/* ฉากหลัง — เป็นปุ่มจริงเพื่อให้ปิดด้วยคีย์บอร์ดได้ ไม่ใช่ div ที่มี onClick */}
      <button type="button" aria-label="ปิด" onClick={onClose} className="fixed inset-0 z-50 bg-black/35" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        /* 🛑 ความสูงคงที่ 60% ของจอ ไม่ใช่ "สูงตามเนื้อหา" (user สั่ง 2026-08-16)
           เหตุผล: แผงพวกนี้มีสถานะ "ยังไม่ได้ตั้งค่า" ซึ่งเนื้อหาสั้นมาก (ข้อความเดียว + ปุ่ม)
           ถ้าสูงตามเนื้อหา sheet จะกลายเป็นตอสั้น ๆ เกาะขอบล่าง ดูเหมือนของพัง ไม่ใช่แผงว่าง
           และความสูงจะกระโดดไปมาทุกครั้งที่สลับแผง — ตรึงไว้แล้วทุกแผงเปิดมาเท่ากันเสมอ
           dvh ไม่ใช่ vh: บนมือถือแถบเบราว์เซอร์ยุบ/กางได้ vh จะคำนวณจากจอตอนโหลดแล้วไม่อัปเดต */
        className={
          'bg-card fixed inset-x-0 bottom-0 z-50 flex h-[60dvh] flex-col rounded-t-2xl shadow-lg' /* h-[60dvh]: ธีมไม่มี token ความสูงตาม viewport (HR7 carve-out) */
        }
        onClickCapture={onContentClickCapture}
      >
        {hideHeader ? (
          /* ที่จับลากอย่างเดียว — หัวจริงอยู่ในเนื้อหา */
          <div className="flex shrink-0 justify-center pt-2 pb-1">
            <span className="bg-default-300 h-1 w-9 rounded-full" aria-hidden="true" />
          </div>
        ) : (
        <div className="border-default-300 bg-card relative z-10 flex shrink-0 items-center gap-2 border-b border-dashed px-4 pb-2.5 pt-4">
          {/* ที่จับลาก — เป็นของตกแต่ง ผู้ใช้ปิดด้วยปุ่ม ✕ หรือแตะฉากหลัง (ยังไม่ทำท่าลากจริง) */}
          <span
            className="bg-default-300 absolute inset-x-0 top-1.5 mx-auto h-1 w-9 rounded-full"
            aria-hidden="true"
          />
          <Icon icon={icon} className="text-default-700 text-lg" aria-hidden="true" />
          <h5 className="text-base mb-0 min-w-0 truncate">{title}</h5>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-icon btn-sm text-default-400 ms-auto"
            aria-label="ปิด"
          >
            <Icon icon="x" className="text-lg" />
          </button>
        </div>
        )}
        {/* ส่วนที่เลื่อน — หัว/ที่จับอยู่นอกกล่องนี้จึงไม่เลื่อนตาม
            overscroll-contain: กันไม่ให้ scroll ทะลุไปเลื่อนหน้าข้างหลัง (overlay-scroll-lock.md) */}
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${contentClassName ?? ''}`}>
          {children}
        </div>
      </div>
    </>
  )
}
