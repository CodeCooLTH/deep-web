---
title: "PRD — Expense & Cost Tracking"
owner: shinobu22
status: draft
module: M00016-ExpenseCostTracking
version: "1.0"
created: 2026-07-08
tags: [feature, expense, cost, profit, pnl, seller, business-package]
related: ["[[BRD]]", "[[Feature-Docs-Ownership]]"]
---

> **โมดูล:** M00016-ExpenseCostTracking
> **ประเภทเอกสาร:** Product Requirements Document (PRD)
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-07-08
> **สถานะ:** Draft
> **เจ้าของเอกสาร:** BA + PO + PM (ดู [[Feature-Docs-Ownership]])

# PRD: บันทึกค่าใช้จ่าย + ตั้งต้นทุนสินค้า (Expense & Cost Tracking)

---

## Executive Summary

วันนี้ Seller บน Deep เห็นแค่ "ยอดขาย" (Revenue) จาก order ที่ CONFIRMED — ไม่มีทางรู้ว่าขายแล้ว **กำไรจริง** เท่าไร เพราะระบบไม่มีที่เก็บต้นทุนสินค้า (COGS) และไม่มีที่บันทึกค่าใช้จ่ายดำเนินธุรกิจ (ค่าเช่า/ค่าแพ็คเกจ/ค่าโฆษณา ฯลฯ) ฟีเจอร์นี้เติมช่องว่างนั้นด้วย 2 กลไกที่ทำงานร่วมกัน: (1) **ตั้งต้นทุนสินค้า** (`Product.cost`, optional) ที่ถูก **snapshot ลง `OrderItem.cost`** ตอนสร้าง order ทุกครั้ง (pattern เดียวกับ `OrderItem.price` เดิม) เพื่อให้ต้นทุนของออเดอร์เก่าไม่เปลี่ยนแปลงแม้ seller จะแก้ราคาทุนสินค้าทีหลัง และ (2) **บันทึกค่าใช้จ่าย** (Expense) แยกหมวดหมู่คงที่ (fixed list) ที่ผูกกับร้าน ทั้งสองกลไกไหลเข้าหน้าใหม่ `/expenses` (Paces, `(paces)/seller/**`) ที่แสดง **รายงานกำไรขาดทุนเต็มรูป (full P&L)** ตามช่วงเวลา: `Revenue − COGS = Gross Profit` และ `Gross Profit − Total Expense = Net Profit` โดยนับเฉพาะออเดอร์สถานะ `CONFIRMED` (สอดคล้อง pattern การนับ revenue ที่ dashboard เดิมใช้อยู่แล้ว)

ฟีเจอร์นี้เป็น **paid add-on ที่ไม่คิดเงินแยก** — ผูกเข้าเป็นสิทธิ์ของ **Business Package** (feature 00008) ที่มีอยู่แล้วในระบบ (ทุก tier ที่จ่ายเงิน: Growth/Pro/Business) reuse gating mechanism เดิม (`getSubscriptionStatus(ownerId)`) แทนการสร้าง billing ใหม่ ส่วนสิทธิ์เห็นข้อมูลการเงินภายในร้าน ผูกกับ owner เสมอ + owner เปิด/ปิดสิทธิ์ให้ `ShopMember(role=ADMIN)` (feature 00008/00012, live แล้ว) เห็นได้เองผ่าน toggle ระดับร้าน

---

## 1. Business Goals & KPIs

### 1.1 เป้าหมายทางธุรกิจ

| เป้าหมาย | รายละเอียด |
|----------|-----------|
| **ให้ Seller เห็นกำไรจริง ไม่ใช่แค่ยอดขาย** | ปิดช่องว่างที่ใหญ่ที่สุดของ Simple OMS เดิม — seller ตัดสินใจตั้งราคา/ลดต้นทุนได้จากข้อมูลจริง ไม่ใช่ความรู้สึก |
| **เพิ่มมูลค่า Business Package โดยไม่เพิ่ม billing ใหม่** | Bundle เป็นสิทธิ์ของ package ที่มีอยู่แล้ว (feature 00008) — เพิ่มเหตุผลให้ seller อัพเกรด/ไม่ downgrade โดยไม่ต้องสร้าง payment flow ใหม่ |
| **ต้นทุนที่แม่นยำตามเวลา (Historical Accuracy)** | ต้นทุนของออเดอร์เก่าต้องไม่เปลี่ยนเมื่อ seller แก้ราคาทุนสินค้าใหม่ — กำไรที่รายงานไปแล้วต้อง reproducible เสมอ |
| **Zero Regression บนสินค้า/ออเดอร์เดิม** | `Product.cost`/`OrderItem.cost` เป็น nullable, opt-in ทั้งหมด — สินค้าที่ไม่เคยตั้งต้นทุนต้องใช้งานได้เหมือนเดิมทุกประการ |

### 1.2 ตัวชี้วัดความสำเร็จ (KPIs)

| KPI | คำอธิบาย | เป้าหมาย |
|-----|----------|---------|
| **Cost Coverage Rate** | % ของ Product (active, ผ่าน CONFIRMED order อย่างน้อย 1 ครั้ง) ที่มี `cost` ไม่ null | ≥ 50% ภายใน 60 วันหลัง launch (baseline วัดหลัง launch เดือนแรก) |
| **Expense Logging Adoption** | % ของ shop ที่มีสิทธิ์เข้าถึง (Business Package ACTIVE) ที่บันทึก Expense อย่างน้อย 1 รายการภายใน 30 วัน | ≥ 30% |
| **P&L Report View Rate** | % ของ shop ที่มีสิทธิ์เข้าถึงที่เปิดหน้า `/expenses` อย่างน้อย 1 ครั้ง/สัปดาห์ | ติดตามเป็น baseline (ไม่ตั้งเป้าตายตัวรอบแรก) |
| **Business Package Retention** | อัตราการไม่ downgrade/cancel ของ owner ที่ใช้ Expense feature เทียบกับที่ไม่ใช้ | เพิ่มขึ้น (สัญญาณว่า perk มีผลต่อ retention) |

---

## 2. User Personas (กลุ่มผู้ใช้งาน)

### 2.1 Seller เจ้าของร้าน (Shop Owner) — Primary

**ข้อมูลพื้นฐาน:**
- Owner ของ Shop (PERSONAL หรือ BUSINESS) ที่ตนหรือ owner ระดับบน (กรณี Business shop) มี Business Package **ACTIVE** อยู่
- มีสินค้าและออเดอร์อยู่แล้วในระบบ (ผ่าน Simple OMS เดิม)

