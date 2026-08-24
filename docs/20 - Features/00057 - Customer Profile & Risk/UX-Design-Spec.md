---
title: "UX Design Spec — 00057 Customer Profile & Risk"
owner: shinobu22
status: draft
created: 2026-08-24
tags: [ux, design-spec, feature, customer, paces]
related: ["[[00057 - Customer Profile & Risk]]", "[[00014 - Customer Directory]]", "[[00055 - Platform Buyer Reputation]]"]
---

> **โมดูล:** M57-CustomerProfileRisk
> **ประเภทเอกสาร:** UX Design Spec (Hard Rule 8 gate — ผลิตโดย `safepay-ux`)
> **Surface:** seller / Paces (`(paces)/seller/(dashboard)/customers/**`)

# Design Spec: หน้าโปรไฟล์ลูกค้า + สัญญาณความเสี่ยง

อ้างอิงที่อ่านก่อนออกแบบ: `DESIGN.md` · `PRODUCT.md` · `.impeccable/design.json` · Impeccable `shape.md`/`operate.md`/`craft-floor.md` · `docs/system/ui-guideline/paces-component-reference.md` · โค้ดที่มีอยู่ (`CustomerTable.tsx`, `data.ts`, `CustomerPanel.tsx`, `BuyerReputationRow.tsx`, `customer-behavior.ts`, `buyer-reputation.ts`, `OrdersTable.tsx`, `OrderDetailClient.tsx`, `order-profit-presentation.ts`, `OrdersList.tsx`, `ListBusyOverlay.tsx`, `DataTable.tsx`, `ProductCard.tsx`, `OrderCard.tsx`, schema `Customer`/`Order`/`Conversation`)

---

## จอ A: `/customers` (ปรับของเดิม) — ลิสต์ลูกค้า

### User stories ที่ครอบ
- ผู้ขายอยากรู้เร็ว ๆ ว่าลูกค้าคนไหน "มีสัญญาณต้องระวัง" ก่อนเปิดพัสดุ COD ให้
- ผู้ขายค้นหาลูกค้าด้วยชื่อหรือเบอร์เต็มได้ (ไม่ใช่แค่ตัวที่ปิดบังไว้)
- ผู้ขายกรองเฉพาะลูกค้าที่ซื้อซ้ำแล้ว เพื่อดูฐานลูกค้าประจำ

### Wireframe — มือถือ 375px
หน้านี้ไม่ใช่ full-screen แบบ `/orders` — อยู่ใต้ `SellerMobileHeader` เดิม + bottom nav ปกติ

```
┌─────────────────────────────────┐
│ ← ลูกค้า                        │ SellerMobileHeader (เดิม)
├─────────────────────────────────┤
│ card-header (2 แถว):             │
│ [ค้นหาชื่อ หรือ เบอร์โทร.......] │ full-width search
│ [สัญญาณเตือน ▾][ประวัติการซื้อ ▾]│ FilterDropdown x2 (wrap)
├─────────────────────────────────┤ <- relative (ListBusyOverlay ครอบตรงนี้ลงไป)
│ (ส) สมชาย ใจดี  [ext][!]     3   │
│     081-xxx-5678 [eye]    ออเดอร์│
│  ─────────────────────────────  │ border-t (ไม่ใช่ dashed)
│     ล่าสุด 20 ส.ค. 69            │
│     ยอดซื้อสะสม        ฿4,590   │
├─────────────────────────────────┤
│ (ว) วรรณา พงษ์       [!]     1   │
│     089-xxx-1234 [eye]   ออเดอร์ │
├─────────────────────────────────┤
│        ‹ ก่อนหน้า 1/3 ถัดไป ›    │ card-footer (TablePagination)
└─────────────────────────────────┘
```

### Wireframe — แท็บเล็ต 768px
Paces มีเส้นแบ่งหลักที่ `lg` (1024px) ⇒ 768 ยังเป็นโหมดการ์ดเดียวกับมือถือ ต่างที่ความกว้างพอให้ "ล่าสุด" กับ "ยอดซื้อสะสม" วางเคียงกัน (เพิ่ม `sm:flex-row sm:justify-between` ที่บล็อกนั้น — `sm`=640 ครอบ 768)

```
┌───────────────────────────────────────────────┐
│ [ค้นหาชื่อ หรือ เบอร์โทร......] [เตือน▾][ซื้อ▾]│ แถวเดียว ไม่ wrap
├───────────────────────────────────────────────┤
│ (ส) สมชาย ใจดี [ext][!]                     3 │
│     081-xxx-5678 [eye]  ล่าสุด 20ส.ค.  ฿4,590 │ แถวเดียว (sm:flex-row)
└───────────────────────────────────────────────┘
```

### Wireframe — เดสก์ท็อป 1440px

