# Seller Order Detail — Option D: StatusHeroV2 + CancelZone

**วันที่:** 2026-06-16 · **Route:** `src/app/(paces)/seller/(dashboard)/orders/[token]/`
**Theme:** Paces (Preline 4 + Tailwind 4) · **Docs:** `theme/paces/Docs/index.html` + `docs/system/ui-guideline/paces-component-reference.md` + `docs/conventions/paces-toast.md`

---

## Component 1 — StatusHeroV2 (modify `components/StatusHero.tsx`)

Card เดียวรวม info zone (ซ้าย) + action zone (ขวา). ไม่มี card-header. Mobile stacked / Desktop `md:flex-row md:items-center md:justify-between`.

### Prop ที่เพิ่มกลับ
`fulfillmentMode: string` (ค่า Prisma enum `FulfillmentMode`: `SHIPPED`|`NO_SHIPPING`|`DIGITAL`|`SERVICE`). Source: `order.fulfillmentMode` ใน page.tsx. **ห้ามตัดออก — ใช้ตัดสิน primary CTA ทั้งหมด.**

### Per-state CTA + overflow
| State | Primary zone | ⋮ overflow |
|---|---|---|
| PENDING + fulfillmentMode==='SHIPPED' | toggle button "บันทึกการจัดส่ง"/"ซ่อนฟอร์มจัดส่ง" → ShipForm expand inline | คัดลอกลิงก์ + ส่ง SMS |
| PENDING + อื่น (NO_SHIPPING/DIGITAL/SERVICE) | `<SendSmsButton publicToken={publicToken} />` | คัดลอกลิงก์ |
| SHIPPED | callout `bg-info/15 text-info rounded p-3` "รอผู้ซื้อยืนยันรับสินค้า" | คัดลอกลิงก์ + ส่ง SMS |
| CONFIRMED | badge `bg-success/15 text-success` "ออเดอร์สำเร็จแล้ว" | คัดลอกลิงก์ |
| CANCELLED | badge `bg-danger/15 text-danger` "ออเดอร์ถูกยกเลิกแล้ว" | คัดลอกลิงก์ |

