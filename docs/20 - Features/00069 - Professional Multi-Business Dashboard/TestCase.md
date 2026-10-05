---
title: "Test Case — ภาพรวมทุกธุรกิจบน Dashboard"
owner: shinobu22
status: draft
created: 2026-10-05
tags: [feature, testcase, dashboard, finance, multi-shop]
related: ["[[PRD]]", "[[BRD]]", "[[SDS]]"]
---

> **โมดูล:** 00069 — Professional Multi-Business Dashboard
> **ประเภทเอกสาร:** Test Case
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-10-05
> **สถานะ:** Draft

# Test Case: ภาพรวมทุกธุรกิจบน Dashboard

---

## 1. Overview
unit (Vitest) สำหรับ lib บริสุทธิ์ + integration ของ service บนฐาน local (5434) + E2E Playwright ที่ `seller.deepth.local:4000` + ตรวจด้วยตา 3 ขนาดจอ (user)

## 2. Test Scenarios

### TC-001: บริบท BUSINESS ไม่เห็นส่วนนี้
- **ระดับ:** E2E · **ขั้นตอน:** สลับเป็นร้าน BUSINESS → เปิด Dashboard · **คาดหวัง:** ไม่มีส่วน "ภาพรวมทุกธุรกิจ"

### TC-002: Personal ไม่มีร้านเข้าเงื่อนไข
- **ระดับ:** integration · **คาดหวัง:** `getBusinessOverview` คืน `null`

### TC-003: ตัวกรองร้าน (blocker — mutation ต้องแดง)
- **ระดับ:** unit `isPaidBusinessShop` + integration
- เคส: X (เจ้าของหลัก, ACTIVE) ✔ · Y (เจ้าของร่วม OWNER, เจ้าของหลักคนอื่น ACTIVE) ✔ · Z (ADMIN, ACTIVE) ✘ · W (ล็อก) ✘ · V (เจ้าของหลัก LOCKED_RENEWAL_FAILED) ✘ · U (ไม่มี subscription) ✘ · Personal ✘ · ร้านถูกลบ ✘
- **คาดหวัง:** ได้ X, Y เท่านั้น · ลบเงื่อนไขใดออกจาก lib → เทสแดง

### TC-004: ยอดรวม
- **ระดับ:** unit `summarizeOverview` · **คาดหวัง:** totals = ผลบวกการ์ด OK · การ์ด ERROR ไม่นับ + `incomplete=true` · เรียงยอดขาย desc, เท่ากันเรียงชื่อ · `mixedFinanceRules` ถูกต้อง

### TC-005: ตัวเลขการ์ด = getPnlReport
- **ระดับ:** integration · **คาดหวัง:** `revenue/netProfit/orderCount` ของการ์ด เท่ากับ `getPnlReport(shop, range, vertical)` ช่วงเดียวกันทุกบาท

### TC-006: margin
- **ระดับ:** unit · revenue 0 → `null` · revenue 1000, profit -200 → `-20` (ไม่ clamp)

### TC-007: ความครบของข้อมูล
- **ระดับ:** unit · มีรายการไม่มีต้นทุน → `missingCost` · expenseCount 0 → `missingExpense`

### TC-008: ช่วงเวลา
- **ระดับ:** E2E · `?range=7d` → ตัวเลขเปลี่ยน · `?range=xxx` → fallback เดือนนี้ไม่ 500 · ตัวเลือก cookie วันนี้/เดือนนี้ของส่วนล่างไม่กระทบส่วนนี้

### TC-009: กราฟรวม
- **ระดับ:** unit `sumSeries` · รวมตาม index · ร้านไม่มี `netProfitValues` นับ 0 · ความยาวเท่ากับวันในเดือน

### TC-010: ลิงก์ปลายทาง
- **ระดับ:** unit `financeHrefFor` + E2E · SERVICE_QUEUE → `/sales?tab=pnl&range=…` · อื่น → `/expenses?range=…` · custom มี start/end · กดการ์ด → อยู่ร้านนั้น และตัวเลขกำไรสุทธิตรงกับการ์ด

### TC-011: responsive
- **ระดับ:** E2E 375 / 768 / 1440 + user ตรวจด้วยตา · ไม่มี scroll แนวนอน · การ์ด 1 คอลัมน์บนมือถือ

## 3. Traceability Matrix
| TC | FR |
|----|----|
| TC-001, TC-002 | FR-001 |
| TC-003 | FR-002 |
| TC-004 | FR-003 |
| TC-005, TC-006 | FR-004 |
| TC-007 | FR-005 |
| TC-008 | FR-006 |
| TC-009 | FR-007 |
| TC-010 | FR-008 |
| TC-011 | FR-009 |

## 4. Flow (ถ้ามี)
ดู [[SDS]] §4

## 5. ผลล่าสุด
ยังไม่รัน

## 6. สรุป (Summary)
11 scenario ครอบ FR ทั้ง 9 ข้อ · TC-003 และ TC-005 เป็น blocker

---

## ส่วนแก้ไข v1.1 (2026-10-05)

| TC | ระดับ | คาดหวัง |
|----|------|--------|
| TC-005 (แก้) | integration | `sales` = `getSalesSeries.total` · `netProfit` = `getPnlReport(periodRange)` ของร้านเดียวกัน ทุกบาท |
| TC-009 (แทนที่) | unit | `aggregateSalesSeries` บวกทุกฟิลด์ตาม index · labels/futureFromIndex จากตัวแรก · `buildStack` ≤5 ชุด + "อื่น ๆ" รวมถูก |
| TC-012 | unit | `periodRange`: ก.พ. ปีอธิกสุรทิน · รายปี 1 ม.ค.–31 ธ.ค. |
| TC-013 | integration/route | API: ไม่มี session 401 · บริบท BUSINESS 403 · ร้าน ADMIN ไม่อยู่ใน rows · Personal อยู่ท้าย `isPersonal` ไม่อยู่ใน aggregate |
| TC-014 | unit | `buildComparisonRows`: sharePct รวม = 100 (±0.01) · ยอดรวม 0 → null · Personal sharePct null |
| TC-015 | E2E | มือถือ 375: การ์ด "ยอดขายทุกธุรกิจ" → ชีต → ‹ › เปลี่ยนเดือน → ตารางเปลี่ยน · กดแถวร้าน → อยู่ร้านนั้นที่หน้าการเงิน · desktop 1440 แท่งซ้อน+ตาราง |
