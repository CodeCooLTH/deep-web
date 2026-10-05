'use client'

/**
 * ShopsCard — ร้านที่รวมในรายงาน (PUT /groups/{id}/shops · debounce 800ms ที่ useAutosave)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card + .card-header เส้นประ)
 *   + theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx (`form-checkbox`)
 *   + src/app/(paces)/seller/(dashboard)/business/line-reports/_components/ShopPicker.tsx (แถวร้านของ wizard)
 *
 * ร้านที่ล็อก/ลบภายหลังคงอยู่ในชุดเสมอ (ไม่ลบเงียบ) — แสดง disabled + เหตุผล · ตัวสุดท้ายที่ใช้งานได้ถอดไม่ได้ · ครบ 10 ร้านที่เหลือ disabled
 * 🛑 ตัดสินปิด/เปิดทุกอย่างผ่าน `settings-guards` ไม่คำนวณใน component
 */
import Icon from '@/components/wrappers/Icon'
import { shopTypeLabel } from '@/lib/line-report/bind-wizard-rules'
import { shopDisabledReason, toggleShop, type ShopRow } from '@/lib/line-report/settings-guards'
import { CheckRow } from './Rows'

export default function ShopsCard({
  rows,
  selected,
  canEdit,
  onChange,
}: {
  rows: ShopRow[]
  selected: string[]
  canEdit: boolean
  onChange: (ids: string[]) => void
}) {
  const okCount = rows.filter((r) => r.state === 'OK').length
  const okSelected = selected.filter((id) => rows.find((r) => r.id === id)?.state === 'OK').length
  return (
    <section className="card rounded-xl border border-default-300 shadow-sm order-1">
      <div className="card-header">
        <h5 className="card-title flex items-center gap-2">
          <Icon icon="building-store" className="text-primary text-lg" aria-hidden="true" />
          ร้านที่รวมในรายงาน
        </h5>
      </div>
      <div className="card-body">
        <p className="text-default-700 mb-2 text-xs">เลือก 1 ร้านเป็นรายงานของสาขา เลือกหลายร้านเป็นรายงานรวมพร้อมแยกรายร้าน</p>
        {rows.map((r) => {
          const reason = shopDisabledReason(rows, selected, r.id, canEdit)
          return (
            <CheckRow
              key={r.id}
              checked={selected.includes(r.id)}
              disabled={!canEdit || reason !== null}
              onChange={() => onChange(toggleShop(rows, selected, r.id))}
              label={r.name}
              sub={r.state !== 'OK' ? reason : reason ? `${shopTypeLabel(r)} · ${reason}` : shopTypeLabel(r)}
            />
          )
        })}
        <p className="text-default-700 mt-1 mb-0 text-xs">
          เลือกแล้ว {okSelected} จาก {okCount} ร้าน
        </p>
      </div>
    </section>
  )
}