**เป้าหมาย:**
- รู้กำไรสุทธิของร้านตามช่วงเวลาที่เลือก (สัปดาห์/เดือน/กำหนดเอง) โดยไม่ต้องคำนวณเองใน Excel

**ความต้องการ:**
- ตั้งต้นทุนสินค้าแต่ละชิ้นได้ (optional — ไม่บังคับทุกชิ้น)
- บันทึกค่าใช้จ่ายดำเนินธุรกิจแยกหมวดได้เร็ว ไม่ต้องกรอกฟอร์มซับซ้อน
- เห็นรายงาน Revenue/COGS/Gross Profit/Expense/Net Profit รวมในหน้าเดียว ไม่ต้องคำนวณข้ามหน้า
- ควบคุมได้ว่าจะให้พนักงาน (admin) เห็นตัวเลขการเงินเหล่านี้หรือไม่

**จุดปวด (Pain Points):**
- ทุกวันนี้ต้องจดค่าใช้จ่าย/คำนวณกำไรแยกนอกระบบ (สมุด/Excel) — ข้อมูลไม่อยู่ที่เดียวกับยอดขาย
- กลัวว่าถ้าแก้ราคาทุนสินค้าใหม่ ตัวเลขกำไรของเดือนก่อน ๆ จะเปลี่ยนตามไปด้วย (ไม่ reliable)

### 2.2 พนักงานร้าน (ShopMember role=ADMIN) — Secondary

**ข้อมูลพื้นฐาน:**
- ถูก owner invite เข้ามาช่วยบริหาร Business shop (feature 00008/00012, live แล้ว)

**เป้าหมาย:**
- ถ้า owner อนุญาต อยากเห็นภาพรวมกำไร/ค่าใช้จ่ายเพื่อช่วยตัดสินใจงานประจำวัน (เช่น ตั้งราคาโปรโมชัน)

**ความต้องการ:**
- เข้าหน้า `/expenses` ได้เมื่อ owner เปิด toggle ให้เห็น — ถ้าไม่เปิด ต้องมองไม่เห็นเมนู/ข้อมูลนี้เลย ไม่ใช่แค่ disable ปุ่ม

**จุดปวด (Pain Points):**
- ถ้า default เปิดให้เห็นเอง จะกลายเป็นข้อมูลการเงินที่ owner ไม่ได้ตั้งใจแชร์ — ต้อง default ปิดเสมอ

### 2.3 Seller ที่ไม่มี Business Package (Free/Personal) — Boundary Persona

**ข้อมูลพื้นฐาน:**
- ส่วนใหญ่ของระบบวันนี้ — ไม่มี Business Package ACTIVE เลย

**เป้าหมาย:**
- ใช้งาน Simple OMS/Product เดิมได้ตามปกติ ไม่ถูกรบกวนจาก feature ที่ตัวเองยังไม่ได้จ่ายเงิน

**ความต้องการ:**
- เห็น entry point แบบ upsell เบา ๆ ไปหน้า `/expenses` (ล็อกอยู่) แต่ไม่ต้องเห็น field ต้นทุนแทรกเข้ามาในฟอร์มสินค้า/ออเดอร์เดิมโดยไม่จำเป็น (ต้อง confirm UX ว่าฟิลด์ cost ที่หน้า Product form แสดงเสมอหรือ gate ด้วย package — ดู §9.2 assumption)

**จุดปวด (Pain Points):**
- กลัว flow สร้างสินค้า/ออเดอร์เดิมช้าลงหรือซับซ้อนขึ้นเพราะ field ใหม่ที่ตัวเองใช้ไม่ได้

---

## 3. Business Requirements

### 3.1 ตั้งต้นทุนสินค้า (Product Cost)

**ความต้องการ:**
- Seller ตั้งราคาทุน (`cost`) ให้สินค้าแต่ละชิ้นได้ — เป็นฟิลด์ **optional** ไม่บังคับกรอก

**Business Rules:**
- `cost` ต้อง ≥ 0 ถ้ามีการกรอก
- สินค้าที่ไม่เคยตั้ง `cost` (null) ยังสร้าง/ขายได้ตามปกติทุกประการ — ไม่มีการบังคับให้ตั้งก่อนขาย
- แก้ไข `cost` ของสินค้าที่มีอยู่ **ไม่กระทบ** ต้นทุนของออเดอร์ที่เคยขายไปแล้ว (ดู §3.2 snapshot)

**เหตุผล:**
- Nullable + opt-in คือเงื่อนไข zero-regression กับสินค้าเดิมทั้งหมดในระบบที่ไม่เคยมี concept ต้นทุนมาก่อน

### 3.2 ต้นทุนล็อก ณ วันขาย (Cost Snapshot)

**ความต้องการ:**
- ทุกครั้งที่สร้างออเดอร์ ระบบต้องบันทึก "ต้นทุน ณ ขณะนั้น" ของแต่ละรายการสินค้าไว้ในตัวออเดอร์เอง ไม่ใช่ไปอ้างอิงต้นทุนปัจจุบันของสินค้า

**Business Rules:**
- Snapshot เกิดที่จุดสร้าง order เดียวกับที่ `OrderItem.price` ถูก snapshot อยู่แล้ว (pattern เดียวกัน)
- ถ้า `Product.cost` เป็น null ณ ขณะสร้างออเดอร์ → `OrderItem.cost` = null (ไม่มีค่าให้ snapshot — ไม่ใช่ error)
- รายการสินค้าที่ไม่ผูกกับ Product ใด ๆ (custom/manual line item, `OrderItem.productId` เป็น null) → `OrderItem.cost` เป็น null เสมอ (ไม่มีต้นทุนอ้างอิง)
- แก้ `Product.cost` ทีหลัง **ไม่มีผลย้อนหลัง** กับ `OrderItem.cost` ที่ snapshot ไปแล้ว

**เหตุผล:**
- P&L ของเดือนก่อนต้องคำนวณซ้ำได้ผลเดิมเสมอ (historical accuracy) — เหมือนเหตุผลที่ `OrderItem.price` ถูก snapshot แยกจาก `Product.price` มาตั้งแต่ต้น

### 3.3 บันทึกค่าใช้จ่าย (Expense Entry)

