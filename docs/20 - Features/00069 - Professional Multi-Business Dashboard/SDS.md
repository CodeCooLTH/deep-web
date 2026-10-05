---
title: "SDS — ภาพรวมทุกธุรกิจบน Dashboard"
owner: shinobu22
status: draft
created: 2026-10-05
tags: [feature, sds, dashboard, finance, multi-shop]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[API]]", "[[DATABASE]]", "[[UX-Design-Spec]]"]
---

> **โมดูล:** 00069 — Professional Multi-Business Dashboard
> **ประเภทเอกสาร:** System Design Spec (SDS)
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-10-05
> **สถานะ:** Draft (user สั่ง "ลุยเลย" 2026-10-05 — ข้าม approval รายไฟล์)

# SDS: ภาพรวมทุกธุรกิจบน Dashboard (System Design Spec)

---

## 1. บทนำ & References

### 1.1 วัตถุประสงค์
ออกแบบวิธีหาร้านที่เข้าเงื่อนไข · รวมตัวเลขจากฟังก์ชันการเงินเดิม · แสดงผลบน `/seller/dashboard` โดยไม่เพิ่มสูตรใหม่

### 1.2 ขอบเขตการออกแบบ
server-side (RSC) ทั้งหมด ไม่มี API route ใหม่ ไม่มี migration

### 1.3 เอกสารอ้างอิง
- `src/services/pnl.service.ts` — `getPnlReport(shopId, range, vertical)` (SSOT กำไรสุทธิ)
- `src/lib/finance-tabs.ts` — `resolveDataCompleteness`
- `src/lib/date-range.ts` — `resolveRangeFromParams` / `DATE_RANGE_OPTIONS`
- `src/services/dashboard.service.ts` — `getSalesSeries`
- `src/lib/finance-rules.ts` — `usesServiceFinanceRules`
- `src/hooks/useShopSwitcher.ts` — `landingPath`
- `docs/20 - Features/00012 - Shop Staff Invite Links/EXTENSIONS-2026-10-05-member-roles.md` — BR-MR-02/08 (เจ้าของหลัก = `Shop.userId`)

---

## 2. Architecture Overview

### 2.1 มุมมองสถาปัตยกรรม

```mermaid
flowchart TD
    P[dashboard/page.tsx RSC] -->|active.kind === PERSONAL| S[business-overview.service<br/>getBusinessOverview]
    S --> Q[prisma: ร้าน BUSINESS ที่ user เป็น OWNER<br/>+ สถานะแพ็กเกจของเจ้าของหลัก]
    Q --> F[lib/paid-business<br/>isPaidBusinessShop]
    F --> R[ต่อร้าน ขนานกัน:<br/>getPnlReport + expense.count + getSalesSeries]
    R --> A[lib/business-overview<br/>summarizeOverview / financeHref]
    A --> U[BusinessOverviewSection<br/>+ ShopOverviewCard client]
    U -->|กดการ์ด| W[useShopSwitcher landingPath]
```

### 2.2 มุมมองการ Deploy (ถ้าจำเป็น)
ไม่เปลี่ยน

---

## 3. Component Design

| Component | ไฟล์ | หน้าที่ |
|-----------|------|--------|
| `isPaidBusinessShop` | `src/lib/paid-business.ts` (ใหม่) | ฟังก์ชันบริสุทธิ์: `kind==='BUSINESS' && packageLockedAt==null && ownerSubscriptionStatus==='ACTIVE'` |
| `summarizeOverview` · `marginPercent` · `financeHrefFor` · `sumSeries` | `src/lib/business-overview.ts` (ใหม่) | ฟังก์ชันบริสุทธิ์: รวมยอด · เรียงการ์ด · % margin (`null` เมื่อยอดขาย ≤ 0) · ลิงก์ปลายทางตามประเภทร้าน · รวมกราฟ |
| `getBusinessOverview(userId, range)` | `src/services/business-overview.service.ts` (ใหม่) | query ร้าน → กรอง → ยิงฟังก์ชันการเงินเดิมทีละร้านขนานกัน → ส่งผลให้ lib รวม |
| `BusinessOverviewSection` | `dashboard/components/BusinessOverviewSection.tsx` (ใหม่, server) | ยอดรวม + กราฟ + กริดการ์ด ตาม UX-Design-Spec |
| `ShopOverviewCard` | `dashboard/components/ShopOverviewCard.tsx` (ใหม่, client) | การ์ดกดได้ → `useShopSwitcher({ landingPath })` |
| ตัวเลือกช่วงเวลา | reuse ตาม UX-Design-Spec | URL `?range=&start=&end=` |

