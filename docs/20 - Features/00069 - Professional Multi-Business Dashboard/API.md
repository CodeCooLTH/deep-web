---
title: "API Contract — ภาพรวมทุกธุรกิจบน Dashboard"
owner: shinobu22
status: draft
created: 2026-10-05
tags: [feature, api, dashboard, finance, multi-shop]
related: ["[[PRD]]", "[[BRD]]", "[[SDS]]"]
---

> **โมดูล:** 00069 — Professional Multi-Business Dashboard
> **ประเภทเอกสาร:** API Contract
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-10-05
> **สถานะ:** Draft

# API Contract: ภาพรวมทุกธุรกิจบน Dashboard

---

## 1. Overview
ฟีเจอร์นี้ **ไม่มี API endpoint ใหม่และไม่แก้ endpoint เดิม** — ข้อมูลถูกคำนวณใน RSC (`/seller/dashboard`) ผ่าน service โดยตรง (SDS TD-001)

## 2. Authentication
NextAuth session ของ seller subdomain · userId จาก `sessionUserId()` · สิทธิ์ตาม SRS TFR-002

## 3. Endpoint List
| Method | Path | หมายเหตุ |
|--------|------|---------|
| — | — | ไม่มี |

endpoint เดิมที่ถูกใช้ทางอ้อม: `POST /api/business/switch-context` (ผ่าน `useShopSwitcher` ไม่แก้)

## 4. Endpoint Detail
ไม่มี

### 4.1 Service contract (แทน endpoint)
```ts
getBusinessOverview(userId: string, range: ResolvedDateRange, rangeQs: string): Promise<BusinessOverview | null>

type BusinessOverview = {
  totals: { revenue: number; netProfit: number; orderCount: number; incomplete: boolean; mixedFinanceRules: boolean }
  cards: Array<{
    shopId: string; shopName: string; logoUrl: string | null; vertical: string
    status: 'OK' | 'ERROR'
    revenue: number; netProfit: number; marginPct: number | null; orderCount: number
    missingCost: boolean; missingExpense: boolean
    href: string
  }>
  series: { labels: string[]; revenue: number[]; netProfit: number[] } | null
}
```
`null` = ไม่มีร้านเข้าเงื่อนไข → ไม่ render

## 5. Error Code Table
| กรณี | พฤติกรรม |
|------|---------|
| ร้านเดียวคำนวณล้ม | card `status: 'ERROR'` ไม่นับในยอดรวม `incomplete = true` |
| service ล้มทั้งก้อน | page จับ ไม่ render ส่วนนี้ |

## 6. Sequence (ถ้า flow ซับซ้อน)
ดู [[SDS]] §4.1

## 7. Traceability
FR-001..FR-008 → service contract ข้างบน

## 8. สรุป (Summary)
ไม่มีพื้นผิว API ใหม่ ⇒ ไม่ต้อง sync ตาราง API ใน `docs/SRS.md`

---

## ส่วนแก้ไข v1.1 (2026-10-05) — endpoint ใหม่ 1 ตัว

### `GET /api/seller/portfolio-series`

| รายการ | ค่า |
|-------|-----|
| Auth | NextAuth session (seller) · `sessionUserId()` |
| สิทธิ์ | ร้านที่เลือกอยู่ต้องเป็น PERSONAL · ร้านที่คืน = `listOverviewShops(userId)` เท่านั้น (+ ร้าน Personal ของผู้ใช้เอง) |
| Query | `mode=daily\|monthly` · `year` 2000–2100 · `month` 1–12 (บังคับเมื่อ daily) |
| Cache | `private, no-store` |

**Response 200**
```ts
PortfolioSeries | null   // null = ไม่มีร้านเข้าเงื่อนไข

type PortfolioSeries = {
  mode: 'daily' | 'monthly'; year: number; month: number | null
  period: { start: string; end: string }          // ISO ใช้ทำลิงก์
  aggregate: SalesSeries                           // ฟิลด์ที่บวกกันได้เท่านั้น (V1.1-4)
  stack: { key: string; name: string; values: number[] }[]   // ≤ 5 ชุด
  rows: {
    shopId: string; shopName: string; logoUrl: string | null; vertical: string
    isPersonal: boolean; status: 'OK' | 'ERROR'
    sales: number; netProfit: number; marginPct: number | null; sharePct: number | null
    missingCost: boolean; missingExpense: boolean; href: string
  }[]
  totals: { sales: number; netProfit: number; incomplete: boolean; mixedFinanceRules: boolean }
}
```

| Status | เมื่อ |
|--------|------|
| 400 | query ผิด |
| 401 | ไม่มี session / ไม่รู้ตัวตน |
| 403 | ร้านที่เลือกอยู่ไม่ใช่ Personal |

**ต้อง sync `docs/SRS.md`** ตาราง API (HR11)