**ความต้องการ:**
- Seller บันทึก/ดู/แก้/ลบรายการค่าใช้จ่ายของร้านตนเองได้ที่หน้า `/expenses` — ระบุจำนวนเงิน, หมวดหมู่ (fixed list), วันที่เกิดค่าใช้จ่าย, หมายเหตุ (optional)

**Business Rules:**
- จำนวนเงิน (`amount`) ต้อง > 0
- หมวดหมู่ต้องเป็นค่าจาก fixed list เท่านั้น (ดู §3.4) — ไม่มีการเพิ่มหมวดเองในเวอร์ชันนี้
- Expense ทุกรายการผูกกับ `shopId` เดียว — seller เห็น/แก้/ลบได้เฉพาะของร้านตัวเองเท่านั้น (ดู §3.6 authorization)
- แก้ไข/ลบทำได้ทุกเวลา ไม่มีการล็อกรายการเก่า (ต่างจาก order ที่มี state machine)

**เหตุผล:**
- Fixed category ลดความซับซ้อนของ MVP (ไม่ต้องมี category management UI) และให้ report จัดกลุ่มได้ตรงกันทุกร้าน

### 3.4 หมวดหมู่ค่าใช้จ่าย (Fixed Category List)

**ความต้องการ:**
- ระบบกำหนดหมวดหมู่ตายตัว 7 หมวดให้ seller เลือกตอนบันทึก

**Business Rules:**

| ค่าที่เก็บใน DB | ป้ายภาษาไทย |
|---|---|
| `RENT` | ค่าเช่า |
| `PACKAGING` | ค่าแพ็คเกจ/บรรจุภัณฑ์ |
| `ADVERTISING` | ค่าโฆษณา |
| `SHIPPING` | ค่าขนส่ง |
| `SALARY` | เงินเดือน |
| `UTILITIES` | สาธารณูปโภค |
| `OTHER` | อื่นๆ |

- เก็บเป็น `String` enum-style (ตาม convention `Order.status`/`Shop.categories` เดิม — ไม่ใช้ Prisma `enum` จริง เพื่อเลี่ยง `ALTER TYPE` ทุกครั้งที่ปรับหมวด)

**เหตุผล:**
- ตรงกับ convention เดิมของระบบทั้งหมด (String-based state/category แทน Prisma enum) — เปลี่ยน/เพิ่มหมวดในอนาคตไม่ต้อง migration

### 3.5 รายงานกำไรขาดทุน (P&L Report)

**ความต้องการ:**
- หน้า `/expenses` แสดงรายงาน **Revenue, COGS, Gross Profit, Total Expense, Net Profit** ตามช่วงเวลาที่ seller เลือก (เช่น วันนี้/สัปดาห์นี้/เดือนนี้/กำหนดเอง)

**Business Rules:**
- **Revenue** = ผลรวม `Order.totalAmount` ของออเดอร์ที่ `status = CONFIRMED` และ `createdAt` อยู่ในช่วงที่เลือก (ใช้ `Order.createdAt` เป็น anchor — pattern เดียวกับ dashboard เดิมที่ group by `createdAt`)
- **COGS** = ผลรวม `OrderItem.cost × OrderItem.qty` ของทุกรายการใน order ที่เข้าเงื่อนไข Revenue ข้างต้น **เฉพาะรายการที่มี `cost` ไม่ null**
- **Gross Profit** = `Revenue − COGS`
- **Total Expense** = ผลรวม `Expense.amount` ของร้านนั้น ที่ `expenseDate` อยู่ในช่วงเวลาเดียวกัน
- **Net Profit** = `Gross Profit − Total Expense`
- ถ้ามี order ในช่วงที่เลือกที่มีอย่างน้อย 1 รายการสินค้าที่ `OrderItem.cost` เป็น null (ไม่เคยตั้งต้นทุน หรือเป็น custom line item) → รายงานต้องแสดง **คำเตือน "กำไรอาจไม่สมบูรณ์ (มีสินค้าที่ยังไม่ตั้งต้นทุน)"** กำกับตัวเลข Gross/Net Profit เสมอ ไม่ใช่แค่ error เงียบ ๆ

**เหตุผล:**
- แยก Gross/Net ชัดเจนตามหลักบัญชีพื้นฐาน — ให้ seller เห็นทั้ง "ต้นทุนสินค้า" และ "ค่าใช้จ่ายดำเนินงาน" แยกจากกัน ไม่ปนกันจนตีความผิด

### 3.6 สิทธิ์เห็นข้อมูลการเงิน (Finance Visibility)

**ความต้องการ:**
- เจ้าของร้าน (owner) เห็นข้อมูล Expense/P&L ของร้านตนเองเสมอ ไม่มีเงื่อนไข
- Owner ตั้งค่าเปิด/ปิดให้ `ShopMember(role=ADMIN)` ของร้านนั้นเห็นข้อมูลเดียวกันได้เอง ผ่าน toggle ระดับร้าน

**Business Rules:**
- Default = **ปิด** (`staffCanViewFinance = false`) เสมอตอนสร้างร้านใหม่ — ปลอดภัยไว้ก่อน owner ต้อง opt-in เอง
- Admin ที่ toggle ปิดอยู่ ต้อง **มองไม่เห็นเมนู/route `/expenses` เลย** ไม่ใช่แค่เห็นแต่กดไม่ได้ (ป้องกัน information disclosure ผ่าน UI)
- Toggle นี้ผูกกับ `Shop` (ต่อร้าน) ไม่ใช่ต่อ owner — ถ้า owner มีหลาย Business shop ต้องตั้งแยกร้านต่อร้าน
- ทุก query ของ Expense/P&L ต้อง scope ด้วย `shopId` เสมอ + ตรวจสิทธิ์ผู้เรียก (owner ของ shop นั้น หรือ admin ของ shop นั้นที่ toggle เปิด) ก่อนคืนข้อมูล — ห้าม cross-shop leak (ตาม memory `feedback_rsc_dal_authz`)

**เหตุผล:**
- ข้อมูลการเงินคือ PII/ความลับทางธุรกิจระดับสูงสุดของ seller — default ปิดคือทางเลือกปลอดภัยที่สุด ให้ owner เป็นคนตัดสินใจเปิดเอง ไม่ใช่ระบบตัดสินใจแทน

### 3.7 Gate การเข้าถึงด้วย Business Package (Paid Add-on, Bundled)

