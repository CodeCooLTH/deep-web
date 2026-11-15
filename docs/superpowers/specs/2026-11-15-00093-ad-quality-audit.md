# Audit — 00093 หน้าคุณภาพโฆษณา (`/reports/ad-quality`)

> `/impeccable audit` 2026-11-15 · register `product` (คอนโซลผู้ขาย) · ขอบเขต: `src/app/(paces)/seller/(dashboard)/reports/ad-quality/**` + `src/lib/ad-quality-view.ts` + `src/lib/ad-quality-formulas.ts` + `src/services/ad-quality-report.service.ts`
> คำขอ user: "อยากให้ดูเป็น Analytics" (ยึด `theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/`) · ม็อกอัพเสนอ: `2026-11-15-00093-ad-quality-analytics-mockup.html`
> เป็นรายงานอย่างเดียว ไม่ได้แก้โค้ด

## Audit Health Score

| # | มิติ | คะแนน | ข้อค้นพบหลัก |
|---|---|---|---|
| 1 | Accessibility | 3 | ใช้ระดับหัวข้อห่อตัวเลข (h3 อยู่ใต้ h4) · ลิงก์ inline ที่ใส่ `min-h-11` แล้วไม่มีผล |
| 2 | Performance | 3 | แถวบนสามการ์ดรอ Q2 (เข้าถึง) ทั้งที่ ① ② ใช้แค่ Q1 |
| 3 | Responsive | 3 | ใช้ได้ทุกจอ · ข้อมูลสำคัญหลายจุดเป็นตัว 11px (`text-2xs`) |
| 4 | Theming | 3 | ใช้โทเคนครบ · สีไดนามิกใช้ `style` แบบมี comment · กราฟสร้างใหม่ตอนสลับธีม |
| 5 | Implementation Integrity | 2 | ข้อความอธิบายยาวหลายจุด (ขัดคำสั่ง user) · ตารางรายแอดสองใบซ้ำกัน · สถานะว่างวาดกล่องสถานะ 5 กล่อง |
| **รวม** | | **14/20** | **Good** (แก้มิติที่อ่อน) |

Detector (`detect.mjs`) บนโฟลเดอร์หน้านี้: **0 ข้อ** — ไม่เจอ anti-pattern เชิงกลไก (ไม่มี arbitrary value, gradient text, emoji). ข้อด้านล่างทั้งหมดมาจากการอ่านโค้ด

## Implementation Integrity Verdict — **ไม่ผ่าน (ผ่านเชิงเทคนิค ไม่ผ่านเชิงเจตนา)**

โค้ดสะอาด สูตรอยู่ที่เดียว (`ad-quality-view.ts`/`ad-quality-formulas.ts`) ป้าย "แชท (Meta)/แชท (Deep)" ถูกทุกจุด และไม่มีสีม่วง แต่หน้า**ไม่ตรงสองเรื่องที่ user สั่ง**:
1. **ข้อความอธิบาย** — user สั่งว่า "ห้ามมีย่อหน้าอธิบาย" แต่ยังมีประโยคยาว 9 จุด (ดู P1-1)
2. **ไม่ใช่หน้าตา Analytics** — มีกราฟจริงแค่ใบเดียวและถูกซ่อนไว้หลังแท็บ ที่เหลือเป็นตาราง 4 ชุด (ดูหัวข้อ "ห่างจาก Analytics ตรงไหน")

## Executive Summary

- คะแนน **14/20 (Good)**
- จำนวนข้อ: P0 0 · P1 3 · P2 8 · P3 4
- ข้อที่ต้องแก้ก่อน:
  1. ข้อความอธิบายยาว 9 จุด (P1)
  2. ตารางรายแอด ⑤ กับ ⑥ แสดงข้อมูลซ้ำกัน (P1)
  3. สถานะจริงของร้านตอนนี้ (Meta ว่าง) ขึ้นกล่องสถานะ 5 กล่องในจอเดียว (P1)
  4. ข้อมูลรายวันและช่วงก่อนหน้ามีอยู่แล้วใน service แต่ถูกตัดทิ้ง หน้าจึงไม่มี delta และ sparkline (P2)
  5. ใช้แท็ก heading ห่อตัวเลข (P2)
- ขั้นต่อไป: user ตัดสินม็อกอัพ → `/impeccable layout` + `/impeccable distill` ตามม็อกอัพ → `/impeccable polish`

