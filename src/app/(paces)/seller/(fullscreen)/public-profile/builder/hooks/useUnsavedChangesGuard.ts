'use client'

/**
 * useUnsavedChangesGuard — กันหลุดจากหน้า builder ทั้งที่ draft ยังไม่ได้บันทึก (feature 00035, Task 7)
 *
 * ครอบ 2 เส้นทางที่ทำให้ draft (client state ล้วน — ไม่มีตาราง DB, DATABASE §6) หายได้แบบไม่ตั้งใจ:
 *   1) ปิดแท็บ/รีเฟรช/ปิดเบราว์เซอร์ — native `beforeunload` (เบราว์เซอร์เป็นคนโชว์ข้อความเอง
 *      ไม่ใช่ Swal — DOM API ข้อนี้ไม่ยอมให้ custom modal คั่นได้)
 *   2) กดปุ่ม back ของเบราว์เซอร์ (mouse back / Alt+Left / gesture) — ดัก popstate แล้วดันกลับ
 *      ที่เดิมทันที ให้ผู้ใช้ตัดสินใจผ่าน UI ปกติ (ปุ่มย้อนกลับใน FullscreenPageHeader) แทน
 *
 * ไม่ครอบ: การกดปุ่ม "ย้อนกลับ" ใน FullscreenPageHeader (FullscreenBackButton.tsx เป็น shared
 * component ที่หน้า fullscreen อื่น 5+ หน้าใช้ร่วม — ไม่แตะเพิ่ม prop ให้เฉพาะหน้านี้ตาม dispatch
 * scope) และไม่ครอบ router.push()/back() ที่เรียกจากโค้ดของแอปเอง (เฉพาะ browser-level navigation)
 */
import { useEffect } from 'react'

export function useUnsavedChangesGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Chrome ต้องการ returnValue ที่ truthy เพื่อโชว์ native confirm dialog (ข้อความจริงเบราว์เซอร์
      // เลือกเอง ไม่ใช่ค่าที่เราตั้ง — spec เก่าของ beforeunload)
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (!isDirty) return
    // ดัน history state ปลอมไว้กันไว้ 1 ชั้น — กด back ครั้งแรกจะ pop กลับมาที่ state ปลอมนี้แทนที่จะ
    // ออกจากหน้าจริง แล้วดันปลอมกลับเข้าไปใหม่ทันที (trap): ผลคือกด back ตอน dirty ไม่พาออกจากหน้า
    window.history.pushState(null, '', window.location.href)
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isDirty])
}
