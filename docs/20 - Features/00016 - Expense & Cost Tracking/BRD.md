---
title: "BRD — Expense & Cost Tracking"
owner: shinobu22
status: draft
module: M00016-ExpenseCostTracking
version: "1.0"
created: 2026-07-08
tags: [feature, expense, cost, profit, pnl, seller, business-package, brd]
related: ["[[PRD]]", "[[Feature-Docs-Ownership]]"]
---

> **โมดูล:** M00016-ExpenseCostTracking
> **ประเภทเอกสาร:** Business Requirements Document (BRD) — NON-TECHNICAL
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-07-08
> **สถานะ:** Draft
> **เจ้าของเอกสาร:** BA (ดู [[Feature-Docs-Ownership]])

# BRD: บันทึกค่าใช้จ่าย + ตั้งต้นทุนสินค้า (Expense & Cost Tracking) (Business Requirements Document)

---

## 1. บทนำ

### 1.1 วัตถุประสงค์ของเอกสาร

เอกสารนี้มีวัตถุประสงค์เพื่อ:
1. กำหนด Functional Requirements ระดับ non-technical สำหรับการบันทึกค่าใช้จ่าย, การตั้ง/snapshot ต้นทุนสินค้า, และรายงานกำไรขาดทุนเต็มรูป (full P&L) บนหน้าใหม่ `/expenses`
2. กำหนดขอบเขตการทำงานของ fixed expense category, กฎการคำนวณ P&L, กฎ finance-visibility toggle, และกฎ gate ด้วย Business Package (bundled paid add-on)
3. ระบุเงื่อนไขการรับงาน (Acceptance Criteria) แบบ Given/When/Then ที่ทีม QA นำไปสร้าง Test Case ได้โดยตรง — โดยเฉพาะความถูกต้องของสูตร P&L และ authorization ต่อ shopId
4. สร้างความเข้าใจร่วมกันระหว่างทีมธุรกิจและทีมพัฒนา ก่อนเริ่ม implement feature

### 1.2 ขอบเขตของระบบ

**Expense & Cost Tracking** คือระบบที่ให้ Seller บันทึกรายการค่าใช้จ่ายดำเนินธุรกิจ (แยก 7 หมวดคงที่) และตั้งราคาทุนสินค้า (optional) ที่ถูก snapshot ลงในแต่ละ order item ตอนขายจริง เพื่อคำนวณรายงานกำไรขาดทุนเต็มรูป (Revenue → COGS → Gross Profit → Expense → Net Profit) ตามช่วงเวลาที่เลือก ระบบทั้งหมดอยู่บนหน้าใหม่ `/expenses` (Paces, `(paces)/seller/**`) ที่เข้าถึงได้เฉพาะร้านของ owner ที่มี Business Package (feature 00008) สถานะ ACTIVE เท่านั้น (bundled — ไม่มี billing แยก) และเห็นข้อมูลได้เฉพาะ owner หรือ admin ที่ owner เปิดสิทธิ์ให้ผ่าน toggle ระดับร้าน

**เข้าสู่ระบบ (Input):**
- ฟอร์มบันทึก/แก้ไข Expense: `amount`, `category` (จาก fixed list), `expenseDate`, `note` (optional)
- ฟอร์มตั้งต้นทุนสินค้า: `Product.cost` (optional, ≥0)
- ช่วงเวลาที่ seller เลือกดูรายงาน (`startDate`, `endDate`)
- Session ปัจจุบัน (`session.user.id`) + shop context (active shop ที่กำลังดู)
- ข้อมูลจาก DB ที่มีอยู่แล้ว: `Order` (status, totalAmount, createdAt, shopId), `OrderItem` (qty, cost ใหม่), `BusinessPackageSubscription` (สถานะของ owner), `ShopMember` (role ของผู้ใช้ปัจจุบันต่อ shop)

**ออกจากระบบ (Output):**
- Expense record ที่สร้าง/แก้/ลบสำเร็จ
- `Product.cost` ที่อัปเดต (ไม่กระทบ `OrderItem.cost` เก่า)
- รายงาน P&L (Revenue/COGS/Gross Profit/Total Expense/Net Profit) ของช่วงเวลาที่เลือก พร้อม flag คำเตือนถ้าข้อมูลต้นทุนไม่ครบ
- Locked/upsell state ถ้า owner ของ shop นั้นไม่มี Business Package ACTIVE
- Validation error (amount ≤ 0, category ไม่ถูกต้อง, cost ติดลบ)

**ระบบที่เกี่ยวข้อง:**
- `business-package.service.ts` (`getSubscriptionStatus`) — entitlement gate (feature 00008, live)
- `subscription-overview.service.ts` — ตัวอย่าง pattern resolve owner/shop ที่มีอยู่แล้ว ใช้อ้างอิง reuse
- `shop-member.service.ts` + `ShopMember` model — role OWNER/ADMIN ต่อ shop (feature 00008/00012, live)
- `dashboard.service.ts` — pattern การนับ revenue ตาม `Order.createdAt`/`status='CONFIRMED'` ที่มีอยู่แล้ว (ต้องสอดคล้องกัน)
- `product.service.ts` — เพิ่ม field `cost` เข้าฟอร์ม/validation สินค้าเดิม
- `order.service.ts` (จุดสร้าง order) — เพิ่ม logic snapshot `OrderItem.cost` ที่เดียวกับที่ snapshot `OrderItem.price` อยู่แล้ว

### 1.3 กลุ่มผู้ใช้งาน

| กลุ่มผู้ใช้ | บทบาท | สิทธิ์การใช้งาน |
|-----------|--------|----------------|
| **Owner ที่มี Business Package ACTIVE** | เจ้าของร้าน (PERSONAL หรือ BUSINESS) ที่ owner ระดับบนมี package ACTIVE | เต็มสิทธิ์: บันทึก/แก้/ลบ Expense, ตั้งต้นทุนสินค้า, ดูรายงาน P&L, เปิด/ปิด `staffCanViewFinance` |
| **ShopMember(ADMIN) ที่ toggle เปิด** | พนักงานที่ owner invite เข้ามาบริหาร Business shop และ owner เปิดสิทธิ์การเงินให้ | เห็น/บันทึก/แก้/ลบ Expense และดูรายงาน P&L เท่ากับ owner (membership-based access ตาม feature 00008 MVP) — **ไม่มี**สิทธิ์เปิด/ปิด toggle เอง |
| **ShopMember(ADMIN) ที่ toggle ปิด (default)** | พนักงานที่ owner ยังไม่เปิดสิทธิ์การเงินให้ | ไม่เห็นเมนู/route `/expenses` เลย |
| **Owner ที่ไม่มี Business Package ACTIVE** | ร้าน FREE หรือ Package LOCKED | เห็น locked/upsell state เท่านั้น ไม่เข้าถึงข้อมูล Expense/cost ของร้านตนได้ |

---

## 2. ความต้องการหลัก (Functional Requirements)

### 2.1 ตั้งต้นทุนสินค้าและ Snapshot ณ วันขาย

#### FR-EXP-01: ตั้ง/แก้ต้นทุนสินค้า (Product Cost)

**User Story:**
> ในฐานะ Seller ฉันต้องการตั้งราคาทุนให้สินค้าแต่ละชิ้น (ไม่บังคับ) เพื่อให้ระบบคำนวณกำไรขั้นต้นของออเดอร์ที่ขายสินค้านั้นได้

**Acceptance Criteria:**
- [ ] `[FR-EXP-01-AC-01]` **Given** seller เปิดฟอร์มแก้ไข/สร้างสินค้า **When** กรอกช่อง "ราคาทุน" เป็นตัวเลข ≥ 0 แล้วบันทึก **Then** `Product.cost` ถูกตั้งค่า/อัปเดตสำเร็จ
- [ ] `[FR-EXP-01-AC-02]` **Given** seller ไม่กรอกช่อง "ราคาทุน" เลย **When** บันทึกสินค้า **Then** `Product.cost` เป็น `null` — สินค้าสร้าง/แก้ไข/ขายได้ตามปกติทุกประการ ไม่มี error
- [ ] `[FR-EXP-01-AC-03]` **Given** seller กรอกค่าติดลบในช่อง "ราคาทุน" **When** submit **Then** ระบบปฏิเสธ (validation error) — ต้อง ≥ 0 เท่านั้น
- [ ] `[FR-EXP-01-AC-04]` **Given** สินค้าที่มี `cost` อยู่แล้วถูกขายไปหลายออเดอร์ **When** seller แก้ `cost` เป็นค่าใหม่ **Then** `OrderItem.cost` ของออเดอร์ที่เคยขายไปแล้วทั้งหมด**ไม่เปลี่ยนแปลง** (ดู FR-EXP-02)
- [ ] `[FR-EXP-01-AC-05]` **Given** seller ที่ owner **ไม่มี** Business Package ACTIVE เปิดฟอร์มสร้าง/แก้ไขสินค้า **When** ดูช่อง "ราคาทุน" **Then** ช่องแสดงอยู่แต่ **disabled** (แก้ไม่ได้) พร้อม badge "อัปเกรดเป็น Business" ข้าง ๆ — ไม่ซ่อน field, ไม่ block การบันทึกสินค้าตามปกติ (zero-regression). **When** owner ซื้อ package จน ACTIVE **Then** ช่องปลดล็อกให้กรอกได้ (รายละเอียด UI/badge → safepay-ux Design Spec)

#### FR-EXP-02: Snapshot ต้นทุนลง OrderItem ตอนสร้างออเดอร์

**User Story:**
> ในฐานะระบบ ฉันต้องบันทึกต้นทุนของสินค้าแต่ละรายการ ณ ขณะที่ออเดอร์ถูกสร้าง เพื่อให้กำไรของออเดอร์เก่าคำนวณซ้ำได้ผลเดิมเสมอ ไม่ว่าต้นทุนปัจจุบันของสินค้าจะเปลี่ยนไปแล้วแค่ไหน

**Acceptance Criteria:**
- [ ] `[FR-EXP-02-AC-01]` **Given** seller สร้างออเดอร์ที่มีรายการสินค้าที่ผูกกับ `Product` ซึ่งมี `cost` ไม่ null **When** ระบบสร้าง `OrderItem` **Then** `OrderItem.cost` ถูกตั้งเท่ากับ `Product.cost` ณ ขณะนั้น (เหมือน pattern การ snapshot `OrderItem.price` จาก `Product.price` ที่มีอยู่แล้ว)
- [ ] `[FR-EXP-02-AC-02]` **Given** รายการสินค้าที่ผูกกับ `Product` ซึ่ง `cost` เป็น `null` **When** ระบบสร้าง `OrderItem` **Then** `OrderItem.cost` เป็น `null` (ไม่ error, ไม่ default เป็น 0)
- [ ] `[FR-EXP-02-AC-03]` **Given** รายการสินค้าที่เป็น custom/manual line item (ไม่ผูกกับ `Product` ใด ๆ, `productId` เป็น null) **When** ระบบสร้าง `OrderItem` **Then** `OrderItem.cost` เป็น `null` เสมอ (ไม่มีต้นทุนอ้างอิง)
- [ ] `[FR-EXP-02-AC-04]` **Given** ออเดอร์ที่สร้างไปแล้วก่อนหน้านี้ (มี `OrderItem.cost` snapshot ค่าหนึ่งไว้) **When** seller แก้ `Product.cost` เป็นค่าใหม่ในภายหลัง **Then** re-query ออเดอร์เก่านั้น `OrderItem.cost` ยังคงเป็นค่าเดิมที่ snapshot ไว้ ไม่เปลี่ยนตาม `Product.cost` ปัจจุบัน
- [ ] `[FR-EXP-02-AC-05]` (เพิ่ม 2026-08-08) **Given** ออเดอร์เก่าที่ `OrderItem.cost` เป็น `null` เพราะร้านเพิ่งมาตั้งราคาทุนให้สินค้าทีหลัง **When** รัน migration `20260808210000_backfill_order_item_cost` **Then** `OrderItem.cost` ของบรรทัดที่ผูกกับสินค้าที่ "มีต้นทุนแล้ว" ถูกเติมด้วย `Product.cost` ปัจจุบัน และ **แถวที่เคยมีค่าอยู่แล้วต้องไม่ถูกแตะเลยแม้แต่แถวเดียว** (AC-04 ยังคุมทิศทาง "แก้ทีหลังไม่ย้อนหลัง" เหมือนเดิม — backfill เติมได้เฉพาะช่องที่ว่าง)

