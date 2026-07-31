# Design Spec v2 — รายละเอียดคำสั่งซื้อ (seller)

- **หน้า:** `src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx` + `components/`
- **Mockup ล่าสุด (v3):** `docs/superpowers/specs/2026-07-30-seller-order-detail-v3-mockup.html` (Mobile 390 / Tablet 768 / Desktop 1440 + สลับได้ 4 สถานะ)
- **Mockup v2 (ไม่ผ่าน — เก็บไว้เทียบ):** `...-v2-mockup.html`
- **วันที่:** 2026-07-30 · **สถานะ:** รอ user review (ยังไม่แตะโค้ด)
- **Mode:** Operate (`~/.claude/skills/impeccable/reference/operate.md`)
- **ที่มา:** รอบก่อน (`b271c2ea`, deploy prod แล้ว) ปรับการ์ดบนโครงเดิม ไม่ได้ source layout จาก theme → Impeccable critique 26/40. รอบนี้ตั้งต้นใหม่จาก Paces theme file จริง

> 🛑 **v2 ไม่ผ่าน user review** — เหตุผล: "ข้อมูลกระจัดกระจาย ไม่ลำดับความสำคัญ · ปุ่มกระจายไปทั่ว · focus ยาก"
> §1/§2/§6 (theme analysis · source mapping · copy) ยังใช้ได้ทั้งหมด — **§3/§5/§7 ถูกแทนด้วย §12 (v3)** ท้ายไฟล์

---

## 1. Theme analysis — Paces กำหนดอะไรไว้จริง

โครงหน้ามาจาก `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/page.tsx`:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-4 gap-base">
  <div className="space-y-base lg:col-span-3">…</div>
  <div className="space-y-base">…</div>
</div>
```

**สิ่งที่ verify แล้วและต่างจากที่ทีมเคยเข้าใจ:**

| เรื่อง | ของจริง | ที่เคยเข้าใจ/ทำผิด |
|---|---|---|
| grid | `lg:grid-cols-4` → **75/25 ที่ 1024px** | comment ในโค้ดเขียน "70/30" |
| tablet 768 | **ยังคอลัมน์เดียว + bottom nav** (ต่ำกว่า `lg`) | คิดว่า tablet = 2 คอลัมน์ |
| `.card` | มีแค่ `shadow` — **ไม่มี border** | mockup รอบก่อนใส่ border |
| `.card-header` | `px-5 py-3.75` + **`border-b border-dashed`** | เส้นทึบ |
| `.badge` | `rounded` **4px** `text-[0.75em]` semibold | pill 999px |
| `.btn` | `rounded` **4px** `px-4 py-1.75 text-sm` | radius 6px |
| `success` | **`#02bc9c`** (เขียวอมฟ้าของ Paces) | `#28C76F` (ของ Vuexy) |
| ตารางสินค้า | stacked list ที่ **`sm` 640** | — |
| gap | `--spacing-base: 20px` | — |
| breakpoint | Tailwind v4 default (640/768/1024) — **ไม่มี override ใน Paces** | — |

**hero:** theme รวม order#/สถานะ/action + ตารางสินค้าไว้ใน `.card` ใบเดียว โดย header ใช้ `p-7.5 block items-start md:flex` (padding พิเศษ ไม่ใช่ `.card-header` มาตรฐาน)

**ส่วนที่ theme ไม่มีให้ → ต้องประกอบจาก primitive (ไม่ใช่คิดเอง):**
- segmented `[ส่งเอง | สร้างพัสดุ iShip]` → Button Group จาก `theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx`
- การ์ดรีวิวเดี่ยว → reviewer-cell จาก `(products)/product-details/components/ProductReviews.tsx` + `.card` shell จาก `CustomerDetails.tsx`
- tracking summary read-only → icon-row (`btn btn-icon bg-light size-6! rounded-full`) + `.badge` จาก `CustomerDetails.tsx`

---

## 2. Theme Source Mapping

