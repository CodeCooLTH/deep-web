# Handoff Spec — เมนูคำสั่งซื้อ ฝั่ง Seller (SafePay / Deep)

> สถานะ: **ต้นแบบก่อนส่ง dev** · วันที่ 2026-05-17 · scope `src/app/(paces)/seller/**` (Paces theme)
> Source of truth ของ UX/layout = mockup ที่ผ่านรีวิว user หลายรอบ:
> `docs/mockups/seller-orders/{list,create,edit,detail}.html` + `assets/shell.{js,css}`
> เอกสารนี้ไม่แก้โค้ด/mockup/convention ใด ๆ — เป็นเอกสารส่งมอบอย่างเดียว
>
> Convention บังคับ (อ่านก่อน implement):
> - `docs/conventions/seller-action-placement.md` — ตำแหน่งปุ่ม action (4 โซน)
> - `docs/conventions/rsc-mui-navigation.md` — RSC + next/link (Paces ไม่มี MUI; ใช้ pattern §5.6)
> - `docs/system/ui-guideline/README.md` + `docs/system/ui-guideline/seller/page-sourcing.md` — theme-copy rule + `Base:` line
> - `CLAUDE.md` Hard Rule 1/2/3/5 + memory `feedback_rsc_dal_authz` (DAL ownership), `feedback_qa_domains`

---

## 1. ภาพรวม & ขอบเขต

### 1.1 4 หน้าในฟีเจอร์

| # | หน้า | Route จริง (path สั้น — proxy rewrite) | Layout group |
|---|---|---|---|
| 1 | **List** | `/orders` → `src/app/(paces)/seller/(dashboard)/orders/page.tsx` | `(dashboard)` (มี shell sidebar) |
| 2 | **Detail** | `/orders/[token]` → `src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx` | `(dashboard)` |
| 3 | **Create** | `/orders/new` → `src/app/(paces)/seller/(fullscreen)/orders/new/page.tsx` | `(fullscreen)` (overlay เต็มจอ ไม่มี sidebar) |
| 4 | **Edit** | `/orders/[token]/edit` → **ยังไม่มี** ต้องสร้าง `src/app/(paces)/seller/(fullscreen)/orders/[token]/edit/page.tsx` | `(fullscreen)` |

> seller nav ใช้ **path สั้น** ห้ามมี `/seller` prefix (page-sourcing.md ข้อ 🛑; proxy `src/proxy.ts` จัดการ rewrite + 301 backward-compat ครบ). ทุก `<Link>`, `router.push`, `redirect()`, `cancelHref` ใน tree นี้เขียนสั้น (`/orders`, `/orders/new`). ข้อยกเว้น: ลิงก์ผู้ซื้อ `/o/{token}` = buyer-domain absolute URL ผ่าน `resolveBuyerBaseUrl()`.

### 1.2 ใครใช้

Seller (เจ้าของร้าน) ที่ login subdomain `seller.deepth.local`. ทุก account มี trust profile; เปิดร้านได้ (`isShop`/มี `Shop`). Layout `(dashboard)/layout.tsx` + `(fullscreen)/layout.tsx` auto-create `Shop` ถ้ายังไม่มี — ดังนั้น guard "ยังไม่มีร้าน" เป็น fallback ที่แทบไม่ trigger แต่คงไว้.

### 1.3 OMS flow (บริบทของฟีเจอร์นี้)

```
Seller สร้าง order (หน้า Create)  ─→  status=PENDING, publicToken สร้างอัตโนมัติ
        │
        ├─ Seller คัดลอกลิงก์ /o/{token} ส่งให้ผู้ซื้อ (List footer / Detail panel)
        │
Buyer เปิด /o/{token} (buyer domain) ─→ พิสูจน์ตัวตนด้วยเบอร์ (ไม่มี OTP code — ดู ConfirmOrderSchema)
        │     เบอร์ต้องตรง order.buyerContact หรือ ถ้าว่าง = เบอร์แรก claim
        ├─ ถ้า fulfillmentMode=SHIPPED: seller กด "บันทึกการจัดส่ง" (Detail) → SHIPPED
        └─ Buyer ยืนยันรับ + รีวิว ─→ CONFIRMED  ─→  evaluateBadges() + trust recalc (best-effort)
```

State machine (`src/services/order.service.ts` `VALID_TRANSITIONS`):
`PENDING → {SHIPPED, CONFIRMED, CANCELLED}` · `SHIPPED → {CONFIRMED, CANCELLED}` · `CONFIRMED`/`CANCELLED` = terminal. ไม่มี `COMPLETED`.

### 1.4 Order type & fulfillmentMode

- `Order.type` ∈ `PHYSICAL | DIGITAL | SERVICE` (default `PHYSICAL`) — **ล็อกหลัง create แก้ไม่ได้**
- `Order.fulfillmentMode` ∈ `SHIPPED | NO_SHIPPING` — derive จากสินค้า: ถ้ามี item ใด ๆ ที่ `Product.fulfillmentMode=SHIPPED` (หรือ manual item + type=PHYSICAL) → order = `SHIPPED` (ดู `createOrder()` logic ปัจจุบัน §6)
- หน้า Create **ไม่มี dropdown เลือก type** — type/fulfillment ถูก derive จากสินค้าที่เลือก (สินค้ามี flag มี/ไม่มีจัดส่ง). นี่คือ **decision ที่ user ล็อก** (ดู §2) และต่างจาก implementation ปัจจุบันที่ยังมี `type` select มองเห็นได้

---

## 2. Design decisions ที่ user ล็อกแล้ว (จาก mockup + session)

