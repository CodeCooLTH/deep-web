# Seller Flow — Mobile-Responsive QA Checklist (@375px)

> Reusable checklist สำหรับ regression mobile ของ flow seller ทั้งสาย: สมัคร → login → command center → orders → products.
> วิธีตรวจ: Chrome DevTools MCP (หรือ device จริง) ที่ viewport **375px**, host `seller.deepth.local:4000` (dev) / `seller.deepthailand.app` (prod).
> Baseline audit (code-level): 2026-06-16 — ไม่พบ blocker/horizontal-overflow; ทุกหน้า build mobile-first จาก Paces token + `.card` fluid.
> หมายเหตุ: `(paces)/layout.tsx` ตั้ง `viewport.maximumScale=1 + userScalable=false` → iOS ไม่ zoom ตอน focus input (input 14px ไม่เป็นปัญหา).

## วิธีนับผ่าน
แต่ละหน้า: (1) ไม่มี horizontal scroll (`document.documentElement.scrollWidth <= viewport`), (2) ไม่มี element โดน clip ขอบขวา, (3) tap target หลัก แตะง่าย, (4) modal/dropdown ไม่หลุดจอ.

---

## A. สมัครสมาชิก (`/auth/sign-up`) + Auth ทั้งชุด

- [ ] **sign-up** — 6 field stack เดียว, ไม่มี element หลุดขอบขวาใน padding 24px
- [ ] **sign-up — Choices.js category dropdown** (จุดเปราะ, เคยมี prod bug positioning 2026-06-16): เปิดแล้ว anchor ใต้ trigger, option list ไม่ล้นขอบขวา, overlay (ไม่ดันฟิลด์ล่าง), z-index อยู่เหนือ field ถัดไป
- [ ] **sign-up** — Facebook button + ปุ่มสมัคร `w-full`, ข้อความไม่ overflow; divider ปกติ
- [ ] **sign-in** — username/password + eye-toggle, inline error (ไม่ใช่ toast) แสดงใต้ field
- [ ] **eye-toggle (ทุกหน้า password)** — แตะเปิด/ปิดได้ ไม่กดโดน input; icon อยู่กลางแนวตั้งใน field (~37px) [tap ~24×37px < 44 — borderline, verify]
- [ ] **verify-otp** — 6 OTP box อยู่บรรทัดเดียว ไม่ wrap, gap สวย, เลขอ่านออก (box ~49px ที่ 375px); auto-advance + backspace ทำงาน; keypad ตัวเลข + SMS autofill (`one-time-code`)
- [ ] **reset-pass** — phone field `type=tel inputMode=numeric`, ปุ่ม `w-full`
- [ ] **new-pass** — 2 password field + strength bar `w-full`, ไม่ overflow; redirect ถ้าไม่มี resetDraft (ไม่ flash layout พัง)
- [ ] **shell ทุกหน้า** — mobile เต็มจอ (`rounded-none`), image panel `hidden md:block` ซ่อนบน mobile; landscape/จอเตี้ย: copyright ไม่ทับ form

## B. Command Center / Dashboard (`/dashboard`)

