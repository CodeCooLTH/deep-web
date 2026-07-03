# UX Design Spec — feat 00009 Deep Stock Pro (S-15..S-21)

> Route: `src/app/(paces)/seller/**` (+ S-21 `admin/**`) — theme = **Paces** เท่านั้น. Primary น้ำเงิน `#236dc9` (token `bg-primary`/`text-primary`, ห้าม hardcode ม่วง). อิง Paces docs `theme/paces/Docs/index.html` + `docs/system/ui-guideline/paces-component-reference.md`.
>
> **บริบทยืนยันจากโค้ดจริง (สำคัญทุก S-id):**
> - Sweet Alerts confirm-fetch pattern มีจริงแล้ว: `inventory/components/SubscribeButton.tsx` + `ReactivateButton.tsx` = **Base ที่ดีที่สุด** สำหรับทุก confirm dialog (ดีกว่า theme `SendSmsButton.tsx` ดิบ)
> - `Icon` wrapper (`@/components/wrappers/Icon`) prepend `tabler:` อัตโนมัติ → **ส่ง icon name สั้น ไม่มี prefix**. ⚠️ พบ `AdvanceWarningBanner`/`InventoryGate` เดิมใช้ `icon="tabler-alert-triangle"` (prefix ซ้อน อาจ render ผิด) — developer verify + แก้ถ้าผิดตอน extend
> - TFR-DSP-01: **Manual Adjustment ใช้ได้ทั้ง BASIC+PRO** — ห้ามเอาไปเป็นจุดขาย Pro
> - Pro-exclusive จริง = 4: Low-stock Alert (timeline), Movement History, CSV import/export, `lowStockThreshold` field

---

## Design Decisions (สรุป — rationale)

1. **PackageSelector (S-15) = subscribe/reactivate เท่านั้น**. Upgrade (BASIC→PRO) แยกเป็น `UpgradeToProCard` เล็ก (บน S-16) — เพราะ upgrade มี target เดียว (PRO) ไม่มี selection, API §4.2 = "POST no body + Sweet Alerts confirm". ยัดเข้า selector จะสับสน
2. **Manual Adjustment (S-17) ไม่ Pro-exclusive** — อย่า list เป็นจุดขาย PRO
3. **Movement history (S-19) ใช้ปุ่ม "โหลดเพิ่ม" manual** (ไม่ infinite-scroll) — cursor API call จริง ไม่ใช่ local slice
4. **CSV preview/results table (S-18) + movement table (S-19) ใช้ `<table>` markup ธรรมดา** (ไม่ TanStack เต็ม) — ไม่ต้อง sort/filter/pagination
5. **Badge Pro ใช้ `warning` token แทน gold** (Paces ไม่มี gold) — **comment กำกับตาม HR7**
6. **InventoryGate.tsx เดิม (00003) → dead-code** ถูกแทนด้วย PackageSelector — developer ควร delete + Base cite S-15 (ไม่ทิ้ง orphan)

---

## S-15 — `PackageSelector` (client) — FR-DSP-03/07

**Layout:** 2 การ์ดเลือกได้เคียงกัน (`grid grid-cols-1 md:grid-cols-2 gap-base`), ไม่ pre-select, CTA เดียวท้าย disabled จนเลือก. Selected = `border-2 border-primary` + `bg-primary/5` + icon `circle-check`. PRO card มี badge "แนะนำ" (`badge bg-primary text-white text-2xs`) — **พื้นการ์ดขาวเสมอ ห้าม `!bg-primary` เต็มการ์ด**.
- BASIC feature list (icon `check` `text-success`): ตัดสต็อกอัตโนมัติ / คืนสต็อกอัตโนมัติ / กันขายเกิน / **ปรับสต็อกเอง** / เก็บข้อมูลแม้ถูกล็อก
- PRO: "✓ ทุกอย่างใน Deep Stock" + 4 Pro-exclusive (แจ้งเตือนสต็อกใกล้หมด / ประวัติการเคลื่อนไหว / นำเข้า-ส่งออก CSV / ตั้งเกณฑ์แจ้งเตือนต่อสินค้า)
- prop `mode: 'subscribe'|'reactivate'` คุม copy + endpoint + body `{package}`
- กด CTA → Sweet Alerts confirm (pattern `SubscribeButton.tsx` — `preConfirm` fetch + `showValidationMessage`) → success `pacesToast.success` + `router.refresh()`

**Theme Source:** grid ← `theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx` (ลด 4→2 col, `text-[40px]`→`text-4xl`); LOCKED banner ← `InventoryGate.tsx:41-58`; selected tint ← `NotificationTimeline.tsx:156` (`bg-primary/5`); confirm flow ← `SubscribeButton.tsx`+`ReactivateButton.tsx`; feature list ← pricing `page.tsx:27-34`.