## ข้อค้นพบตามความรุนแรง

### P1 Major

**[P1-1] ข้อความอธิบายยาวในหน้ารายงาน**
- **ที่:** `components/ChatGapTable.tsx:130` (`gDesc` 2 ประโยค) · `components/PlacementPanel.tsx:130-133` (`placementNote` + `placementNoSales`) · `components/AgeGenderPanel.tsx:120` (`ageNote`) · `components/AdQualityTable.tsx:196-199` (`qNote`) · `components/ChatCompareHero.tsx:70-71` (`h1Counted`/`h1Excluded`), `:76` (`h1NoMetaChats`), `:94` (`h1None`) · `components/ChatQualityHero.tsx:61` (`over100`) · `components/AdQualityFilters.tsx:97` (`pageFilterNote`) · `components/QualityNotice.tsx:19-21` (`notice*Body` ทั้งชุด)
- **หมวด:** Implementation Integrity
- **ผลกระทบ:** user สั่งไว้ชัดว่าไม่เอาย่อหน้าอธิบาย (comment ใน `CardState.tsx:34` ก็อ้างคำสั่งนี้) แต่ทำแค่ใน CardState การ์ดอื่นยังมีอยู่ ตัวหนังสือเทา 11–13px หลายบรรทัดทำให้หน้าดูเป็นเอกสาร ไม่ใช่ dashboard
- **แนะนำ:** ลบออก หรือย่อเหลือป้ายสั้น เช่น `h1Counted` → ชิป "12 แอด", `over100` → ชิป "เกิน 100%" · ป้าย "ประมาณการ" (`EstimateBadge`) แทน `placementNote`/`ageNote` ได้ทั้งหมด
- **คำสั่ง:** `/impeccable distill`

**[P1-2] ตารางรายแอดสองใบแสดงข้อมูลซ้ำกัน**
- **ที่:** `components/MetaSections.tsx:73-74` — `ChatGapTable` (⑤) กับ `AdQualityTable` (⑥) ใช้ `rows` ชุดเดียวกัน · คอลัมน์ ชื่อแอด/รูป/แชท (Meta) ซ้ำทั้งสองใบ · แถวรวม 2 แถว
- **หมวด:** Implementation Integrity
- **ผลกระทบ:** ต้องเลื่อนผ่านรายการแอดชุดเดิมสองรอบ เทียบข้ามตารางไม่ได้ (เรียงคนละแบบ: ⑤ เรียงตามป้าย ⑥ เรียงตาม Meta) · บนมือถือหน้ายาวเกือบเท่าตัว
- **แนะนำ:** รวมเป็นตารางเดียว (ส่วนต่าง + ป้ายเป็นคอลัมน์หนึ่ง) แล้วย้ายภาพ "Meta เทียบ Deep" ไปเป็นกราฟแท่งด้านบน (ดูม็อกอัพ)
- **คำสั่ง:** `/impeccable layout`

**[P1-3] สถานะจริงตอนนี้ (บัญชีที่เชื่อมไม่มีแอดที่ตรงกัน) ขึ้นกล่องสถานะ 5 กล่อง**
- **ที่:** `components/ChatCompareHero.tsx:78` · `components/ChatQualityHero.tsx:45` · `components/SpendDeliveryHero.tsx:84` · `components/BreakdownCard.tsx:124` · `components/ChatGapTable.tsx:137` (`metaAdsNotInAccount` → EMPTY ทุกการ์ด)
- **หมวด:** Implementation Integrity / UX
- **ผลกระทบ:** ร้านเห็นการ์ด 5 ใบที่บอกเรื่องเดียวกัน (ปุ่มอยู่ใบเดียว) ใช้เหตุผลเดียวกับที่ตัดสินไว้ในมติ O1 (การเชื่อมไม่พร้อม → ซ่อนการ์ด Meta) แต่สถานะนี้ยังไม่ได้ใช้กฎนั้น
- **แนะนำ:** ใช้กฎ O1 กับสถานะ "แอดไม่อยู่ในบัญชี" ด้วย คือมีแถบเดียว (หัวข้อ + ปุ่ม) แสดงเฉพาะ KPI กราฟ และตารางของฝั่ง Deep แล้วซ่อนการ์ดที่มีแต่ข้อมูล Meta
- **คำสั่ง:** `/impeccable distill`

### P2 Minor

