# Spec — หน้ารายการสินค้า seller บนมือถือ (การ์ดแยกใบแบบเดียวกับ `/orders`)

> สถานะ: **DEPLOYED PROD 2026-08-06** (`d428e0b2` + `988dcf18` → `main` `4e21f293`)
> ที่มา: user ส่งภาพหน้าจอ 2 ใบ (`/products` มือถือ vs `/orders` มือถือ) แล้วสั่งว่า
> *"re-design หน้าสินค้าใน Mobile ให้คล้าย หรือใช้งานง่ายเหมือนหน้ารายการคำสั่งซื้อ"*
> Gate: `safepay-ux` (Design Spec + delta หลัง user เคาะ open questions 4 ข้อ) → `safepay-developer` → Controller
> หนี้: **browser QA ยังไม่เคยกดจริง** (user รับไปเช็คเองบน prod)

---

## 1. ปัญหา — ต้นเหตุคือสถาปัตยกรรม ไม่ใช่การจัดสไตล์

หน้าเดิมบนมือถือใช้ `mobileCard` prop ของ `DataTable` ซึ่ง **ตั้งใจไม่ให้แถวมี `.card` ของตัวเอง**
(คอมเมนต์ในโค้ด `DataTable`: *"row-card มีขอบ = nested cards"*) เพราะทั้งตารางถูกครอบด้วย `.card`
ใบใหญ่อยู่แล้ว ผลที่ผู้ใช้เห็น:

| อาการที่ user รายงาน | สาเหตุ |
|---|---|
| ชื่อสินค้าถูกตัดด้วย `…` เกือบทุกแถว | ปุ่ม 3 ปุ่ม (ปักหมุด/แก้ไข/ลบ) กินความกว้างเกือบครึ่งจอ |
| ปุ่มลบสีแดงเด่นที่สุดในแถว | ลำดับชั้นกลับด้าน — ปุ่มทำลายมีน้ำหนักสายตาสูงกว่า action หลัก |
| กวาดตาหาสินค้ายาก | ทุกแถวหน้าตาเหมือนกันหมด ไม่มี anchor ให้สายตา |
| ไม่รู้ว่ามีสินค้าสถานะไหนกี่ชิ้น | ชิปกรองไม่มีตัวเลขนับ |
| ช่องค้นหาแคบ | ปุ่ม "เพิ่ม" แบบมีข้อความเบียดอยู่ข้าง ๆ |

**ทางแก้ที่ถูกคือย้ายมือถือออกมาอยู่นอก `.card` แม่ทั้งหมด** (แบบที่ `/orders` ทำ) ไม่ใช่ปรับแต่ง
ภายใน `divide-y` row ต่อไป → แยกเป็น `ProductsTable` (เดสก์ท็อป) / `ProductCard` (มือถือ) โดยมี
`ProductsListing` เป็น orchestrator ถือ state ร่วม

---

## 2. โครงการ์ดมือถือ

```
┌─────────────────────────────────────┐  .card + border-s-3 (เขียว=เปิดขาย / เทา=ปิดการขาย)
│▎ ┌────┐  [pin] เสื้อยืดคอกลมสีขาว   ฿360  │  ชั้นหัว
│▎ │IMG │  [icon] สินค้าจับต้องได้  [เปิดขาย]│
│▎ └────┘                                   │
│▎ ┈┈┈┈┈┈┈ border-dashed ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │
│▎ ขายแล้ว 12 ชิ้น · ★4.5 (8)   [✎][📌][⋮] │  ชั้นท้าย
└─────────────────────────────────────┘
```

**2 ชั้น ไม่ใช่ 4 ชั้นแบบ `/orders`** — สินค้าเป็น entity ที่เรียบกว่าออเดอร์มาก (ไม่มี
items/shipping/payment ซ้อนกัน) การบังคับให้มี 4 ชั้นเท่ากันจะทำให้การ์ดสูงเกินจำเป็นและเห็นสินค้า
ต่อจอน้อยลงโดยไม่ได้อะไรเพิ่ม → ก็อป **ภาษาการออกแบบ** (การ์ดแยกใบ · เส้นประคั่น · ลำดับชั้นปุ่ม ·
ตัวนับบนชิป) ไม่ใช่ก็อปจำนวน layer