| # | Decision | แหล่ง |
|---|---|---|
| D1 | **type ล็อกหลัง create** — หน้า Edit แสดง type เป็น `<select disabled>` + ไอคอน lock + hint "ล็อกตั้งแต่สร้าง — แก้ไม่ได้" | edit.html L70-74 |
| D2 | **items เพิ่ม/ลด/แก้จำนวนได้ตอน edit** (qty stepper, ลบรายการ, + เพิ่มรายการกำหนดเอง, เลือกสินค้า) | edit.html L95-105 |
| D3 | **Cancel ใช้ Preline modal** ห้าม `window.confirm()` — confirm modal overlay (`bg-dark/40`, card กลางจอ) | detail.html L177-190 + convention §3 |
| D4 | **Create มี 4 บล็อก:** (1) ลูกค้า: radio "ค้นหาเดิม / เพิ่มใหม่" → ค้นหาเป็น select2-style combobox (dropdown ลอย `absolute`, ไม่ดัน layout) (2) การชำระเงิน & ช่องทาง (3) รายการสินค้า — **ประเภทออเดอร์ derive จากสินค้า ไม่มี dropdown type**, ที่อยู่จัดส่งโผล่อัตโนมัติเมื่อมีสินค้าต้องจัดส่ง (4) summary panel = recap ล้วน (sticky, **ไม่มีปุ่ม**) | create.html ทั้งไฟล์ |
| D5 | **List = การ์ดต่อ 1 ออเดอร์** (ไม่ใช่ตาราง/DataTable). โครงการ์ด: border + `border-l-4` accent สีตาม status → header บรรทัดเดียว (avatar + ชื่อ + tag ลูกค้าเดิม/ยังไม่ยืนยัน + เบอร์ + เลขออเดอร์ + วันเวลา + ช่องทาง + ชำระเงิน + [ship/rating ถ้ามี] + status badge ขวา) `border-b` → รายการสินค้า (รูป 56px + ชื่อ + SKU + `฿ราคา × จำนวน` + รวม, ไม่มี border กล่อง, `divide-y`) → breakdown ยอด (ยอดสินค้า/ส่วนลด/VAT/สุทธิ — **แสดงเฉพาะบรรทัดที่มีค่า**) ท้ายรายการ → footer `border-t`: action ปุ่มเล็กชิดขวา `[⋯][คัดลอกลิงก์][ดูรายละเอียด]` | list.html L136-196 |
| D6 | **List: ปุ่ม "สร้างออเดอร์"** อยู่ใน `card-header` ระดับเดียวกับ search/filter (ขวาสุด) — **ไม่มี sticky action-bar**. เป็น exception ที่บันทึกใน convention แล้ว (§4 + §"Order List toolbar pattern") | list.html L51 + convention §4 |
| D7 | **copy-on-hover** ที่ ชื่อ/เบอร์/เลขออเดอร์ (ปุ่ม copy `opacity-0 group-hover:opacity-100`, mobile = `opacity-100`); กดแล้วไอคอนเด้งเป็น check 1.2s แล้วกลับ | list.html L119, 205-212 |
| D8 | **avatar ลูกค้าแสดงเสมอ** — มีรูป = `<img>`; ไม่มี = placeholder วงกลม `tabler:user` (List + Detail) | list.html L114-118, detail.html L115 |
| D9 | **เลขออเดอร์ format `{YYYYMMDD}{RANDOM}`** เช่น `20260516A1B2C3` — เป็น **display id**; ลิงก์ผู้ซื้อใช้ **token แยก** unguessable `/o/{token}` | list.html DATA + detail.html L42/47. ⚠️ ดู Open Question OQ-3 |
| D10 | **Detail layout:** panel ขาวบนสุด (sticky `top-[65px]`): ซ้าย = `[‹ back]` + เลขออเดอร์ (mono) + status badge + ลิงก์ผู้ซื้อ `deepth.local:4000/o/{token}` + ปุ่ม copy ; ขวา = `[⋯]` + primary ผันตาม state. row1 = รายการสินค้า (2/3 col, รูปเด่น + SKU + breakdown) + ข้อมูลผู้ซื้อ (1/3 col, **แสดงเสมอ**, avatar + chip สถานะ OTP + เบอร์/ที่อยู่/ประวัติลูกค้า). row2 = รีวิว full-width. row3 = logs/timeline full-width. cancel/ship = modal | detail.html ทั้งไฟล์ + convention §4 "Detail primary ผันตาม state" |
| D11 | **Detail primary ผันตาม state:** PENDING+ต้องจัดส่ง = "บันทึกการจัดส่ง" (เปิด ship modal) · PENDING+ไม่จัดส่ง / SHIPPED / CONFIRMED / CANCELLED = ไม่มี primary (action-bar เหลือ `[⋯]` ตำแหน่งคงเดิม) | convention §4 ตาราง "Detail — primary ผันตาม order state" |
| D12 | **summary/recap ไม่มีปุ่ม action เด็ดขาด** (Create summary panel, List breakdown) — กฎเหล็ก convention §1 | convention §1 |
| D13 | **destructive (ยกเลิกออเดอร์) อยู่ใน `⋯` menu เท่านั้น** + divider คั่นเหนือรายการแดง + ต้องเปิด confirm modal; "แก้ไขออเดอร์" = action รอง อยู่ใน `⋯` ด้วย | convention §3 + detail.html L56-60 |
| D14 | Customer combobox: ค้นด้วยเบอร์/ชื่อ; ถ้าไม่พบ → ปุ่ม "เพิ่มเป็นลูกค้าใหม่" สลับโหมด; เลือกแล้วโชว์ selected card + ปุ่ม "เปลี่ยน" | create.html L80-103, 215-263 |
| D15 | Edit มี **guard banner**: ถ้า order.status ≠ PENDING → แสดง banner "แก้ไขไม่ได้" + ลิงก์ "ดูรายละเอียด" + (ตาม mockup) auto-redirect. ฟอร์ม disable เมื่อ guard active | edit.html L52-63, 112-116 |

---

## 3. Spec ราย Screen

> Anchor ทุกหน้า: ต้อง render ภายใน shell จริงของโปรเจกต์ — **dev ห้ามทำ shell เอง**:
> - `(dashboard)` pages → `VerticalLayout` (`src/layouts/VerticalLayout.tsx`) ผ่าน `(dashboard)/layout.tsx` (มี sidebar + topbar + breadcrumb ผ่าน `PageBreadcrumb`)
> - `(fullscreen)` pages → `(fullscreen)/layout.tsx` (`fixed inset-0 z-50` overlay; ไม่มี sidebar) + `FullscreenPageHeader` (sticky header + ปุ่ม submit ที่ชี้ `form` id)
> - shell.css/shell.js ใน mockup เป็น **static port ของ layout จริง** (ระบุไว้ใน header comment ของไฟล์) — ใช้เป็น reference เทียบเท่านั้น ห้าม copy เข้า `src/`

### 3.1 List — `/orders`

- **Route:** `src/app/(paces)/seller/(dashboard)/orders/page.tsx` (RSC; **มีอยู่แล้ว** — ต้อง rework เป็น card layout)
- **Wireframe:** `docs/mockups/seller-orders/list.html` (L40-94). โครง: 1 card → card-header (search + filter + page-size ซ้าย, `[+ สร้างออเดอร์]` ขวา) → status tabs (underline, count badge ต่อ tab) → card-body = `space-y-2.5` ของการ์ดออเดอร์ → card-footer = pagination
- **Component ย่อย:** ดู §4 mapping (`OrderCardList` ใหม่, `OrderCard`, `OrderCardMenu`, `CopyButton`, status tabs)
- **States:**
  - loading: `src/app/(paces)/seller/(dashboard)/orders/loading.tsx` (**มีอยู่** — ปรับ skeleton ให้เป็นทรงการ์ด ไม่ใช่ table row)
  - empty (filter ให้ 0): block กลาง `tabler:shopping-cart-off` + ปุ่ม "สร้างออเดอร์แรก" (list.html L66-70) — reuse `_shared/SellerEmptyState.tsx` ถ้าทรงตรง ไม่งั้น copy primitive card
  - error (โหลดไม่สำเร็จ): card กลาง `tabler:alert-triangle` + ปุ่ม "ลองใหม่" (list.html L87-94) — reuse `_shared/SellerErrorState.tsx`
  - edge: ไม่มีรูปสินค้า → fallback `bg-default-100` + ไม่มี avatar → placeholder (D8); >2 items → "+ ดูอีก N รายการ" ลิงก์ไป detail
- **Behavior:** tab filter (client, sync `?status=`), search (client globalFilter โดยไม่ใช้ DataTable), copy-on-hover (D7), per-card `⋯` dropdown (แก้ไข[PENDING] · ยกเลิก[PENDING/SHIPPED] → confirm modal · ดูรายละเอียด)
- **Auth + ownership:** RSC ดึง session → `getShopByUserId(user.id)` → `getOrdersByShop(shop.id)`. **ownership bake ใน WHERE แล้ว** (`getOrdersByShop` filter `shopId`). mask buyer contact ที่ RSC boundary (`maskContact`) — ห้ามส่ง raw phone/email ข้าม RSC flight (memory `feedback_rsc_dal_authz`). Date → `.toISOString()` ก่อนข้าม boundary
- **Status lifecycle:** tab = `all/PENDING/SHIPPED/CONFIRMED/CANCELLED`; per-card action เปิดตาม status (แก้ไข = PENDING เท่านั้น; ยกเลิก = PENDING/SHIPPED)

### 3.2 Detail — `/orders/[token]`

