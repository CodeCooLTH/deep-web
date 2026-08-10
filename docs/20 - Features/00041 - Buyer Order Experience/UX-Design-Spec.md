---
title: "UX Design Spec — 00041 Buyer Order Experience"
owner: shinobu22
status: draft
module: M00041-BuyerOrderExperience
version: "1.0"
created: 2026-08-10
tags: [feature, ux, design-spec, order, buyer, review, dispute, responsive]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[SDS]]", "[[Feature-Docs-Ownership]]"]
---

# UX Design Spec: 00041 Buyer Order Experience (`/o/{token}` redesign)

> **สถานะ:** Draft — ผ่าน `safepay-ux` gate (Hard Rule 8) แล้ว · mockup 3 ขนาดจอคู่กับเอกสารนี้อยู่ที่ `docs/superpowers/specs/2026-08-10-buyer-order-experience-mockup.html`
> **ลำดับการอ่านที่ ux ทำจริง:** `DESIGN.md` + `PRODUCT.md` + `.impeccable/design.json` → playbook `shape.md`/`craft-floor.md` → PRD/BRD/SRS/SDS ของโมดูลนี้ (ครบ D-1..D-3, BR-BOE-01..25, TD-001/002) → `docs/system/ui-guideline/README.md` + `customer/page-sourcing.md` → โค้ดปัจจุบันทั้งชุด → theme source (Vuexy ecommerce orders/details, `ProductImage.tsx`, front-pages `Header.tsx`; Paces `SweetAlerts.tsx`, form textarea, dropdowns) → `upload-client.ts`
>
> **ไม่เสนอทางเลือกอื่นทับมติ D-1/D-2/D-3/BR-BOE-\* ที่ user ล็อกแล้ว** — ทุกจุดที่ SDS ทิ้งไว้ให้ UX ตัดสิน (ตำแหน่งปุ่ม dispute/contact ตาม TD-001, น้ำหนักสถานะรีวิวที่ 3 ตาม TD-002, layout responsive จริง) ตัดสินไว้ในเอกสารนี้พร้อมเหตุผล

---

## 0. โครงข้อมูล/decision ที่ต้อง lock ก่อนวาด layout

| ประเด็น | การตัดสินของ ux (เหตุผล) |
|---|---|
| **desktop 2-column reflow** | ที่ ≥1200px แตกเป็น Grid `xs=12 / lg=8` (เนื้อหา) + `xs=12 / lg=4` (sticky action panel) — **ไม่ใช่แค่ขยาย max-width คอลัมน์เดียว** เพราะจอ 1440 จะเหลือขอบขาวสองข้างเปล่า ๆ (anti-slop) ยึด pattern จริงจาก `orders/details/index.tsx` ของ Vuexy โดยเปลี่ยน key `md`→`lg` (threshold ของเราคือ 1200) |
| **CTA ปุ่มหลักอยู่ที่เดียวต่อ breakpoint** | `<1200px`: sticky bottom bar (thumb-zone) · `≥1200px`: การ์ด sticky คอลัมน์ขวา (bottom bar ซ่อน) — **ไม่แสดงพร้อมกันทั้งคู่** |
| **guest เห็น help-card ชุดเดียวกับ authenticated แต่ปุ่มพาไป login** | BRD FR-004 AC ให้ปุ่มที่ผูกตัวตน "แสดง" ได้ใน guest view แค่กดแล้วต้อง login — เลือกให้เห็น ไม่ใช่ซ่อน เพราะตรงเป้าหมาย PRD "เห็นคุณค่าก่อนถูกขอให้ล็อกอิน": เห็นว่าแพลตฟอร์มมีช่องทางแจ้งปัญหา/ติดต่อร้านจริงก่อนตัดสินใจสมัคร |
| **shipment timeline ใหม่ 4 จุด** | สร้างพัสดุ → รับเข้าระบบแล้ว → กำลังจัดส่ง → จัดส่งสำเร็จ — **ยกรูปแบบข้อมูล/ลำดับจาก `MiniShipmentTimeline.tsx` ฝั่งร้าน 1:1** (index ปัจจุบันคำนวณด้วย `deriveShippingStage()` ตัวเดียวกันตาม BR-BOE-12) แต่ประกอบด้วย MUI `@mui/lab/Timeline` — **ไม่ยกโค้ด Paces ข้ามสกิน** |
| **timeline เก่า (3-step order-lifecycle) กับใหม่ (4-node parcel) ไม่แสดงพร้อมกัน** | มี `shipmentTracking` → แสดง 4-node parcel timeline แทน 3-step เดิม · ไม่มี (digital/service/ยังไม่เปิดพัสดุ) → คง 3-step เดิม (`getOrderTimeline` ไม่แก้) — ไม่ให้ progress bar 2 อันเล่าเรื่องเดียวกันคนละความละเอียดพร้อมกัน |
| **`maxWidth: 640`/`420` คงที่ ถูกถอดทั้งหมด** | เป็นต้นเหตุที่หน้าไม่ responsive เลยตาม FR-018 |