### 3.1 query หาร้าน (fail-closed ที่ชั้น query)

```ts
prisma.shop.findMany({
  where: {
    kind: 'BUSINESS', deletedAt: null, purgedAt: null, packageLockedAt: null,
    OR: [{ userId }, { members: { some: { userId, role: 'OWNER' } } }],
  },
  select: { id, shopName, logo, vertical, kind, packageLockedAt,
            user: { select: { businessPackageSubscription: { select: { status: true } } } } },
})
```
แล้วกรองซ้ำด้วย `isPaidBusinessShop` (เงื่อนไขเดียวกันต้องอยู่ใน lib ที่เทสได้ — WHERE เป็นแค่การตัดแถวล่วงหน้า)

### 3.2 ต่อร้าน (Promise.allSettled)
- `getPnlReport(shop.id, range, shop.vertical)` → `revenue` · `netProfit` · `orderCount` · `hasMissingCost`
- `prisma.expense.count({ where: { shopId, expenseDate: range.expenseRange } })` → `expenseCount` (ตัวเดียวกับที่ `/sales` ใช้ `listExpenses().length`)
- `resolveDataCompleteness({ hasMissingCost, expenseCount, uncostedItemCount: 0, soldItemCount: 0 })` — ใช้แค่ `complete/missingCost/missingExpense` (ไม่มีปุ่มตั้งราคาทุนบนการ์ด)
- `getSalesSeries(shop.id, 'daily', { year, month }, true, shop.vertical)` → `values` · `netProfitValues` (เดือนที่ `range` จบ)
- ร้านใดล้ม → การ์ดร้านนั้นสถานะ error, ไม่นับในยอดรวม, ยอดรวมติดป้าย "ไม่ครบ" (partial-data convention)

---

## 4. Data Flow

### 4.1 Flow หลัก: เปิด Dashboard

```mermaid
sequenceDiagram
    participant B as Browser
    participant P as dashboard/page.tsx
    participant S as business-overview.service
    participant DB as Postgres
    B->>P: GET /dashboard?range=month
    P->>P: requireActiveShop → kind
    alt kind !== PERSONAL
        P-->>B: Dashboard เดิม
    else PERSONAL
        P->>S: getBusinessOverview(sessionUserId, resolved range)
        S->>DB: shops (OWNER + BUSINESS + ไม่ล็อก)
        S->>S: isPaidBusinessShop
        par ต่อร้าน
            S->>DB: getPnlReport / expense.count / getSalesSeries
        end
        S-->>P: { cards, totals, series } หรือ null (0 ร้าน)
        P-->>B: BusinessOverviewSection + Dashboard เดิม
    end
```

### 4.2 Flow กรณีล้มเหลว / ชดเชย (ถ้ามี)
- service ทั้งก้อน throw → page จับ แล้วไม่ render ส่วนนี้ (Dashboard เดิมยังขึ้น) + `console.error('[business-overview]', …)`
- ร้านเดียวล้ม → ตาม §3.2

---

## 5. Integration Points

| จุด | การใช้ | หมายเหตุ |
|-----|-------|---------|
| `getPnlReport` | กำไรสุทธิ/ยอดขาย/จำนวนออเดอร์ | ปลายทางของการ์ดเรียกตัวเดียวกัน ⇒ ตรงกันทุกบาท |
| `getSalesSeries` | กราฟ | ดู TD-003 |
| `useShopSwitcher` | สลับร้าน | `landingPath` = ผล `financeHrefFor` |
| ปลายทางร้านบริการ | `/sales?tab=pnl&range=…` | แท็บ pnl มีเฉพาะ SERVICE_QUEUE |
| ปลายทางร้านอื่น | `/expenses?range=…` | การ์ด P&L ของ `/expenses` ใช้ `getPnlReport` เดียวกัน (`/sales` ของร้านขายของเป็นของเดิม ไม่มีกำไรสุทธิ) |

---

## 6. Technical Decisions

