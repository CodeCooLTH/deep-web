# Scope Baseline — Seller Mobile Responsive (Phase seller-mobile-responsive)

> `safepay-product` เป็นคนออก/ดูแล; Controller เป็นคน commit + เปลี่ยนสถานะตามที่ product สั่ง.

สถานะ: ACTIVE
อ้างอิง PRD: B-5 (Responsive mobile-first), S-4 (เห็นสถานะทุก order), S-3 (สร้าง order — ง่ายมาก) · spec: ไม่มี spec แยก (งาน pure CSS/layout)

## Goal

ทำให้ seller dashboard ฝั่ง `(paces)/` (Preline 4 + Tailwind 4) ใช้งานได้บน viewport 360–768px โดยไม่มี layout push, column collapse, touch target เล็กเกินไป หรือ toolbar ล้นจอ — ครอบคลุม 5 cluster ที่ระบุจาก planner sweep.

## In-Scope

> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-1 | `_layout.css` — เพิ่ม `ms-0` reset สำหรับ offcanvas state | ที่ viewport 360px: เปิดหน้า seller ใด ๆ → `.page-content` ไม่ถูก margin-inline-start push (computed `margin-inline-start` = 0px ขณะ `data-sidenav-size="offcanvas"`); เนื้อหาเริ่มต้นชิดซ้ายของ viewport | TODO |
| S-2 | `useLayoutContext.tsx` — เรียก `handleResize()` ทันทีที่ mount ครั้งแรก | เปิดหน้าครั้งแรก (fresh load / hard refresh) บน viewport ≤768px: `data-sidenav-size` บน `<html>` = `offcanvas` ตั้งแต่ paint แรก (ไม่ต้องรอ resize event); ตรวจสอบด้วย DevTools Elements panel | TODO |
| S-3 | `DataTable.tsx` และ `_table.css` — ตาราง scroll แนวนอนได้บน mobile | `.table` มี `min-width` เพียงพอให้ทุก column แสดงครบ (ไม่ collapse เป็น 0px); ที่ 360px: กดลาก/swipe แนวนอนบน `.table-wrapper` ได้ — ทดสอบกับหน้า Products, Customers, Wallet, TopUp (ใช้ Chrome DevTools device emulation + scrollWidth > clientWidth ยืนยัน overflow จริง) | TODO |
| S-4 | `OrderCard.tsx` — header info row และ footer action buttons mobile-friendly | ที่ 360px: (a) ข้อมูล header (ชื่อ/เบอร์/เลข/วัน) wrap เป็น multi-line แทน single-line overflow-x-auto ที่ touch ยาก — ไม่มี horizontal scroll ภายใน card header; (b) footer buttons ทุกปุ่มมี touch target ≥44px (height); วัดด้วย DevTools → Computed height | TODO |
| S-5 | `OrdersList.tsx` — toolbar (search + 2 selects + button) ไม่ล้นจอ | ที่ 360–480px: toolbar wraps ได้โดย search input + selects ลงบรรทัดแรก, ปุ่ม "สร้างออเดอร์" อยู่แถวถัดไปหรือขวาสุดโดยไม่ overflow viewport (ไม่มี horizontal scrollbar บน `<body>`); ทดสอบ Chrome DevTools 360×800 | TODO |
| S-6 | `dashboard/page.tsx` — StatCard grid รองรับ 2 columns บน md | ที่ viewport 768px (md breakpoint): StatCard grid แสดง 2 คอลัมน์ (ยืนยัน `grid-cols-2` active ใน computed style); ที่ 360px แสดง 1 คอลัมน์ — ไม่มีการ์ดถูกตัดขอบขวา. **หมายเหตุ:** บรรทัด 190 มี `md:grid-cols-2` อยู่แล้ว — developer ต้องตรวจ computed style จริงก่อนว่า fix จำเป็นหรือไม่; ถ้าไม่จำเป็น → mark S-6 เป็น "verified-no-change" (ไม่นับ GAP) | TODO |

## Out-of-Scope

