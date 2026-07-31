# QA — `--color-{semantic}-ink` contrast (light + dark)

- **วันที่:** 2026-07-31
- **ขอบเขต:** action item #1 + #2 ของ retro `2026-07-31-seller-order-detail-v5.md` (known-gap #6 และ #7)
- **วิธีวัด:** Chrome (browser-harness ต่อ CDP) บน dev server ของ worktree `main-7` — `http://seller.deepth.local:4020`
- **เกณฑ์ผ่าน (C-2):** contrast ≥ **4.5:1** วัดจาก **computed color** + **พื้นหลังที่ composite แล้ว** ไม่ใช่ "เปลี่ยน token A เป็น B"

## วิธีวัดที่ใช้ (และกับดักที่ต้องเลี่ยง)

1. **พื้นหลังต้อง composite จริง** — เก็บ `backgroundColor` ไล่ขึ้น ancestor จนเจอชั้นทึบ แล้ววาดซ้อนกลับลงมาตามลำดับ
2. **ห้าม parse สีด้วย regex ตัวเลขล้วน** — Tailwind 4 คืน `bg-{semantic}/15` เป็น `oklab(... / 0.15)` การหยิบตัวเลข 3 ตัวแรกมาเป็น RGB ให้ค่าผิดสนิท (รอบแรกของงานนี้อ่าน `bg-warning/15` บนการ์ดขาวได้เป็น `rgb(217,217,217)` แทนที่จะเป็น `rgb(254,245,230)` → รายงาน 1.18:1 แทน 1.54:1). ทางแก้: ให้ **canvas 2D เป็นคนแปลงสีและผสมอัลฟา** (`ctx.fillStyle = <computed string>` แล้วอ่าน `getImageData`) — เบราว์เซอร์ทำ oklab→sRGB และ source-over ให้เอง ตรงกับที่ render จริง
3. **"ผู้ใช้เห็นจริง" (C-3)** — เช็ค `visibility` + `display` ไล่ ancestor chain ก่อนนับ ไม่ใช่ `getBoundingClientRect()` อย่างเดียว

**การตรวจสอบความถูกต้องของ probe:** ค่าที่ probe วัดได้บนจอตรงกับการคำนวณ sRGB มือทุกช่อง (เช่น `bg-warning/15` บนขาว → `rgb(254,245,230)` เท่ากันเป๊ะ) จึงเชื่อถือตัวเลขชุดนี้ได้

## ผล — `ORDER_STAGE_META` (`src/lib/order-stage.ts`, ชิปฝั่ง inbox/chat)

วัดบน **แถวรายการแชทจริง** ที่ `/inbox` (ร้านที่ล็อกอินอยู่มีบทสนทนาเดียวและไม่มีออเดอร์ผูก → ชิปจริงไม่ render, จึง render ชิปทั้ง 7 ขั้นด้วย `cls` ชุดจริงลงในแถวนั้นเพื่อให้พื้นหลังเป็นของจริง)

| tone | ขั้นที่ใช้ | ก่อน (`text-{semantic}`) | หลัง (`text-{semantic}-ink`) | พื้นชิป (light) |
|---|---|---|---|---|
| primary | ORDERED, PARCEL_CREATED | **4.17:1** FAIL | **8.44:1** PASS | `rgb(222,233,247)` |
| warning | LABEL_PRINTED | **1.54:1** FAIL | **6.56:1** PASS | `rgb(254,245,230)` |
| info | SHIPPING | **1.84:1** FAIL | **7.88:1** PASS | `rgb(231,246,251)` |
| success | DELIVERED, COMPLETED | **2.11:1** FAIL | **6.68:1** PASS | `rgb(217,245,240)` |
| danger | CANCELLED | **2.68:1** FAIL | **8.47:1** PASS | `rgb(254,230,236)` |

ก่อนแก้ **ตกทั้ง 5 ช่อง** · หลังแก้ **ผ่านทั้ง 5 ช่อง** ต่ำสุด 6.56:1

## ผล — dark mode override (known-gap #6)

`--color-{semantic}-ink` เดิมนิยามใน `@theme` เท่านั้น (สีเข้ม `#7f1d1d`, `#1e3a8a` … ออกแบบให้อยู่บนการ์ดขาว) เมื่อ `--color-card` กลายเป็น `#1e1f27` พื้นชิปเข้มตาม หมึกเข้มบนพื้นเข้มจึงตกทันที — เช่น `danger` `#7f1d1d` บน `rgb(62,39,52)` = **1.29:1**

เพิ่ม override ใน `[data-theme="dark"]` แล้ววัดซ้ำ (สลับ `data-theme` เป็น `dark` บนหน้าจริง):

| tone | ค่า dark | contrast (วัดจากจอ) | พื้นชิป (dark) |
|---|---|---|---|
| warning | `#fcd34d` | **8.22:1** PASS | `rgb(62,54,46)` |
| info | `#7dd3fc` | **7.35:1** PASS | `rgb(39,55,67)` |
| success | `#6ee7b7` | **8.47:1** PASS | `rgb(25,54,56)` |
| danger | `#fda4af` | **7.19:1** PASS | `rgb(62,39,52)` |
| primary | `#93c5fd` | **7.99:1** PASS | `rgb(30,42,63)` |

