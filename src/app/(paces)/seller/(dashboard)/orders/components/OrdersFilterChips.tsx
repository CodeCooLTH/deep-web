/**
 * OrdersFilterChips — แถวชิป "ตัวกรองที่ใช้อยู่" ใต้แถบเครื่องมือ (เดสก์ท็อปและมือถือใช้ตัวเดียวกัน)
 *
 * กด × = ล้างแกนนั้นทันที (ไม่เปิดโมดัล) · `ล้างทั้งหมด` = ล้างทุกแกนทันที แต่คงคำค้น
 * ไม่มีชิป = ไม่ render อะไรเลย
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (rounded pill badge + soft color)
 * ปุ่ม × เป็น <button> จริง ไม่ใช่ span (docs/conventions/aria-name-requires-supporting-role.md)
 */
'use client'

import AdThumb from '@/components/safepay/AdThumb'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'

export type FilterChip = {
  key: string
  /** "ชื่อแกน: ค่า" */
  label: string
  /** ชื่อแกนสำหรับ aria-label ปุ่ม × */
  axis: string
  /** ชิปโฆษณาตัวเดียว = รูปย่อนำหน้า */
  adThumb?: { photoFileId: string | null }
  onRemove: () => void
}

export default function OrdersFilterChips({
  chips,
  onClearAll,
  trailing,
  scroll = false,
}: {
  chips: FilterChip[]
  onClearAll: () => void
  /** ข้อความชิดขวา (เดสก์ท็อป: "42 / 1,286 ออเดอร์") */
  trailing?: string
  /** มือถือ: เลื่อนแนวนอนบรรทัดเดียว */
  scroll?: boolean
}) {
  const t = useT()
  if (chips.length === 0) return null
  return (
    <div
      className={cn(
        'flex items-center gap-2',
        scroll ? 'overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden' /* ซ่อน scrollbar Safari/Chrome — Tailwind ไม่มี token */ : 'flex-wrap pt-3',
      )}
    >
      {chips.map((c) => (
        <span
          key={c.key}
          className="border-default-200 bg-default-100 text-default-800 inline-flex max-w-xs shrink-0 items-center gap-1.5 rounded-full border py-0.5 ps-3 pe-0.5 text-xs font-medium"
        >
          {c.adThumb && <AdThumb photoFileId={c.adThumb.photoFileId} className="size-5 rounded-full" iconClass="text-xs" />}
          <span className="truncate">{c.label}</span>
          <button
            type="button"
            onClick={c.onRemove}
            aria-label={fmt(t.ordersFilter.chipRemove, { name: c.axis })}
            className="hover:bg-default-200 inline-flex size-11 items-center justify-center rounded-full lg:size-6"
          >
            <Icon icon="x" className="text-xs" aria-hidden="true" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-primary-ink hover:bg-primary/10 inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-xs font-semibold lg:min-h-0 lg:py-1"
      >
        {t.ordersFilter.clearAll}
      </button>
      {trailing && <span className="text-default-500 ms-auto shrink-0 text-xs tabular-nums">{trailing}</span>}
    </div>
  )
}