**ความต้องการ:**
- หน้า `/expenses` (ทั้งบันทึก/ดู/แก้/ลบ expense และดูรายงาน P&L) เข้าถึงได้เฉพาะร้านของ owner ที่มี **Business Package สถานะ ACTIVE** (tier ใดก็ได้ — Growth/Pro/Business) เท่านั้น — ไม่มีการคิดเงินแยกต่างหากสำหรับ feature นี้

**Business Rules:**
- Reuse entitlement เดิมของ feature 00008: `getSubscriptionStatus(ownerId)` (`src/services/business-package.service.ts`) — `status === 'ACTIVE'` = ปลดล็อก, ไม่มี row (`NOT_SUBSCRIBED`/FREE pseudo-state) หรือ `LOCKED_RENEWAL_FAILED` = ล็อก
- **การ resolve "ownerId" ของ shop ที่กำลังเข้าถึง** ต้อง confirm ที่ SRS: สำหรับ PERSONAL shop, `ownerId = Shop.userId`; สำหรับ BUSINESS shop ต้อง resolve ไปยัง `ShopMember(role=OWNER)` ของ shop นั้น (คนที่ถือ subscription จริง อาจไม่ใช่ผู้ใช้งานที่ login อยู่ถ้าเป็น admin) — mechanism ชัดเจนแล้วในโค้ด (`subscription-overview.service.ts` ใช้ pattern เดียวกันอยู่แล้ว) แต่ยัง**ไม่เคยถูกทดสอบกับ Expense feature โดยเฉพาะ**
- Shop ที่ owner ไม่มี Business Package ACTIVE (FREE หรือ LOCKED) → เห็น `/expenses` เป็น upsell/locked state เท่านั้น (ไม่ error 404 — แจ้งชัดว่าต้องมี package ก่อน) ไม่มีการเข้าถึงข้อมูลจริงใด ๆ

**เหตุผล:**
- ตรงกับ decision ที่ user ยืนยัน: ไม่สร้าง billing/wallet ใหม่ — ใช้ entitlement ของ feature 00008 ที่มีอยู่แล้วและพิสูจน์แล้วว่าใช้งานได้จริง (Inventory Add-on/Deep Stock Pro ใช้ pattern คล้ายกัน)

> **หมายเหตุสำคัญ (scope การ build):** ตามที่ user ยืนยัน — **build core (CRUD expense + cost snapshot + P&L calculation) ให้เสร็จและทดสอบได้ก่อน** โดยยังไม่ผูก paywall gate จริง (หรือ gate แบบ stub/always-true ระหว่าง dev) แล้วค่อยผูก FR-EXP-11 (gate จริง) เป็นงานถัดไปแยก — ลด risk ที่จะ debug ปนกันระหว่าง "logic ผิด" กับ "gate บล็อกไม่ให้เห็นผล"

### 3.8 กำไรจริงบนหน้ายอดขาย (Net Profit Surfaced on Sales Pages) — เพิ่ม 2026-08-02

**ความต้องการ:**
- Seller ที่มีสิทธิ์เข้าถึง (ผ่าน gate ของ §3.7 เดียวกัน) ต้องเห็น **กำไรสุทธิ** ไม่ใช่แค่ยอดขาย ในทุกจุดของแอปที่แสดงภาพรวมยอดขาย ไม่ใช่แค่หน้า `/expenses` — เพราะในทางปฏิบัติ owner เปิดหน้า "ยอดขาย"/แดชบอร์ดบ่อยกว่าหน้า `/expenses` มาก และเดิมหน้าเหล่านั้นแสดงแต่ยอดขาย (revenue) ที่ทำให้เข้าใจผิดว่าเป็นเงินที่ได้จริง

**ขอบเขต (3 surface):**
1. **`/sales`** (รายงานยอดขายเต็มรูป) — การ์ดสรุปขยายจาก 4 → 6 ใบ (เพิ่มค่าใช้จ่าย/กำไรสุทธิ), ตารางรายวันเพิ่ม 2 คอลัมน์ (ค่าใช้จ่าย/กำไรสุทธิ), กราฟเพิ่ม series ค่าใช้จ่าย
2. **การ์ด "ยอดขายและกำไร"** บน command center (มือถือ, หน้า dashboard) — hero ตัวเลขเปลี่ยนจาก "ยอดขาย" เป็น **กำไรสุทธิ**
3. **ชีตยอดขายเต็มจอ** (เปิดจากการ์ดข้อ 2) — เหมือนข้อ 2 แต่แสดงละเอียดเป็นรายวัน/รายเดือน

**Business Rules:**
- ทั้ง 3 surface ใช้สูตรกำไรสุทธิ**เดียวกัน**กับหน้า `/expenses` (§4.3): `Revenue − COGS − Expense` — ไม่ใช่สูตรลัด (เช่น `ยอดขายที่ยืนยันแล้ว − ค่าใช้จ่าย` โดยไม่หัก COGS) เพื่อไม่ให้ตัวเลขขัดกันข้าม surface
- Gate สิทธิ์เดียวกับ §3.7 ทุกจุด — seller ที่ไม่ผ่าน gate **ไม่เห็นคอลัมน์/การ์ด/series ที่เกี่ยวกับเงินเลย** (ไม่ใช่เห็นแต่เป็น ฿0 — การแสดง ฿0 จะสื่อผิดว่า "ไม่มีค่าใช้จ่าย" ทั้งที่จริงคือ "ไม่มีสิทธิ์ดู")
- Hero ของทั้ง 3 surface คือ**กำไรสุทธิ** ไม่ใช่ยอดขาย — ยอดขายลดชั้นเป็นข้อมูลรอง (บรรทัด/คอลัมน์ถัดไป) เพราะกำไรคือคำตอบที่ owner ต้องการจริง ๆ (feedback จากการใช้งานจริงบน prod 2026-08-02 ว่า hero เดิมเป็นยอดขายทำให้ owner เข้าใจผิดว่าคือเงินที่ได้)

**เหตุผล:** ปิดช่องว่างเดิมของ Executive Summary ("Seller เห็นแค่ยอดขาย ไม่รู้กำไรจริง") ให้ครบทุกจุดที่ seller มักดูภาพรวมร้าน ไม่ใช่แค่หน้า `/expenses` ที่เพิ่งสร้างใหม่และยังไม่ใช่พฤติกรรมเดิมของผู้ใช้

---

## 4. Business Rules & Constraints

### 4.1 กฎทางธุรกิจหลัก

