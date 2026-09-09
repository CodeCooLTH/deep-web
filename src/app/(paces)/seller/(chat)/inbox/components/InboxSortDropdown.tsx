'use client'

/**
 * InboxSortDropdown — ตัวเลือกการเรียงลำดับกล่องแชท (00018 ส่วนขยาย 2026-09-09)
 *
 * เอกสาร: docs/20 - Features/00018 …/EXTENSIONS-2026-09-09-inbox-sort-mode.md
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (SingleButtonDropdowns)
 *       ผ่าน InboxFilterPanel.tsx (ปุ่ม trigger + popover inset-x-0) และ
 *       PageFilterDropdown.tsx (แถวตัวเลือก 2 บรรทัด label + คำอธิบาย)
 *
 * ทำไมไม่ใช่ FilterDropdown กลาง: `FilterOption` ของตัวนั้นมีแค่ `label` บรรทัดเดียว (+badge)
 * ขณะที่สองโหมดนี้ "ชื่อเฉย ๆ แยกไม่ออก" — ผู้ใช้ต้องอ่านคำอธิบายถึงจะรู้ว่าต่างกันตรงไหน
 * ถ้าไม่มีคำอธิบาย เขาต้องลองสลับดูเองซึ่งเป็นการทดลองกับรายการงานจริง
 *
 * 🛑 ไม่มี `relative` ที่ root โดยตั้งใจ — popover อ้างอิง "แถวตัวกรอง" (relative อยู่ที่ InboxList)
 * เพื่อให้กว้างเท่าแถวพอดี ไม่ล้น Chat Rail (320px)/ขอบจอมือถือ กติกาเดียวกับ InboxFilterPanel
 * ทุกตัวอักษร (ที่นี่ต่างจาก popover ที่เกาะปุ่มในหน้าอื่น เพราะรางแชทแคบกว่าเมนูเสมอ)
 */
import { useEffect, useRef } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { INBOX_SORT_MODES, type InboxSortMode } from '@/lib/inbox-sort'

type Props = {
  value: InboxSortMode
  onChange: (next: InboxSortMode) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function InboxSortDropdown({ value, onChange, open, onOpenChange }: Props) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)

  // ปิดเมื่อคลิกนอกแผง **และเมื่อกด Escape** — แพตเทิร์นเดียวกับ InboxFilterPanel:176 /
  // PageFilterDropdown:103 (Preline inline-state ใช้ไม่ได้ เพราะ parent re-render บ่อยจาก
  // fetch/realtime ดู comment หัว FilterDropdown.tsx)
  //
  // 🛑 Escape ต้องอยู่ที่นี่ ไม่ใช่ฝากตัวกลาง — `InboxList` มี handler ของตัวเองอยู่ 2 ตัว
  // (แถว kebab บรรทัด 454 และเมนูกลุ่มบรรทัด 590) แต่ทั้งคู่ผูกกับ state คนละตัว ไม่ครอบ 'sort'
  // ก็อปโครงมาจาก sibling แล้วตกกลไกนี้ไป = ผู้ใช้คีย์บอร์ดล้วนเปิดเมนูแล้วปิดไม่ได้
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  const OPTIONS: { mode: InboxSortMode; label: string; description: string; icon: string }[] = [
    {
      mode: 'LAST_MESSAGE',
      label: t.inbox.sort.optionAllLabel,
      description: t.inbox.sort.optionAllDescription,
      icon: 'messages',
    },
    {
      mode: 'LAST_CUSTOMER_MESSAGE',
      label: t.inbox.sort.optionCustomerLatestLabel,
      description: t.inbox.sort.optionCustomerLatestDescription,
      icon: 'user-question',
    },
  ]
  const active = OPTIONS.find((o) => o.mode === value) ?? OPTIONS[0]!

  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        // aria-label พูดทั้ง "นี่คือตัวเรียงลำดับ" และ "ตอนนี้เรียงแบบไหน" — ป้ายบนปุ่มบอกแค่
        // ชื่อโหมด ซึ่งอ่านลอย ๆ ด้วยเสียงแล้วไม่รู้ว่าเป็นตัวกรองหรือตัวเรียง
        aria-label={`${t.inbox.sort.triggerAriaLabel}: ${active.label}`}
        className={`btn btn-sm bg-card inline-flex items-center gap-2 border ${
          value !== 'LAST_MESSAGE' || open ? 'border-primary text-primary' : 'border-default-300 text-default-800'
        }`}
      >
        <Icon icon="arrows-sort" className="size-4" />
        <span className="max-w-40 truncate">{active.label}</span>
        <Icon icon={open ? 'chevron-up' : 'chevron-down'} className="size-3.5" />
      </button>

      {open && (
        <div
          className="border-default-300 bg-card absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border shadow-lg"
          role="menu"
          aria-label={t.inbox.sort.triggerAriaLabel}
        >
          <div className="space-y-0.5 p-1">
            {OPTIONS.map((o) => {
              const selected = o.mode === value
              return (
                <button
                  key={o.mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    // เลือกแล้วมีผลทันที ไม่มีปุ่ม "ใช้" — ต่างจากแผงตัวกรองที่ปรับหลายค่าพร้อมกัน
                    // ตัวนี้มีค่าเดียวและย้อนกลับได้ในคลิกเดียว
                    onChange(o.mode)
                    onOpenChange(false)
                  }}
                  className={`dropdown-item w-full items-start text-start ${selected ? 'active' : ''}`}
                >
                  {selected ? (
                    <Icon icon="check" className="text-primary mt-0.5 size-4 shrink-0" />
                  ) : (
                    <span className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  )}
                  <span className="bg-default-100 text-default-700 flex size-8 shrink-0 items-center justify-center rounded-full">
                    <Icon icon={o.icon} width={16} height={16} />
                  </span>
                  <span className="min-w-0 flex-1 text-start">
                    <span className="text-default-900 block truncate text-sm font-medium">{o.label}</span>
                    {/* คำอธิบาย "ห้าม truncate" ต่างจากแถวชื่อเพจที่ Base มา — ชื่อเพจตัดท้ายแล้วยังเดาออก
                        แต่ประโยคอธิบายที่ถูกตัดครึ่งคือประโยคที่อ่านไม่รู้เรื่อง */}
                    <span className="text-default-700 block text-xs">{o.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** เผื่อผู้เรียกอยากวนสร้างอย่างอื่นจากลำดับเดียวกัน — ลำดับใน UI ต้องตรงกับ SSOT เสมอ */
export const INBOX_SORT_ORDER = INBOX_SORT_MODES
