'use client'

/**
 * useLightboxDeepLink — เขียน/ลบพารามิเตอร์ที่บอกว่า lightbox เปิดอะไรอยู่
 *
 *   /u/[username]?p=<productId>       → แท็บสินค้า + เปิด lightbox ของสินค้าใบนั้น
 *   /u/[username]?clip=<shopVideoId>  → แท็บปักหมุด + เปิด lightbox ของคลิปนั้น
 *
 * แยกคีย์ ไม่ใช้คีย์เดียว เพราะคีย์เดียวบังคับให้โค้ดต้อง "เดา" ว่า id นี้เป็นของแท็บไหน
 *
 * 🛑 **`push` ตอนเปิดครั้งแรก · `replace` ตอนกด ‹ ›** — ปุ่ม back จึงปิด lightbox เสมอ และ
 * ไม่ว่าจะเลื่อนดูไปกี่ใบก็ไม่ต้องกด back ซ้ำ ๆ กว่าจะกลับออกมา
 *
 * 🛑 ทุกคำสั่งต้องมี `{ scroll: false }` — ไม่งั้น Next เลื่อนหน้าขึ้นบนสุดทุกครั้งที่กด ‹ ›
 * แล้วพอปิด lightbox ผู้ใช้จะอยู่คนละที่กับตอนกดเปิด (`SearchBox.tsx` ที่มีอยู่ไม่ได้ใส่ อย่าก็อปมา)
 *
 * 🛑 **ห้ามให้ Server Component เริ่ม `await searchParams`** — ตอนนี้ทั้งสองหน้าประกาศ type ไว้
 * แต่ไม่เคยอ่านจริง ถ้าเริ่มอ่าน Next จะเปลี่ยน navigation เป็น server refetch เต็มรูป
 * **ทุกครั้งที่กด ‹ ›** = โหลดใหม่ทั้งหน้า จึงอ่านฝั่ง client ที่นี่แทน
 */
import { useCallback } from 'react'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export type LightboxParamKey = 'p' | 'clip'

export function useLightboxDeepLink(key: LightboxParamKey) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  /** `id === null` = ถอดพารามิเตอร์ทิ้ง (ปิด lightbox / id ที่ไม่มีอยู่จริง) */
  return useCallback(
    (id: string | null, mode: 'push' | 'replace') => {
      const next = new URLSearchParams(searchParams.toString())
      if (id) next.set(key, id)
      else next.delete(key)
      const qs = next.toString()
      router[mode](qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [key, pathname, router, searchParams],
  )
}

export default useLightboxDeepLink