| กฎ | คำอธิบาย |
|----|----------|
| **Revenue/COGS นับเฉพาะ CONFIRMED** | ออเดอร์สถานะ PENDING/SHIPPED/CANCELLED ไม่นับเข้ารายงาน P&L เลย |
| **VAT ตรงไปตรงมา** | กำไรคำนวณจาก `Order.totalAmount` (ยอดรวม VAT แล้ว) โดยตรง ไม่มีการแยก VAT ออกจากรายได้ในรายงานนี้ |
| **Cost Snapshot ไม่ย้อนหลัง** | แก้ `Product.cost` ทีหลังไม่กระทบ `OrderItem.cost` ของออเดอร์เก่าที่ snapshot ไปแล้ว |
| **Missing Cost = Exclude + Warning** | รายการที่ไม่มีต้นทุน ไม่ถูกคำนวณเป็น COGS (ไม่ใช่ถือว่า cost=0) แต่ต้องมีคำเตือนกำกับเสมอว่ากำไรอาจไม่สมบูรณ์ |
| **Expense = Period-Level ไม่หารลงออเดอร์** | ค่าใช้จ่ายดำเนินงาน (ค่า ads/ค่าเช่า/เงินเดือน ฯลฯ) หักที่ระดับ Net Profit ของช่วงเวลา **ไม่** allocate ลงรายออเดอร์ ตามหลักบัญชี OpEx มาตรฐาน. ตัวอย่าง: ค่า ads ฿500 วันที่ 8 ก.ค. ที่มี 11 ออเดอร์ → หัก ฿500 ก้อนเดียวจาก Net Profit ของวันนั้น ไม่ใช่ ฿45/ออเดอร์ (§4.4) |
| **Fixed Category เท่านั้น** | ไม่มี custom category ใน MVP — 7 หมวดตายตัว (§3.4) |
| **Owner-Only Default** | ข้อมูลการเงินเห็นเฉพาะ owner จนกว่า owner จะเปิด toggle ให้ admin เอง (default ปิด) |
| **Bundled Paid Add-on** | Gate ด้วย Business Package ACTIVE (tier ใดก็ได้) — ไม่มี billing แยกของ feature นี้เอง |

### 4.2 ข้อจำกัดทางธุรกิจ

| ข้อจำกัด | รายละเอียด |
|---------|-----------|
| **ไม่มี Refund/Adjustment ของ Expense ที่ผูก billing อื่น** | Expense เป็นการบันทึกข้อมูลอย่างเดียว ไม่เชื่อมกับ SellerWallet/WalletTransaction ใด ๆ |
| **ไม่มี multi-currency** | ทุกจำนวนเงินเป็นบาทไทย (Decimal 12,2) เหมือน field เงินอื่นในระบบ |
| **ไม่มี audit trail ละเอียดของการแก้ไข Expense** | MVP ไม่เก็บ history การแก้ไข/ลบ (ต่างจาก order ที่มี state machine + tracking) — ถ้าต้องการ audit log เป็น Phase 2 |
| **Toggle staffCanViewFinance ผูกกับ Business shop เท่านั้นในทางปฏิบัติ** | Personal shop ปกติไม่มี ShopMember(ADMIN) อื่นอยู่แล้ว (1 user = owner คนเดียว) — field มีผลจริงเฉพาะ Business shop แต่ประกาศไว้ที่ `Shop` ทุกแถวเพื่อความสม่ำเสมอของ schema |

### 4.3 สูตรคำนวณ P&L (สรุป)

```
Revenue        = Σ Order.totalAmount   WHERE shopId = X AND status = 'CONFIRMED' AND createdAt ∈ [start, end]
COGS           = Σ (OrderItem.cost × OrderItem.qty)
                   WHERE OrderItem.orderId ∈ (orders ข้างต้น) AND OrderItem.cost IS NOT NULL
Gross Profit   = Revenue − COGS
Total Expense  = Σ Expense.amount      WHERE shopId = X AND expenseDate ∈ [start, end]
Net Profit     = Gross Profit − Total Expense
```

### 4.4 กฎการคิดค่าใช้จ่าย (Expense Allocation) — Period-Level เท่านั้น

Expense ทุกหมวด (รวมค่า ads/โปรโมชัน) เป็น **operating expense ระดับช่วงเวลา** — หักที่ Net Profit ของช่วงเวลาทั้งก้อน **ไม่ถูก allocate (หาร) ลงรายออเดอร์** ต่างจาก COGS (ต้นทุนสินค้า) ที่ผูกรายออเดอร์ผ่าน snapshot

**เหตุผล:** ค่า ads โปรโมตทั้งวันไม่ได้เจาะจงว่าออเดอร์ไหนเกิดจาก ad ตัวไหน (บาง impression ไม่ปิดการขายเลย) — การหารเฉลี่ยลงออเดอร์จะทำให้ "กำไรต่อออเดอร์" เพี้ยนโดยไม่มีฐานความจริงรองรับ. **Per-order cost allocation (แบ่งค่าใช้จ่ายลงออเดอร์) = Out of Scope** (ดู §5) — ถ้าจำเป็นในอนาคตเป็น Phase 2 พร้อมนิยามกฎการหารที่ชัดเจน

| ตัวอย่าง (8 ก.ค.) | ค่า |
|---|---|
| Revenue (11 ออเดอร์) | 3,300 |
| − COGS (ต้นทุนสินค้ารายออเดอร์) | 1,650 |
| = Gross Profit | 1,650 |
| − ค่า ads FB (period-level, ก้อนเดียว) | 500 |
| = **Net Profit ของวัน** | **1,150** |

---

## 5. Out of Scope (นอกขอบเขต)