> **หมายเหตุ backfill (2026-08-08, user สั่ง):** ก่อนหน้านี้ระบบไม่มีทางเติมต้นทุนย้อนหลังเลย ร้านที่มาตั้งราคาทุนทีหลังจึงเห็นกำไรของช่วงก่อนหน้าสูงเกินจริงตลอดไป. `null` ในคอลัมน์นี้แปลว่า "ไม่รู้" ไม่ใช่ "ต้นทุน 0" การเติมด้วยราคาทุนปัจจุบันจึงดีกว่าปล่อยว่าง — แต่มันคือ **ค่าประมาณ** ไม่ใช่ราคาทุน ณ วันขายจริง (ระบบไม่เก็บประวัติราคาทุน). บรรทัดที่ผู้ขายพิมพ์เอง (`productId = null`) เติมไม่ได้ ยังเป็น `null` ต่อไปตาม AC-03. ผลบน prod ณ วันรัน: 102 แถวเป็น `null` → เติมได้ 92 แถว, 8 แถวที่มีค่าอยู่แล้วไม่ถูกแตะ, ที่เหลือ 10 แถวคือสินค้าที่ยังไม่ตั้งต้นทุนเลย

**Business Flow:**
1. Seller submit ฟอร์มสร้างออเดอร์ (มีอยู่แล้ว)
2. สำหรับแต่ละรายการสินค้าในออเดอร์: ระบบ snapshot `price` (มีอยู่แล้ว) และ `cost` (ใหม่) จาก `Product` ปัจจุบัน ณ ขณะนั้น พร้อมกัน
3. บันทึก `OrderItem` ครบทุกฟิลด์ในธุรกรรมเดียวกับการสร้าง `Order` (ตาม pattern เดิม)

---

### 2.2 บันทึกค่าใช้จ่าย (Expense CRUD)

#### FR-EXP-03: บันทึกค่าใช้จ่ายใหม่

**User Story:**
> ในฐานะ Seller ฉันต้องการบันทึกรายการค่าใช้จ่ายของร้าน (จำนวนเงิน, หมวดหมู่, วันที่, หมายเหตุ) เพื่อให้ระบบนำไปคำนวณกำไรสุทธิให้อัตโนมัติ

**Acceptance Criteria:**
- [ ] `[FR-EXP-03-AC-01]` **Given** ผู้ใช้มีสิทธิ์เข้าถึง `/expenses` ของร้าน (ดู FR-EXP-09/10/11) **When** กรอก `amount > 0`, เลือก `category` จาก fixed list (§FR-EXP-05), เลือก `expenseDate`, (optional) `note` แล้วบันทึก **Then** ระบบสร้าง `Expense` record ผูกกับ `shopId` ของร้านปัจจุบัน สำเร็จ
- [ ] `[FR-EXP-03-AC-02]` **Given** `amount ≤ 0` (หรือไม่ใช่ตัวเลข) **When** submit **Then** ระบบปฏิเสธ (validation error) ทั้ง frontend และ backend
- [ ] `[FR-EXP-03-AC-03]` **Given** `category` ไม่ตรงกับค่าใน fixed list **When** submit **Then** ระบบปฏิเสธ (validation error)
- [ ] `[FR-EXP-03-AC-04]` **Given** ไม่ระบุ `expenseDate` **When** submit **Then** ระบบ default เป็นวันที่ปัจจุบัน (ไม่บังคับ error — ความสะดวกของผู้ใช้)

#### FR-EXP-04: แก้ไข/ลบค่าใช้จ่าย

**User Story:**
> ในฐานะ Seller ฉันต้องการแก้ไขหรือลบรายการค่าใช้จ่ายที่เคยบันทึกผิด เพื่อให้รายงาน P&L ถูกต้องอยู่เสมอ

**Acceptance Criteria:**
- [ ] `[FR-EXP-04-AC-01]` **Given** Expense record เป็นของร้านที่ผู้ใช้มีสิทธิ์เข้าถึง **When** แก้ไข field ใดก็ได้ (amount/category/expenseDate/note) แล้วบันทึก **Then** ระบบอัปเดตสำเร็จ — validation เดียวกับ FR-EXP-03 ใช้ซ้ำทุกครั้ง
- [ ] `[FR-EXP-04-AC-02]` **Given** Expense record เป็นของร้านที่ผู้ใช้มีสิทธิ์เข้าถึง **When** กดลบ + ยืนยัน **Then** record ถูกลบถาวร (hard delete — ไม่มี soft-delete/audit trail ใน MVP ตาม PRD §4.2)
- [ ] `[FR-EXP-04-AC-03]` **Given** Expense record เป็นของร้าน**อื่น**ที่ผู้ใช้ไม่มีสิทธิ์ **When** พยายามแก้/ลบผ่าน API โดยตรง (เช่น แก้ id ใน request) **Then** ระบบปฏิเสธ (403/404 — ไม่ leak ว่ามี record นี้อยู่จริงหรือไม่)

#### FR-EXP-05: หมวดหมู่ค่าใช้จ่าย (Fixed Category)

**User Story:**
> ในฐานะระบบ ฉันต้องจำกัดหมวดหมู่ค่าใช้จ่ายให้เลือกจากรายการคงที่เท่านั้น เพื่อให้รายงานจัดกลุ่มได้สม่ำเสมอทุกร้าน

**Acceptance Criteria:**
- [ ] `[FR-EXP-05-AC-01]` ระบบมีหมวดหมู่ให้เลือกทั้งหมด 7 หมวด: `RENT`(ค่าเช่า), `PACKAGING`(ค่าบรรจุภัณฑ์), `ADVERTISING`(ค่าโฆษณา), `SHIPPING`(ค่าขนส่ง), `SALARY`(เงินเดือน), `UTILITIES`(ค่าน้ำ-ค่าไฟ), `OTHER`(อื่นๆ)
- [ ] `[FR-EXP-05-AC-02]` ไม่มีช่องทางใดใน UI/API ให้สร้างหมวดหมู่นอกเหนือจากรายการนี้ในเวอร์ชันนี้

**Business Flow:**

```mermaid
flowchart TD
    A[Seller เปิดฟอร์มบันทึก Expense] --> B[เลือกหมวดจาก fixed list 7 หมวด]
    B --> C[กรอกจำนวนเงิน + วันที่ + หมายเหตุ]
    C --> D{amount > 0 และ category valid?}
    D -- ไม่ --> E[Reject: validation error]
    D -- ใช่ --> F[บันทึก Expense ผูก shopId]
    F --> G[รวมเข้ารายงาน P&L ของช่วงเวลาที่ expenseDate ตกอยู่]
```

---

### 2.3 รายงานกำไรขาดทุน (P&L Report)

#### FR-EXP-06: คำนวณ Revenue และ COGS ตามช่วงเวลา

**User Story:**
> ในฐานะ Seller ฉันต้องการเห็นยอดขาย (Revenue) และต้นทุนสินค้าที่ขายไป (COGS) ของช่วงเวลาที่เลือก เพื่อรู้กำไรขั้นต้นของร้าน

**Acceptance Criteria:**
- [ ] `[FR-EXP-06-AC-01]` **Given** ช่วงเวลา `[start, end]` ที่ seller เลือก **When** ระบบคำนวณ **Then** `Revenue = Σ Order.totalAmount` ของทุกออเดอร์ที่ `shopId` ตรง, `status = 'CONFIRMED'`, และ `createdAt ∈ [start, end]`
- [ ] `[FR-EXP-06-AC-02]` **Given** ออเดอร์ที่เข้าเงื่อนไข Revenue ข้างต้น **When** ระบบคำนวณ COGS **Then** `COGS = Σ (OrderItem.cost × OrderItem.qty)` เฉพาะรายการที่ `OrderItem.cost` ไม่ null ของออเดอร์เหล่านั้น
- [ ] `[FR-EXP-06-AC-03]` **Given** ออเดอร์ที่ `status` เป็น `PENDING`/`SHIPPED`/`CANCELLED` **When** อยู่ในช่วงเวลาเดียวกัน **Then** ออเดอร์เหล่านี้**ไม่ถูกนับ**เข้า Revenue/COGS เลย
- [ ] `[FR-EXP-06-AC-04]` `Gross Profit = Revenue − COGS` เสมอ (ไม่มี rounding error สะสมข้ามรายการ — ใช้ Decimal ตลอดการคำนวณ)

#### FR-EXP-07: เตือนเมื่อข้อมูลต้นทุนไม่ครบ (Missing Cost Warning)

**User Story:**
> ในฐานะ Seller ฉันต้องการรู้ว่าตัวเลขกำไรที่เห็นอาจไม่สมบูรณ์ เมื่อมีสินค้าบางรายการที่ยังไม่เคยตั้งต้นทุนไว้ เพื่อไม่ให้ตัดสินใจผิดจากตัวเลขที่ต่ำ/สูงเกินจริง

**Acceptance Criteria:**
- [ ] `[FR-EXP-07-AC-01]` **Given** มี `OrderItem` อย่างน้อย 1 รายการในช่วงเวลาที่เลือก (ของออเดอร์ที่นับเข้า Revenue) ที่ `cost` เป็น `null` **When** แสดงรายงาน **Then** ระบบแสดงคำเตือน "กำไรอาจไม่สมบูรณ์ (มีสินค้าที่ยังไม่ตั้งต้นทุน)" กำกับคู่กับตัวเลข Gross Profit และ Net Profit
- [ ] `[FR-EXP-07-AC-02]` **Given** ทุกรายการในช่วงเวลาที่เลือกมี `cost` ครบ (ไม่ null สักรายการ) **When** แสดงรายงาน **Then** ไม่มีคำเตือนแสดง
- [ ] `[FR-EXP-07-AC-03]` รายการที่ `cost` เป็น `null` ต้อง**ไม่ถูกนับเป็น 0** ใน COGS (exclude ไปเลย ไม่ใช่ default เป็นศูนย์) — ป้องกันไม่ให้ Gross Profit สูงเกินจริงอย่างเงียบ ๆ

#### FR-EXP-08: รายงาน Net Profit รวม Expense

**User Story:**
> ในฐานะ Seller ฉันต้องการเห็นกำไรสุทธิหลังหักค่าใช้จ่ายดำเนินธุรกิจทั้งหมด เพื่อรู้ผลประกอบการที่แท้จริงของร้านในช่วงเวลานั้น

**Acceptance Criteria:**
- [ ] `[FR-EXP-08-AC-01]` **Given** ช่วงเวลาเดียวกับที่ใช้คำนวณ Revenue/COGS (FR-EXP-06) **When** ระบบคำนวณ **Then** `Total Expense = Σ Expense.amount` ของ `shopId` ตรง ที่ `expenseDate ∈ [start, end]`
- [ ] `[FR-EXP-08-AC-02]` `Net Profit = Gross Profit − Total Expense` เสมอ
- [ ] `[FR-EXP-08-AC-03]` **Given** ไม่มี Expense record ใดในช่วงเวลานั้นเลย **When** แสดงรายงาน **Then** `Total Expense = 0` และ `Net Profit = Gross Profit` (ไม่ error)
- [ ] `[FR-EXP-08-AC-04]` รายงานแสดงตัวเลขทั้ง 5 ค่าคู่กันเสมอในหน้าเดียว: Revenue, COGS, Gross Profit, Total Expense, Net Profit

**Business Flow:**

```mermaid
flowchart TD
    A[Seller เลือกช่วงเวลา] --> B[ดึง Order: shopId, status=CONFIRMED, createdAt in range]
    B --> C[Revenue = sum totalAmount]
    B --> D[ดึง OrderItem ของ order เหล่านั้นที่ cost ไม่ null]
    D --> E[COGS = sum cost x qty]
    C --> F[Gross Profit = Revenue - COGS]
    E --> F
    A --> G[ดึง Expense: shopId, expenseDate in range]
    G --> H[Total Expense = sum amount]
    F --> I[Net Profit = Gross Profit - Total Expense]
    H --> I
    D --> J{มี OrderItem.cost null ในช่วงนี้?}
    J -- ใช่ --> K[แสดงคำเตือน กำไรอาจไม่สมบูรณ์]
    J -- ไม่ --> L[ไม่แสดงคำเตือน]
    I --> M[แสดงรายงาน 5 ตัวเลข + คำเตือนถ้ามี]
    K --> M
    L --> M
```

