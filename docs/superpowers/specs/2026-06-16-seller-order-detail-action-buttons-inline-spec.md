# StatusHeroV2 — Action Zone Inline (ลบ ⋮ dropdown)

**วันที่:** 2026-06-16 · Component `(paces)/seller/(dashboard)/orders/[token]/components/StatusHero.tsx`
User request: action bar มุมขวาบนแสดงปุ่มตรง ๆ ไม่ต้องมี dropdown.

## เปลี่ยน action zone (เดิม = primary + ⋮ hs-dropdown) → ปุ่ม inline
Outer wrapper แทน `flex shrink-0 items-center gap-2` ด้วย: `flex shrink-0 flex-col gap-2 md:items-end`
- primary sub-group (ปุ่มไม่ destructive): `flex items-center gap-2 flex-wrap`
- cancel = `<CancelOrderButton>` วางตรง ๆ ใน flex-col (row ล่าง, แยก destructive ตาม NN/g); CancelOrderButton คืน null เองสำหรับ CONFIRMED/CANCELLED → ไม่ต้อง wrap condition

### per-state (ปุ่มใน primary sub-group):
- **PENDING + needsShipping('SHIPPED'):** [OrderCopyLink] [SendSmsButton compact] + [CancelOrderButton]; ShipForm full-width ใต้ row (เดิม ไม่เปลี่ยน)
- **PENDING + อื่น:** [SendSmsButton compact (primary, ซ้ายสุด)] [OrderCopyLink] + [CancelOrderButton]
- **SHIPPED:** callout `bg-info/15 text-info rounded p-3 ... text-sm` "รอผู้ซื้อยืนยันรับสินค้า" + [OrderCopyLink] [SendSmsButton compact] + [CancelOrderButton]
- **CONFIRMED:** badge `bg-success/15 text-success` "ออเดอร์สำเร็จแล้ว" + [OrderCopyLink] (CancelOrderButton null)
- **CANCELLED:** badge `bg-danger/15 text-danger` "ออเดอร์ถูกยกเลิกแล้ว" + [OrderCopyLink] (CancelOrderButton null)

## ลบออก
- `hs-dropdown` block ทั้งก้อน (`⋮` trigger + `hs-dropdown-menu` + `dropdown-item` + `dropdown-divider`)
- `Base:` line ที่อ้าง `ui/dropdowns/page.tsx` (แทนด้วย comment อธิบาย inline action zone)
- import ที่ไม่ต้องลบ (hs-dropdown = CSS class). คง import: OrderCopyLink, SendSmsButton, CancelOrderButton, ShipForm, Icon, formatDateTime

## reused component (additive prop — ไม่กระทบ caller อื่น)
- **OrderCopyLink:** เพิ่ม `showPreview?: boolean` (default `true` = behavior เดิม) forward → CopyLinkButton. ใน action zone เรียก `<OrderCopyLink publicToken={publicToken} showPreview={false} />` (preview bar กว้างไปสำหรับ inline)
- **CancelOrderButton:** เพิ่ม `className?: string` (optional) ผสมกับ class เดิม. ใน action zone ส่ง `className="md:w-auto"` (กัน w-full ยักษ์บน desktop; mobile ยัง full-width)
- **SendSmsButton:** `compact` มีอยู่แล้ว ไม่ต้องแก้

## responsive
- desktop (md+): ปุ่มเรียงขวา (`md:items-end`), cancel `md:w-auto`
- mobile (<md): stack; primary group `flex-wrap`; cancel `w-full` (row ล่าง) → ไม่ overflow 360px

## constraints
Paces primitive only; ZERO arbitrary; primary blue ไม่ violet; Anuphan ไม่ font-mono บน Thai; pacesToast; `Base:` comment คง. tsc 0.