| หัวข้อ | คำอธิบาย |
|--------|----------|
| **Billing/paywall แยกของ Expense feature เอง** | Gate ด้วย Business Package ที่มีอยู่แล้วเท่านั้น (§3.7) — ไม่มี SellerWallet deduction ใหม่ |
| **Custom expense category** | MVP มีแค่ 7 หมวดตายตัว — เพิ่ม/แก้หมวดเองเป็น Phase 2 |
| **Audit trail/history ของการแก้ไข Expense** | ไม่เก็บ diff/versioning ใน MVP — Phase 2 |
| **แยก VAT ออกจากรายได้ในรายงาน (Revenue excl. VAT)** | MVP ใช้ `totalAmount` ตรง ๆ — Phase 2 ถ้าต้องการความละเอียดระดับบัญชี |
| **Recurring/scheduled expense (เช่น ค่าเช่ารายเดือนอัตโนมัติ)** | ต้องบันทึกมือทุกครั้งใน MVP — Phase 2 |
| **Export รายงาน (PDF/Excel)** | MVP แสดงบนหน้าเว็บเท่านั้น — Phase 2 |
| **Budget/เป้าหมายค่าใช้จ่ายและแจ้งเตือนเกินงบ** | ไม่มีใน MVP — Phase 2 |
| **RBAC granular กว่า Owner/Admin toggle เดียว** | ไม่มี role ย่อย (เช่น "เห็นแต่ COGS ไม่เห็น Expense") — Phase 2 ถ้าจำเป็น |
| **Per-Order Cost Allocation (หารค่าใช้จ่ายลงรายออเดอร์)** | Expense เป็น period-level เท่านั้น (§4.4) — การหารค่า ads/ค่าใช้จ่ายเฉลี่ยลงรายออเดอร์เพื่อดูกำไรต่อออเดอร์ = Phase 2 (ต้องนิยามกฎการหาร: เท่ากัน/ตามยอดขาย) |
| **Cross-shop P&L รวมยอด (สำหรับ owner ที่มีหลาย Business)** | MVP ดูทีละร้านเท่านั้น — Phase 2 (คล้าย pattern feature 00008 §5) |

---

## 6. Risks & Mitigation (ความเสี่ยงและแนวทางแก้ไข)

### 6.1 ความเสี่ยงทางธุรกิจ

| ความเสี่ยง | ผลกระทบ | ระดับความรุนแรง | แนวทางแก้ไข |
|-----------|---------|-----------------|-------------|
| **Seller ไม่ตั้งต้นทุนสินค้าเลย → รายงานไร้ความหมาย** | Cost Coverage ต่ำ, feature ดูไม่มีค่า | กลาง | คำเตือน "กำไรอาจไม่สมบูรณ์" แบบเห็นชัดทุกครั้งที่มี gap + ทำ empty-state ชวนตั้งต้นทุนตอนแรกเข้าหน้า (รายละเอียด UX รอ safepay-ux) |
| **Owner เข้าใจผิดว่า Net Profit = เงินสดในมือ** | ความเข้าใจผิดเชิงบัญชี (ไม่รวม VAT แยก, ไม่รวม tax) | ต่ำ | Label/tooltip อธิบายสูตรชัดเจนในหน้า report (ไม่ต้อง disclaimer ซับซ้อน) |
| **Toggle staffCanViewFinance เปิดผิดโดยไม่ตั้งใจ** | ข้อมูลการเงินรั่วถึง admin ที่ไม่ควรเห็น | กลาง | Default ปิดเสมอ + UI ต้องมี confirm step ก่อนเปิด toggle (รายละเอียด UX รอ safepay-ux) |

### 6.2 ความเสี่ยงทางเทคนิค

| ความเสี่ยง | ผลกระทบ | แนวทางแก้ไข |
|-----------|---------|-------------|
| **Resolve ownerId ผิดพลาดสำหรับ Business shop (§3.7)** | Gate ผิด — block เจ้าของจริง หรือปล่อยให้คนไม่มีสิทธิ์เข้าได้ | Reuse `getSubscriptionStatus` + logic resolve owner เดียวกับ `subscription-overview.service.ts` ที่พิสูจน์แล้ว, เขียน test ครอบคลุมทั้ง PERSONAL/BUSINESS shop context ก่อน sign-off |
| **Query P&L สแกนทุก Order/OrderItem ของช่วงเวลายาว (เช่น 1 ปี) ช้า** | Performance บนร้านที่มีออเดอร์เยอะ | Index ที่เหมาะสมบน `Order(shopId, status, createdAt)` (อาจมีอยู่แล้วบางส่วนจาก dashboard เดิม — ตรวจสอบใน DATABASE.md), พิจารณา pagination/cap ช่วงเวลาสูงสุดถ้าจำเป็น |
| **Migration Product.cost/OrderItem.cost บน production ที่มีข้อมูลจริงอยู่แล้ว** | Field ใหม่ nullable — ความเสี่ยงต่ำ แต่ยังต้องระวัง migration บน DB ที่แชร์กับ dev (ดู memory `project_shared_db_drift_no_migrate_dev`) | Additive migration เท่านั้น (nullable columns), ไม่แตะ column เดิม, ตาม convention migration ทั้งหมดของโปรเจกต์ |

---

## 7. Glossary (อภิธานศัพท์)

| คำศัพท์ | ความหมาย |
|---------|----------|
| **COGS (Cost of Goods Sold)** | ต้นทุนสินค้าที่ขายไปจริงในช่วงเวลาที่คำนวณ = Σ (ต้นทุนที่ snapshot ไว้ × จำนวน) |
| **Gross Profit** | กำไรขั้นต้น = Revenue − COGS (ก่อนหักค่าใช้จ่ายดำเนินงาน) |
| **Net Profit** | กำไรสุทธิ = Gross Profit − Total Expense |
| **Cost Snapshot** | การบันทึกต้นทุนสินค้า ณ ขณะสร้างออเดอร์ลงใน `OrderItem.cost` — ไม่เปลี่ยนตามการแก้ไข `Product.cost` ภายหลัง |
| **Expense** | รายการค่าใช้จ่ายดำเนินธุรกิจที่ seller บันทึกเอง แยกหมวดตาม fixed list |
| **Business Package** | Subscription 4 tier (Free/Growth/Pro/Business) จาก feature 00008 — Expense feature เป็นสิทธิ์ที่ bundle มากับทุก tier ที่จ่ายเงิน |
| **staffCanViewFinance** | Toggle ระดับ Shop ที่ owner เปิด/ปิดเพื่อให้ ShopMember(ADMIN) เห็นข้อมูล Expense/P&L ได้ |

---

## 8. Success Metrics (ตัวชี้วัดความสำเร็จ)

