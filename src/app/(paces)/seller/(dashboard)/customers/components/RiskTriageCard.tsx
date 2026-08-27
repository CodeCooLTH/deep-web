'use client'
/**
 * RiskTriageCard — "ต้องจัดการก่อน" บนมือถือ: 3 แถวใหญ่ที่ **กดแล้วกรองได้จริง**
 *
 * Base: theme/paces/.../ecommerce/(sellers)/seller-details/components/SellerContact.tsx:39-70
 *       (แถวไอคอนไทล์ `btn btn-icon bg-light size-8` + label + ค่าชิดขวา)
 * badge ตัวเลข: dashboard/components/OrderStatusBand.tsx:78 (`BADGE_CLS` คลาสเดียวกันเป๊ะ)
 *
 * 🛑 ux เสนอให้เป็น "อ่านอย่างเดียว" แต่ **user เคาะให้กดกรองได้ในรอบนี้เลย** (2026-08-26)
 * เหตุผลที่ user ให้: ไทล์ที่โชว์เลขแล้วกดไม่ได้คือคำเชิญที่ไม่มีปลายทาง
 *
 * 🛑 ตัวเลขต้องมาจาก server ที่นับด้วย `matchesRiskFilter` **ตัวเดียวกับที่กรองจริง**
 * ห้ามนับซ้ำที่นี่ ไม่งั้นกดเลข 2 เข้าไปเจอ 1 (บทเรียน Command Center 2026-08-04)
 */
import Icon from '@/components/wrappers/Icon'
import { RISK_TIER_ICON, RISK_TIER_LABEL, RISK_TIER_TONE } from '@/lib/customer-risk-presentation'
import type { CustomerRiskFilter } from '@/lib/customer-directory'

/** HR7 carve-out: offset ติดลบ + min-w ของ badge ที่ลอยทับมุมไอคอน — ไม่มี token รองรับ
 *  (ค่าเดียวกับ OrderStatusBand.BADGE_CLS เพื่อให้ badge ทั้งแอปหน้าตาเหมือนกัน) */
const BADGE_CLS =
  'absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-danger text-white rounded-full text-2xs font-bold flex items-center justify-center leading-none tabular-nums' // HR7 carve-out: offset ติดลบ + min-w ของ badge ที่ลอยทับมุมไอคอน ไม่มี token รองรับ (ค่าเดียวกับ OrderStatusBand.BADGE_CLS)

type Row = { tier: 'high' | 'watch'; sub: string; count: number }

type Props = {
  rows: Row[]
  /** ค่าที่เลือกอยู่ — แถวที่ตรงกันได้พื้นอ่อนให้รู้ว่ากรองอยู่ */
  active: CustomerRiskFilter
  onPick: (v: CustomerRiskFilter) => void
  /** แถวที่ 3 — ตีกลับ "กับร้านนี้" คนละขอบเขตกับสองแถวบน จึงต้องเขียนกำกับเสมอ (HR16) */
  shopReturned: number
  shopHasParcels: boolean
  onPickShopReturned: () => void
}

export default function RiskTriageCard({
  rows,
  active,
  onPick,
  shopReturned,
  shopHasParcels,
  onPickShopReturned,
}: Props) {
  return (
    <div className="card">
      <div className="card-header !py-3">
        <h4 className="card-title mb-0 flex items-center gap-1.5">
          <Icon icon="solar:danger-triangle-bold-duotone" className="text-primary size-4" aria-hidden="true" />
          ต้องจัดการก่อน
        </h4>
      </div>
      <div className="card-body !p-0">
        {rows.map((r) => (
          <button
            key={r.tier}
            type="button"
            aria-pressed={active === r.tier}
            onClick={() => onPick(active === r.tier ? 'all' : r.tier)}
            className={`border-default-200 flex min-h-11 w-full items-center gap-3 border-b border-dashed px-4 py-3 text-start transition-transform last:border-0 active:scale-95 ${
              active === r.tier ? 'bg-primary/5' : ''
            }`}>
            <span className="relative inline-flex shrink-0 items-center justify-center px-1 py-0.5">
              <Icon icon={RISK_TIER_ICON[r.tier]} className={`${RISK_TIER_TONE[r.tier]} text-3xl`} aria-hidden="true" />
              {r.count > 0 && <span className={BADGE_CLS}>{r.count > 99 ? '99+' : r.count}</span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-default-900 block text-sm font-bold">
                {RISK_TIER_LABEL[r.tier]} <span className="text-default-400 text-xs">(ทั้งระบบ)</span>
              </span>
              <span className="text-default-500 block text-xs">{r.sub}</span>
            </span>
            <Icon icon="solar:alt-arrow-right-linear" className="text-default-400 size-5 shrink-0" aria-hidden="true" />
          </button>
        ))}

        <button
          type="button"
          onClick={onPickShopReturned}
          className="border-default-200 flex min-h-11 w-full items-center gap-3 border-b border-dashed px-4 py-3 text-start transition-transform last:border-0 active:scale-95">
          <span className="relative inline-flex shrink-0 items-center justify-center px-1 py-0.5">
            <Icon icon="solar:box-bold-duotone" className="text-info text-3xl" aria-hidden="true" />
            {shopReturned > 0 && <span className={BADGE_CLS}>{shopReturned > 99 ? '99+' : shopReturned}</span>}
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-default-900 block text-sm font-bold">
              พัสดุตีกลับ <span className="text-default-400 text-xs">(กับร้านนี้)</span>
            </span>
            <span className="text-default-500 block text-xs">
              {shopHasParcels ? 'ควรเก็บเงินปลายทางอย่างระมัดระวัง' : 'ร้านยังไม่เคยเปิดพัสดุผ่าน Deep'}
            </span>
          </span>
          <Icon icon="solar:alt-arrow-right-linear" className="text-default-400 size-5 shrink-0" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