```
┌────────────────────────────────────────────────────────────────────────┐
│ card-header                                                             │
│ [ค้นหาชื่อ หรือเบอร์...........] [สัญญาณเตือน▾] [ประวัติการซื้อ▾]  [8▾]│
├────────────────────────────────────────────────────────────────────────┤ <- relative
│ ลูกค้า           │ ติดต่อ         │ ออเดอร์│ ยอดซื้อสะสม │ ล่าสุด      │
├────────────────────────────────────────────────────────────────────────┤
│ (ส) สมชาย[ext][!]│ 081-xxx-5678[eye]│  3   │  ฿4,590     │ 20 ส.ค. 69 │ <- ทั้งแถวคลิกได้
│ (ว) วรรณา พงษ์   │ 089-xxx-1234[eye]│  1   │  ฿890       │ 18 ส.ค. 69 │
├────────────────────────────────────────────────────────────────────────┤
│                       ‹ แสดง 1-8 จาก 42    1 2 3 ›                      │
└────────────────────────────────────────────────────────────────────────┘
```

### Section breakdown

**Search + filters (card-header)** — ถอด `globalFilter` ของ TanStack ออก แทนด้วย URL query (`?q=`, `?warn=`, `?repeat=`) ที่ `page.tsx` (RSC) อ่านแล้วกรองฝั่ง server **ก่อน** aggregate เป็น `CustomerRow[]`. เหตุผล: ค้น "เบอร์เต็ม" ต้องเทียบกับ `buyerContact`/`Customer.phone` ดิบซึ่งไม่เคยถูกส่งลง client (PDPA mask ที่ต้นทาง) client จึงค้นเองไม่ได้โดยโครงสร้าง. ช่องค้นหาใช้ `busy.begin()` (ไม่บล็อกการพิมพ์ — controlled input ที่ถูก defer จะพิมพ์ตามนิ้วไม่ทัน) ส่วน filter dropdown ใช้ `busy.run(() => router.push(...))` เหมือน `/orders` — โครง `useListBusy()` เดียวกัน

**ไอคอนสัญญาณเตือนท้ายชื่อ** — ยกจาก `OrdersTable.tsx:404-435` เป๊ะ: `customerBadges()` จาก `customer-behavior.ts` render เป็นวงกลม `size-5 rounded-full bg-warning/15 text-warning-ink` + `role="img"` + `aria-label`/`title`. **ห้ามสร้างรูปแบบใหม่** — ของเดิมผ่าน a11y gate มาแล้ว (กฎ `aria-name-requires-supporting-role.md`)

**ลิงก์โปรไฟล์สาธารณะ (ไอคอน `external-link`) แยกออกจากชื่อ** — เดิมทั้งชื่อเป็น `<a>` ไป `/u/{username}` (external, tab ใหม่) พอทั้งแถวคลิกได้ (ไปโปรไฟล์ภายใน) การให้ "ชื่อ" ซึ่งเป็นพื้นที่ที่คนกดมากที่สุด พาไปคนละที่กับ "แถว" จะสร้างสองปลายทางที่ขัดสัญชาตญาณ

**แถวคลิกได้ทั้งแถว** — เดสก์ท็อป: ใช้ `onRowClick` prop ของ `DataTable` (`src/components/table/DataTable.tsx:67,115-129`) ที่มี guard `closest('button, a, ...')` ในตัวอยู่แล้ว. มือถือ/แท็บเล็ต (`mobileCard` render prop ไม่มี click wiring): ใช้ **stretched-link pattern** เดียวกับ `OrderCard.tsx`/`ProductCard.tsx` — `<div className="relative">` + `<Link className="absolute inset-0" aria-label={...}/>` ชั้นล่างสุด แล้วปุ่มจริงยกขึ้น `relative z-10`

**ปุ่มแสดงเบอร์ทีละคน** — ไอคอน `eye`/`eye-off` toggle (precedent: `PasswordInputWithStrength.tsx`) กดครั้งแรกยิง fetch เฉพาะแถวนั้น → spinner ในปุ่ม → แสดงเบอร์เต็มแทน mask + ไอคอนเป็น `eye-off` → กดซ้ำซ่อนกลับ (ไม่ fetch ซ้ำ, ไม่ persist ข้ามการโหลดหน้า). desktop `btn btn-icon btn-sm` · มือถือ `size-11` (44px)

### Theme Source Mapping — จอ A

