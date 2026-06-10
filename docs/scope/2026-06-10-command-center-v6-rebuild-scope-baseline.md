# Scope Baseline — Command Center V6 Rebuild

> `safepay-product` เป็นคนออก/ดูแล; Controller เป็นคน commit + เปลี่ยนสถานะตามที่ product สั่ง.

สถานะ: SIGNED-OFF (2026-06-10 — safepay-product Gate 2, QA 20/20, ไม่มี GAP/CREEP)
branch: feat/seller-mobile-responsive
อ้างอิง PRD: B-5 (mobile-first), S-3 (สร้าง order ง่าย), S-4 (เห็นสถานะทุก order)
Visual SoT: docs/mockups/home/command-center-v6.html (APPROVED 2026-06-10)
Build plan: docs/superpowers/plans/2026-06-10-command-center-v6-rebuild-build.md
อ้างอิง baseline เดิม: docs/scope/2026-06-07-seller-mobile-responsive-scope-baseline.md (S-7…S-13 เดิม ถูกแทนที่โดย phase นี้)

---

## Goal

rebuild หน้า Seller Mobile Command Center (`/dashboard` ฝั่ง `lg:hidden`) ให้ตรงกับ mockup v6 ที่ user approve แล้ว (2026-06-10) — ใช้ token Deep ที่ถูกต้อง (violet #7367F0, mist #F8F7FA, card radius 14px, เงาหมึกพลัม) แทน V4 ที่ปฏิเสธ — โดยไม่เพิ่ม feature ใหม่และไม่กระทบ desktop/admin.

---

## In-Scope

> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-1 | **Layout foundation — `bottomNavSlot`** เพิ่ม `bottomNavSlot?: ReactNode` optional ใน `src/layouts/VerticalLayout.tsx`; render ครอบ `lg:hidden` (pattern เดียวกับ `topbarSlot`); เพิ่ม CSS global `padding-bottom: calc(5rem + env(safe-area-inset-bottom))` ใน `.seller-mobile-shell .page-content main` @media <1023 ใน `safepay-overrides.css` | (a) `VerticalLayout.tsx` accept prop `bottomNavSlot` — tsc 0; (b) ส่ง JSX เข้า prop แล้วโผล่ใน DOM เฉพาะ `<1024px`; (c) ที่ 360px content ไม่ถูก bottom nav ทับ (`padding-bottom` computed ≥ 80px รวม safe-area) | TODO |
| S-2 | **Constants V6 — `command-center.ts`** ปรับ `SHORTCUT_TILES` 8 tile → 6 tile, ลำดับ: ลูกค้า / เติมเงิน / รีวิว / ความสำเร็จ / ตั้งค่า / Blacklist(disabled); token สีตาม v6 (เติมเงิน = green-tint, Blacklist = neutral opacity-40) | import constants ได้โดยไม่มี TS error; ตรวจด้วย grep ว่ามีรายการ 6 ตัวพอดี ลำดับถูกต้อง; Blacklist มี `disabled: true` | TODO |
| S-3 | **Top bar flat — `IdentityBar.tsx` + `SellerMobileHeader.tsx`** ลบ card wrapper (`bg-white rounded-[20px]`) ออกจาก `IdentityBar`; เปลี่ยน bg ของ sub-page mode ใน `SellerMobileHeader` จาก `#eef1f6` → mist `#F8F7FA`; `<header>` มี `bg-[#F8F7FA]` solid กัน scroll bleed | (a) ที่ 360px: top bar ไม่มี card border/shadow ลอยอยู่เหนือ content (flat บน mist); (b) bg hex ทุก top bar mode = `#F8F7FA` ยืนยันด้วย computed `background-color`; (c) เลื่อน scroll ลง → top bar ยังทึบไม่โปร่ง | TODO |
| S-4 | **Order Status Card V6 — `OrderStatusTimeline.tsx`** CTA "รอคุณดำเนินการ" เปลี่ยนเป็น violet solid `bg-[#7367F0]` text ขาว; 3 stat (จัดส่ง/สำเร็จ/ยกเลิก) วางใต้ divider inline; card radius `rounded-[14px]` shadow `0 2px 8px rgba(47,43,61,.07)` | (a) CTA row มี computed `background-color: rgb(115, 103, 240)` (ไม่ใช่ blue); (b) 3 stat โผล่ใน grid 3 คอลัมน์ใต้ divider (ยืนยัน DOM); (c) card border-radius computed = 14px; (d) กด CTA → navigate `/orders` | TODO |
| S-5 | **Shortcut Panel V6 — `ShortcutPanel.tsx`** อ่านจาก constants 6 tile; grid `grid-cols-3`; tile-box 46px `rounded-[13px]` `bg-[#F2F1F6]`; เติมเงิน = `bg-[#28C76F]/14` icon สีเขียว; Blacklist `opacity-40 pointer-events-none`; card V6 | (a) ที่ 360px: กริด 2 แถว 3 คอลัมน์ ไม่มี horizontal overflow (ยืนยัน `scrollWidth === clientWidth`); (b) tile-box computed width/height = 46px; (c) Blacklist tile ไม่ตอบสนองการ tap (pointer-events-none); (d) เติมเงิน tile สีเขียว ไม่ใช่ neutral | TODO |
| S-6 | **Activity Feed V6 — `RecentActivityFeed.tsx`** feed node ขยายเป็น 28px; tint สีตาม v6: รีวิว=amber-tint, ยืนยัน=green-tint, SMS=cyan-tint, สร้างออเดอร์=violet-tint; PII masked (เบอร์โทรในฟิล feed ใช้ format `092-xxx-NNNN` ไม่โชว์ raw); card V6 radius/shadow | (a) feed node computed width/height = 28px; (b) แต่ละ event type มีสี tint ถูก (ยืนยัน DOM node background); (c) ถ้ามีเบอร์โทรใน feed label ต้องเป็น masked format (grep test หา `rawPhone` / `buyerContact` ใน client payload — ต้องไม่เจอ) | TODO |
| S-7 | **Bottom Nav — `SellerBottomNav.tsx` (ใหม่)** 5-slot fixed nav สูง 64px + `pb-[env(safe-area-inset-bottom)]`; center raised create button 54px violet `top:-26px`; `usePathname` active state; badge pending count บน tab คำสั่งซื้อ; speed-dial 3 pills (สร้างออเดอร์/สินค้า/หมวดหมู่) + backdrop + ESC | (a) ที่ 360px: bottom nav โผล่ fixed bottom ทุกหน้า seller mobile; (b) center FAB สูง 54px พ้น nav-bar ขึ้นมา (computed `top` = -26px relative ต่อ nav-center container); (c) pending count badge โผล่บน tab คำสั่งซื้อเมื่อ count > 0; (d) กด center → backdrop + 3 pills โผล่; ESC หรือ backdrop → ปิด; (e) active tab สี violet, inactive สี ink-40; (f) ≥1024px: bottom nav ไม่โผล่ (verify `lg:hidden` DOM) | TODO |
| S-8 | **Layout wire — `(dashboard)/layout.tsx`** เรียก `getOrderStatusCounts(shop.id)` ด้วย try/catch fallback 0; ส่ง `bottomNavSlot={<SellerBottomNav pendingCount={…}/>}` เข้า VerticalLayout | (a) tsc 0; (b) layout render ได้โดยไม่ crash แม้ `getOrderStatusCounts` throw (fallback 0); (c) `pendingCount` ตรงกับ count จาก DB (ยืนยันด้วย manual check เทียบ `/orders` filter pending) | TODO |
| S-9 | **CommandCenter cleanup — `CommandCenter.tsx`** ลบ `<CreateFab/>`, ลบ `pb-28`, ลบ `<MiniBanner>`; จัดลำดับ OrderStatus → Shortcuts → Activity | (a) grep `CreateFab` ในไฟล์ = 0 import/JSX; (b) grep `MiniBanner` ใน CommandCenter.tsx = 0 render; (c) ลำดับ section ใน DOM: OrderStatus ก่อน Shortcuts ก่อน Activity | TODO |
| S-10 | **ลบ `CreateFab.tsx`** หลังยืนยัน 0 import ทั่ว codebase | grep `CreateFab` ทั่ว `src/` = 0 hit หลังลบ; ไม่มี TS error | TODO |

---

## Mapping T → S (ใช้ enforce ทุก commit)

| Task (build plan) | S-id |
|---|---|
| T1a — เพิ่ม `bottomNavSlot` ใน `VerticalLayout.tsx` | S-1 |
| T1b — เพิ่ม CSS padding-bottom global | S-1 |
| T2 — ปรับ `command-center.ts` constants 6 tile | S-2 |
| T3a — flat `IdentityBar.tsx` | S-3 |
| T3b — sub-page bg `SellerMobileHeader.tsx` | S-3 |
| T4 — `OrderStatusTimeline.tsx` violet CTA + 3-stat | S-4 |
| T5 — `ShortcutPanel.tsx` 6 tile grid-cols-3 | S-5 (อิง S-2) |
| T6 — `RecentActivityFeed.tsx` node/tint V6 | S-6 |
| T7 — `SellerBottomNav.tsx` (ใหม่) | S-7 |
| T8 — layout wire `getOrderStatusCounts` + bottomNavSlot | S-8 (อิง S-1 + S-7) |
| T9 — `CommandCenter.tsx` cleanup | S-9 (อิง S-4, S-5, S-6, S-8) |
| T10 — ลบ `CreateFab.tsx` | S-10 (bundle กับ T9) |

---

## Out-of-Scope

> แตะของในนี้ = CREEP (hard block). ถ้าจำเป็นต้องทำ → Controller ตัดสิน + ย้ายขึ้น In-Scope พร้อมจด Change Log.

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | ระบบ Bell notification จริง (API, unread count จาก DB, notification center) | bell dot ใน v6 เป็น static dot ตกแต่ง — ระบบ notification ยังไม่มี; เลื่อน Phase 2 |
| OOS-2 | Feature Blacklist (ฟังก์ชันตรวจ/จัดการ blacklist จริง) | tile Blacklist ใน v6 = disabled "เร็วๆนี้" opacity-40; feature ยังไม่มี schema/service; เลื่อน Phase 2 |
| OOS-3 | Mini Banner / Promo section (admin-managed ข่าว/โปรโม) | ถูกตัดออกจาก v6 mockup โดยสิ้นเชิง (ไม่มีใน HTML); เลื่อน Phase 2 |
| OOS-4 | Redesign หน้า Orders list, Products list | phase นี้แตะแค่ `/dashboard` command center; หน้าอื่นเปลี่ยน layout = CREEP |
| OOS-5 | Desktop layout (≥1024px) — StatCards, SalesReport, RecentOrder widget | desktop ต้อง "not regress" เท่านั้น; ไม่แก้ไข |
| OOS-6 | Admin side (`(paces)/admin/`) ทุกหน้า | คนละ surface; ไม่ใช่ scope นี้ |
| OOS-7 | Backend schema / API route ใหม่ / migration | phase นี้เป็น visual rebuild — `getOrderStatusCounts` มีอยู่แล้ว ไม่สร้าง service ใหม่ |
| OOS-8 | Facebook OAuth credentials (prod login) | infrastructure; ไม่เกี่ยวกับ visual rebuild |
| OOS-9 | PWA, service worker, manifest | นอก scope platform |
| OOS-10 | Dark mode | ไม่เกี่ยวกับ visual rebuild; เลื่อน Phase 2 |
| OOS-11 | Animation/transition เพิ่มเติมนอกที่ v6 ระบุ | ห้ามเพิ่มเกิน mockup; choreography page-load ห้ามในฝั่ง product (DESIGN.md Don't) |

---

## Assumptions

1. **v6 mockup = baseline freeze** — `docs/mockups/home/command-center-v6.html` คือ visual SoT ที่ไม่เปลี่ยนแปลงในระหว่าง phase; ถ้า user ขอแก้ mockup ระหว่าง build ต้องผ่าน Controller + จด Change Log ก่อนเริ่มงาน
2. **`getOrderStatusCounts(shopId)`** มีอยู่แล้วใน service layer (ใช้งานใน S-8 / T8); ถ้าพบว่าไม่มีจริง developer ต้อง flag Controller ก่อน implement — ห้ามสร้าง service ใหม่โดยไม่แจ้ง
3. **Paces ไม่มี bottom nav template ตรง** — T7 ใช้ multi-source compose-from-primitive exception ตาม build plan §4 (ระบุ 2 ไฟล์ใน `Base:` line commit); นี่คือ exception ที่รับรู้แล้ว ไม่นับเป็น CREEP
4. **VerticalLayout admin ไม่ได้รับ bottomNavSlot** — prop เป็น optional; admin layout ไม่ส่ง = ไม่กระทบ admin
5. **Desktop (≥1024px) ไม่ถูกแตะ** — acceptance คือ "ไม่ regress" เท่านั้น; ถ้า commit ทำให้ desktop พัง = GAP ทันที
6. **MiniBanner** — ไม่ลบไฟล์ `MiniBanner.tsx` (เก็บไว้สำหรับ Phase 2); แค่ไม่ render ใน `CommandCenter.tsx`; `PROMO_BANNER` คง null
7. **PII masking** — เบอร์โทรใน activity feed ต้อง masked ที่ server boundary ก่อนส่งลง client component (บทเรียนจาก `feedback_rsc_pii_neutralize_at_source`); developer ต้องตรวจ ไม่ใช่ทำแค่ display-level
8. **Font Anuphan** — โหลดอยู่แล้วผ่าน Paces layout; phase นี้ไม่ต้อง import ใหม่ แต่ห้าม hardcode font อื่น
9. **Token V6 ≠ DESIGN.md card radius** — DESIGN.md ระบุ card radius 8px (`{rounded.lg}`) แต่ v6 mockup ใช้ 14px (`rounded-[14px]`) สำหรับ command center cards; **v6 เป็น SoT สำหรับ phase นี้** เนื่องจากเป็น seller product surface ที่ approve แล้ว (risk flag: ถ้า token ขัดกันต่อไปควรอัปเดต DESIGN.md ส่วน seller product; เลื่อนเป็น doc-sync Phase 2)

---

## Acceptance รวมระดับ phase (เกณฑ์ผ่าน Phase Gate 2)

ทุกข้อด้านล่างต้องผ่านก่อน Sign-off:

1. **Visual token ถูก** — tsc 0; grep ไม่พบ `blue-600` / `#2563eb` / `#eef1f6` / `rounded-[20px]` ใน component ที่แก้ (ยืนยัน V4 token ไม่หลงเหลือ)
2. **@360px no horizontal scroll** — `document.documentElement.scrollWidth === window.innerWidth`; bottom nav 5-slot + raised center โผล่; content ไม่ถูก nav ทับ
3. **@768px** — layout ยังถูกต้อง; bottom nav โผล่; center FAB อยู่ถูกตำแหน่ง
4. **@1024px (desktop)** — bottom nav ไม่โผล่ (`lg:hidden`); IdentityBar ไม่โผล่; dashboard desktop widget (StatCards, SalesReport, RecentOrder) ครบและไม่ regress
5. **Token Deep ครบ** — violet CTA order card `#7367F0`; bg mist `#F8F7FA`; card radius 14px; bottom nav center `#7367F0`; Anuphan ทุก element
6. **6 tile grid-cols-3** — ลูกค้า/เติมเงิน/รีวิว/ความสำเร็จ/ตั้งค่า/Blacklist(disabled); เติมเงิน green; Blacklist opacity-40 ไม่ตอบสนอง tap
7. **Bottom nav active state** — `/dashboard` → tab หน้าหลัก violet; `/orders` → tab คำสั่งซื้อ violet; tab อื่น ink-40
8. **Badge pending** — เมื่อมี pending order > 0: badge count ปรากฏบน tab คำสั่งซื้อ (ยืนยันด้วย DB count เทียบ)
9. **Speed-dial** — กด center → backdrop + 3 pills (สร้างออเดอร์ / สินค้า / หมวดหมู่); ESC หรือ backdrop → ปิด
10. **PII masked** — activity feed ไม่โชว์ raw phone/email ในฝั่ง client (ตรวจ Network payload / React DevTools)
11. **Touch ≥44px** — ทุก interactive element บน bottom nav และ shortcut tile มี touch target ≥44px (computed height)
12. **Anuphan** — `font-family` computed บน body/heading/label ใน command center = Anuphan (ไม่ใช่ Inter/system-ui อื่น)
13. **CreateFab ลบแล้ว** — grep `CreateFab` ใน `src/` = 0 hit

---

## Deferred → Phase 2

> ของที่จงใจไม่ทำใน phase นี้ — ไม่นับเป็น GAP ตอน audit/sign-off

- Blacklist feature (schema + service + UI ทำงานได้จริง)
- Bell notification system (API + unread count + notification center)
- Mini Banner / Promo banner (Promo model + admin CRUD)
- DESIGN.md token sync สำหรับ seller product card radius (14px vs 8px)
- `getOrderStatusCounts` cache ด้วย React `cache()` (double-call acceptable MVP)
- PWA manifest, service worker
- Dark mode
- Redis-backed rate-limit per-device (อยู่ใน NFR backlog แยก)

---

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-06-10 | baseline สร้าง | Gate 0 — phase command-center-v6-rebuild เริ่มต้น | - |
| 2026-06-10 | SIGNED-OFF | Gate 2 — S-1…S-10 ผ่านครบ, QA 20/20, reviewer APPROVE 2 batch, ไม่มี GAP/CREEP/OOS | safepay-product |