### TD-001: ไม่สร้าง API route — เรียก service ตรงจาก RSC
หน้าเป็น RSC อยู่แล้ว เปลี่ยนช่วงเวลา = เปลี่ยน URL → RSC render ใหม่ ไม่ต้องมี endpoint ให้ดูแลเพิ่ม

### TD-002: ปลายทางแยกตามประเภทร้าน
แท็บ "กำไรขาดทุน" (`/sales?tab=pnl`) มีเฉพาะร้านบริการ ร้านอื่นมีการ์ด P&L ที่ `/expenses` — ทั้งสองเรียก `getPnlReport` ด้วยช่วงจาก `resolveDateRange` ตัวเดียวกัน ⇒ ตัวเลขตรงกับการ์ด (PRD §3.5 "แท็บกำไรขาดทุน" อ่านเป็น "หน้าที่แสดงกำไรสุทธิของร้านนั้น")
**ข้อระวัง:** `/expenses` default = `30d` ต้องส่ง `range` ไปเสมอ

### TD-003: กราฟใช้ `getSalesSeries` ซึ่งร้านที่ไม่ใช่บริการนับยอดแบบเดิม
มติ user 2026-10-02 ให้ร้านขายของใช้กติกาเดิมในกราฟ/ชีต ⇒ ผลรวมของกราฟอาจไม่เท่ากับยอดรวมบนการ์ดเมื่อมีร้านขายของ — กราฟติดคำอธิบาย "แนวโน้มรายวัน · ตัวเลขชุดเดียวกับกราฟหน้าแรกของแต่ละร้าน" และ**ไม่แสดงยอดรวมบนกราฟ** เพื่อไม่ให้มีตัวเลขรวมสองค่า (HR16) · ไม่แก้ `getSalesSeries` ในงานนี้

### TD-004: ช่วงเวลาของส่วนนี้แยกจาก cookie `seller_dashboard_range`
ส่วนล่างของ Dashboard ใช้ cookie (วันนี้|เดือนนี้) · ส่วนนี้ใช้ URL `range/start/end` + `resolveRangeFromParams(sp, 'month')` — สองตัวคุมคนละส่วน ตัวเลือกต้องวางอยู่ในหัวของส่วนนี้เท่านั้น (UX-Design-Spec)

### TD-005: ไม่ cache
เจ้าของส่วนใหญ่มี 1–3 ร้าน · วัดด้วย `Server-Timing` ก่อนถ้าช้า (feedback: วัดก่อนแก้)

---

## 7. Traceability

| FR (BRD) | ออกแบบที่ |
|----------|-----------|
| FR-001 | page.tsx gate `active.kind === 'PERSONAL'` + service คืน `null` เมื่อ 0 ร้าน |
| FR-002 | §3.1 + `isPaidBusinessShop` |
| FR-003/004 | `summarizeOverview` + `getPnlReport` |
| FR-005 | `resolveDataCompleteness` |
| FR-006 | TD-004 |
| FR-007 | TD-003 + `sumSeries` |
| FR-008 | TD-002 + `financeHrefFor` + `useShopSwitcher` |
| FR-009 | UX-Design-Spec |

---

## 8. สรุป (Summary)
งานนี้มีไฟล์ใหม่ 2 lib + 1 service + 2 component แล้วแทรกเข้า page.tsx 1 จุด ไม่มี API route, migration หรือสูตรเงินใหม่ ตัวเลขทุกตัวมาจาก `getPnlReport`/`getSalesSeries` ตัวเดิม

---

## ส่วนแก้ไข v1.1 (2026-10-05) — ชนะเนื้อหาเดิมเมื่อขัดกัน

ที่มา: [[PRD]]/[[BRD]] ส่วนแก้ไข v1.1

### V1.1-1 หนึ่ง component สองที่วาง
`PortfolioPanel` (client) = ตัวควบคุมช่วง (รายวัน/รายเดือน + ‹ ›) · ตัวเลขใหญ่ (ยอดขายรวม/กำไรสุทธิรวม) · กราฟแท่งซ้อน · ตารางเทียบ
- **desktop:** วางใน `PortfolioOverview` แทนการ์ดสรุป+กราฟ 2 เส้น+กริดการ์ดร้านเดิม (ตารางเทียบกดได้ แทนการ์ดร้าน — ข้อมูลเดียวกัน ไม่ทำซ้ำสองแบบ)
- **มือถือ:** `PortfolioSheet` = กรอบเต็มจอ (โครงเดียวกับ `SalesChartSheet` + `useLockBodyScroll`) ห่อ `PortfolioPanel`
- เลื่อนช่วง → `fetch('/api/seller/portfolio-series?mode&year&month')` (โครงเดียวกับ `SalesChartSheet` fetch/retry)