---

### 2.4 สิทธิ์การเข้าถึง (Access Control)

#### FR-EXP-09: Owner เห็นข้อมูลการเงินเสมอ

**User Story:**
> ในฐานะ Owner ฉันต้องการเข้าถึงข้อมูล Expense/ต้นทุน/รายงาน P&L ของร้านตนเองได้เสมอ โดยไม่มีเงื่อนไขเพิ่มเติมนอกจากมี Business Package ACTIVE

**Acceptance Criteria:**
- [ ] `[FR-EXP-09-AC-01]` **Given** ผู้ใช้ที่ login คือ owner ของ shop (owner โดยตรงของ PERSONAL shop, หรือ `ShopMember(role=OWNER)` ของ BUSINESS shop) และ package ของ owner นั้น ACTIVE **When** เข้าหน้า `/expenses` **Then** เห็น/แก้/ลบข้อมูลได้เต็มสิทธิ์เสมอ ไม่ขึ้นกับ `staffCanViewFinance`
- [ ] `[FR-EXP-09-AC-02]` ทุก query ของ Expense/cost/report ต้องกรองด้วย `shopId` ของร้านที่ owner เป็นเจ้าของจริงเท่านั้น (server-side, ไม่รับค่าจาก client มาตัดสิน)

#### FR-EXP-10: Toggle staffCanViewFinance สำหรับ Admin

**User Story:**
> ในฐานะ Owner ฉันต้องการเลือกเองว่าจะให้พนักงาน (ShopMember role=ADMIN) เห็นข้อมูลการเงินของร้านได้หรือไม่ เพื่อควบคุมความลับทางธุรกิจของตัวเอง

**Acceptance Criteria:**
- [ ] ~~`[FR-EXP-10-AC-01]` **Given** Shop ใหม่ถูกสร้าง (ไม่ว่า kind ใด) **When** ตรวจค่าเริ่มต้น **Then** `Shop.staffCanViewFinance = false` เสมอ~~ **กลับทิศ 2026-08-08 → `[FR-EXP-10-AC-01b]` ค่าเริ่มต้นคือ `true`** (user สั่ง "เปิดหมด")

> **ทำไมกลับทิศ (2026-08-08):** ตั้ง default false มา 1 เดือน ผลคือ **12/12 ร้านบน prod ไม่มีร้านไหนเปิดเลยสักร้าน** — ไม่ใช่เพราะทุกคนตั้งใจปิด แต่เพราะสวิตช์อยู่ในหน้าจัดการพนักงานซึ่งไม่มีใครรู้ว่ามี ผู้ดูแล 9 คนที่ทำงานกับออเดอร์ทุกวันจึงมองไม่เห็นต้นทุน/กำไรมาตลอด. BR §3.6 ("ข้อมูลการเงินคือความลับทางธุรกิจระดับสูงสุด") ยังใช้กับ **คนนอกร้าน** เหมือนเดิม — สิ่งที่เปลี่ยนคือสมมติฐานว่า ShopMember(ADMIN) ซึ่ง owner เชิญเข้ามาเองนับเป็นคนใน. **สวิตช์ไม่ได้ถูกถอด** owner ยังปิดรายร้านได้และ `resolveExpenseAccess()` ยัง fail-closed ตามเดิม (AC-02..AC-05 ไม่เปลี่ยน) · migration `20260808220000_finance_visible_to_staff_by_default`

- [ ] `[FR-EXP-10-AC-02]` **Given** owner เปิด toggle "ให้พนักงานเห็นข้อมูลการเงิน" **When** ยืนยัน **Then** `Shop.staffCanViewFinance = true` — เฉพาะ owner เท่านั้นที่แก้ค่านี้ได้ (ไม่ใช่ admin)
- [ ] `[FR-EXP-10-AC-03]` **Given** `staffCanViewFinance = true` **When** `ShopMember(role=ADMIN)` ของ shop นั้น login และเปิดเมนู **Then** เห็นเมนู `/expenses` และเข้าถึงข้อมูลได้เท่ากับ owner (membership-based access ตาม MVP feature 00008)
- [ ] `[FR-EXP-10-AC-04]` **Given** `staffCanViewFinance = false` (owner ปิดเอง — ไม่ใช่ค่าเริ่มต้นอีกแล้วตั้งแต่ 2026-08-08) **When** `ShopMember(role=ADMIN)` เปิดเมนู **Then** **ไม่เห็นเมนู/route `/expenses` เลย** — เข้า URL ตรง ๆ ก็ต้องถูกปฏิเสธ (403) ไม่ใช่แค่ UI ซ่อนปุ่ม
- [ ] `[FR-EXP-10-AC-05]` Toggle นี้เป็นค่าต่อ `Shop` (ต่อร้าน) — owner ที่มีหลาย Business shop ต้องตั้งแยกทีละร้าน ไม่มี global toggle รวม

#### FR-EXP-11: Gate การเข้าถึงด้วย Business Package (Bundled Paid Add-on)

**User Story:**
> ในฐานะแพลตฟอร์ม Deep ฉันต้องการเปิดสิทธิ์ Expense & Cost Tracking เฉพาะร้านของ owner ที่มี Business Package ACTIVE อยู่แล้ว โดยไม่ต้องสร้างระบบเรียกเก็บเงินใหม่

**Acceptance Criteria:**
- [ ] `[FR-EXP-11-AC-01]` **Given** owner ของ shop (resolve ตาม FR-EXP-09-AC-01) มี `BusinessPackageSubscription.status = 'ACTIVE'` (tier ใดก็ได้) **When** เข้าหน้า `/expenses` **Then** เข้าถึงได้เต็มสิทธิ์ตาม role (owner/admin ที่ toggle เปิด)
- [ ] `[FR-EXP-11-AC-02]` **Given** owner ไม่มี `BusinessPackageSubscription` เลย (FREE pseudo-state) หรือมีแต่ `status = 'LOCKED_RENEWAL_FAILED'` **When** เข้าหน้า `/expenses` **Then** ระบบแสดง locked/upsell state เท่านั้น (ไม่ error 404 เงียบ ๆ — แจ้งชัดว่าต้องมี Business Package ก่อน) และ**ไม่คืนข้อมูล** Expense/cost ของร้านจริงมาแสดง
- [ ] `[FR-EXP-11-AC-03]` **Given** entitlement เปลี่ยนจาก ACTIVE เป็น LOCKED (เช่น renewal ล้มเหลว — ตาม feature 00008) **When** owner เข้าหน้า `/expenses` ครั้งถัดไป **Then** ถูกล็อกทันทีตาม AC-02 — ข้อมูล Expense/cost ที่เคยบันทึกไว้**ไม่ถูกลบ** (แค่เข้าถึงไม่ได้ชั่วคราว จนกว่า reactivate) — สอดคล้อง data-retention policy ของ feature 00008
- [ ] `[FR-EXP-11-AC-04]` (Build-order note — ไม่ใช่ acceptance ของ production) ระหว่างพัฒนา core logic (FR-EXP-01 ถึง FR-EXP-10) อนุญาตให้ gate นี้เป็น stub/bypass ชั่วคราวเพื่อทดสอบ business logic แยกจากปัญหาเรื่องสิทธิ์ — ต้องผูก gate จริงก่อน sign-off feature เสมอ

**Business Flow:**

```mermaid
flowchart TD
    A[ผู้ใช้เข้า /expenses ของ shop X] --> B[Resolve ownerId ของ shop X]
    B --> C{PERSONAL shop?}
    C -- ใช่ --> D[ownerId = Shop.userId]
    C -- ไม่ BUSINESS --> E[ownerId = ShopMember role OWNER ของ shop X]
    D --> F[getSubscriptionStatus ownerId]
    E --> F
    F --> G{status ACTIVE?}
    G -- ไม่ --> H[แสดง Locked/Upsell state ไม่คืนข้อมูลจริง]
    G -- ใช่ --> I{ผู้ใช้เป็น owner เอง?}
    I -- ใช่ --> J[เข้าถึงเต็มสิทธิ์]
    I -- ไม่ ผู้ใช้เป็น ShopMember ADMIN --> K{staffCanViewFinance = true?}
    K -- ไม่ --> L[ไม่เห็น route เลย 403]
    K -- ใช่ --> J
```

### 2.5 กำไรสุทธิบนหน้ายอดขาย (เพิ่ม 2026-08-02, PRD §3.8)

#### FR-EXP-12: รายจ่ายไหลเข้าหน้ายอดขาย 3 surface

**User Story:**
> ในฐานะ Seller ฉันต้องการเห็นกำไรสุทธิของร้าน ไม่ใช่แค่ยอดขาย ทุกครั้งที่เปิดหน้าภาพรวมยอดขาย (ไม่ใช่แค่ตอนเข้าหน้า `/expenses` โดยเฉพาะ) เพราะฉันเปิดดูยอดขาย/แดชบอร์ดบ่อยกว่ามาก

**Acceptance Criteria:**
- [ ] `[FR-EXP-12-AC-01]` **Given** ผู้ใช้ที่มีสิทธิ์เข้าถึงข้อมูลการเงิน (ตาม FR-EXP-09/10/11) **When** เปิดหน้า `/sales` **Then** เห็นการ์ดสรุป 6 ใบ (เดิม 4 — เพิ่มค่าใช้จ่าย/กำไรสุทธิ), ตารางรายวันมี 2 คอลัมน์เพิ่ม (ค่าใช้จ่าย/กำไรสุทธิ), และกราฟมี series ค่าใช้จ่าย
- [ ] `[FR-EXP-12-AC-02]` **Given** ผู้ใช้ที่มีสิทธิ์เดียวกัน **When** เปิดการ์ด "ยอดขายและกำไร" บน command center (มือถือ) หรือชีตเต็มจอที่เปิดจากการ์ดนั้น **Then** ตัวเลข hero คือ**กำไรสุทธิ** (ไม่ใช่ยอดขาย) พร้อมยอดขายแสดงเป็นข้อมูลรอง
- [ ] `[FR-EXP-12-AC-03]` **Given** ผู้ใช้ที่**ไม่ผ่าน**สิทธิ์เข้าถึงข้อมูลการเงิน (FR-EXP-10-AC-04/FR-EXP-11-AC-02) **When** เปิดทั้ง 3 surface ข้างต้น **Then** **ไม่เห็น**คอลัมน์/การ์ด/series ที่เกี่ยวกับเงินเลย (ไม่ query ด้วยซ้ำ — ไม่ใช่เห็นแต่เป็น `฿0`)
- [ ] `[FR-EXP-12-AC-04]` กำไรสุทธิที่แสดงทั้ง 3 surface ต้องคำนวณด้วยสูตรเดียวกับ `/expenses` เป๊ะ (`Revenue − COGS − Expense`, ดู §8.1) — ไม่มี surface ใดใช้สูตรลัดที่ให้ตัวเลขต่างกัน

**Business Flow:**

```mermaid
flowchart TD
    A[Seller เปิดหน้ายอดขาย/แดชบอร์ด] --> B[Gate: resolveExpenseAccess เดียวกับ FR-EXP-09/10/11]
    B -- ไม่ผ่าน --> C[ไม่ query/ไม่แสดงคอลัมน์-การ์ด-series การเงินเลย]
    B -- ผ่าน --> D[คำนวณ Net Profit สูตรเดียวกับ /expenses]
    D --> E[/sales: การ์ด 6 ใบ + ตาราง 2 คอลัมน์ + กราฟ series ค่าใช้จ่าย/]
    D --> F[Command center + ชีตเต็มจอ: hero = กำไรสุทธิ]
```

---

## 3. Acceptance Criteria สรุป

### 3.1 ต้นทุนสินค้า + Snapshot

**เมื่อระบบทำงานถูกต้อง:**
- ✓ ตั้ง/แก้ `Product.cost` ได้ (optional, ≥0) โดยไม่กระทบสินค้าที่ไม่เคยตั้งต้นทุน
- ✓ `OrderItem.cost` snapshot จาก `Product.cost` ตอนสร้างออเดอร์ — null ถ้าไม่มีต้นทุนอ้างอิง (product cost null หรือ custom line item)
- ✓ แก้ `Product.cost` ทีหลังไม่กระทบ `OrderItem.cost` ของออเดอร์เก่า