**[P2-1] มีข้อมูลรายวันและช่วงก่อนหน้า แต่ service ตัดทิ้ง**
- **ที่:** `src/services/ad-quality-report.service.ts:27-37` — `getAdSalesReport` คืน `previous.{chats,adOrders,closeRatePct}`, `ads.summary.prevSpend` และ `daily[].{adOrders,spend}` (`ad-sales-report.service.ts:55-81`) แต่ `getQualityDeepSide` ไม่ส่งต่อ
- **หมวด:** Implementation Integrity (analytics)
- **ผลกระทบ:** หน้าไม่มี delta และ sparkline เลย ทั้งที่หน้าพี่น้อง `/reports/ads` มี (`DeltaText`) · ไม่ต้องดึงข้อมูลใหม่ แค่ส่งต่อฟิลด์ที่ service คำนวณไว้แล้ว
- **ข้อจำกัด:** ฝั่ง Meta (Q1–Q4) ไม่มีข้อมูลรายวันหรือช่วงก่อนหน้า และ `daily` ไม่มีแชทรายวัน ⇒ แชท (Deep) มีได้แค่ delta ไม่มี sparkline · ปิดการขายใช้ sparkline ของ "คำสั่งซื้อรายวัน"
- **คำสั่ง:** `/impeccable layout`

**[P2-2] กราฟอายุ/เพศถูกซ่อนหลังแท็บ**
- **ที่:** `components/BreakdownCard.tsx:101-130` — มีกราฟจริงของหน้าแค่ใบนี้ (donut + แท่งซ้อน) และเห็นได้ทีละแผง
- **ผลกระทบ:** ที่ 1280px การ์ดกว้างเต็มแถวแต่ใช้แค่ครึ่งเดียว ข้อมูลอายุ/เพศเห็นได้ต่อเมื่อกดแท็บ
- **แนะนำ:** วางสองแผงคู่กันในการ์ดเดียว (ตัวเลือกแอดยังมีที่เดียวตามมติ O2) แล้วซ้อนกันบนมือถือ
- **คำสั่ง:** `/impeccable layout`

**[P2-3] ใช้แท็ก heading ห่อตัวเลข**
- **ที่:** `ChatCompareHero.tsx:43,49,88` · `ChatQualityHero.tsx:34,40,52` · `SpendDeliveryHero.tsx:51,56` — ชื่อการ์ดเป็น `<h4>` แต่ตัวเลขเป็น `<h3>` (ระดับสูงกว่าชื่อ) และชื่อแอดเป็น `<h5>` · ชื่อหน้าใน `PageBreadcrumb` เป็น `<h4>` และหน้านี้ไม่มี `<h1>`
- **หมวด:** Accessibility · **มาตรฐาน:** WCAG 1.3.1 Info and Relationships
- **ผลกระทบ:** โปรแกรมอ่านจอเห็นโครงหัวข้อเป็น "1,012" "18.4%" ซึ่งไม่มีความหมาย
- **แนะนำ:** ตัวเลขใช้ `<p>`/`<span>` ตามขั้น Metric · ชื่อการ์ดใช้ระดับเดียวกันทุกใบ
- **คำสั่ง:** `/impeccable harden`

**[P2-4] ลิงก์ inline ใส่ `min-h-11` แล้วไม่มีผล**
- **ที่:** `ChatCompareHero.tsx:90` — `<a className="… min-h-11 …">` เป็น inline element จึงไม่สน min-height · พื้นที่แตะจริงสูงประมาณ 20px
- **มาตรฐาน:** WCAG 2.5.8 Target Size
- **แนะนำ:** ใส่ `inline-flex items-center`
- **คำสั่ง:** `/impeccable harden`

**[P2-5] aria-label ของกราฟแท่งอายุไม่เปลี่ยนตามตัวชี้วัด**
- **ที่:** `AgeGenderPanel.tsx:87` — ป้ายหัวเปลี่ยนตาม `metricLabel` แต่ items ใช้ `l.chats` ทุกครั้ง พอเลือก "ค่าโฆษณา" โปรแกรมอ่านจอจะอ่านจำนวนแชทแทน
- **มาตรฐาน:** WCAG 1.1.1
- **คำสั่ง:** `/impeccable harden`