🛑 **จุดที่ Controller ต้องตัดสินก่อน implement — ดู §Controller note ท้ายเอกสาร (ข้อ C-1):** ux เสนอ mobile `<900` / tablet `900–1199` ขณะที่ **BRD FR-018 AC ที่ user อนุมัติแล้วเขียนว่า mobile ≤767 / tablet 768–1199** และโค้ดจริงของ `(buyer-app)/layout.tsx` สลับ sidebar ที่ **768px** — เอกสารนี้ยึด **768** เป็นค่าที่ใช้จริงจนกว่าจะมีมติเปลี่ยน

---

## 1. Layout (ASCII wireframe)

### A) Guest View — ยังไม่ login

**Mobile**
```
┌──────────────────────────────┐
│ [Logo]            เข้าสู่ระบบ │ ← o/layout.tsx guest header (เบา)
├──────────────────────────────┤
│  ▓▓▓▓ tier-gradient banner ▓▓ │ ← ProfileBanner (เดิม)
│        ( avatar 84px )        │
│         ร้านค้า XXX            │
│      [ยืนยันแล้ว][Deep Star]   │
├──────────────────────────────┤
│ [รอดำเนินการ]      #DP..วันที่│ ← SSOT badge (resolveOrderStatusBadge)
├──────────────────────────────┤
│ การจัดส่ง                     │
│ Flash Express · DP1234567890  │
│ ○──●──○──○  กำลังจัดส่ง       │ ← 4-node parcel timeline (ถ้ามี shipment)
├──────────────────────────────┤
│ รายการสินค้า (การ์ด)          │
│ ...items...                   │
│ ยอดรวม             ฿1,290     │
├──────────────────────────────┤
│ วิธีชำระเงิน (การ์ด)          │
├──────────────────────────────┤
│ เบอร์ผู้รับ  •••-•••-891       │ ← guest-safe summary card (ใหม่)
│ ที่อยู่จัดส่ง จ.สมุทรปราการ    │
│              •••45 ต.•••ยว…   │
├──────────────────────────────┤
│ ให้คะแนนร้านนี้ (teaser)       │ ← เฉพาะ status ∈ {SHIPPED,CONFIRMED}
│ เข้าสู่ระบบเพื่อรีวิว →         │
├──────────────────────────────┤
│ ต้องการความช่วยเหลือ?          │
│ [ (icon) ติดต่อร้านค้า ]       │ ← กดแล้ว → /auth/sign-in
│ ยังไม่ได้รับสินค้า?            │
├──────────────────────────────┤
│ ปกป้องการซื้อขายโดย Deep       │
└──────────────────────────────┘
┌──────────────────────────────┐
│ เข้าสู่ระบบเพื่อยืนยันรับสินค้า│ ← sticky bottom CTA (<1200px)
│ ต้องเข้าสู่ระบบก่อนยืนยัน แนบ │
│ สลิป เขียนรีวิว หรือแจ้งปัญหา │
└──────────────────────────────┘
```

**Tablet** — เหมือน mobile แต่คอนเทนต์รวบเข้า `max-width: 720px` กึ่งกลางจอ (ไม่ full-bleed) padding ข้างละ 32px การ์ดกว้างขึ้นแต่ยัง **1 คอลัมน์** (sticky bottom bar ยังอยู่)

**Desktop (≥1200px)**
```
┌────────────────────────────────────────────────────────────┐
│ [Logo]                                        เข้าสู่ระบบ    │
├────────────────────────────────────────────────────────────┤
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ tier-gradient banner (full width) ▓▓▓▓▓▓▓  │
│                    avatar + ร้านค้า XXX + chips              │
├────────────────────────────────────────────────────────────┤
│ [รอดำเนินการ]                                  #DP.. วันที่ │
├──────────────────────────────────────┬───────────────────────┤
│ (main, 8/12)                         │ (sidebar sticky, 4/12)│
│ การจัดส่ง + 4-node timeline           │ ยอดที่ต้องชำระ        │
│ รายการสินค้า + ยอดรวม                 │      ฿1,290           │
│ วิธีชำระเงิน                          │ [เข้าสู่ระบบเพื่อ      │
│ เบอร์ผู้รับ/ที่อยู่ (masked)          │  ยืนยันรับสินค้า]      │
│ ให้คะแนนร้านนี้ (teaser)              │ ต้องเข้าสู่ระบบก่อน... │
│                                        │ ─────────────────────│
│                                        │ ต้องการความช่วยเหลือ?│
│                                        │ [ติดต่อร้านค้า]       │
│                                        │ ยังไม่ได้รับสินค้า?   │
└──────────────────────────────────────┴───────────────────────┘
```

### B) Full View — authenticated (เจ้าของออเดอร์)