| Section | Source | วิธีใช้ | หมายเหตุ |
|---|---|---|---|
| Card + table + pagination shell | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/{page,components/CustomerTable}.tsx` | แก้ของเดิมในโปรเจกต์ | ไม่ copy ใหม่ |
| Search + filter toolbar | `src/app/(paces)/seller/(dashboard)/orders/components/OrdersTable.tsx` | reuse pattern | ย้าย client-filter → URL-query-filter |
| FilterDropdown x2 | `src/components/safepay/FilterDropdown.tsx` | reuse ตรง ๆ | `resetValue="All"` ทั้งคู่ |
| แผงโหลด | `_shared/ListBusyOverlay.tsx` + `useListBusy()` | reuse ตรง ๆ | ครอบเฉพาะ table/card-list **ไม่ครอบ card-header** |
| ไอคอนสัญญาณเตือน | `orders/components/OrdersTable.tsx:404-435` | reuse โค้ดเดิมทั้งก้อน | เรียก `customerBadges()` |
| ปุ่ม eye toggle | `src/components/PasswordInputWithStrength.tsx` | ทำใหม่ตาม pattern | ต้องมี endpoint ใหม่ |
| Row-click มือถือ | `products/components/ProductCard.tsx` | reuse stretched-link | |
| Row-click เดสก์ท็อป | `src/components/table/DataTable.tsx` `onRowClick` | ใช้ prop ที่มีอยู่ | ไม่ต้องเขียนใหม่ |

### Content outline (จอ A)
- Search placeholder: `ค้นหาชื่อ หรือ เบอร์โทร`
- Filter 1: `สัญญาณเตือน` → `มีสัญญาณเตือน`
- Filter 2: `ประวัติการซื้อ` → `ซื้อซ้ำแล้ว` / `ซื้อครั้งเดียว`
- คอลัมน์: `ลูกค้า` / `ติดต่อ` / `ออเดอร์ทั้งหมด` / `ยอดซื้อสะสม (นับเป็นยอดขายแล้ว)` / `ออเดอร์ล่าสุด`
- Empty จากตัวกรอง: `ไม่พบลูกค้าที่ตรงกับตัวกรองนี้` + ปุ่ม `ล้างตัวกรอง`
- Empty เพราะร้านไม่มีลูกค้า: คงข้อความเดิม `ยังไม่มีลูกค้า — รอผู้ซื้อสั่งซื้อสินค้าจากร้านค้าของคุณ`

### Edge states (จอ A)
- **Empty 2 แบบต้องแยกข้อความ** (ตัวกรองไม่เจอ vs ร้านยังไม่มีลูกค้าเลย)
- **Error โหลดไม่สำเร็จ** — พฤติกรรมเดิม `catch { orders = [] }` ทำให้ฐานล่มหน้าตาเหมือน "ไม่มีลูกค้า" → บันทึกเป็นหนี้ที่ต้องแยกให้ได้
- **ชื่อยาว 34+ ตัวอักษร** — `min-w-0` ที่กล่อง flex + `max-w-full truncate` ที่ `<span>` ชื่อ ทั้งมือถือและตาราง (บทเรียน prod 2026-08-07 และ 2026-08-12)
- **ตัวเลข 0 / หลักล้าน** — `฿0` ต้องแสดงจริง (ลูกค้าที่ยกเลิกหมด) ไม่ซ่อนแถว; หลักล้านใช้ `tabular-nums` ไม่ล้นคอลัมน์
- **ไม่มีเบอร์** (`contact === '—'`) — ไม่ render ปุ่ม eye

---

## จอ B: `/customers/[id]` (ใหม่ทั้งหน้า) — โปรไฟล์ลูกค้า

🛑 **`[id]` = opaque row key** (`c-<uuid>` / `u-<uuid>` / `g-<hash16>`) **ไม่ใช่ `Customer.id`** เพราะลูกค้าจำนวนมากยังไม่มีแถว `Customer` (ออเดอร์เก่า/guest ไม่มีเบอร์). `page.tsx` ต้อง aggregate orders ทั้งร้านด้วยตรรกะเดียวกับจอ A แล้ว filter หา group ที่ key ตรง — `g-` เป็น one-way hash ถอดกลับไม่ได้โดยเจตนา (กัน enumerate ลูกค้าจาก URL) ⇒ **ต้องสกัด aggregation เป็น shared function ให้ทั้งสองหน้าเรียกร่วม**

### Wireframe — มือถือ 375px

```
┌─────────────────────────────────┐
│ ← ลูกค้า                        │ SellerMobileHeader (title=ชื่อลูกค้า)
├─────────────────────────────────┤
│        ┌────┐                    │
│        │ ส  │ สมชาย ใจดี [ext]   │ header card
│        └────┘ 081-234-5678        │
│               ลูกค้าตั้งแต่ 5 ก.ค. 69│
│ [โทร] [เปิดแชท] [+ สร้างคำสั่งซื้อ]│ โทร/แชท=outline, สร้าง=primary
├─────────────────────────────────┤
│ ยอดซื้อสะสม (นับเป็นยอดขายแล้ว)  │
│      ฿4,590                      │ text-3xl font-bold (พระเอก)
│  ─────────────────────────────  │
│  ออเดอร์ 3   │ เฉลี่ย/บิล ฿1,530 │ stats รอง (text-sm)
│  ยกเลิก 1    │ ล่าสุด 20 ส.ค. 69 │
├─────────────────────────────────┤ เฉพาะเมื่อมีสัญญาณ (border-s-3 border-warning)
│▎ สัญญาณที่ควรระวัง (ร้านนี้)     │
│▎ [! ยกเลิก 1 รายการ]             │ customerBadges()
│▎ ──────────────────────────     │
│▎ ทั้งระบบ                        │ BuyerReputationRow (reuse ตรง ๆ)
│▎ [สั่ง 12][รับของ 9][ตีกลับ 2]   │
│▎ พัสดุตีกลับ 22% ของ 9 ใบที่เปิด │
├─────────────────────────────────┤
│ ที่อยู่ล่าสุด                     │
│ 123 ถ.สุขุมวิท ... กรุงเทพ 10110 │
├─────────────────────────────────┤
│ คำสั่งซื้อทั้งหมด (3)             │
│ DP690820A1B2  20 ส.ค.69   ฿1,590│
│ [สำเร็จ]                  [แชท] ›│
│ ─────────────────────────────   │
│ DP690815C3D4  15 ส.ค.69   ฿2,000│
│ [ยกเลิก]                       ›│ ไม่มีปุ่มแชท (conversationId = null)
├─────────────────────────────────┤
│     ‹ ก่อนหน้า  1/1  ถัดไป ›     │ เมื่อออเดอร์ > 1 หน้า
└─────────────────────────────────┘
```

### Wireframe — แท็บเล็ต 768px
single-column เดิม กว้างขึ้น: หัวการ์ดวาง avatar+ชื่อ+ปุ่มลัดแถวเดียว, สรุปตัวเลขเป็น 1 แถว 5 ช่อง (ยอดซื้อสะสมยังเด่นกว่าด้วย font-size)

```
┌───────────────────────────────────────────────────┐
│ (ส) สมชาย ใจดี [ext]  081-234-5678 · ตั้งแต่ 5ก.ค.69│
│                       [โทร][เปิดแชท][+สร้างคำสั่งซื้อ]│
├───────────────────────────────────────────────────┤
│ ฿4,590      │  3   │ ฿1,530  │  1   │ 20 ส.ค. 69  │
│ ยอดซื้อสะสม │ออเดอร์│เฉลี่ย/บิล│ยกเลิก│ ล่าสุด      │
├───────────────────────────────────────────────────┤
│▎ สัญญาณที่ควรระวัง (ร้านนี้) + ทั้งระบบ             │
├───────────────────────────────────────────────────┤
│ ที่อยู่ล่าสุด: 123 ถ.สุขุมวิท ... กรุงเทพ 10110      │
├───────────────────────────────────────────────────┤
│ คำสั่งซื้อทั้งหมด (3)                               │
│ DP690820A1B2│20ส.ค.69│฿1,590│[สำเร็จ]     [แชท] › │
└───────────────────────────────────────────────────┘
```

### Wireframe — เดสก์ท็อป 1440px
70/30 สองคอลัมน์ (ซ้าย=ประวัติ, ขวา=สรุป+สัญญาณ) — ที่ 1440px คอนเทนต์ 1 คอลัมน์จะทิ้งพื้นที่ขวาว่าง ~55% ของ viewport

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← ลูกค้า   สมชาย ใจดี [ext]              [โทร][เปิดแชท][+สร้างคำสั่งซื้อ]│
├───────────────────────────────────────────┬──────────────────────────────┤
│ card: คำสั่งซื้อทั้งหมด (3)        70%     │ card: สรุป              30%  │
│ ┌───────────────────────────────────────┐ │ ยอดซื้อสะสม                  │
│ │DP690820A1B2│20ส.ค.69│฿1,590│สำเร็จ│แชท›│ │   ฿4,590      (text-3xl)     │
│ │DP690815C3D4│15ส.ค.69│฿2,000│ยกเลิก│   ›│ │ ──────────────────────────  │
│ │DP690712E5F6│12ก.ค.69│฿1,000│สำเร็จ│แชท›│ │ ออเดอร์      3               │
│ └───────────────────────────────────────┘ │ เฉลี่ย/บิล   ฿1,530          │
│                                            │ ยกเลิก       1               │
│                                            │ ซื้อล่าสุด   20 ส.ค. 69      │
│                                            ├──────────────────────────────┤
│                                            │▎ สัญญาณที่ควรระวัง (ร้านนี้) │
│                                            │▎[! ยกเลิก 1 รายการ]          │
│                                            │▎──────────────────────────  │
│                                            │▎ ทั้งระบบ                    │
│                                            │▎[สั่ง12][รับของ9][ตีกลับ2]   │
│                                            ├──────────────────────────────┤
│                                            │ ที่อยู่ล่าสุด                 │
│                                            │ 123 ถ.สุขุมวิท ...            │
└────────────────────────────────────────────┴──────────────────────────────┘
```

