# Seller Mobile Command Center v8 — Re-source from real Paces components

> **สถานะ:** design draft (รออนุมัติ user)
> **หน้า:** `/dashboard` (mobile `lg:hidden`) — seller (Paces)
> **แนวทาง:** B — re-source rebuild จาก Paces eCommerce dashboard component จริง (ไม่ใช่ refine ม็อกอัพเดิม)
> **ก่อนหน้า:** v7 (`docs/.../DESIGN-SPEC-v7.md`) + color-fix `2ab35da` — v7 ใช้ custom CSS (arbitrary Tailwind) แต่งจนหลุด Paces; v8 รื้อใหม่จาก Paces primitive
> **Token:** Paces `--color-primary` = น้ำเงิน `#236dc9` (ห้ามม่วง #7367F0 — buyer เท่านั้น)

---

## 1. ปัญหาของ v7 (ทำไมต้อง v8)

v7 อ้าง `Base: theme/paces/...` ใน comment แต่ implement ด้วย **arbitrary Tailwind ทั้งหมด** (`text-[13px]`, `rounded-[14px]`, `bg-[rgba(...)]`, `shadow-[...]`, hardcode `#7367F0`) = custom CSS ปลอม ๆ หลุดจากระบบ Paces. ผลคือหน้าตาไม่เหมือน Paces demo และฝัง bug สีม่วง.

**v8 = ประกอบจาก Paces primitive จริง** — `.card`/`.card-body`/`.card-header`/`.card-title`, `text-default-*`, `bg-primary/15`, `size-*`, `text-success`/`text-danger`, `.progress`, `.btn` — ให้ "วางข้าง Paces eCommerce demo แล้วดูเป็นตระกูลเดียวกัน".

---

## 2. Hard Rule ใหม่ (Rule 7 — จะ promote เข้า CLAUDE.md หลัง phase)

> **หน้า `(paces)/**` (seller/admin) ต้องประกอบจาก Paces primitive — ห้าม arbitrary Tailwind value.**
> ใช้: `.card .card-body .card-header .card-title`, `btn btn-primary btn-sm`, `text-default-400/500`, `bg-primary bg-primary/15 text-primary`, `text-success text-danger text-warning`, `size-7.5 size-9`, `rounded-full rounded-lg`, `.progress .progress-bar`, grid/flex utility.
> ห้าม: `text-[13px]`, `bg-[rgba(...)]`, `shadow-[...]`, `rounded-[14px]`, `w-[50px]`, hardcode hex/rgba — **เว้นมีเหตุผลจำเป็นจริง เขียน comment กำกับ** (เช่น value ที่ Paces ไม่มี token ให้).
> ม่วง `#7367F0` = buyer/Vuexy เท่านั้น. ดู [[feedback_paces_own_primary_not_violet]].

---

## 3. Layout — single-column stack ของ Paces `.card`

```
┌─────────────────────────────────────┐
│  SellerMobileHeader (sticky, เดิม)  │  ← layout slot, ไม่แตะ (นอก scope)
├─────────────────────────────────────┤
│  [1] การ์ดทักทาย + identity + trust │  ← UserCard
│  [2] สถานะออเดอร์ (stat card grid)  │  ← StatisticCard ×N
│  [3] กิจกรรมล่าสุด (timeline card)  │  ← RecentActivity
│  [4] เมนูลัด (card + icon grid)     │  ← .card + Preline grid
├─────────────────────────────────────┤
│  SellerBottomNav (exception, เก็บ)  │  ← clean arbitrary → token
└─────────────────────────────────────┘
```

container: `<div className="lg:hidden">` + spacing ระหว่างการ์ดด้วย Paces gutter (`space-y-*`/`gap-*` ของ theme เช่น `space-y-4` ตาม Paces card stack). main shell มี padding-inline/bottom ครอบแล้ว (safepay-overrides.css L98/L101 — ห้ามใส่ px/pb ซ้ำ ตามบทเรียน v7).

---

## 4. Block breakdown

### [1] การ์ดทักทาย + identity + trust
**Source:** `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/UserCard.tsx`
**โครง Paces:** `.card` → `.card-body` (ทักทาย) + `.card-body bg-light/50` (sub-bar)
**Seller content:**
- บรรทัดบน: `<span class="text-default-400 text-sm uppercase font-medium">สวัสดี,</span>` + `<b>{ชื่อร้าน}!</b>` (จาก layout `shopNameForHeader` — ส่งเป็น prop)
- แทนรูป email illustration → avatar ร้าน (กลม) + tier badge
- sub-bar (`bg-light/50`): **tier + trust score** ด้วย Paces `.progress`
  - tier name (`text-default-500`) + `.progress` (`.progress-bar bg-primary` width=trustScore%)
**State:** avatar null → initial fallback (`bg-primary/15 text-primary rounded-full`); trustScore=0 → progress 0%
**ข้อมูล:** ต้องส่ง `shopName`, `avatarUrl`, `tierName`, `trustScore` เข้า CommandCenter (ปัจจุบันอยู่ใน layout — เพิ่ม prop chain หรือ fetch ใน page.tsx). **Decision:** page.tsx ดึงเองจาก session+shop (เหมือน layout) แล้วส่งเข้า CommandCenter — ไม่พึ่ง layout prop.

### [2] สถานะออเดอร์ — stat card grid
**Source:** `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx`
**โครง Paces ต่อใบ:** `.card` → `.card-body` → flex(เนื้อ / icon chip `size-9 bg-primary/15 text-primary rounded-full`); เลขใหญ่ (`text-xl`, CountUp ได้); บรรทัด label
**Seller content (decision ก):** grid stat card — **รอดำเนินการ / จัดส่งแล้ว / สำเร็จ** (อาจ + ยกเลิก)
- แทน delta "Since last month" (seller ไม่มี) ด้วย **label คงที่**: รอดำเนินการ → "รอคุณจัดการ"; จัดส่งแล้ว → "กำลังส่ง"; สำเร็จ → "เดือนนี้" (หรือ label เหมาะสม)
- **"รอดำเนินการ" เด่นกว่าใบอื่น** — เป็น stat card ที่เน้น (เช่น `bg-primary/10` ทั้งใบ หรือ icon chip ทึบ `bg-primary text-white`) + ทั้งใบเป็น link → `/orders`
- สี icon chip ต่อ stat: รอดำเนินการ=primary, จัดส่ง=info/cyan, สำเร็จ=success
- เลข ≥100 → CountUp/clamp ตามเหมาะ
- grid: Paces responsive — mobile `grid-cols-2` (หรือ 3 ถ้าพอ)
**State:** count=0 → แสดง 0; error → 0 (page fallback เดิม)
**ข้อมูล:** `data.orderStatusCounts` (มีแล้ว)

### [3] กิจกรรมล่าสุด — timeline card
**Source:** `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/RecentActivity.tsx`
**โครง Paces:** `.card` → `.card-header` (`.card-title` "กิจกรรมล่าสุด" + link "ดูทั้งหมด" ขวา) → `.card-body` (SimpleBar ได้/หรือไม่) → timeline rows: node `size-7.5 rounded-full {color}` + icon ขาว + `after:border-dashed` เส้นเชื่อม; เนื้อ `<h5>` + `text-default-400` time
**Seller content:** map ActivityItem → row (label ไทยตาม type: ORDER_CREATED/CONFIRMED/SMS_SENT/REVIEW_RECEIVED/TOPUP); time = `formatDistanceToNow` th; node color = semantic per type (success/info/warning/primary)
**Empty state:** ใช้ Paces pattern — `.card-body` center + icon + ข้อความ "ยังไม่มีกิจกรรม" + `btn btn-primary btn-sm` "สร้างออเดอร์" → `/orders/new`
**ข้อมูล:** `data.recentActivity` (มีแล้ว, ActivityItem service)

### [4] เมนูลัด — card + icon grid
**Source:** `.card` + Preline grid (ไม่มี analog ตรงใน Paces dashboard → ประกอบจาก primitive)
**โครง:** `.card` → `.card-header` (`.card-title` "เมนูลัด") → `.card-body` → `grid grid-cols-4 gap-*` ของ item: `<Link>` → icon chip (`size-* bg-{semantic}/15 text-{semantic} rounded-lg`) + label (`text-default-500 text-xs`)
**Seller content:** 6 tile เดิม (รีวิว/เติมเงิน/ลูกค้า/ตั้งค่าร้าน/ความสำเร็จ/การยืนยัน) — สี semantic per tile (success/info/warning/primary) ผ่าน token; **ไม่มี arbitrary** (`bg-primary/15` ฯลฯ)
**Decision:** ใช้ semantic Paces (`text-success/info/warning/primary` + `/15` bg) ไม่ใช่ hex. tile การยืนยัน = primary.
**State:** ทุก tile link ปกติ (ไม่มี disabled ใน v8)

### [5] bottom nav — exception (เก็บ + clean)
**ไฟล์:** `_shared/SellerBottomNav.tsx` (mobile pattern — Paces ไม่มี → documented exception)
**งาน v8:** แทน arbitrary ที่เหลือ → token เท่าที่ทำได้ (`text-primary` มีแล้ว; `text-[10.5px]`→`text-xs` ถ้าใกล้, `w-[54px]` center button = exception เขียน comment; shadow → Paces shadow util ถ้ามี). **ไม่เปลี่ยนพฤติกรรม/layout** (user เคาะว่าจำเป็น)
**หมายเหตุ:** ถ้า token Paces ไม่มีขนาดที่ต้องการเป๊ะ → คง arbitrary + comment เหตุผล (center raised button เป็น custom mobile pattern)

---

## 5. ไฟล์ที่กระทบ

**Rebuild (rewrite จาก Paces primitive):**
- `dashboard/components/CommandCenter.tsx` — wrapper + ลำดับ + spacing Paces
- `dashboard/components/UserGreetingCard.tsx` *(ใหม่)* — block 1 (จาก UserCard) — หรือ reuse `UserCard.tsx` scaffold ที่ copy ไว้
- `dashboard/components/OrderStatusCards.tsx` *(ใหม่/rewrite OrderStatusTimeline)* — block 2 (จาก StatisticCard)
- `dashboard/components/RecentActivityFeed.tsx` — rewrite block 3 (จาก RecentActivity)
- `dashboard/components/ShortcutPanel.tsx` — rewrite block 4 (Paces primitive)
- `dashboard/page.tsx` — ส่ง shopName/avatar/tier/trustScore เข้า CommandCenter
- `_shared/SellerBottomNav.tsx` — clean arbitrary (block 5)
- `dashboard/_constants/command-center.ts` — ปรับ SHORTCUT_TILES color → semantic key

**ลบ/superseded:** `IdentityBar` trust bar (ย้ายเข้าการ์ดทักทาย — แต่ IdentityBar ยังใช้ใน SellerMobileHeader sticky; trust bar เดิมใน IdentityBar อาจคงไว้หรือลบ — **decision: ลบ trust bar ออกจาก IdentityBar** ให้ trust อยู่ที่การ์ดทักทายที่เดียว กัน duplicate)

**ไม่แตะ:** SellerMobileHeader โครง (sticky topbar), layout shell, admin, buyer, `lg:` desktop, data/service/API

---

## 6. Out-of-scope
- Promo banner, Blacklist, bell wiring จริง, cross-platform stats (Phase 2)
- desktop dashboard (`lg:` ขึ้นไป)
- data/schema/API ใหม่ (ใช้ CommandCenterData + session เดิม)
- admin (สะอาดอยู่แล้ว)
- charts (donut/line ของ Paces demo — seller ยังไม่มี data ที่มีความหมาย → ไม่เอาเข้า v8)

## 7. Open questions
- **Q1:** การ์ดทักทาย — เก็บ date/clock แบบ UserCard ไหม หรือเอาออก (seller ไม่ต้องการนาฬิกา)? → เสนอ **เอาออก**, ใส่ tier+trust แทน sub-bar
- **Q2:** stat card grid — 3 ใบ (รอ/ส่ง/สำเร็จ) หรือ 4 (+ยกเลิก)? → เสนอ **3 ใบ** (ยกเลิกไม่ค่อย actionable), grid-cols-2 หรือ 3
- **Q3:** เลข CountUp animation (Paces ใช้) — เอาด้วยไหม หรือ static? → เสนอ **static** (DESIGN.md product side ไม่ใส่ choreography)
- **Q4:** SHORTCUT semantic color mapping — รีวิว=warning, เติมเงิน=success, ลูกค้า=info, ตั้งค่าร้าน=secondary/default, ความสำเร็จ=warning, การยืนยัน=primary — โอเคไหม?

## 8. Definition of Done
- ทุก block = Paces primitive, grep ไม่เจอ arbitrary value ใหม่ (ยกเว้นที่ comment กำกับ)
- grep ไม่เจอ `#7367F0`/`rgba(115,103,240`)
- tsc 0
- QA mobile 360px: หน้าตาเป็น Paces (การ์ดขาว `.card`, accent น้ำเงิน), 4 block + bottom nav, touch ≥44px, console clean
- วางข้าง Paces eCommerce demo แล้วเป็นตระกูลเดียวกัน (visual-quality gate)
