# Design Spec — Seller Mobile Command Center V3 (developer-ready)

> วันที่: 2026-06-07 | สถานะ: UX gate PASSED (theme-mapping refreshed ตรง V3)
> Page: `/dashboard` mobile/tablet (`lg:hidden`, ≤1024px)
> Master plan: `docs/superpowers/plans/2026-06-07-seller-mobile-command-center-build.md`
> Visual ground truth: `docs/mockups/home/command-center-v3.html`
> Spec เดิม (content decisions): `docs/superpowers/specs/2026-06-07-seller-mobile-command-center-design.md`
> หมายเหตุ: spec นี้ refresh §Theme Sourcing จาก V2 → V3. theme mapping ที่นี่ override ของเดิม

---

## User stories ที่ครอบ
- S-7 shell mobile แสดง command center แทน desktop dashboard
- S-8 hamburger เปิด offcanvas + top bar (ชื่อร้าน/bell/avatar)
- S-9 shortcut 8-tile (tile#5 disabled "เร็ว ๆ นี้")
- S-10 mini banner static stub (null = ซ่อน)
- S-11 order status 4-node แนวนอน
- S-12 recent activity timeline + relative Thai time + empty state
- S-13 FAB speed-dial 3 actions

---

## ASCII Wireframe (360px)

```
┌─────────────────────────────────────────┐  mx-3
│  ╔═══════════════════════════════════╗  │
│  ║  [☰]  BT premium auto xenon  [🔔][👤] ║  ← sticky top-3 z-10
│  ╚═══════════════════════════════════╝  │
│  เมนูลัด                                 │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐            │
│  │ 🛒 │ │ 📦 │ │ ⭐ │ │ 💰 │            │  row 1
│  │คำสั่ง│สินค้า│รีวิว│เติมเงิน│         │
│  └────┘ └────┘ └────┘ └────┘            │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐            │
│  │ 🛡 │ │ 🏆 │ │ 👥 │ │ ⚙️ │            │  row 2
│  │Black │ความสำ│ลูกค้า│ตั้งค่า│         │
│  │(dim) │เร็จ │      │      │           │
│  └────┘ └────┘ └────┘ └────┘            │
│  ┌─▎─────────────────────────────────┐  │  ← MINI BANNER (null→hidden)
│  │✨ Deep แนะนำ                       │  │  border-l-4 primary
│  │   ยืนยันตัวตนระดับ L3...      ›    │  │
│  └────────────────────────────────────┘ │
│  สถานะคำสั่งซื้อ                          │
│  ┌────────────────────────────────────┐ │
│  │ 🟡  ›  🔵  ›  🟢  ›  ⬜            │ │
│  │  3      2     11     1             │ │
│  │รอดำเนิน จัดส่ง สำเร็จ ยกเลิก       │ │
│  └────────────────────────────────────┘ │
│  กิจกรรมล่าสุด                            │
│  ┌────────────────────────────────────┐ │
│  │ •─┬─ 🛒 สร้างคำสั่งซื้อ AA000009   │ │
│  │   │     5 นาทีที่แล้ว              │ │
│  │   ├─ ✅ ผู้ซื้อยืนยัน AA000008     │ │
│  │   ├─ 💬 ส่ง SMS 08x-xxx-1234       │ │
│  │   ├─ ⭐ ได้รับรีวิว 5 ดาว          │ │
│  │   └─ 🪙 เติมเครดิต ฿200            │ │
│  │ ───────────────────────────────── │ │
│  │           ดูทั้งหมด                │ │
│  └────────────────────────────────────┘ │
│                          [FAB +]         │  fixed right-5 bottom-6
└─────────────────────────────────────────┘
```

**768px:** layout เดิม (ยัง `lg:hidden`), shortcut ยัง 4-col, content ขยายเต็ม panel layout shell ปัจจุบัน (ไม่ต้องใส่ max-w จาก mockup stub)

---

## S-7 Shell — CommandCenter RSC
`CommandCenter.tsx` RSC รับ `data: CommandCenterData`, render stack: TOP MENU → SHORTCUT → BANNER → ORDER STATUS → RECENT ACTIVITY → `<CreateFab />`. wrapper `<div className="lg:hidden pb-28 relative">` (pb-28 กัน FAB ทับ content).
`page.tsx`: `<div className="lg:hidden"><CommandCenter/></div>` + `<div className="hidden lg:block">desktop เดิม (ห้ามแตะ)</div>`

---

## S-8 TOP MENU — CommandTopBar (`'use client'`)
`<header className="card-shell mx-3 mt-3 px-4 py-3 flex items-center justify-between sticky top-3 z-10">` — ใช้ `bg-white rounded-2xl shadow-sm` (ไม่ใช้ `.card` class, padding ขัด)
1. **Hamburger** ซ้าย: `w-11 h-11 rounded-xl bg-primary text-white`, icon `menu-2`, onClick → `showBackdrop()` (named import จาก `src/context/useLayoutContext.tsx` — plain function ไม่ใช่ hook)
2. **ชื่อร้าน** กลาง: `flex items-center gap-2 min-w-0 px-2` → `<span className="text-[15px] font-bold text-default-900 truncate">`
3. **Bell+Avatar** ขวา: `flex items-center gap-2 shrink-0`
   - Bell `w-11 h-11 rounded-xl bg-gray-50 text-gray-600 relative`, icon `bell`, badge `absolute top-1.5 right-1.5 min-w-5 h-5 text-[11px] bg-danger text-white rounded-full` (hardcode 0 → ซ่อนเมื่อ 0)
   - Avatar `w-11 h-11 rounded-xl object-cover`; null → `bg-gray-200` + initial ตัวแรกชื่อร้าน (uppercase)

**Props:** `shopName: string`, `avatarUrl: string|null`. ทุกปุ่ม ≥44px.

---

## S-9 SHORTCUT — ShortcutPanel RSC
```
<section className="mx-3 mb-4">
  <p className="text-[13px] font-semibold text-muted-foreground mb-2 pl-1">เมนูลัด</p>
  <div className="grid grid-cols-4 gap-3">…</div>
</section>
```
**Tile (active):** `<Link>` → `flex flex-col items-center gap-1.5 text-center active:scale-95 transition-transform`; icon chip `w-14 h-14 rounded-2xl bg-{color}-50 text-{color}-600`, icon `text-[26px]`; badge (tile#1 เท่านั้น) `absolute -top-1 -right-1 min-w-5 h-5 px-1 text-[11px] bg-danger text-white rounded-full`, ซ่อนเมื่อ 0, ≥100 → "99+"; label `text-[12px] font-semibold`
**Tile#5 (disabled):** `<div className="... cursor-not-allowed opacity-50" title="เร็ว ๆ นี้" aria-disabled="true">` ไม่มี href

**SHORTCUT_TILES (`_constants/command-center.ts`):**
| # | label | href | icon | color |
|---|-------|------|------|-------|
| 1 | คำสั่งซื้อ | /orders | shopping-cart | blue |
| 2 | สินค้า | /products | package | indigo |
| 3 | รีวิว | /reviews | star | yellow |
| 4 | เติมเงิน | /wallet | wallet | emerald |
| 5 | เช็ก Blacklist | *(disabled)* | shield-x | rose |
| 6 | ความสำเร็จ | /badges | trophy | amber |
| 7 | ลูกค้า | /customers | users | sky |
| 8 | ตั้งค่า | /shop | settings | gray |

**Props:** `pendingOrderCount: number`

---

## S-10 MINI BANNER — MiniBanner RSC
รับ `banner: PromoBanner|null`. `if (!banner) return null`.
```
<section className="mx-3 mb-4">
  <div className="bg-white rounded-2xl shadow-sm p-3.5 flex items-center gap-3 border-l-4 border-primary">
    <span className="w-11 h-11 rounded-xl bg-primary/10 text-primary shrink-0 inline-flex items-center justify-center"><Icon icon={banner.icon} className="text-[24px]"/></span>
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-bold text-primary uppercase tracking-wide">Deep แนะนำ</p>
      <p className="text-[13.5px] font-semibold text-default-900 leading-snug">{banner.body}</p>
    </div>
    <Icon icon="chevron-right" className="text-xl text-gray-400 shrink-0"/>  {/* ห่อ <Link> ถ้า banner.href */}
  </div>
</section>
```
**Default `PROMO_BANNER = null`** (ซ่อนจนกว่า Phase 2 มี Promo model)

---

## S-11 ORDER STATUS — OrderStatusTimeline RSC
horizontal flex row 4 node คั่น `chevron-right text-gray-300`. card `bg-white rounded-2xl shadow-sm p-4`.
node: `flex flex-col items-center gap-1 flex-1` → circle `w-10 h-10 rounded-full bg-{c}-50 text-{c}-600` + count `text-[18px] font-bold` + label `text-[11px] text-muted-foreground`
| status | icon | color | label |
|--------|------|-------|-------|
| PENDING | clock | amber | รอดำเนินการ |
| SHIPPED | truck | blue | จัดส่งแล้ว |
| CONFIRMED | circle-check | emerald | สำเร็จ |
| CANCELLED | circle-x | gray | ยกเลิก |

**Props:** `counts: {PENDING,SHIPPED,CONFIRMED,CANCELLED: number}`. count=0 แสดง "0" ไม่ซ่อน. ⚠️ 360px + 3-digit count อาจ squeeze (ดู Open Q1).

---

## S-12 RECENT ACTIVITY — RecentActivityFeed RSC
vertical timeline. container `relative pl-7` + เส้น `absolute left-[11px] top-2 bottom-2 w-px bg-gray-200`.
item: node `absolute -left-7 w-6 h-6 rounded-full ring-4 ring-white {style.bg} {style.text}` + icon `text-sm`; label `text-[13.5px] text-default-900`; time `text-[11px] text-muted-foreground` = `formatDistanceToNow(item.at, {addSuffix:true, locale: th})` (date-fns + `date-fns/locale/th`)
empty → `<p className="text-[13px] text-muted-foreground text-center py-4">ยังไม่มีกิจกรรม</p>`
footer → `<Link href="/orders" className="block text-center text-[13px] font-semibold text-primary pt-3 mt-1 border-t border-gray-100">ดูทั้งหมด</Link>`

**ACTIVITY_STYLE:**
| type | icon | bg | text |
|------|------|-----|------|
| ORDER_CREATED | shopping-cart-plus | bg-blue-100 | text-blue-600 |
| ORDER_CONFIRMED | user-check | bg-emerald-100 | text-emerald-600 |
| SMS_SENT | message-2 | bg-violet-100 | text-violet-600 |
| REVIEW_RECEIVED | star | bg-yellow-100 | text-yellow-600 |
| TOPUP | coin | bg-green-100 | text-green-600 |

**Props:** `items: ActivityItem[]` (type จาก `activity.service.ts` — T6 ก่อน T7). PII masked ที่ service แล้ว.

---

## S-13 FAB — CreateFab (`'use client'`)
`fixed right-5 bottom-6 z-30`. state `useState(open)`.
- backdrop (open): `<div className="fixed inset-0 bg-black/30 z-20" onClick={close} aria-hidden>`
- container `fixed right-5 bottom-6 z-30 flex flex-col items-end gap-3`
- 3 action (open): FabAction pill `<Link>` `inline-flex items-center gap-2 bg-white rounded-full shadow-md px-4 h-11 text-[13px] font-semibold` + icon
- main FAB `w-[60px] h-[60px] rounded-full bg-primary text-white shadow-[0_8px_24px_rgba(37,99,235,0.35)]`, icon toggle `plus`/`x`, `aria-expanded={open}`, `aria-label` toggle
- ESC handler (useEffect keydown), focus trap (focus action แรกตอน open, คืน main FAB ตอนปิด)

**Actions:** สร้างออเดอร์→/orders/new, สร้างสินค้า→/products/new-v2, สร้างหมวดหมู่→/categories. icons: shopping-cart-plus / package-plus / category-plus (⚠️ verify tabler มี `category-plus` — ดู Open Q3). z: TOP MENU 10 < backdrop 20 < FAB 30.

---

## Theme Source Mapping (refreshed V3)
| Section | Theme file | copy อะไร | adapt อะไร |
|---------|-----------|-----------|------------|
| S-8 hamburger | `theme/paces/Admin/TS/src/layouts/components/TopBar/components/MenuToggler.tsx` | `showBackdrop()` call + client island | ตัด `useLayoutContext` hook เหลือ `showBackdrop` import; เพิ่ม shopName/bell/avatar; button → `w-11 h-11 rounded-xl` |
| S-8/S-10 card shell | `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx` | `.card` shell | ใช้ `bg-white rounded-2xl shadow-sm` แทน `.card` (padding); horizontal flex |
| S-9 tile | `…/dashboard/ecommerce/components/StatisticCard.tsx` | icon slot (`size-9 bg-primary/15 rounded-full`) | scale → `w-14 h-14 rounded-2xl`; strip card-body เหลือ icon chip + label; badge overlay; color token ต่อ tile |
| S-11 timeline | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx` | card + node circle concept | vertical→horizontal (`flex justify-between`); ตัด time/desc column; node `size-3.5`→`w-10 h-10`; chevron แทนเส้น |
| S-12 feed | `theme/paces/Admin/TS/src/app/(admin)/apps/users/profile/components/TimeLine.tsx` | `relative pl-7` + `absolute -left-7` node + เส้นแนวตั้ง | ตัด form/post/image/like; node image→icon `w-6 h-6 bg-{c}-100 ring-4 ring-white`; `border-e dashed`→`w-px bg-gray-200` |
| S-13 FAB | `theme/paces/Admin/TS/src/layouts/components/Customizer/index.tsx` | fixed positioning + backdrop + `btn-icon rounded-full bg-primary` | **compose-from-primitive** (ไม่ใช่ copy-then-adapt ตรง ๆ — Customizer ใช้ `hs-overlay` Preline JS ที่ไม่ match); FAB ใช้ React state |
| Icon (all) | `src/components/wrappers/Icon.tsx` | auto-prefix tabler: | `<Icon icon="..." />` |

---

## Edge States
| Section | State | พฤติกรรม |
|---------|-------|---------|
| TOP MENU | avatarUrl=null | div `bg-gray-200` + initial |
| TOP MENU | shopName ยาว | `truncate` + `min-w-0` |
| TOP MENU | bell=0 | ซ่อน badge |
| SHORTCUT | pending=0 | ซ่อน badge |
| SHORTCUT | pending≥100 | "99+" |
| BANNER | null | return null |
| ORDER STATUS | count=0 | แสดง "0" |
| ORDER STATUS | throw | page try/catch → 0 ทุก node |
| ORDER STATUS | 3-digit | อาจ squeeze @360 (Q1) |
| ACTIVITY | [] | empty state + ยังมี "ดูทั้งหมด" |
| ACTIVITY | throw | service → [] → empty state |
| FAB | ESC/backdrop/navigate | setOpen(false) |

---

## Design Decisions
1. `showBackdrop()` = plain function import ตรง (ไม่ใช่ hook) — DOM mutation ล้วน, ปลอดภัย
2. card shell ใช้ Tailwind primitives ไม่ใช้ `.card` (padding global ขัด flex)
3. StatisticCard strip เหลือ icon slot + color token
4. ShippingActivity vertical→horizontal adapt
5. TimeLine strip หนัก เหลือ pl-7 + node pattern
6. Customizer ให้ concept เท่านั้น (FAB = React state ไม่ใช้ hs-overlay)
7. `active:scale-95` จาก mockup
8. pb-28 กัน FAB ทับ
9. focus trap ใน FAB

---

## ⚠️ Flags for Controller
- **FLAG 1 (resolved):** spec เก่าบอก TOP MENU "ไม่ดึง useLayoutContext" แต่ hamburger ต้อง `showBackdrop()`. ทั้งคู่ถูก — `showBackdrop` เป็น plain function. spec นี้ยึด plan doc (client island + import ตรง).
- **FLAG 2:** mockup render tile#5 เป็น `<a>` ปกติ (ไม่ disabled) แต่ plan doc สั่ง disable "เร็ว ๆ นี้". spec ยึด plan doc → visual tile#5 ต่างจาก mockup.
- **FLAG 3:** mockup activity time แบบ mixed ("5 นาทีที่แล้ว" + "เมื่อวาน 16:20"); plan doc ใช้ `formatDistanceToNow` relative ล้วน. spec ยึด plan doc. ถ้าอยาก mixed ต้องเพิ่ม logic.
- **FLAG 4:** Customizer เป็น theme source อ่อนสำหรับ FAB (ใช้ `hs-overlay` ไม่ match) → S-13 = compose-from-primitive. ไม่มี Paces FAB speed-dial โดยตรง.

## Open Questions (ก่อน/ระหว่าง build)
- **Q1 (S-11):** 360px + count 3-digit squeeze — clamp "99+" หรือ ลด font? ทดสอบ @360 count=999
- **Q2 (T1 data):** `pendingOrderCount` (JS filter จาก getOrdersByShop) vs `orderStatusCounts.PENDING` (DB groupBy) = 2 query อาจต่างกัน. รับ eventual consistency หรือใช้แหล่งเดียว (`pendingOrderCount = orderStatusCounts.PENDING`)?
- **Q3 (S-13):** verify tabler มี `category-plus` (อาจเป็น `folder-plus`/`tag-plus`)