### Full skeleton (developer transcribe)
```tsx
/**
 * StatusHeroV2 — สถานะ + action zone ใน card เดียว (Option D — Action-Prominent Lean)
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx (card shell + md:flex)
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (hs-dropdown markup)
 * Base: StatusHero.tsx เดิม (info zone คัดลอก 100%)
 */
'use client'
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import ShipForm from './ShipForm'
import SendSmsButton from './SendSmsButton'
import OrderCopyLink from './OrderCopyLink'

export const STATUS_META: Record<string, { label: string; cls: string; icon: string }> = {
  PENDING:   { label: 'รอดำเนินการ', cls: 'bg-warning/15 text-warning', icon: 'clock' },
  SHIPPED:   { label: 'จัดส่งแล้ว',  cls: 'bg-info/15 text-info',       icon: 'truck' },
  CONFIRMED: { label: 'สำเร็จ',      cls: 'bg-success/15 text-success', icon: 'circle-check-filled' },
  CANCELLED: { label: 'ยกเลิก',      cls: 'bg-danger/15 text-danger',   icon: 'circle-x' },
}
export const TYPE_META: Record<string, { label: string; icon: string; cls: string }> = {
  PHYSICAL: { label: 'สินค้าจับต้องได้', icon: 'package',        cls: 'bg-primary/15 text-primary' },
  DIGITAL:  { label: 'ดิจิทัล',          icon: 'cloud-download', cls: 'bg-info/15 text-info' },
  SERVICE:  { label: 'บริการ',            icon: 'tool',           cls: 'bg-success/15 text-success' },
}
export interface StatusHeroV2Props {
  publicToken: string; status: string; type: string; createdAtISO: string; fulfillmentMode: string
}
export default function StatusHeroV2({ publicToken, status, type, createdAtISO, fulfillmentMode }: StatusHeroV2Props) {
  const s = STATUS_META[status] ?? { label: status, cls: 'bg-default-100 text-default-700', icon: 'help-circle' }
  const t = TYPE_META[type]   ?? { label: type,   cls: 'bg-default-100 text-default-700', icon: 'help-circle' }
  const [showShipForm, setShowShipForm] = useState(false)
  const createdDisplay = formatDateTime(createdAtISO)
  const isPending = status === 'PENDING', isShipped = status === 'SHIPPED'
  const isConfirmed = status === 'CONFIRMED', isCancelled = status === 'CANCELLED'
  const needsShipping = fulfillmentMode === 'SHIPPED'
  return (
    <div className="card">
      <div className="card-body p-4 sm:p-7.5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* ซ้าย: info zone — คัดลอกจาก StatusHero.tsx */}
          <div className="flex flex-col gap-1.25">
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`badge badge-label text-2xs font-semibold ${s.cls}`}><Icon icon={s.icon} className="text-sm" />{s.label}</span>
              <span className={`badge badge-label text-2xs font-semibold ${t.cls}`}><Icon icon={t.icon} className="text-sm" />{t.label}</span>
            </div>
            {/* ห้าม font-mono — Anuphan ไม่มี mono → Courier fallback หลุดธีม */}
            <h3 className="text-lg mb-0 text-default-800">ออเดอร์ #{publicToken.slice(0, 8)}</h3>
            <p className="text-default-400 text-sm flex items-center gap-1 mb-0"><Icon icon="calendar" className="align-middle" />{createdDisplay}</p>
          </div>
          {/* ขวา: action zone */}
          <div className="flex shrink-0 items-center gap-2">
            {isPending && needsShipping && (
              <button type="button" onClick={() => setShowShipForm((v) => !v)} className="btn bg-primary text-white hover:bg-primary-hover w-full md:w-auto">
                <Icon icon="truck" className="size-4.5" />{showShipForm ? 'ซ่อนฟอร์มจัดส่ง' : 'บันทึกการจัดส่ง'}
              </button>
            )}
            {isPending && !needsShipping && (<SendSmsButton publicToken={publicToken} />)}
            {isShipped && (
              <div className="bg-info/15 text-info rounded p-3 flex items-center gap-2 text-sm font-medium"><Icon icon="clock" className="shrink-0" />รอผู้ซื้อยืนยันรับสินค้า</div>
            )}
            {isConfirmed && (<span className="badge bg-success/15 text-success flex items-center gap-1.5"><Icon icon="circle-check-filled" className="text-base" />ออเดอร์สำเร็จแล้ว</span>)}
            {isCancelled && (<span className="badge bg-danger/15 text-danger flex items-center gap-1.5"><Icon icon="circle-x" className="text-base" />ออเดอร์ถูกยกเลิกแล้ว</span>)}
            {/* ⋮ hs-dropdown static card [--placement:bottom-right]; fallback OrderCardMenu.tsx ถ้า opacity ค้าง */}
            <div className="hs-dropdown relative inline-flex [--placement:bottom-right]">
              <button type="button" className="hs-dropdown-toggle btn btn-icon border border-default-300 bg-card hover:bg-default-100 text-default-700" aria-haspopup="menu" aria-expanded="false" aria-label="เมนูเพิ่มเติม">
                <Icon icon="dots-vertical" className="size-4" />
              </button>
              <div className="hs-dropdown-menu" role="menu" aria-orientation="vertical">
                <div className="space-y-0.5 p-1">
                  <div className="dropdown-item" role="none"><OrderCopyLink publicToken={publicToken} /></div>
                  {(isShipped || (isPending && needsShipping)) && (
                    <><hr className="dropdown-divider" /><div className="p-0" role="none"><SendSmsButton publicToken={publicToken} compact /></div></>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* ShipForm inline-expand — นอก flex row กัน layout jump */}
        {isPending && needsShipping && showShipForm && (
          <div className="mt-3 border-t border-default-200 pt-3"><ShipForm publicToken={publicToken} /></div>
        )}
      </div>
    </div>
  )
}
```

**Developer ตรวจก่อน:** SendSmsButton รองรับ prop `compact` ไหม; OrderCopyLink render เป็น `<button>` หรือ `<a>` (ถ้า `<button>` → `role="none"` บน wrapper div ตามที่ใส่ไว้แล้ว). ถ้า prop signature ไม่ตรง → **หยุด+flag Controller** (ห้ามแก้ internals ของ component reuse).

---

## Component 2 — CancelZone (new `components/CancelZone.tsx`)