### 3.2 บันทึกค่าใช้จ่าย

**เมื่อระบบทำงานถูกต้อง:**
- ✓ สร้าง/แก้/ลบ Expense ได้เฉพาะร้านที่ผู้ใช้มีสิทธิ์ (scope ด้วย shopId)
- ✓ `amount > 0` และ `category` ต้องอยู่ใน fixed list 7 หมวดเท่านั้น
- ✓ Expense record ของร้านอื่นเข้าถึง/แก้/ลบไม่ได้ผ่าน API โดยตรง

### 3.3 รายงาน P&L

**เมื่อระบบทำงานถูกต้อง:**
- ✓ Revenue/COGS นับเฉพาะออเดอร์ `status = CONFIRMED` ในช่วงเวลาที่เลือก (anchor `createdAt`)
- ✓ Gross Profit = Revenue − COGS; Net Profit = Gross Profit − Total Expense
- ✓ รายการที่ไม่มี cost ถูก exclude จาก COGS (ไม่ default เป็น 0) พร้อมคำเตือนกำกับเสมอเมื่อมี gap

### 3.4 Access Control

**เมื่อระบบทำงานถูกต้อง:**
- ✓ Owner เข้าถึงได้เสมอเมื่อ package ACTIVE ไม่ขึ้นกับ toggle
- ✓ Admin เข้าถึงได้เฉพาะเมื่อ `staffCanViewFinance = true` — ปิดอยู่ต้องมองไม่เห็น route เลย (403 ไม่ใช่แค่ UI ซ่อน)
- ✓ ร้านที่ owner ไม่มี Business Package ACTIVE ไม่คืนข้อมูลจริงใด ๆ ให้เห็น

### 3.5 กำไรสุทธิบนหน้ายอดขาย (เพิ่ม 2026-08-02)

**เมื่อระบบทำงานถูกต้อง:**
- ✓ `/sales` + การ์ด command center + ชีตเต็มจอ แสดงกำไรสุทธิด้วยสูตรเดียวกับ `/expenses`
- ✓ Gate สิทธิ์เดียวกับ §3.4 ครอบทั้ง 3 surface — ไม่ผ่าน = ไม่เห็นข้อมูลการเงินเลย ไม่ใช่เห็น ฿0

---

## 4. Business Flows (กระบวนการทำงาน)

### 4.1 Flow หลัก: บันทึกค่าใช้จ่าย → เห็นในรายงาน P&L

```mermaid
flowchart TD
    A[Seller เข้าหน้า /expenses] --> B[Gate: FR-EXP-11 Business Package ACTIVE?]
    B -- ไม่ --> Z[Locked/Upsell state — จบ flow]
    B -- ใช่ --> C[Gate: FR-EXP-09/10 Owner หรือ Admin ที่ toggle เปิด?]
    C -- ไม่ --> Z2[403 ไม่เห็น route]
    C -- ใช่ --> D[เข้าหน้า /expenses สำเร็จ]
    D --> E[กด บันทึกค่าใช้จ่าย]
    E --> F[กรอก amount / category / expenseDate / note]
    F --> G{Validation ผ่าน?}
    G -- ไม่ --> F
    G -- ใช่ --> H[สร้าง Expense record ผูก shopId]
    H --> I[เลือกช่วงเวลาดูรายงาน P&L]
    I --> J[คำนวณ Revenue/COGS/Gross/Expense/Net ตาม FR-EXP-06/07/08]
    J --> K[Expense ที่เพิ่งบันทึกรวมอยู่ใน Total Expense ถ้า expenseDate อยู่ในช่วง]
    K --> L[แสดงรายงานพร้อมคำเตือนถ้ามีสินค้าที่ยังไม่ตั้งต้นทุน]
```

### 4.2 ER Snippet — Model ใหม่/ที่แก้ไข (ข้อมูลอ้างอิงประกอบ — DATABASE.md ฉบับเต็มจัดทำโดย `safepay-database` ภายหลัง)

```mermaid
erDiagram
    Shop ||--o{ Expense : "shopId"
    Shop ||--o{ Product : "shopId"
    Shop {
        boolean staffCanViewFinance "NEW, default false — owner toggle ให้ ADMIN เห็นการเงิน"
    }
    Product {
        decimal cost "NEW, nullable, opt-in — ราคาทุนปัจจุบัน"
    }
    Order ||--o{ OrderItem : "orderId"
    OrderItem {
        decimal cost "NEW, nullable — snapshot ต้นทุน ณ วันขาย จาก Product.cost"
    }
    Expense {
        string id PK
        string shopId FK
        string category "fixed list: RENT/PACKAGING/ADVERTISING/SHIPPING/SALARY/UTILITIES/OTHER"
        decimal amount "> 0"
        date expenseDate
        string note "optional"
        string createdByUserId
        datetime createdAt
        datetime updatedAt
    }
```

---

## 5. Use Case Scenarios (สถานการณ์การใช้งานจริง)

### Scenario 1: Owner ตั้งต้นทุนสินค้าแล้วขาย → เห็นกำไรถูกต้อง (Best Case)

**ผู้เกี่ยวข้อง:** Owner (Business Package ACTIVE)

**เงื่อนไขเริ่มต้น:**
- Owner มีสินค้า "เสื้อยืด" ราคาขาย 300 บาท ยังไม่เคยตั้งต้นทุน

**ขั้นตอน:**
1. Owner ตั้ง `Product.cost = 150` ให้เสื้อยืด
2. Owner สร้างออเดอร์ขายเสื้อยืด 2 ตัว → `OrderItem.cost = 150` snapshot ไว้ (× qty 2)
3. Buyer ยืนยันออเดอร์ (`status = CONFIRMED`)
4. Owner เปิดรายงาน P&L ช่วงวันนี้

**ผลลัพธ์:**
- Revenue = 600, COGS = 300 (150×2), Gross Profit = 300 — ไม่มีคำเตือน (ต้นทุนครบ)

### Scenario 2: สินค้าไม่มีต้นทุน → รายงานมีคำเตือน

**ผู้เกี่ยวข้อง:** Owner

**เงื่อนไขเริ่มต้น:**
- ออเดอร์ CONFIRMED มีสินค้า 2 รายการ: A (มี cost) และ B (ไม่มี cost)

**ขั้นตอน:**
1. Owner เปิดรายงาน P&L ช่วงที่ครอบคลุมออเดอร์นี้

**ผลลัพธ์:**
- COGS คำนวณเฉพาะรายการ A, รายการ B ถูก exclude
- แสดงคำเตือน "กำไรอาจไม่สมบูรณ์ (มีสินค้าที่ยังไม่ตั้งต้นทุน)" กำกับ Gross/Net Profit

### Scenario 3: Admin ที่ toggle ปิดพยายามเข้า /expenses

**ผู้เกี่ยวข้อง:** ShopMember(role=ADMIN)

**เงื่อนไขเริ่มต้น:**
- `Shop.staffCanViewFinance = false` (default)

**ขั้นตอน:**
1. Admin login เข้า Business shop ที่ตนถูก invite
2. พยายามเข้า URL `/expenses` ตรง ๆ

**ผลลัพธ์:**
- ไม่เห็นเมนูนี้ในเมนู และเข้า URL ตรง ๆ ได้รับ 403 — ไม่มีข้อมูลการเงินหลุดออกมาแม้แต่ error message

### Scenario 4: ร้านไม่มี Business Package → Locked State

**ผู้เกี่ยวข้อง:** Owner ที่ยังไม่ซื้อ package (FREE)

**เงื่อนไขเริ่มต้น:**
- Owner มี Personal shop, ไม่มี `BusinessPackageSubscription`

**ขั้นตอน:**
1. Owner เปิดเมนู "ค่าใช้จ่าย"

**ผลลัพธ์:**
- เห็นหน้า locked/upsell พร้อม prompt ไปซื้อ Business Package — ไม่เห็นข้อมูล Expense/cost ใด ๆ ของร้านตนเอง (ถึงแม้จะเคยมีอยู่ก่อนหน้าตอน package เคย ACTIVE)

---

## 6. ความต้องการด้านคุณภาพ (Quality Requirements)

### 6.1 ความถูกต้องของข้อมูล
- สูตรคำนวณ P&L (§4.3 ของ PRD) ต้องตรงกัน 100% ระหว่าง backend calculation และตัวเลขที่แสดงบนหน้าจอ — ไม่มีการคำนวณซ้ำฝั่ง frontend ที่อาจ drift
- `amount > 0`, `Product.cost ≥ 0`, `category` ∈ fixed list บังคับทั้ง frontend (yup) และ backend (valibot) เสมอ (ตาม convention validation คู่ของระบบ)

### 6.2 ความรวดเร็ว
- Query รายงาน P&L ของช่วงเวลา ≤ 1 ปี ต้องตอบสนองในเวลาที่ยอมรับได้สำหรับหน้า dashboard-style (ไม่ block UI) — พิจารณา index เพิ่มเติมถ้าจำเป็น (ระบุใน DATABASE.md/SRS)

### 6.3 ความน่าเชื่อถือ
- Cost snapshot ต้องเป็นส่วนหนึ่งของ transaction เดียวกับการสร้าง order (all-or-nothing) — ไม่มีเคสที่ order สร้างสำเร็จแต่ cost snapshot ขาดหายบางส่วนโดยไม่ได้ตั้งใจ

### 6.4 ความปลอดภัย
- ทุก endpoint ของ Expense/cost/report ต้องตรวจสอบสิทธิ์ (owner/admin+toggle) และ scope `shopId` ที่ server-side เสมอ — ห้าม trust ค่าจาก client (ตาม memory `feedback_rsc_dal_authz`)
- ข้อมูลการเงิน (Expense, cost, P&L) ถือเป็นข้อมูลอ่อนไหวระดับสูง — ห้าม log/leak ค่าตัวเลขจริงลง client-side error message ทั่วไป

### 6.5 ความสะดวกในการใช้งาน (Usability)
- ฟอร์มบันทึก Expense ต้องกรอกเสร็จได้เร็ว (จำนวน field น้อยที่สุดเท่าที่จำเป็น) — รายละเอียด UI จัดทำโดย `safepay-ux`

---

## 7. ข้อจำกัด (Constraints)

### 7.1 ข้อจำกัดทางธุรกิจ
- ไม่มี custom category, ไม่มี audit trail ของการแก้ไข Expense, ไม่มี export รายงานใน MVP (ดู PRD §5)
- Gate ด้วย Business Package เท่านั้น — ไม่มี billing แยกของ feature นี้

### 7.2 ข้อจำกัดทางเทคนิค
- `Product.cost`/`OrderItem.cost`/`Shop.staffCanViewFinance` เป็น additive migration ทั้งหมด (nullable/default) — ห้ามแตะ column เดิม
- ต้อง reuse `getSubscriptionStatus` เดิมจาก feature 00008 — ห้ามสร้าง entitlement table ใหม่ซ้ำซ้อน

---

## 8. กฎทางธุรกิจ (Business Rules)

### 8.1 กฎการคำนวณ P&L
- นับเฉพาะออเดอร์ `status = CONFIRMED`
- Anchor วันที่ = `Order.createdAt` (Revenue/COGS) และ `Expense.expenseDate` (Total Expense)
- รายการที่ไม่มี cost ถูก exclude จาก COGS พร้อมคำเตือนเสมอ ไม่ default เป็น 0
- ใช้ `Order.totalAmount` ตรง ๆ (รวม VAT) เป็นฐาน Revenue — ไม่แยก VAT
- **Expense เป็น period-level** — หักที่ Net Profit ของช่วงเวลาทั้งก้อน ไม่ allocate ลงรายออเดอร์ (ค่า ads ฿500 วันที่มี 11 ออเดอร์ = หัก ฿500 ก้อนเดียว ไม่ใช่ ฿45/ออเดอร์). Per-order allocation = Out of Scope (PRD §4.4/§5)

### 8.2 กฎ Cost Snapshot
- Snapshot ที่จุดสร้างออเดอร์เท่านั้น เหมือน `OrderItem.price`
- แก้ `Product.cost` ทีหลังไม่มีผลย้อนหลัง

### 8.3 กฎหมวดหมู่ค่าใช้จ่าย
- Fixed list 7 หมวด, String enum-style
- `amount > 0` เสมอ

