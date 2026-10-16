'use client'

/**
 * ShopSwitcher — ตัวสลับร้านของเจ้าของที่มีหลายร้าน (เลือกได้ทีละร้าน)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx ผ่านสำเนา src/components/safepay/FilterDropdown.tsx
 * ไม่ใช้ hs-dropdown — หน้านี้ re-render ทุก 8 วินาที (Preline เก็บสถานะใน DOM แล้วหาย) และต้องอยู่ใน element fullscreen
 */
import FilterDropdown from '@/components/safepay/FilterDropdown'

export type ShopOption = { id: string; name: string }

export default function ShopSwitcher({ shops, value, onChange, className = '' }: { shops: ShopOption[]; value: string; onChange: (id: string) => void; className?: string }) {
  // ร้านเดียว = ไม่มีอะไรให้สลับ
  if (shops.length < 2) return null
  return (
    <FilterDropdown
      icon="building-store"
      value={value}
      options={shops.map((s) => ({ value: s.id, label: s.name }))}
      onChange={onChange}
      className={`max-w-56 ${className}`}
    />
  )
}
