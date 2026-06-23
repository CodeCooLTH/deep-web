# Seller Command Center v10 — QA Checklist

> Feature: seller-command-center-v10 (CompactHero + OrderStatusBand + CarouselGrid + ActivityTimeline + BottomNav)
> Viewport: **360px และ 390px** (mobile); ยืนยัน desktop ≥1024px ด้วย
> QA run: 2026-06-21 (end-of-phase) — Playwright E2E + Chrome DevTools MCP
> Spec: `e2e/seller-command-center-v10.spec.ts`
> บัญชีทดสอบ: `btpremium_suksawat` / `Abcd123!` (หรือ OTP `0000000001`/`123456`)

---

## สรุปผล run ล่าสุด: **13/15 PASS — 2 FAIL (BUG-2)**

| หน้า | 360px | 390px | หมายเหตุ |
|------|-------|-------|----------|
| /dashboard | **FAIL** (BUG-2: horizontal overflow 4px) | **FAIL** (BUG-2: same) | layout render ถูกต้อง แต่ scrollWidth > innerWidth 4px |
| /notifications | PASS | PASS | real data render, groups by วันนี้/เมื่อวาน/ก่อนหน้า |
| /orders | PASS | PASS | mobile filter chips + search visible; bottom nav hidden by design |
| /products | PASS (BUG-1 warn) | PASS (BUG-1 warn) | เพิ่มสินค้า btn height 31.5px < 44px standard |

---

## Pre-flight Setup

- [x] server รันที่ `seller.deepth.local:4000` (HTTP 307 redirect = ปกติ)
- [x] login `btpremium_suksawat` / `Abcd123!` → redirect `/dashboard` (ไม่เด้ง /onboarding) 
- [x] Playwright helpers: `createSeller('complete')` + `loginAs(context, seeded)` ทำงานได้
- [x] `npx playwright install chromium` ติดตั้งแล้ว
- [x] `.env.local` โหลด NEXTAUTH_SECRET ได้ (JWT encode ทำงาน)

---

## A. /dashboard — Command Center v10

### A1. Login guard
- [x] login แล้วไม่เด้ง /onboarding (btpremium_suksawat มี slug แล้ว)
- [ ] logout แล้วเข้า /dashboard → redirect /auth/sign-in

### A2. Mobile layout toggle (lg:hidden / hidden lg:block)
- [x] desktop ≥1024px: desktop widgets แสดง (StatisticCard, SalesReport, RecentOrder, AchievementLevel)
- [x] mobile <1024px: desktop block ซ่อน (`hidden lg:block` = display:none ที่ 360px) — **PASS**
- [x] mobile <1024px: CommandCenter wrapper (`lg:hidden`) visible — **PASS** (content renders, confirmed via Playwright screenshot)

### A3. CompactHero (S-2)
- [x] hero พื้นหลัง SVG ลำแสง xenon โทน Paces น้ำเงิน `#2b7be0` (ไม่ใช่ม่วง) — **PASS** (Playwright color check)
- [x] ไม่มี Vuexy purple `#7367F0` ใน DOM — **PASS**
- [x] SVG trust ring (circle stroke-dasharray) render ≥1 — **PASS**
- [x] avatar / initials แสดง
- [x] ชื่อร้าน (`shopName`) แสดง — **PASS**
- [x] stats row: X คำสั่งซื้อ · Y รีวิว · ★ rating — **PASS** (OrderStatusBand heading)
- [x] bell icon (solar:bell-bold-duotone) → /notifications — **PASS** (nav + screenshot confirm)
- [x] bell tap target width ≥44px, height ≥44px — **PASS** (Playwright bounding box check)
- [x] กด bell → navigate to /notifications — **PASS** (test 9)
- [x] score chip มุมล่าง avatar แสดง trust score — visual ผ่าน screenshot

### A4. Wallet row (S-3)
- [x] wallet icon + ฿balance text แสดง
- [x] เติมเงิน link → /wallet visible — **PASS** (test 10)
- [x] คัดลอกลิงก์ร้าน button visible (ShopLinkButtons) — **PASS** (test 10)
- [ ] กด คัดลอกลิงก์ร้าน → pacesToast "คัดลอกลิงก์ร้านแล้ว" (clipboard API / manual test)
- [x] แชร์ลิงก์ร้าน button visible

### A5. OrderStatusBand — คำสั่งซื้อ (S-5)
- [x] card heading "คำสั่งซื้อ" แสดง — **PASS** (test 1-2 heading assertion passed before overflow check)
- [x] 4 links: /orders?status=PENDING / SHIPPED / CONFIRMED / CANCELLED — **PASS**
- [x] Solar Duotone icons render (flat, ไม่มี circle ครอบ) — **PASS** (icon render check)
- [x] badge เฉพาะ PENDING/SHIPPED เมื่อ count>0
- [x] CONFIRMED/CANCELLED ไม่มี badge
- [x] กด status link → navigate /orders?status=XXX