### 8.4 กฎสิทธิ์การเข้าถึง
- Owner เห็นเสมอเมื่อ package ACTIVE
- Admin เห็นเมื่อ `staffCanViewFinance = true` เท่านั้น (default false)
- Gate ด้วย Business Package ACTIVE (ทุก tier ที่จ่ายเงิน) — ไม่ ACTIVE = ไม่เห็นข้อมูลจริงใด ๆ

---

## 9. อภิธานศัพท์ (Glossary)

| คำศัพท์ | ความหมาย |
|---------|----------|
| **COGS** | ต้นทุนสินค้าที่ขายไปจริงในช่วงเวลาที่คำนวณ (จาก `OrderItem.cost` ที่ snapshot ไว้) |
| **Cost Snapshot** | การล็อกต้นทุนสินค้า ณ วินาทีที่สร้างออเดอร์ ลงใน `OrderItem.cost` |
| **Fixed Category** | หมวดหมู่ค่าใช้จ่าย 7 หมวดที่ระบบกำหนดตายตัว ไม่ให้ผู้ใช้เพิ่มเอง |
| **staffCanViewFinance** | Toggle ระดับ `Shop` ที่ owner เปิด/ปิดให้ ShopMember(ADMIN) เห็นข้อมูลการเงิน |
| **Bundled Paid Add-on** | Feature ที่ไม่มี billing ของตัวเอง แต่เปิดใช้งานได้เมื่อผู้ใช้มี subscription อื่น (Business Package) ที่ ACTIVE อยู่แล้ว |

---

## 10. สรุป

เอกสาร BRD นี้อธิบายความต้องการหลักของ **Expense & Cost Tracking** แบบไม่ใช่เทคนิค

**จุดเด่นของระบบ:**
- P&L เต็มรูป (Revenue → COGS → Gross → Expense → Net) คำนวณจากข้อมูลที่มีอยู่แล้วในระบบ ไม่ต้องสร้าง billing ใหม่
- Cost snapshot รับประกันความถูกต้องย้อนหลัง (historical accuracy) เหมือน pattern `price` เดิมที่พิสูจน์แล้วในระบบ
- Reuse entitlement (feature 00008) และ membership (ShopMember) ที่ live อยู่แล้วทั้งหมด — ลด risk ของการสร้างระบบสิทธิ์คู่ขนาน

**ผลลัพธ์ที่คาดหวัง:**
- Seller เห็นกำไรจริงของร้านได้ในหน้าเดียว ไม่ต้องคำนวณนอกระบบ
- ~~เพิ่มมูลค่าให้ Business Package โดยไม่ต้องเพิ่ม billing flow ใหม่~~ — **ยกเลิกโดย D-EXT-1 (§11.1)** ฟีเจอร์นี้ไม่ใช่ perk ของ Business Package อีกต่อไป
- ข้อมูลการเงินปลอดภัย — default owner-only เสมอ จนกว่า owner จะเลือกเปิดเอง **⚠️ จริงเฉพาะกับ Expense CRUD / P&L report / 3 surface หน้ายอดขาย — ไม่จริงกับ `Product.cost` ดู KG-EXT-01 (§11.2)**

---

## 11. ส่วนขยาย 2026-08-07 — เปิดฟรี + ต้นทุนรายออเดอร์/รายสินค้า

### 11.1 Decision Log (ล็อกแล้วโดย user — ห้าม re-litigate)

| # | เรื่อง | Decision | เหตุผล / สิ่งที่แลกไป |
|---|---|---|---|
| **D-EXT-1** | Business Package gate | **ถอดออกทั้งชุด** — `Product.cost`, `/expenses`, P&L report, กำไรบน 3 surface หน้ายอดขาย (เดิม FR-EXP-12) เข้าถึงได้ฟรีทุกร้าน ไม่ต้องสมัครแพ็กเกจ | **กลับทิศจาก D-4 และ D-8 ของ PRD เดิม** — D-4 เดิม "รวมใน Business Package ไม่คิดเงินแยก… gate ด้วย `getSubscriptionStatus`" และ D-8 เดิม "ทุก tier ที่จ่ายเงินปลดล็อกเท่ากัน" **ทั้งสองข้อไม่มีความหมายอีกต่อไปสำหรับฟีเจอร์นี้** เพราะไม่มี gate ให้ tier ใดปลดล็อก. **ยังกลับทิศ D-9 ด้วย** ("ช่อง cost แสดงเสมอแต่ disabled+badge อัปเกรด") — ช่อง cost เปลี่ยนเป็น **enabled เสมอ ไม่มี badge**. Controller ทักท้วงแล้วว่านี่คือการถอดจุดขายหลักของ Business Package (GROWTH ฿159/เดือนขึ้นไป) และ **user ยืนยันรับผลกระทบนี้แล้ว** |
| **D-EXT-2** | สิทธิ์ staff ต่อ `Product.cost` | **ไม่แก้ในรอบนี้** — ทุก ShopMember ที่เข้าฟอร์มแก้ไขสินค้าได้ ยังเห็น/แก้ `Product.cost` ได้เสมอ ไม่ผูกกับ `staffCanViewFinance` ("สิทธิ์เดี๋ยวมาว่ากันทีหลัง" — คำ user ตรงตัว) | ต้องบันทึกเป็น **Known Gap ที่มีชื่อ** (§11.2) เพราะเมื่อถอด paywall แล้ว (D-EXT-1) ความเสี่ยงนี้ขยายวงจาก "เฉพาะร้านที่จ่ายเงิน" เป็น "ทุกร้านที่มี staff ทันที" — ไม่ใช่ความเสี่ยงเดิมที่ขนาดเท่าเดิม |
| **D-EXT-3** | จุดแสดงผลใหม่ | เพิ่ม **3 จุด**: (ก) กำไรรายออเดอร์ที่ order detail (FR-EXP-14), (ข) ต้นทุน/มาร์จิ้นในรายการสินค้า ทั้งตารางเดสก์ท็อปและการ์ดมือถือ (FR-EXP-15), (ค) ช่อง `cost` ใน CSV bulk import (FR-EXP-16) | ปิด gap ที่ Scope Audit พบว่า "มีแต่รายงานรวม ไม่มีรายละเอียดที่คนขายมองหาจริงตอนใช้งานประจำวัน" |

### 11.2 Business Rules ที่ถูกยกเลิก/แก้ไข

| รหัสเดิม | ข้อความเดิม | สถานะใหม่ |
|---|---|---|
| FR-EXP-11 (ทั้งข้อ) + AC-01..04 | Gate ด้วย `getSubscriptionStatus(ownerId).status==='ACTIVE'` | **ยกเลิกทั้งข้อ** — superseded โดย FR-EXP-13 (PRD ส่วนขยาย) |
| §8.4 "Gate ด้วย Business Package ACTIVE (ทุก tier ที่จ่ายเงิน) — ไม่ ACTIVE = ไม่เห็นข้อมูลจริงใด ๆ" | **ลบเงื่อนไขนี้ออก** — ที่เหลือของ §8.4 (Owner เห็นเสมอ, Admin เห็นเมื่อ `staffCanViewFinance=true`) **ยังใช้ได้เหมือนเดิมทุกประการ** |
| §4.1 "Bundled Paid Add-on — Gate ด้วย Business Package ACTIVE … ไม่มี billing แยก" | **แก้เป็น:** "Free Feature — ไม่มี gate ใด ๆ ผูกกับ subscription/billing ทั้งสิ้น" |
| §9.2 D-9 (ช่อง cost disabled + badge เมื่อไม่มี package) | **ยกเลิก** — field enabled เสมอ ไม่มี badge "อัปเกรดเป็น Business" |

> 🛑 **KG-EXT-01 — `Product.cost` ไม่ถูกครอบด้วย `staffCanViewFinance` toggle**
> §3.6 ของเอกสารนี้ประกาศว่า "ข้อมูลการเงินคือความลับทางธุรกิจระดับสูงสุด… default ปิดเสมอ owner ต้อง opt-in เอง" — ประกาศนี้ **เป็นจริงเฉพาะกับ Expense CRUD / P&L report / 3 surface หน้ายอดขาย** (ยังผ่าน `resolveExpenseAccess()` เดิม) **แต่ไม่เป็นจริงกับ `Product.cost`**: ช่องราคาทุนในฟอร์มสินค้าเปิดให้ ShopMember ทุก role ที่แก้ไขสินค้าได้เห็น/แก้ได้เสมอ ไม่ว่า owner จะเปิด toggle หรือไม่.
> **ก่อน D-EXT-1** ความเสี่ยงนี้จำกัดอยู่แค่ร้านที่จ่ายเงิน (staff ของร้านที่ไม่จ่ายไม่เห็นช่องนี้เลยเพราะ disabled) — **หลัง D-EXT-1 ขยายเป็นทุกร้านที่มี staff ทันที**. user รับทราบและเลือก defer การแก้ไปก่อน. สิทธิ์ staff ที่ละเอียดกว่านี้ (เห็นต้นทุนได้ แต่ไม่เห็น Expense) เป็น Phase 2 — ตรงกับ Out of Scope เดิม §7.1 "RBAC granular กว่า Owner/Admin toggle เดียว"

### 11.3 Acceptance Criteria (Given/When/Then)

**FR-EXP-13: ถอด Business Package gate**

- `[FR-EXP-13-AC-01]` **Given** owner ของร้านไม่มี `BusinessPackageSubscription` เลย **When** เปิดฟอร์มแก้ไข/สร้างสินค้า **Then** ช่อง "ราคาทุน" กรอกได้ทันที ไม่มี badge ไม่ disabled
- `[FR-EXP-13-AC-02]` **Given** subscription เป็น `LOCKED_RENEWAL_FAILED` หรือ shop ถูก `packageLockedAt` ล็อกจากโควตาเกิน **When** owner (หรือ admin ที่ toggle เปิด) เข้า `/expenses` **Then** เข้าถึงได้ปกติ ไม่ขึ้น locked/upsell state ใด ๆ
- `[FR-EXP-13-AC-03]` **Given** role=ADMIN ของ Business shop ที่ `staffCanViewFinance=false` (default) **When** เข้า `/expenses` **Then** **ยังคงเห็น locked state "ยังไม่ได้รับสิทธิ์" เหมือนเดิมทุกประการ** — D-EXT-1 ไม่แตะเงื่อนไขนี้ (กัน regression ที่จะทำให้การถอด paywall กลายเป็นการถอด access control ทั้งหมดโดยไม่ตั้งใจ)
- `[FR-EXP-13-AC-04]` เมนู sidebar "ค่าใช้จ่าย" ไม่มี badge "อัปเกรด" อีกต่อไปในทุกกรณี — คงพฤติกรรมซ่อนเมนูสนิทเมื่อ `STAFF_NOT_ALLOWED`/`NO_SHOP` เหมือนเดิม

**FR-EXP-14: กำไรรายออเดอร์**

- `[FR-EXP-14-AC-01]` **Given** ออเดอร์ที่นับเป็นยอดขายแล้ว และทุกรายการมี `OrderItem.cost` ไม่ null **When** ผู้ใช้ที่ `resolveExpenseAccess`=GRANTED เปิด order detail **Then** เห็นกำไรของใบนั้น = `totalAmount − Σ(cost×qty)` ไม่มีคำเตือน
- `[FR-EXP-14-AC-02]` **Given** ออเดอร์เดียวกันแต่มี item ≥1 ตัวที่ `cost=null` **When** เปิด order detail **Then** **ห้ามแสดงตัวเลขกำไรเปล่า ๆ** — ต้องมีป้ายกำกับชัดเจน (เช่น "กำไรขั้นต่ำโดยประมาณ — มีสินค้าที่ยังไม่ตั้งต้นทุน") หรือแสดง "—" พร้อมลิงก์ไปตั้งต้นทุน (visual รอ `safepay-ux`) — ต้องเป็น **ธงระดับใบ** แยกต่างหาก ไม่ reuse `hasMissingCost` ของ `PnlReport` ซึ่งเป็นธงของทั้งช่วงเวลา
- `[FR-EXP-14-AC-03]` **Given** ออเดอร์ที่ไม่เข้าเงื่อนไข `countsAsRevenue` (PENDING/CANCELLED/SHIPPED ที่ยังไม่ยืนยันรับของ) **When** เปิด order detail **Then** แสดงป้าย "ยังไม่นับเป็นยอดขาย" แทนตัวเลขกำไร — ไม่คำนวณกำไรที่อาจกลายเป็นเท็จถ้าออเดอร์ถูกยกเลิกทีหลัง
- `[FR-EXP-14-AC-04]` **Given** ผู้ใช้ที่ `resolveExpenseAccess` ≠ GRANTED **When** เปิด order detail ใบเดียวกัน **Then** **ไม่เห็นบรรทัด/การ์ดกำไรเลย** (ไม่ query ด้วยซ้ำ) แม้จะเห็นรายการสินค้า+ราคาขายตามสิทธิ์ order detail ปกติ — กำไรผูก access เดียวกับ P&L ไม่ใช่สิทธิ์ดูออเดอร์
- `[FR-EXP-14-AC-05]` สินค้าที่ `cost > price` (ขายขาดทุน) → กำไรติดลบแสดงตรงไปตรงมา ไม่ clamp เป็น 0 ใช้ tone danger — ไม่ใช่ error