**Mobile** — โครงเดียวกับ guest **ยกเว้น**: header เป็นแบบ authenticated · เบอร์/ที่อยู่โชว์เต็มไม่ mask · **ลำดับการ์ด (FR-010 บังคับ):**

```
Hero → Status → [Appointment ถ้ามี] → [ยกเลิก-เหตุผล ถ้า CANCELLED]
→ รายการสินค้า+ยอดรวม → วิธีชำระเงิน → การจัดส่ง(+timeline)
→ ** แนบสลิป (ต้องอยู่ตรงนี้ — ก่อนรีวิวเสมอ) **
→ ลิงก์เข้าถึง (digital, ถ้ามี)
→ ** โซนรีวิว (3 สถานะ — ดู §C) **
→ ต้องการความช่วยเหลือ? (ติดต่อร้านค้า / ยังไม่ได้รับสินค้า — ดู §D)
→ footer trust caption
```

sticky bottom bar: ปุ่มยืนยัน (ถ้า `canConfirm`) + ยกเลิก (ถ้า PENDING)

**Tablet** — เหมือน guest tablet (1 คอลัมน์ กว้างขึ้น, sticky bottom bar คงอยู่) + `AccountSidebar` ซ้ายโผล่ตั้งแต่ 768px ตามโครง buyer-app เดิม

**Desktop (≥1200px)**
```
┌────────────────────────────────────────────────────────────┐
│ Header (โลโก้+เมนูกลาง+แจ้งเตือน+avatar)                    │
├───────────┬────────────────────────────────────────────────┤
│ Account   │  ▓▓▓ tier-gradient banner ▓▓▓  avatar+ร้าน+chips│
│ Sidebar   ├────────────────────────────────────────────────┤
│ (240px)   │ [กำลังจัดส่ง]                       #DP.. วันที่│
│           ├──────────────────────────┬─────────────────────┤
│  บัญชี    │ (main 8/12)              │ (sidebar sticky 4/12)│
│  ของฉัน   │ การจัดส่ง+timeline        │ ยอดรวม  ฿1,290       │
│  · คำสั่งซื้อ│ รายการสินค้า+ยอดรวม      │ [ยืนยันรับสินค้า]     │
│  · รีวิว   │ วิธีชำระเงิน              │ ยกเลิกคำสั่งซื้อ      │
│  · เหรียญ  │ ** แนบสลิป **             │ ─────────────────────│
│  · ...     │ ** โซนรีวิว (3 สถานะ) **  │ ต้องการความช่วยเหลือ?│
│           │                           │ [ติดต่อร้านค้า]       │
│           │                           │ ยังไม่ได้รับสินค้า?   │
└───────────┴──────────────────────────┴─────────────────────┘
```

### C) โซนรีวิว — 3 สถานะ (ตำแหน่งเดียวกันทุก breakpoint)

**State 1 — ยังไม่รีวิว** (`canReview` และไม่มี review)
```
┌ รีวิวร้านค้า ─────────────────────┐
│ สินค้าถึงมือคุณแล้ว                │
│ ให้คะแนนร้านนี้เพื่อช่วยผู้ซื้อคนอื่น│
│  ★ ★ ★ ★ ★  (MUI Rating, เดิม)     │
│  [กล่องความเห็น 500 ตัวอักษร]      │
│  แนบรูป (ไม่บังคับ, สูงสุด 4 รูป)   │
│  ┌───┬───┬───┬───┐                 │
│  │ + │   │   │   │ ← ลบได้ (× มุมขวาบน) │
│  └───┴───┴───┴───┘                 │
│  [ส่งรีวิว]                        │
└─────────────────────────────────────┘
```

**State 2 — รีวิวแล้ว (active)** + แก้ไข/ลบได้ถ้ายังในกรอบ 24 ชม.
```
┌ รีวิวของคุณ ──────────────────────┐
│ ★★★★☆ (4/5)          [รีวิวแล้ว]  │
│ "ส่งไวมาก แพ็คดี"                  │
│ ┌───┬───┐  (รูปแนบ ถ้ามี)          │
│ │img│img│                          │
│ └───┴───┘                          │
│ คุณ · 01 ส.ค. 2569 19:30           │
│ ─────────────────────────────────  │
│ (icon) แก้ไขได้อีก 6 ชม. 12 นาที   │ ← เฉพาะเมื่อ canEditReview()=true
│ [แก้ไขรีวิว]  [ลบรีวิว]            │ ← หายไปหลังพ้น 24 ชม. (รีวิวยังโชว์ปกติ)
│ ─────────────────────────────────  │
│ ร้านค้าตอบกลับ                     │ ← เฉพาะเมื่อมี shopReplyComment
│ "ขอบคุณที่อุดหนุนค่ะ"              │
│ 03 ส.ค. 2569                       │
└─────────────────────────────────────┘
```

