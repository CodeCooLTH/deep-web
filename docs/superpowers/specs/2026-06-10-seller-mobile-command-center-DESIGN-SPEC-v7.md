# Seller Mobile Command Center — Design Spec v7

> **สถานะ:** APPROVED (visual direction) — user สั่ง "เซฟสเปก + build เลย" 2026-06-10
> **หน้า:** `/dashboard` (mobile, `lg:hidden`) — seller subdomain (Paces)
> **มาจาก:** safepay-ux re-design รอบ "ยังไม่สวยพอ + ใช้ยาก" (feedback บน v6/v6.1/v6.2)
> **ก่อนหน้า:** `docs/superpowers/specs/2026-06-07-seller-mobile-command-center-DESIGN-SPEC-v3.md`
> **Token SSOT:** `DESIGN.md` (root) — ห้ามใช้ token นอกระบบ (ประวัติ CC V4 ถูก reject เรื่อง blue/radius นอกระบบ)

---

## 1. Diagnosis — ทำไม v6 "ไม่สวย + ใช้ยาก"

### Visual
- **ขาด hierarchy:** ทุก `sec-label` ใช้ `text-[13px] font-semibold text-[rgba(47,43,61,0.70)]` เหมือนกัน (ShortcutPanel:24, OrderStatusTimeline:38, RecentActivityFeed:77) → ตาไม่รู้ section ไหนสำคัญ
- **IdentityBar generic:** flat flex row, avatar 36px + ชื่อ 14.5px ดูเป็น topbar admin ทั่วไป ไม่รู้สึก "ร้านฉัน"
- **ShortcutPanel จืด:** color map 2-way (`green`/`neutral`), 5/6 tile เป็นเทาชุดเดียว
- **3-stat grid ดูโล่ง:** icon + count แนวนอน (`flex items-center gap-1.5`) ตัวเลขลอยกับ icon
- **Activity อ่านยาก:** time `text-[rgba(47,43,61,0.40)]` opacity 40% ≈ 3.5:1 **ไม่ผ่าน WCAG 4.5:1**

### UX
- **ลำดับขัด mental model:** Status → Shortcut → Activity — เมนูลัดขวางระหว่างออเดอร์กับ activity
- **Shortcut ไม่ลด tap:** tile คำสั่งซื้อ/สินค้า ซ้ำกับ Bottom Nav
- **IdentityBar ไม่มี trust signal:** tier เป็น text 11.5px เฉย ๆ ไม่บอกว่าต้องทำอะไรเพิ่ม
- **Empty state generic:** "ยังไม่มีกิจกรรม" เปล่า ๆ ไม่ guide onboarding

---

## 2. เป้าหมาย seller บนมือถือ (priority)

```
#1  เช็คออเดอร์ที่รอดำเนินการ      ทุกครั้งที่เปิดแอป
#2  ตอบสนองเหตุการณ์ล่าสุด          ทุกครั้งที่เปิดแอป
#3  สร้างออเดอร์ใหม่                บ่อย (CTA หลัก)
#4  เข้าถึงส่วนอื่น (รีวิว/wallet)   บางครั้ง
#5  ดู Trust / tier                  นาน ๆ ครั้ง
```

ลำดับ section ใหม่: **IdentityBar → OrderStatus → ActivityFeed → ShortcutPanel**

---

## 3. ASCII Wireframe (360px)