### Section breakdown (จอ B)

**1) หัวโปรไฟล์** — avatar/ตัวย่อ (`PanelAvatar` pattern จาก `CustomerPanel.tsx:862-872`, `size-14` เพราะเป็น header ไม่ใช่แถวแชท), ชื่อ + ไอคอนลิงก์โปรไฟล์สาธารณะ (เฉพาะสมาชิก), **เบอร์เต็ม ไม่ mask** (หน้านี้เปิดมาดูลูกค้าคนเดียวโดยตั้งใจแล้ว), `ลูกค้าตั้งแต่ {วันที่ออเดอร์แรก}` (ต้องเพิ่ม `firstOrderISO` ใน aggregation — เดิมมีแค่ `lastOrderISO`). ปุ่มลัด 3 ปุ่ม: **โทร** (`tel:`, `btn border-default-300`) · **เปิดแชท** (`btn border-default-300` → `/inbox/{conversationId}` ของออเดอร์ล่าสุดที่มีค่า; ไม่มีเลย → **ไม่ render** ไม่ใช่ disabled เทา) · **สร้างคำสั่งซื้อใหม่** (`btn bg-primary text-white`, primary เดียวของหน้า, ป้าย = `ORDER_VOCAB.createLabel` ผันตาม vertical)

**2) สรุปตัวเลข** — 5 ค่า แต่ **ไม่ใช่การ์ด 5 ใบน้ำหนักเท่ากัน**: ยอดซื้อสะสมเป็นพระเอก (`text-3xl font-bold tabular-nums`; precedent `SalesChartCard.tsx` ใช้ `text-4xl`) ที่เหลือเป็น label-ซ้าย/ค่า-ขวา `text-sm`. **ยอดเฉลี่ยต่อบิล = ยอดซื้อสะสม ÷ จำนวนออเดอร์ที่ `countsAsRevenue`** ไม่ใช่หารด้วย `totalOrders` ดิบ (ไม่งั้นค่าเฉลี่ยลดลงทุกครั้งที่มีออเดอร์ยกเลิกเพิ่ม ทั้งที่ไม่เกี่ยวกับยอดขายจริง) — ตัวหารเป็น 0 → แสดง `—` ไม่หารด้วย 0. **จำนวนยกเลิก** = `cancelledTotal` จาก `summarizeCustomerBehavior()` (คำเป็นกลาง ไม่กล่าวหาว่าใครเริ่ม)