- [ ] **ไม่มี horizontal scroll** — เช็ค `SellerHeader` footer row (trust bar) + `WalletCard` row (balance + ปุ่ม)
- [ ] **mobile tree ถูกต้อง** — render `CommandCenter` (`lg:hidden`) เท่านั้น; desktop widget (StatisticCard/SalesReport/RecentOrder/chart) อยู่ `hidden lg:block` ไม่โผล่
- [ ] **ไม่มี double-header** — `SellerMobileHeader` คืน `null` บน `/dashboard` (มี `SellerHeader` ในเนื้อแทน)
- [ ] **ShortcutGrid (4-col)** — label ไทยยาว ("ความสำเร็จ"/"ตั้งค่าร้าน"/"การยืนยัน") wrap ไม่ราตี้/แถวไม่สูงเหลื่อมจนเกะกะ
- [ ] **SellerHeader trust bar** — progress track ยังอ่านเป็นแถบมีความหมาย (ไม่บางเป็นเส้น) กับ "100/100"
- [ ] **WalletCard** — ใส่ยอดใหญ่ (฿1,234,567): ปุ่ม "เติมเงิน" ไม่หลุดจอ, ยอด wrap แทน overflow
- [ ] **OrderStatusRow** — count ≥100 ทั้ง 4: badge clamp `99+`, แถว 4-col ไม่ล้น
- [ ] **OnboardingModal** (force `needsOnboarding`) — card มี gutter ข้าง (`w-[calc(100%-24px)]`), ไม่ clip; Step0 OTP 6 box พอดี (เช็ค 360/320 ถ้า support); Step1 mini-card 3 ใบ `text-2xs` อ่านออก; Step3 slug preview (30 char) ไม่ overflow; backdrop scroll-lock; modal `z-80` เหนือ bottom-nav
- [ ] **bottom-nav clearance** — เลื่อนสุด: การ์ดสุดท้ายเห็นครบเหนือ bar 64px (reserve 80px); `seller-mobile-shell` class อยู่บน wrapper
- [ ] **speed-dial FAB** — เปิดจาก bottom-nav กลาง: pill ไม่ล้นแนวนอน, backdrop dim, z-order ถูก

## C. คำสั่งซื้อ — Orders (list + detail)

### List (`/orders`)
- [ ] **mobile IA** — แสดง OrderCard (`lg:hidden`); `OrdersTable` + `BulkActionBar` (checkbox) อยู่ `hidden lg:block` ไม่โผล่บน mobile
- [ ] **OrderCard** — ชื่อผู้ซื้อ truncate, ชื่อสินค้า line-clamp-2, ราคา tabular-nums ไม่ overflow
- [ ] **status tabs** — scroll แนวนอนได้, tab active auto-center, swipe ซ้าย-ขวา สลับ tab
- [ ] **action ใน card** — ปุ่ม Copy / SMS / ⋮ menu: แตะแยกได้ ไม่ mis-tap (targets ~30–37px, gap 6px — จุดเสี่ยง MEDIUM)
- [ ] **Filter modal** — full-screen, footer ปุ่มกดถึง, ไม่โดน keyboard บัง
- [ ] **lazy-load** — เลื่อนถึง sentinel โหลดเพิ่ม (ต้อง >8 ออเดอร์)

### Detail (`/orders/[token]`)
- [ ] **single-column stack** — StatusHero → CustomerDetails → OrderSummary → Review → OrderDetails → Payment → ShippingActivity
- [ ] **OrderSummary** — แสดง mobile stacked list (`sm:hidden`) ไม่ใช่ table; breakdown ราคา/VAT/discount ไม่ล้น; ชื่อสินค้ายาว truncate
- [ ] **StatusHero actions (PENDING+SHIPPED)** — Copy+SMS wrap สวย; "บันทึกการจัดส่ง" `w-full`; expand ShipForm → select + tracking input ไม่ล้น; Cancel `w-full`
- [ ] **PaymentCard** — access-URL input (`flex-1`) + ปุ่ม "บันทึกลิงก์" อยู่แถวเดียวไม่ล้น; URL ที่บันทึก `break-all` wrap
- [ ] **ShippingActivity** — timeline desc `break-words`, เวลา `nowrap shrink-0`, tracking `font-mono` (Latin) ไม่ล้น
- [ ] **bottom-nav clearance** — การ์ดสุดท้าย (ShippingActivity) เห็นครบเหนือ bottom-nav
- [ ] **confirm dialog** — ส่ง SMS / ยกเลิก → Swal/pacesConfirm center + พอดีจอ 375px

## D. สินค้า — Products (list + create/edit)