| Block | Theme file (verified) | ปรับอะไร |
|---|---|---|
| Page grid | `order-details/page.tsx` | คงเป๊ะ ไม่แก้ class |
| StatusHero | `order-details/components/OrderSummary.tsx` L10-38 | ตัดปุ่ม Modify/Delete → primary+secondary+overflow ตาม state matrix; เพิ่ม next-step + tracking chip |
| Overflow ⋮ | `order-details/components/CustomerDetails.tsx` L30-56 (`hs-dropdown` kebab) | รายการ → "แก้ไขคำสั่งซื้อ" / "ยกเลิกคำสั่งซื้อ" (`text-danger`) |
| Segmented ส่งเอง/iShip | `(admin)/ui/buttons/page.tsx` | คงตามที่ `ShippingCard.tsx` ทำอยู่ (ถูกแล้ว) |
| ข้อมูลผู้ซื้อ | `CustomerDetails.tsx` (avatar L17-29 + icon-list L58-93) | ตัด flag/email/"Since 20XX" (ไม่มี schema) |
| ที่อยู่จัดส่ง | `ShippingAddress.tsx` L24-32 + warning box L41-44 | **ตัด Google Maps iframe ทิ้ง** (พิกัด hardcode NYU — ไม่มี lat/lng ใน schema) |
| รายการสินค้า + breakdown | `OrderSummary.tsx` L39-141 | ตัด Shipping Fee (ไม่มี field); breakdown จาก **array เดียว** |
| การชำระเงิน | `BillingDetails.tsx` L34-46 | แทนบัตรเครดิตด้วย payment-method + sales-channel |
| ประวัติสถานะ | `ShippingActivity.tsx` | **แก้ a11y** (ดู §7) |
| รีวิว | `ProductReviews.tsx` L24-49 | ใช้แค่ cell pattern ตัด DataTable ทิ้ง |

---

## 3. Layout 3 ขนาด

ดู mockup HTML สำหรับของจริง — สรุป:

- **Desktop ≥1024:** sidenav 245px + hero full-width + grid 75/25 · ซ้าย = การจัดส่ง → ผู้ซื้อ → สินค้า → รีวิว · ขวา = การชำระเงิน → ประวัติสถานะ
- **Tablet 768:** ไม่มี sidenav, bottom nav, **คอลัมน์เดียว** (ตารางสินค้ายังเป็น table เพราะ ≥640)
- **Mobile 390:** คอลัมน์เดียว, ตารางสินค้า → stacked list, ปุ่มเต็มความกว้าง `min-h-11`

---

## 4. Information Architecture

หน้านี้ต้องตอบคำถามเดียวก่อน: **"คำสั่งซื้อนี้ต้องทำอะไรต่อ"** ลำดับจึงเรียงตาม *งานที่ค้าง* ไม่ใช่ *หมวดข้อมูล*

1. **StatusHero** — สถานะ + next-step **ประโยคเดียว** (ไม่ใช่แค่ badge) ตอบทันทีไม่ต้องเลื่อน
2. **การ์ด action ที่ค้าง** (ShippingCard) — ใต้ hero **เฉพาะเมื่อมีงานให้ทำ**
3. **ข้อมูลผู้ซื้อ** — seller เปิดซ้ำเพื่อโทร/หาที่อยู่บ่อยสุด
4. **รายการสินค้า** — ข้อมูลอ้างอิง
5. **รีวิว** — ท้ายแถว **ยกเว้น** มีรีวิวจริง (CONFIRMED) → ยกขึ้นบนสุด (peak-end)

คอลัมน์ขวา = **ข้อมูลสนับสนุน ไม่ใช่ action** เสมอ

---

## 5. Per-state matrix

| Status | Badge | next-step | Hero action | ShippingCard | Review |
|---|---|---|---|---|---|
| **PENDING** (ต้องส่งของ) | รอดำเนินการ (warning/clock) | "ขั้นต่อไป: ส่งลิงก์ให้ผู้ซื้อยืนยันตัวตนและชำระเงิน แล้วค่อยกรอกเลขพัสดุทีหลัง" | **P:** ส่งลิงก์ทาง SMS (฿1) · **S:** คัดลอกลิงก์ · **⋮** แก้ไข/ยกเลิก | segmented + ฟอร์ม (default ส่งเอง) | empty |
| **PENDING** (NO_SHIPPING) | เหมือนบน | "ขั้นต่อไป: ส่งลิงก์ให้ผู้ซื้อยืนยันรับสินค้า/บริการ" | เหมือนบน | **ไม่แสดง** | empty |
| **SHIPPED** | จัดส่งแล้ว (info/truck) | tracking chip + "รอผู้ซื้อกดยืนยันรับของ — ยังไม่ต้องทำอะไรเพิ่ม" | **ไม่มี P** · **S:** คัดลอกลิงก์ · **⋮** | **summary read-only** + "แก้ไขเลขพัสดุ" (P1 fix) | empty |
| **CONFIRMED** | สำเร็จ (success) | — | **ไม่มีปุ่ม** · **⋮** คัดลอกลิงก์ (อ้างอิง) | ไม่แสดง | **ยกขึ้นบนสุด** |
| **CANCELLED** | ยกเลิก (danger) | "คำสั่งซื้อนี้ถูกยกเลิกแล้ว ลิงก์ที่เคยส่งให้ผู้ซื้อใช้ไม่ได้อีก" | **ไม่มีปุ่มเลย ไม่มี ⋮** (ลิงก์ตายแล้ว) | ไม่แสดง | **ไม่แสดงเลย** |

