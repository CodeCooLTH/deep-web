# Product types & order capabilities — extensible design

> **Goal:** ระบบรองรับสินค้าหลายประเภท (จัดส่ง / ไม่จัดส่ง / รายเดือน-รายปี) โดยขยาย type ใหม่ในอนาคตได้โดยไม่ต้องเปลี่ยน schema
>
> **Reframe หลัก:** ไม่ใช่ "type ละชุด field" แต่เป็น **2 capability axes** ที่ orthogonal กัน — fulfillment กับ billing — type เป็นแค่ "ปุ่มลัด" ที่ตั้ง capability flags ให้
>
> **Approach:** Type registry ในแอพ (TS config-driven, Approach A จาก brainstorm)
>
> **Status:** Spec — รอ user review ก่อนเข้าขั้น writing-plans

---

## 1. ปัญหา & เป้าหมาย

ระบบปัจจุบันมี `Product.type ∈ {PHYSICAL, DIGITAL, SERVICE}` แต่:
- ทุก type ใช้ form หน้าตาเดียวกัน — type เป็นแค่ label, ไม่ได้ขับ flow
- Order flow บังคับ shipping address concept แม้ DB allow optional แล้ว
- ไม่มี recurring billing — ตัวแทนประกัน / membership / subscription ใช้ไม่ได้
- เพิ่ม type ใหม่ = แก้ enum hardcode 3 ที่ (Yup, Valibot, picker)

**เป้าหมาย:**
1. Order flow รู้จัก "จัดส่ง" vs "ไม่จัดส่ง" → hide address conditional
2. Order flow รู้จัก "ครั้งเดียว" vs "เป็นรอบ" → recurring tracking
3. เพิ่ม type ใหม่ = แก้ TS file 1 ที่ (registry) → frontend/backend pickup auto
4. Backward-compat 100% — ของเดิมต้องทำงานต่อโดยไม่ต้องแก้

**Non-goals (Phase นี้):**
- Auto-charge / payment gateway integration สำหรับ recurring (manual rebill โดย seller)
- Insurance domain modeling (policy/claim/beneficiary) — ตัวแทนประกันใช้ระบบ recurring billing ทั่วไปก็พอ
- DB-driven category templates (Approach C) — เก็บไว้เป็น future upgrade ถ้าต้องการให้ user สร้าง type เอง

---

## 2. Reframe — 2 Capability axes

แทนที่จะคิดเป็น "type → field set", คิดเป็น **2 flags อิสระ** ที่ขับ flow ทั้งระบบ:

### Axis 1: `fulfillmentMode`
| Value | ความหมาย | ผลต่อ flow |
|---|---|---|
| `SHIPPED` | ต้องจัดส่งของจริงไปที่ลูกค้า | Order ต้องมี shippingAddress, มี ShipmentTracking, OMS ต้อง track ส่งถึง |
| `NO_SHIPPING` | ไม่ต้องส่งของ (ดิจิทัล/บริการ/ประกัน) | Order ไม่ต้องมี address, ไม่ต้อง track shipment, จบที่ buyer OTP confirm |

### Axis 2: `billingMode`
| Value | ความหมาย | ผลต่อ flow |
|---|---|---|
| `ONE_TIME` | จ่ายครั้งเดียว | 1 product = 1 order (เหมือนปัจจุบัน) |
| `RECURRING` | เก็บเป็นรอบ | Order = subscription cycle, มี `subscriptionId` group, seller บันทึก cycle ถัดไป manual |

**Independence:** 2 flags อิสระต่อกัน → 4 combos:

| Combo | ตัวอย่าง use case |
|---|---|
| SHIPPED + ONE_TIME | สินค้าจริง (ตลาด, แฟชัน, อาหาร) |
| NO_SHIPPING + ONE_TIME | โค้ด Steam, ไอเทมเกม, บริการตัดผม, ที่ปรึกษา |
| NO_SHIPPING + RECURRING | ประกัน, สมาชิก gym, Netflix-clone, course รายเดือน |
| SHIPPED + RECURRING | Sub box รายเดือน, นิตยสาร, อาหารส่งประจำ |

---

## 3. Type registry (SSOT) — Approach A

### 3.1 Why registry

- **Single source of truth** — frontend form, backend Valibot, type picker, future filter UI ใช้ตัวเดียวกัน
- **Extensible** — เพิ่ม type = แก้ 1 file ใน TS, ไม่ต้อง migrate DB
- **Type-safe** — `ProductTypeId = keyof typeof PRODUCT_TYPES` → autocomplete + compile-time check
- **Capability presets** — type แต่ละตัว default capability flags ให้ user

