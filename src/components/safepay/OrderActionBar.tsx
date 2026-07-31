/**
 * OrderActionBar — แถบ action ของหน้ารายละเอียดคำสั่งซื้อ (seller), S-5 (<1024) + S-6 (≥1024)
 *
 * render ได้ 2 ตำแหน่งจาก **ชุดข้อมูลเดียวกัน** (`actionSet` ที่คำนวณมาจาก `getOrderActionSet()`
 * — order-action-set.ts, T5 contract) — ไฟล์นี้ไม่มี status conditional ใด ๆ เอง (dumb component,
 * page เป็นคนเลือกว่าจะ mount variant ไหนตรงไหน + ต่อ business logic จริงใน T11):
 *
 *   - variant="bottom" — แถบเต็มความกว้างติดล่าง (<1024) แทนที่ SellerBottomNav ที่ถูกซ่อนไปแล้ว
 *   - variant="inline" — แถวปุ่มในมุมขวาบนของการ์ดหัวหน้า (≥1024)
 *
 * (เดิมมี variant="stuck" ตัวที่ 3 สำหรับแถบตรึงใต้ topbar — T11 ลบออก: StatusHero.tsx (T7) ห่อ
 * sticky wrapper ของ "แถบตรึง" เอง แล้วใช้ variant="inline" ข้างในแทน ไม่ใช้ variant="stuck" ตรง ๆ
 * เพราะ .stuck ประกอบเป็น bar เต็มตัว [sticky/w-full/justify-end] ไม่มีช่องแทรก "who" (badge+เลข+
 * ยอด) เป็น sibling — ดู comment หัวไฟล์ StatusHero.tsx. `stuckVisible` prop จึงไม่มีใครใช้ ลบทิ้ง
 * ด้วยกัน เป็น dead code ตั้งแต่เขียน ไม่เคยถูกเรียกจริง)
 *
 * ทำไมไม่ใช่ 2 component แยก: design §3 บังคับ "ชุดปุ่มเดียวกัน render จากฟังก์ชันเดียว ห้ามเขียน
 * markup ซ้ำ" — GhostButton/PrimaryButton (sub-render ภายในไฟล์นี้) ใช้ร่วมกันทั้ง 2 variant
 * ต่างกันแค่ "เปลือก" (fixed bar เต็มความกว้าง vs แถวเปล่าในการ์ด) + ขนาดปุ่ม (44px แถบล่าง ตาม
 * tap-target / 37px inline ตาม token `.btn-icon`) + inline แสดง label เสมอ ส่วนแถบล่างสลับ
 * icon-only↔label ตามว่ามี primary หรือไม่ (ไม่ให้แถบดูโหว่)
 *
 * ⋮ = OrderOverflowMenu (page-specific — order-action-set.ts, custom dropdown pattern)
 * "ไม่มี action เลย" (CANCELLED) → return null ทั้งก้อน ไม่ใช่แถบว่าง (design §3)
 *
 * Base: docs/superpowers/specs/2026-07-30-seller-order-detail-v5-mockup.html
 *   .abar/.abar .p/.abar .g/.abar.noprimary/.hd-acts + actionBar()/headerActions()
 * Base (primitive ปุ่ม min-h-11=44px + click-outside dropdown): orders/components/BulkActionBar.tsx,
 *   orders/components/OrderCardMenu.tsx
 * Base (เงาบน + safe-area — arbitrary โดยเจตนา, Paces ไม่มี token): _shared/SellerBottomNav.tsx:186,195
 */

import Icon from '@/components/wrappers/Icon'
import OrderOverflowMenu from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderOverflowMenu'
import type { ActionItem, OrderActionSet } from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/order-action-set'

export type OrderActionBarVariant = 'bottom' | 'inline'

export interface OrderActionBarProps {
  variant: OrderActionBarVariant
  /** ชุด action ที่ getOrderActionSet() คำนวณไว้แล้ว — ไฟล์นี้แค่ render ไม่ตัดสินเอง */
  actionSet: OrderActionSet
  /** page เป็นคนต่อ logic จริง (ยิง API/Swal confirm/เปิด modal ฯลฯ) — component นี้ไม่มี business logic */
  onAction: (key: string) => void
}

interface ButtonProps {
  item: ActionItem
  onAction: (key: string) => void
}

