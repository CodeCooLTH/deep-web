# Design Spec v5 — รายละเอียดคำสั่งซื้อ (seller)

- **หน้า:** `src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx` + `components/`
- **Mockup (approved):** `docs/superpowers/specs/2026-07-30-seller-order-detail-v5-mockup.html`
- **วันที่:** 2026-07-31 · **สถานะ:** user approve mockup แล้ว → implement ได้
- **Mode:** Operate (`~/.claude/skills/impeccable/reference/operate.md`)
- **แทนที่:** `2026-07-30-seller-order-detail-v2-design.md` (v2/v3/v4 ไม่ผ่าน — เก็บไว้เป็นบันทึกเหตุผล)

> **ทางที่ลองแล้วไม่ผ่าน (อย่าย้อนกลับไป):**
> - **v2** ยึด theme grid มาแบบไม่คิดต่อ → การ์ด 7 ใบน้ำหนักเท่ากัน ปุ่มกระจาย 4 จุด เงินอยู่ 2 ที่
> - **v3** รวมปุ่มไว้ที่เดียวแล้ว แต่ยังจัดกลุ่มตามหมวดข้อมูล → "ข้อมูลกระจัดกระจาย ไม่ลำดับความสำคัญ"
> - **v4** ทำสถานะเป็นแกน (accordion ตามขั้น) → UI ผ่าน แต่ **grouping พัง**: เอาข้อเท็จจริงไปปนกับเหตุการณ์
>   ข้อมูลลูกค้าไปฝังในขั้นชื่อ "จัดส่ง" พอ CONFIRMED ขั้นนั้นพับ เบอร์/ที่อยู่ลูกค้าหายจากจอ
> - **bubble ลอย** (v3–v4) user ไม่เอา → เปลี่ยนเป็นแถบเต็มความกว้าง

---

## 1. หลักการจัดกลุ่ม (หัวใจของ v5)

ข้อมูลในหน้านี้มี **2 ชนิด** ห้ามเอามาปนกัน:

| ชนิด | คือ | อยู่ที่ไหน | พฤติกรรม |
|---|---|---|---|
| **ข้อเท็จจริง** | ใคร · ซื้ออะไร · เท่าไหร่ · ส่งที่ไหน | การ์ด "ใบสั่งซื้อ" | **เห็นหมดเสมอ ไม่มีกาง/พับ** ทุกสถานะ |
| **เหตุการณ์** | เกิดอะไรขึ้นเมื่อไหร่ | การ์ด "ประวัติคำสั่งซื้อ" | อ่านอย่างเดียว **ห้ามซ่อนข้อมูลหลักไว้ข้างใน** |

กฎที่ต้องถือ: **ห้ามเอาเบอร์/ที่อยู่/ยอดเงิน/รายการสินค้า ไปไว้ในสิ่งที่พับได้หรือขึ้นกับสถานะ**

---

## 2. โครงหน้า

```
หัวหน้า (การ์ด, เต็มความกว้าง)        ← สถานะ · เลข · วันที่ · ยอดรวม+badge ชำระ · งานถัดไป 1 ประโยค
├─ desktop: action อยู่มุมขวาบนของการ์ดนี้
└─ mobile/tablet: ไม่มีปุ่มในการ์ดนี้

grid 75/25 (≥1024) · คอลัมน์เดียว (<1024)
├─ ซ้าย (col-span-3) — ใบสั่งซื้อ: 3 section คั่น border-top dashed
│    1. ผู้ซื้อและที่อยู่จัดส่ง   ชื่อ+ยืนยัน OTP · เบอร์ (tel:) · ที่อยู่ · หมายเหตุผู้ซื้อ
│    2. รายการสินค้าและยอดเงิน  ตาราง/stacked · breakdown · วิธีชำระ+ช่องทาง+สถานะ+สลิป
│    3. การจัดส่ง               ขนส่ง+เลขพัสดุ+เวลา  หรือ  callout "ยังไม่แจ้งเลขพัสดุ"
└─ ขวา (col-span-1) — รีวิวจากผู้ซื้อ (เมื่อมี) + ประวัติคำสั่งซื้อ
```

