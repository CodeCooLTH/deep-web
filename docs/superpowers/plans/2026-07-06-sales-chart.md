# Sales Chart (Command Center) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. Frontend tasks = SafePay agent-team (**safepay-ux → developer → reviewer → qa**). Controller commit.

**Goal:** กราฟแท่งยอดขายบน command center — mini card (เหนือคำสั่งซื้อ) → full-screen sheet (รายวัน เลือกเดือน / รายเดือน เลือกปี, ย้อนหลังได้).

**Architecture:** service aggregate (non-cancelled orders sum totalAmount ต่อวัน/เดือน) → API → SalesChartCard (mini) + SalesChartSheet (full, ApexChart). ไม่มี migration.

## Global Constraints
- **Chart = copy จาก `theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/` (bar) + ผ่าน `@/components/wrappers/ApexChart`** — ห้าม import `react-apexcharts` ตรง ๆ, ห้าม options from scratch (HR10). สี = `getColor('chart-*')` token. Commit มี `Base:` (HR3).
- Paces primitive (HR7); ห้าม emoji (HR12); toast=pacesToast (HR9); Anuphan; วันที่ผ่าน `format-date.ts` tz ไทย.
- ยอด = `Order.status != CANCELLED`, group by `createdAt` (tz ไทย).
- tsc: `node node_modules/typescript/lib/tsc.js --noEmit` = 0. Dev server user รันเอง (port 4000).

---

## Task 1: `getSalesSeries` service (TDD)
**Files:** Modify `src/services/order.service.ts` (หรือใหม่ `dashboard.service.ts`); Test `src/services/__tests__/sales-series.test.ts`.

**Interfaces:** `getSalesSeries(shopId, mode:'daily'|'monthly', period:{year:number;month?:number}): Promise<{labels:string[];values:number[];total:number;prevTotal:number}>`.

- [ ] **Step 1: failing test** — daily: order 3 ใบ (2 วันเดียวกัน + 1 อีกวัน, ไม่ CANCELLED) + 1 CANCELLED (ต้องไม่นับ) → values[day] ถูก, total = sum, labels length = จำนวนวันในเดือน.
- [ ] **Step 2: FAIL** — `npx vitest run src/services/__tests__/sales-series.test.ts`
- [ ] **Step 3: implement** — คำนวณ gte/lt ของช่วง (daily=เดือน, monthly=ปี) + ช่วงก่อนหน้า; `prisma.order.findMany({where:{shopId,status:{not:'CANCELLED'},createdAt:{gte,lt}},select:{totalAmount:true,createdAt:true}})`; aggregate sum ต่อ bucket (วัน/เดือน) ใน JS ด้วย tz ไทย; labels daily "1".."N" / monthly "ม.ค.".."ธ.ค."; prevTotal จากช่วงก่อน.
  > ยืนยัน field: `Order.totalAmount` (number), `Order.status` enum มี `CANCELLED`, `Order.createdAt`. อ่าน schema ก่อน.
- [ ] **Step 4: PASS + tsc 0.**
- [ ] **Step 5: Commit** — `feat(sales-chart): getSalesSeries — ยอดขายต่อวัน/เดือน (exclude CANCELLED)`

---

## Task 2: API route `GET /api/seller/sales-series`
**Files:** Create `src/app/api/seller/sales-series/route.ts`.

**Interfaces:** query `mode,year,month` → `{labels,values,total,prevTotal}`. Consumes T1.

- [ ] **Step 1** — route: getServerSession + requireActiveShop; parse+validate query (Valibot: mode enum, year/month int range); เรียก `getSalesSeries`; คืน JSON. auth ไม่ผ่าน → 401; force-dynamic + `cache-control: private, no-store` (feedback_auth_api_cache_control).
- [ ] **Step 2: tsc 0 + curl (authed) verify JSON.**
- [ ] **Step 3: Commit** — `feat(sales-chart): GET /api/seller/sales-series`

---

## Task 3: safepay-ux + SalesChartCard (mini) + SalesChartSheet (full, ApexChart)
**GATE:** safepay-ux ก่อน (HR8) อิง Paces charts docs + mockup.
**Files:** Create `dashboard/components/SalesChartCard.tsx`, `dashboard/components/SalesChartSheet.tsx`; Modify `dashboard/page.tsx` (fetch series เริ่มต้น), `dashboard/components/CommandCenter.tsx` (render card เหนือ "คำสั่งซื้อ").

- [ ] **Step 1: page fetch** — `dashboard/page.tsx` เรียก `getSalesSeries(shopId,'daily',{year,month=ปัจจุบัน})` (Promise.allSettled) ส่ง `initialSeries` เข้า CommandCenter.
- [ ] **Step 2: SalesChartCard (mini)** — `.sc` shell card: หัวข้อ "ยอดขาย · เดือนนี้" + chevron, ยอดรวม + %chg (เขียว/แดง), **mini bars** (div sparkline หรือ ApexChart sparkline). `'use client'` state เปิด sheet. render **ก่อน block คำสั่งซื้อ** ใน CommandCenter.
- [ ] **Step 3: SalesChartSheet (full-screen)** — toggle `[รายวัน|รายเดือน]` (segmented) + period nav `‹ [เดือน/ปี] ›` (`›` disabled ถ้าปัจจุบัน) + total + **ApexChart bar** (copy จาก theme charts) + xaxis. เปลี่ยน mode/period → fetch `/api/seller/sales-series` (client `cache:'no-store'`) + loading state. ไม่มีข้อมูล → "ยังไม่มียอดขายในช่วงนี้".
  > Base: `theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/<Bar>.tsx` + `@/components/wrappers/ApexChart`. สี `getColor('chart-*')`.
- [ ] **Step 4: tsc 0 + reviewer grep** `rg "react-apexcharts" src/app/(paces)/` = 0 + emoji=0 + arbitrary-value=0.
- [ ] **Step 5: QA (Chrome DevTools MCP, user รัน server)** — CC เห็นการ์ด mini; แตะ→sheet; สลับรายวัน/รายเดือน; ‹ ย้อนเดือน โหลดใหม่; › ปัจจุบัน disabled; verify DB exclude CANCELLED.
- [ ] **Step 6: Commit** (`Base:` theme charts + ApexChart wrapper).

---

## Task 4: retro + doc-sync + push
- [ ] retro (`phase-retro`) + doc-sync (PRD §11 ถ้ามี) + push branch (ขอ user ยืนยันก่อน touch prod).