### 3.2 Registry shape

ไฟล์ใหม่: `src/lib/product-types/registry.ts`

```ts
import * as v from 'valibot'

export type FulfillmentMode = 'SHIPPED' | 'NO_SHIPPING'
export type BillingMode = 'ONE_TIME' | 'RECURRING'
export type BillingPeriod = 'MONTHLY' | 'YEARLY' | 'CUSTOM'

export type ProductTypeMeta = {
  id: string                              // 'PHYSICAL' | 'DIGITAL' | ...
  emoji: string                           // '📦'
  label: string                           // 'ของจริง'
  ariaLabel: string                       // 'สินค้าต้องจัดส่ง'
  description: string                     // 1-line อธิบาย
  // Capability presets (default — user override ผ่าน "ตั้งค่าขั้นสูง" ได้)
  defaults: {
    fulfillmentMode: FulfillmentMode
    billingMode: BillingMode
    billingPeriod?: BillingPeriod         // เฉพาะถ้า RECURRING
  }
  // Optional copy override สำหรับ base fields (เปลี่ยน label "ราคา" → "ค่าสมาชิก/เดือน" ฯลฯ)
  baseOverrides?: Partial<{
    name: { label?: string; placeholder?: string; help?: string }
    price: { label?: string; placeholder?: string; help?: string; unit?: string }
    description: { label?: string; placeholder?: string }
    images: { label?: string; help?: string; required?: boolean }
  }>
}

export const PRODUCT_TYPES = {
  PHYSICAL: {
    id: 'PHYSICAL', emoji: '📦', label: 'ของจริง',
    ariaLabel: 'สินค้าต้องจัดส่ง',
    description: 'ส่งของจริงให้ลูกค้า',
    defaults: { fulfillmentMode: 'SHIPPED', billingMode: 'ONE_TIME' },
  },
  DIGITAL: {
    id: 'DIGITAL', emoji: '💻', label: 'ดิจิทัล',
    ariaLabel: 'สินค้าดิจิทัล',
    description: 'ส่งเป็นไฟล์ ลิงก์ หรือโค้ด',
    defaults: { fulfillmentMode: 'NO_SHIPPING', billingMode: 'ONE_TIME' },
  },
  SERVICE: {
    id: 'SERVICE', emoji: '🛠️', label: 'บริการ',
    ariaLabel: 'การให้บริการ',
    description: 'งานบริการ ทำให้ลูกค้าครั้งเดียว',
    defaults: { fulfillmentMode: 'NO_SHIPPING', billingMode: 'ONE_TIME' },
  },
  SUBSCRIPTION: {
    id: 'SUBSCRIPTION', emoji: '🔁', label: 'สมาชิก/รอบ',
    ariaLabel: 'บริการเป็นรอบหรือสมาชิก',
    description: 'เก็บเงินเป็นรอบ — ประกัน, สมาชิก, ค่าบริการรายเดือน',
    defaults: { fulfillmentMode: 'NO_SHIPPING', billingMode: 'RECURRING', billingPeriod: 'MONTHLY' },
    baseOverrides: {
      price: { label: 'ค่าบริการต่อรอบ', unit: 'บาท', help: 'จะเปลี่ยนเป็น บาท/เดือน หรือ บาท/ปี ตามรอบที่เลือก' },
    },
  },
} as const satisfies Record<string, ProductTypeMeta>

export type ProductTypeId = keyof typeof PRODUCT_TYPES
export const PRODUCT_TYPE_IDS = Object.keys(PRODUCT_TYPES) as ProductTypeId[]

// ใช้ใน Yup + Valibot picklist — derive ครั้งเดียวจาก registry
export const FULFILLMENT_MODES = ['SHIPPED', 'NO_SHIPPING'] as const
export const BILLING_MODES = ['ONE_TIME', 'RECURRING'] as const
export const BILLING_PERIODS = ['MONTHLY', 'YEARLY', 'CUSTOM'] as const
```

### 3.3 Decision: ทำไมไม่มี per-type extra fields?

ตามที่คุยใน brainstorm — user ไม่ได้ต้องการ insurance-specific schema. ปัญหาที่จะแก้คือ **flow** (จัดส่ง vs ไม่จัดส่ง, ครั้งเดียว vs เป็นรอบ) — ไม่ใช่ **field set**. metadata เพิ่มเติม (เช่น duration, serviceMode) ถ้าต้องการเก็บได้ใน `Product.attributes Json` ที่มีอยู่แล้ว — ไม่ต้องบังคับเป็น schema ของแต่ละ type