**Base (verify แล้ว):**
- grid: `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/page.tsx` — `grid grid-cols-1 lg:grid-cols-4 gap-base` + `space-y-base lg:col-span-3`
- การ์ดใบเดียวแบ่ง section ด้วยเส้นประ + ตารางสินค้า + breakdown rows: `.../components/OrderSummary.tsx`
- แถวเหตุการณ์ + เส้นประแนวตั้ง (`after:border-dashed`) + วงไอคอน 33px: `.../components/ShippingActivity.tsx`
- avatar-block + icon-row + kebab `hs-dropdown`: `.../components/CustomerDetails.tsx`
- payment row (icon+label+badge): `.../components/BillingDetails.tsx`
- แถบ action (สี/ปุ่ม/divider): `src/app/(paces)/seller/(dashboard)/orders/components/BulkActionBar.tsx`

**ตัดจาก theme โดยเจตนา:** Google Maps iframe ใน `ShippingAddress.tsx` (พิกัด hardcode NYU, schema ไม่มี lat/lng — แผนที่ปลอมแย่กว่าไม่มี) · Shipping Fee row (ไม่มี field)

---

## 3. Action — อยู่ที่เดียว ย้ายตำแหน่งตามจอ

**หน้านี้ไม่มี `SellerBottomNav`** — เอาพื้นที่ 64px นั้นมาเป็น action แทน (หน้า detail = งานเดียวจบ ไม่ใช่หน้า browse) → **ต้องเพิ่มปุ่มย้อนกลับบน topbar** เพราะตัดทางกลับไปแล้ว

| จอ | ตอนอยู่บนสุด | ตอนเลื่อนลง |
|---|---|---|
| **< 1024** | แถบเต็มความกว้างติดล่าง สูง 64px | ติดล่างเหมือนเดิม |
| **≥ 1024** | มุมขวาบนของการ์ดหัวหน้า | **แถบตรึงใต้ topbar** (`top:65px`, `left:245px` เว้น sidenav) โผล่เมื่อการ์ดหัวหน้าพ้นจอ |

- แถบตรึงบน = **ชุดปุ่มเดียวกัน** render จากฟังก์ชันเดียว ห้ามเขียน markup ซ้ำ
- **ในเนื้อหา 0 ปุ่ม ทุกสถานะ** (บังคับ — reviewer ต้องเช็ค)
- น้ำเงิน **≤1 ตัวต่อสถานะ** (One Voice)
- tap target ทุกปุ่มบนแถบล่าง **44px**
- ฟอร์มกรอกเลขพัสดุ **ไม่อยู่ในหน้า** → กด "แจ้งเลขพัสดุ" เปิด shipment modal (`docs/superpowers/specs/2026-07-27-iship-shipment-modal-design.md`) เพราะปุ่ม submit น้ำเงินในเนื้อหาจะเป็นน้ำเงินตัวที่ 2 แข่งกับ primary

### Per-state matrix

| Status | primary (น้ำเงิน) | ghost | ⋮ | แถบ action |
|---|---|---|---|---|
| **PENDING** | ส่งลิงก์ทาง SMS (฿1) | แจ้งเลขพัสดุ | คัดลอกลิงก์ · คัดลอกที่อยู่จัดส่ง · แก้ไขคำสั่งซื้อ · ยกเลิกคำสั่งซื้อ | มี |
| **SHIPPED** | **ไม่มี** | คัดลอกลิงก์ · แก้ไขเลขพัสดุ | คัดลอกเลขพัสดุ · คัดลอกที่อยู่จัดส่ง · แก้ไขคำสั่งซื้อ · ยกเลิกคำสั่งซื้อ | มี (ghost ยืดเต็มแทน primary) |
| **CONFIRMED** | **ไม่มี** | คัดลอกลิงก์ | คัดลอกเลขพัสดุ · คัดลอกที่อยู่จัดส่ง | มี |
| **CANCELLED** | **ไม่มี** | **ไม่มี** | **ไม่มี** | **ไม่มีแถบเลย** (เหลือแค่ปุ่มย้อนกลับ) |

**iShip:** ถ้าพัสดุมาจาก iShip → **ไม่มี "แก้ไขเลขพัสดุ"** (system-generated, ห้ามเขียน `ShipmentTracking` ตาม feat 00022) แสดง summary + ลิงก์ไป `ShipmentPanel` แทน

### Per-state เนื้อหา