**State 3 — soft-deleted** (TD-002, `hasReview && !review`)
```
┌───────────────────────────────────┐
│    (icon: tabler-mood-sad, เทา)    │
│   คุณลบรีวิวนี้ไปแล้ว               │
│   รีวิวที่ลบแล้วไม่สามารถ           │
│   เขียนใหม่สำหรับคำสั่งซื้อนี้ได้อีก │
└───────────────────────────────────┘
```
**น้ำหนักการ์ด: เบากว่า state 1/2** — ไม่มีกรอบ error/แดง · ไอคอนโทน `text.disabled` · พื้นหลัง `action.hover` จาง ๆ ไม่ใช่การ์ดขาวเต็ม (สื่อว่า "ปิดจบแล้ว" ไม่ใช่ "ผิดพลาด")

### D) ปุ่ม Dispute + ติดต่อร้านค้า (คำตอบของ SDS TD-001)

```
┌ ต้องการความช่วยเหลือ? ─────────────┐
│ ┌──────────────────────────────┐  │
│ │ (tabler-headset) ติดต่อร้านค้า│  │ ← outlined, ทุกสถานะ, ทุก breakpoint
│ └──────────────────────────────┘  │
│                                     │
│ ยังไม่ได้รับสินค้า?                │ ← text-button, เบากว่า (ไม่ชวนกดพลาด)
│ แจ้งร้านค้าว่าคำสั่งซื้อนี้มีปัญหา   │
└─────────────────────────────────────┘
```

- **render เมื่อไหร่:** การ์ดนี้แสดง **ทุกสถานะ** — "ติดต่อร้านค้า" render เสมอไม่มีเงื่อนไข (BR-BOE-16) · "ยังไม่ได้รับสินค้า?" render เฉพาะ `status ∉ {CONFIRMED, CANCELLED}` (BR-BOE-13) — **ไม่ render เป็นปุ่มเทา disabled ทิ้งไว้** เพราะสองสถานะนั้นไม่มีเหตุผลทางธุรกิจให้แจ้งปัญหาแล้ว (การ์ดยังอยู่ แค่ปุ่มหายไป)
- **already-open state:** ถ้า `hasOpenDispute()` = true → แทนที่ปุ่มด้วยแถบสถานะกดไม่ได้ `แจ้งปัญหาแล้ว เมื่อ {วันที่}` โทน **`warning` ไม่ใช่ `error`** (เป็นสถานะ "รอดำเนินการ" ไม่ใช่ "ผิดพลาด")
- **กดปุ่ม** → `Dialog` (Base เดียวกับ cancel dialog ที่มีอยู่แล้วในไฟล์เดียวกัน): ไอคอน `tabler-flag-3` **สีเทา** (ไม่ใช่แดง — ยังไม่ใช่การกระทำทำลาย) + textarea optional ≤500 + ปุ่ม `[ยกเลิก] [แจ้งปัญหา]` ปุ่มยืนยันสี **`warning`** — น้ำหนักตรงกับสิ่งที่มันทำจริง (ติดธงเตือน ไม่ใช่ยกเลิก/ลบ)
- **น้ำหนักที่ "ไม่ชวนกดพลาด":** ปุ่มนี้เป็น `variant='text'` เล็กกว่า "ติดต่อร้านค้า" (outlined) และอยู่ **ต่ำกว่าเสมอ** — ลำดับสายตา: ทางแก้ที่เบากว่ามาก่อน ทางที่หนักกว่ามาทีหลัง

### E) Facebook OTP context (FR-005) — ปรับ copy บน `PhoneVerifyPrompt.tsx` เดิม ไม่ใช่จอใหม่

```
ยืนยันเบอร์ที่ใช้สั่งซื้อ
เพื่อดูคำสั่งซื้อ #DP2569-0012 จาก "ร้านค้า XXX"
```

🛑 **ต้องยืนยันก่อน implement** — ต้องส่ง `orderNo`/`shopName` เป็น prop ใหม่เข้า `PhoneVerifyPrompt` (ปัจจุบันรับแค่ `token`) ซึ่งแปลว่า `page.tsx` ต้อง query ข้อมูลออเดอร์ใน branch `PHONE_VERIFY_REQUIRED` ที่ **ยังไม่ผ่าน `resolveOrderAccess`** — เป็นคำถาม PII ไม่ใช่แค่ scope (ดู §Controller note ข้อ C-2)

---

## 2. Section breakdown

**1. `o/layout.tsx` (ใหม่)** — server component แยก guest/authenticated จาก `getServerSession`
- **Guest:** header ใหม่ strip จาก `Header.tsx` — เหลือ `Logo` (ซ้าย) + ปุ่ม `เข้าสู่ระบบ` (`variant='outlined'`, ขวา) บน container เดิม (กว้าง/สูงตรงกับ header ทั้งเว็บ) ไม่มี `FrontMenu`/`ModeDropdown`/hamburger · **คง `Footer` ไว้** (สัญญาณความน่าเชื่อถือของแบรนด์ที่ guest ที่ยังสงสัยว่า "ของจริงไหม" ควรเห็น)
- **Authenticated:** reuse โครง `(buyer-app)/layout.tsx` (component เดียวกัน ไม่ reuse route group) — `FrontLayout solidHeader` + `AccountSidebar` + `ScrollToTop` · เช็คไม่ให้ `BuyerChatWidget` mount ซ้ำถ้า nested

