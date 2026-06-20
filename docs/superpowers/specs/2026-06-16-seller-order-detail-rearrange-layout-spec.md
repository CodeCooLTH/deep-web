# Seller Order Detail — Layout Re-arrange (70/30, action-bar top)

**วันที่:** 2026-06-16 · **Route:** `(paces)/seller/(dashboard)/orders/[token]`
**Docs:** `theme/paces/Docs/index.html` + `docs/system/ui-guideline/paces-component-reference.md`
ต่อยอดจาก Option D (StatusHeroV2 + CancelZone). **เป็น re-arrange เท่านั้น — ห้ามแตะ internals ของ component ใด ๆ.**

## เป้าหมาย
ย้าย StatusHeroV2 เป็น full-width top bar เหนือ grid; จัด cards ใหม่ใน grid 70/30 (คง `lg:grid-cols-4`); ย้าย cancel เข้า `⋮` overflow menu; ลบ CancelZone card.

## Layout (desktop)
```
[ PageBreadcrumb ]
[ StatusHeroV2 — full-width (title ซ้าย + action bar ขวา: CTA + ⋮ incl. ยกเลิก) ]
┌─ LEFT lg:col-span-3 (70%) ──┬─ RIGHT col-span-1 (30%) ─┐
│ CustomerDetails              │ ShippingAddress (conditional) │
│ OrderSummary                 │ PaymentCard                   │
│ OrderReviewCard              │ ShippingActivity              │
└──────────────────────────┴──────────────────────┘
```
Mobile (<lg) single column = source order: StatusHeroV2 → CustomerDetails → OrderSummary → OrderReviewCard → ShippingAddress → PaymentCard → ShippingActivity. ไม่ใช้ `order-*` (source order = render order; a11y).

## page.tsx structure
- `<StatusHero .../>` ย้ายออกจาก left column มาอยู่ **เหนือ** `<div className="grid ...">` (full-width, นอก column).
- `<div className="grid grid-cols-1 lg:grid-cols-4 gap-base mt-base">` (เพิ่ม `mt-base` คั่นจาก top bar — token ไม่ใช่ arbitrary).
  - Left: `<div className="space-y-base lg:col-span-3">` = CustomerDetails → OrderSummary → OrderReviewCard
  - Right: `<div className="space-y-base">` = `{shippingAddr && <ShippingAddress/>}` → PaymentCard → ShippingActivity
- **PRESERVE prop expressions เดิมทุกตัวแบบ verbatim** — แค่ย้าย JSX block ไม่เขียน props ใหม่.
- ลบ `import CancelZone` + `<CancelZone/>`.
- **S-C1 PII block (maskContactLocal + `order.buyerContact = null` + `order.review.reviewerContact = null`) คงเดิมตำแหน่งเดิม — ห้ามแตะ.**

## StatusHero.tsx — เพิ่ม cancel danger-item ใน hs-dropdown
- `import CancelOrderButton from './CancelOrderButton'`
- ใน `hs-dropdown-menu > div.space-y-0.5.p-1` หลัง items เดิม:
```tsx
{(isPending || isShipped) && (
  <>
    <hr className="dropdown-divider" />
    <div role="none" className="px-1 py-0.5">
      <CancelOrderButton publicToken={publicToken} status={status} />
    </div>
  </>
)}
```
- ใช้ plain `div role="none"` (ไม่ใช่ `dropdown-item`) กัน double padding/hover เพราะ CancelOrderButton มี `btn ... w-full` style ของตัวเอง.
- StatusHeroV2 มี `status`/`publicToken`/`isPending`/`isShipped` อยู่แล้ว — ไม่เพิ่ม prop.
- NN/g: divider แยก cancel จาก primary (Shopify/Stripe "destructive in More menu" pattern).

## CancelZone removal
ลบ `components/CancelZone.tsx` + import + JSX ใน page.tsx. `rg "CancelZone" src/` = 0 (เว้น comment) หลังลบ; tsc 0.

## Theme Source Mapping
| Section | Theme | Class |
|---|---|---|
| Grid | order-details/page.tsx | `grid grid-cols-1 lg:grid-cols-4 gap-base` + `mt-base` |
| Left | เดียวกัน | `space-y-base lg:col-span-3` |
| Right | เดียวกัน | `space-y-base` (auto col-span-1) |
| dropdown divider | ui/dropdowns/page.tsx | `<hr className="dropdown-divider" />` |
| cancel wrapper | paces-component-reference §3 | `<div role="none" className="px-1 py-0.5">` |
| spacing token | paces-component-reference §8 | `--spacing-base`=20px; ห้าม `gap-[20px]`/`mt-[20px]` |

## Developer Do/Don't
**DO:** ย้าย StatusHero เหนือ grid; `mt-base`; left=CustomerDetails→OrderSummary→OrderReviewCard; right={shippingAddr&&ShippingAddress}→PaymentCard→ShippingActivity; import+เพิ่ม cancel ใน dropdown; ลบ CancelZone; preserve prop เดิม verbatim; คง S-C1.
**DON'T:** เปลี่ยน 70/30→50/50; แตะ internals ของ component ใด; arbitrary value; เพิ่ม prop ใหม่ให้ StatusHeroV2; `<a dropdown-item>` ห่อ cancel; react-toastify; violet #7367F0.

## Open (verify ตอน QA)
- visual `mt-base` rhythm; CancelOrderButton `w-full` ใน dropdown menu (min-w-44) ดูเหมาะไหม; hs-dropdown placement บน mobile narrow.
