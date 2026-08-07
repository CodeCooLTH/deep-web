'use client'

/**
 * useLockBodyScroll — ตรึงหน้าข้างหลังไม่ให้เลื่อน/เด้งขณะเปิด overlay ที่เราประกอบเอง
 *
 * ทำไมต้องมี: โมดัล/ชีตที่ขับด้วย Preline (`HSOverlay`) ได้ของนี้ฟรีอยู่แล้ว — `open()` ของมันสั่ง
 * `document.body.style.overflow = 'hidden'` ให้เอง (preline/dist/index.js) แต่ในโปรเจกต์นี้ overlay
 * ส่วนใหญ่ถูก "แปลงเป็น controlled div" ด้วย React state โดยตั้งใจ (Preline พังเมื่อ re-render —
 * feedback_filterdropdown_reusable) การแปลงนั้นเลยทิ้งการล็อก scroll หายไปพร้อมกันทุกใบ
 * โดยไม่มีใครสังเกต เพราะบนเดสก์ท็อปแทบไม่เห็นผล
 *
 * อาการที่ user เจอ (2026-08-07, แผงกดค้างในกล่องแชทบนมือถือ): ลากนิ้วในแผ่นแล้วหน้าข้างหลังถูกดึง
 * ลงจนเห็นแถบขาวเหนือหัวแชท — overlay ที่ portal ไป document.body มีบรรพบุรุษที่รับ scroll ต่อ
 * เป็น document เอง scroll chaining จึงวิ่งออกไปนอก overlay ทันทีที่เนื้อในยังไม่ล้น
 *
 * ที่สั่ง 3 อย่าง ไม่ใช่อย่างเดียว:
 *   - `overflow:hidden` ที่ <body> = ท่ามาตรฐาน (และเป็นท่าที่ Preline ใช้)
 *   - `overflow:hidden` ที่ <html> ด้วย เพราะบน iOS Safari การสั่งที่ body อย่างเดียวเอาไม่อยู่
 *   - `overscroll-behavior-y:none` ที่ <html> — iOS เด้งเอกสาร (rubber-band) ได้แม้หน้าไม่มีอะไรให้
 *     เลื่อน ซึ่งเป็นคนละกลไกกับ chaining จึงต้องสั่งแยก
 * ไม่ใช้ท่า `position:fixed` ที่ body เพราะมันรีเซ็ตตำแหน่ง scroll ของหน้าเมื่อปิด overlay
 *
 * นับซ้อน (`locks`) ระดับโมดูล: overlay ซ้อน overlay (เช่นโมดัลเปิด Swal ต่อ) แล้วตัวในปิดก่อน
 * ต้องไม่ปลดล็อกให้ตัวนอก — คืนค่าเฉพาะตอนตัวสุดท้ายปล่อย และคืนเป็น "ค่าที่มีอยู่ก่อนล็อกแรก"
 * ไม่ใช่ค่าว่าง (หน้าอื่นอาจตั้ง inline style ไว้ก่อนแล้ว)
 */
import { useEffect } from 'react'

let locks = 0
let saved: { htmlOverflow: string; htmlOverscroll: string; bodyOverflow: string } | null = null

/** @param enabled เปิด overlay อยู่หรือไม่ — เรียก hook ได้ทุก render (ไม่ผิด rules of hooks) */
export function useLockBodyScroll(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const html = document.documentElement
    const { body } = document
    if (locks === 0) {
      saved = {
        htmlOverflow: html.style.overflow,
        htmlOverscroll: html.style.overscrollBehaviorY,
        bodyOverflow: body.style.overflow,
      }
      html.style.overflow = 'hidden'
      html.style.overscrollBehaviorY = 'none'
      body.style.overflow = 'hidden'
    }
    locks += 1
    return () => {
      locks -= 1
      if (locks === 0 && saved) {
        html.style.overflow = saved.htmlOverflow
        html.style.overscrollBehaviorY = saved.htmlOverscroll
        body.style.overflow = saved.bodyOverflow
        saved = null
      }
    }
  }, [enabled])
}

export default useLockBodyScroll