- กดการ์ด (stretched-link ทับทั้งใบ) → `/products/{id}`; กลุ่มปุ่มยกด้วย `relative z-10`
- ชื่อ `line-clamp-2` · ราคา `shrink-0` + `tabular-nums` · รูปไม่มี → `solar:box-bold-duotone` บน `bg-default-100`
- เรตติ้ง `★x.x (n)` **ขึ้นเฉพาะเมื่อ `reviews > 0`** (ค่า `★0.0 (0)` ซ้ำทุกสินค้าใหม่ ไม่ให้ข้อมูลอะไร)
  แต่ **"ขายแล้ว 0 ชิ้น" ยังแสดง** เพราะเป็นข้อมูลจริงที่มีความหมาย (ยังไม่มีคนซื้อ ≠ ไม่มีข้อมูล)

### ลำดับชั้นปุ่ม (โจทย์หลักของงานนี้)

| ปุ่ม | น้ำหนัก | เหตุผล |
|---|---|---|
| **แก้ไข** (`solar:pen-2-linear`) | **primary filled น้ำเงิน** | แก้ราคา/สต๊อก/รูป = งานที่ทำถี่ที่สุดต่อสินค้า 1 ชิ้นหลังเผยแพร่ (ต่างจาก `/orders` ที่ primary = ส่ง SMS เพราะออเดอร์มี "ดีลที่รอปิด" — สินค้าไม่มี) |
| **ปักหมุด** | outline (`PinToggleButton variant="mobile"`) | resource จำกัด (ส่วนใหญ่ 1 สล็อต) ผู้ขายบางรายไม่ใช้เลย |
| **⋮** | icon outline | เก็บที่เหลือทั้งหมด |

🛑 **ปุ่มลบหายจากการ์ด ย้ายเข้า `⋮` ทั้งหมด** + ต้องผ่าน `pacesConfirm.danger`

### เมนู `⋮`

`ดูรายละเอียด`(eye) → divider → `ปิดการขาย`/`เปิดขาย`(eye-off/eye สลับตาม `isActive`, **ไม่ต้อง confirm**
เพราะย้อนกลับได้ในคลิกเดียว) → divider → `ลบสินค้า`(trash, danger, **ต้อง Swal**)

custom React dropdown (`useState` + click-outside) **ห้าม `hs-dropdown`** — Preline inline-state ค้างกับ
list ที่ lazy-load + filter re-render บ่อย (เหตุผลเดียวกับ `OrderCardMenu`)

---

## 3. 🛑 Toggle เปิด/ปิดขาย ต้อง optimistic `pinnedAt` ไปด้วย

`src/services/product.service.ts:351` มี business rule เดิมอยู่แล้ว (BR-PIN-11 auto-unpin):

```ts
if (data.isActive === false) scalarUpdate.pinnedAt = null
```

**แต่** `PATCH /api/products/[id]` ตอบด้วย `serializeProduct()` ซึ่ง **ไม่มี field `pinnedAt` เลย** →
client ไม่มีทางรู้จาก response ว่า pin หลุดไปแล้ว ถ้าไม่คำนวณเอง **การ์ดจะค้างไอคอนปักหมุด + badge
"ปักหมุด n/m" ผิดจนกว่าจะรีโหลดหน้า**

```
handleActiveToggle(id, next):
  willAutoUnpin = !next && target.pinnedAt !== null
  optimistic: isActive=next, pinnedAt = willAutoUnpin ? null : เดิม
              + pinnedCount-- (เฉพาะ willAutoUnpin)
  PATCH → !ok: rollback ทั้ง 3 ค่า + pacesToast.error
        →  ok: pacesToast.success + router.refresh()
```