**FR-EXP-15: ต้นทุน/มาร์จิ้นในรายการสินค้า**

- `[FR-EXP-15-AC-01]` **Given** สินค้าที่มี `cost` ไม่ null **When** เปิด `/products` เดสก์ท็อป **Then** ตารางแสดง **ต้นทุน (บาท) และ มาร์จิ้น (%)** = `(price−cost)/price×100`
  > **แก้จากร่างแรกตอน implement (2026-08-08):** ร่างแรกเขียนว่า "คอลัมน์" 2 คอลัมน์ — ux กางเลขงบพื้นที่จริงแล้วพบว่าตารางนี้กว้าง ~1,254px **ตั้งแต่ก่อนเพิ่มฟีเจอร์นี้** ซึ่งล้นพื้นที่ content ที่จอ 1366px อยู่แล้ว (มี `overflow-x-auto` มาแต่ธีม) แยก 2 คอลัมน์กิน ~150-180px รวมเป็นคอลัมน์เดียว 2 บรรทัดกิน ~110px
  > เลือกรวม — ข้อมูลและการคำนวณครบตาม AC ทุกประการ ต่างแค่ layout และตารางนี้มี precedent อยู่แล้วคือคอลัมน์ "สินค้า" ที่รวมชื่อ+คำอธิบาย 2 บรรทัดในเซลล์เดียว **ไม่ตัดคอลัมน์อื่นทิ้งเพื่อชดเชย** เพราะทุกคอลัมน์ที่เหลือยังมีหน้าที่จริง (กรองได้/toggle/สัญญาณความนิยม)
- `[FR-EXP-15-AC-02]` **Given** สินค้าที่ `cost=null` **When** เปิดตาราง/การ์ด **Then** แสดง "—" ไม่ใช่ `฿0`/`0%` (กันสื่อความหมายผิดว่าต้นทุนเป็นศูนย์จริง)
- `[FR-EXP-15-AC-03]` **Given** viewport มือถือ **When** เปิด `/products` **Then** การ์ดแสดงต้นทุน/มาร์จิ้นเป็นบรรทัดเดียวในกรอบขวาเดิม (ระหว่างราคากับป้ายสถานะ) — **ไม่เพิ่มชั้นการ์ด** เพราะความสูงการ์ดถูกกำหนดโดยรูป 56px อยู่แล้ว บรรทัดนี้จึงอยู่ในโควตาที่เหลือ ไม่ลดจำนวนสินค้าที่เห็นต่อจอ
  > **คำบนมือถือใช้คำย่อ "ทุน" ไม่ใช่ "ต้นทุน" เต็ม** — ที่ 320px คำเต็มดันแถวขวาล้นออกนอกจอ (ux กางเลขแล้ว) เป็นการย่อเพื่อพื้นที่ **ไม่ใช่การผันคำตาม vertical** (คนละกฎกับ AC-04) คำเต็มยังใช้ในตารางเดสก์ท็อปและทุกที่อื่น
- `[FR-EXP-15-AC-04]` ร้าน `SERVICE_QUEUE` เปิด `/products` → หัวคอลัมน์ "ต้นทุน" **ไม่ผัน** ตาม vertical (เป็นคำนามล้วน ไม่มีกริยา/ลักษณนามที่ต้องผัน) แต่ **ป้ายที่อ้างถึงตัวสิ่งของ** (เช่น คำเตือน missing-cost ที่ `ExpenseWorkspace`) ต้องใช้ `resolveProductVocab(vertical).itemColLabel` แทน hardcode คำว่า "สินค้า" — ปิด gap เดิมที่แถบเตือนของ `/expenses` เขียน "มีสินค้าที่ยังไม่ได้ใส่ต้นทุน" ทั้งที่ร้านคิวงานควรเห็นคำว่า "บริการ"
- `[FR-EXP-15-AC-05]` ร้าน `LODGING` **ไม่มี** เมนู `/products` อยู่แล้ว (`applyVerticalMenu`) — FR นี้ไม่มีผล ไม่ต้องทำอะไรเพิ่ม

**FR-EXP-16: CSV Import cost**

- `[FR-EXP-16-AC-01]` **Given** แถว CSV ที่ cell `cost` ว่างเปล่า **When** import **Then** `Product.cost` เดิม **ไม่ถูกแตะ** (เสมือนไม่ส่ง key นี้มาเลย)
- `[FR-EXP-16-AC-02]` **Given** cell `cost` = `0` **When** import **Then** `Product.cost` ถูกตั้งเป็น `0` จริง — ยึด pattern `undefined`(ไม่แตะ)/`number`(ตั้งค่า) เดียวกับ `PATCH /api/products/[id]` ไม่ใช่ pattern ของ `stockQty` ที่บังคับทุกแถวต้องมีค่า
- `[FR-EXP-16-AC-03]` **Given** `cost` ติดลบอย่างน้อย 1 แถว **When** import **Then** **ไฟล์ถูกปฏิเสธทั้งใบ** (400 + ข้อความ "ราคาทุนต้องไม่ต่ำกว่า 0") และ **ไม่มีแถวไหนถูกเขียนลงฐานเลย** — ร้านแก้ไฟล์แล้วนำเข้าใหม่ได้โดยไม่ต้องไล่ดูว่าแถวไหนเข้าไปแล้ว
  > แก้จากร่างแรก (2026-08-08 ตอน implement): ร่างแรกกำหนดเป็น error รายแถว แต่ `stockQty` ติดลบใน schema เดียวกันเป็น 400 ทั้งไฟล์อยู่แล้ว — ถ้าต้นทุนเป็นรายแถวจะได้สองกฎในโมดัลเดียวกันสำหรับ "กรอกเลขติดลบ" ซึ่งอธิบายให้ผู้ใช้ไม่ได้
- `[FR-EXP-16-AC-04]` การ import ยังต้องผ่าน `isProActive(shop.id)` เหมือนเดิม — **D-EXT-1 ไม่ถอด gate นี้** เพราะเป็นคนละ subscription จาก Business Package

### 11.4 Edge Cases (คำตอบที่ล็อกแล้ว — QA ใช้เขียน TestCase ได้ตรง)

| Edge case | คำตอบ |
|---|---|
| ออเดอร์มี item บางตัว `cost=null` | FR-EXP-14-AC-02 — ห้ามโชว์ตัวเลขเปล่า ๆ ต้องมีธงระดับใบแยกจาก `hasMissingCost` ของรายงานรวม |
| ออเดอร์ยกเลิก / ยังไม่ยืนยันรับของ | FR-EXP-14-AC-03 — ไม่คำนวณกำไร ใช้ `countsAsRevenue`/`revenueOrderWhere` เป็น SSOT ตัวเดิม ไม่สร้างนิยามใหม่ |
| สินค้า `cost > price` (ขาดทุน) | FR-EXP-14-AC-05 / FR-EXP-15 — แสดงติดลบตรงไปตรงมา ไม่ clamp |
| Vertical SERVICE_QUEUE / LODGING | FR-EXP-15-AC-04/05 — SERVICE_QUEUE ใช้ `PRODUCT_VOCAB.itemColLabel` แทนคำว่า "สินค้า"; LODGING ไม่เกี่ยวเลย (`Room` ≠ `Product` และไม่มีเมนู) |
| CSV: cell ว่าง vs `0` | FR-EXP-16-AC-01/02 — ว่าง=ไม่แตะ, `0`=ตั้งศูนย์จริง (ยืนยันกับ `undefined`/`number` pattern ของ `product.service.ts` แล้ว) CSV ไม่รองรับ "ล้างค่ากลับเป็น null" (ไม่มี use case ผ่านไฟล์นำเข้า) |
| CSV: `cost` ติดลบ | FR-EXP-16-AC-03 — **ปฏิเสธทั้งไฟล์ (400)** ไม่ใช่ error รายแถว ให้เหมือน `stockQty` ที่อยู่ใน schema เดียวกัน |
| ร้านที่เคยจ่าย Business Package ได้อะไรคืน | **ไม่มี migration/refund ทางวิศวกรรม** — ไม่เปลี่ยน schema, row `BusinessPackageSubscription` เดิมยังอยู่ครบและยังให้ perk อื่นต่อ (ดู §11.5) เรื่องสื่อสาร/ชดเชยลูกค้าเป็นการตัดสินใจธุรกิจนอกขอบเขตเอกสารนี้ — user รับทราบตาม D-EXT-1 |

### 11.5 ผลกระทบต่อ Business Package — เหลืออะไรให้ขาย

| Perk ที่ยังคงเป็น paid-only | ที่มา |
|---|---|
| เปิด Business shop ได้มากกว่า 1 ร้าน (`maxBusinesses`) | `src/lib/business-package.ts` |
| เชิญ staff/admin เกิน 1 คนต่อร้าน (`maxAdminsPerBusiness`) | เดียวกัน |
| โควตา AI-suggest ไม่จำกัดต่อวัน | `src/services/ai-suggest-quota.service.ts` |
| Inventory Add-on PRO (CSV import ฯลฯ) — **คนละแพ็กเกจ ไม่เกี่ยวกับ Business Package** | `src/services/inventory-entitlement.service.ts` |

**สรุป:** การถอด gate ทำให้ Business Package สูญเสียจุดขาย "เห็นกำไรจริง" ซึ่งเป็นข้อความหลักในหน้า upsell เดิม (`ExpenseLockedCard`: "ปลดล็อกได้ด้วย Business Package") แต่ยังไม่ทำให้แพ็กเกจไร้ค่า เพราะ multi-shop / multi-staff / AI quota ยังผูกอยู่

---

## 12. ส่วนขยาย 2026-08-08 — ระบุต้นทุนตอนเปิดบิล

### 12.1 Decision Log

| # | เรื่อง | Decision | เหตุผล / สิ่งที่แลกไป |
|---|---|---|---|
| **D-EXT-4** | ช่องต้นทุนตอนเปิดบิล บังคับหรือไม่ | **Optional เสมอ ห้ามบล็อกการบันทึก** (user เคาะ) | ร้านเปิดบิลเร็วจากแชท — บังคับจะทำให้กรอกมั่วเพื่อให้ผ่าน ซึ่งแย่กว่าเว้นว่าง: ข้อมูลมั่วปนกับข้อมูลจริงแล้วแยกทีหลังไม่ได้เลย ต่างจากค่าว่างที่ระบบรู้ตัวว่า "ยังไม่รู้" |
| **D-EXT-5** | สินค้าที่ยังไม่มีต้นทุน | กรอกในบิลได้ **และ write-back เข้า `Product.cost`** (user เคาะ) | ถ้าต้นทุนอยู่แค่ในบิล Cost Coverage Rate จะไม่ขยับเลย และผู้ขายต้องกรอกซ้ำทุกใบ |
| **D-EXT-6** | ค่าที่พิมพ์ vs ค่าเดิมของสินค้า | **ค่าที่พิมพ์ชนะเสมอสำหรับ `OrderItem.cost` ของใบนั้น · write-back เฉพาะตอน `Product.cost` เป็น null** (Controller ตัดสิน) | ทางเลือกอีกทาง (ให้ค่าเดิมของสินค้าชนะ) แปลว่าผู้ขายพิมพ์ตัวเลขแล้วมันหายไปเงียบ ๆ = error เงียบ ซึ่งเป็นคลาสบั๊กที่โปรเจกต์นี้เจ็บซ้ำหลายรอบ · ส่วนการไม่ทับ `Product.cost` เดิม กันไม่ให้การเปิดบิลใบเดียวไปเปลี่ยนต้นทุนอ้างอิงของสินค้าเงียบ ๆ |