| ตัวชี้วัด | ค่าที่คาดหวัง | วิธีวัด |
|----------|---------------|--------|
| **Zero Regression บน Product/Order เดิม** | สินค้า/ออเดอร์ที่ไม่มี cost ทำงานเหมือนเดิมทุกประการ ไม่มี error | Regression test suite ครอบคลุม flow สร้างสินค้า/ออเดอร์เดิมก่อน sign-off |
| **Cost Snapshot Correctness** | แก้ `Product.cost` แล้ว `OrderItem.cost` ของออเดอร์เก่าไม่เปลี่ยน 100% ของเคสทดสอบ | Test scenario: สร้างออเดอร์ → แก้ cost สินค้า → re-query ออเดอร์เก่า |
| **P&L Formula Accuracy** | ตัวเลข Revenue/COGS/Gross/Expense/Net ตรงกับสูตร §4.3 100% ในทุกเคสทดสอบ (รวม edge case cost ขาด) | Unit test ต่อสูตรคำนวณ + fixture data ครอบคลุม missing-cost case |
| **Access Control Correctness** | Admin ที่ toggle ปิดมองไม่เห็น route/data เลย, ร้านที่ Business Package ไม่ ACTIVE เข้าไม่ได้ | Security/authorization test ต่อทุก combination (owner/admin × toggle on-off × package active/locked) |

---

## 9. Dependencies & Assumptions

### 9.1 สิ่งที่ต้องพึ่งพา (Dependencies)

| ระบบ/ส่วนประกอบ | ความสัมพันธ์ |
|-----------------|-------------|
| **Business Package (feature 00008, live)** | ให้ entitlement gate ผ่าน `getSubscriptionStatus(ownerId)` — reuse ตรง ๆ ไม่สร้าง billing ใหม่ |
| **ShopMember (feature 00008, live)** | ให้ role OWNER/ADMIN สำหรับตัดสิน finance visibility (§3.6) |
| **Shop Staff Invite Links (feature 00012, live)** | ช่องทางที่ admin เข้ามาเป็น ShopMember ตั้งแต่แรก — ไม่ต้องสร้างใหม่ |
| **Product/Order/OrderItem model เดิม** | เพิ่ม field แบบ additive (`Product.cost`, `OrderItem.cost`) — ไม่แตะ logic การสร้าง order เดิมนอกจากจุด snapshot |
| **Dashboard revenue-calc pattern (`dashboard.service.ts`)** | Reuse convention เดียวกัน (`Order.createdAt` เป็น anchor, `status='CONFIRMED'`) เพื่อให้ตัวเลข Revenue สอดคล้องกับที่ dashboard แสดงอยู่แล้ว |
| **Paces (`(paces)/seller/**`)** | หน้า `/expenses` ใหม่ต้อง copy จาก Paces primitive ตาม Hard Rule 1/7/8 (safepay-ux ออก Design Spec ก่อน) |

### 9.2 Decisions (ยืนยันแล้วโดย user — 2026-07-08 รอบ 2)

- ✅ **Entitlement gate นับทุก tier ที่จ่ายเงินเท่ากันหมด** — "แค่จ่ายก็ได้รับ" ไม่จำกัดเฉพาะ tier สูง (Growth/Pro/Business ปลดล็อกเท่ากัน; Free = ล็อก)
- ✅ **ช่วงเวลารายงาน P&L** = วันนี้/7 วัน/30 วัน/เดือนนี้/กำหนดเอง (custom range) — เพียงพอ
- ✅ **`expenseDate` แยกจาก `createdAt`** รองรับ backdate ค่าใช้จ่ายที่เกิดก่อนวันบันทึก
- ✅ **หมวดค่าใช้จ่าย 7 หมวด** (§3.4) เพียงพอสำหรับ MVP — ไม่เพิ่ม/ตัด
- ✅ **Field `Product.cost` แสดงในฟอร์มสินค้าเสมอ แต่ disabled + badge "อัปเกรดเป็น Business"** สำหรับ seller ที่ไม่มี Business Package ACTIVE — ปลดล็อกให้แก้ได้เมื่อ package ACTIVE (ดู FR-EXP-01 หมายเหตุ + Design Spec โดย safepay-ux)

**ยังเหลือ confirm ตอน SRS (technical detail — ไม่กระทบ scope):**
- **ownerId ของ Business shop resolve จาก `ShopMember(role=OWNER)`** — reuse pattern เดียวกับ `subscription-overview.service.ts` (ดู §3.7/§6.2 — technical, พิสูจน์ด้วย test)

---

## 10. Appendix

### 10.1 ตัวอย่าง User Journey — บันทึกค่าใช้จ่าย + ดูรายงานกำไร

**Scenario: Owner ที่มี Business Package ACTIVE เปิดหน้า /expenses ครั้งแรกของเดือน**

1. Owner login เข้า `seller.*` เปิดเมนู "ค่าใช้จ่าย" → ระบบตรวจ Business Package ACTIVE ผ่าน → เข้าหน้า `/expenses` ได้
2. Owner กด "บันทึกค่าใช้จ่าย" → เลือกหมวด "ค่าโฆษณา" → กรอกจำนวนเงิน 1,500 บาท → เลือกวันที่ → บันทึก
3. Owner เลื่อนดูรายงาน P&L เลือกช่วง "เดือนนี้" → เห็น Revenue ฿50,000 (จาก 20 ออเดอร์ CONFIRMED), COGS ฿28,000 (18 ออเดอร์มีต้นทุนครบ, 2 ออเดอร์ไม่มี → มีคำเตือน), Gross Profit ฿22,000, Total Expense ฿5,000 (รวมรายการที่เพิ่งบันทึก), Net Profit ฿17,000
4. Owner เห็นคำเตือน "กำไรอาจไม่สมบูรณ์" → กดลิงก์ไปตั้งต้นทุนสินค้าที่ยังไม่มี cost

```mermaid
flowchart TD
    A[Owner เปิดเมนู ค่าใช้จ่าย] --> B{Business Package ACTIVE?}
    B -- ไม่ --> C[แสดง Locked/Upsell state]
    B -- ใช่ --> D[เข้าหน้า /expenses]
    D --> E[บันทึก Expense ใหม่: หมวด/จำนวนเงิน/วันที่]
    E --> F[เลือกช่วงเวลาดูรายงาน]
    F --> G[คำนวณ Revenue/COGS/Gross/Expense/Net]
    G --> H{มีรายการที่ cost เป็น null ในช่วงนี้?}
    H -- ใช่ --> I[แสดงคำเตือน กำไรอาจไม่สมบูรณ์]
    H -- ไม่ --> J[แสดงตัวเลขปกติ]
```

### 10.2 ตัวอย่าง — Owner ตั้ง staffCanViewFinance ให้ Admin เห็นรายงาน