- **Route:** `src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx` (RSC; **มีอยู่แล้ว** — ต้อง rework layout ให้ตรง mockup: เพิ่ม sticky top panel, customer info แสดงเสมอ, logs timeline, ship/cancel modal)
- **Wireframe (FINAL = variant A · Status Hero):** `docs/mockups/seller-orders/detail-a.html` ★ (เลือก 2026-05-17 — แทน detail.html เดิม). โครง: **Header Panel + Action Bar** การ์ดเดียวบนสุด (ซ้าย: channel brand-badge + เลขออเดอร์ + status pill + meta + ปุ่มลิงก์ผู้ซื้อ บรรทัดเดียว / ขวา: `[⋯]` + primary ผันตาม state) → grid `lg:grid-cols-3`: **ซ้าย col-span-2** = Customer Info → Order Items (รูปเด่น, ไม่มี SKU, breakdown ส่วนลด/VAT/สุทธิ) → Payment+Slip card (FR-6.11/6.12) → Review → **ขวา col-span-1** = Status Timeline (vertical stepper) + Log Timeline → cancel modal + ship modal. `detail.html`/`detail-b`/`detail-c` = ทางเลือกที่ไม่เลือก (เก็บไว้อ้างอิง)
- **Component ย่อย:** §4 mapping (`OrderDetailHeader` ใหม่ + back + copy + `⋯` + primary, `OrderSummary` ปรับ, `CustomerDetails` ปรับ — แสดงเสมอ, `OrderReviewCard` reuse, `ShippingActivity`/logs timeline ปรับ, `CancelOrderModal` ใหม่, `ShipOrderModal` ใหม่)
- **States:** ไม่พบ/ไม่ใช่ร้านตัวเอง → `notFound()`; review ยังไม่มี → empty `tabler:star-off`; logs = ถ้า SHIPPED แสดง tracking, ถ้า CONFIRMED แสดง confirmed; primary หาย = action-bar เหลือ `[⋯]` (D11)
- **Behavior:** copy ลิงก์ผู้ซื้อ (inline utility — ไม่ใช่ action-bar), `⋯` (แก้ไข PENDING / ยกเลิก) → cancel modal, primary "บันทึกการจัดส่ง" → ship modal (กรอก provider+trackingNo)
- **Auth + ownership:** ใช้ `getOrderForShop(token, shop.id)` — **DAL pattern: ownership ใน WHERE** (มีอยู่แล้ว, comment ในไฟล์ระบุ). `notFound()` หลัง `findFirst` ปลอดภัยเพราะ scope แล้ว. mask PII ที่ boundary; เฉพาะ `displayName` (public) หรือ masked string ข้ามได้ (memory `feedback_rsc_dal_authz`)
- **Status lifecycle:** primary/`⋯` ผันตาม state ตาม convention §4 ตาราง

### 3.3 Create — `/orders/new`

- **Route:** `src/app/(paces)/seller/(fullscreen)/orders/new/page.tsx` (RSC shell; **มีอยู่แล้ว**) + `orders/new/components/OrderCreateForm.tsx` (client; **มีอยู่แล้ว — ต้อง rework เป็น 4-block + combobox + derive type**) + `ProductPickerModal.tsx` (**มีอยู่**)
- **Wireframe:** `docs/mockups/seller-orders/create.html`. โครง: `FullscreenPageHeader` (`[ยกเลิก] [บันทึกออเดอร์]`) → `grid lg:grid-cols-3`: ซ้าย col-span-2 = block1 ลูกค้า + block2 ชำระเงิน + block3 สินค้า(+ ที่อยู่จัดส่ง auto) ; ขวา col-span-1 = summary panel sticky (recap, ไม่มีปุ่ม) + product picker modal
- **Component ย่อย:** §4 (`CustomerSelectBlock` ใหม่ — radio + combobox + selected + new-form, `PaymentChannelBlock` ใหม่, `CartBlock` ใหม่ — picker + qty stepper + shipping-address auto, `OrderSummaryPanel` ใหม่ recap)
- **States:** cart ว่าง = empty `tabler:basket-off` + hint "ประเภทออเดอร์จะถูกกำหนดจากสินค้าที่เลือก"; combobox ไม่พบ = "เพิ่มเป็นลูกค้าใหม่"; ร้านไม่มีสินค้า ใน picker = empty + ลิงก์ "เพิ่มสินค้าในร้าน"; submit error → toast (react-toastify pattern เดิม)
- **Behavior:** mode radio สลับ search/new; combobox dropdown ลอย (`absolute`, ปิดเมื่อ click นอก); เลือกสินค้า → cart; qty ± (min 1); ที่อยู่จัดส่งโผล่อัตโนมัติเมื่อ `cart.some(ship)`; summary panel อัปเดต type/ship/qty/total real-time; submit `POST /api/orders`
- **Auth + ownership:** guard อยู่ที่ `(fullscreen)/layout.tsx` (session → redirect, auto-create shop). `POST /api/orders` re-derive `shopId` จาก session server-side (มีอยู่แล้วใน route.ts) — **ห้าม trust shopId จาก client**
- **Status lifecycle:** create เสมอ → PENDING

### 3.4 Edit — `/orders/[token]/edit`

- **Route:** **ต้องสร้างใหม่** `src/app/(paces)/seller/(fullscreen)/orders/[token]/edit/page.tsx` (RSC shell ดึง order + ownership) + `EditOrderForm.tsx` client ใหม่
- **Wireframe:** `docs/mockups/seller-orders/edit.html`. โครง: `FullscreenPageHeader` (`[ยกเลิก] [บันทึกการแก้ไข]`) → guard banner (ถ้า ≠ PENDING) → 3 card: ข้อมูลออเดอร์ (type disabled + ชื่อ/เบอร์/ช่องทาง/ชำระ/หมายเหตุ) + ที่อยู่จัดส่ง (เฉพาะ PHYSICAL) + รายการสินค้า (qty stepper + เพิ่ม/ลบ + total)
- **Component ย่อย:** §4 (`EditOrderForm` ใหม่, `OrderGuardBanner` ใหม่, reuse `ProductPickerModal`)
- **States:** order ≠ PENDING → guard banner + form disabled + redirect (D15); ไม่ใช่ร้านตัวเอง → `notFound()`; submit error → toast
- **Behavior:** type readonly (D1); items mutable (D2); ที่อยู่จัดส่งแสดงเมื่อ PHYSICAL/fulfillment SHIPPED; submit `PATCH /api/orders/[token]` (**ยังไม่มี — ต้องสร้าง, validate status=PENDING ก่อนแก้** — ดู §6 + OQ)
- **Auth + ownership:** RSC ใช้ `getOrderForShop(token, shop.id)` (DAL ownership), guard `status==='PENDING'` ทั้ง server (redirect) และ API (reject 409 ถ้าไม่ใช่ PENDING)
- **Status lifecycle:** แก้ได้เฉพาะ PENDING

---

## 4. Theme Source Mapping (ตารางสำคัญที่สุด)

> กฎ: ทุก component UI ต้อง copy จาก theme file ที่ระบุ (Hard Rule 1) + commit ต้องมี `Base:` line (Hard Rule 3). Paces theme root: `theme/paces/Admin/TS/src/`. ถ้าไม่มี theme match ตรง → copy primitive ที่ใกล้สุด (`assets/css/custom/_card.css _buttons.css _badge.css _forms.css`, `assets/css/plugins/_choice.css _select2.css`) เป็น base + ระบุใน comment ว่าเป็น SafePay domain component ที่ไม่มี theme equivalent.

### 4.1 Shell (ทุกหน้า — reuse ของจริง ห้ามทำเอง)

| Mockup element | Theme/โปรเจกต์ไฟล์จริง | ชื่อ component | ปรับอะไร | `Base:` line |
|---|---|---|---|---|
| sidebar + topbar + breadcrumb (`(dashboard)`) | `src/layouts/VerticalLayout.tsx` + `src/layouts/components/Sidenav/**` + `TopBar/**` (re-sourced จาก `theme/paces/Admin/TS/src/layouts/VerticalLayout.tsx`) | `VerticalLayout` | **reuse ตามที่มี** ผ่าน `(dashboard)/layout.tsx` — ไม่แตะ | (ไม่ใช่งานนี้ — layout มีอยู่แล้ว) |
| fullscreen overlay header (Create/Edit) | `src/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader.tsx` + `(fullscreen)/layout.tsx` | `FullscreenPageHeader` | reuse; ตั้ง `title/subtitle/cancelHref/saveFormId/saveLabel` | overlay = SafePay domain (nearest ref: `theme/paces/.../(products)/product-add/page.tsx` — ระบุใน comment ไฟล์เดิมแล้ว) |
| breadcrumb "หน้าหลัก › Business › คำสั่งซื้อ" | `src/components/PageBreadcrumb` (Paces) | `PageBreadcrumb` | `title`/`trail` props | `Base: theme/paces/Admin/TS/src/components/PageBreadcrumb*` |

