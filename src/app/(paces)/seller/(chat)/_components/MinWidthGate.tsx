'use client'

/**
 * mount children เฉพาะเมื่อความกว้างจอตรงเงื่อนไข — ใช้แทน `hidden lg:flex` / `lg:hidden` ที่ยัง mount
 * ทั้งสองชุด (รายการแชทที่ซ่อนด้วย CSS ยังยิง fetch + subscribe realtime + poll ทุก 20 วิ)
 * `below` = mount เมื่อจอ *แคบกว่า* px (แทน `lg:hidden`)
 * 🛑 รอบแรก (SSR/ก่อน sync) mount ทั้งสองโหมด = เหมือนก่อนมี gate (CSS ของผู้เรียกยังซ่อนชุดที่ไม่ใช่)
 *    แล้วค่อยถอดชุดที่ไม่ตรงหลัง sync — ถ้ารอบแรกไม่ mount ชุดที่มองเห็น จะโผล่หลัง hydrate = จอกระพริบ
 *    ซึ่งคืออาการที่งานนี้มาแก้ (ผู้เรียกต้องคงคลาส hidden/lg:hidden เดิมไว้)
 */
import type { ReactNode } from 'react'
import { useMinWidth } from '@/hooks/useMinWidth'

export default function MinWidthGate({
  px,
  below = false,
  children,
}: {
  px: number
  below?: boolean
  children: ReactNode
}) {
  const wide = useMinWidth(px)
  if (wide === null) return <>{children}</>
  return (below ? !wide : wide) ? <>{children}</> : null
}