หลักการทั่วไป: **response ที่ไม่มี field นั้น ≠ field นั้นไม่เปลี่ยน** — ถ้า service มีกฎที่แก้ field
อื่นในทรานแซกชันเดียวกัน client ต้องรู้กฎนั้นด้วย หรือไม่ก็ต้องให้ serializer คืน field มา

---

## 4. Sticky header + full-screen mode

```
[← /dashboard] [🔍 ค้นหาสินค้า...     ] [▤ filter] [🔔 bell] [+ เพิ่ม]
[📌 ปักหมุด 0/1] [ทั้งหมด 24][เปิดขาย 18][ปิดการขาย 6] →
```

- ก็อปลำดับ 4 ตัวแรกจาก `OrdersList.tsx` เป๊ะ · back = `<Link href="/dashboard">` **ไม่ใช่ `router.back()`**
- **ปุ่ม `+ เพิ่มสินค้า` ต้องมี** — full-screen ซ่อน `SellerBottomNav` ทั้งก้อน FAB จึงหายไปด้วย
  (ดู `docs/conventions/seller-action-placement.md` §5.1)
- ปุ่ม filled สีน้ำเงินในหัวหน้ามีได้ **ปุ่มเดียว** = ปุ่มเพิ่ม (One Voice Rule)
- safe-area บน: `pt-[calc(1.5rem+env(safe-area-inset-top))]` — carve-out ที่มี comment กำกับ เพราะ
  `SellerMobileHeader` return null สำหรับหน้านี้ ไม่มีใครรับ inset แทน
- **ตัวนับชิปมาจาก `data` ทั้งชุดเสมอ ไม่ผูกกับคำค้น** และมาจาก symbol เดียว (`chipCount`)

### ไฟล์ที่ทำให้ full-screen ทำงาน

| ไฟล์ | สิ่งที่แก้ |
|---|---|
| `_shared/SellerBottomNav.tsx` | เพิ่ม `pathname === '/products'` เข้า hide condition — **exact match** ห้ามกระทบ `/products/{id}` |
| `src/assets/css/safepay-overrides.css` | `:has(.orders-fullbleed)` → `:has(.orders-fullbleed, .products-fullbleed)` (comma-list ห้าม duplicate rule) |
| `ProductsListing.tsx` | wrapper `products-fullbleed -mx-4 md:mx-auto md:max-w-2xl` |
| `_shared/SellerMobileHeader.tsx` | เพิ่ม `/products` เข้า null-branch (ไม่งั้น header ซ้อน 2 ชั้น) |
| รายการการ์ด | `mt-3 space-y-3` **ไม่มี `px-*`** — `.card` สร้างระยะห่างจากขอบเอง |

---

## 5. เดสก์ท็อป — ไม่แตะ layout/คอลัมน์ เปลี่ยน 3 จุด

1. ปุ่มลบ: `DeleteConfirmationModal` + `data-hs-overlay` (HSOverlay ดิบ ขัด Hard Rule 8) →
   `pacesConfirm.danger` — ถ้าปล่อยไว้หน้าเดียวกันจะมีวิธียืนยันลบ 2 แบบระหว่างมือถือ/เดสก์ท็อป
2. คอลัมน์ "ประเภท": ถอด `.badge` สี เหลือ icon+text `text-default-600`
3. คอลัมน์ "สถานะ": `text-success` → `text-success-ink` (contrast AA บนพื้น `/15`)

### `TYPE_COLORS` ถูกลบถาวร (One Voice Rule)

badge ประเภทสินค้า 4 สี (primary/info/success/warning) เป็นการใช้สีกับ **การจัดหมวดหมู่** ไม่ใช่ **state** →
สงวนสีไว้กับ `isActive` (เปิดขาย/ปิดการขาย) อย่างเดียว. `TYPE_LABELS` ย้ายไป `data.ts` เป็น
`PRODUCT_TYPE_LABELS` + เพิ่ม `PRODUCT_TYPE_ICONS` (ไอคอนชุดเดียวกับ stat cards ใน `products/page.tsx`)
เพื่อกัน drift ระหว่างมือถือ/เดสก์ท็อป