### 4.2 List page

| Mockup element | Paces theme file | ชื่อ component | ปรับอะไร | `Base:` line |
|---|---|---|---|---|
| card + card-header (search/filter/page-size + ปุ่ม สร้าง) | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx` | `OrdersList` (toolbar ส่วน card-header) | **เก็บเฉพาะ toolbar layout** (search-left, primary-right) + status tabs; **ทิ้ง `DataTable`/`useReactTable` table render** — แทนด้วย card list | `Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx (toolbar + tabs only; table→card)` |
| การ์ดออเดอร์ 1 ใบ (header บรรทัดเดียว + items + breakdown + footer) | **ไม่มี theme match ตรง** (theme เป็น table). ใช้ primitive `assets/css/custom/_card.css` + `_badge.css` + `_buttons.css` เป็น base; โครงรายการสินค้า/รูป/SKU/total อ้าง `theme/.../(orders)/order-details/components/OrderSummary.tsx` (item row + Image + price×qty + total cell) | `OrderCard` (ใหม่ — SafePay domain) | สร้างจาก primitive card; item-row layout จาก OrderSummary; status `border-l-4` accent ตาม STAT map ใน list.html L100-105 | `Base: theme/paces/Admin/TS/src/assets/css/custom/_card.css + _badge.css; item row ref: .../(orders)/order-details/components/OrderSummary.tsx` |
| status tabs (underline + count) | implementation ปัจจุบัน `orders/components/OrdersList.tsx` L274-309 (Paces underline style) | tab strip | reuse pattern เดิม (มีใน repo แล้ว) | `Base: src/app/(paces)/seller/(dashboard)/orders/components/OrdersList.tsx (tab strip)` |
| per-card `⋯` dropdown | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx` (`hs-dropdown` Preline pattern L31-55) **หรือ** primitive `assets/css/custom/_dropdown.css` | `OrderCardMenu` (ใหม่, client) | dropdown ลอยขึ้นบน (`bottom-full`) ตาม mockup; เนื้อหา = แก้ไข/ยกเลิก/ดู ตาม status | `Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx (hs-dropdown)` |
| ปุ่ม copy ลิงก์ / copy-on-hover | implementation ปัจจุบัน `orders/[token]/components/CopyLinkButton.tsx` | `CopyButton` (reuse/generalize, client) | generalize ให้รับ `value`+`label`; icon เด้ง check | `Base: src/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton.tsx` |
| empty / error state | `src/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState.tsx` / `SellerErrorState.tsx` | reuse | ปรับ icon/copy ("ไม่มีออเดอร์ในสถานะนี้" / "โหลดไม่สำเร็จ") | `Base: src/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState.tsx` |
| pagination footer | `theme/.../(orders)/orders/components/OrdersList.tsx` → `@/components/table/TablePagination` | `TablePagination` | reuse (หรือ pagination ง่าย ๆ ถ้าเลิกใช้ TanStack) | `Base: theme/paces/Admin/TS/src/components/table/TablePagination*` |

### 4.3 Detail page

