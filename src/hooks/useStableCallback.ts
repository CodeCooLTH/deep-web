import { useCallback, useRef } from 'react'
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect'

/**
 * คืนฟังก์ชันที่ identity คงที่ตลอดอายุ component แต่เรียกตัวล่าสุดเสมอ
 * — ใช้ส่ง callback ให้ลูกที่ห่อ React.memo โดยไม่ทำให้ memo พังทุก render
 * (ค่าที่ closure จับมาต้องอ่านสดตอน "เรียก" ไม่ใช่ตอน render — ปลอดภัยกับ event handler เท่านั้น)
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn)
  // อัปเดตใน layout effect (ก่อน paint / ก่อน event ใด ๆ) ไม่เขียน ref ระหว่าง render
  useIsomorphicLayoutEffect(() => {
    ref.current = fn
  })
  return useCallback((...args: A) => ref.current(...args), [])
}
