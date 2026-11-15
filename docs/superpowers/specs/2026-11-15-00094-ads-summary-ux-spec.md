---
title: "Design Spec (safepay-ux) — 00094 สรุปโฆษณา"
created: 2026-11-15
mode: Operate
related: ["[[2026-11-15-00094-ads-summary-mockup]]", "[[00094 - Ads Intelligence Report/BRD]]"]
---

# Design Spec — `/reports/ads-summary` (HR8 gate)

จอที่รองรับ: แท็บเล็ต 768 ขึ้นไป · ไม่ทำ layout มือถือ (มติ user 2026-11-15)

ม็อกอัพที่ทำตามสเปกนี้: `2026-11-15-00094-ads-summary-mockup.html` (มติ O1–O6 อยู่ในไฟล์ `.md` คู่กัน)

## Theme Source Mapping
`…/` = `theme/paces/Admin/TS/src/app/(admin)/` · `rep/` = `src/app/(paces)/seller/(dashboard)/reports/`

| ส่วน | ไฟล์ต้นทาง | adapt |
|---|---|---|
| กริดหน้า | `…/dashboard/analytics/page.tsx` + `rep/ads/components/AdSalesClient.tsx` | aria-busy + PendingContext |
| ตัวกรอง | `rep/ads/components/AdReportFilters.tsx` | + แถบลิงก์ 3 หน้า (ใช้ร่วมทั้ง 3 หน้า) |
| แถบลิงก์ | `…/ui/tabs/page.tsx` + underline ของ `rep/ads/components/DailyOverviewCard.tsx` | `<Link>` + `aria-current="page"` |
| ① ตัวเลขหลัก | `…/dashboard/ecommerce/components/StatisticCard.tsx` + `…/widgets/charts/components/Stat.tsx` | ตัด CountUp/uppercase/`text-default-400` · delta ผ่าน `DeltaText` (+tone `inverse`/`neutral`) |
| ① ตัวเลขรอง | `…/ui/collapse/page.tsx` | `dl` |
| ② คำแนะนำ | `…/ui/accordions/page.tsx` + `…/ui/badges/page.tsx` | ไม่มีแถบซ้าย (audit) · ข้อที่กาง = พื้น `default-50` |
| ③ แนวโน้ม | `rep/ads/components/DailyOverviewCard.tsx` | 2 แผงซ้อน `chart.group` · select จัดกลุ่ม = form-select |
| ④ funnel | `…/dashboard/analytics/components/TotalSubscriber.tsx` | HTML ไม่ใช่ Apex funnel (สเกล 6,500:1 อ่านไม่ออก) · แถบ = อัตราผ่าน |
| ⑤ ตาราง | `…/dashboard/analytics/components/AnalyticsOverview.tsx` + `rep/ads/components/AdTableCard.tsx` | expand 3 ชั้น |
| ⑥ อันดับ | `…/dashboard/ecommerce/components/TopSellingProducts.tsx` | `AdThumb` |
| ⑥ bubble | `…/charts/apex/bubble/components/data.ts` | 2 series สี |
| ⑦ น้ำตก | `…/charts/apex/column/components/data.ts` (stacked) | แท่งฐานโปร่ง — ธีมไม่มี waterfall |
| ⑦ รายแคมเปญ | `…/dashboard/ecommerce/components/WeeklyPerformanceInsights.tsx` | bar horizontal |
| สถานะ | `rep/ad-quality/components/CardState.tsx` + `rep/ads/components/AdSpendNotice.tsx` | หัวข้อบรรทัดเดียว + ปุ่ม |
| skeleton | `_shared/SellerCardSkeleton.tsx` | ต่อส่วน (Suspense) |

## กราฟ (HR10 — `ApexChart` wrapper · `getColor('chart-*')` · ห้ามค่า `undefined`)
| ส่วน | ชนิด | สี |
|---|---|---|
| sparkline ×6 | area sparkline h36 | `chart-primary` |
| แนวโน้ม | area/line 2 แผง + เส้นประช่วงก่อน | บน `chart-primary` · ล่าง `chart-zeta` · ก่อน `default-400` |
| ROAS | line + เส้นอ้างอิง 1 | `chart-primary` |
| bubble | bubble 2 series | ถูกกว่าเฉลี่ย `chart-primary` · แพงกว่า `chart-zeta` |
| น้ำตก | stacked bar | ยอดขาย/กำไร `chart-primary` · ต้นทุน/ค่าโฆษณา `default-400` |
| กำไรรายแคมเปญ | bar horizontal | บวก `chart-primary` · ลบ `chart-zeta` |

ห้าม `chart-secondary` (ม่วง) · `chart-alpha`/`chart-beta` เป็นสีหมวด · แกน y คู่ · pie · 3D

## สี/ป้าย
- delta: ดีขึ้น `success-ink` · แย่ลง `warning-ink` · กลาง `default-600` · ลูกศร + `sr-only` เสมอ
- ป้ายจัดกลุ่ม: ทำได้ดี `primary/15` + trending-up · ควรดู `warning/15` + alert-triangle · ปกติ `default-100` · ข้อมูลน้อย ขอบ `default-300` + info-circle และแถว `opacity-70`
- ห้ามคำว่า "Deep" บนหน้า (BR-AIR-14) · "แชท (Meta)" = ที่ Meta นับ · "แชทเข้าร้าน" = ที่ร้านได้รับจริง · ป้ายแหล่งเฉพาะ Meta

## Edge states
ไม่มีสิทธิ์ F1 · ไม่เคยมีข้อมูลแอด · ช่วงว่าง · loading ต่อส่วน · ไม่เชื่อม/AUTH/CURRENCY (ส่วน Deep ยังแสดง) · ERROR ต่อส่วน + ลองใหม่ · ใบเกินเพดาน (คำแนะนำปิด, กำไรไม่เพียงพอ) · ช่วง 1 วัน · ต้นทุนไม่ครบ · ขายต่ำกว่าทุน · ชื่อยาว (truncate / line-clamp-2) · tzMismatch