> แตะของในนี้ = CREEP (hard block). ถ้าจำเป็นต้องทำ → Controller ตัดสิน + ย้ายขึ้น In-Scope พร้อมจด Change Log.

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | หน้า Verification (`/seller/verification`) — responsive fix | ไม่อยู่ใน 5 cluster ที่ planner sweep ระบุว่า critical; เลื่อน Phase 2 |
| OOS-2 | หน้า Products form (`/seller/products/new`, `/seller/products/[id]/edit`) — sticky bottom save bar บน mobile | ต้องออกแบบ UX ใหม่ ไม่ใช่แค่ CSS fix; เลื่อน Phase 2 |
| OOS-3 | Admin side (`(paces)/admin/`) — mobile responsive ทุกหน้า | Admin ใช้บน desktop เป็นหลัก; ไม่ใช่ seller surface; เลื่อน Phase 2 |
| OOS-4 | PWA / native-app shell (viewport meta, manifest, service worker) | นอก scope platform ปัจจุบัน; เลื่อน Phase 2+ |
| OOS-5 | Redesign component ใหม่ทั้งหมด (เช่น เปลี่ยน OrderCard เป็น bottom-sheet, เปลี่ยน DataTable เป็น list view) | เป็น UX redesign ไม่ใช่ responsive fix; ต้องผ่าน safepay-ux ก่อน; เลื่อน Phase 2 |
| OOS-6 | หน้า Sales Analytics (`/seller/sales`), Categories (`/seller/categories`) | ไม่อยู่ใน 5 cluster critical; เลื่อน Phase 2 |
| OOS-7 | Dark mode / theming บน mobile | ไม่เกี่ยวกับ responsive layout; เลื่อน Phase 2 |
| OOS-8 | Buyer-side (`(marketing)/`) responsive — ทุก surface | คนละ route group คนละ theme (Vuexy); ไม่ใช่ scope นี้ |

## Assumptions

- Breakpoint "mobile" = viewport width ≤768px (ตาม `handleResize()` ใน `useLayoutContext.tsx` บรรทัด 156); breakpoint ทดสอบหลัก = 360px และ 480px
- `data-sidenav-size="offcanvas"` คือ state ที่ sidebar ซ่อนอยู่บน mobile — acceptance ของ S-1/S-2 ใช้ attribute นี้เป็นเกณฑ์
- การแก้ S-1 (`_layout.css`) ทำด้วย CSS selector scoped เฉพาะ `[data-sidenav-size="offcanvas"] .page-content` เพื่อไม่กระทบ desktop layout — ถ้า approach เปลี่ยนต้องแจ้ง Controller ก่อน commit
- การแก้ S-2 (`useLayoutContext.tsx`) เพิ่ม `handleResize()` ใน `useEffect` ที่มี deps `[]` (mount-once) หรือ call ใน effect ที่มีอยู่แล้ว — ไม่สร้าง effect ซ้อนที่ทำ infinite loop
- `min-width` ของ `.table` ใน S-3 กำหนดเป็น fixed value (เช่น `600px`) ไม่ใช่ per-table dynamic — ถ้าแต่ละตารางต้องการ min-width ต่างกันให้ใช้ className prop ที่มีอยู่ใน `DataTable.tsx` แล้ว
- S-4/S-5 เป็น Tailwind class changes เท่านั้น — ไม่แตะ business logic, state management, หรือ API ใด ๆ
- QA ทำด้วย Chrome DevTools MCP device emulation (responsive mode) + curl verify หน้าไม่ 500; ถ้า MCP หลุด → fallback authenticated-curl + computed-style probe

## Deferred → Phase 2

> ของที่จงใจไม่ทำใน phase นี้ — **ไม่นับเป็น GAP** ตอน audit/sign-off

- Verification page (`/seller/verification`) mobile responsive
- Products form sticky-bottom save bar บน mobile (ต้องมี UX spec จาก safepay-ux ก่อน)
- Admin mobile responsive (ทุกหน้า)
- OrderCard redesign เป็น bottom-sheet / drawer pattern สำหรับ mobile
- DataTable → card/list view swap บน mobile (pattern เปลี่ยน UX ไม่ใช่แค่ CSS)
- Sales Analytics, Categories page responsive fix
- Rate-limit per-device (Redis) สำหรับ mobile traffic — อยู่ใน NFR backlog แยก
- PWA manifest + service worker

## Change Log

> ทุกครั้งที่ Controller อนุมัติแก้ scope (รับเข้า/เลื่อนออก) จดที่นี่ — กัน creep เงียบ

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-06-07 | baseline สร้าง | Gate 0 — phase seller-mobile-responsive เริ่มต้น | - |