**2. `GuestOrderView.tsx` (ใหม่)** — client component รับข้อมูลที่ mask แล้วจาก server · ทุกปุ่มที่ผูกตัวตนเป็น `<Link href="/auth/sign-in?callbackUrl=/o/{token}">` ที่ยิง `POST /api/orders/{token}/auth-flow/start` แบบ fire-and-forget ก่อน navigate (TFR-001)

**3. `OrderDetailMobile.tsx` (แก้)** — reorder ตาม §B · เพิ่ม `ShippingProgressCard` (merge tracking-card เดิม + timeline ใหม่) · ลบ `STATUS_LABEL`/`STATUS_COLOR` local ใช้ `resolveOrderStatusBadge` แทน · เพิ่ม responsive Grid wrapper · เพิ่ม help-card + dispute dialog

**4. `ReviewForm.tsx` (แก้)** — ล้าง hardcode hex (`#0F172A`/`#94A3B8`/`#CBD5E1`/`13px` → `theme.palette.primary`/`text.secondary`/`text.disabled`/`variant='caption'`) · เพิ่มโหมด `create|edit` · เพิ่ม photo grid ≤4 · เพิ่ม countdown

**5. `seller/(dashboard)/reviews/*` (Paces, แก้)** — เพิ่ม reply UI ในคอลัมน์ "รีวิว" ทั้ง desktop table cell และ `mobileCard`

---

## 3. Theme Source Mapping

| Section | Theme file path | Component | หมายเหตุ adapt |
|---|---|---|---|
| Guest/Auth header split | `src/components/layout/front-pages/Header.tsx` (pattern ในโปรเจกต์) | `Header` | ตัด `FrontMenu`/`ModeDropdown`/hamburger เหลือ Logo + ปุ่มเดียว |
| Authenticated shell | `src/app/(marketing)/(buyer-app)/layout.tsx` | `FrontLayout solidHeader` + `AccountSidebar` | reuse component ตรง ๆ ไม่ reuse route group (ตาม SDS) |
| Hero/identity/status/items/payment/slip/digital-link/cancel-dialog | `theme/vuexy/.../views/pages/user-profile/UserProfileHeader.tsx` + `.../orders/details/OrderDetailsCard.tsx` + `.../dialogs/two-factor-auth/index.tsx` | ของเดิมทั้งหมด | คงเดิม เปลี่ยนแค่ wrapper (Grid responsive) |
| **Shipment 4-node timeline (ใหม่)** | `theme/vuexy/.../views/apps/ecommerce/orders/details/ShippingActivityCard.tsx` | `@mui/lab/Timeline` + `TimelineDot` + `TimelineConnector` | ตัด dynamic list เหลือ 4 node คงที่ · **ข้อมูล/ลำดับ node ยกจาก `MiniShipmentTimeline.tsx` ฝั่งร้าน (ห้ามยกโค้ด Paces)** |
| **2-column desktop reflow (ใหม่)** | `theme/vuexy/.../views/apps/ecommerce/orders/details/index.tsx` | `Grid size={{xs:12,lg:8}}` / `{lg:4}` | เปลี่ยน key `md`→`lg` (threshold 1200 ไม่ใช่ 900) |
| **Sidebar action panel / help card (ใหม่)** | `theme/vuexy/.../views/apps/ecommerce/orders/details/CustomerDetailsCard.tsx` | `Card`+`CardContent`+`CustomAvatar skin='light'`+icon-row | pattern เดียวกับการ์ด payment/shipment ที่ไฟล์นี้ใช้อยู่แล้ว |
| **Review photo grid (ใหม่)** | `theme/vuexy/.../views/apps/ecommerce/products/add/ProductImage.tsx` | thumbnail + remove(×) list | **ตัด `react-dropzone` ทิ้ง** — ใช้ hidden `<input type=file>` + ref ตาม pattern ที่โปรเจกต์ใช้อยู่แล้ว |
| **Dispute dialog (ใหม่)** | `theme/vuexy/.../components/dialogs/two-factor-auth/index.tsx` (ใช้ซ้ำจาก cancel-dialog ในไฟล์เดียวกัน) | `Dialog`+`DialogContent`+`DialogActions` | icon `tabler-flag-3` สีเทา · ปุ่มยืนยันสี `warning` |
| **Review reply UI (Paces, ใหม่)** | `theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx` | `textarea.form-textarea` + `btn btn-sm btn-primary` | pattern เดียวกับปุ่ม "ดู" ที่มีอยู่ใน `ProductReviews.tsx` |
| **Delete-reply confirm (Paces)** | `theme/paces/.../plugins/sweet-alerts/components/SweetAlerts.tsx` ผ่าน `src/lib/paces-swal.ts` | `pacesConfirm.danger()` | HR8 บังคับ ห้ามประดิษฐ์ modal เอง |
| **Kebab action (Paces)** | `theme/paces/.../ui/dropdowns/page.tsx` | `.hs-dropdown` + `.btn.btn-icon` | ต้อง `size-11` (44px) explicit — `.btn.btn-icon` เดิมวัดได้ 37px ไม่ผ่าน tap-target |