**3) สัญญาณความเสี่ยง 2 ชั้น** — ยกทั้งบล็อกจาก `CustomerPanel.tsx:874-905`: ป้ายพฤติกรรม "ร้านนี้" (`customerBadges()`) + `BuyerReputationRow` ("ทั้งระบบ") วางต่อกันเหมือนต้นฉบับ (ต้องอ่านเรียงกันถึงตัดสินใจได้). **ต่างจากต้นฉบับ 1 จุด:** ห่อด้วย `card border-s-3 border-warning` **เฉพาะเมื่อมีป้ายอย่างน้อย 1 ใบ** เพื่อให้เป็นจุดที่สายตาไปก่อน. ไม่มีป้ายเลย + `buyerReputation.orders === 0` → **ไม่ render section นี้ทั้งก้อน**

**4) ที่อยู่ล่าสุด** — จาก `shippingAddress` ของออเดอร์ล่าสุดที่มีที่อยู่. vertical ที่ไม่มีแกน "ที่อยู่จัดส่ง" → ไม่ render section เลย; มีแกนแต่ยังไม่เคยมีที่อยู่ → empty-state บรรทัดเดียว `ยังไม่มีที่อยู่จัดส่ง`

**5) รายการออเดอร์ทั้งหมด** — **ไม่ยก `OrderCard.tsx` เต็มรูป** (มี items/shipping/payment ซ้อน 4 ชั้นที่ซ้ำกับสิ่งที่กดเข้าไปดูได้). ที่นี่เป็นแถวเบา: เลขออเดอร์ (`formatOrderNo`) + วันที่ (`formatDateTH`) + ยอดรวม (`formatBaht`) + badge สถานะ (`ORDER_STATUS_META`) + ปุ่มแชท (เฉพาะใบที่มี `conversationId`) + chevron. ทั้งแถวคลิกได้ → `/orders/{publicToken}`. เรียง `createdAt DESC`; เกิน 10 ใบ → `TablePagination` page size คงที่ 10

### Theme Source Mapping — จอ B