```
┌─────────────────────────────────────────────────┐
│  IDENTITY BAR (sticky top)                       │
│  [avatar 44px]  ชื่อร้านค้า                [🔔] │
│   ████████      Deep Silver                      │
│                 [━━━━━━━━░░] trust progress bar  │
│                                                  │
│  สถานะออเดอร์                          จัดการ › │
│  ┌─────────────────────────────────────────┐    │
│  │ [🕐 รอดำเนินการ          3 รายการ  ›]  │    │ ← CTA violet
│  │  ┌────┐    ┌────┐    ┌────┐            │    │
│  │  │🚚 │    │✅ │    │✖ │  (stacked)   │    │
│  │  │ 2 │    │11 │    │ 1 │              │    │
│  │  จัดส่ง   สำเร็จ   ยกเลิก             │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  กิจกรรมล่าสุด                        ดูทั้งหมด ›│
│  ┌─────────────────────────────────────────┐    │
│  │  ●─┬─ [i] สร้างคำสั่งซื้อ AA000009     │    │
│  │    ├─ [i] ผู้ซื้อยืนยัน AA000008       │    │
│  │    ├─ [i] ได้รับรีวิว 5 ดาว           │    │
│  │    └─ [i] เติมเครดิต ฿200              │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  เมนูลัด                                         │
│  ┌─────────────────────────────────────────┐    │
│  │ [⭐รีวิว] [💰เติมเงิน] [👥ลูกค้า] [⚙️ร้าน]│   │ ← grid-cols-4
│  │   amber     green       cyan      gray   │    │
│  │        [🏆ความสำเร็จ]  [🛡การยืนยัน]    │    │ ← grid-cols-2 centered
│  │           amber          violet          │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  BOTTOM NAV: หน้าหลัก|คำสั่งซื้อ|[+]|สินค้า|ร้าน│
└─────────────────────────────────────────────────┘
```

---

## 4. Section Breakdown

### Section 0: IdentityBar
**ไฟล์:** `src/app/(paces)/seller/(dashboard)/_shared/IdentityBar.tsx`
- avatar `w-9 h-9` (36px) → `w-11 h-11` (44px) — แก้ touch-target + identity ชัด
- เพิ่ม **trust progress bar** ใต้ tier: `<div className="h-1 rounded-full bg-[rgba(47,43,61,0.08)] overflow-hidden"><div style={{width:`${score}%`}} className="h-full rounded-full bg-[#7367F0]"/></div>`
- prop ใหม่ `trustScore: number` (มาจาก `user.trustScore ?? 0` ใน layout.tsx:51)
- State: score=0 → bar empty (ไม่ซ่อน); avatarUrl=null → initial fallback `bg-[rgba(115,103,240,0.12)]`

### Section A: OrderStatusTimeline
**ไฟล์:** `.../dashboard/components/OrderStatusTimeline.tsx`
- คง CTA violet block (primary) + section header + clamp 99+
- 3-stat grid: แนวนอน → **stacked** = icon chip `w-8 h-8 rounded-[9px] bg-{color}/10` + count `text-[17px] font-bold tabular-nums` + label `text-[11px]`
- สี: SHIPPED `#00BAD1`, CONFIRMED `#28C76F`, CANCELLED `rgba(47,43,61,0.40)`
- label opacity 0.55 → 0.65

### Section B: RecentActivityFeed
**ไฟล์:** `.../dashboard/components/RecentActivityFeed.tsx`
- time opacity 0.40 → **0.55** (`text-[rgba(47,43,61,0.55)]`) — แก้ WCAG
- node `w-7 h-7` (28px) คงเดิม
- **empty state ใหม่:** icon shopping-cart-plus ม่วงจาง 32px + "สร้างออเดอร์แรกเลย" + "กิจกรรมจะปรากฏที่นี่เมื่อคุณเริ่มใช้งาน" + ปุ่ม `btn btn-sm bg-primary text-white h-11` → /orders/new

### Section C: ShortcutPanel
**ไฟล์:** `.../dashboard/components/ShortcutPanel.tsx` + `_constants/command-center.ts`
- ตัด tile ซ้ำ Bottom Nav (คำสั่งซื้อ/สินค้า) → tiles ใหม่:

| # | label | href | icon | color | token |
|---|---|---|---|---|---|
| 1 | รีวิว | /reviews | star | amber | `#FF9F43` |
| 2 | เติมเงิน | /wallet | wallet | green | `#28C76F` |
| 3 | ลูกค้า | /customers | users | cyan | `#00BAD1` |
| 4 | ตั้งค่าร้าน | /shop | building-store | gray | `rgba(47,43,61,0.60)` |
| 5 | ความสำเร็จ | /badges | trophy | amber | `#FF9F43` |
| 6 | การยืนยัน | /verification | shield-check | violet | `#7367F0` |

- layout: `grid-cols-4` แถว 1 (tile 0-3) + `grid-cols-2 max-w-[200px] mx-auto` แถว 2 (tile 4-5)
- 5-way color map:
  - amber: `bg-[rgba(255,159,67,0.14)] text-[#FF9F43]`
  - green: `bg-[rgba(40,199,111,0.14)] text-[#28C76F]`
  - cyan: `bg-[rgba(0,186,209,0.13)] text-[#00BAD1]`
  - violet: `bg-[rgba(115,103,240,0.12)] text-[#7367F0]`
  - gray: `bg-[#F2F1F6] text-[rgba(47,43,61,0.60)]`
- tile box `w-[46px] h-[46px]` → `w-[50px] h-[50px]`, icon `text-[22px]` → `text-[24px]`
- คง disabled pattern (opacity-40 pointer-events-none) + active:scale-95 + Link RSC

### Section D: CommandCenter wrapper
**ไฟล์:** `.../dashboard/components/CommandCenter.tsx`
- ลำดับ render: `OrderStatusTimeline → RecentActivityFeed → ShortcutPanel` (Activity เลื่อนขึ้นก่อน Shortcut)
- wrapper: `className="lg:hidden relative px-4 pb-28"`

---

## 5. Theme Source Mapping

