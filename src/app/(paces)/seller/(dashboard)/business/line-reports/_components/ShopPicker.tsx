'use client'

/**
 * ShopPicker — เลือกร้านที่รวมในรายงานของกลุ่ม (1..10 ร้าน) · controlled
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx (`form-checkbox` + label)
 * src precedent: settings/order-agent checkbox row (label ครอบทั้งแถว)
 *
 * ข้อมูลมาจาก `listReportableShops` ซึ่งตัดร้านล็อก/ลบออกแล้ว จึงไม่มีแถว disabled เพราะล็อกในหน้านี้
 * แถว min-h-11 (นิ้วแตะ) · ชื่อร้านยาวขึ้นบรรทัดใหม่ได้ (`break-words`) ไม่ truncate
 */
import { MAX_PICK_SHOPS, isPickDisabled, shopTypeLabel } from '@/lib/line-report/bind-wizard-rules'

export type PickerShop = { id: string; name: string; vertical: string; kind: string }

type Props = {
  shops: readonly PickerShop[]
  selected: readonly string[]
  onToggle: (id: string) => void
}

export default function ShopPicker({ shops, selected, onToggle }: Props) {
  if (shops.length === 0) {
    return (
      <p className="text-default-700 mb-0 text-sm">ตอนนี้ไม่มีร้านที่เลือกได้ ร้านที่ถูกล็อกเพราะแพ็กเกจเลือกไม่ได้</p>
    )
  }
  const full = selected.length >= MAX_PICK_SHOPS
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">ร้านที่รวมในรายงาน</legend>
      <div className="flex flex-col">
        {shops.map((s) => {
          const disabled = isPickDisabled(selected, s.id)
          return (
            <label key={s.id} className={`flex min-h-11 items-start gap-2.5 py-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                className="form-checkbox mt-0.5 shrink-0"
                checked={selected.includes(s.id)}
                disabled={disabled}
                onChange={() => onToggle(s.id)}
              />
              <span className="min-w-0">
                <span className="text-default-800 block text-sm break-words">{s.name}</span>
                <span className="text-default-700 block text-xs">{shopTypeLabel(s)}</span>
              </span>
            </label>
          )
        })}
      </div>
      <p className="text-default-700 mt-1 mb-0 text-xs" aria-live="polite">
        {full ? `ครบ ${MAX_PICK_SHOPS} ร้านแล้ว เลือกได้สูงสุด ${MAX_PICK_SHOPS} ร้าน` : `เลือกแล้ว ${selected.length} จาก ${shops.length} ร้าน`}
      </p>
    </fieldset>
  )
}