---

## 4. Content outline (UX copy ภาษาไทย)

**Guest CTA**
- primary (PENDING/SHIPPED): `เข้าสู่ระบบเพื่อยืนยันรับสินค้า`
- primary (CONFIRMED/CANCELLED): `เข้าสู่ระบบเพื่อดูรายละเอียดคำสั่งซื้อ`
- microcopy ใต้ปุ่ม: `ต้องเข้าสู่ระบบก่อนยืนยัน แนบสลิป เขียนรีวิว หรือแจ้งปัญหา`
- teaser รีวิว (status ∈ {SHIPPED, CONFIRMED}): `ให้คะแนนร้านนี้` + ลิงก์ `เข้าสู่ระบบเพื่อรีวิว →`

**ป้ายสถานะออเดอร์ (SSOT เดียวกับฝั่งร้าน — FR-020/HR16)**
`PENDING` = `รอดำเนินการ` · `SHIPPED` = `กำลังจัดส่ง` · `CONFIRMED` = `สำเร็จ` · `CANCELLED` = `ยกเลิก`

**Masked data labels**
- `เบอร์ผู้รับ` → `•••-•••-891`
- `ที่อยู่จัดส่ง` → `จ.{province}` เต็ม + บรรทัดรอง `{line1} ต.{subdistrict} อ.{district} {postcode}` (แต่ละท่อน mask 3 ตัวท้าย)
- ไม่มีเบอร์ (`maskedPhone = null`) → **ไม่ render แถวนี้เลย** ไม่ใช่ `"ไม่ระบุ"`

**Dispute**
- ปุ่ม `ยังไม่ได้รับสินค้า?` · dialog title `แจ้งปัญหาคำสั่งซื้อนี้`
- body `บอกร้านค้าว่าเกิดอะไรขึ้น (ไม่บังคับ)` + placeholder `เช่น ยังไม่ได้รับของ / ของไม่ตรงกับที่สั่ง`
- ปุ่มยืนยัน `แจ้งปัญหา` (ไม่ใช่ "ยืนยัน" เฉย ๆ — สื่อผลลัพธ์)
- toast สำเร็จ `แจ้งปัญหาแล้ว ร้านค้าจะเห็นข้อความนี้`
- error 409 `คำสั่งซื้อนี้ปิดจบไปแล้ว แจ้งปัญหาไม่ได้` (มาจาก route ตรง ๆ)
- already-open badge `แจ้งปัญหาแล้ว เมื่อ {formatDateTimeTH}`

**ติดต่อร้านค้า** — ปุ่ม `ติดต่อร้านค้า` (ไอคอน `tabler-headset`) · หัวข้อการ์ด `ต้องการความช่วยเหลือ?`

**รีวิว**
- แก้ไขได้ `แก้ไขได้อีก {ชม.} ชม. {นาที} นาที`
- หมดเวลา — **ไม่แสดงบรรทัดนี้เลย** (ไม่บอก "หมดเวลาแล้ว" ซ้ำ รีวิวยังอยู่ปกติ)
- ปุ่ม `แก้ไขรีวิว` / `ลบรีวิว`
- ยืนยันลบ: title `ลบรีวิวนี้?` body `ลบแล้วจะเขียนรีวิวใหม่สำหรับคำสั่งซื้อนี้อีกไม่ได้` ปุ่ม `[ไม่ลบ] [ลบรีวิว]` (สี error)
- state 3: `คุณลบรีวิวนี้ไปแล้ว` / `รีวิวที่ลบแล้วไม่สามารถเขียนใหม่สำหรับคำสั่งซื้อนี้ได้อีก`
- แนบรูป label `แนบรูป (ไม่บังคับ, สูงสุด 4 รูป)`
- error ไฟล์เกินเพดาน — ใช้ข้อความจาก `checkUploadPolicy`/`oversizeMessage` ตรง ๆ (SSOT ห้ามเขียนใหม่)
- shop reply label `ร้านค้าตอบกลับ`

**Paces (ร้าน)**
- ปุ่ม `ตอบกลับ` · placeholder `พิมพ์คำตอบถึงลูกค้า...` · ปุ่มส่ง `ส่งคำตอบ`
- เมนู `⋯` → `แก้ไขคำตอบ` / `ลบคำตอบ`
- ลบ confirm (`pacesConfirm.danger`): title `ลบคำตอบนี้?` text `คำตอบจะหายจากรีวิวนี้ถาวร`