| Mockup element | Paces theme file | ชื่อ component | ปรับอะไร | `Base:` line |
|---|---|---|---|---|
| sticky top panel (back + order# + status + buyer link + copy / `⋯` + primary) | **ไม่มี theme match ตรง** — primitive `_card.css` + `_buttons.css` + `_badge.css`; action-bar layout ตาม `docs/conventions/seller-action-placement.md` §2 | `OrderDetailHeader` (ใหม่, client เพราะมี dropdown/modal trigger) | `sticky top-[65px] z-[15]`; ลำดับขวา `⋯ → primary`; primary ผันตาม state (D11) | `Base: theme/paces/Admin/TS/src/assets/css/custom/_card.css + _buttons.css; layout per docs/conventions/seller-action-placement.md` |
| รายการสินค้า + SKU + breakdown ยอด | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx` | `OrderSummary` (มีใน repo `orders/[token]/components/OrderSummary.tsx` — ปรับ) | เพิ่ม SKU + รูปเด่น 56px; breakdown แสดงเฉพาะบรรทัดมีค่า; เอา theme "Modify/Delete" buttons ออก (ย้ายไป header) | `Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx` |
| ข้อมูลผู้ซื้อ (แสดงเสมอ, avatar + chip OTP + เบอร์/ที่อยู่/ประวัติ) | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx` | `CustomerDetails` (มีใน repo — ปรับ) | avatar fallback (D8); chip "ยังไม่ยืนยัน OTP"/ยืนยันแล้ว; ที่อยู่จาก `shippingAddress`; **แสดงเสมอ** | `Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx` |
| review card | implementation ปัจจุบัน `orders/[token]/components/OrderReviewCard.tsx` | `OrderReviewCard` | reuse; empty state `tabler:star-off` | `Base: src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderReviewCard.tsx` |
| logs / status timeline | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx` | `ShippingActivity` (มีใน repo — ปรับเป็น order-status timeline) | timeline จาก status: สร้าง → จัดส่ง → สำเร็จ (dot filled/hollow ตาม state) | `Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx` |
| cancel confirm modal | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx` (Preline overlay card→header→body→footer pattern) — *verify path; ถ้าไม่มี ใช้ primitive `assets/css/custom/_modal.css`* | `CancelOrderModal` (ใหม่, client) | confirm-style: icon danger + ข้อความ + 2 ปุ่ม; ห้าม `window.confirm` (D3) | `Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx` *(หรือ `_modal.css` ถ้าไฟล์ไม่มี — verify)* |
| ship modal (provider + trackingNo) | เดียวกับ cancel modal (Preline overlay) + form fields จาก `_forms.css` | `ShipOrderModal` (ใหม่, client) | 2 input + ยืนยัน → `POST /api/orders/[token]/ship` | `Base:` เดียวกับ CancelOrderModal + `_forms.css` |

### 4.4 Create page

| Mockup element | Paces theme file | ชื่อ component | ปรับอะไร | `Base:` line |
|---|---|---|---|---|
| โครง grid 3-col + card blocks | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx` (card + grid form) — *แต่ theme เป็น single card grid 2-col; layout 3-col + sticky summary ไม่มี theme ตรง → primitive `_card.css`* | `OrderCreateForm` (มีใน repo — rework 4-block) | ทิ้ง Flatpickr + flat field grid; เปลี่ยนเป็น 4 block ตาม D4; **ตัด type select** (derive) | `Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx + assets/css/custom/_card.css (3-col + blocks)` |
| customer combobox (select2-style ลอย) | `theme/paces/Admin/TS/src/assets/css/plugins/_select2.css` + `_forms.css` (input-icon-group) — **ไม่มี theme React component combobox; เป็น domain component** | `CustomerSelectBlock` (ใหม่, client) | radio mode + combobox `absolute` dropdown (ไม่ดัน layout) + selected card + new form; ค้นจาก order history (OQ-5) | `Base: theme/paces/Admin/TS/src/assets/css/plugins/_select2.css + _forms.css (combobox is SafePay domain)` |
| ช่องทาง/วิธีชำระ select + textarea | `theme/paces/Admin/TS/src/assets/css/custom/_forms.css` (form-select/form-textarea) | `PaymentChannelBlock` (ใหม่) | select ช่องทางขาย + วิธีชำระ + หมายเหตุภายใน | `Base: theme/paces/Admin/TS/src/assets/css/custom/_forms.css` |
| product picker modal | implementation ปัจจุบัน `orders/new/components/ProductPickerModal.tsx` | `ProductPickerModal` (reuse) | reuse; search + catalog list + empty | `Base: src/app/(paces)/seller/(dashboard)/orders/new/components/ProductPickerModal.tsx` |
| cart rows + qty stepper + shipping-address auto | `_card.css` + `_buttons.css` (btn-icon stepper); item row ref `OrderSummary.tsx` | `CartBlock` (ใหม่) | qty ± (min1), ลบ, + กำหนดเอง; shipping address block โผล่เมื่อ `some(ship)` | `Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx (item row) + _buttons.css` |
| summary panel (recap, sticky, ไม่มีปุ่ม) | primitive `_card.css` (card sticky) | `OrderSummaryPanel` (ใหม่) | recap: ลูกค้า/type(auto)/การจัดส่ง/qty/total; **ห้ามมีปุ่ม** (D12) | `Base: theme/paces/Admin/TS/src/assets/css/custom/_card.css` |

### 4.5 Edit page

| Mockup element | Paces theme file | ชื่อ component | ปรับอะไร | `Base:` line |
|---|---|---|---|---|
| 3 card form (ข้อมูลออเดอร์ / ที่อยู่ / สินค้า) | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx` (card + grid form) | `EditOrderForm` (ใหม่, client) | type `<select disabled>` + lock icon (D1); items mutable (D2); pre-fill จาก order | `Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx` |
| guard banner (≠ PENDING) | primitive `_card.css` + `_badge.css` (border-l-4 warning card) | `OrderGuardBanner` (ใหม่) | banner + ลิงก์ "ดูรายละเอียด" + auto redirect ฝั่ง server (D15) | `Base: theme/paces/Admin/TS/src/assets/css/custom/_card.css` |
| reuse product picker | `orders/new/components/ProductPickerModal.tsx` | `ProductPickerModal` | reuse | `Base: src/app/(paces)/seller/(dashboard)/orders/new/components/ProductPickerModal.tsx` |

> ⚠️ **Path ที่ต้อง verify ก่อนใส่ใน commit:** `categories/components/AddCategoryModal.tsx`, `components/PageBreadcrumb*`, `components/table/TablePagination*` — page-sourcing.md อ้างถึง แต่ผมไม่ได้เปิดยืนยันในรอบนี้. ถ้าไฟล์ไม่ตรง ให้ fallback เป็น primitive `_modal.css` และระบุใน commit.

---

## 5. Component requirement analysis

### 5.1 สร้างใหม่ (SafePay domain — ไม่มี theme equivalent ตรง)

| Component | หน้า | client/server | เหตุผล boundary |
|---|---|---|---|
| `OrderCard` + `OrderCardList` | List | client (list มี tab/search/copy interactive); การ์ดเดี่ยวอาจ server แต่ host เป็น client | filter/search/copy state |
| `OrderCardMenu` | List | **client** | dropdown toggle + modal trigger |
| `OrderDetailHeader` | Detail | **client** | `⋯` dropdown, copy, modal trigger |
| `CancelOrderModal`, `ShipOrderModal` | Detail | **client** | overlay state + fetch |
| `OrderGuardBanner` | Edit | server ได้ (แต่ redirect logic อยู่ server page) | static |
| `CustomerSelectBlock` | Create | **client** | combobox/radio/dropdown ลอย |
| `PaymentChannelBlock` | Create | client (อยู่ใน form) | controlled inputs |
| `CartBlock` + `OrderSummaryPanel` | Create | **client** | `useFieldArray` + derive type real-time |
| `EditOrderForm` | Edit | **client** | `useFieldArray` + submit |

### 5.2 Copy + ปรับ จาก theme

- `OrdersList` toolbar/tabs ← theme `OrdersList.tsx` (เก็บ toolbar, ทิ้ง table)
- `OrderSummary`, `CustomerDetails`, `ShippingActivity` ← theme `order-details/components/*` (มีใน repo แล้ว — rework ตาม mockup)
- `OrderCreateForm`/`EditOrderForm` card+grid ← theme `order-add/page.tsx`
- `OrderDetailHeader`/`OrderCard`/modals ← primitives `_card/_buttons/_badge/_modal/_forms/_select2.css`

### 5.3 Reuse ของที่มีในโปรเจกต์แล้ว

- `VerticalLayout` + `(dashboard)/layout.tsx` + `(fullscreen)/layout.tsx` + `FullscreenPageHeader` (shell — **ห้ามทำเอง**)
- `PageBreadcrumb`, `Icon` wrapper (`@/components/wrappers/Icon`, iconify tabler), `TablePagination`
- `_shared/SellerEmptyState.tsx` / `SellerErrorState.tsx` / `SellerCardSkeleton.tsx` (loading)
- `orders/[token]/components/CopyLinkButton.tsx` → generalize เป็น `CopyButton`
- `OrderReviewCard.tsx`, `ProductPickerModal.tsx`

### 5.4 Client / Server boundary (Next 16 RSC)

- Page (`page.tsx`) = **server**: auth, DAL fetch (ownership ใน WHERE), mask PII, Date→ISO, ส่ง plain props
- Interactive children = **client** (`'use client'`): combobox, dropdown menu, copy button, modal, `useFieldArray`/`react-hook-form`
- **ห้ามส่ง Date object / raw phone-email ข้าม RSC boundary** — string/masked เท่านั้น (memory `feedback_rsc_dal_authz`; pattern มีในไฟล์ปัจจุบันแล้ว)

### 5.5 next/link pattern (RSC convention)

Paces **ไม่มี MUI** → ปัญหา `component={Link}` ไม่เกิดตรง ๆ. ใช้ `next/link` `<Link href>` ปกติ (ตัวอย่างใน `OrdersList.tsx`/`page.tsx` ปัจจุบัน). path สั้น (`/orders`, `/orders/new`, `/orders/[token]`) ห้าม `/seller` prefix (page-sourcing.md §🛑). ลิงก์ผู้ซื้อ `/o/{token}` = absolute buyer URL ผ่าน `resolveBuyerBaseUrl()` (cross-subdomain → full nav, ไม่ใช่ `<Link>`). ถ้า dev เพิ่ม Paces client-link wrapper ให้วางที่ `src/app/(paces)/_components/` (ยังไม่มี dir นี้ — convention rsc-mui-navigation.md ระบุตำแหน่ง).

---

## 6. Data / API contract

### 6.1 Field ที่ UI ต้องใช้ vs Prisma schema จริง (`prisma/schema.prisma`)

| UI ต้องใช้ | สถานะใน schema | fallback ถ้า MVP ยังไม่มี |
|---|---|---|
| `Order.publicToken` (ลิงก์ผู้ซื้อ `/o/{token}`) | ✅ มี (`@unique @default(uuid())`) | — |
| display id `{YYYYMMDD}{RANDOM}` | ❌ **ไม่มี field** — ปัจจุบัน list ใช้ `publicToken.slice(0,8)` | derive จาก `createdAt`+suffix random หรือเพิ่ม `Order.displayId` (OQ-3) — **fallback: `publicToken.slice(0,8)`** |
| `Order.type` | ✅ มี (`PHYSICAL` default) | — |
| `Order.status` | ✅ มี | — |
| `Order.fulfillmentMode` (`SHIPPED`/`NO_SHIPPING`) | ✅ มี | — |
| `Order.totalAmount` | ✅ มี (`Decimal`) | — |
| `Order.buyerContact` (เบอร์/อีเมล) | ✅ มี (nullable) | mask ที่ RSC boundary |
| `Order.buyerUserId` / `buyer.displayName` | ✅ มี (relation `BuyerOrders`) | "ผู้ซื้อยังไม่ยืนยัน" ถ้า null |
| `Order.shippingAddress` (JSON ที่อยู่จัดส่ง) | ✅ มี (`Json?`) | structure ของ JSON ยังไม่ define (OQ-6) |
| `Order.cancelInitiator` | ✅ มี | — |
| `Order.createdAt` | ✅ มี | — |
| `OrderItem.name`, `qty`, `price`, `description`, `productId` | ✅ มีครบ | — |
| **`OrderItem.sku`** | ❌ ไม่มี | **[OQ-4 RESOLVED]** ตัดแถว SKU ออกจากทุก mockup ใน MVP (Product ไม่มี `sku`) |
| **`OrderItem.imageUrl`** (รูปเด่น 56px) | ❌ ไม่มีใน `OrderItem` | **[OQ-4 RESOLVED]** join `Product.images[0]` ผ่าน `productId` (`/api/files/{id}`) runtime — ไม่ snapshot; manual item = placeholder |
| **`Order.discount`** (breakdown ส่วนลด) | ❌ ไม่มี field | **[OQ-7 RESOLVED — เข้า MVP]** เพิ่ม `Order.discount Decimal?` (Database agent) + แก้สูตร total |
| **`Order.vatRate`/`vatAmount`** (breakdown VAT) | ❌ ไม่มี field | **[OQ-7 RESOLVED — เข้า MVP]** เพิ่ม `Order.vatRate`/`vatAmount Decimal?` (Database agent); VAT คิดบนยอดหลังหักส่วนลด |
| **`Order.salesChannel`/`internalNote`** | ❌ ไม่มี field | **[OQ-11 RESOLVED — persist]** เพิ่มพร้อม `paymentMethod` ใน migration เดียว (Database agent) |
| `ShipmentTracking.provider`, `trackingNo`, `status` | ✅ มีครบ (relation `Order.shipmentTracking` 1:1) | — |
| `Review.rating`, `comment`, `reviewerContact`, `reviewerUserId` | ✅ มีครบ (1:1) | reviewerContact mask ที่ boundary |
| `Shop.shopName` (header subtitle) | ✅ มี | — |
| ช่องทางการขาย / วิธีชำระเงิน / หมายเหตุภายใน (Create block2) | ❌ **ไม่มี field ใน `Order`** | ไม่ persist ใน MVP (CreateOrderSchema มีแค่ `items`+`type`) — **fallback: เก็บใน UI อย่างเดียว หรือเพิ่ม field** (OQ-8) |
| ประวัติลูกค้า "ลูกค้าเดิม · N ออเดอร์" | ❌ ไม่มี field — ต้อง derive (count orders ที่ buyerContact/buyerUserId เดียวกันในร้าน) | compute server-side; fallback "—" (OQ-5) |

### 6.2 API endpoint

| Endpoint | สถานะ | งานที่ต้องทำ |
|---|---|---|
| `POST /api/orders` | ✅ **มี** (`src/app/api/orders/route.ts`) | re-derive shopId จาก session (มีแล้ว); validate `CreateOrderSchema` (มีแล้ว — แต่ schema มีแค่ `items`+`type`, ไม่มี customer/payment/address — OQ-8). createOrder derive fulfillmentMode (มีแล้ว) |
| `GET /api/orders?status=` | ✅ มี (seller/buyer role) | List page ใช้ RSC `getOrdersByShop` ตรง ๆ ก็ได้ (ปัจจุบันทำแบบนั้น) |
| `PATCH /api/orders/[token]` | ❌ **ไม่มี — ต้องสร้าง** | `src/app/api/orders/[token]/route.ts` PATCH: (1) re-derive shopId จาก session, ownership via `getOrderForShop` (2) **reject 409 ถ้า status ≠ PENDING** (3) validate ใหม่ (`UpdateOrderSchema` — **ยังไม่มี ต้องเพิ่มใน `src/lib/validations.ts`**) (4) update items (replace) + customer fields; **ห้ามแก้ `type`** ฝั่ง server (D1) (5) re-derive fulfillmentMode หลังแก้ items |
| `POST /api/orders/[token]/ship` | ✅ มี | ship modal เรียก; service guard `fulfillmentMode==='SHIPPED'` + `assertTransition` (มีแล้ว) |
| `POST /api/orders/[token]/cancel` | ✅ มี | cancel modal เรียก; `cancelOrder(token,'seller')` (มีแล้ว) — ⚠️ verify ว่า route enforce ownership (ดู OQ-9) |
| `getOrderForShop` / `getOrdersByShop` (service) | ✅ มี (DAL ownership ใน WHERE) | reuse — ห้าม fetch แบบไม่ scope shopId |

> **service `createOrder()` signature ปัจจุบันรับแค่ `{items, type}`** — แต่ mockup Create derive type จากสินค้า + มี customer/payment/address. ต้องตัดสิน: ส่ง `type` ที่ derive ฝั่ง client หรือ derive ฝั่ง server จาก product flags; และ persist customer/payment/address หรือไม่ (OQ-1, OQ-8).

---

## 7. Open Questions / Blockers (Controller/Product ต้องเคลียร์ก่อน build)

| # | คำถาม | ทำไม critical | ทางเลือก/ข้อเสนอ |
|---|---|---|---|
| **OQ-1** | Edit API + business rule: ครอบ field ไหนได้บ้าง (items? customer? address? notes?) และ re-derive `fulfillmentMode` หลังแก้ items อย่างไร (อาจเปลี่ยน SHIPPED↔NO_SHIPPING ทั้งที่ type ล็อก) | กระทบ schema validation + state ของ ship guard; type ล็อกแต่ fulfillment อาจ flip | เสนอ: items+customer+address+notes แก้ได้ (เฉพาะ PENDING); re-run `createOrder` fulfillment logic หลัง update; type คงเดิมเสมอ |
| **OQ-2** | type lock vs fulfillmentMode recalc: ถ้า edit ลบสินค้าที่ต้องจัดส่งออกหมด order ที่ `type=PHYSICAL` ควรเป็น `NO_SHIPPING` ไหม? mockup บอก type readonly แต่ fulfillment ไม่พูดถึง | ส่งผลต่อ ship guard / Detail primary | เสนอ: fulfillmentMode re-derive ได้; type คง |
| **OQ-3** | displayId `{YYYYMMDD}{RANDOM}`: เพิ่ม `Order.displayId` (unique, generate ตอน create, กัน collision) หรือ derive จาก createdAt+publicToken? mockup โชว์ทุกหน้า | เป็น identifier ที่ user เห็น/ค้น/คัดลอก — ต้องนิ่ง + ไม่ชนกัน | เสนอ: เพิ่ม `Order.displayId String @unique` generate `YYYYMMDD`+base32(random); fallback ระหว่างยังไม่เพิ่ม = `publicToken.slice(0,8)` |
| **OQ-4** | ~~SKU + รูปสินค้า~~ **[RESOLVED 2026-05-17]** decision: **join จาก Product runtime** — ไม่ snapshot, ไม่ migration. รูป = `Product.images[0]` ผ่าน `productId` (`/api/files/{id}`); manual item (ไม่มี productId) = placeholder. **SKU = ซ่อนใน MVP** (Product ยังไม่มี field `sku`) — ทุก mockup ที่โชว์แถว `SKU:` ให้ตัดออกใน MVP. ⚠️ trade-off: ถ้าสินค้าถูกลบ/แก้ชื่อ-รูปภายหลัง รายการในประวัติ order จะเปลี่ยนตาม (ไม่ใช่ snapshot) — ยอมรับได้ใน MVP | — | **RESOLVED:** join Product; ไม่มี migration สำหรับ OQ นี้; ตัดแถว SKU ออกจาก list/detail/buyer-link mockup ตอน build |
| **OQ-5** | Customer search backend: ค้นจาก order history เดิม (phone/email/ชื่อ ที่ buyerContact/buyer match ในร้านนี้) — endpoint ไหน? นับ "N ออเดอร์ก่อนหน้า" จากอะไร | combobox Create ต้องมี data source จริง | เสนอ: เพิ่ม `GET /api/orders/customers?q=` scope shopId, group by buyerContact, return {name,contact,orderCount} |
| **OQ-6** | โครงสร้าง `Order.shippingAddress` JSON: field อะไรบ้าง (mockup: ที่อยู่/ตำบล/อำเภอ/จังหวัด/ไปรษณีย์ + หมายเหตุถึงผู้ส่ง) | UI form + detail แสดงต้อง map ตรง | เสนอ: define `{line1, subdistrict, district, province, postcode, note}` |
| **OQ-7** | ~~discount / VAT ใน MVP~~ **[RESOLVED 2026-05-17]** decision: **อยู่ใน MVP** — ต้องเพิ่ม `Order.discount Decimal?` + `Order.vatRate Decimal?` + `Order.vatAmount Decimal?` (ใคร: Database agent) + แก้สูตร `totalAmount` (= ยอดสินค้า − discount + vatAmount; VAT คิดบนยอดหลังหักส่วนลด ตาม mockup) + เพิ่ม field ใน `CreateOrderSchema`/`createOrder()` + ฟอร์ม Create ต้องกรอกส่วนลด/VAT ได้ | กระทบ schema + total calc + Create form | **RESOLVED:** discount/VAT เข้า MVP — Database agent ออกแบบ field + migration; breakdown ใน list/detail/buyer-link แสดงเฉพาะบรรทัดที่มีค่า (logic mockup เดิมใช้ได้) |
| **OQ-8** | ~~persist ช่องทางการขาย/วิธีชำระ/หมายเหตุภายใน~~ **[RESOLVED 2026-05-17]** `paymentMethod` = **persist บังคับ** (decision product owner); `salesChannel`/`internalNote` ยังค้างรอ controller ตัดสิน; `buyerContact`/`buyerName` persist บังคับ (ใช้กับ slip + cancel) — ต้องเพิ่ม `Order.paymentMethod String?` + `Order.salesChannel String?` + `Order.internalNote String?` เข้า schema + `CreateOrderSchema` + `createOrder()` (ใคร: Database agent) | ถ้าไม่ persist = ข้อมูลหาย; paymentMethod ผูกกับ slip logic (FR-6.11/12) — ต้องมีก่อน implement slip | **RESOLVED (paymentMethod):** เพิ่ม `Order.paymentMethod` persist บังคับ. `salesChannel`/`internalNote` ยังเปิด — ดู OQ-11 |
| **OQ-9** | ownership ของ `POST /api/orders/[token]/cancel` + `/ship`: service `cancelOrder/shipOrder` รับ `publicToken` ตรง ๆ ไม่ได้ scope shopId — route enforce ownership หรือยัง? **เพิ่มมิติใหม่ (2026-05-17): buyer cancel** ต้องมี path ที่ auth ด้วย phone match ไม่ใช่ seller session — ดู OQ-12 | mockup ให้ seller cancel/ship จาก Detail/List — ต้องกัน seller A กระทำ order ร้าน B; buyer cancel path ต่างจาก seller cancel (auth คนละแบบ) | **ต้อง verify `route.ts` ของ cancel/ship**; ถ้าไม่ scope → เพิ่ม ownership check (re-derive shop จาก session + ตรวจ `order.shopId`) ก่อน build; buyer cancel = endpoint แยกหรือ param แยก (ใคร: Security) |
| **OQ-10** | Edit auto-redirect (D15): mockup บอก "ระบบ redirect อัตโนมัติ" เมื่อ ≠ PENDING — redirect ทันทีฝั่ง server (ไม่เห็น banner) หรือโชว์ banner แล้วค่อย redirect (client timer)? | กระทบ UX + การ implement guard | เสนอ: server `redirect('/orders/[token]')` ทันที (ปลอดภัยกว่า); banner ใช้กรณี race/optimistic |
| **OQ-11** | ~~`salesChannel` + `internalNote` ใน MVP~~ **[RESOLVED 2026-05-17]** decision: **persist ทั้งคู่** — เพิ่ม `Order.salesChannel String?` + `Order.internalNote String?` พร้อม `Order.paymentMethod` ใน migration เดียว (ใคร: Database agent) + เพิ่มใน `CreateOrderSchema`/`createOrder()`. `salesChannel` ใช้กับ channel badge ใน list/detail (Facebook/Line/TikTok/หน้าร้าน); `internalNote` มองเห็นเฉพาะ seller | กระทบ CreateOrderSchema | **RESOLVED:** persist ทั้งคู่ |
| **OQ-12** | buyer-cancel endpoint: ใช้ `POST /api/orders/[token]/cancel` เดิม + param `{ initiator: 'buyer' }` หรือสร้าง endpoint แยก `POST /api/orders/[token]/buyer-cancel`? auth ต้องยืนยันด้วย phone match (ไม่ใช่ seller session) | Security concern: endpoint cancel เดิม scope seller session; buyer cancel ต้อง auth ต่างกัน; ต้องกัน seller เรียก buyer-cancel และ buyer เรียก seller-cancel ปน | เสนอ: endpoint แยก `/buyer-cancel` auth ด้วย phone match (ใช้ mechanism เดียวกับ `/unlock` + `/confirm`); guard status=PENDING server-side (ใคร: Security) |
| **OQ-13** | payment slip storage: ใช้ storage layer `src/lib/storage` ที่มีอยู่หรือไม่? ชนิดไฟล์ที่ยอมรับ (JPEG/PNG/WEBP/PDF?) + ขนาดจำกัด + นามสกุลเปลี่ยนเป็น UUID ตาม NFR-2.4? ต้องมี model `PaymentSlip` ใหม่หรือ field `Order.slipFileId`? | กระทบ schema + API + security (NFR-2.4: validate MIME, limit size, rename UUID, auth check); slip เป็น PII-adjacent (โอนเงิน = มีชื่อ/บัญชี) | เสนอ: เพิ่ม `Order.slipFileId String?` (ชี้ไปที่ file record); 1 order 1 slip; ยอมรับ JPEG/PNG/PDF ≤ 5MB; นามสกุล UUID; serve ผ่าน auth-protected endpoint (ใคร: Database agent + Security) |

---

## 10. หน้า Buyer Order Link `/o/{token}` — Spec เพิ่มเติม

> เพิ่ม 2026-05-17 — เดิม spec เน้น seller 4 หน้า; หน้านี้อยู่ใน `src/app/(marketing)/` (Vuexy theme) และมีโค้ดบางส่วนแล้ว

### 10.1 ภาพรวม flow (5 state ที่ buyer เห็น)

```
[1] Lock screen        — PhoneUnlock: กรอกเบอร์ตรงกับ order.buyerContact
        ↓ unlock (phone match) หรือ ?unlocked=1 (SMS phone-bound — FR-6.8)
[2] PENDING            — เห็นรายละเอียดเต็ม + ปุ่มยืนยัน + ปุ่มแนบสลิป (ถ้า requiresSlip) + ปุ่มยกเลิก
        ↓ seller ใส่ tracking (fulfillmentMode=SHIPPED)
[3] SHIPPED            — เห็นรายละเอียด + tracking + ปุ่มยืนยันรับของ (ไม่มีปุ่มยกเลิก)
        ↓ buyer กดยืนยันรับ
[4] CONFIRMED          — แสดง status "สำเร็จ" + ReviewForm (ถ้ายังไม่ review) หรือ review ที่ให้ไปแล้ว
[5] CANCELLED          — แสดง notice "คำสั่งซื้อนี้ถูกยกเลิกแล้ว"
```

**หมายเหตุ:** NO_SHIPPING path: PENDING → buyer กดยืนยัน → CONFIRMED (ข้าม state [3])

### 10.2 Component ที่มีในโค้ดแล้ว (อ้างอิงสำหรับ Developer)

| Component | Path | สถานะ |
|---|---|---|
| `PublicOrderPage` (RSC) | `src/app/(marketing)/o/[token]/page.tsx` | มีแล้ว — รองรับ UUID + SMS short-code discriminator |
| `PublicOrderClient` (client orchestrator) | `src/app/(marketing)/o/[token]/PublicOrderClient.tsx` | มีแล้ว — จัดการ stage lock/detail + sessionStorage + `?unlocked=1` |
| `PhoneUnlock` | `src/app/(marketing)/o/[token]/PhoneUnlock.tsx` | มีแล้ว — phone-unlock (ไม่มี OTP) |
| `OrderDetailMobile` | `src/app/(marketing)/o/[token]/OrderDetailMobile.tsx` | มีแล้ว — mobile-first; **ต้องเพิ่ม slip upload + cancel (FR-6.12, FR-6.13)** |
| `ReviewForm` | `src/app/(marketing)/o/[token]/ReviewForm.tsx` | มีแล้ว |
| `SmsErrorPage` | `src/app/(marketing)/o/[token]/SmsErrorPage.tsx` | มีแล้ว |

**Theme base:** Vuexy (`theme/vuexy/`) — MUI v9 + Emotion + Tailwind 4. Layout group `(marketing)`.

### 10.3 สิ่งที่ต้องเพิ่มใน `OrderDetailMobile` (ยังไม่มีในโค้ด)

| Feature | FR | เงื่อนไขแสดง | หมายเหตุ |
|---|---|---|---|
| ปุ่มแนบสลิป + form upload | FR-6.12 | `status=PENDING` + `paymentMethod.requiresSlip=true` | optional; 1 order 1 slip; replace ได้ |
| ปุ่มยกเลิก (buyer) | FR-6.13 | `status=PENDING` เท่านั้น | ต้องมี confirm dialog; `cancelInitiator='buyer'` |
| แสดง slip ที่แนบแล้ว | FR-6.12 | หลังแนบ (seller + buyer เห็น) | thumbnail / link |

**ข้อห้ามที่ยังคง:** ไม่มี OTP ในหน้านี้ (FR-6.3) — phone-unlock ไม่ใช่ OTP confirm; ห้ามเปลี่ยน

### 10.4 `PublicOrderData` type — field ที่อาจต้องเพิ่ม

ปัจจุบัน `PublicOrderData` (ใน `OrderDetailMobile.tsx`) ไม่มี:
- `paymentMethod` (ต้องส่งมาเพื่อควบคุม `requiresSlip`)
- `slipFileId` / `slipUrl` (ถ้ามีการแนบสลิปแล้ว — แสดง)
- `fulfillmentMode` (ปัจจุบันใช้ `type` แทน — ควร expose ตรงเพื่อกัน bug)

Database agent ต้องออกแบบ schema ก่อน Developer จะปรับ type นี้ได้

### 10.5 API endpoints ที่ต้องเพิ่ม (ยังไม่มี)

| Endpoint | วัตถุประสงค์ | Auth | หมายเหตุ |
|---|---|---|---|
| `POST /api/orders/[token]/slip` | buyer แนบสลิป | phone match (ผ่าน unlock) | multipart/form-data; validate MIME+size; ดู OQ-13 |
| `POST /api/orders/[token]/buyer-cancel` | buyer ยกเลิก PENDING | phone match | guard status=PENDING; `cancelInitiator='buyer'`; ดู OQ-12 |

### 10.6 Downstream impact — ต้องการ agent อื่น

| ประเด็น | ใคร | รายละเอียด |
|---|---|---|
| Schema `Order.paymentMethod` + slip storage | **Database agent** | เพิ่ม field `Order.paymentMethod String?`; ออกแบบ slip storage model/field (OQ-13); migration |
| Security: buyer-cancel + slip upload auth | **Security agent** | endpoint ใหม่ใช้ phone match (ไม่ใช่ seller session); rate-limit; ดู OQ-12 |
| Storage layer: slip upload | **Developer** | reuse `src/lib/storage` หรือไม่? ดู OQ-13 |
| State machine guard: buyer-cancel PENDING-only | **Developer** | guard ทั้ง UI + API (ไม่ใช่แค่ UI); reject 409 ถ้า status≠PENDING |

### 10.7 Phasing (เสนอ — Controller ตัดสิน)

| Feature | เสนอ Phase |
|---|---|
| `paymentMethod` persist + แสดงใน order detail (seller + buyer) | Phase เดียวกับ seller orders handoff (MVP) |
| payment slip upload + ตรวจ slip ฝั่ง seller | MVP (ควรพร้อมกัน — slip ไม่มีประโยชน์ถ้า seller ดูไม่ได้) |
| buyer cancel PENDING-only | MVP (กัน confusion ก่อน prod) |

---

## 11. Definition of Done / QA checklist

อ้าง `docs/conventions/seller-action-placement.md` §6 + UI guideline checklist:

**Theme-copy / convention**
- [ ] ทุก commit ที่แตะ UI มี `Base:` line ชี้ theme file ที่ copy (Hard Rule 3) — ตามตาราง §4
- [ ] ไม่มี UI ประกอบเองโดยไม่มี theme/primitive base (Hard Rule 1)
- [ ] primary action อยู่ขวาสุดของ action-bar, 1 ปุ่ม/หน้า, ไม่ duplicate ใน panel
- [ ] ไม่มีปุ่มใน recap/summary panel (Create summary, List breakdown) — D12
- [ ] destructive (ยกเลิก) อยู่ใน `⋯` + confirm modal (ไม่ใช่ `window.confirm`) — D3
- [ ] ลำดับปุ่ม `⋯ → secondary → primary`; Detail primary ผันตาม state ถูกตาม convention §4
- [ ] List ใช้ toolbar pattern (primary ใน card-header) ไม่มี sticky action-bar — D6

**RSC / DAL / security**
- [ ] ทุก fetch scope `shopId` ใน WHERE (`getOrdersByShop`/`getOrderForShop`) — ไม่ redirect-after-fetch อย่างเดียว
- [ ] ไม่มี raw phone/email หรือ Date object ข้าม RSC boundary (mask/ISO เท่านั้น)
- [ ] `PATCH /api/orders/[token]` + cancel/ship enforce ownership server-side + reject ถ้า status ผิด (OQ-1, OQ-9)
- [ ] seller nav ใช้ path สั้น (ไม่มี `/seller/` ใน address bar — verify client `router.push` + server `redirect`)

**Tech**
- [ ] `npm run type-check` ผ่าน (TS strict)
- [ ] Font Anuphan ทุก surface (Hard Rule 5) — ไม่ hardcode font อื่น
- [ ] icons ใช้ `@iconify/react` tabler names ผ่าน `@/components/wrappers/Icon`

**QA (baseline บังคับ — `CLAUDE.md` + memory `feedback_qa_domains`)**
- [ ] QA ผ่าน **Chrome DevTools MCP** ที่ `seller.deepth.local` (curl-probe port จริง 3000/4000; **Claude ไม่ start dev server เอง**) — ไม่ใช่ curl+type-check อย่างเดียว
- [ ] ทดสอบ 4 หน้า: List (card, tab, search, copy, empty/error), Detail (sticky header, primary ผันตาม state, ship/cancel modal, customer แสดงเสมอ), Create (4 block, combobox ลอยไม่ดัน layout, derive type, address auto, summary recap), Edit (type locked, items mutable, guard banner ≠ PENDING)
- [ ] Mobile: action-bar ไม่ย้าย/ไม่ยุบเป็น bottom bar; combobox dropdown ไม่ดัน layout
- [ ] re-QA บน DB จริง (ไม่ mock) — memory `feedback_verify_dont_assume`

> Phase นี้ ≥3 tasks → ต้องผ่าน agent-team-phase workflow (Planner→Developer→Reviewer→QA→Controller, 5 gates, 3-level QA) + retro ปลาย phase (`CLAUDE.md` Hard Rule 4).