| Section | Source | วิธีใช้ | หมายเหตุ |
|---|---|---|---|
| หัวโปรไฟล์ (avatar) | `CustomerPanel.tsx:862-872` (`PanelAvatar`) | reuse pattern ขยาย `size-14` | ปุ่มลัด 3 ปุ่มประกอบจาก `.btn` primitive |
| สรุปตัวเลข (เด่น+รอง) | `dashboard/components/SalesChartCard.tsx` | ปรับสเกลลง `text-3xl` | ตัวรอง label-ซ้าย/ค่า-ขวา `text-sm` |
| สัญญาณความเสี่ยง 2 ชั้น | `CustomerPanel.tsx:874-905` + `BuyerReputationRow.tsx` | **reuse โค้ดทั้งก้อนตรง ๆ** | ห่อ `card border-s-3 border-warning` เมื่อมีสัญญาณ |
| Accent card ซ้ายมือ | `theme/paces/.../ui/cards/page.tsx` (CardColoredBorder `border-s-3`) | reuse token | ขึ้นทะเบียนแล้วใน `paces-component-reference.md` §7 |
| ที่อยู่ | `.card`/`.card-body` | ประกอบจาก primitive | การ์ดเรียบ ไม่ต้อง accent |
| รายการออเดอร์ | `theme/paces/.../ecommerce/(orders)/orders/components/OrdersList.tsx` + `src/lib/order-display.ts` (`ORDER_STATUS_META`) | reuse token/badge, โครงแถวทำใหม่ให้เบากว่า `OrderCard.tsx` | **ห้ามยก `OrderCard.tsx` เต็มรูป** |
| Row-click มือถือ | `orders/components/OrderCard.tsx:158-162,252-253` | reuse stretched-link | |
| Loading skeleton | `auctions/[id]/loading.tsx` + `_shared/SellerCardSkeleton.tsx` | reuse pattern | mirror โครงจริง: header → stat → 2-col 70/30 |
| Breadcrumb | `src/components/PageBreadcrumb.tsx` | ใช้ prop ที่มีอยู่ | `title={displayName}` trail กลับ `/customers` |

### Content outline (จอ B)
- Breadcrumb: `ลูกค้า` → ชื่อลูกค้า
- ปุ่มลัด: `โทร` / `เปิดแชท` / `{ORDER_VOCAB.createLabel}`
- ป้าย: `ลูกค้าตั้งแต่ {formatDateTH}`
- สรุป: `ยอดซื้อสะสม` (พระเอก) / `ออเดอร์` / `เฉลี่ยต่อบิล` / `ยกเลิก` / `ซื้อล่าสุด`
- สัญญาณ: `สัญญาณที่ควรระวัง (ร้านนี้)` + badge เดิม / `ทั้งระบบ` (จาก `BuyerReputationRow` เดิม)
- ที่อยู่: `ที่อยู่ล่าสุด` / empty `ยังไม่มีที่อยู่จัดส่ง`
- ออเดอร์: `คำสั่งซื้อทั้งหมด ({n})` (คำนามผัน `ORDER_VOCAB.noun`)

### Edge states (จอ B)
- **404** — key ไม่ match แถวไหนในร้านนี้ → `notFound()` ไม่ใช่หน้าขาว
- **Loading** — `loading.tsx` skeleton mirror โครงจริง
- **ไม่มีเธรดแชทเลย** — ปุ่ม "เปิดแชท" ไม่ render (ไม่ disabled)
- **ไม่มีที่อยู่** — empty-state บรรทัดเดียว; **vertical ไม่มีแกนที่อยู่** — ไม่ render section
- **ยกเลิกทุกใบ** — ยอดซื้อสะสม ฿0, เฉลี่ยต่อบิล `—`, badge ยกเลิกขึ้นตามจริง
- **ชื่อยาว 34+ ตัวอักษร** — `min-w-0` + `truncate` ที่หัวโปรไฟล์
- **ออเดอร์ > 50 ใบ** — pagination ที่ list ออเดอร์

---

## Impeccable compliance

**Mode: Operate** (`operate.md`) — หน้านี้เป็นเครื่องมือปฏิบัติงาน ไม่ใช่ brand surface: familiarity ชนะการแสดงออก, ป้าย/สถานะใช้ vocabulary เดียวกับหน้าอื่น (`ORDER_STATUS_META`, `customer-behavior.ts`) ไม่ประดิษฐ์ใหม่. ความเฉพาะของ Deep ในหน้านี้อยู่ที่ *ข้อมูล* ไม่ใช่ *ลูกเล่นภาพ* — สัญญาณ 2 ชั้น (ร้านนี้ vs ทั้งระบบ) คือกลไกที่ Positioning อธิบายไว้ตรง ๆ