---

## 5. Edge states

- **guest, token ไม่มีจริง** → `notFound()` เดิม (ไม่รั่วว่า format ถูกไหม)
- **guest, ไม่มี `shipmentTracking`** → ไม่ render การ์ด "การจัดส่ง" เลย (พฤติกรรมเดิม คงไว้)
- **guest, `maskedPhone = null`** → ไม่แสดงแถวเบอร์
- **authenticated, ไม่มีรีวิวและ `status = PENDING`** → ไม่ render โซนรีวิวเลย (ยังไม่ถึงสิทธิ์)
- **review comment ยาว** → **ไม่ใช้ `line-clamp`** (ความเห็นสำคัญ ต้องอ่านครบ) — ฟอร์มจำกัด 500 ตัวอักษรอยู่แล้ว
- **ชื่อร้าน/สินค้ายาวผิดปกติ** → `text-overflow: ellipsis` เดิมคงไว้ · **ตรวจซ้ำหลัง reflow** ว่ายังทำงานในคอลัมน์ desktop ที่แคบกว่าเดิม
- **shipment PROBLEM** → dot สี `error` + แถบข้อความเหนือ stepper `พัสดุมีปัญหา` (**ไม่ใช้เขียวที่ node ไหนเลยในเคสนี้**)
- **shipment AWAITING_COD / DONE** → ทุกจุดเขียว label สุดท้าย `จัดส่งสำเร็จ` — **ไม่แสดงคำว่า "รอเงิน COD" ให้ผู้ซื้อเห็น** (ภาษาฝั่งบัญชีร้าน ไม่ใช่สิ่งที่ผู้ซื้อควรต้องเข้าใจ; พัสดุถึงมือแล้วคือข้อเท็จจริงที่ผู้ซื้อสนใจ)
- **dispute กดซ้ำขณะมีเรื่องเปิดค้าง** → UI **ไม่ยิง request ซ้ำเลย** (ปุ่มถูกแทนที่ด้วยแถบสถานะ non-interactive ตั้งแต่โหลดหน้าแรก — ไม่ต้องรอ 409 มาบอก)
- **loading state ทุกปุ่ม async** → เปลี่ยนข้อความเป็น `กำลัง...` + `disabled` (pattern เดิม คงไว้)
- **Paces reviews: 0 รีวิว** → empty state เดิมคงไว้ทั้งคู่
- **Paces: รีวิวมีรูปแนบ** → thumbnail 40px ใต้ comment คลิกเปิด `target=_blank` (**ตัดสินใจ: ไม่ทำ lightbox ใหม่รอบนี้** — ดู §Controller note C-4)

---

## 6. Impeccable compliance

- **Mode:** **Read** (guest view — เป้าหมายคือความเข้าใจ+ความมั่นใจ การกระทำน้อยที่สุด) → **Operate** (authenticated view — งานคือทำ task ให้จบ ลำดับชั้น/ความชัดเจนชนะการแสดงออก) · แต่ register ของ route group นี้คือ **`brand`** ตาม `PRODUCT.md` (`/o/[token]` อยู่ในรายชื่อ default-brand surface) แปลว่าแม้เป็น Operate ก็ยังต้องอบอุ่น/ขัดเกลากว่าหลังบ้านทั่วไป — tier-gradient banner, avatar overlap ยังคงอยู่ (ไม่ใช่ตารางเปล่า)
- **One Voice (ม่วง ≤10%):** ม่วง `#7367F0` ปรากฏเฉพาะ CTA primary (ยืนยัน/เข้าสู่ระบบ/ส่งรีวิว/แก้ไขรีวิว), ลิงก์ (ชื่อร้าน→`/u/username`, "แก้เบอร์"), focus ring, ไอคอนลิงก์เข้าถึง digital — **ไม่ใช้ม่วงกับ "ติดต่อร้านค้า"/"ยังไม่ได้รับสินค้า"** (outlined `secondary` / text ธรรมดา — ไม่ใช่ conversion path หลักของหน้า)
- **Verified-Means-Green:** เขียวใช้เฉพาะ verified chip · badge `CONFIRMED` (SSOT `success`) · node "จัดส่งสำเร็จ"/DONE (ข้อเท็จจริงที่ขนส่งยืนยันแล้ว — precedent เดียวกับที่ `order-stage.ts` เขียนไว้เองฝั่ง seller) · badge "รีวิวแล้ว"/"แนบสลิปแล้ว" (สถานะสำเร็จของ action ที่ผู้ใช้เพิ่งทำ) · **ไม่ใช้เขียว** กับ PENDING, "แจ้งปัญหาแล้ว" (เป็น `warning` — ยังไม่คลี่คลาย), shop reply badge (`info`/primary tint — ไม่ใช่ fact ที่ verify ได้)
- **Ink-Tinted Shadow:** ทุกการ์ดใช้ MUI `Card` default (ผูกกับ `theme.shadows` ที่ derive จาก Ink Plum ผ่าน `@core` override อยู่แล้ว) — ไม่มีจุดไหน hand-roll `box-shadow` ดำสนิทใหม่
- **Sentence case:** ทุก label เป็น sentence case ไทยล้วน ไม่มี ALL CAPS
- **anti-slop ที่ตรวจแล้ว:** ไม่มี hero-metric template (ยอดเงินใหญ่มีจุดเดียว) · ไม่มีการ์ดซ้อนการ์ด · ไม่มี eyebrow ตัวพิมพ์เล็กเหนือ section เกินจำเป็น · ไม่มี gradient text · ไม่มี border-left ตกแต่ง
- **จุดที่ theme ขัดกับ Impeccable:** ไม่มีจุดขัดตรง ๆ — จุดเดียวที่ตัดสินเองนอกเหนือ Vuexy demo คือ breakpoint key ของ Grid (`lg` แทน `md`) ซึ่งเป็นการปรับตัวเลข ไม่ใช่ปรับสี/น้ำเสียง (theme ชนะเรื่อง markup · Impeccable ไม่เกี่ยวกับ breakpoint number จึงไม่ใช่ conflict จริง)