### 12.2 🛑 แก้ความเข้าใจผิดในเอกสารเดิม — `updateOrder` re-snapshot อยู่แล้ว

ระหว่างร่างรอบนี้ มีการสรุปว่า "ห้ามให้กรอกต้นทุนตอนแก้ไขออเดอร์ เพราะขัด D-5 ที่ว่า snapshot เกิดตอนสร้างเท่านั้น" — **ข้อสรุปนั้นมาจากถ้อยคำในเอกสาร ไม่ใช่จากโค้ด และไม่ตรงกับความจริง**

หลักฐาน (`src/services/order.service.ts` §5 ของ `updateOrder`): คอมเมนต์ในโค้ดเขียนเองว่า **"5) cost snapshot (เหมือน createOrder)"** และทำ batch lookup `Product.cost` แล้วเขียนลง `OrderItem.cost` ใหม่ทุกครั้ง · `PATCH /api/orders/[token]` ก็ validate ด้วย `CreateOrderSchema` ตัวเดียวกับตอนสร้าง

**แปลว่าการกดแก้ไขออเดอร์เขียนทับ `OrderItem.cost` อยู่แล้วบน prod มาตั้งแต่ต้น** ประโยค "snapshot เกิดที่จุดสร้างเท่านั้น" ใน FR-EXP-02 จึงเป็นข้อความที่ไม่ตรงกับโค้ด — คลาสเดียวกับ Hard Rule 16

**ผลต่อการตัดสินใจ:** ช่องต้นทุน**มีในหน้าแก้ไขออเดอร์ด้วย** ไม่ใช่เฉพาะตอนสร้าง — การซ่อนช่องไม่ได้รักษา reproducibility ไว้เลยเมื่อโค้ดเขียนทับอยู่แล้ว มันแค่ทำให้ผู้ขายแก้ไม่ได้ทั้งที่ระบบเขียนให้อยู่ดี
**ข้อจำกัดที่ยังอยู่:** ระบบยอมให้แก้เฉพาะออเดอร์ที่ยัง `PENDING` (`OrderNotEditableError`) — ออเดอร์ที่ `SHIPPED`/`CONFIRMED` แล้วยังแก้ไม่ได้เหมือนเดิม

### 12.3 Acceptance Criteria

- `[FR-EXP-17-AC-01]` **Given** ไม่กรอกช่องต้นทุน **When** บันทึก **Then** ไม่ส่ง key `cost` — พฤติกรรมเดิมทุกประการ (fallback `Product.cost`)
- `[FR-EXP-17-AC-02]` **Given** กรอกค่า ≥0 (รวม `0`) **When** บันทึก **Then** `OrderItem.cost` = ค่าที่กรอกเสมอ ไม่ว่าสินค้าจะมี `Product.cost` เดิมเป็นอะไร (D-EXT-6)
- `[FR-EXP-17-AC-03]` **Given** กรอก `0` **Then** `OrderItem.cost = 0` (ค่าจริง) และบรรทัดนั้น **ไม่** trigger คำเตือน "ต้นทุนไม่ครบ" — semantics เดียวกับ CSV (FR-EXP-16-AC-02)
- `[FR-EXP-17-AC-04]` **Given** กรอกค่าติดลบ **Then** ปฏิเสธเฉพาะบรรทัดนั้น **ไม่บล็อกทั้งบิล** (ต่างจาก CSV ที่ปฏิเสธทั้งไฟล์ — ที่นี่เป็นฟอร์มสด ไม่ใช่ batch)
- `[FR-EXP-17-AC-05]` **Given** ต้นทุนสูงกว่าราคาขาย **Then** **ไม่บล็อก** — ขึ้น badge "กำไร -X%" tone danger · **ห้ามทำ input เป็น `is-invalid`** เพราะขายต่ำกว่าทุนเป็นการตัดสินใจทางธุรกิจ ไม่ใช่กรอกผิดรูปแบบ
- `[FR-EXP-17-AC-06]` **Given** สินค้าที่ `Product.cost = null` (รวมสินค้าที่ Quick-Create เพิ่งสร้าง) **And** กรอกต้นทุน **Then** `Product.cost` ถูกตั้งเป็นค่านั้นในทรานแซกชันเดียวกัน (D-EXT-5)
- `[FR-EXP-17-AC-07]` **Given** สินค้าที่มี `Product.cost` อยู่แล้ว **When** ผู้ขายแก้ตัวเลขในบิล **Then** `Product.cost` เดิม **ไม่ถูกทับ** — ค่าที่กรอกมีผลแค่ใบนี้ (D-EXT-6)
- `[FR-EXP-17-AC-08]` **Given** เปิดหน้าแก้ไขออเดอร์ที่ยัง `PENDING` **Then** ช่องต้นทุนปรากฏและ prefill ด้วย `OrderItem.cost` ของใบนั้น (ดู §12.2)
- `[FR-EXP-17-AC-09]` ร้าน `SERVICE_QUEUE` เห็นช่องนี้เหมือน `ONLINE_SALES` — label "ราคาทุน" ไม่ผันตาม vertical (คำนามล้วน ตาม precedent FR-EXP-15-AC-04)

### 12.4 Edge Cases

| Edge case | คำตอบ |
|---|---|
| สินค้ามีต้นทุนแล้ว — prefill ไหม | prefill เงียบเหมือน `price` **ไม่มี badge "มาจากสินค้า"** — เพิ่มป้ายบอกที่มาให้ `cost` แต่ไม่มีให้ `price` จะสร้างความไม่สอดคล้องที่อธิบายไม่ได้ |
| Quick-Create ชื่อตรงกับสินค้าเดิมที่มีต้นทุน | ค่าที่พิมพ์ชนะสำหรับใบนี้ · `Product.cost` เดิมไม่ถูกทับ (D-EXT-6) |
| `cost = 0` vs เว้นว่าง | `0` = ต้นทุนศูนย์จริง (นับเข้า COGS, ไม่เตือน) · เว้นว่าง = ไม่รู้ (`null`, ข้ามจาก COGS, เตือน) — ตรงกับ CSV |
| `price = 0` (ของแถม) | ไม่แสดง badge กำไร (หารศูนย์ไม่ได้) ไม่ใช่แสดง "0%" |
| แก้ไขออเดอร์เก่า | ทำได้เฉพาะใบที่ยัง `PENDING` (ข้อจำกัดเดิมของระบบ) — ดู §12.2 |
| ร้าน `LODGING` | ไม่เกี่ยว — ไม่มี `Product.cost` ในเส้นทางการจอง |

### 12.5 ผลกระทบต่อออเดอร์เดิม

ออเดอร์ที่ `SHIPPED`/`CONFIRMED` ไปแล้ว **ไม่เปลี่ยนจาก feature นี้** — `OrderItem.cost` ยังเป็น `null` และป้าย "ต้นทุนไม่ครบ" บนการ์ดกำไรจะยังขึ้นต่อไป ไม่มี migration/backfill ในรอบนี้

เฉพาะร้านธนภัทร์ (ข้อมูล prod 2026-08-08): SHIPPED 61 · CONFIRMED 17 · **PENDING 9** · CANCELLED 4 — **9 ใบที่ยัง PENDING แก้ได้เองทันทีโดยเปิดแล้วกดบันทึกใหม่** เพราะ `updateOrder` re-snapshot จาก `Product.cost` ปัจจุบัน (ตรวจแล้วว่าสินค้าในทั้ง 9 ใบมีต้นทุนครบ) ส่วน 78 ใบที่เหลือแก้ไม่ได้เพราะพ้นสถานะ PENDING แล้ว

---

## 13. ส่วนขยาย 2026-08-09 — นับค่าส่งจริงเป็นต้นทุนของคำสั่งซื้อ

### 13.1 Decision Log (user เคาะแล้ว — ห้าม re-litigate)

> การตั้งชื่อ: มติชุดนี้ต่อลำดับจาก D-EXT-1..6 (§11–§12) ไม่ใช่มติใหม่ที่ทับของเดิม

| # | เรื่อง | Decision | สิ่งที่แลกไป |
|---|---|---|---|
| ~~**D-EXT-7**~~ | ~~วิธีหักค่าส่ง~~ | ~~หักจากกำไรขั้นต้นตรง ๆ และเปลี่ยนนิยาม `GROSS_PROFIT_FORMULA`~~ | **ยกเลิกแล้ว — แทนที่ด้วย D-EXT-10** (user แก้มติ 2026-08-09 หลังข้อมูลขึ้น prod แล้ว: "มันต้องเป็นค่าใช้จ่ายนะ ผมน่าจะบอกผิด") เก็บบรรทัดนี้ไว้เพื่อให้คนอ่านย้อนหลังรู้ว่าเคยตัดสินอีกแบบ ไม่ใช่ลืมทำ |
| **D-EXT-10** | ค่าส่งเป็นต้นทุนประเภทไหน | 🛑 **ค่าส่งคือ "ค่าใช้จ่าย" ไม่ใช่ "ต้นทุนสินค้า"** — ไปลด **กำไรสุทธิ** ในหมวดค่าขนส่ง ไม่แตะนิยาม `GROSS_PROFIT_FORMULA` ที่มีอยู่เดิม | ถูกต้องตามหลักบัญชี (ค่าส่งไม่ใช่ต้นทุนของตัวสินค้า) และ **ไม่ต้องเปลี่ยนความหมายของตัวเลขที่ผู้ขายคุ้นอยู่แล้ว** — ภาระ HR16 เรื่อง "ต้องประกาศว่าความหมายเปลี่ยน" จึงหมดไปด้วย |
| **D-EXT-12** | หน้า /sales กับชีตยอดขาย ยังหักค่าใช้จ่ายที่ร้านบันทึกเองไหม | **ไม่หัก — เหลือ ยอดขาย − (ต้นทุนสินค้า + ค่าส่ง)** ค่าใช้จ่ายอื่นยังบันทึกที่ /expenses เหมือนเดิม (user 2026-08-09: "เอา Expense จาก chart นี้ก่อน") | คอลัมน์เหลือค่าส่งล้วนจึงตั้งชื่อว่า "ค่าส่ง" ได้ตรงตัว · แลกด้วยการที่ **สองหน้านิยามกำไรไม่เท่ากัน** — กันชนด้วย `SALES_PROFIT_FORMULA` + เลิกใช้คำว่า "กำไรสุทธิ" ที่ /sales (ใช้ "กำไรจากการขาย") |
| **D-EXT-13** | ทำยังไงเมื่อ iShip ยังไม่คิดเงิน | **ยิง `check-price` ตอนสร้างพัสดุแล้วเก็บเป็น `estimatedPrice` ใช้ไปก่อน** ราคาจริงเขียนทับเมื่อขนส่งชั่งเสร็จ (user 2026-08-10: "แค่ขอเลข tracking ปกติ ต้องมีค่าส่งเลยนะ") | iShip ตัดเครดิตตอนกดสร้างจริง แต่ **API ไม่เปิดราคาจนกว่าจะชั่ง** (ใบ `status=1` คืน `discount_price=0` · พิสูจน์กับ `TH271991F5GZ5E`) · ราคาประมาณคิดจากน้ำหนักที่ร้านแจ้ง จึงมักต่ำกว่าจริง (92/151 ใบชั่งได้หนักกว่า) |
| **D-EXT-14** | บอกผู้ใช้ไหมว่าตัวเลขไหนยังเป็นราคาประมาณ | **ไม่บอก — แสดงเหมือนราคาจริง** (user 2026-08-10: "ลูกค้ารู้อยู่แล้ว ให้แสดงแค่ค่าส่งก็พอ") | ใช้ได้เพราะเลือกทาง "เติมให้เต็ม" แล้ว (D-EXT-13) — ถ้ายังเป็นทางปล่อยว่าง การไม่มีป้ายคือบั๊กเดิมซ้ำ ดู retro 2026-08-10 §C3 |
| **D-EXT-11** | เก็บเป็นแถว `Expense` ไหม | **ไม่สร้างแถว `Expense`** — รายงานกำไร-ขาดทุนอ่านค่าส่งจาก `OrderShipment` โดยตรงแล้วรวมเป็นค่าใช้จ่ายหมวดค่าขนส่ง | ตัวเลขมีที่เก็บที่เดียว ไม่มีผู้เขียนสองราย (ระบบ+คน) จึงไม่มีทางนับซ้ำหรือหลุด sync — เหตุผลเดียวกับ `stored-flag-vs-owner-truth.md` · แลกด้วยการที่รายการไม่โผล่ในหน้า `/expenses` (ยอดรวมยังเห็นในรายงาน) · ข้อมูลจริง 2026-08-09: ตาราง `Expense` **ว่างทั้งฐาน ทุกร้าน 0 แถว** จึงไม่มีของเดิมให้ชนตอนนี้ |
| **D-EXT-8** | แหล่งราคาจริง | **ขยาย polling `syncShipmentStatuses()` (ไม่เปิด webhook) + เก็บราคาประเมินตอนสร้างพัสดุด้วย** | ได้ 2 ค่า: ประเมิน (รู้ทันที, คอลัมน์ใหม่ `estimatedPrice`) และจริง (มาทีหลัง, `carrierPrice` ที่มีอยู่แล้ว) · ไม่ต้องพึ่ง iShip ตั้งค่าฝั่งเขา · แลกด้วยความช้าตามรอบ sync |
| **D-EXT-9** | ข้อมูลเก่า | **ลอง backfill จาก iShip ก่อน แล้วค่อยตัดสิน — dry-run ดูแถวจริงก่อนเขียนจริงเสมอ** | บทเรียน 2026-08-09: dry-run คือด่านเดียวที่จับได้ ขณะที่เทสเดิม 2 ข้อ *ยืนยันพฤติกรรมที่เป็นบั๊ก* เขียวมาตลอด |