- **One Voice** — `bg-primary`/`text-white` ใช้ที่เดียวต่อหน้า (ปุ่ม "สร้างคำสั่งซื้อใหม่" จอ B) ไม่เกิน ~10% ของพื้นที่จอ
- **Verified-Means-Green** — สัญญาณความเสี่ยงทั้งหมดใช้ `warning` เท่านั้น (ยกจาก `customer-behavior.ts`/`buyer-reputation.ts` ที่ห้าม success/danger ไว้อยู่แล้ว — ux ไม่แก้กติกานี้). "รับของ N" ใน `BuyerReputationRow` ใช้ `success` เพราะเป็นข้อเท็จจริงที่ยืนยันแล้ว (ของถึงมือจริง) — ถูกตามกฎ
- **Sentence case** — ป้าย/ปุ่มเป็นประโยคปกติ ไม่มี ALL CAPS
- **Ink-tinted shadow** — ใช้เงา default ของ `.card` ไม่แก้ใหม่
- **จุดที่ theme ขัดกับ Impeccable และการตัดสิน:**
  - `border-s-3 border-{semantic}` เป็นข้อยกเว้นของ "ห้าม border-left/right >1px" ที่ `DESIGN.md` **ขึ้นทะเบียนไว้แล้วเฉพาะ `(paces)/**`** — ใช้ได้ ไม่ใช่การละเมิด
  - `text-3xl` ไม่อยู่ใน list ของ `paces-component-reference.md` §8 (สุดที่ `text-lg`) แต่เป็น **Tailwind utility มาตรฐานที่ไม่ถูก override** (precedent จริง: `SalesChartCard.tsx` ใช้ `text-4xl`) ไม่ใช่ arbitrary value (ไม่มีวงเล็บเหลี่ยม ไม่ hardcode px) — ปลอดภัยตาม HR7

---

## Design decisions + rationale