**iShip:** ถ้าพัสดุสร้างผ่าน iShip → summary read-only ลิงก์ไป `ShipmentPanel` **ไม่มีปุ่มแก้ไขเลขพัสดุ** (system-generated, ห้ามเขียน `ShipmentTracking` ตาม 00022) → P1 fix ใช้กับโหมด MANUAL เท่านั้น

---

## 6. Copy (ไทย)

- Badge: ตาม `ORDER_STATUS_META` (`src/lib/order-display.ts`) — SSOT เดิม คงไว้
- ปุ่ม: "ส่งลิงก์ทาง SMS (฿1)" / "คัดลอกลิงก์" / "แก้ไขคำสั่งซื้อ" / "ยกเลิกคำสั่งซื้อ" / "แก้ไขเลขพัสดุ"
- ShippingCard submit: **"ยืนยันจัดส่ง"** (ครั้งแรก) → **"บันทึกการแก้ไข"** (โหมดแก้ไข) — ต้องคนละคำ
- Helper: "ส่งเอง: คุณส่งของกับขนส่งเอง แล้วนำเลขพัสดุมากรอกที่นี่เพื่อแจ้งผู้ซื้อ" / "สร้างพัสดุ iShip: ระบบเปิดพัสดุและออกใบปะหน้าให้ ได้เลขพัสดุอัตโนมัติ"
- ตาราง: "ชื่อสินค้า / ราคา/ชิ้น / จำนวน / รวม" · breakdown: "ยอดสินค้า / ส่วนลด / VAT N% / **ยอดรวมทั้งหมด**"
- Timeline: "สร้างคำสั่งซื้อแล้ว / จัดส่งแล้ว / คำสั่งซื้อสำเร็จ / ยกเลิกแล้ว" · ยังไม่ถึง: "รอจัดส่ง" / "รอยืนยัน" (ไม่ใช่ "รอดำเนินการ" — ชนกับ badge)
- Empty: ผู้ซื้อ "ยังไม่มีผู้ซื้อยืนยัน / ผู้ซื้อจะต้องยืนยัน OTP ผ่านลิงก์ก่อนข้อมูลจะปรากฏ" · รีวิว "ยังไม่มีรีวิวสำหรับคำสั่งซื้อนี้ / ผู้ซื้อจะสามารถรีวิวได้หลังยืนยันการรับสินค้า"
- Swal: ส่ง SMS "ระบบจะส่งลิงก์คำสั่งซื้อทาง SMS ให้ผู้ซื้อ และหัก ฿1 จากเครดิต SMS ของคุณ" · ยกเลิก "สินค้าจะถูกคืนเข้าสต็อก · ลิงก์ที่ส่งให้ผู้ซื้อจะใช้ไม่ได้ · ย้อนกลับไม่ได้"
- **ศัพท์ยึด "คำสั่งซื้อ" ไม่ใช่ "ออเดอร์"** ทุกจุด

---

## 7. จุดที่ต้องแก้ class จริง (มี 3 จุด)

1. **`ShippingActivity` title** — `<h5>{title}<span className="badge"/></h5>` → `<p className="text-md font-medium text-default-800 mb-1.25">{title}</p>` + badge เป็น sibling. ภาพเหมือนเดิมเป๊ะ (`.text-md` = 15px = ขนาด h5 ของ Paces) แต่เลิกสร้าง heading ปลอม 3 อันต่อหน้า. **theme เองทำผิดจุดนี้ — ไม่ copy ตรง**
2. **`ShippingActivity` pending label** — `text-default-300` → `text-default-400`
3. **`OrderReviewCard` no-comment** — `text-default-300` → `text-default-400`

### breakdown — single source (แก้ drift 2 ชุด)

