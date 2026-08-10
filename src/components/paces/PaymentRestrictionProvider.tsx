'use client'

import { createContext, useContext } from 'react'

/**
 * PaymentRestrictionProvider — บอกทุก client component ว่า "หน้านี้ห้ามมีช่องทาง/คำเชิญให้จ่ายเงิน"
 *
 * ที่มา: App Store rejection 2026-08-04 (Guideline 3.1.1) — ดูเหตุผลและวิธีตรวจที่ `@/lib/app-shell`
 *
 * ทำไมต้องเป็น context ไม่ไล่ส่ง prop: ข้อความ "ยอดเงินไม่พอ — เติมเงิน" กระจายอยู่ใน client
 * component ที่ลึกและไม่เกี่ยวกันเลยหลายตัว (ปุ่มส่ง SMS ในหน้าออเดอร์, แถบทำหลายรายการ,
 * ปุ่มปักหมุดสินค้า, แผง AI ในแชท) — ไล่ส่ง prop ผ่าน 3-4 ชั้นทุกเส้นจะทำให้ component กลาง ๆ
 * ต้องรู้จักเรื่องที่ไม่เกี่ยวกับตัวเอง และมีโอกาสตกหล่นบางเส้นโดยไม่มีอะไรฟ้อง
 *
 * ค่ามาจาก server (seller/layout.tsx) ครั้งเดียวต่อ request — ฝั่ง client ไม่คำนวณอะไรเลย
 * จึงไม่มีปัญหา hydration mismatch และไม่ต้องอ่าน document.cookie/navigator เอง
 */

const PaymentRestrictionContext = createContext(false)

export function PaymentRestrictionProvider({
  hidePayments,
  children,
}: {
  hidePayments: boolean
  children: React.ReactNode
}) {
  return (
    <PaymentRestrictionContext.Provider value={hidePayments}>{children}</PaymentRestrictionContext.Provider>
  )
}

/**
 * true = ห้ามแสดงปุ่ม/ลิงก์/ข้อความที่พาไปจ่ายเงิน (รวมลิงก์ไปเว็บของเราเอง)
 *
 * 🛑 ยอดเครดิตคงเหลือ **ไม่ใช่** สิ่งที่ต้องซ่อน — มันคือสถานะบัญชี ไม่ใช่ช่องทางจ่าย
 * (user เคาะ 2026-08-10) และจำเป็นเพราะเครดิตก้อนเดียวกันใช้จ่ายค่าส่ง SMS ด้วย
 *
 * default เป็น false เมื่ออยู่นอก provider — ปลอดภัยเพราะ provider ครอบทั้งโซน seller
 * ส่วนหน้าที่อยู่นอกโซนนั้น (buyer/admin) ไม่เคยถูกเปิดในแอปผู้ขายอยู่แล้ว
 */
export function useHidePayments(): boolean {
  return useContext(PaymentRestrictionContext)
}