1. Owner เปิดหน้าตั้งค่าร้าน (Business shop) → เห็น toggle "ให้พนักงานเห็นข้อมูลการเงิน" (default ปิด)
2. Owner เปิด toggle → ระบบยืนยันอีกครั้ง (confirm step) → บันทึก `Shop.staffCanViewFinance = true`
3. Admin ของ Business shop นั้น login เข้ามา → เมนู "ค่าใช้จ่าย" ปรากฏขึ้น (เดิมไม่เคยเห็น) → เข้าดูรายงานได้ (read + write ตาม MVP membership-based access เดิมของ feature 00008)

### 10.3 Decisions (ยืนยันแล้วโดย Controller/User — 2026-07-08)

| # | เรื่อง | Decision (ยืนยันแล้ว) |
|---|------|----------------------|
| **D-1** | รูปแบบ P&L | Full profit calc — Revenue − COGS = Gross Profit; Gross Profit − Expense = Net Profit; นับเฉพาะ order CONFIRMED (§3.5) |
| **D-2** | ตำแหน่งหน้าจอ | หน้าใหม่แยก `/expenses` (`(paces)/seller/**`) ไม่ฝังใน `/sales` — รวมบันทึก/ดู/แก้/ลบ expense + รายงาน (Executive Summary) |
| **D-3** | หมวดหมู่ค่าใช้จ่าย | Fixed list 7 หมวด, String enum-style ตาม convention เดิม (§3.4) |
| **D-4** | โมเดล billing | รวมใน Business Package ที่มีอยู่แล้ว ไม่คิดเงินแยก ไม่แตะ SellerWallet เพิ่ม (§3.7) — gate ด้วย `getSubscriptionStatus` เดิม |
| **D-5** | ต้นทุนสินค้า | `Product.cost Decimal(12,2)?` nullable opt-in + `OrderItem.cost` snapshot ณ วันขาย ไม่ย้อนหลัง (§3.1, §3.2) |
| **D-6** | VAT | คำนวณจาก `Order.totalAmount` (รวม VAT) ตรงไปตรงมา ไม่แยก VAT ออก (§4.1) |
| **D-7** | สิทธิ์เห็นข้อมูลการเงิน | Owner เห็นเสมอ + toggle ระดับร้าน `staffCanViewFinance` (default false) ให้ ShopMember(ADMIN) เห็นได้เอง — ใช้ ShopMember ที่ live แล้วจาก feature 00008 (§3.6) |
| **D-8** | Business Package tier | ทุก tier ที่จ่ายเงินปลดล็อกเท่ากัน ("แค่จ่ายก็ได้รับ") — ไม่จำกัดเฉพาะ tier สูง (§9.2) |
| **D-9** | ช่อง cost ในฟอร์มสินค้า (ไม่มี package) | แสดงเสมอแต่ **disabled + badge "อัปเกรดเป็น Business"** — ไม่ซ่อน field, ปลดล็อกเมื่อ package ACTIVE (§9.2, FR-EXP-01) |
| **D-10** | การคิดค่าใช้จ่าย | Period-level เท่านั้น — ค่า ads/ค่าใช้จ่ายไม่หารลงรายออเดอร์ หักที่ Net Profit ของช่วงเวลา (§4.4). Per-order allocation = Out of Scope |
| **D-11** | ช่วงเวลา/backdate/หมวด | ช่วงเวลา 5 แบบเพียงพอ + `expenseDate` backdate ได้ + 7 หมวดพอสำหรับ MVP (§9.2) |
| **D-12** | กำไรบนหน้ายอดขาย (เพิ่ม 2026-08-02) | Net Profit ไหลเข้า 3 surface ของหน้ายอดขาย (`/sales`, การ์ด command center, ชีตเต็มจอ) ด้วยสูตรเดียวกับ `/expenses` เป๊ะ + gate สิทธิ์เดียวกัน (§3.8) — ไม่ใช่ scope เดิมตอนเขียน PRD รอบแรก แต่เป็นส่วนขยายของเป้าหมาย "เห็นกำไรจริง" เดียวกัน |

**เหลือ confirm ตอน SRS (technical เท่านั้น ไม่กระทบ scope):** resolve ownerId ของ Business shop ให้ครบทุกเคสทดสอบ (§3.7/§6.2)

**สถานะ implement (อัปเดต 2026-08-02):** Core (D-1..D-11) + ส่วนขยาย D-12 **deployed แล้ว** (branch `feature/expenses`, redesign commits `69b235f4`/`3148bb42`/`a20d99ac`/`69a224ad`/`e0ec4926`/`56dcc657`) — ดูรายละเอียดเชิงเทคนิคที่ SRS.md §10, UI ที่ `docs/superpowers/specs/2026-08-02-expenses-redesign-design-spec.md`

---

## ขั้นถัดไป (Next Steps)

เอกสารนี้และ [[BRD]] คู่กันเป็น deliverable ของ mode **PRD/BRD** ตาม Hard Rule 11 (Documentation-First) — **ยังไม่ implement code ใด ๆ** จนกว่าเอกสารทั้งสองผ่าน user review ขั้นถัดไปตามลำดับ ownership ใน [[Feature-Docs-Ownership]]:

1. User review PRD + BRD นี้ → confirm/แก้ open items ใน §9.2
2. `safepay-planner` ร่าง **SRS** (data model เต็ม/state ของ query/NFR — ครอบคลุม resolve ownerId ของ Business shop ให้ชัด) → **SDS** (component/flow ของหน้า `/expenses`) → **API.md** (endpoint CRUD expense + report)
3. `safepay-database` ร่าง **DATABASE.md** (migration `Product.cost`/`OrderItem.cost`/`Expense` model/`Shop.staffCanViewFinance`, index สำหรับ P&L query, ERD เต็ม)
4. `safepay-ux` ออก Design Spec ของหน้า `/expenses` (Hard Rule 8, อิง Paces docs)
5. `safepay-qa` ร่าง Test Cases (`Tests/00001-...md`) trace กลับ Acceptance Criteria ใน BRD
6. Controller ตั้งทีม 5-gate ตาม `agent-team-workflow` เริ่ม implement เมื่อเอกสารครบ (Hard Rule 4)

---

**หมายเหตุ:**
เอกสารนี้เป็นการบันทึกความต้องการทางธุรกิจ (Business Requirements) โดยไม่มีรายละเอียดทางเทคนิค
สำหรับ Functional Requirements / User Story / Acceptance Criteria ดู [[BRD]] ของโมดูลนี้
สำหรับ technical specification ดู SRS ของโมดูลนี้ (ยังไม่จัดทำ — รอ user review เอกสารนี้ก่อน)