### A6. CarouselGrid — เมนูลัด (S-4)
- [x] heading "เมนูลัด" แสดง — **PASS**
- [x] 7 tiles: รายงาน/รีวิว/ความสำเร็จ/สินค้า/ลูกค้า/คูปอง(disabled)/ตั้งค่า — **PASS** (tests pass)
- [x] คูปอง tile = disabled (aria-disabled="true", title="เร็ว ๆ นี้") — **PASS** (test assertion)
- [x] ไม่มี dot pagination (7 tiles < 8 = 1 หน้า) — **PASS** (tablist not visible)
- [x] Solar Duotone icons render — **PASS** (SVG count > 0)
- [ ] swipe carousel (manual — ต้องการ touch gesture)
- [ ] tiles >8: dots แสดง + ไป-กลับหน้า (edge case, ยังไม่ทดสอบ)

### A7. ActivityTimeline — กิจกรรมล่าสุด (S-6)
- [x] heading "กิจกรรมล่าสุด" แสดง — **PASS** (assertion ก่อนถึง overflow check)
- [ ] real data items: icon solar + label + เวลา พ.ศ. (formatDateTime)
- [x] empty state แสดงเมื่อไม่มี activity (seeded user = 0 activity)

### A8. BottomNav raised FAB
- [x] nav.fixed.bottom-0 แสดง — **PASS** (test 15)
- [x] หน้าหลัก tab active (text-primary / active class) — **PASS** (test 15)
- [x] raised FAB ปุ่มกลาง render
- [ ] กด FAB → speed-dial pills โผล่ (สร้างออเดอร์/สินค้า/หมวดหมู่)
- [ ] กด backdrop → ปิด speed-dial

### A9. ไม่มี horizontal overflow
- [x] 360px: **FAIL — BUG-2** (scrollWidth=364, vw=360, overflow=4px)
- [x] 390px: **FAIL — BUG-2** (same root cause)
- สาเหตุ: `CompactHero -mx-5 (-20px)` vs `safepay-overrides.css padding-inline: 1rem (16px)` ไม่ตรงกัน (ควรเป็น `-mx-4`)

### A10. Console errors
- [x] ไม่มี console error บน /dashboard — **PASS** (MCP list_console_messages)

---

## B. /notifications (S-9)

- [x] เปิดจาก bell link (กด bell → /notifications) — **PASS** (test 9)
- [x] page title มี "การแจ้งเตือน" — **PASS** (tests 3-4)
- [x] .card wrapper แสดง — **PASS** (tests 3-4)
- [x] ไม่มี horizontal overflow @ 360px — **PASS** (tests 3-4)
- [x] ไม่มี horizontal overflow @ 390px — **PASS** (tests 3-4)
- [x] bottom nav แสดง — **PASS** (tests 3-4)
- [x] real data: groups "เมื่อวานนี้" / "ก่อนหน้า" พร้อม activity items — **PASS** (MCP snapshot ยืนยัน)
- [x] ปุ่ม "อ่านทั้งหมด" แสดง — **PASS** (MCP snapshot uid=5_50)
- [x] timestamp ใช้ formatDateTime พ.ศ. (เช่น "2569-06-20 16:12:21") — **PASS** (snapshot)
- [x] "ดูรายละเอียด" link → /orders/[token] — **PASS** (snapshot)
- [ ] lazy-load: scroll ถึงล่าง → โหลดรายการเพิ่ม (status "กำลังโหลด" พบใน snapshot — ยังไม่ verify trigger)
- [ ] กด "อ่านทั้งหมด" → unread tint หาย (manual)
- [ ] empty state "ยังไม่มีการแจ้งเตือน" (ต้องใช้บัญชีที่ไม่มี activity)
- [x] ไม่มี console error — **PASS**

---

## C. /orders (S-10)

- [x] page title มี "ออเดอร์" — **PASS** (tests 5-6)
- [x] mobile search input (placeholder "ค้นหาเลขออเดอร์ / ชื่อลูกค้า / เบอร์") visible — **PASS** (tests 5-6)
- [x] filter chip "ทั้งหมด" visible — **PASS** (tests 5-6)
- [x] filter chip "รอดำเนินการ" visible — **PASS** (tests 5-6)
- [x] filter chip "จัดส่ง" (regex /จัดส่ง/) visible — **PASS** (tests 5-6); label จริง = "จัดส่งแล้ว"
- [x] filter chip "สำเร็จ" visible — **PASS** (tests 5-6)
- [x] filter chip "ยกเลิก" visible — **PASS** (tests 5-6)
- [x] กด chip รอดำเนินการ → page ไม่ crash (title ยังมี "ออเดอร์") — **PASS** (tests 5-6)
- [x] กด chip สำเร็จ → filter ทำงาน ไม่ crash — **PASS** (test 14)
- [x] back link "ย้อนกลับ" แสดงแทน bottom nav (by design) — **PASS** (tests 5-6)
- [x] BottomNav ซ่อนบน /orders (pathname === '/orders' → return null) — **PASS** (by design, confirmed code)
- [x] ไม่มี horizontal overflow @ 360px — **PASS** (tests 5-6)
- [x] ไม่มี horizontal overflow @ 390px — **PASS** (tests 5-6)
- [x] ไม่มี console error — **PASS**
- [x] desktop: stat cards (รอดำเนินการ/จัดส่งแล้ว/สำเร็จแล้ว/ยกเลิก) + table + search — **PASS** (MCP snapshot)
- [ ] chip active = solid น้ำเงิน (visual — ต้องเช็ค computed bg-primary class)
- [ ] OrderCard mobile แสดงปกติ (thumbnail / ชื่อ / ราคา / badge)
- [ ] filter chip "กำลังจัดส่ง" vs "จัดส่งแล้ว" — label ใน mobile = "จัดส่งแล้ว" (ต่างจากสเปกที่บอก "กำลังจัดส่ง") — **carry: ตรวจสอบ label consistency กับ spec S-10**