1. **ลิงก์โปรไฟล์สาธารณะแยกจากชื่อ (จอ A)** — เดิมทั้งชื่อเป็นลิงก์ external; พอทั้งแถวคลิกได้จะมีสองปลายทางซ้อนกันในพื้นที่เดียว
2. **route param เป็น opaque key ไม่ใช่ `Customer.id`** — ลูกค้าจำนวนมากยังไม่มีแถว `Customer` (guest/ออเดอร์เก่า) ถ้าบังคับ `Customer.id` กลุ่มนี้จะกดแถวแล้วไม่มีหน้าให้ไป
3. **ยอดเฉลี่ยหารด้วยจำนวนที่นับเป็นยอดขาย ไม่ใช่ `totalOrders` ดิบ** — กันไม่ให้ตัวเลขลดลงจากการยกเลิกซึ่งไม่ควรกระทบ "ค่าเฉลี่ยต่อบิลที่ขายได้จริง" (HR16 / `domain-term-single-definition.md`)
4. **รายการออเดอร์ไม่ยก `OrderCard.tsx` เต็มรูป** — items/shipping/payment ในบริบท "ดูประวัติทั้งหมดของคนนี้" เป็นข้อมูลซ้ำซ้อน
5. **สรุปตัวเลข 1 ตัวเด่น + 4 ตัวรอง ไม่ใช่การ์ดเท่ากัน 5 ใบ** — ตรงกับ craft-floor "Refuse: same-size cards ... เป็น container ที่ขี้เกียจ"
6. **70/30 สองคอลัมน์บนเดสก์ท็อป** — 1 คอลัมน์ที่ 1440px ทิ้งพื้นที่ขวาว่าง ~55% (anti-slop #9)
7. **ตัวกรอง "ซื้อซ้ำ" ไม่ผูกกับ badge `REGULAR`** (ซึ่งใช้ `completed >= 3`) — เป็นคนละคำถาม ป้ายบนหน้าจอคงเกณฑ์เดิม ตัวกรองใหม่ใช้ raw count

---

## Open questions (ให้ Controller/developer)

1. **ถ้อยคำป้าย `cod_refund`** — `CARRIER_STATUS.cod_refund` มีข้อความว่า "รายการขอเงินคืน" ซึ่ง**ไม่เท่ากับ** "ลูกค้าปฏิเสธรับพัสดุ" ⇒ ต้องยืนยันความหมายจริงกับข้อมูล prod ก่อนตั้งชื่อป้าย (HR16 — ห้ามใช้คำที่กล่าวหาเกินกว่าที่ข้อมูลบอก)
2. **ไอคอนป้ายใหม่** — เสนอ `cash-banknote-off` (ตระกูลเดียวกับ `cash-banknote-move-back` ที่ใช้แล้วใน `iship/status.ts`) แต่ **ยังไม่ยืนยันว่ามีในชุด tabler จริง** — HR12 บังคับให้เช็คก่อนใช้
3. **Endpoint เปิดเผยเบอร์เต็ม** — ต้องมี API ใหม่ ตรวจสิทธิ์เจ้าของร้าน + คืนเบอร์เต็มเฉพาะ request นั้น ไม่ embed ใน RSC payload
4. **Aggregation logic ของจอ B** — ต้อง reuse ตรรกะ group-by-key จากจอ A (ไม่ query ตรงด้วย id) — แนะนำสกัดเป็น shared function
5. **Prefill `/orders/new`** — ยังไม่ยืนยันว่าฟอร์มรองรับ query param เลือกลูกค้าที่มีอยู่แล้ว (`CustomerSelectBlock.tsx`/`CustomerQuickBlock.tsx` อยู่ในฟอร์มนั้น)
6. **ไอคอน FilterDropdown** — `alert-triangle` (ใช้แน่นอนแล้วในระบบ ผ่านตรวจ) / `repeat` (ยังไม่พบการใช้จริง ต้องเช็คก่อน)
7. **ปุ่ม "เปิดแชท" หัวโปรไฟล์** — เสนอ: ออเดอร์ล่าสุดที่มี `conversationId != null`; ลูกค้าที่เคยทักแต่ออเดอร์ไม่ผูกเธรดจะหาไม่เจอ — ยอมรับ gap นี้ไหม

---

## Anti-slop self-check

1. **เฉพาะกับ Deep ไหม** — ใช่: สัญญาณ 2 ชั้น (ร้านนี้ vs ทั้งระบบ) คือแกนของ Positioning เอาไปแปะสินค้าอื่นไม่ได้ เพราะ `buyer-reputation.ts` เป็นข้อมูลข้ามร้านที่ต้องมีแพลตฟอร์มแบบ Deep เท่านั้นถึงมี
2. **มีของเด่นที่สุด 1 อย่างไหม** — จอ A: ไอคอนสัญญาณเตือน (แถวไม่มีสัญญาณไม่มีไอคอนเลย) · จอ B: กล่อง `border-s-3 border-warning` เมื่อมีสัญญาณ / ยอดซื้อสะสม `text-3xl` เมื่อไม่มี
3. **อะไรถูกตัดทิ้ง** — items/shipping/payment ในรายการออเดอร์จอ B · badge `REGULAR/NEW` ออกจากตัวกรอง (ใช้ raw count แทน)
4. **State ครบไหม** — empty 2 แบบ, loading, error (flag เป็นหนี้), ชื่อยาว, ตัวเลข 0/หลักล้าน, ไม่มีเธรด, ไม่มีที่อยู่, vertical ไม่มีแกนที่อยู่
5. **copy ตรงกับที่ระบบทำได้จริงไหม** — ปุ่ม "เปิดแชท" ไม่ render เมื่อไม่มีเธรด (ไม่ใช่ disabled ที่หลอกว่ามีแต่กดไม่ได้) · badge ใช้คำเป็นกลาง ไม่กล่าวหา
6. **คำเดียวกันหมายถึงของเดียวกันไหม** — "ยกเลิก" ในสรุปตัวเลขกับ badge เป็นตัวเลขเดียวกันจาก `summarizeCustomerBehavior` · "สำเร็จ/ยกเลิก" ในรายการออเดอร์ใช้ `ORDER_STATUS_META` ตัวเดียวกับทุกหน้า
7. **สีถูกความหมายไหม** — สัญญาณเตือน = `warning` เท่านั้น · "รับของ" = `success` เพราะยืนยันแล้วจริง
8. **แตะได้จริงบนมือถือไหม** — ปุ่มทั้งหมด `size-11` (44px) บนมือถือ
9. **คอลัมน์ว่างที่ 1440** — แก้ด้วย 70/30 (จอ B); จอ A เป็นตารางเต็มความกว้าง `.card` อยู่แล้ว

---

## ไฟล์ที่เกี่ยวข้อง (สำหรับ developer)

- `customers/page.tsx` — แก้: `searchParams` (`q`/`warn`/`repeat`), `firstOrderISO`, `cancelledTotal`, behavior badges precompute
- `customers/components/CustomerTable.tsx` — แก้ใหญ่: client-filter → URL-query-filter (`useSearchParams`/`useRouter` + `useListBusy`), ไอคอนสัญญาณ, ปุ่ม eye, แยกลิงก์ external, `onRowClick`
- `customers/components/data.ts` — แก้: เพิ่ม field ใหม่
- `customers/[id]/page.tsx` · `loading.tsx` · `components/*` — ใหม่
- `src/lib/customer-behavior.ts` — เพิ่ม badge key ใหม่เมื่อมีนิยามยืนยันแล้ว
- `CustomerPanel.tsx` + `BuyerReputationRow.tsx` — อ่านเพื่อ reuse ตรง ๆ (ไม่แก้ นอกจากเพิ่มลิงก์ "ดูโปรไฟล์เต็ม")
- `src/components/table/DataTable.tsx` — ใช้ `onRowClick` ที่มีอยู่ (ไม่แก้)
- `orders/components/OrderCard.tsx` + `products/components/ProductCard.tsx` — อ่านเพื่อ copy stretched-link
