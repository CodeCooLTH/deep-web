'use client'

/**
 * PhoneSuggestHint — สล็อตใต้ช่องเบอร์: chip แนะนำเบอร์ที่ตัดอักขระแล้ว / ข้อความเตือน / ว่าง
 *
 * Base: `theme/paces/Admin/TS/src/assets/css/custom/_forms.css:246` +
 *       `theme/paces/Admin/TS/src/layouts/components/TopBar/components/AppsDropdownGrid.tsx:48`
 *       (soft-primary `bg-primary/15 text-primary` — ท่ามาตรฐานของธีม ใช้อยู่แล้ว 82 ไฟล์ใน (paces))
 *       ข้อความเตือนใช้ class เดิมของไฟล์ผู้เรียกเป๊ะ (`text-danger`) ไม่สร้างของใหม่
 *
 * ที่มา (user 2026-08-21): ลูกค้าส่งเบอร์มาคนละรูปแบบ (`092-0791649`, `(+66)920791649`,
 * `0_9_2_0791649`) ร้านต้องนั่งตัดเอง — ระบบเสนอให้ **ร้านกดเอง ไม่แก้ให้อัตโนมัติ**
 * เอกสาร: `docs/20 - Features/00014 - Customer Directory/EXTENSIONS-2026-08-21-phone-format.md` §E1
 *
 * 🛑 ใช้ตัวนี้ทั้ง 3 จอ (CustomerQuickBlock / CustomerSearchSheet / CustomerSelectBlock)
 * ห้ามก็อปคำหรือตรรกะไปเขียนซ้ำ — ตรรกะอยู่ที่ `@/lib/phone-hint` (มีเทส [blocker])
 */

import { phoneHint, chipLabel } from '@/lib/phone-hint'

interface Props {
  /** ค่าที่ผู้ใช้พิมพ์อยู่ในช่องตอนนี้ */
  value: string
  /** id ของสล็อต — ผู้เรียกต้องชี้ `aria-describedby` ของ input มาที่นี่ตอนมีเนื้อหา */
  id: string
  /** กดแล้วเขียนทับค่าในช่อง + ค้นใหม่ (ผู้เรียกเป็นคนทำ) */
  onPick: (phone: string) => void
  /**
   * มือถือ: ปุ่มสูง ≥44px ตาม AA baseline · เดสก์ท็อป: ปล่อยตาม `.btn` (~37px)
   * ให้เท่าปุ่มอื่นในไฟล์เดียวกัน (บริบท mouse-precision)
   */
  size?: 'mobile' | 'desktop'
}

export default function PhoneSuggestHint({ value, id, onPick, size = 'mobile' }: Props) {
  const hint = phoneHint(value)
  const mobile = size === 'mobile'

  // `.btn` ของธีมเป็น `inline-flex items-center justify-center` อยู่แล้ว (_buttons.css:5)
  // → `min-h-11` ปลอดภัย เนื้อในยังจัดกลาง (ด่าน mobile-affordance.test.ts อ่านทีละบรรทัด
  // จึงต้องให้ `btn` กับ `min-h-11` อยู่บรรทัดเดียวกัน ไม่งั้นมันเห็นครึ่งเดียวแล้วแดง)
  const chipClass = mobile
    ? 'btn min-h-11 rounded-full bg-primary/15 text-primary hover:bg-primary hover:text-white'
    : 'btn rounded-full bg-primary/15 text-primary hover:bg-primary hover:text-white text-xs'

  // 🛑 กล่องนี้ต้อง mount ค้างเสมอ แม้ตอนไม่มีอะไรจะพูด — live region ที่ถูก unmount/mount
  // ใหม่ทุกครั้ง screen reader จะไม่ประกาศการเปลี่ยนแปลง (ประกาศแค่ตอนแรกที่ mount)
  return (
    <div id={id} role="status" aria-live="polite">
      {hint.kind === 'chips' && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {hint.suggestions.map((phone) => (
            <button
              key={phone}
              type="button"
              onClick={() => onPick(phone)}
              className={chipClass}
            >
              {chipLabel(phone)}
            </button>
          ))}
        </div>
      )}
      {hint.kind === 'warning' && (
        <p className={`mt-1 text-danger ${mobile ? 'text-xs' : 'text-sm'}`}>{hint.message}</p>
      )}
    </div>
  )
}