ในอนาคตถ้าจริงจัง per-type fields ค่อยขยาย registry ให้มี `extraFields: FieldDef[]` (design ทิ้งช่องไว้ใน Section 3.2) — Phase นี้ไม่ทำ

---

## 4. Schema changes

### 4.1 Product

```prisma
model Product {
  // ... existing fields คงเดิม ...
  type             String   @default("PHYSICAL")        // (existing — ขยาย enum string ในแอพ)

  // NEW — capability flags
  fulfillmentMode  String   @default("SHIPPED")          // SHIPPED | NO_SHIPPING
  billingMode      String   @default("ONE_TIME")         // ONE_TIME | RECURRING
  billingPeriod    String?                               // MONTHLY | YEARLY | CUSTOM (null ถ้า ONE_TIME)
  billingPeriodDays Int?                                 // for CUSTOM (เช่น 7 = รายสัปดาห์)
}
```

**Migration mapping สำหรับ row เดิม** (data migration ใน same migration file):
```sql
-- map type เดิม → capability ที่สื่อความหมายตรง (ไม่ใช่ "default ทั้งหมด = SHIPPED")
UPDATE "Product" SET "fulfillmentMode" = 'SHIPPED',     "billingMode" = 'ONE_TIME' WHERE "type" = 'PHYSICAL';
UPDATE "Product" SET "fulfillmentMode" = 'NO_SHIPPING', "billingMode" = 'ONE_TIME' WHERE "type" IN ('DIGITAL', 'SERVICE');
UPDATE "Order"   SET "fulfillmentMode" = 'SHIPPED',     "billingMode" = 'ONE_TIME' WHERE "type" = 'PHYSICAL';
UPDATE "Order"   SET "fulfillmentMode" = 'NO_SHIPPING', "billingMode" = 'ONE_TIME' WHERE "type" IN ('DIGITAL', 'SERVICE');
```
column default ยังเป็น `SHIPPED + ONE_TIME` สำหรับ row ใหม่ (ป้องกัน null), แต่ data migration ปรับให้ DIGITAL/SERVICE map ตรงกับ semantic ที่ user ตั้งใจ

### 4.2 Order

```prisma
model Order {
  // ... existing fields คงเดิม ...
  type             String   @default("PHYSICAL")        // (existing)
  shippingAddress  Json?                                 // (existing — already optional ✓)

  // NEW — capability snapshot ที่ copy มาจาก product ตอน order create
  fulfillmentMode  String   @default("SHIPPED")
  billingMode      String   @default("ONE_TIME")

  // NEW — recurring tracking
  subscriptionId   String?                               // group orders ของ subscription เดียวกัน
  cycleNo          Int?                                  // 1, 2, 3, ...
  nextBillingAt    DateTime?                             // due date ของ cycle ถัดไป (UI ใช้แสดง "อีก 5 วันถึงครบ")

  @@index([subscriptionId])                              // dashboard query active subs
}
```

**Decision: ไม่สร้าง `Subscription` model แยก (Approach a)** — ใช้ `subscriptionId` string + group ผ่าน index. ถ้า MVP โตจริง ค่อย extract เป็น model (Approach b) ใน phase ถัดไป

**Order.status state machine — ไม่เปลี่ยน** (`order.service.ts:6-8` confirmed):
- `CREATED → CONFIRMED → SHIPPED → COMPLETED` (สำหรับ SHIPPED order)
- `CREATED → CONFIRMED → COMPLETED` (สำหรับ NO_SHIPPING order — state machine เดิมรองรับอยู่แล้ว ใช้กับ DIGITAL/SERVICE ปัจจุบัน)
- `CANCELLED` (จาก CREATED หรือ CONFIRMED)
- **RECURRING ใช้ state machine นี้ per cycle** — แต่ละ Order (cycle) ผ่าน lifecycle เดิม