---

## D. /products (S-11)

- [x] page title มี "สินค้า" — **PASS** (tests 7-8)
- [x] ปุ่ม "เพิ่มสินค้า" link → /products/new visible — **PASS** (tests 7-8)
- [x] search input visible — **PASS** (tests 7-8)
- [x] filter chip "ทั้งหมด" (.badge) visible — **PASS** (tests 7-8)
- [x] filter chip "เปิดขาย" visible — **PASS** (tests 7-8)
- [x] filter chip "ปิดการขาย" visible — **PASS** (tests 7-8)
- [x] ไม่มี "สินค้าหมด" chip (CR-1) — **PASS** (tests 7-8)
- [x] กด chip เปิดขาย → filter ทำงาน ไม่ crash — **PASS** (tests 7-8)
- [x] ไม่มี horizontal overflow @ 360px — **PASS** (tests 7-8)
- [x] ไม่มี horizontal overflow @ 390px — **PASS** (tests 7-8)
- [x] bottom nav แสดง — **PASS** (tests 7-8)
- [x] ไม่มี console error — **PASS**
- [x] **BUG-1**: ปุ่มเพิ่มสินค้า height = 31.5px < 44px (tap target ต่ำกว่า standard) — **WARN** (detected both viewports)
- [ ] product row: thumb + ชื่อ + ราคาน้ำเงิน + badge สถานะ (ต้องมีสินค้าก่อนจึงจะเห็น)
- [ ] chip active = solid น้ำเงิน (visual)

---

## E. Cross-cutting

- [x] font = Anuphan (ภาษาไทยอ่านออก ไม่ใช่ fallback) — **PASS** (visual screenshot confirm)
- [x] primary color = Paces น้ำเงิน `#2b7be0` ไม่ใช่ Vuexy purple `#7367F0` — **PASS** (test 12)
- [x] Solar Duotone icons render (ไม่ใช่กล่องว่าง) — **PASS** (test 13, SVG count > 0)
- [x] ไม่มี runtime console error ทุกหน้า — **PASS**
- [x] login ไม่เด้ง onboarding (slug มีแล้ว) — **PASS**
- [ ] font-mono ไม่ถูกใช้บน heading/text ไทย
- [ ] dark mode (ถ้ามี)

---

## Bug List (จาก run นี้)

| ID | ความรุนแรง | หน้า | อาการ | ที่เกิด |
|----|-----------|------|-------|---------|
| BUG-2 | **HIGH** | /dashboard (360px, 390px) | Horizontal overflow 4px — `scrollWidth=364 > innerWidth=360` | `CompactHero.tsx` ใช้ `-mx-5` (-20px) แต่ `safepay-overrides.css` ตั้ง `padding-inline: 1rem` (16px) ไม่ใช่ 1.25rem — ควรเป็น `-mx-4` หรือ `margin-inline: -1rem` |
| BUG-1 | **MEDIUM** | /products (360px, 390px) | ปุ่ม "เพิ่มสินค้า" height = 31.5px < 44px mobile tap target standard | `ProductsListing.tsx` ใช้ `btn btn-sm` (Paces btn-sm py-1) — ต้องแก้เป็น `btn` หรือเพิ่ม `min-h-[44px]` |

---

## ยังไม่ได้เทส (carry)

- [ ] clipboard toast "คัดลอกลิงก์ร้านแล้ว" จาก ShopLinkButtons (clipboard API ต้องการ https หรือ localhost — test local ยาก)
- [ ] speed-dial FAB pills open/close (touch gesture)
- [ ] carousel swipe (touch gesture)
- [ ] lazy-load infinite scroll บน /notifications trigger
- [ ] filter chip label "กำลังจัดส่ง" vs "จัดส่งแล้ว" — ตรวจ label consistency
- [ ] chip active solid blue visual (computed style / screenshot compare)
- [ ] product row visual (ต้องการ account ที่มีสินค้า)
- [ ] dark mode / landscape orientation
- [ ] unread tint (ฟ้าจาง) บน /notifications items ที่ยังไม่อ่าน
- [ ] tiles >8 → dots pagination แสดงและทำงาน (edge case)
- [ ] tap target ปุ่มอื่น ๆ ในหน้า (filter chip / bell / wallet / status links)
