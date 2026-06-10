# Seller Mobile Command Center v8 — Re-source from real Paces components

> **สถานะ:** APPROVED (design locked ผ่าน mockup iteration 2026-06-10) — user สั่ง "build ครบ agent-team"
> **หน้า:** `/dashboard` (mobile `lg:hidden`) + **`/notifications` (ใหม่ เต็มหน้า)** — seller (Paces)
> **แนวทาง:** B — re-source rebuild จาก Paces component จริง + IA แบบ Shopee "ฉัน" (sectioned cards + icon grids)
> **Mockup (visual SoT):** `docs/mockups/home/command-center-v8.html` (2 frame: หน้าหลัก + การแจ้งเตือน timeline)
> **Token:** Paces `--color-primary` = **น้ำเงิน `#236dc9`** (ห้ามม่วง #7367F0 — buyer เท่านั้น; ดู [[feedback_paces_own_primary_not_violet]])

---

## 1. ทำไม v8 (ปัญหา v6/v7)

v6/v7 อ้าง `Base: theme/paces/...` ใน comment แต่ implement ด้วย **arbitrary Tailwind ล้วน** (`text-[13px]`, `rounded-[14px]`, `bg-[rgba(...)]`, `shadow-[...]`, hardcode `#7367F0`) = custom CSS ปลอม หลุด Paces → หน้าตาไม่เหมือน Paces + bug สีม่วง. v8 ประกอบจาก **Paces primitive จริง** ให้ "วางข้าง Paces demo แล้วเป็นตระกูลเดียวกัน". IA อ้าง Shopee "ฉัน" (sectioned cards) ที่ user เลือก — เอา **layout/structure ตาม ref, ผิว = Paces theme** (กฎ reference-vs-theme).

## 2. 🛑 Hard Rule 7 (promote เข้า CLAUDE.md หลัง phase)

> **หน้า `(paces)/**` ต้องประกอบจาก Paces primitive — ห้าม arbitrary Tailwind value.**
> ใช้: `.card .card-body .card-header .card-title`, `btn btn-primary btn-sm`, `text-default-400/500/700`, `bg-primary bg-primary/15 text-primary`, `text-success text-danger text-warning text-info`, `badge bg-*/15 text-*`, `size-7.5 size-9`, `rounded-full rounded-lg`, grid/flex utility, `space-y-*`.
> ห้าม: `text-[13px]`, `bg-[rgba(...)]`, `shadow-[...]`, `rounded-[14px]`, `w-[50px]`, hardcode hex/rgba — **เว้นจำเป็นจริง เขียน comment กำกับ**.

## 3. การตัดสินใจ (locked)

| # | เรื่อง | ผล |
|---|---|---|
| Q1 | การ์ดทักทาย | เอา date/clock ออก — **header น้ำเงินทึบ** (แบบ Shopee profile) + tier + trust progress |
| Q2 | order status | **4 สถานะ** (รอดำเนินการ/กำลังจัดส่ง/สำเร็จ/ยกเลิก) เป็น icon-row + badge นับ |
| Q3 | เลข | **static** ไม่ animate (DESIGN.md product side) |
| Q4 | shortcut color | semantic per tile (รีวิว=warning/เติมเงิน=success/ลูกค้า=info/สินค้า=primary/ความสำเร็จ=warning/หมวดหมู่=info/การยืนยัน=primary/ตั้งค่าร้าน=default) |
| — | header | **น้ำเงินทึบ** (Shopee-style, Committed accent บน surface เดียว — product register อนุญาต) |
| — | ลำดับ section | **shortcut บนสุด** → คำสั่งซื้อ → wallet → กิจกรรม (user ยืนยัน "shortcut บนสุดเสมอ") |
| — | notification | **เต็มหน้า** (route ใหม่ `/notifications`) เป็น timeline แบบ CRM Activities + lazy-load; **data = mock ก่อน** (real source Phase 2) |

## 4. Command center — `/dashboard` (`lg:hidden`)

stack ของ Paces `.card` (single column). main shell มี padding-inline/bottom ครอบแล้ว (safepay-overrides.css L98/L101 — **ห้ามใส่ px/pb ซ้ำ**, บทเรียน v7).

### [0] Header (น้ำเงินทึบ)
- block `bg-primary` (Paces token) text ขาว: avatar (`rounded-full` ขาว) + ชื่อร้าน + tier chip (`bg-white/20`) + bell (มี count badge `bg-danger`, **44px touch**)
- trust row: label "Trust" + Paces progress (`bg-white/25` track, `bg-white` fill, width=trustScore%) + เลข %
- ข้อมูล: page.tsx ดึง shopName/avatar/tierName/trustScore จาก session+shop (ไม่พึ่ง layout prop)
- bell → navigate `/notifications`
- Source: UserCard concept + `bg-primary` block

### [1] เมนูลัด — grid 4 คอลัมน์ (Shopee grid)
- `.card` + `.card-header` ("เมนูลัด") + grid-cols-4 ของ tile: chip (`bg-{semantic}/15 text-{semantic} rounded-lg size-12`) + label (`text-default-700 text-xs`)
- 8 tiles: รีวิว/เติมเงิน/ลูกค้า/สินค้า/ความสำเร็จ/หมวดหมู่/การยืนยัน/ตั้งค่าร้าน (สี Q4)
- Source: StatisticCard icon-chip pattern

### [2] คำสั่งซื้อ — status row (Shopee การซื้อของฉัน)
- `.card` + `.card-header` ("คำสั่งซื้อ" + "ดูทั้งหมด ›" → `/orders`) + grid-cols-4 ของ status: icon-circle (`size-11 rounded-full bg-{semantic}/15`) + count badge (`bg-danger`, แสดงเมื่อ >0) + label
- 4 สถานะ: รอดำเนินการ(warning,badge)/กำลังจัดส่ง(info,badge)/สำเร็จ(success)/ยกเลิก(default) ← `data.orderStatusCounts`
- Source: StatisticCard

### [3] กระเป๋าเงิน — wallet card (Shopee My Wallet)
- `.card` + row: icon (`bg-success/15`) + "เครดิตคงเหลือ" + ฿balance (`text-default-900 text-lg`) + `btn btn-primary btn-sm` "เติมเงิน" → `/wallet`
- ข้อมูล: wallet balance (SellerWallet) — page.tsx ดึง

### [4] กิจกรรมล่าสุด — timeline (compact)
- `.card` + `.card-header` ("กิจกรรมล่าสุด" + "ดูทั้งหมด ›" → `/notifications`) + timeline 3-5 รายการล่าสุด
- Source: RecentActivity (`apps/ecommerce/RecentActivity.tsx`) — node `size-7.5` + `after:border-dashed`
- ข้อมูล: `data.recentActivity` (activity.service เดิม)

## 5. Notification — `/notifications` (เต็มหน้า, ใหม่)

Source: **`theme/paces/Admin/TS/src/app/(admin)/apps/crm/activities/page.tsx`** (timeline + lazy-load spinner)

- header: back (→ /dashboard หรือ history) + "การแจ้งเตือน" + "อ่านทั้งหมด"
- tab filter: ทั้งหมด/คำสั่งซื้อ/รีวิว/การเงิน/ระบบ (`border-b` active = primary)
- **timeline จัดกลุ่มตามวัน** (`<h6 text-default-400>` date header + `space-y`): row = `flex gap-x-5`:
  - node: `size-7.5 rounded-full border border-dashed border-default-300` + Icon (`text-{semantic}`)
  - dashed connector: `after:border-dashed ... last:after:hidden`
  - content: title (`<strong>`) + desc (`text-default-700`) + ปุ่ม action (`btn btn-sm border-primary text-primary`) + meta (`badge bg-*/15 text-*` + `<small text-default-400>` time)
- **lazy-load:** bottom spinner (`animate-spin ... rounded-full`) — client component, IntersectionObserver โหลดเพิ่มเมื่อ scroll ถึงท้าย
- **data: mock ก่อน** (sample notifications array) — real source (activity.service paginated + unread last-seen) = **Phase 2**
- บน mobile: ตัด `w-30` time column ของ CRM ออก (cramped) — time อยู่ใน meta row

## 6. Bottom nav (exception, เก็บ)
`_shared/SellerBottomNav.tsx` — mobile pattern (Paces ไม่มี). v8: clean arbitrary → token เท่าที่ได้; center button คง (เขียน comment เหตุผล). bell ใน header → /notifications.

## 7. A11y (จาก /impeccable audit — fold เข้า build)
- secondary text ที่ต้องอ่าน → **`text-default-500` ขั้นต่ำ** (ห้าม default-400 บน text สำคัญ — fail 4.5:1; PRODUCT.md AA+ ผู้สูงวัย)
- touch target **≥44px** ทุก interactive (bell, tile, status, ปุ่ม, nav)
- ขาวบนน้ำเงิน (header) → opacity ≥ .9
- focus state ชัดทุก interactive (Paces `focus` util)

## 8. ไฟล์ที่กระทบ
**Command center (rebuild จาก Paces primitive):**
- `dashboard/components/CommandCenter.tsx` (wrapper + order)
- `dashboard/components/SellerHeader.tsx` *(ใหม่)* — header น้ำเงิน + trust (block [0])
- `dashboard/components/ShortcutGrid.tsx` *(rewrite ShortcutPanel)* — grid-4
- `dashboard/components/OrderStatusRow.tsx` *(rewrite OrderStatusTimeline)* — 4-status row
- `dashboard/components/WalletCard.tsx` *(ใหม่)*
- `dashboard/components/RecentActivityFeed.tsx` *(rewrite จาก Paces RecentActivity)*
- `dashboard/page.tsx` (ดึง shop/tier/trust/wallet + ส่งเข้า component)
- `dashboard/_constants/command-center.ts` (SHORTCUT_TILES → 8 tiles semantic)

**Notification (ใหม่):**
- `(dashboard)/notifications/page.tsx` *(ใหม่)* — route
- `(dashboard)/notifications/components/NotificationTimeline.tsx` *(ใหม่)* — timeline + lazy-load client
- `(dashboard)/notifications/components/notification-data.ts` *(ใหม่)* — mock data + type

**Shared:**
- `_shared/SellerMobileHeader.tsx` — dashboard mode ใช้ header ใหม่ (หรือ command center render header เอง); bell → /notifications
- `_shared/SellerBottomNav.tsx` — clean arbitrary

**ไม่แตะ:** layout shell, admin, buyer, `lg:` desktop, schema/API (noti = mock)

## 9. Out-of-scope
- real notification data + unread/read persistence + lazy-load จริง (Phase 2 — v8 ใช้ mock)
- desktop dashboard (`lg:`)
- bell wiring จริง (count = static/derived)
- charts (donut/line ของ Paces demo)
- admin

## 10. Definition of Done
- ทุก block = Paces primitive; grep **ไม่เจอ arbitrary value ใหม่** (ยกเว้น comment กำกับ) + **ไม่เจอ `#7367F0`/`rgba(115,103,240`)**
- tsc 0
- a11y: secondary text ≥ default-500, touch ≥44px
- QA mobile 360px: command center 5 block + bottom nav; /notifications timeline + lazy-load spinner; console clean; หน้าตาเป็น Paces (วางข้าง Paces demo เป็นตระกูลเดียวกัน — visual-quality gate)