**[P2-6] แถวบนรอ Q2 ทั้งที่ ① ② ไม่ใช้**
- **ที่:** `MetaSections.tsx:27` — `Promise.all([bundle.ad, bundle.account])` ทำให้การ์ด ① ② ต้องรอคำขอ "เข้าถึง" ซึ่ง ③ ใช้ใบเดียว
- **หมวด:** Performance
- **ผลกระทบ:** ถ้า Q2 ช้าหรือหมดเวลา แชท (Meta) ที่เป็นตัวเลขหลักของหน้าจะช้าตามไปด้วย
- **แนะนำ:** แยก Suspense ของ ③ ออกมา
- **คำสั่ง:** `/impeccable optimize`

**[P2-7] ข้อมูลที่ใช้อ่านเป็นตัว 11px**
- **ที่:** `ChatCompareHero.tsx:50,70` · `ChatQualityHero.tsx:41,59` · `RateCell.tsx:19` · `AdQualityMobileList.tsx:30` · `AdQualityTable.tsx:62,90` (`text-2xs`)
- **หมวด:** Responsive / Readability
- **ผลกระทบ:** PRODUCT.md ระบุกลุ่มผู้ใช้สูงวัย ตัวหาร "k จาก n" และป้ายกลุ่ม Meta/Deep เป็นข้อมูลจริง ไม่ใช่ตัวประกอบ
- **แนะนำ:** ข้อมูลใช้อย่างน้อย `text-xs` (13px) · ใช้ `text-2xs` เฉพาะป้ายหน่วย
- **คำสั่ง:** `/impeccable typeset`

**[P2-8] แผง "ทำไมตัวเลขไม่เท่ากัน" เป็นประโยคยาว 4 ข้อ**
- **ที่:** `WhyDifferentPanel.tsx:16-21` (`why1`–`why4` ข้อละ 1–2 ประโยค)
- **ผลกระทบ:** ซ่อนอยู่หลังปุ่มจึงรบกวนน้อยกว่า P1-1 แต่ยังเป็นย่อหน้าอธิบายแบบที่ user ไม่ชอบ
- **แนะนำ:** ถาม user ว่าจะตัดทิ้งหรือย่อเหลือหัวข้อ 4 บรรทัด (ดูคำถามค้าง)
- **คำสั่ง:** `/impeccable distill`

### P3 Polish

- **[P3-1]** `BreakdownCard.tsx:105,122` — `aria-controls` ของแท็บที่ไม่ได้เลือกชี้ไปที่ panel id ที่ไม่ได้ render
- **[P3-2]** `SpendDeliveryHero.tsx:67-77` — คอลัมน์ "ที่มา" ซ้ำคำว่า "Meta" ทุกแถว (ดูจากป้ายกลุ่มก็พอ)
- **[P3-3]** `MetaSections.tsx:82` + `page.tsx:140` — บรรทัด "Meta อัปเดต …" รอคำขอทั้ง 4 ตัว จึงขึ้นช้าสุด
- **[P3-4]** `AdQualityTable.tsx:155-167` — ที่ 390px ช่องค้นหาและ select อีก 2 ตัวขึ้น 3 บรรทัดในหัวการ์ด

## Patterns & Systemic Issues

- **ข้อความอธิบายย้ายไปอยู่ที่อื่นแทนที่จะหายไป:** รอบ clarify ตัดข้อความออกจาก `CardState` แล้ว แต่ประโยคแบบเดียวกันยังอยู่ใน `t.adQuality.*` อีก 9 คีย์ ⇒ ควรไล่จากไฟล์ dictionary ไม่ใช่ไล่ทีละ component
- **โครงหน้าเป็น "การ์ดตาราง" มากกว่า "การ์ดกราฟ":** 6 ส่วนมีตาราง 5 ชุด (③ ตารางตัวชี้วัด · ④ ตารางตำแหน่ง/อายุ · ⑤ · ⑥) แต่กราฟจริงมีชุดเดียว
- **กล่องสถานะเกิดซ้ำตามจำนวนการ์ด:** สถานะของคำขอหนึ่งตัว (Q1) ไปขึ้นกล่องในทุกการ์ดที่ใช้ Q1

## Positive Findings