### 13.2 Business Rules

| รหัส | ข้อความ |
|---|---|
| **BR-EXP-18-01** | ค่าใช้จ่ายค่าขนส่งนับจากค่าส่ง **จริง** เท่านั้น (`carrierPrice`) — ราคาประเมินไม่มีผลต่อตัวเลขใด ๆ ใช้เป็นข้อมูลอ้างอิงเท่านั้น |
| **BR-EXP-18-02** | ออเดอร์ที่ไม่มีพัสดุ iShip เลย — ไม่มีค่าใช้จ่ายค่าขนส่งเกิดขึ้นจากใบนั้น และไม่มีธงเตือนใด ๆ (กัน regression) |
| **BR-EXP-18-04** | 🛑 **ค่าส่งจริงไม่เข้า `GROSS_PROFIT_FORMULA`** — กำไรขั้นต้นยังเป็น `ยอดที่ลูกค้าจ่าย − ต้นทุนสินค้า` เท่าเดิม ค่าส่งไปลดกำไรสุทธิในฐานะค่าใช้จ่าย (D-EXT-10) |
| ~~**BR-EXP-18-05**~~ | ~~ค่าใช้จ่ายหมวดค่าขนส่งในรายงาน = `Expense` + ค่าส่งจริง~~ **ยกเลิกโดย D-EXT-12** — หน้า /sales ไม่รวมตาราง `Expense` แล้ว จึงไม่มีสองแหล่งให้ชนกัน |
| **BR-EXP-18-06** | ลำดับความน่าเชื่อถือของค่าส่ง: **ราคาจริง (`carrierPrice`) → ราคาประมาณ (`estimatedPrice`) → ไม่มี** — ห้ามบวกกัน และห้ามใช้ตัวที่มาถึงก่อน |
| **BR-EXP-18-07** | `codFee` บวกได้เสมอไม่ว่าราคาส่งจะมาหรือยัง — iShip คิดจาก % ของยอด COD จึงรู้ตั้งแต่วินาทีที่สร้างพัสดุ · การผูกการเก็บ `codFee` ไว้กับเงื่อนไขของ `carrierPrice` คือการทิ้งข้อมูลที่รู้แล้วโดยไม่จำเป็น (บั๊กที่แก้ 2026-08-10) |
| **BR-EXP-18-03** | ค่าส่งที่นับต้องมาจากพัสดุ **active** เท่านั้น (`status='CREATED' AND isDryRun=false`) — นิยามเดียวกับ "ออเดอร์นี้มีพัสดุแล้ว" ที่ล็อกไว้ตั้งแต่ 2026-08-06 · partial unique index `OrderShipment_active_order_key` (`prisma/schema.prisma:2069-2072`) การันตีว่ามีได้สูงสุด 1 ใบต่อออเดอร์ จึงไม่มี ambiguity ว่า "ใบไหน" |
| **BR-EXP-19-01** | check-price ล้มเหลวตอนสร้างพัสดุ **ต้องไม่บล็อก** การสร้างพัสดุจริง |
| **BR-EXP-20-01** ✅ ปิดแล้ว 2026-08-09 | ค่าส่งจริงมาจากฟิลด์ **`discount_price`** ของ `query_orders` (ชื่อหลอก — ไม่ใช่ส่วนลด) และน้ำหนักจริงมาจาก **`actual_weight`** · `price`/`total_price` **ไม่มีในทั้ง `query_orders` และ `get_order`** มีเฉพาะใน webhook ที่ตายอยู่ · พิสูจน์ด้วยการเทียบ `check-price` ที่น้ำหนักจริงกับ `discount_price` ตรงกัน 55/56 ใบ |
| **BR-EXP-20-02** | 🛑 **ห้ามคำนวณค่าส่งย้อนหลังด้วย `check-price` — ต้องเก็บค่าที่ iShip บันทึกไว้เท่านั้น** ใบที่ 56 (`TH066536981258`) พิสูจน์แล้วว่า re-quote ได้ "ราคาวันนี้" (41) ไม่ใช่ "เงินที่ถูกหักจริง" (38) และผิดแบบเงียบ ๆ ไม่มีอะไรฟ้อง |
| **BR-EXP-22-01** | `cod_fee` เป็นต้นทุนอีกก้อน **ไม่ทับซ้อนกับค่าส่ง** (คิดเป็น % ของยอด COD ไม่ใช่ของค่าส่ง) — ต้องหักออกจากกำไรด้วยเช่นกันเมื่อออเดอร์นั้นเป็น COD |

### 13.3 Acceptance Criteria

**FR-EXP-18**
- `[AC-01]` **Given** ออเดอร์ไม่มี `OrderShipment` เลย **Then** กำไรขั้นต้นเท่าเดิมทุกบาท ไม่มีธงค่าส่ง
- `[AC-02]` **Given** พัสดุ active มี `carrierPrice` **Then** กำไรขั้นต้น = `totalAmount − Σ(item.cost×qty) − carrierPrice` ไม่มีธง
- `[AC-03]` **Given** พัสดุ active แต่ `carrierPrice` ยัง null **Then** **ไม่หัก** และต้องมีธง "ยังไม่ทราบค่าส่งจริง" ที่แยกจาก `hasMissingCost`
- `[AC-04]` **Given** ออเดอร์ที่ไม่เข้า `countsAsRevenue` **Then** ยังแสดง "ยังไม่นับเป็นยอดขาย" ตาม FR-EXP-14-AC-03 เดิม (กฎเดิมชนะ ไม่คำนวณค่าส่ง)
- `[AC-05]` **Given** ผู้ใช้ที่ `resolveExpenseAccess` ≠ GRANTED **Then** ไม่เห็นทั้งกำไรและค่าส่งจริง
- `[AC-06]` นิยามที่ผู้ใช้เห็นบนหน้าจอต้องมีคำว่า "ค่าส่ง" อยู่ในสูตร ไม่ใช่แค่ในคอมเมนต์โค้ด

**FR-EXP-19**
- `[AC-07]` check-price สำเร็จ → `estimatedPrice` ถูกบันทึกพร้อมพัสดุ
- `[AC-08]` check-price ล้ม/timeout → พัสดุยังสร้างสำเร็จ `estimatedPrice` = null ไม่มี error โผล่ให้ผู้ใช้เห็นจากส่วนนี้
- `[AC-09]` พัสดุ `source='LINKED'` → `estimatedPrice` = null เสมอ และ **ห้ามแสดงเป็น ฿0**

**FR-EXP-20** (บล็อกจนกว่า Open Gate ปิด)
- `[AC-10]` พัสดุที่จบสถานะแล้ว → `carrierPrice` ถูกเขียนในรอบ sync ถัดไป โดย**ไม่เพิ่มจำนวนคำขอ/รอบ sync ใหม่**

**FR-EXP-21**
- `[AC-11]` dry-run พิมพ์ตัวอย่างแถวจริง ≥10 แถวให้ตรวจก่อนเขียนจริง
- `[AC-12]` เขียนเฉพาะแถวที่ `carrierPrice IS NULL` — ไม่ทับค่าที่มีอยู่แล้ว

### 13.4 Edge Cases

| Edge case | คำตอบ |
|---|---|
| `cod_fee` อาจรวมค่าส่งไว้แล้ว | **ยังไม่ล็อก — OQ-1** ห้ามหักทั้งคู่จนกว่าจะยืนยันว่าเป็นคนละก้อน |
| พัสดุ `isDryRun=true` | ไม่นับเสมอ |
| พัสดุ `CANCELLED`/`FAILED` | ไม่นับ (BR-EXP-18-03) — คลาสเดียวกับบั๊ก 2026-08-06 ที่ใบ FAILED ถูกนับเป็น "มีพัสดุแล้ว" |
| ออเดอร์ที่ยกเลิกพัสดุแล้วเปิดใหม่ | ไม่ ambiguous — partial unique index การันตี active ได้ใบเดียว |
| `source='LINKED'` | ไม่มี `estimatedPrice` เลย รอ `carrierPrice` จาก polling อย่างเดียว — อาจไม่มีทางได้ราคาจริงถ้า payload ไม่มีฟิลด์ราคา (ผูกกับ Open Gate) |
| ส่งเองไม่ผ่าน iShip | ไม่หัก ไม่มีธง (BR-EXP-18-02) |
| ราคาจริงมาหลังปิดออเดอร์ | ไม่เก็บ snapshot — คำนวณจาก state ปัจจุบันเสมอ (เหมือน `computeOrderProfit` เดิม) ตัวเลขขยับย้อนหลังได้ · **indicator บนหน้าจอยังไม่ล็อก (OQ-4)** |

### 13.5 ผลกระทบต่อผู้ขาย + การสื่อสาร

🛑 **กำไรขั้นต้นของออเดอร์ที่มีค่าส่งจริงจะลดลงทันทีที่ deploy** (ไม่ใช่ค่อย ๆ ลด) เพราะเป็นการเปลี่ยน *นิยาม* ของสูตรที่มีอยู่แล้ว ไม่ใช่ฟีเจอร์ใหม่ที่ opt-in — ตรงกับคลาสที่ HR16 เตือนไว้ **ต้องมีข้อความอธิบายบนหน้าจอ** ว่า "กำไรขั้นต้นตอนนี้หักค่าส่งจริงแล้ว" อย่างน้อยในรอบแรกที่ผู้ใช้เห็นตัวเลขที่เปลี่ยน — รูปแบบ UI รอ `safepay-ux` (HR8) แต่ **ต้องมี ไม่ใช่ nice-to-have**

**สิ่งที่ยังไม่เปลี่ยนในรอบนี้:** `NET_PROFIT_FORMULA` ที่ `/sales` — ค่าส่งจริงกระทบ **กำไรขั้นต้นรายใบ** ก่อน; จะให้ไหลเข้ากำไรสุทธิรวมช่วงเวลาด้วยหรือไม่ (และจะซ้อนกับ `Expense` หมวด `SHIPPING` ที่ร้านกรอกมืออยู่แล้วหรือเปล่า) ต้องระบุให้ชัดใน SRS — **ยังไม่ล็อกในรอบนี้**

---

**หมายเหตุ:**
สำหรับความต้องการทางธุรกิจระดับภาพรวม/personas/KPI ดู [[PRD]] ของโมดูลนี้
สำหรับ technical specification (architecture/API/data/NFR) ดู [[SRS]] ของโมดูลนี้

**สถานะ implement (อัปเดต 2026-08-07):** FR-EXP-01..11 (core) + FR-EXP-12 (กำไรบนหน้ายอดขาย, §2.5) **deployed แล้ว**; **ส่วนขยาย D-EXT-1..3 / FR-EXP-13..16 (§11) อยู่ระหว่าง implement** บน branch `feature/product-cost` — ดู SRS.md §10 สำหรับรายละเอียดเชิงเทคนิคของ FR-EXP-12