```tsx
/**
 * CancelZone — danger zone card ยกเลิกออเดอร์ (แยกจาก OrderActionPanel)
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx (card + card-header + card-body)
 * card variant: border border-dashed border-danger (Paces danger zone)
 */
'use client'
import Icon from '@/components/wrappers/Icon'
import CancelOrderButton from './CancelOrderButton'

interface CancelZoneProps { publicToken: string; status: string }

export default function CancelZone({ publicToken, status }: CancelZoneProps) {
  if (status !== 'PENDING' && status !== 'SHIPPED') return null
  return (
    <div className="card border border-dashed border-danger">
      <div className="card-header">
        <h4 className="card-title flex items-center gap-1.5 text-danger"><Icon icon="tabler:alert-triangle" className="text-base" />โซนอันตราย</h4>
      </div>
      <div className="card-body flex flex-col gap-3">
        <p className="text-sm text-default-500">การยกเลิกออเดอร์ไม่สามารถย้อนกลับได้<br />กรุณายืนยันก่อนดำเนินการ</p>
        <CancelOrderButton publicToken={publicToken} status={status} />
      </div>
    </div>
  )
}
```

**Developer ตรวจก่อน:** `CancelOrderButtonProps` ต้องเป็น `{ publicToken: string; status: string }` — ถ้าไม่ตรง → flag Controller.

---

## page.tsx wiring (T4)
- `import StatusHeroV2 from './components/StatusHero'` (default export ชื่อใหม่); ส่ง `fulfillmentMode={order.fulfillmentMode}` เพิ่ม
- `import CancelZone from './components/CancelZone'`; วางในลำดับ sidebar: CustomerDetails → PaymentCard → ShippingAddress → **CancelZone** → OrderReviewCard (CancelZone อยู่ก่อน OrderReviewCard ตาม ux; ปรับได้ตาม visual QA ขอให้ "ท้าย sidebar")
- ลบ `import OrderActionPanel` + การ render
- **ห้ามแตะ block PII mask (S-C1)**

## Theme Source Mapping
| Section | Theme file | Class/Primitive |
|---|---|---|
| StatusHeroV2 shell | order-details/components/OrderSummary.tsx | `card` + `card-body p-7.5` + `md:flex` |
| info zone | StatusHero.tsx เดิม | badges/h3/p คัดลอก 100% |
| ⋮ trigger | order-details/components/CustomerDetails.tsx + ui/dropdowns/page.tsx | `hs-dropdown [--placement:bottom-right]` + `btn btn-icon` |
| dropdown menu/item | ui/dropdowns/page.tsx | `hs-dropdown-menu` `dropdown-item` `dropdown-divider` |
| primary btn | paces-component-reference §1 | `btn bg-primary text-white hover:bg-primary-hover w-full md:w-auto` |
| SHIPPED callout | OrderActionPanel.tsx (harvest) | `bg-info/15 text-info rounded p-3` |
| badges | paces-component-reference §6 | `badge bg-{semantic}/15 text-{semantic}` |
| CancelZone shell | order-details/components/CustomerDetails.tsx | `card border border-dashed border-danger` |
| CancelZone CTA | CancelOrderButton.tsx | reuse as-is |

## Developer Do / Don't
**DO:** `'use client'`; คัดลอก info zone จาก StatusHero เดิม; `[--placement:bottom-right]`; Icon ผ่าน `@/components/wrappers/Icon`; `formatDateTime` จาก `@/lib/format-date`; `pacesToast` เท่านั้น; `rounded` (4px) บน callout; `Base:` comment.
**DON'T:** arbitrary value (`text-[]`/`bg-[]`/`rounded-[]`/`shadow-[]`); `#7367F0`/violet; `font-mono` บน Thai; แตะ internals ของ ShipForm/SendSmsButton/OrderCopyLink/CancelOrderButton; drop `fulfillmentMode`; `react-toastify`; เพิ่ม card-header บน StatusHeroV2; ย้าย ShipForm เข้า action zone ขวา.

## Open Questions → resolved
- OrderActionPanel ลบใน T3+T4 (bundle commit เดียวกับ wiring)
- hs-dropdown fallback = OrderCardMenu.tsx pattern (custom React) ถ้า QA พบ opacity ค้างหลัง router.refresh — ไม่ต้องถาม ux ใหม่