**ราคาบนการ์ดมือถือเลิกใช้ `text-primary`** ด้วยเหตุผลเดียวกัน → `text-default-900` ตัวหนา
(ความโดดเด่นมาจากขนาด+น้ำหนัก ไม่ใช่สี — ตรงกับที่ `/orders` ทำกับยอดรวมท้ายการ์ด)

---

## 6. Empty / loading

- empty **แยก 3 สาเหตุ** ไม่ใช้ข้อความเดียวกัน: `ยังไม่มีสินค้าในร้าน` (+CTA "+ เพิ่มสินค้าแรก") /
  `ไม่มีสินค้าในสถานะนี้` / `ไม่พบสินค้าที่ค้นหา` — เพราะทางออกคนละทาง (สร้างของใหม่ vs สลับชิป vs ล้างคำค้น)
- lazy-load `IntersectionObserver` PAGE=8 + footer `กำลังโหลด...` / `ครบทุกสินค้าแล้ว ({n})`
- `SellerProductCardSkeleton` (ใหม่ ใน `_shared/SellerCardSkeleton.tsx`) + `loading.tsx` responsive split

---

## 7. Open questions ที่ user เคาะ (2026-08-06)

| # | คำถาม | คำตอบ |
|---|---|---|
| 1 | `/products` เป็น full-screen เหมือน `/orders` ไหม | **ทำเต็มจอ** (ซ่อน nav + back + full-bleed) |
| 2 | เพิ่ม toggle เปิด/ปิดขายใน `⋮` เลยไหม | **เพิ่มเลย** |
| 3 | แก้ `TYPE_COLORS` บนเดสก์ท็อปด้วยไหม | **แก้ทั้งสองที่** |
| 4 | ไอคอนหมุดนำหน้าชื่อ = `tabler:pin-filled` น้ำเงิน? | **ใช้ตัวนั้น** |

---

## 8. ไฟล์

**ใหม่:** `products/components/{ProductCard,ProductCardMenu,ProductsTable}.tsx`
**แก้:** `products/components/{ProductsListing,data}.ts(x)` · `products/loading.tsx` ·
`_shared/{SellerCardSkeleton,SellerBottomNav,SellerMobileHeader}.tsx` · `src/assets/css/safepay-overrides.css` ·
`orders/components/OrdersList.tsx` (บั๊กปุ่มสร้างออเดอร์ — คอมมิตแยก `988dcf18`)

**Base:** `theme/paces/Admin/TS/src/assets/css/custom/_card.css` · `_dropdown.css` ·
`theme/paces/.../ecommerce/(products)/products/components/ProductsListing.tsx`
**Structural template:** `seller/(dashboard)/orders/components/{OrdersList,OrderCard,OrderCardMenu}.tsx`

---

## 9. หนี้ที่ยังค้าง

- **browser QA ทั้งหน้า** — ไม่เคยกดจริงสักครั้ง (user รับไปเช็คบน prod 2026-08-06)
  จุดเสี่ยงที่ static ตรวจไม่ได้: (ก) ปุ่ม 3 ปุ่มท้ายการ์ดกับ stretched-link ทับทั้งใบ — นิ้วจริงอาจ
  กดโดนลิงก์การ์ดแทนปุ่ม (ข) เมนู `⋮` ที่เด้งขึ้นบน (`bottom-full`) ในการ์ดใบแรกอาจโดนหัว sticky บัง
- E2E Playwright
- `/orders` มือถือยังเข้าไม่ถึง "ดึงจาก iShip" (desktop-only มาแต่เดิม ไม่เคยอยู่ใน FAB — คนละเรื่องกับบั๊กที่แก้)
