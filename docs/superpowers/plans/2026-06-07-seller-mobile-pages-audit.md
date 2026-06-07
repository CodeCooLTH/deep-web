# Audit + Plan — Seller Pages Mobile Responsiveness

> 2026-06-07 | branch feat/seller-mobile-responsive | จาก 5-agent parallel audit (static @360px; MCP visual ปิดท้าย)
> Context: seller มี mobile shell แล้ว (topbar back+title, ไม่มี sidebar, content เต็มจอ padding 16px) — ที่เหลือคือ **เนื้อหาในหน้า** ยัง responsive ไม่ดี

## 🔑 Cross-cutting (แก้ครั้งเดียว ได้หลายหน้า — leverage สูงสุด)

| # | ปัญหา | ไฟล์ shared | กระทบ |
|---|-------|------------|-------|
| X1 | **ตาราง h-scroll ทุกที่** — `.table-wrapper overflow-x-auto` ไม่มี card-ify | `DataTable.tsx` + `_table.css` | orders, products, categories, wallet, reviews, customers |
| X2 | **TablePagination** render ปุ่มทุกหน้า (ไม่ windowing) + "Showing X to Y" อังกฤษ → ล้นบน mobile | `TablePagination.tsx` | ทุกตาราง |
| X3 | **Touch <44px** — `.btn-sm.btn-icon`=30px | `_buttons.css` / per-action | ทุกหน้า |
| X4 | **Toolbar ไม่ stack full-width** — card-header flex-wrap แต่ child ไม่ w-full | per-page | orders/products/wallet/reviews/customers/categories |
| X5 | **padding `px-7.5!` fixed** บน detail card | per-component | orders detail, reviews, products detail |

**กลยุทธ์ X1:** เพิ่ม pattern card-ify <lg — DataTable รองรับ per-column `meta.responsiveHide` (`hidden sm:table-cell`) **หรือ** แต่ละหน้า render `lg:hidden` card list + `hidden lg:block` table. เลือกแนวเดียวกันทั้ง seller (consistency)

## 🧭 Navigation / Home (ตอบ user complaint "ไม่มีปุ่มกลับหน้าแรก")

- **fullscreen create pages (FAB)** = layout แยก **ไม่มี topbar/home** — มีแค่ "ยกเลิก" (X) ขวา ที่อ่านเหมือน "ทิ้งงาน" + ไป list ไม่ใช่ /dashboard → **นี่คือต้นเหตุหลัก**
  - มี `FullscreenCloseButton.tsx` (router.back()→/dashboard fallback) อยู่แล้วแต่ **ไม่ถูก import** → wire เข้าใช้
  - แก้: ปุ่ม close/back ชัดเจนฝั่งซ้าย (แยกจาก Save ขวา) reads as navigation
- **OrderCreateForm ไม่มี mobile sticky save bar** (High) — ต้อง scroll ขึ้นบนเพื่อ save; `ProductFormV2` มี pattern ดีอยู่แล้ว (copy)
- dashboard sub-pages: back-only (history-aware /dashboard fallback) = พอใช้; home icon = nice-to-have

## 📄 Per-page (High severity เด่น)

| หน้า | High issues | Effort |
|------|-------------|--------|
| /orders list | OrderCard header = h-scroll strip; footer 4 ปุ่มแถวเดียวล้น | M |
| /orders [token] | items table overflow; px-7.5! padding | M |
| /products list | table 8 คอลัมน์ h-scroll; action 3 ปุ่ม 30px สุดขวา | L (card-ify) |
| /products [id] | **`w-xs` ใน review cell** (quick win); summary padding | S-M |
| /categories | table 3 แถว → card-ify (value/effort ดีสุด) | S-M |
| /wallet | ledger 5-col h-scroll; **topup modal footer หลุดจอ** | M |
| /reviews | summary `grid-cols-12` ไม่ stack (cram); review table h-scroll | M |
| /customers | 4-col table h-scroll + pagination ล้น | M |
| /badges | `grid-cols-3` แน่น → `grid-cols-2` (5 นาที) | S |
| /shop | responsive อยู่แล้ว — polish เล็กน้อย | S |
| orders/new | **ไม่มี sticky save bar** (High); stepper 28px | M |
| products/new-v2, edit | gold-standard อยู่แล้ว — minor | S |

## เสนอ sequencing (4 sub-phase)

**M0 — Nav/Home (ตอบ complaint, เร็ว):** fullscreen close/home affordance (wire FullscreenCloseButton, ←ซ้าย) + OrderCreateForm sticky save bar + (home icon optional)
**M1 — Shared infra:** DataTable card-ify pattern + TablePagination windowing/Thai + touch ≥44px util
**M2 — Tables→cards:** orders/products/customers/categories/wallet/reviews (ใช้ pattern M1)
**M3 — Per-page polish:** toolbars stack, padding responsive, badges grid-cols-2, OrderCard header/footer, reviews summary grid, products `w-xs`

แต่ละ sub-phase = agent-team (developer→reviewer→QA MCP @360). QA ปิดท้ายด้วย DevTools MCP ทุกหน้า @360/768.

## หมายเหตุ
- `DataTable`/`TablePagination` = shared → แก้แล้ว regress-check ทุก consumer (รวม admin ถ้าใช้ร่วม — ตรวจก่อน)
- ทุก fix = Tailwind responsive (Paces no-MUI), Base: line, touch ≥44px, Anuphan