### List (`/products`)
- [ ] **mobile card (ไม่ใช่ table)** — DataTable desktop `hidden lg:block`; mobile แสดง card list (`lg:divide-y`)
- [ ] **header filter row** — search + react-select filter + page-size + ปุ่ม "เพิ่มสินค้า": wrap ไม่ล้น; **react-select control ยืดเต็มกว้าง ไม่ตัน** (จุดเสี่ยง MEDIUM #1)
- [ ] **react-select dropdown** — เปิดบน mobile: option list ไม่หลุดจอ, ไม่ค้าง opacity (เทียบ FilterDropdown bug เดิม)
- [ ] **product card** — ชื่อยาว truncate, ราคา/badge ประเภท/สถานะ wrap ไม่ดันปุ่ม; ปุ่มแก้/ลบ `!size-11` (44px) แตะง่าย ไม่เบียด "ขายแล้ว N"

### Create/Edit (`/products/new-v2`, `/products/[id]/edit`)
- [ ] **tab switcher** — "แก้ไข/ตัวอย่าง" สลับได้บน mobile (split layout เป็น single-col)
- [ ] **fields เต็มกว้าง** — ทุก input/textarea `block w-full`
- [ ] **type picker / capability / billing chips** — แตะเลือกง่าย (chips ~32–36px < 44px — จุดเสี่ยง #6); scroll-x ครบทุกตัวเลือก
- [ ] **price** — quick-pick chips scroll-x, number input + ฿ ไม่ล้น
- [ ] **image upload** — แตะ dropzone เปิด picker; hero preview + thumbnail strip scroll-x; ปุ่มลบ hero (`size-9`/36px) + thumbnail (`size-5`/20px — เล็กมาก, verify แตะโดน)
- [ ] **tags input** — พิมพ์ + suggestion dropdown ไม่หลุดจอ/ไม่ทับ field ถัดไป; chips wrap
- [ ] **sticky bottom save bar** — ไม่ทับ field สุดท้าย (form มี `pb-20`); ปุ่ม save `min-h-12 w-full`
- [ ] **edit — FullscreenPageHeader** — ปุ่ม save (`min-h-11`/44px) มุมขวาบน ไม่ทับ title; back button ซ้ายทำงาน

---

## สรุป issue (baseline audit 2026-06-16, code-level) + สถานะแก้

| Sev | Issue | จุด | สถานะ |
|-----|-------|-----|-------|
| MED | tap target ปุ่มใน-card 30–37px (< 44px) — orders action (Copy/SMS/⋮), type-picker/capability/billing chips, eye-toggle | Paces `.btn`/`.btn-icon`/`.btn-sm` | ✅ **FIXED** — `min-h-11`(+`min-w-11`) บน orders action 3 ปุ่ม + chips 4 + eye-toggle 3 (scoped ผ่าน className/compact, ไม่แตะ CSS base; table/iconOnly variant desktop ไม่โดน) |
| MED | products react-select filter width ไม่ 100% บน mobile | `ProductsListing.tsx` filter row | ✅ **FIXED** — wrapper `flex w-full flex-col md:flex-row` + `input-icon-group w-full` |
| LOW | DataTable mobile card ใช้ arbitrary `text-[Npx]` (ละเมิด HR7) | `ProductsListing.tsx` | ✅ **FIXED** — `text-[14px]→text-sm`, `[12px]→text-xs`, `[10px]→text-2xs` |
| MED | Choices.js category dropdown positioning @375px (CSS fix อยู่แล้ว แต่ geometry ต้อง visual-verify) | `sign-up` | ⏳ **visual-verify** (ยืนยันจากโค้ดไม่ได้ — รอ MCP/device) |
| LOW | ShortcutGrid label ไทยยาว wrap → แถวเหลื่อม | dashboard | ◻️ ยังไม่แก้ (cosmetic) |
| LOW | OnboardingModal Step1 mini-card `text-2xs` แน่น | dashboard | ◻️ ยังไม่แก้ (cosmetic) |
| — | dead components (MiniBanner/ShortcutPanel/OrderStatusTimeline) มี HR7 debt แต่ไม่ render | dashboard | ◻️ candidate ลบทิ้ง |

**ไม่มี HIGH / ไม่มี horizontal-overflow.** โครงสร้าง mobile-friendly; MEDIUM ทั้งหมด + LOW HR7 แก้แล้ว (tsc 0, HR7 grep 0) — เหลือ Choices.js visual-verify + LOW cosmetic.
