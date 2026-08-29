'use client'

/**
 * ProductThumb — รูปสินค้าพร้อม fallback ของรายงานยอดขายรายสินค้า (feature 00063)
 *
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductCard.tsx (`ProductImage`)
 *
 * 🛑 ต้องมี `onError` เสมอ — รูปที่โหลดไม่ขึ้นจะโชว์ไอคอนรูปเสียของเบราว์เซอร์ (กล่อง `?`)
 * ซึ่งอ่านเป็น "ระบบพัง" ไม่ใช่ "สินค้านี้ยังไม่มีรูป" · เกิดจริงบน prod 2026-08-29 ตอนที่
 * `src` ยังเป็น storage key ดิบ — แก้ที่ต้นทางแล้ว (`fileUrlOf`) แต่ตาข่ายนี้ต้องมีอยู่ดี
 * เพราะไฟล์ถูกลบจาก bucket ได้เสมอ
 *
 * 🛑 ต้นแบบใช้ `useRef` คู่ `useState` เพื่อกัน `onError` ยิงซ้ำ — ที่นี่ตัดออกเพราะ
 * (ก) อ่าน `ref.current` ตอน render ผิดกฎ React Compiler (eslint ฟ้องเป็น error)
 * (ข) ไม่จำเป็น: พอ `failed` เป็น true แล้ว `<img>` ไม่ถูก render อีกเลย `onError` จึงยิงซ้ำไม่ได้
 */
import { useState } from 'react'

import Icon from '@/components/wrappers/Icon'

type Props = {
  src: string | null
  alt: string
  /** แถวรวม "รายการที่พิมพ์เอง" — ไม่ใช่สินค้าจริง จึงใช้ไอคอนดินสอ ไม่ใช่ไอคอนกล่อง */
  isCustom: boolean
  /** คลาสขนาด เช่น `size-10` (ตาราง) หรือ `size-11` (รายการมือถือ) */
  sizeClass: string
  /**
   * สีวงแหวน = สีเส้นของสินค้านี้บนกราฟ · `undefined` = ไม่ได้อยู่บนกราฟ → ขอบเทาเดิม
   *
   * 🛑 ใช้ `box-shadow` แทน `border` เพื่อไม่ให้กล่องเปลี่ยนขนาดตอนติ๊ก/ถอด (border กินพื้นที่
   * ใน box model แต่ box-shadow ไม่กิน) และหนา 2px เพราะสีอ่อนอย่างส้มอิฐ/ฟ้า 1px จะจางไปกับพื้นขาว
   * เป็น "สี = ตัวตน" ไม่ใช่ข้อความ จึงไม่อยู่ใต้เกณฑ์คอนทราสต์ 4.5:1
   * (docs/conventions/contrast-fix-keeps-hue.md)
   */
  ringColor?: string
}

export default function ProductThumb({ src, alt, isCustom, sizeClass, ringColor }: Props) {
  const ring = ringColor ? { boxShadow: `0 0 0 2px ${ringColor}` } : undefined
  const [failed, setFailed] = useState(false)

  if (isCustom || !src || failed) {
    return (
      <span
        style={ring}
        className={`bg-default-100 text-default-400 flex ${sizeClass} shrink-0 items-center justify-center rounded-lg border ${
          ringColor ? 'border-transparent' : 'border-default-200'
        }`}
        title={isCustom ? undefined : 'สินค้านี้ยังไม่มีรูป'}>
        <Icon icon={isCustom ? 'pencil' : 'package'} className="text-base" aria-hidden="true" />
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      style={ring}
      className={`bg-default-100 ${sizeClass} shrink-0 rounded-lg border object-cover ${
        ringColor ? 'border-transparent' : 'border-default-200'
      }`}
      onError={() => setFailed(true)}
    />
  )
}