### V1.1-2 การ์ดมือถือ
`SalesChartCard` รับ `initialSeries` = series รวม (รูป `SalesSeries` เดิม เฉพาะฟิลด์ที่บวกกันได้ ไม่มี `receivedValues`/finance ⇒ การ์ดเข้าเส้นทาง "ร้านทั่วไป" เดิมทุกบรรทัด) + prop ใหม่ `portfolio?: { title; initial: PortfolioSeries }` → หัวการ์ดเปลี่ยนเป็น "ยอดขายทุกธุรกิจ" และกดแล้วเปิด `PortfolioSheet` แทน `SalesChartSheet`
- page.tsx: บริบท Personal + `portfolioShops.length > 0` → `mobileSalesSeries` = ผลรวม (แทนของร้าน Personal)

### V1.1-3 Service
`getPortfolioSeries(userId, mode, period, shops, personalShop)` ใน `business-overview.service.ts`
- ช่วงของ period: `periodRange(mode, year, month)` (lib บริสุทธิ์) → `resolveDateRange('custom', start, end)` · รายวัน = วันแรก–วันสุดท้ายของเดือน · รายเดือน = 1 ม.ค.–31 ธ.ค.
- ต่อร้าน (BUSINESS ทุกร้าน + Personal) `Promise.allSettled`: `getSalesSeries(id, mode, period, false, vertical)` · `getPnlReport(id, range, vertical)` · `expense.count`
- `includeFinance=false` โดยเจตนา — กำไรมาจาก `getPnlReport` เท่านั้น (ไม่มีกำไรสองแหล่ง)
- ร้านล้ม → แถว ERROR ไม่นับ + `incomplete`

### V1.1-4 lib บริสุทธิ์ (`src/lib/business-overview.ts`)
| ฟังก์ชัน | หน้าที่ |
|---|---|
| `periodRange(mode, year, month?)` | `{ start, end }` ISO |
| `aggregateSalesSeries(list)` | บวกตาม index: `values` `confirmedValues` `unconfirmedValues` `orderCounts` `codPendingValues` `last14Confirmed` `last14Unconfirmed` · บวก scalar `total` `prevTotal` `prevTotalToDate` · `labels` `futureFromIndex` `last14Labels` เอาจากตัวแรก (ค่าเดียวกันทุกร้านในช่วงเดียวกัน) |
| `buildStack(rows, max=5)` | ≤ max ชุด: เรียงตามยอดช่วง · เกิน → (max−1) ร้าน + "อื่น ๆ" |
| `buildComparisonRows(...)` | แถวเทียบ + `sharePct` (null เมื่อยอดรวม 0 · Personal = null) · เรียงยอดขาย · Personal ท้ายสุด |

ลบของ v1.0 ที่ไม่ใช้แล้ว: `sumSeries`, `getBusinessOverview` (แทนด้วย `getPortfolioSeries`), `buildRangeQs` (ลิงก์ใช้ `range=custom&start&end` จาก `periodRange`) — ห้ามเก็บโค้ดตาย

### V1.1-5 API ใหม่
`GET /api/seller/portfolio-series` — ดู [[API]] ส่วนแก้ไข v1.1

### V1.1-6 Technical Decisions
- **TD-006 ยอดขาย = `getSalesSeries.total`** (มติ Q22) — ไม่ใช่ `getPnlReport.revenue` · TD-003 เดิม (ผลรวมกราฟ ≠ การ์ด) **หมดไป** เพราะกราฟและตัวเลขใหญ่มาจากชุดเดียวกันแล้ว
- **TD-007 ช่วงเวลารูปแบบเดียว** (มติ Q25) — แทน TD-004
- **TD-008 สีกราฟแท่งซ้อน** — `getColor('chart-*')` ตามลำดับชุด · "อื่น ๆ" = `default-400` · Paces chart palette ห้ามมีม่วงของ buyer (ตรวจตอน build)
