---
title: "SRS — ภาพรวมทุกธุรกิจบน Dashboard"
owner: shinobu22
status: draft
created: 2026-10-05
tags: [feature, srs, dashboard, finance, multi-shop]
related: ["[[PRD]]", "[[BRD]]", "[[SDS]]"]
---

> **โมดูล:** 00069 — Professional Multi-Business Dashboard
> **ประเภทเอกสาร:** Software Requirements Specification (Technical)
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-10-05
> **สถานะ:** Draft

# SRS: ภาพรวมทุกธุรกิจบน Dashboard (Software Requirements Specification — Technical)

---

## 1. บทนำ (Introduction)

### 1.1 วัตถุประสงค์ของเอกสาร
แปลง FR ใน [[BRD]] เป็นข้อกำหนดเชิงเทคนิคที่ทดสอบได้ — การออกแบบอยู่ใน [[SDS]]

### 1.2 ขอบเขตเชิงระบบ (System Scope)
RSC `/seller/dashboard` + lib/service ใหม่ · ไม่มี API route · ไม่มี migration

### 1.3 เอกสารอ้างอิง (References)
[[PRD]] · [[BRD]] · [[SDS]] · 00067 SRS · 00016 SDS §4.1 · `docs/SRS.md`

### 1.4 นิยามและตัวย่อ (Definitions & Acronyms)
| คำ | ความหมาย |
|----|---------|
| Overview shop | ร้านที่ผ่าน TFR-002 |
| Primary owner | `Shop.userId` (EXT 00012 BR-MR-02) |

---

## 2. ภาพรวมสถาปัตยกรรม (Architecture Overview)

### 2.1 บริบทระบบ (System Context)
ส่วนหนึ่งของ seller subdomain (Paces) — ดู [[SDS]] §2

### 2.2 องค์ประกอบหลัก (Components)
`src/lib/paid-business.ts` · `src/lib/business-overview.ts` · `src/services/business-overview.service.ts` · `dashboard/components/BusinessOverviewSection.tsx` · `dashboard/components/ShopOverviewCard.tsx`

### 2.3 มุมมองการ Deploy (Deployment View)
ไม่เปลี่ยน (Vercel + Supabase)

---

## 3. ข้อกำหนดเชิงฟังก์ชันเชิงเทคนิค (Technical Functional Requirements)

### TFR-001: gate การแสดงผล
- render เมื่อ `requireActiveShop(session).kind === 'PERSONAL'` และ `getBusinessOverview` คืนค่าไม่เป็น `null`
- userId มาจาก `sessionUserId()` (ห้าม cast)
- trace: FR-001

### TFR-002: ร้านที่นับ
- WHERE: `kind='BUSINESS'`, `deletedAt IS NULL`, `purgedAt IS NULL`, `packageLockedAt IS NULL`, (`userId = me` OR ShopMember `{userId: me, role: 'OWNER'}`)
- แล้ว `isPaidBusinessShop({ kind, packageLockedAt, ownerSubscriptionStatus: shop.user.businessPackageSubscription?.status ?? null })` ต้องเป็น true
- ไม่มีแถว subscription = FREE = ไม่นับ
- trace: FR-002

### TFR-003: ตัวเลขต่อร้าน
- `getPnlReport(shop.id, range, shop.vertical)` → `revenue`, `netProfit`, `orderCount`, `hasMissingCost`
- margin% = `round2(netProfit / revenue * 100)` เมื่อ `revenue > 0` มิฉะนั้น `null` (UI แสดง "—")
- completeness = `resolveDataCompleteness({ hasMissingCost, expenseCount, uncostedItemCount: 0, soldItemCount: 0 })`
- trace: FR-004, FR-005

### TFR-004: ยอดรวม
- totals = ผลบวกของร้านที่ไม่ error · `incomplete = มีร้านใด !complete || มีร้าน error`
- `mixedFinanceRules = มีทั้งร้านที่ usesServiceFinanceRules true และ false`
- cards เรียง `revenue` desc (เท่ากัน → `shopName` asc)
- trace: FR-003

### TFR-005: ช่วงเวลา
- `resolveRangeFromParams(searchParams, 'month')` บน page — param `range`, `start`, `end`
- ค่าไม่ถูกต้อง → fallback `month` (ห้าม throw)
- trace: FR-006

### TFR-006: กราฟ
- เดือน = เดือน (เวลาไทย) ของวันสุดท้ายในช่วง
- `getSalesSeries(shopId, 'daily', {year, month}, true, vertical)` ทุกร้าน → รวม `values` และ `netProfitValues` (ไม่มี = 0) ตาม index
- ไม่แสดงตัวเลขยอดรวมบนกราฟ (SDS TD-003)
- trace: FR-007

### TFR-007: ลิงก์ปลายทาง
- `financeHrefFor(vertical, rangeQs)`: SERVICE_QUEUE → `/sales?tab=pnl&{rangeQs}` · อื่น → `/expenses?{rangeQs}`
- rangeQs มี `range` เสมอ (+ `start`/`end` เมื่อ custom)
- trace: FR-008

---

## 4. ข้อกำหนดส่วนต่อประสาน (Interface / API Specification)