**Subscription state — derived (ไม่มี column ใหม่ใน MVP):**
- "Active subscription" = มี Order ที่ subscriptionId เดียวกันที่ยังอยู่ใน CREATED/CONFIRMED หรือมี `nextBillingAt > now()`
- "Inactive/Cancelled" = ไม่มี active cycle + ไม่มี `nextBillingAt` ที่ยังไม่ถึง
- Cancel/pause UI ใน MVP = "ไม่กดบันทึก cycle ถัดไป" → subscription auto-stale (Phase 5 ค่อยใส่ explicit cancel/pause action — ดู open question #1)

---

## 5. Order flow matrix

| Combo | Order create | Public `/o/[token]` | Completion |
|---|---|---|---|
| **SHIPPED + ONE_TIME** | กรอก address + items | OTP confirm + review + แสดง tracking | seller ใส่ tracking → status SHIPPED → COMPLETED |
| **NO_SHIPPING + ONE_TIME** | กรอกแค่ items + buyerContact (skip address) | OTP confirm + review (ไม่มี shipping section) | review เสร็จ = COMPLETED ทันที |
| **NO_SHIPPING + RECURRING** | สร้าง subscription (1st cycle) → cycleNo=1 + subscriptionId | cycle 1 = OTP confirm + review → status ACTIVE | seller "+ บันทึก cycle ถัดไป" → สร้าง Order ใหม่ link subscriptionId, cycleNo+1, ส่ง link ใหม่ให้ลูกค้า |
| **SHIPPED + RECURRING** | เหมือน NO_SHIPPING+RECURRING + กรอก address (default = address cycle ก่อน) | เหมือนข้างบน + แสดง tracking ของ cycle นั้น | เหมือนข้างบน |

**Trust score impact (จาก CLAUDE.md):**
- Review per **cycle** ไม่ใช่ per subscription → recurring run นานคนซื้อให้ rating หลายรอบได้ → trust score ของ seller ขึ้นเรื่อยๆ
- ไม่ต้องเปลี่ยน trustscore.service — ทำงานเดิม (อ่านจาก Order/Review)

---

## 6. Form / UX impact

### 6.1 ProductFormV2 — ลำดับ card

```
┌─────────────────────────────────────────┐
│ 1. ImagesCardV2          (existing)     │
│ 2. BasicCardV2           (existing)     │
│ 3. ShortDescCardV2       (existing)     │
│ 4. PriceCardV2           (existing)     │  ← copy เปลี่ยนตาม billingMode (registry override)
│ 5. TypePickerCardV2      (modify)       │  ← เพิ่ม preset 🔁 SUBSCRIPTION
│ 6. CapabilityCardV2      (NEW)          │  ← collapsed "ตั้งค่าขั้นสูง" — fulfillment + billing override
│ 7. BillingPeriodCardV2   (NEW, cond.)   │  ← show เฉพาะ billingMode=RECURRING
│ 8. TagsCardV2            (existing)     │
│ 9. AttributesCardV2      (existing)     │
│ 10. DescriptionCardV2    (existing)     │
└─────────────────────────────────────────┘
```

### 6.2 TypePickerCardV2 — modify

ปัจจุบัน 3 pills (Physical/Digital/Service) — ขยายเป็น 4:
- เลือก type → set capability flags ใน RHF state ผ่าน `setValue('fulfillmentMode', ...)` + `setValue('billingMode', ...)` ตาม `PRODUCT_TYPES[type].defaults`
- pill list อ่านจาก `PRODUCT_TYPE_IDS` — เพิ่ม type ใหม่ใน registry pickup auto

### 6.3 CapabilityCardV2 — NEW (collapsed by default)

```
┌────────────────────────────────────────┐
│ ⚙️ ตั้งค่าขั้นสูง               [▼]  │
├────────────────────────────────────────┤
│ การจัดส่ง                              │
│  ◯ ต้องจัดส่ง   ◯ ไม่ต้องจัดส่ง        │
│                                        │
│ การเก็บเงิน                            │
│  ◯ ครั้งเดียว   ◯ เก็บเป็นรอบ          │
└────────────────────────────────────────┘
```

ป้าๆ ส่วนใหญ่ใช้ default ของ type ผ่านได้ — advanced user override ได้ (เช่น sub box: pick SUBSCRIPTION → override fulfillment เป็น SHIPPED)

### 6.4 BillingPeriodCardV2 — NEW (conditional)

แสดงเฉพาะเมื่อ `billingMode === 'RECURRING'`:
- 3 pills: รายเดือน / รายปี / กำหนดเอง
- ถ้า "กำหนดเอง" → number input "ทุกๆ X วัน" (`billingPeriodDays`)

### 6.5 PriceCardV2 — copy เปลี่ยนตาม registry

```ts
// inside PriceCardV2
const meta = PRODUCT_TYPES[type]
const billingPeriod = watch('billingPeriod')
const priceLabel = (() => {
  if (billingMode === 'RECURRING') {
    if (billingPeriod === 'MONTHLY') return 'ค่าบริการ (บาท/เดือน)'
    if (billingPeriod === 'YEARLY') return 'ค่าบริการ (บาท/ปี)'
    return 'ค่าบริการต่อรอบ (บาท)'
  }
  return meta.baseOverrides?.price?.label ?? 'ราคา (บาท)'
})()
```

### 6.6 OrderCreateForm — modify

ปัจจุบัน: items + buyerContact, ไม่มี shipping address capture
- เพิ่ม `<ShippingAddressSection>` ที่ render เมื่อ **มี item ใดๆ** ที่ product มี `fulfillmentMode === 'SHIPPED'`
- ถ้าทุก item เป็น `NO_SHIPPING` → hide section, copy "ไม่ต้องจัดส่ง — แค่ส่ง OTP ให้ลูกค้ายืนยัน"
- ถ้า items mixed (บางอันส่ง บางอันไม่ส่ง) → require address (ใช้สำหรับอันที่ต้องส่ง)
- ถ้าผู้ใช้เลือก SUBSCRIPTION product → header เปลี่ยนเป็น "บันทึก cycle ที่ 1 — ลูกค้าใหม่"

### 6.7 PublicOrderClient (`/o/[token]`) — modify

- `fulfillmentMode === 'NO_SHIPPING'` → hide address section ใน OrderDetailMobile, แสดง "ไม่ต้องจัดส่ง"
- `billingMode === 'RECURRING'` → header แสดง "นี่คือ cycle ที่ {cycleNo}" + ลิงก์ดู cycle ก่อนหน้าของ subscription เดียวกัน
- Review flow ไม่เปลี่ยน — รับ review per cycle

### 6.8 RecurringDashboardCard — NEW

Seller dashboard widget:
- list active subscriptions (group by `subscriptionId` where status=ACTIVE)
- แต่ละ row: buyer contact, product name, cycleNo ปัจจุบัน, due date (`nextBillingAt`)
- ปุ่ม "+ บันทึก cycle ถัดไป" → modal create new Order linked to subscriptionId

---

## 7. Existing-code audit

ผลตรวจ codebase ก่อนเขียน spec:

### ✅ ใช้ได้เลย (no change)
- `Order.shippingAddress Json?` — optional แล้ว
- `Order.type` + `Product.type` (string) — string field ขยาย enum ในแอพได้
- `Product.attributes Json` — infrastructure พร้อม
- `/o/[token]` page architecture (PhoneUnlock + Review + OrderDetailMobile)
- Tag M:N + autocomplete API
- ProductFormV2 + 8 sub-cards + Preview (scaffold ครบ)
- Service layer structure

### 🔧 ต้องแก้ของเดิม
| File | สิ่งที่แก้ |
|---|---|
| `prisma/schema.prisma` Product | + 4 columns (fulfillmentMode, billingMode, billingPeriod, billingPeriodDays) |
| `prisma/schema.prisma` Order | + 5 columns (fulfillmentMode, billingMode, subscriptionId, cycleNo, nextBillingAt) + index |
| `src/lib/validations.ts:33,66,101` | ลบ hardcoded `['PHYSICAL','DIGITAL','SERVICE']` → import `PRODUCT_TYPE_IDS` จาก registry. เพิ่ม optional capability fields ใน CreateProductSchema/UpdateProductSchema/CreateOrderSchema. CreateOrderSchema เพิ่ม optional shippingAddress + recurring fields |
| `src/app/(paces)/seller/(dashboard)/products/components/ProductFormV2.tsx:54` | Yup `.oneOf` → derive จาก registry |
| `ProductFormV2.tsx:141-150` | body POST/PATCH ใส่ capability fields |
| `ProductTypePickerCardV2.tsx:17-26` | OPTIONS array → derive จาก registry, +SUBSCRIPTION |
| `OrderCreateForm.tsx` | + ShippingAddressSection (conditional) |
| `src/app/api/products/route.ts` + `[id]/route.ts` | persist capability fields |
| `src/app/api/orders/route.ts` | persist shippingAddress + capability + recurring |
| `src/services/product.service.ts` | SerializedProduct + DTO mappers รวม capability |
| `src/app/(marketing)/o/[token]/PublicOrderClient.tsx` + `OrderDetailMobile.tsx` | conditional rendering |
| `ProductPreviewPanel.tsx` | แสดง capability hint ใน preview |

### ➕ ต้องสร้างใหม่
| File | จุดประสงค์ |
|---|---|
| `src/lib/product-types/registry.ts` | SSOT registry |
| `src/lib/product-types/derive.ts` | helper: deriveCapabilities(typeId) → defaults |
| `ProductCapabilityCardV2.tsx` | "ตั้งค่าขั้นสูง" override |
| `ProductBillingPeriodCardV2.tsx` | conditional period picker |
| `ShippingAddressSection.tsx` | ใน OrderCreateForm conditional |
| `RecurringDashboardCard.tsx` | seller dashboard subscription list |
| `src/services/subscription.service.ts` | helper สำหรับ "create next cycle" |
| `src/app/api/orders/[token]/next-cycle/route.ts` | POST endpoint สร้าง cycle ถัดไป |

---

## 8. Phasing — P1 → P5

| Phase | Scope | Shippable? | Est. |
|---|---|---|---|
| **P1: Schema + registry** | Migration เพิ่ม columns, registry.ts, validations.ts ใช้ registry, defaults ตรงกับ behavior เดิม → ของเก่าไม่กระทบ | ✅ | 0.5 day |
| **P2: ProductFormV2 — capability picker** | TypePickerCardV2 +SUBSCRIPTION, CapabilityCardV2, BillingPeriodCardV2, PriceCardV2 copy เปลี่ยน, API persist | ✅ — ผู้ใช้เริ่มสร้าง product ที่มี capability ครบได้ | 1 day |
| **P3: Order flow — NO_SHIPPING** | OrderCreateForm ShippingAddressSection conditional, PublicOrderClient hide address ถ้า NO_SHIPPING, OMS skip tracking | ✅ — ขายของไม่จัดส่งครบ flow | 1 day |
| **P4: Order flow — RECURRING** | subscriptionId/cycleNo logic, RecurringDashboardCard, "+ บันทึก cycle ถัดไป" action, public page cycle context | ✅ — ตัวแทนประกัน/membership ใช้ได้ | 1.5 days |
| **P5: Polish** | Empty states + copy, RecurringDashboardCard refinement, edge cases (cancel, pause), trust score per cycle verify | ✅ — production ready | 1 day |

**Recommend ship: P1+P2 ก่อน** (1.5 day) → ได้ feature "สร้างสินค้าหลายประเภท + capability flags" พร้อมใช้งาน, P3-P5 ทยอยตาม

**Out-of-band:** UI ใน P2-P5 ทุกหน้าต้องตามกฎ Hard Rule #1 — copy จาก Paces theme. ระบุ Base file ทุก component (อิง spec V1 `2026-05-01-product-create-redesign-design.md` สำหรับ pattern)

---

## 9. Open questions

ก่อนเข้า writing-plans ขอ confirm:

1. **Subscription cancel/pause UI** — Phase 4 ต้องมี action ให้ seller cancel/pause subscription ไหม? หรือแค่ "ไม่บันทึก cycle ถัดไป" = พอ?
2. **Public order page recurring** — ลูกค้าควรเห็น link ไป cycle ก่อนหน้าของตัวเองไหม (history)? หรือแยก review per cycle เดี่ยวๆ?
3. **Migration mapping** — Spec section 4.1 mapping: `PHYSICAL → SHIPPED+ONE_TIME`, `DIGITAL/SERVICE → NO_SHIPPING+ONE_TIME`. ตรงกับที่ user คาดหวังไหม? (ถ้ามี product/order DIGITAL/SERVICE ที่ตั้งใจส่งของจริงอยู่ — ต้องระบุก่อน migrate)
4. **Auto-charge** — confirm Phase นี้ NOT in scope (manual rebill) ใช่ไหม?
5. **API rename** — `Order.type` field อาจสับสนกับ `fulfillmentMode/billingMode` ใหม่. คงไว้เพื่อ backward-compat หรือ deprecate?

---

## 10. Out of scope (Phase นี้)

- Auto-charge / payment gateway integration
- Insurance domain modeling (policy, claim, beneficiary)
- DB-driven category templates (Approach C)
- Per-type extra fields ที่บังคับ schema (เก็บไว้ใน `attributes Json` ก่อน)
- Seller-facing analytics ของ subscription (LTV, churn rate ฯลฯ)
- Buyer-facing "manage subscriptions" page (ลูกค้าจัดการ sub ตัวเอง)