ต่ำสุด **7.19:1** · คำนวณเผื่อพื้นเข้มชั้นอื่นที่ชิปอาจไปโผล่ (`card #1e1f27` / `body #17181e` / `default-100 #272832`) ต่ำสุดยังได้ **6.40:1**

ยืนยันซ้ำบน **badge ของจริง** (ไม่ใช่ชิปที่ inject) ที่หน้า `/orders/[token]` ซึ่งใช้ `ORDER_STATUS_META` จาก `src/lib/order-display.ts`: `รอดำเนินการ` 8.22:1 · `รอเก็บปลายทาง` 7.35:1 · `เสร็จแล้ว` 8.47:1 — ทั้งหมดอ่านออกชัดในภาพหน้าจอ dark

## 🛑 แก้ข้อเท็จจริงของ known-gap #6 — ผู้ใช้ **เข้าถึง dark mode ได้อยู่แล้ววันนี้**

scope baseline เขียนว่า gap นี้ "ผู้ใช้เข้าไม่ถึงเพราะ `data-theme="light"` hardcode ที่ `(paces)/layout.tsx:56` **และไม่มี toggle ให้ผู้ใช้สลับ**" จึงจัดเป็น latent bug ความเสี่ยงต่อผู้ใช้ = ต่ำ

**ตรวจบนจอแล้วไม่จริง** — มีปุ่มสลับธีมอยู่ใน topbar จริง:

```
HEADER.app-header
 └ DIV.container-fluid …
   └ DIV.sm:inline-flex hidden
     └ DIV.topbar-item hs-dropdown            ← ไอคอนดวงอาทิตย์
       └ button.topbar-link.hs-dropdown-toggle
       └ DIV.hs-dropdown-menu
         └ label[for=topbar-dropdown-dark] "Dark"   ← กดแล้วได้ dark ทันที
```

กด label "Dark" แล้ว `document.documentElement.getAttribute('data-theme')` เปลี่ยนเป็น `dark` ทันที และ badge ทั้งหน้าเปลี่ยนสีตาม (วัดซ้ำหลังกดจริง: `จัดส่งแล้ว` 7.35:1 · `ยังไม่ยืนยันการชำระ` 8.22:1 · `เสร็จแล้ว` 8.47:1)

`data-theme="light"` ที่ layout เป็นแค่ **ค่าตั้งต้นตอน SSR** ไม่ได้ล็อกไว้ — ตัวสลับเขียนทับ attribute ฝั่ง client ได้

**ผลต่อการประเมินความเสี่ยง:** gap #6 ไม่ใช่ latent bug แต่เป็น **บั๊กที่ผู้ใช้เจอได้จริงตั้งแต่ก่อนแก้** (ผู้ใช้ที่กด Dark จะเห็นตัวหนังสือในชิปแทบมองไม่เห็น เช่น danger `#7f1d1d` บนพื้น `rgb(62,39,52)` = **1.29:1**) การแก้รอบนี้จึงเป็นการปิดบั๊กจริง ไม่ใช่กันไว้ล่วงหน้า

ข้อจำกัดที่วัดได้: ตัวสลับซ่อนต่ำกว่า breakpoint `sm` (`class="sm:inline-flex hidden"`) → บนมือถือกดไม่ได้ · และค่าที่เลือกไม่ถูกเก็บใน `localStorage` คีย์ `data-theme`/`theme`

## หนี้ที่ยังเหลือ (พบระหว่างวัด — ยังไม่แก้ อยู่นอกขอบเขตที่สั่ง)

`bg-{semantic}/15 text-{semantic}` แบบเดิมยังเหลืออีก **3 ชุด** ที่ยังตก AA และเป็น status meta ที่ก๊อปกันคนละไฟล์:

| ไฟล์ | บรรทัด | ของ |
|---|---|---|
| `src/app/(paces)/seller/(dashboard)/orders/components/OrdersTable.tsx` | 47 | สถานะออเดอร์ในตาราง (หน้า list) |
| `src/app/(paces)/seller/(dashboard)/orders/components/OrderCard.tsx` | 35 | สถานะออเดอร์ในการ์ด (หน้า list มือถือ) |
| `src/app/(paces)/seller/(chat)/inbox/components/InboxList.tsx` | 147 | `SALES_STATUS_META` |

วัดจริงบนหน้า `/orders`: `รอดำเนินการ` = **1.54:1**, ป้ายส่วนลด `-40%` = **2.68:1**, `-100%` = **2.11:1**

สองไฟล์แรกทำซ้ำสิ่งที่ `ORDER_STATUS_META` (`src/lib/order-display.ts`) เป็น SSOT อยู่แล้ว — ควรยุบมาใช้ตัวเดียวกันแทนที่จะไล่แก้สีทีละที่