| Status | section การจัดส่ง | รีวิว | ประวัติ (เหตุการณ์) |
|---|---|---|---|
| PENDING | callout "ยังไม่แจ้งเลขพัสดุ" + badge warning | ไม่แสดงการ์ด | สั่งซื้อ ● · รอผู้ซื้อชำระเงิน ○ · รอจัดส่ง ○ · รอผู้ซื้อยืนยันรับของ ○ |
| SHIPPED | ขนส่ง · เลขพัสดุ · แจ้งจัดส่งเมื่อ + badge "ส่งเอง" | ไม่แสดงการ์ด | สั่งซื้อ ● · ชำระเงิน ● · จัดส่ง ● · รอผู้ซื้อยืนยันรับของ ○ |
| CONFIRMED | เหมือน SHIPPED | **แสดง** (ดาว + comment + ชื่อ/เวลา) | ครบ 4 ● |
| CANCELLED | เหมือน PENDING/SHIPPED ตามจริง | ไม่แสดง | สั่งซื้อ ● · ยกเลิกแล้ว ● (danger) |

---

## 4. Token / class ที่ต้องใช้ (ห้ามเดา)

`--color-primary:#236dc9` hover `#1e5dab` · `--color-success:#02bc9c` (**ไม่ใช่ #28C76F ของ Vuexy**) · `--color-info:#5bc3e1` · `--color-warning:#f9bf59` · `--color-danger:#f7577e` · body `#4c4c5c` · heading `default-900 #313a46` · border `default-300 #e7e9eb` · `--radius:4px` · `--spacing-base:20px` · `--text-md:15px` · `--topbar-height:65px`

- `.card` = shadow เท่านั้น **ไม่มี border** · `.card-header` = `px-5 py-3.75` + `border-b border-dashed border-default-300` · `.card-body` = `p-5`
- `.badge` = `rounded` 4px **ไม่ใช่ pill** · badge สถานะใช้ `ORDER_STATUS_META` (`src/lib/order-display.ts`) เป็น SSOT
- `.btn` = `rounded px-4 py-1.75 text-sm font-medium` · `.btn-icon` = `size-9.25` (37px)
- breakpoint = Tailwind v4 default **ไม่มี override ใน Paces**: sm 640 / md 768 / lg 1024
- **ห้าม arbitrary value** ยกเว้นเงาด้านบนของแถบ action → ใช้ค่าเดียวกับ `SellerBottomNav.tsx:186` `shadow-[0_-4px_16px_-6px_rgba(47,43,61,0.10)]` **พร้อม comment กำกับ**
- **ห้าม `font-mono` กับเลขพัสดุ** — Anuphan ไม่มี mono จะ fallback Courier หลุดธีม ใช้ `tabular-nums` + `tracking-wide` แทน (บทเรียน `feedback_font_mono_breaks_anuphan`)

---

## 5. Copy (ไทย)

- ศัพท์ยึด **"คำสั่งซื้อ"** ไม่ใช่ "ออเดอร์" ทุกจุด
- section: "ผู้ซื้อและที่อยู่จัดส่ง" · "รายการสินค้าและยอดเงิน" · "การจัดส่ง" · การ์ด: "ประวัติคำสั่งซื้อ" · "รีวิวจากผู้ซื้อ"
- หัวหน้า: "ยอดรวมทั้งหมด" · งานถัดไปต่อสถานะ:
  - PENDING "ขั้นต่อไป: ส่งลิงก์ให้ผู้ซื้อยืนยันตัวตนและชำระเงิน — เลขพัสดุแจ้งทีหลังได้"
  - SHIPPED "รอผู้ซื้อกดยืนยันรับของ — ตอนนี้ยังไม่ต้องทำอะไรเพิ่ม"
  - CONFIRMED "คำสั่งซื้อนี้จบสมบูรณ์แล้ว — ผู้ซื้อยืนยันรับของและรีวิวแล้ว"
  - CANCELLED "คำสั่งซื้อนี้ถูกยกเลิกแล้ว — สินค้าคืนเข้าสต็อก และลิงก์ที่เคยส่งให้ผู้ซื้อใช้ไม่ได้อีก"
- การจัดส่งยังไม่แจ้ง: "ส่งของแล้วให้กด **แจ้งเลขพัสดุ** ที่แถบด้านล่างจอ — เลือกได้ว่าจะกรอกเลขที่ส่งเองหรือให้ระบบสร้างพัสดุ iShip ให้"
- เหตุการณ์: "สั่งซื้อแล้ว / ชำระเงินแล้ว / จัดส่งแล้ว / ผู้ซื้อยืนยันรับของ / ยกเลิกแล้ว" · ที่ยังไม่ถึง: "รอผู้ซื้อชำระเงิน / รอจัดส่ง / รอผู้ซื้อยืนยันรับของ"
- Swal (คงของเดิม): SMS "…หัก ฿1 จากเครดิต SMS ของคุณ" · ยกเลิก "สินค้าจะถูกคืนเข้าสต็อก · ลิงก์ที่ส่งให้ผู้ซื้อจะใช้ไม่ได้ · ย้อนกลับไม่ได้"
- วันที่ผ่าน `src/lib/format-date.ts` เท่านั้น · toast = `pacesToast` · confirm = Swal

---

## 6. หนี้ที่ต้องปิดไปพร้อมกัน

1. **breakdown เขียน 2 ชุด (mobile/desktop) แล้ว drift** → ต้องมาจาก **array เดียว**:
   ```ts
   type Row = { key:string; label:string; value:number; show:boolean; tone?:'danger'; prefix?:string; emphasis?:boolean }
   ```
   mobile (`div.flex.justify-between`) และ desktop (`tr>td[colSpan=3]`) `.map()` จาก array เดียวกัน
2. **a11y:** `ShippingActivity` ใช้ `<h5>{title}<span class="badge"/></h5>` (theme ทำผิดเอง — ไม่ copy ตรง) → `<p class="text-md font-medium text-default-800">` + badge เป็น sibling
3. **contrast:** `text-default-300` ที่ถูกใช้เป็น body text → `text-default-400`
4. **`formatAmount` กลาง** — `Intl.NumberFormat` ซ้ำใน 16 ไฟล์ฝั่ง seller (nice-to-have ทำได้ก็ทำ)

---

## 7. ต้องแก้นอกไฟล์ UI

1. **extract `BulkActionBar` เป็น component กลาง** — ตอนนี้เป็น desktop-only ของหน้า list; หน้า detail ต้องใช้ได้ทุกขนาด → ทำ `src/components/safepay/OrderActionBar.tsx` (หรือชื่อที่ planner เลือก) ให้ 2 หน้าใช้ร่วม **ห้าม copy markup ไปวางซ้ำ**
2. **P1 แก้เลขพัสดุ (backend)** — `shipOrder()` เรียก `assertTransition(SHIPPED→SHIPPED)` + `ShipmentTracking.orderId` เป็น unique → ต้องมี service ใหม่ที่ **update อย่างเดียว ไม่แตะ status** ปุ่ม "แก้ไขเลขพัสดุ" กดไม่ได้จริงจนกว่าจะทำ (เฉพาะโหมด MANUAL)
3. **ปุ่มย้อนกลับบน topbar** (<1024) — ผลจากการตัด bottom nav

---

## 8. เรื่องที่ user ยังไม่ตัดสิน (ไม่ block งานนี้ แต่ต้องรู้)

- **ตัด bottom nav เฉพาะหน้านี้** เป็น default ของงานนี้ → nav จะหาย/โผล่เวลาเข้า-ออกหน้า detail. ถ้าอยากให้ทุกหน้า detail (product/customer) เหมือนกัน = งานแยกอีกก้อน
- **badge contrast** `bg-{semantic}/15 text-{semantic}` ของ Paces ต่ำกว่า 4.5:1 — เป็นหนี้ระดับ design system แก้หน้าเดียวไม่ได้ (จะต้องใช้ arbitrary value = ผิด Hard Rule 7)

---

## 9. Impeccable compliance

**Mode: Operate** — seller console = authenticated tool (PRODUCT.md override register `brand`→`product`) familiarity ชนะความน่าประทับใจ · ห้าม decorative motion · ห้าม modal-first (Swal เฉพาะที่ต้อง block จริง)

- **One Voice** — น้ำเงิน `#236dc9` ปรากฏเฉพาะ 1 ปุ่ม primary ต่อสถานะ + ลิงก์ `tel:` ไม่มีที่ไหนใช้น้ำเงินตกแต่ง (ม่วง `#7367F0` = buyer/Vuexy ห้ามโผล่)
- **Verified-Means-Green** — success สงวนให้ badge "สำเร็จ" + payment "ชำระแล้ว" เท่านั้น; "รอตรวจสอบสลิป"/"รอชำระ" = info/warning
- **ไม่ ALL CAPS** กับหัวตารางภาษาไทย
- **Anti-slop** — ไม่มีการ์ดซ้อนการ์ด (section ใช้ `border-top dashed` ไม่ใช่ `.card-header` ปลอมซ้อนใน `.card`) · ไม่มี hero-metric template · ตัดข้อมูลปลอมทิ้ง (Maps) · ไม่ปล่อยให้ทุกอย่างเป็น `text-default-400`