| Block | Theme file | Component | adapt |
|---|---|---|---|
| IdentityBar trust bar | (primitive) | `h-1 rounded-full` div 2 ชั้น | ไม่มี progress bar ใน Paces — ใช้ raw Tailwind div |
| 3-stat node | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersStatCard.tsx` | icon chip slot | ย่อ `w-8 h-8 rounded-[9px]`, stacked, ตัด CountUp |
| CTA violet | `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx` | card shell + icon slot | คงเดิมจาก v6 |
| Activity timeline | `theme/paces/Admin/TS/src/app/(admin)/apps/users/profile/components/TimeLine.tsx` | container + node positioning | คงเดิม v6, เปลี่ยน opacity + empty state |
| Activity empty CTA | `theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx` | `btn btn-sm bg-primary text-white` | copy class, wrap Link |
| Shortcut tile chip | `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx` | icon slot `size-9 bg-primary/15 rounded-full` | scale `w-[50px] rounded-[13px]`, 5-way color |
| Shortcut disabled | `theme/paces/Admin/TS/src/app/(admin)/ui/list-group/page.tsx` | DisabledItems pattern | `opacity-40 pointer-events-none` (คงเดิม) |

---

## 6. Edge States

| Section | State | พฤติกรรม |
|---|---|---|
| IdentityBar | trustScore=0 | bar empty 0% |
| IdentityBar | avatarUrl=null | initial fallback |
| Section A CTA | PENDING=0 | "0 รายการ", ยัง link /orders |
| Section A | ≥100 | clamp "99+" |
| Section B | items=[] | empty state onboarding + CTA |
| Section B | time | rgba(...,0.55) ผ่าน WCAG |
| Section C | tile การยืนยัน | Q4 — safe default = link ปกติ |
| Bottom Nav | pendingCount=0 | ซ่อน badge |

---

## 7. Diff v6 → v7 (สำหรับ Developer)

| รายการ | v6 | v7 | ไฟล์ |
|---|---|---|---|
| Section order | Status→Shortcut→Activity | Status→**Activity→Shortcut** | CommandCenter.tsx:31-37 |
| Wrapper | `lg:hidden relative` | `lg:hidden relative px-4 pb-28` | CommandCenter.tsx:29 |
| IdentityBar props | shopName/avatarUrl/tierName | +`trustScore` | IdentityBar/SellerMobileHeader/layout |
| Avatar | 36px | 44px | IdentityBar.tsx:43,51 |
| Trust bar | ไม่มี | progress bar | IdentityBar.tsx |
| Shortcut tiles | คำสั่งซื้อ/สินค้า/รีวิว/เติมเงิน/Blacklist/ความสำเร็จ | รีวิว/เติมเงิน/ลูกค้า/ตั้งค่าร้าน/ความสำเร็จ/การยืนยัน | command-center.ts |
| Shortcut grid | grid-cols-3 | grid-cols-4 + grid-cols-2 centered | ShortcutPanel.tsx:30 |
| Shortcut color | 2-way | 5-way | ShortcutPanel.tsx |
| Shortcut tile | 46px / 22px | 50px / 24px | ShortcutPanel.tsx:59,62 |
| 3-stat | แนวนอน | stacked icon-chip | OrderStatusTimeline.tsx:80-106 |
| Activity time | opacity 40% | opacity 55% | RecentActivityFeed.tsx:127 |
| Activity empty | text เปล่า | onboarding + CTA | RecentActivityFeed.tsx:87-90 |

**ไฟล์ที่แตะ (ทั้งหมด edit, ไม่มีไฟล์ใหม่):**
1. `src/app/(paces)/seller/(dashboard)/_shared/IdentityBar.tsx`
2. `src/app/(paces)/seller/(dashboard)/_shared/SellerMobileHeader.tsx`
3. `src/app/(paces)/seller/(dashboard)/layout.tsx`
4. `src/app/(paces)/seller/(dashboard)/dashboard/components/CommandCenter.tsx`
5. `src/app/(paces)/seller/(dashboard)/dashboard/components/ShortcutPanel.tsx`
6. `src/app/(paces)/seller/(dashboard)/dashboard/components/OrderStatusTimeline.tsx`
7. `src/app/(paces)/seller/(dashboard)/dashboard/components/RecentActivityFeed.tsx`
8. `src/app/(paces)/seller/(dashboard)/_constants/command-center.ts`

---

## 8. Open Questions

- **Q1:** `user.trustScore` type = `number` หรือ `number | undefined`? (layout.tsx:15-24) — ต้องเช็คก่อน prop chain
- **Q2:** `_constants/command-center.ts` มี SHORTCUT_TILES + `ShortcutTile` type จริงไหม, type รองรับ `color` 5-way (`amber|green|cyan|violet|gray`)?
- **Q3:** grid 4+2 centered ที่ 360px เสี่ยงดูโหว่ — fallback = grid-cols-4 เต็มสองแถว (tile 5-6 ชิดซ้าย)
- **Q4:** tile "การยืนยัน" — disabled เมื่อ L3 แล้ว หรือ link ดู status? **safe default = link ปกติ**
- **Q5:** SellerMobileHeader sub-page mode ต้องเพิ่ม `trustScore` prop ใน IdentityBar call (TS error ถ้าลืม)

---

## 9. Design Decisions

- **D1** section order ตาม mental model (เกิดอะไร→ตอบสนอง→ทำงานอื่น)
- **D2** trust progress bar = สัญญาณ "ต้องทำอะไรเพิ่ม" สี `#7367F0` (One Voice ≤10%)
- **D3** avatar 44px แก้ touch-target bug
- **D4** ตัด shortcut ซ้ำ bottom nav → tile ที่ลด tap จริง
- **D5** 5-way color ทุกสีอยู่ใน DESIGN.md palette (ห้ามสีนอกระบบ)
- **D6** empty state guided ลด onboarding friction
- **D7** stacked stat node อ่านเลขง่ายขึ้น
- **D8** ไม่เพิ่ม page-load animation (DESIGN.md §8 "Do's and Don'ts": product side ไม่ใส่ choreography)