```ts
type Row = { key:string; label:string; value:number; show:boolean; tone?:'danger'; prefix?:string; emphasis?:boolean }
function computeBreakdown(order): Row[] {
  return [
    { key:'subtotal', label:'ยอดสินค้า',        value:subtotal,          show:true },
    { key:'discount', label:'ส่วนลด',           value:discountVal,       show:discountVal>0, tone:'danger', prefix:'- ' },
    { key:'vat',      label:`VAT ${vatPct}%`,   value:vatVal,            show:vatVal>0 },
    { key:'total',    label:'ยอดรวมทั้งหมด',    value:order.totalAmount, show:true, emphasis:true },
  ].filter(r=>r.show)
}
```

mobile (`div.flex.justify-between`) และ desktop (`tr>td[colSpan=3]`) ต้อง `.map()` จาก **array เดียวกันนี้** — ห้ามเขียน JSX คำนวณซ้ำ 2 ที่

---

## 8. Icon (tabler)

| จุด | icon | | จุด | icon |
|---|---|---|---|---|
| PENDING | `clock` | | ที่อยู่ | `map-pin` |
| SHIPPED | `truck` | | สลิป | `receipt` |
| CONFIRMED | `circle-check-filled` | | ลิงก์ดิจิทัล | `link` |
| CANCELLED | `circle-x` | | empty ผู้ซื้อ | `user-off` |
| next-step | `arrow-right-circle` | | empty ชำระเงิน | `credit-card-off` |
| วันที่ | `calendar` | | empty สินค้า | `photo` |
| คัดลอก | `copy` | | empty รีวิว | `star-off` |
| แก้ไข | `pencil` | | การจัดส่ง | `truck-delivery` |
| overflow | `dots-vertical` | | ส่งเอง / iShip | `edit` / `package-export` |
| เบอร์โทร | `phone` / `phone-off` | | ยกเลิก (dropdown) | `ban` |

---

## 9. Impeccable compliance

**Mode: Operate** — seller console = authenticated tool, PRODUCT.md override register `brand` → `product`. ผล: familiarity ชนะความน่าประทับใจ, ห้าม decorative motion, ห้าม modal-first (Swal เฉพาะที่ต้อง block จริง = SMS/cancel)