// ปุ่มรอง — icon-only 44px (แถบล่างตอนมี primary) หรือ icon+label (inline/stuck/แถบล่างตอนไม่มี primary)
function GhostButton({ item, onAction, size, iconOnly }: ButtonProps & { size: 'sm' | 'lg'; iconOnly: boolean }) {
  const base = 'btn border border-default-300 text-default-700 hover:bg-default-100'
  if (iconOnly) {
    // .btn-icon = size-9.25 (37px) default; min-h-11/min-w-11 ชนะ (min-width ชนะ width ที่เล็กกว่าตาม
    // CSS spec) → ได้ 44px จริงโดยไม่ต้องเติม arbitrary size ใหม่ (pattern เดียวกับ OrderCardMenu.tsx)
    const sizeClass = size === 'lg' ? 'min-h-11 min-w-11' : ''
    return (
      <button
        type="button"
        onClick={() => onAction(item.key)}
        aria-label={item.label}
        title={item.label}
        className={`${base} btn-icon justify-center ${sizeClass}`}
      >
        <Icon icon={item.icon} className="text-lg" />
      </button>
    )
  }
  const heightClass = size === 'lg' ? 'min-h-11 flex-1' : ''
  return (
    <button type="button" onClick={() => onAction(item.key)} className={`${base} inline-flex items-center justify-center gap-1.5 ${heightClass}`}>
      <Icon icon={item.icon} className="text-lg" />
      <span>{item.label}</span>
    </button>
  )
}

// ปุ่มหลัก (น้ำเงิน) — ≤1 ตัวต่อสถานะเสมอ (One Voice, มาจาก actionSet.primary ที่คำนวณแล้ว)
function PrimaryButton({ item, onAction, size }: ButtonProps & { size: 'sm' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'min-h-11 flex-1' : ''
  return (
    <button
      type="button"
      onClick={() => onAction(item.key)}
      className={`btn bg-primary hover:bg-primary-hover text-white inline-flex items-center justify-center gap-1.5 ${sizeClass}`}
    >
      <Icon icon={item.icon} className="text-lg" />
      <span>{item.label}</span>
    </button>
  )
}

export default function OrderActionBar({ variant, actionSet, onAction }: OrderActionBarProps) {
  const { primary, ghosts, menu } = actionSet

  // ไม่มี action เลย (CANCELLED) → ไม่ render อะไรทั้งก้อน ไม่ใช่แถบว่าง (design §3 บังคับ)
  if (!primary && ghosts.length === 0 && menu.length === 0) return null

  if (variant === 'bottom') {
    // ไม่มี primary (SHIPPED/CONFIRMED) → ปุ่มรองยืดแทนพร้อม label กันแถบดูโหว่ (design §3 "noprimary")
    const ghostShowsLabel = !primary
    return (
      <div
        className={[
          // <1024 เท่านั้น — ≥1024 action ย้ายไปมุมขวาบนของการ์ดหัวหน้า + แถบตรึง (variant="inline" ทั้งคู่ — ดู StatusHero.tsx)
          'lg:hidden',
          'fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 bg-card px-3 pt-2.5',
          // เงาบน — arbitrary โดยเจตนา (Paces ไม่มี token เงาด้านบน) ค่าเดียวกับ SellerBottomNav.tsx:186
          'shadow-[0_-4px_16px_-6px_rgba(47,43,61,0.10)]',
          // safe-area iOS notch/home bar รวมกับ padding-bottom ปกติ 10px (py-2.5) — pattern เดียวกับ
          // SellerBottomNav.tsx:195 (arbitrary โดยเจตนา ไม่มี token แทน)
          'pb-[calc(0.625rem+env(safe-area-inset-bottom))]',
        ].join(' ')}
      >
        {ghosts.map((g) => (
          <GhostButton key={g.key} item={g} onAction={onAction} size="lg" iconOnly={!ghostShowsLabel} />
        ))}
        {primary && <PrimaryButton item={primary} onAction={onAction} size="lg" />}
        <OrderOverflowMenu items={menu} onAction={onAction} size="lg" dropDirection="up" />
      </div>
    )
  }

  // variant === 'inline' — แถวเปล่า ไม่มี wrapper ตำแหน่งเอง (วางในมุมขวาบนของการ์ดหัวหน้า หรือใน
  // sticky wrapper ของแถบตรึง — ทั้งคู่คุม chrome/ตำแหน่งเอง ที่นี่ render แค่แถวปุ่ม)
  return (
    <div className="hidden items-center gap-2 lg:flex">
      {ghosts.map((g) => (
        <GhostButton key={g.key} item={g} onAction={onAction} size="sm" iconOnly={false} />
      ))}
      {primary && <PrimaryButton item={primary} onAction={onAction} size="sm" />}
      <OrderOverflowMenu items={menu} onAction={onAction} size="sm" dropDirection="down" />
    </div>
  )
}
