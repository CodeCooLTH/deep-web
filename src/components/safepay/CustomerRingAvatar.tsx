'use client'

/**
 * CustomerSignalPlate + CUSTOMER_RING_CLS — สัญญาณ "เป็นลูกค้าของร้านแล้ว" บนรูปโปรไฟล์ (00078 S-7 · T23)
 * ใช้ 3 จุด: แถวรายการแชท · หัวห้อง · หัวแผงลูกค้า — ห้ามก๊อปไปประกอบเองที่จุดใดจุดหนึ่ง
 *
 * - ขอบม่วงติดที่ "ตัวรูป" (img และ fallback ตัวอักษรย่อ) ไม่ติดที่ wrapper — รูปโหลดพลาดขอบต้องไม่หาย
 * - จานมุมบนขวา ขนาด/ring เท่า `ChannelBadgeOverlay` (มุมล่างขวาเป็นของช่องทาง) → ต้องอยู่ใน wrapper `relative`
 * - ตัดสินด้วย `customerAvatarSignal(counted)` ตัวเดียว (ไม่นับเอง · counted มาจาก `summarizeCustomerBehavior`)
 *
 * Base: `ChannelBadgeOverlay` (inbox/components/ChannelBadge.tsx) ← theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx
 * (Paces ไม่มี avatar ที่มีจานมุม — ตาม Design Spec 00078 §2.6)
 */
import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { customerAvatarSignal } from '@/lib/customer-signal'

/** ขอบรูป — ใส่ทั้ง `<img>` และ `<span>` fallback (ทั้งคู่ rounded-full) */
export const CUSTOMER_RING_CLS = 'outline-2 outline-offset-2 outline-purple'

export function hasCustomerRing(counted: number | null | undefined): boolean {
  return customerAvatarSignal(counted).ring
}

/**
 * จานมุมบนขวา — ลูกค้าใหม่ = ไอคอนรถเข็น · ซื้อซ้ำ = ตัวเลขจำนวนใบ (≥10 = "9+")
 * ไม่มีข้อความข้างเคียงในทั้ง 3 จุดแล้ว (มติรอบ 2 "R5 วุ่นวายเกินไป") ⇒ `role="img"` + aria-label เสมอ
 */
export function CustomerSignalPlate({ counted, orderNoun }: { counted: number | null | undefined; orderNoun: string }) {
  const t = useT()
  const s = customerAvatarSignal(counted)
  if (!s.ring || s.plate === null) return null
  const label =
    s.kind === 'NEW'
      ? fmt(t.chatSignals.customerNewAria, { noun: orderNoun })
      : fmt(t.chatSignals.customerRegularAria, { n: counted ?? 0, noun: orderNoun })
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="ring-card bg-purple text-2xs absolute -end-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full font-semibold leading-none text-white ring-2"
    >
      {s.plate === 'cart' ? <Icon icon="shopping-cart" width={10} height={10} aria-hidden="true" /> : s.plate}
    </span>
  )
}
