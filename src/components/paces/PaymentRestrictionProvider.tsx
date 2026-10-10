'use client'

import { createContext, useContext } from 'react'

import { canAskToBuy, canShowMoneyStatus } from '@/lib/purchase-prompt'

/**
 * PaymentRestrictionProvider — บอกทุก client component ว่า "หน้านี้ห้ามมีช่องทาง/คำเชิญให้จ่ายเงิน"
 *
 * ที่มา: App Store rejection 2026-08-04 (Guideline 3.1.1) + Google Play Payments policy (Android
 * 2026-10-01) — ดูเหตุผลและวิธีตรวจที่ `@/lib/app-shell`
 *
 * ทำไมต้องเป็น context ไม่ไล่ส่ง prop: ข้อความ "ยอดเงินไม่พอ — เติมเงิน" กระจายอยู่ใน client
 * component ที่ลึกและไม่เกี่ยวกันเลยหลายตัว (ปุ่มส่ง SMS ในหน้าออเดอร์, แถบทำหลายรายการ,
 * ปุ่มปักหมุดสินค้า, แผง AI ในแชท) — ไล่ส่ง prop ผ่าน 3-4 ชั้นทุกเส้นจะทำให้ component กลาง ๆ
 * ต้องรู้จักเรื่องที่ไม่เกี่ยวกับตัวเอง และมีโอกาสตกหล่นบางเส้นโดยไม่มีอะไรฟ้อง
 * (เกิดจริง 2026-10-05: `LockedStateBanner` รับเป็น prop ค่าตั้งต้น false แล้ว 6 หน้าเต็มจอไม่ส่ง
 * ⇒ ร้านที่ถูกล็อกเห็นลิงก์ "อัพเกรดแพ็กเกจ" ในแอปทั้ง iOS และ Android)
 *
 * ค่ามาจาก server (seller/layout.tsx) ครั้งเดียวต่อ request — ฝั่ง client ไม่คำนวณอะไรเลย
 * จึงไม่มีปัญหา hydration mismatch และไม่ต้องอ่าน document.cookie/navigator เอง
 */

type Restriction = { hidePayments: boolean; offerIap: boolean }

const PaymentRestrictionContext = createContext<Restriction>({ hidePayments: false, offerIap: false })

export function PaymentRestrictionProvider({
  hidePayments,
  offerIap,
  children,
}: {
  hidePayments: boolean
  /** มีหน้าซื้อในแอป (IAP) ไหม — iOS ใช่ · Android ไม่ใช่ (`shouldOfferIap()`) */
  offerIap: boolean
  children: React.ReactNode
}) {
  return (
    <PaymentRestrictionContext.Provider value={{ hidePayments, offerIap }}>{children}</PaymentRestrictionContext.Provider>
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
  return useContext(PaymentRestrictionContext).hidePayments
}

/**
 * ข้อความ "ให้ไปสมัคร/อัปเกรด/ต่ออายุแพ็กเกจ Business" แสดงได้ไหม — เว็บ/iOS ได้ · Android ไม่ได้
 * กฎอยู่ที่ `canAskToBuy()` ใน `@/lib/purchase-prompt`
 */
export function useCanAskToBuy(): boolean {
  const { hidePayments, offerIap } = useContext(PaymentRestrictionContext)
  return canAskToBuy(hidePayments, offerIap)
}

/** แสดงยอดเครดิต/ป้ายแพ็กเกจได้ไหม — เว็บ/iOS ได้ · Android ไม่ได้ (`canShowMoneyStatus`) */
export function useShowMoneyStatus(): boolean {
  const { hidePayments, offerIap } = useContext(PaymentRestrictionContext)
  return canShowMoneyStatus(hidePayments, offerIap)
}

/**
 * canTopUp — ผู้ใช้คนนี้เติมเงินกระเป๋าร้านได้ไหม (00071 F3: เจ้าของร้านเท่านั้น)
 *
 * แยก context จาก hidePayments เพราะ seller/layout.tsx (ชั้นนอกสุด) ไม่รู้จักร้าน — ค่านี้ถูกใส่โดย
 * (dashboard)/layout และ (chat)/layout ที่ resolve active shop แล้ว · default false (fail-closed):
 * ต้นไม้ที่ไม่มี provider จะไม่โชว์ลิงก์เติมเงินให้ใครเลย (consumer ทั้งหมดอยู่ใต้ (dashboard) ปัจจุบัน)
 * ผู้ไม่ใช่เจ้าของเห็นข้อความ "ติดต่อเจ้าของร้าน" แทนลิงก์ /wallet (ซึ่งเป็นทางตัน 403)
 */
const CanTopUpContext = createContext<boolean>(false)

export function CanTopUpProvider({ canTopUp, children }: { canTopUp: boolean; children: React.ReactNode }) {
  return <CanTopUpContext.Provider value={canTopUp}>{children}</CanTopUpContext.Provider>
}

export function useCanTopUp(): boolean {
  return useContext(CanTopUpContext)
}