**Content:** Heading "เลือกแพ็กเกจที่ใช่สำหรับร้านคุณ". CTA subscribe "สมัครแพ็กเกจนี้ ฿{price}" / reactivate "เปิดใช้งานอีกครั้ง ฿{price}". Confirm subscribe: "สมัคร {ชื่อ}?" / "ระบบจะหักเครดิต ฿{price} ทันที เริ่มรอบ 30 วัน". 402 → dialog ค้าง + ลิงก์ `/wallet`.

---

## S-16 — `/inventory` page (extend) — FR-DSP-03/04/06/07/08/09/10

**4 states:**
- NOT_SUBSCRIBED → `<PackageSelector mode="subscribe"/>`
- LOCKED → `<PackageSelector mode="reactivate"/>` (มี LOCKED banner)
- BASIC ACTIVE → `UpgradeToProCard` (การ์ดโปรโมท primary tone) เหนือ `InventoryManagementTable` + badge "Deep Stock" (`bg-primary/15 text-primary`)
- PRO ACTIVE → "เครื่องมือ Pro" section (ปุ่ม CSV Export link + CSV Import modal) + badge "Deep Stock Pro" (`bg-warning/15 text-warning` + icon `crown`, comment gold-token)
- `InventoryManagementTable` extend: action ต่อแถว `ปรับสต็อก` (icon `plus-minus`, ทุก package) + `ประวัติ` (icon `history`, PRO); **mobile = kebab dropdown** → ใช้ `src/components/safepay/FilterDropdown` (in-project, กัน re-render opacity bug) ไม่ใช่ raw hs-dropdown
- shortfall banner ราคาตาม `PACKAGE_PRICE[package]` (SDS §3.2 call-site — แก้ error tsc สุดท้าย)

**Theme Source:** page shell ← โค้ดจริง `inventory/page.tsx` (คงโครง, getEntitlementStatus→getEntitlementInfo); UpgradeToProCard ← `SubscribeButton.tsx` (confirm) + `AdvanceWarningBanner.tsx` (โครงการ์ด, tone `border-primary/20 bg-primary/10`); action buttons ← `InventoryManagementTable.tsx:132-147` + theme `ProductStockTable.tsx:77-97`; badge ← `topups/[id]/page.tsx` badge pattern.

**Content:** UpgradeToProCard "อัพเกรดเป็น Deep Stock Pro" / "ปลดล็อกแจ้งเตือนสต็อกใกล้หมด ประวัติการเคลื่อนไหว และนำเข้า/ส่งออก CSV" / ปุ่ม "อัพเกรด ฿599". Confirm "อัพเกรดเป็น Deep Stock Pro?" / "จ่ายเต็ม ฿599 ไม่มีการคิดตามสัดส่วนวันที่เหลือ". CSV ปุ่ม "ส่งออก CSV" (`file-export`) / "นำเข้า CSV" (`file-import`).

---

## S-17 — `ManualAdjustModal` (client) — FR-DSP-01

**Layout:** controlled div modal (copy `TopUpRequestModal.tsx` shell). prop `productId`+`productName`+`currentStockQty` จาก row action. Delta stepper (`⊖`/`⊕` = `btn btn-icon btn-sm` icon `minus`/`plus` + `form-input text-center`). Preview `{current} → {result}` real-time (สีแดงถ้า <0, disable submit). note บังคับ (1-200, `ManualStockAdjustSchema`).
- Submit 2 ชั้น: กด "ยืนยันปรับ" → client validate → Sweet Alerts confirm ซ้อน → `preConfirm` POST `/api/inventory/stock/adjust` → success ปิด 2 ชั้น + `pacesToast.success('ปรับสต็อกสำเร็จ — คงเหลือ {resultingQty} ชิ้น')` + `router.refresh()`

**Theme Source:** modal shell ← `wallet/components/TopUpRequestModal.tsx` (ตัด slip-upload); stepper ← ประกอบ `btn btn-icon btn-sm` + `form-input` (ไม่มี 1:1, **comment กำกับ**); confirm ← `SubscribeButton.tsx`; error banner ← `TopUpRequestModal.tsx:236-245` (`bg-danger/10 border-danger/30`).

**Content:** "ปรับสต็อก: {productName}" / "สต็อกปัจจุบัน: {qty} ชิ้น" / "จำนวนที่ปรับ *" helper "ลบ = ตัดออก, บวก = รับเข้า" / "เหตุผล * (บังคับ)". Confirm "ยืนยันปรับสต็อก {productName}?" / "{current} → {result} ชิ้น (เหตุผล: {note})". Error "สต็อกไม่พอ: {productName}", "กรุณาระบุเหตุผล", "จำนวนต้องไม่เป็น 0".

