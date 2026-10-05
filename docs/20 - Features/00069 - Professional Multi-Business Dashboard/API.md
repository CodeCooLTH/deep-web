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