- **One Voice** — น้ำเงิน `#236dc9` ปรากฏเฉพาะ **1 ปุ่ม primary ต่อหน้าจอ** + ลิงก์ "แก้ไข" + `tel:` ไม่มีที่ไหนใช้น้ำเงินตกแต่ง (ม่วง `#7367F0` = buyer/Vuexy ห้ามโผล่)
- **Verified-Means-Green** — success (`#02bc9c`) เฉพาะ badge "สำเร็จ" (CONFIRMED) + payment "ชำระแล้ว"; "รอตรวจสอบสลิป"/"รอชำระ"/"รอเก็บปลายทาง" = info/warning **ไม่ใช่เขียว**
- **ไม่ ALL CAPS** — `uppercase` เฉพาะ `<thead>` ภาษาอังกฤษ; **หัวตารางไทยไม่ใส่ uppercase** (ไม่มีความหมายกับอักษรไทย + ทำให้ดูหนักผิดที่)
- **shadow** — ใช้ `--shadow` ของ Paces เอง ไม่ต้อง override ด้วย Impeccable shadow vocabulary (คนละสกิน ตาม note ใน `design.json`)
- **Anti-slop** — ไม่มี hero-metric template · ไม่มี eyebrow จิ๋ว · ตัด Google Maps ปลอม (Design Principle #1 show-don't-tell) · ไม่มีการ์ดซ้อนการ์ด · **จงใจไม่ให้ทุกอย่างเป็น `text-default-400`** (บทเรียน retro auto-reply 2026-07-30 "ทุกอย่างจางไปหมด")

---

## 10. ข้อค้าง / ต้องตัดสินใจก่อน implement

1. **`/api/orders/{token}/ship` รับเรียกซ้ำ (แก้เลขพัสดุ) ได้หรือยัง** — ติดที่ `shipOrder()` เรียก `assertTransition(SHIPPED→SHIPPED)` + `ShipmentTracking.orderId` เป็น unique → **ต้องทำ service ใหม่ที่ update อย่างเดียวไม่แตะ status** = blocker ของ P1
2. **โหมด iShip พิมพ์ที่อยู่ผิด แก้ยังไง** — สเปกนี้ตัดว่าไม่มีปุ่มแก้ (business rule) แต่ต้องยืนยันกับเจ้าของ 00022 ว่า flow คือยกเลิก+สร้างใหม่
3. **badge contrast** — `bg-{semantic}/15 text-{semantic}` ของ Paces ให้ warning/info/success **ต่ำกว่า 4.5:1** เป็นหนี้ของ token ธีมเอง ไม่ใช่ของหน้านี้ → แก้ที่หน้านี้ฝ่ายเดียวจะหลุดธีม (ต้องใช้ arbitrary value = ผิด Hard Rule 7) **ต้องตัดสินระดับ design system**
4. **overflow ⋮ = 37px** (`.btn-icon` token) ต่ำกว่า 44px → เพิ่ม invisible hit-area (`min-h-11 min-w-11` ครอบ) โดยคงขนาด visual 37px
5. **ตัวเลขหลักล้าน** — ยังไม่ทดสอบว่า `฿1,234,567.89` ล้นบรรทัดในคอลัมน์ขวา 25% / mobile หรือไม่
6. **CANCELLED ไม่มีปุ่มเลย** — ยืนยันว่าไม่ต้องการแม้ "ดูลิงก์เดิม" สำหรับอ้างอิง?
7. **icon "copy" ที่ `CopyLinkButton.tsx` ใช้จริง** — ต้องเช็คให้ใช้ตัวเดียวกัน (Operate = consistency)
8. **โลโก้ขนส่ง** (Kerry/Flash/ไปรษณีย์) ยังไม่มี asset → ปัจจุบันใช้ `truck-delivery` + ชื่อข้อความ
9. **`<h5>` ชื่อสินค้าในเซลล์ตาราง** (`OrderSummary`) — theme ทำมาแบบนี้ ยังเป็น debt เบา ไม่แก้รอบนี้

---

## 11. Known deviation จาก theme (จงใจ พร้อมเหตุผล)

| ไม่ทำตาม theme | เหตุผล |
|---|---|
| ตัด Google Maps iframe (`ShippingAddress.tsx`) | พิกัด hardcode NYU, schema ไม่มี lat/lng → แผนที่ปลอมแย่กว่าไม่มีแผนที่ |
| `<h5>` + badge ซ้อน → `<p>` + sibling (`ShippingActivity.tsx`) | theme ทำ a11y ผิด; WCAG AA เป็น non-negotiable ใน PRODUCT.md ไม่ใช่รสนิยม |
| ตัด Shipping Fee row (`OrderSummary.tsx`) | ไม่มี field ในระบบ |
| hero แยกเป็น card ของตัวเอง (theme รวมกับตารางสินค้า) | เนื้อหา hero ของเราหนากว่า theme (next-step + tracking chip) และต้อง full-width เหนือ grid เพื่อให้อ่านสถานะได้ก่อนทุกอย่าง |

---

## 12. v3 — โครงที่ยึด (แทน §3/§5/§7 ของ v2)

v2 ไม่ผ่านเพราะยึด theme grid มาแบบไม่คิดต่อ → ได้การ์ด 7 ใบน้ำหนักเท่ากัน แล้วปุ่มไปอยู่ในทุกใบ (minibar / hero / การ์ดจัดส่ง / ⋮ = 4 จุด) + เงินอยู่ 2 ที่ (ยอดรวมท้ายตารางซ้าย, สถานะชำระคอลัมน์ขวา)

### 12.1 Action = bubble ลอยกลางล่างจอ — ปุ่มทุกตัวอยู่ที่นี่ที่เดียว

**Base: `src/app/(paces)/seller/(dashboard)/orders/components/BulkActionBar.tsx`** (component ที่มีอยู่แล้วในหน้า list — ใช้ primitive ชุดเดียวกันทั้งหมด ไม่สร้างใหม่)

```
fixed bottom-8 left-1/2 -translate-x-1/2 z-50
└ bg-dark rounded-full shadow-lg flex items-center py-2
  ├ zone1  badge bg-primary text-white rounded-full + text-xs text-white/70 (สถานะ + เลขคำสั่งซื้อ)
  ├ divider  border-l border-white/20 self-stretch my-1.5
  ├ zone2  ghost: btn text-white/80 hover:text-white hover:bg-white/10 rounded-full gap-1.5
  │        primary: btn bg-primary hover:bg-primary-hover text-white rounded-full
  └ zone3  btn btn-icon text-white/60 hover:bg-white/10 rounded-full  (⋮ = action รอง)
icon = size-4.5
```

- **มือถือ (<768):** `left-3 right-3` แทน `-translate-x-1/2` · ghost เหลือ icon-only · ตัด zone1 ทิ้ง (สถานะ+เลขอยู่หัวหน้าแล้ว ไม่งั้นตัวหนังสือเบียดทับกัน) · ยกขึ้น `bottom-19` (76px) ให้พ้น bottom nav 64px
- **ในเนื้อหาเหลือ 0 ปุ่ม ทุกสถานะ** (verify ด้วย browser: `.content button` = 0)
- ฟอร์มกรอกเลขพัสดุ **ไม่อยู่ในหน้า** — กด "แจ้งเลขพัสดุ" บน bubble → เปิด shipment modal ที่มีอยู่แล้ว (`docs/superpowers/specs/2026-07-27-iship-shipment-modal-design.md`) เพราะฟอร์มพร้อมปุ่ม "ยืนยันจัดส่ง" สีน้ำเงินในเนื้อหา = น้ำเงินตัวที่ 2 แข่งกับ primary บน bubble (ผิด One Voice + เป็นอาการ "ปุ่มกระจาย" ที่ต้องแก้)

### 12.2 Per-state actions (บน bubble เท่านั้น)

| Status | primary (น้ำเงิน) | ghost | ⋮ | bubble |
|---|---|---|---|---|
| PENDING | ส่งลิงก์ทาง SMS (฿1) | แจ้งเลขพัสดุ | คัดลอกลิงก์ · คัดลอกที่อยู่จัดส่ง · แก้ไขคำสั่งซื้อ · ยกเลิกคำสั่งซื้อ | มี |
| SHIPPED | **ไม่มี** | คัดลอกลิงก์ · แก้ไขเลขพัสดุ | คัดลอกเลขพัสดุ · คัดลอกที่อยู่จัดส่ง · แก้ไขคำสั่งซื้อ · ยกเลิกคำสั่งซื้อ | มี |
| CONFIRMED | **ไม่มี** | คัดลอกลิงก์ | คัดลอกเลขพัสดุ · คัดลอกที่อยู่จัดส่ง | มี |
| CANCELLED | **ไม่มี** | **ไม่มี** | **ไม่มี** | **ไม่มี bubble เลย** (ไม่มี action ที่ทำได้) |

### 12.3 เนื้อหา = 3 โซน

1. **แถบหัว (ไม่มีปุ่ม)** — badge สถานะ · เลขคำสั่งซื้อ · วันที่ · **ยอดรวมตัวใหญ่ + badge สถานะชำระเงินคู่กัน** (คำถาม "ได้เงินเท่าไหร่/ได้หรือยัง" ตอบในบรรทัดเดียว ไม่ต้องมองสองที่) · แถบ next-step 1 ประโยค
2. **การ์ดหลักใบเดียว (75%)** แบ่ง section ด้วย `border-top dashed` เรียงตามลำดับงานผู้ขาย: ผู้ซื้อ+ที่อยู่ → การจัดส่ง → รายการสินค้า+breakdown → การชำระเงิน
   - section label = `text-xs font-semibold text-default-800` + icon `text-default-400` (ไม่ใช่ `.card-header` ปลอมซ้อนในการ์ด — craft-floor ห้ามการ์ดซ้อนการ์ด)
   - ตรงกับ theme: `OrderSummary.tsx` รวม hero+items+totals ในการ์ดใบเดียวและใช้เส้น dashed อยู่แล้ว — v2 ที่แยกเป็นการ์ดย่อยเองคือส่วนที่หลุดจาก theme
3. **คอลัมน์ขวา (25%)** — "ความคืบหน้า" (timeline) + "รีวิวจากผู้ซื้อ" เท่านั้น ไม่มี action

### 12.4 ที่ต้องแก้เพิ่มตอน implement

- `BulkActionBar` ปัจจุบันเป็น desktop-only (list page) → หน้า detail ต้องใช้ได้ทุกขนาด: ต้อง extract เป็น component กลาง (เช่น `components/safepay/FloatingActionBar.tsx`) แล้วให้ทั้ง 2 หน้าใช้ร่วม **ห้าม copy markup ไปวางซ้ำ**
- ต้องมี `padding-bottom` ที่ content ให้ bubble + bottom nav ไม่ทับเนื้อหาบรรทัดสุดท้าย