---

## S-18 — `CsvImportModal` (client) — FR-DSP-10

**Layout:** modal shell (copy `TopUpRequestModal.tsx`). Dropzone (hidden `<input type="file" accept=".csv">` + clickable div, icon `file-upload`) + ลิงก์ "ดาวน์โหลดเทมเพลต" → `/api/inventory/csv/export`. Parse client `FileReader.readAsText` → `parseCsv()` จาก `@/lib/csv` → preview `<table>` (Paces `divide-y divide-default-200 text-sm`, คอลัมน์ #/สินค้า/สต็อกใหม่/สถานะ). badge ก่อน import "รอนำเข้า" (`bg-default-100`); หลัง import OK "สำเร็จ" (`bg-success/15 text-success`) / ERROR "ล้มเหลว" (`bg-danger/15 text-danger`) + error ไทย.
- เกิน 500 แถว → warning banner (เทียบจำนวนบรรทัดก่อน parse)
- ปุ่ม "นำเข้า X แถว" → Sweet Alerts confirm (icon `warning`, bulk-overwrite) → POST `/api/inventory/csv/import` → อัปเดต table เป็นผลจริง + footer "สำเร็จ X · ล้มเหลว Y" + `pacesToast` (success ถ้า error=0, warning ถ้ามี) → ปุ่มเป็น "ปิด"

**Theme Source:** modal ← `TopUpRequestModal.tsx`; dropzone ← `TopUpRequestModal.tsx:313-337` (เปลี่ยน accept .csv, ตัด img preview); table ← theme `product-stocks/.../ProductStockTable.tsx` (markup+badge, ไม่ TanStack); confirm ← `SubscribeButton.tsx`; parse ← `@/lib/csv`.

**Content:** "นำเข้าสต็อกจาก CSV" / dropzone "คลิกเพื่อเลือกไฟล์ .csv" / "ดาวน์โหลดเทมเพลต (ไฟล์สต็อกปัจจุบัน) →". Confirm "ยืนยันนำเข้าสต็อก {n} แถว?" / "การนำเข้าจะแทนที่จำนวนสต็อกปัจจุบันของสินค้าที่ตรงกัน — ตรวจสอบให้แน่ใจ". Row error: `PRODUCT_NOT_FOUND`→"ไม่พบสินค้านี้", `PRODUCT_NOT_PHYSICAL`→"ไม่ใช่สินค้าจับต้องได้", `CONCURRENT_MODIFICATION`→"มีการแก้ไขพร้อมกัน กรุณาลองใหม่". Toast success "นำเข้าสำเร็จ {n} แถว" / warning "นำเข้าสำเร็จ {ok} แถว, ล้มเหลว {err} แถว".

---

## S-19 — Movement history page `/inventory/movements/[productId]` — FR-DSP-09

**Layout:** RSC page guard `isProActive(shop.id)` ก่อน (ถ้า false → gate card, **ไม่ query movement**). Product mini-header (thumbnail+ชื่อ+stockQty; `product.findUnique` + ownership check `shopId` → `notFound()` ถ้าไม่ใช่ของ shop). ตาราง (client, cursor จาก `GET /api/inventory/movements`) เรียงล่าสุดก่อน. "โหลดเพิ่ม" ใน card-footer (cursor, ซ่อน+"แสดงครบแล้ว" ถ้า nextCursor=null).
- คอลัมน์ source badge: `ORDER_DEDUCT`→"คำสั่งซื้อ" (`bg-default-100`), `ORDER_RESTOCK`→"คืนสต็อก (ยกเลิก)" (`bg-success/15`), `MANUAL_ADJUST`→"ปรับเอง" (`bg-info/15`; ถ้า note='นำเข้าจาก CSV'→"นำเข้า CSV")
- delta signed สีเขียว/แดง + icon `arrow-up`/`arrow-down` `tabular-nums`
- actorUserId: null→"ระบบ (อัตโนมัติ)", มีค่า→"คุณ" (MVP ไม่ join User)
- **refId ไม่แสดง** (เป็น order.id ไม่ใช่ publicToken — link ต้อง join เพิ่ม นอก scope)

**Theme Source:** back-link ← `admin/topups/[id]/page.tsx:107-116`; mini-header ← `InventoryManagementTable.tsx:64-87`; gate card ← `InventoryGate.tsx` (ตัด feature/CTA); table ← theme `ProductStockTable.tsx`; spinner ← `NotificationTimeline.tsx:216-225`; delta sign ← `WalletTransactionTable.tsx:90-104`.

**Content:** Breadcrumb "จัดการสต็อก / ประวัติการเคลื่อนไหว" / back "← กลับหน้าจัดการสต็อก" / header "{productName}" "คงเหลือปัจจุบัน: {qty} ชิ้น". columns: เวลา/การเปลี่ยนแปลง/คงเหลือหลังรายการ/แหล่งที่มา/หมายเหตุ/ผู้ทำรายการ. gate "ประวัติการเคลื่อนไหวสต็อกเป็นฟีเจอร์ Pro" / "อัพเกรดเป็น Deep Stock Pro เพื่อดูประวัติ" / "กลับไปหน้าจัดการสต็อก". empty "ยังไม่มีประวัติการเคลื่อนไหวของสินค้านี้".

---

## S-20 — `lowStockThreshold` field (extend `ProductStockCardV2.tsx`) — FR-DSP-08

**Layout:** ต่อท้าย block `{tracked && (...)}` เดิม. render: `tracked && isProActive`→ number input จริง; `tracked && !isProActive` (BASIC)→ upsell hint 1 บรรทัด (icon `lock` + `text-default-400 text-xs`); `!tracked`→ ไม่แสดง. `isProActive: boolean` = **prop ใหม่จาก parent** (`/products/[id]/edit` server query แล้ว pass). Input `type="number" min="0" step="1"` class `form-input` (copy pattern `stockQty` บรรทัด 54-62). ว่าง→submit `null` (ปิด alert).

**Theme Source:** input ← `ProductStockCardV2.tsx:54-62` (โค้ดจริง, field เดียวกัน); upsell hint ← `AdvanceWarningBanner.tsx:40-42` (`<Link className="underline font-bold">`).

**Content:** "แจ้งเตือนเมื่อสต็อกเหลือน้อยกว่า (ชิ้น)" / helper "เว้นว่างไว้ = ปิดการแจ้งเตือน" / upsell "ตั้งเกณฑ์แจ้งเตือนสต็อกต่ำเป็นฟีเจอร์ Pro — อัพเกรดเลย →". data retention: reactivate BASIC ไม่ลบ lowStockThreshold ใน DB (PRO-gate query-time).

---

## S-21 — Admin `topups/[id]` package badge — FR-DSP-11

**Layout:** เพิ่ม `package: true` เข้า select entitlement (`page.tsx:79-85`). badge เหนือ LOCKED badge เดิมใน card-header "รายการเครดิตล่าสุด" (บรรทัด 250-259), ครอบด้วย `<div className="flex flex-col gap-1 mt-1">`. 3 สถานะ: null→"ไม่ได้สมัคร Inventory" (`bg-default-100`); BASIC→"Deep Stock" (`bg-primary/15 text-primary`); PRO→"Deep Stock Pro" (`bg-warning/15 text-warning` + icon `crown`, comment gold-token).

**Theme Source:** select ← `topups/[id]/page.tsx:81-84`; badge markup ← `topups/[id]/page.tsx:253-258` (LOCKED badge pattern ในไฟล์เดียวกัน).

---

## จุดที่ developer ต้องระวัง (สรุป)
- **HR7:** stepper (S-17)/preview table (S-18)/warning-as-gold badge = "ประกอบ" จาก primitive — คง `.card`/`btn`/`badge`/`form-input`/token, **comment กำกับทุกจุด adapt**
- **HR9:** ทุก toast = `pacesToast.*` top-right (ไม่มี chat context)
- **Sweet Alerts เท่านั้น** สำหรับ confirm (subscribe/reactivate/upgrade/manual-adjust/csv-import) — pattern `SubscribeButton.tsx`, ห้าม window.confirm/modal เอง
- **Icon:** `@/components/wrappers/Icon` ส่ง name สั้น. ⚠️ verify `tabler-` prefix ซ้อนใน AdvanceWarningBanner/InventoryGate เดิมว่า render ถูกไหมก่อน copy
- **Icon ที่เสนอ (verify tabler set จริงก่อน):** `plus-minus`/`history`/`file-export`/`file-import`/`crown`/`lock`/`arrow-up`/`arrow-down`/`dots-vertical`. ยืนยันแล้วปลอดภัย: `check`/`x`/`package`/`edit`/`circle-check`/`plus`/`minus`
- **PRO-gate ทั้ง render + route/API** — UI ซ่อน CTA + backend guard (มีแล้ว) อย่าพึ่ง UI-hide อย่างเดียว

## Open questions (Controller)
1. `InventoryGate.tsx` เดิม → delete (แทนด้วย PackageSelector) หรือคง dead-code
2. refId link ไป order — นอก scope (ต้อง join publicToken)
3. WALLET_REASON reconciliation (resolved: machine-key) — S-21 ใช้ mapping ที่มีได้เลย