---

## 7. Design decisions + rationale

1. **Merge tracking-card + parcel-timeline เป็นการ์ดเดียว** — ลดการซ้ำของข้อมูล "สถานะพัสดุ" ที่เดิมกระจายเป็น status-chip + tracking-card + (ถ้าเพิ่มแยก) timeline-card รวม 3 จุด
2. **desktop sidebar แทน sticky-bottom-bar ที่ ≥1200px** — ตอบ anti-slop เรื่องคอลัมน์ว่างบนจอกว้าง โดยใช้ pattern จริงของ Vuexy ไม่ใช่แค่ขยาย max-width
3. **guest เห็น help-card เต็มแบบเดียวกับ authenticated (ปุ่มพาไป login แทนการซ่อน)** — ตรงเป้าหมาย PRD "เห็นคุณค่าก่อนถูกขอให้ล็อกอิน" มากกว่าการซ่อนความสามารถไว้จนกว่าจะ login
4. **AWAITING_COD ไม่โชว์คำว่า "รอเงิน COD" ให้ผู้ซื้อ** — ภาษาฝั่งบัญชีร้าน ตรงกับที่ `MiniShipmentTimeline.tsx` เองเลือกโชว์สถานะเต็มไม่ใช่สถานะกลาง

---

## 8. Controller note — จุดที่ต้องตัดสิน/ยืนยันก่อน implement

- **C-1 (breakpoint ขัดกับ BRD):** ux เสนอ mobile `<900` / tablet `900–1199` แต่ **BRD FR-018 AC ที่ user อนุมัติแล้วเขียน mobile ≤767 / tablet 768–1199** และโค้ดจริง `(buyer-app)/layout.tsx:49-54` สลับ `AccountSidebar` ที่ **768px** ด้วย `min-[768px]:` พร้อมคอมเมนต์อธิบาย remap (`md`=900/`lg`=1200) — **Controller ยึด 768 ตาม BRD + โค้ดจริง** เพราะถ้าใช้ 900 จะเกิดช่วง 768–899 ที่ sidebar โผล่แล้วแต่เนื้อหายังเป็นโหมด mobile full-bleed · mockup สร้างตาม 768
- **C-2 (FR-005 PII gate):** การส่ง `orderNo`/`shopName` เข้า `PhoneVerifyPrompt` ต้อง query ออเดอร์ใน branch `PHONE_VERIFY_REQUIRED` ซึ่ง **ยังไม่ผ่าน `resolveOrderAccess`** — เป็นคำถามความปลอดภัย ไม่ใช่แค่ scope **ต้องให้ user/security ตัดสินก่อน** (ทางเลือกที่ปลอดภัยกว่า: แสดงแค่ชื่อร้าน หรือไม่แสดงอะไรเลยแล้วใช้ copy ทั่วไป)
- **C-3 (icon dispute):** ux เลือก `tabler-flag-3` — **ยืนยันแล้วว่ามีอยู่จริงใน `generated-icons.css`** (พร้อม `tabler-headset`, `tabler-mood-sad`) ไม่ต้องถามเพิ่ม เว้นแต่ user อยากได้ตัวอื่น
- **C-4 (Paces reply lightbox):** รอบนี้เลือก `target=_blank` แทน lightbox ใหม่ — ถ้าต้องการ lightbox (reuse `SlipViewer`) ต้องขยาย scope และผ่าน ux gate รอบใหม่
- **C-5 (desktop 3 แถบที่ 1200–1280px):** `AccountSidebar` 240px + main 8/12 + order-sidebar 4/12 อาจแน่นที่ขอบล่างของช่วง — **ต้อง browser QA จริง** ยังไม่เคยทดสอบภาพสำหรับหน้านี้