### 4.1 API Endpoints
ไม่มี endpoint ใหม่ — ดู [[API]]

### 4.2 รายละเอียดต่อ Endpoint
ไม่มี

### 4.3 Events / Messaging (ถ้ามี)
ไม่มี

### 4.4 Sequence ของ flow สำคัญ
ดู [[SDS]] §4.1

---

## 5. ข้อกำหนดด้านข้อมูล (Data Requirements)

### 5.1 Data Model / Entities
อ่านอย่างเดียว: `Shop`, `ShopMember`, `BusinessPackageSubscription`, `Order`, `Expense`

### 5.2 ความสัมพันธ์ (ERD)
ดู [[DATABASE]]

### 5.3 Migration / Data Lifecycle
ไม่มี

---

## 6. ข้อกำหนดที่ไม่ใช่ฟังก์ชัน (Non-Functional Requirements)

| NFR | ข้อกำหนด |
|-----|---------|
| NFR-01 ความปลอดภัย | กรองสิทธิ์ที่ WHERE ก่อนคำนวณ · ไม่ส่งข้อมูลร้านที่ไม่ผ่านข้าม RSC |
| NFR-02 ความเร็ว | ต่อร้านยิงขนาน (`Promise.allSettled`) · ร้าน Personal ที่ไม่มีร้าน BUSINESS เสีย 1 query |
| NFR-03 ทนทาน | ร้านเดียวล้มไม่ล้มทั้งส่วน · service ล้มไม่ล้มทั้งหน้า |
| NFR-04 ความถูกต้อง | ตัวเลขการ์ด = `getPnlReport` ช่วงเดียวกัน ทุกบาท |

---

## 7. ข้อจำกัดทางเทคนิคและการพึ่งพา (Technical Constraints & Dependencies)

### 7.1 ข้อจำกัดทางเทคนิค
`getPnlReport` รับทีละร้าน · `getSalesSeries` รองรับรายเดือน/รายปีเท่านั้น

### 7.2 การพึ่งพาภายนอก/ภายใน
pnl.service · dashboard.service · finance-tabs · date-range · useShopSwitcher

### 7.3 สมมติฐานทางเทคนิค (Assumptions)
ร้าน BUSINESS ต่อคน ≤ ~5

---

## 8. ความเสี่ยงเชิงสถาปัตยกรรม (Architectural Risks)

| ความเสี่ยง | แนวทาง |
|-----------|-------|
| เงื่อนไข "จ่ายแล้ว" ใน WHERE กับ lib ไม่ตรงกัน | lib เป็นตัวตัดสินสุดท้าย + เทส |
| N×3 query ต่อการเปิดหน้า | วัด Server-Timing ก่อนปรับ |

---

## 9. Traceability Matrix

| BRD | TFR | TestCase |
|-----|-----|----------|
| FR-001 | TFR-001 | TC-001, TC-002 |
| FR-002 | TFR-002 | TC-003 |
| FR-003 | TFR-004 | TC-004 |
| FR-004 | TFR-003 | TC-005, TC-006 |
| FR-005 | TFR-003 | TC-007 |
| FR-006 | TFR-005 | TC-008 |
| FR-007 | TFR-006 | TC-009 |
| FR-008 | TFR-007 | TC-010 |
| FR-009 | — | TC-011 |

---

## 10. สรุป (Summary)
ทุก TFR อ่านข้อมูลอย่างเดียว ไม่มีสูตรใหม่ ตัวตัดสินที่มีความหมาย (จ่ายแล้ว/รวมยอด/ลิงก์) อยู่ใน lib บริสุทธิ์ที่เทสได้

---

## ส่วนแก้ไข v1.1 (2026-10-05) — ชนะเนื้อหาเดิมเมื่อขัดกัน

| TFR | ข้อกำหนด |
|-----|---------|
| TFR-003 (แก้) | ยอดขายต่อร้าน = `getSalesSeries(...).total` · กำไรสุทธิ = `getPnlReport(range ของ period).netProfit` · margin% = กำไร/ยอดขาย(series) |
| TFR-005 (แทนที่) | period = `{ mode: 'daily'\|'monthly', year, month? }` · ค่าเริ่มต้น = รายวัน เดือนปัจจุบัน (เวลาไทย) · API validate ด้วย valibot ชุดเดียวกับ `/api/seller/sales-series` |
| TFR-006 (แทนที่) | `aggregateSalesSeries` + `buildStack(max 5)` · Personal ไม่อยู่ใน aggregate/stack |
| TFR-007 (แก้) | ลิงก์ = `financeHrefFor(vertical, 'range=custom&start=…&end=…')` จาก `periodRange` |
| TFR-008 (ใหม่) | `GET /api/seller/portfolio-series`: 401 ไม่มี session/userId · 403 บริบทไม่ใช่ Personal · 200 `null` เมื่อไม่มีร้าน · `cache-control: private, no-store` |
| TFR-009 (ใหม่) | มือถือ: `mobileSalesSeries` ในบริบท Personal ที่มีร้านเข้าเงื่อนไข = aggregate · การ์ดเปิด `PortfolioSheet` |

Traceability เพิ่ม: FR-010 → TFR-008/009 → TC-012..TC-015