- สูตรอยู่ที่เดียว (`ad-quality-view.ts`) และ comment บอกว่าตัวตั้ง/ตัวหารมาจากชุดเดียวกัน (HR16)
- "ไม่ทราบค่า" กับ 0 แยกกันทุกจุด (`NoDataCell` + sr-only)
- ป้าย "แชท (Meta)/แชท (Deep)" ถูกทุกที่ ไม่มีคำว่า "แชท" เดี่ยว ๆ
- ไม่มีม่วง ไม่มีเขียว/แดง · ส่วนต่างสูงใช้ warning · Meta เป็นเทา Deep เป็นน้ำเงิน ทั้งหน้า
- tablist มีการใช้คีย์บอร์ดครบ (←/→/Home/End + roving tabindex)
- ปุ่มและ select ใช้ `min-h-11 lg:min-h-0` สม่ำเสมอ
- ApexChart wrapper สร้าง options ใหม่ตอนสลับ skin/theme (`ApexChart.tsx:25`) ทำให้ dark mode ไม่ค้างสีเก่า
- โหลดแบบ streaming: ข้อมูล Deep ขึ้นก่อน การ์ด Meta ตามมาทีละใบ และคำขอที่ล้มไม่ลากการ์ดอื่นไปด้วย

## ห่างจาก "Analytics" ตรงไหน

เทียบกับ `theme/paces/.../dashboard/analytics/page.tsx` (แถวสถิติ 3 ใบที่มีกราฟ → การ์ดกราฟกว้าง + donut → แผนที่/แหล่งที่มา → ตาราง)

| Analytics ของธีม | หน้านี้ตอนนี้ | ม็อกอัพเสนอ |
|---|---|---|
| แถวสถิติ: ตัวเลข + badge ▲▼ + กราฟเล็ก (`TotalOrder` แท่ง 15 วัน) | การ์ด ①②③ มีตัวเลข แต่ไม่มี delta หรือกราฟ เนื้อการ์ดเป็นแถบ/ตาราง | KPI 4 ใบ: แชท (Deep) ▲ · แชท (Meta) + ส่วนต่าง · ปิดการขาย (Deep) ▲ + sparkline คำสั่งซื้อ · ค่าโฆษณา ▲ + sparkline รายวัน |
| การ์ดกราฟกว้าง `xl:col-span-3` + donut ข้าง ๆ | ไม่มี (④ เป็นแท็บเต็มแถว) | กราฟแท่ง "แชท (Meta) เทียบ แชท (Deep) รายแอด" `xl:col-span-8` + การ์ด "คุณภาพแชท (Meta)" `xl:col-span-4` |
| แถบสถิติแบบแท็บ (`SessionOverview`) | ตารางตัวชี้วัด 6 แถวใน ③ | แถบ 7 ช่อง: การแสดงผล · เข้าถึง≈ · ความถี่≈ · CTR · CPC · ต้นทุนต่อแชท (Meta) · ต้นทุนต่อแชท (Deep) |
| donut + ตารางเล็ก (`AudienceInsight`) | ซ่อนหลังแท็บ | ตำแหน่ง (donut + แท่งต้นทุนต่อแชท) คู่กับอายุ/เพศ (แท่งซ้อน) ในการ์ดเดียว |
| ตารางท้ายหน้า 1 ใบ (`AnalyticsOverview`) | 2 ใบที่ซ้อนกัน | ตารางรายแอดใบเดียว |
| ไม่มีย่อหน้าอธิบาย | 9 จุด | 0 จุด (เหลือแต่หัวข้อ ป้าย และตัวเลข) |

## Recommended Actions

1. **[P1] `/impeccable distill`** — ลบข้อความอธิบาย 9 จุด (P1-1, P2-8) และใช้กฎ O1 กับสถานะ "แอดไม่อยู่ในบัญชี" (P1-3)
2. **[P1] `/impeccable layout`** — จัดหน้าใหม่ตามม็อกอัพ: KPI 4 ใบ → กราฟ → แถบตัวชี้วัด → ตำแหน่ง/อายุคู่กัน → ตารางเดียว (P1-2, P2-1, P2-2)
3. **[P2] `/impeccable harden`** — แก้ heading ที่ห่อตัวเลข, ลิงก์ inline, aria-label กราฟอายุ, aria-controls (P2-3, P2-4, P2-5, P3-1)
4. **[P2] `/impeccable optimize`** — แยก Suspense ของการ์ดค่าโฆษณาออกจาก Q2 (P2-6, P3-3)
5. **[P2] `/impeccable typeset`** — ข้อมูลที่ต้องอ่านใช้ 13px ขึ้นไป (P2-7)
6. **`/impeccable polish`** — ตรวจรอบสุดท้าย

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `/impeccable audit` after fixes to see your score improve.
