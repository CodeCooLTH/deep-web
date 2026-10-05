---
title: "UX Design Spec — ภาพรวมทุกธุรกิจบน Dashboard (Professional Multi-Business Dashboard)"
owner: shinobu22
status: draft
created: 2026-10-05
tags: [feature, ux, design-spec, paces, impeccable, dashboard]
related: ["[[PRD]]", "[[BRD]]", "[[00067 - Shop Finance Tabs]]"]
---

> **โมดูล:** 00069 — Professional Multi-Business Dashboard
> **ประเภทเอกสาร:** UX Design Spec (ผ่าน gate HR8 โดย safepay-ux)
> **Theme Source:** `theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx`
> **ป้ายถัดไป:** `stage:build`
> **Mode:** Operate (คอนโซลผู้ขาย — scanability และความเหมือนเดิมชนะการแสดงออก)

# หน้า: Dashboard ผู้ขาย — ส่วน "ภาพรวมทุกธุรกิจ" (`/seller/dashboard`, วางด้านบนสุด)

## User stories ที่ครอบ
- FR-001..FR-009 ของ BRD
- เจ้าของหลายธุรกิจ: "เปิด Dashboard แล้วรู้ทันทีว่าเดือนนี้ทุกธุรกิจเหลือกำไรเท่าไหร่ ร้านไหนดี ร้านไหนข้อมูลยังไม่ครบ แล้วกดเข้าไปดูต่อได้"

## 0. คำถามเดียวที่ส่วนนี้ต้องตอบ
**"ทุกธุรกิจของฉันเดือนนี้ เหลือกำไรเท่าไหร่ และเชื่อตัวเลขนี้ได้แค่ไหน"**

- **พระเอกของส่วนนี้** = กำไรสุทธิรวม (ตัวเลขใหญ่สุด/หนาสุดในแถบสรุป)
- **สิ่งที่ต้องเห็นพร้อมกันเสมอ** = ป้าย "ข้อมูลยังไม่ครบ" ที่ติดกับกำไร ไม่ใช่ซ่อนในหมายเหตุ

---

## Layout (ASCII wireframe)

### โครงรวมของหน้า (`page.tsx`)

```
<>
  <PortfolioOverview />        ← ใหม่: mount ครั้งเดียว วางเหนือทั้งสอง tree
  <div className="lg:hidden">  <CommandCenter/>  </div>
  <div className="hidden lg:block"> PageBreadcrumb + DashboardRangePills + แถว grid เดิม </div>
</>
```

เหตุผลที่ mount ครั้งเดียว:
- ถ้าวางซ้ำสอง tree แล้วซ่อนด้วย CSS ApexChart จะ mount 2 ตัว (ตัวที่อยู่ใน `display:none` วัดความกว้างได้ 0)
- query จะถูกยิงสองรอบ
- id ซ้ำ

### มือถือ 375 (1 คอลัมน์, gutter 16px จาก `.seller-mobile-shell`)

```
┌─────────────────────────────────────┐
│ ภาพรวมทุกธุรกิจ                     │  ← card-header (dashed ล่าง)
│ เดือนนี้ · 01-10-2569 – 05-10-2569  │     text-xs default-700
│ [วันนี้][7 วัน][30 วัน][เดือนนี้][calendar-event]│  ← DateRangeControl (ชิป 44px — ไอคอนจริง ไม่ใช่ emoji)
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│ กำไรสุทธิรวม   [[alert-triangle] ข้อมูลยังไม่ครบ] │  ← พระเอก col-span-2 text-xl semibold
│ ฿41,250                             │
│ ยอดขายรวม            ออเดอร์รวม     │
│ ฿182,400             126            │  ← text-lg medium
│ [info-circle] ร้านบริการหักค่าส่ง ร้านขายของไม่หัก…│  ← เฉพาะเมื่อมี 2 ประเภท
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│ (จุดสีน้ำเงิน) ยอดขายรวม (จุดเทา) กำไรสุทธิรวม │  ← legend = จุดสี + ชื่อเส้นเท่านั้น
│  [ กราฟ 2 เส้น รายวัน  สูง ~240 ]    │
│ กราฟแสดงทั้งเดือน ต.ค. 2569 …        │  ← เฉพาะเมื่อช่วงที่เลือก ≠ "เดือนนี้"
└─────────────────────────────────────┘
แยกรายร้าน                  เรียงตามยอดขาย
┌─────────────────────────────────────┐
│ (โลโก้) ร้านเสื้อผ้า xxx          ›  │
│ ยอดขาย        กำไรสุทธิ             │
│ ฿120,000      ฿31,000               │
│ อัตรากำไร 25.8% · 80 คำสั่งซื้อ      │
│ ดูการเงินร้านนี้            ›  │  ← text-primary
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ (โลโก้) ร้านทำเล็บ                ›  │
│ ยอดขาย        กำไรสุทธิ             │
│ ฿62,400       ฿10,250 (warning-ink) │
│ ไม่เกิน 16.4% · 46 การเข้ารับบริการ  │
│ [[alert-triangle] ยังไม่บันทึกค่าใช้จ่าย]           │
│ ดูการเงินร้านนี้            ›  │
└─────────────────────────────────────┘
──────────── (เส้นประ) ─────────────
[ CommandCenter เดิม ... ]
```

### แท็บเล็ต 768 (ยังเป็น mobile shell เพราะ < 1024, ไม่มี sidebar)
- โครงเหมือนมือถือ
- แถบสรุปเป็น 3 คอลัมน์เท่ากันที่ `md` (กำไรไม่ `col-span-2` แล้ว แต่ยังตัวใหญ่กว่าอีกสองตัว)
- การ์ดร้านเป็น 2 คอลัมน์ (`md:grid-cols-2`) ≈ 350px/ใบ
- กราฟสูง 260

```
┌───────────────────────────────────────────────────────────┐
│ ภาพรวมทุกธุรกิจ                                            │
│ เดือนนี้ · 01-10-2569 – 05-10-2569                         │
│ [วันนี้][7 วัน][30 วัน][เดือนนี้][ไอคอน calendar-event]     │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│ ยอดขายรวม      │ กำไรสุทธิรวม [ป้าย alert-triangle]│ ออเดอร์รวม│
│ ฿182,400       │ ฿41,250 (ใหญ่สุด)                 │ 126       │
│ [info-circle] ร้านบริการหักค่าส่ง ร้านขายของไม่หัก …         │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│ (จุดสีน้ำเงิน) ยอดขายรวม   (จุดสีเทาเข้ม) กำไรสุทธิรวม       │
│ [ กราฟ 2 เส้น สูง 260 ]                                     │
│ กราฟใช้ดูแนวโน้ม ตัวเลขรวมดูที่แถบสรุปด้านบน                 │
└───────────────────────────────────────────────────────────┘
แยกรายร้าน                                     เรียงตามยอดขาย
┌─────────────────────────┐ ┌─────────────────────────┐
│ (โลโก้) ร้านเสื้อผ้า  › │ │ (โลโก้) ร้านทำเล็บ    › │
│ ยอดขาย      กำไรสุทธิ   │ │ ยอดขาย      กำไรสุทธิ   │
│ ...                     │ │ ...                     │
│ ดูการเงินร้านนี้     ›  │ │ ดูการเงินร้านนี้     ›  │
└─────────────────────────┘ └─────────────────────────┘
```

### Desktop 1440 (sidebar 245px → พื้นที่เนื้อหา ≈ 1175px, gutter 20px)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ภาพรวมทุกธุรกิจ                                                           │
│ เดือนนี้ · 01-10-2569 – 05-10-2569                                        │
│                         [วันนี้|7 วัน|30 วัน|เดือนนี้|กำหนดเอง]  ← ขวา    │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│ ยอดขายรวม        │ กำไรสุทธิรวม [ป้าย: alert-triangle ข้อมูลยังไม่ครบ] │ ออเดอร์รวม │
│ ฿182,400         │ ฿41,250  (ใหญ่สุด)                │ 126                 │
│ [info-circle] ร้านบริการหักค่าส่งเป็นค่าใช้จ่าย ร้านขายของไม่หัก …         │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│ (จุดสีน้ำเงิน) ยอดขายรวม     (จุดสีเทาเข้ม) กำไรสุทธิรวม    ← ชื่อเส้นเท่านั้น │
│  [ กราฟเส้น 2 เส้น เต็มกว้าง สูง 260 ]                                    │
│ กราฟใช้ดูแนวโน้ม ตัวเลขรวมดูที่แถบสรุปด้านบน                               │
└──────────────────────────────────────────────────────────────────────────┘
แยกรายร้าน                                               เรียงตามยอดขาย
┌─────────────────────────────┐ ┌─────────────────────────────┐
│ (โลโก้) ร้านเสื้อผ้า      ›  │ │ (โลโก้) ร้านทำเล็บ        ›  │   ← xl: 2 คอลัมน์
│ ยอดขาย ฿120,000             │ │ ...                         │      2xl (≥1536): 3 คอลัมน์
│ กำไรสุทธิ ฿31,000           │ │ [ป้าย alert-triangle         │
│ อัตรากำไร 25.8% · 80 รายการ │ │  ยังไม่บันทึกค่าใช้จ่าย]      │
│ ดูการเงินร้านนี้         ›  │ │ ดูการเงินร้านนี้         ›  │
└─────────────────────────────┘ └─────────────────────────────┘
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ (เส้นประคั่น) ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
PageBreadcrumb "ภาพรวมร้านค้า" + [วันนี้|เดือนนี้]  ← เดิม
...แถว grid เดิม...
```

**กรณีมีร้านเดียว** (`shops.length === 1`)
- ไม่ใช้กริด การ์ดเป็นแถวเต็มกว้าง 1 คอลัมน์
- ภายในการ์ดจัดแนวนอนที่ `md+` (ชื่อร้านซ้าย / ตัวเลขขวา)
- กันที่ว่างเปล่าฝั่งขวาบน 1440

---

## Section breakdown (prose) — ฉบับแก้

### A. หัวส่วน + ตัวเลือกช่วงเวลา (อยู่ใน `card-header` ของการ์ดสรุป)
- ชื่อ "ภาพรวมทุกธุรกิจ" (`h2`, `card-title`)
- บรรทัดรองบอกช่วงที่ resolve แล้วเสมอ เช่น "เดือนนี้ · 01-10-2569 – 05-10-2569"
- ตัวเลือก = `SalesDateRange` (ของเดิม) ใช้ซ้ำตรง ๆ

**ทำไม reuse ได้**
- เป็น client ที่อ่าน/เขียน `?range=&start=&end=` และเก็บ param อื่นของ URL ไว้
- ใช้ชุด `DATE_RANGE_OPTIONS` ตรงกับหน้าการเงินปลายทาง
- default `month` มาจาก `resolveRangeFromParams` ฝั่ง server
- ชิป 44px บนมือถืออยู่ใน `DateRangeControl` แล้ว

**แยกจาก `DashboardRangePills` (วันนี้|เดือนนี้ เก็บ cookie) — 5 ชั้น:**
1. ตัวเลือกใหม่อยู่ใน card-header ของส่วนตัวเอง ส่วน pills เดิมอยู่ที่แถวหัวหน้าและคุมส่วนล่างเท่านั้น
2. หน้าตาต่างกัน: segmented button (`btn btn-sm`) ต่อ pill แคปซูล `bg-default-100`
3. มีบรรทัดช่วงที่ resolve แล้วกำกับในส่วนใหม่
4. เพิ่ม prop `ariaLabel?: string` ใน `DateRangeControl`/`SalesDateRange` (default "ช่วงเวลา" ไม่กระทบหน้าอื่น) ส่วนนี้ส่ง "ช่วงเวลาของภาพรวมทุกธุรกิจ"
5. ไม่แตะ cookie `seller_dashboard_range`

### B. แถบสรุป 3 ตัวเลข (อยู่ในการ์ดเดียวกับหัว+กราฟ)
- โครงมาจาก summary strip ของ theme `SalesReport` (`bg-light/25 border-b border-default-300 border-dashed`)
- กำไรสุทธิรวม = `text-xl font-semibold` + ป้ายความครบ → พระเอก
- ยอดขายรวม/ออเดอร์รวม = `text-lg font-medium`
- มือถือ: กำไรขึ้นก่อนเต็มแถว (`order-first col-span-2 md:col-span-1 md:order-none`)
- สีค่ากำไรผ่าน `profitDisplay` (`src/lib/format-money.ts`): ปกติ `text-default-800` · ข้อมูลไม่ครบ `text-warning-ink` · ขาดทุน `text-danger-ink` + ป้าย "ขาดทุนสุทธิรวม"
- เงิน = `formatBaht` เท่านั้น
- ห้ามใช้ `CountUp`: เลขวิ่งขัด "ไม่มี choreography" และ `decimals={2}` ทำให้ ฿1,234.00 ไม่เท่าการ์ด ฿1,234
- **แถบสรุปคือที่เดียวที่แสดงผลรวม** (ข้อแก้ Controller #2)
- หมายเหตุฐานค่าส่ง (เฉพาะเมื่อมีร้านต่างประเภทตาม `usesServiceFinanceRules`): บรรทัด `text-xs text-default-700` + icon `info-circle`

### C. กราฟเส้น 2 เส้น (ฉบับแก้)
- Base = `widgets/charts/components/SalesReport.tsx` ผ่าน `ApexChart` wrapper โครงเดียวกับ `dashboard/components/SalesReport.tsx`
- เส้น: ยอดขายรวม + กำไรสุทธิรวม รายวันของเดือนที่ช่วงสิ้นสุด
- สี: ยอดขาย `getColor('chart-primary')` · กำไร `getColor('default-700')` (ไม่ใช้ `chart-secondary` ม่วง และ `chart-alpha` เขียวอมฟ้า)
- รูปแบบ: เส้นล้วน ตัด area gradient · `stroke.width [3,2]` · `curve: 'smooth'` · `grid.strokeDashArray: 4` · `height 260` · ปิด toolbar/zoom/selection
- แกน x = `formatDayMonth` · y = `formatBahtCompact` · tooltip = `formatBaht` + `formatDate` (ชุดเดียวกับ `sales/components/SalesChart.tsx`)
- **legend (ข้อแก้ Controller #2):** ซ่อน legend ของ Apex ใช้แถบ **จุดสี + ชื่อเส้นเท่านั้น ไม่มีตัวเลขยอดรวม**
  - จุดสี = `<span class="size-2 rounded-full bg-primary">` และ `bg-default-700` (ไม่ใช่ glyph ตัวอักษร)
  - ตัวอักษร `text-xs text-default-700`
  - เหตุผล: ผลรวมของกราฟอาจไม่เท่ายอดบนการ์ดสำหรับร้านขายของ (SDS TD-003) ตัวเลขรวมมีที่แถบสรุปที่เดียว
- บรรทัดใต้กราฟเสมอ: "กราฟใช้ดูแนวโน้ม ตัวเลขรวมดูที่แถบสรุปด้านบน"
- เมื่อช่วงที่เลือกไม่ใช่ "เดือนนี้" เพิ่มอีกบรรทัด: "กราฟแสดงทั้งเดือน {เดือน ปี พ.ศ.} ไม่ได้ตามช่วงที่เลือก"
- ห่อกราฟด้วย `role="img"` + `aria-label`

### D. การ์ดรายร้าน (ฉบับแก้)
- เรียงตามยอดขายมาก→น้อย (เท่ากันเรียงตามชื่อ)
- ทั้งการ์ดเป็น `<button type="button">` เพราะเป็น action สลับบริบท
- โครงภายใน (ไม่ซ้อนการ์ด):
  1. แถวหัว: `AccountAvatar` (`kind="business"`, `size-9`) + ชื่อร้าน (`h3`, `text-base font-semibold truncate`) + icon `chevron-right`
  2. สองตัวเลขคู่กัน (`grid-cols-2 gap-base`): ยอดขาย | กำไรสุทธิ ทั้งคู่ `text-lg font-semibold tabular-nums` ป้ายหัว `text-sm text-default-700`
  3. บรรทัดรอง `text-sm text-default-700`: อัตรากำไร · จำนวน + ศัพท์ตามประเภทร้าน (`byVertical(t.vocab.orderNoun, vertical)`)
  4. ป้ายข้อมูลไม่ครบ (ถ้ามี) `badge bg-warning/15 text-warning-ink` + icon `alert-triangle`
  5. แถวท้าย: **"ดูการเงินร้านนี้"** `text-sm text-primary` + icon `chevron-right` (ข้อความเป็นกลาง ใช้เหมือนกันทุกประเภทร้าน)
- อัตรากำไร: ยอดขาย 0 → "—" · ข้อมูลไม่ครบ → "ไม่เกิน 16.4%" (Open question #1)
- hover/focus: `transition-shadow hover:shadow-lg` + `focus-visible:ring-2 focus-visible:ring-primary` ใช้ `.card h-full`
- ป้ายข้อมูลไม่ครบ: ขาดต้นทุน → "ยังไม่ตั้ง{costNoun}" · ขาดค่าใช้จ่าย → "ยังไม่บันทึกค่าใช้จ่าย" · ขาดทั้งคู่ → 2 ป้าย (`flex-wrap gap-1.5`) · ตัวเลขกำไรยังแสดงเสมอ

### E. การสลับร้านและปลายทางของลิงก์ (ฉบับแก้ — ข้อแก้ Controller #3)
- ใช้ `useShopSwitcher({ landingPath })` + `ShopSwitchOverlay` mount **ครั้งเดียวต่อกริด**
- **ปลายทางตามประเภทร้าน** (ตัดสินด้วย `usesServiceFinanceRules(vertical)` ตัวเดียวกับที่ใช้กำหนดฐานค่าส่ง):
  - ร้านบริการ → `/sales?tab=pnl&range=<preset>` (+ `&start=&end=` เมื่อ custom)
  - ร้านอื่น → `/expenses?range=<preset>` (+ `&start=&end=`)
- path สั้น ไม่มี `/seller` prefix ตาม page-sourcing
- คำนวณ `landingPath` ฝั่ง server แล้วส่งใน plain object ของแต่ละร้าน (client ไม่ต้องรู้กติกา)
- เรียก `switchShop(shopId, { name, kind: 'business', logo })`
- ต้องให้ developer ยืนยันว่า `/expenses` อ่าน `?range=&start=&end=` ชุดเดียวกัน (คอมเมนต์ใน `date-range.ts` ระบุว่าทุกแท็บอ่าน `?range=`) และตัวเลขที่ปลายทางตรงกับการ์ด (กำไรสุทธิบนแท็บ/หน้านั้น)
- 403/ล้ม: hook แสดง `pacesToast.error` เอง

---

## Theme Source Mapping  ← prerequisite ของ developer

| Section | Theme file path | Component | หมายเหตุ adapt |
|---|---|---|---|
| การ์ดสรุป (หัว + แถบ 3 ตัวเลข + กราฟ) | `theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx` | `.card h-full` > `card-header` + `bg-light/25 border-b border-dashed` strip + chart body | ตัด tab Today/Monthly/Annual · ตัด `CountUp` · ตัดไอคอน `wallet`/`basket` สีเขียว · ตัด area gradient · ตัด growth rate · `text-default-400` → `text-default-700` |
| ต้นแบบที่ adapt แล้วใน repo | `src/app/(paces)/seller/(dashboard)/dashboard/components/SalesReport.tsx` | ตัวเดิม | ใช้เป็นต้นแบบ markup ของ strip + `ApexChart` |
| กราฟเส้น | `theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx` (`getSalesReportChart`) | `ApexChart` wrapper | HR10: `getColor('chart-primary')` + `getColor('default-700')` · แกน/tooltip ยึด `sales/components/SalesChart.tsx` · legend = จุดสี+ชื่อเส้น (ดู `LegendItem` แต่ตัดตัวเลข) |
| ตัวเลือกช่วงเวลา | `theme/paces/Admin/TS/src/app/(admin)/ui/button-group` ผ่าน `_shared/DateRangeControl.tsx` | `SalesDateRange` → `DateRangeControl` | เพิ่ม prop `ariaLabel` อย่างเดียว |
| การ์ดรายร้าน | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products/components/ProductStats.tsx` (ผ่าน `_shared/PacesStatCard.tsx`) | `.card` > `.card-body` | ไม่ใช้ `PacesStatCard` ตรง ๆ (ห่อ `<button>` ไม่ได้) ยืม class · ปุ่มทั้งใบ |
| ป้ายข้อมูลไม่ครบ | `theme/paces/Admin/TS/src/app/(admin)/ui/badges` ผ่านรูปแบบใน `sales/components/IncompleteDataNotice.tsx` | `badge bg-warning/15 text-warning-ink` + `alert-triangle` | ข้อความสั้น ไม่ใส่ลิงก์ |
| โลโก้ร้าน | shared component | `src/components/AccountAvatar.tsx` | ไม่ประดิษฐ์ใหม่ |
| Empty กราฟ | — | `_shared/SellerEmptyState.tsx` (`compact`) | `chart-bar-off` |
| Error ทั้งส่วน | `theme/paces/Admin/TS/src/app/(admin)/ui/placeholders` ผ่าน `_shared/SellerErrorState.tsx` | `SellerErrorState compact` | ส่ง title/message |
| Loading | `theme/paces/Admin/TS/src/app/(admin)/ui/placeholders/page.tsx` ผ่าน `_shared/SellerCardSkeleton.tsx` | `PulseBar` + `.card` | mirror โครงจริง |
| ปุ่มลองใหม่ในการ์ดร้านที่ล้ม | `theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx` | `btn btn-sm border border-default-300` | `router.refresh()` |
| Toast สลับร้านไม่สำเร็จ | — | `pacesToast` (อยู่ใน `useShopSwitcher`) | ไม่ต้องทำเพิ่ม |
| dropdown / select / modal | — | **ไม่มีในงานนี้** | ไม่ใช้ hs-dropdown, form-select, Swal |

**Icon (tabler ผ่าน wrapper `Icon`)** — ชื่อที่ใช้ทั้งหมด (ทุกตัวมีอยู่ในโค้ดแล้ว):

| ตำแหน่ง | icon |
|---|---|
| ป้ายข้อมูลไม่ครบ (รวม + การ์ดร้าน) | `alert-triangle` |
| หมายเหตุฐานค่าส่ง | `info-circle` |
| ลูกศรการ์ดร้าน (หัว + ท้าย) | `chevron-right` |
| ปุ่ม "กำหนดเอง" บนมือถือ | `calendar-event` (ใน `DateRangeControl` อยู่แล้ว) |
| fallback โลโก้ร้าน | `building-store` (ใน `AccountAvatar` อยู่แล้ว) |
| กราฟว่าง | `chart-bar-off` |
| กำลังโหลดช่วงเวลา | `loader-2` (ใน `DateRangeControl` อยู่แล้ว) |

ไม่ใช้ glyph/emoji (สัญลักษณ์เตือน/ข้อมูล/ปฏิทิน/จุดกลม) ที่ใดในงานจริง จุดสี legend เป็น `<span>` ที่มีพื้นสี ไม่ใช่ตัวอักษร

---

## รายการ component ที่จะสร้าง / reuse

| ชื่อ | สถานะ | ชนิด | หน้าที่ |
|---|---|---|---|
| `PortfolioOverview` (async RSC) | สร้างใหม่ | server | กั้นเงื่อนไข FR-001/002 ที่ชั้น query · คำนวณทีละร้านขนานกัน · `Suspense` (key = สตริงช่วงเวลา) · ไม่เข้าเงื่อนไข `return null` |
| `PortfolioSummaryCard` | สร้างใหม่ | server + chart child | หัว + แถบ 3 ตัวเลข + หมายเหตุ + กราฟ |
| `PortfolioChart` | สร้างใหม่ | client | `ApexChart` 2 เส้น (HR10) + legend จุดสี+ชื่อ |
| `PortfolioShopGrid` + `PortfolioShopCard` | สร้างใหม่ | client | `useShopSwitcher` + overlay ครั้งเดียว · การ์ดเป็น `<button>` |
| `PortfolioShopCardError` | สร้างใหม่ | client | การ์ดร้านที่คำนวณล้ม |
| `PortfolioSkeleton` | สร้างใหม่ | server | fallback ของ Suspense |
| `SalesDateRange` / `DateRangeControl` | reuse | client | เพิ่ม prop `ariaLabel` |
| `AccountAvatar`, `SellerEmptyState`, `SellerErrorState`, `useShopSwitcher`, `ShopSwitchOverlay`, `formatBaht`/`formatBahtCompact`/`profitDisplay`/`formatDate`/`formatDayMonth`, `byVertical`, `usesServiceFinanceRules` | reuse | — | ตามที่ระบุ |

**รูปข้อมูลที่ส่งเข้า client** (plain object, serializable, เฉพาะร้านที่ผ่านด่าน OWNER+จ่ายแล้วจาก query):

```
shop: { shopId, shopName, logo, vertical, orderNoun(แปลแล้ว), costNoun,
        sales, profit, orderCount,
        missingCost, missingExpense,
        landingPath,                 // คำนวณฝั่ง server ตามประเภทร้าน + ช่วงเวลา
        failed?: true }
```

---

## User flow
1. เปิด `/dashboard` ในบริบท Personal ที่มีร้านเข้าเงื่อนไข ≥1 → เห็นการ์ดสรุป (ช่วง "เดือนนี้") + การ์ดรายร้านก่อน Dashboard เดิม
2. กดชิป "7 วัน" → URL เป็น `?range=7d` → การ์ดสรุป+การ์ดร้านขึ้น skeleton แล้วเปลี่ยนเป็นตัวเลขใหม่ (ส่วนล่างของ Dashboard ไม่เปลี่ยน)
3. กด "กำหนดเอง" → ปฏิทิน Flatpickr พ.ศ. → เลือกครบ 2 วัน → URL มี `start`/`end`
4. กดการ์ดร้านทำเล็บ (ร้านบริการ) → overlay ของ `ShopSwitchOverlay` → เปิด `/sales?tab=pnl&range=7d`
5. กดการ์ดร้านเสื้อผ้า (ร้านขายของ) → overlay → เปิด `/expenses?range=7d`
6. ตัวเลขที่ปลายทางตรงกับการ์ด
7. สลับร้านไม่ผ่าน (403/เน็ตหลุด) → toast error จาก hook · อยู่หน้าเดิม กดใหม่ได้

---

## Content outline (ภาษาไทย ทั้งหมด)

| ตำแหน่ง | ข้อความ |
|---|---|
| หัวส่วน | ภาพรวมทุกธุรกิจ |
| บรรทัดช่วงเวลา | `{ป้ายช่วง} · {dd-mm-yyyy พ.ศ.} – {dd-mm-yyyy พ.ศ.}` เช่น "เดือนนี้ · 01-10-2569 – 05-10-2569" |
| aria-label ตัวเลือกช่วง | ช่วงเวลาของภาพรวมทุกธุรกิจ |
| หัวตัวเลข | กำไรสุทธิรวม (ขาดทุน → "ขาดทุนสุทธิรวม") · ยอดขายรวม · ออเดอร์รวม |
| ใต้ออเดอร์รวม | นับเฉพาะที่เป็นยอดขาย |
| ป้ายข้อมูลไม่ครบ (รวม) | ข้อมูลยังไม่ครบ |
| title ของป้ายรวม | มีร้านที่ยังไม่ตั้งราคาทุนหรือยังไม่บันทึกค่าใช้จ่าย กำไรจริงจะน้อยกว่าตัวเลขนี้ |
| หมายเหตุฐานค่าส่ง | ร้านบริการหักค่าส่งเป็นค่าใช้จ่ายแล้ว ส่วนร้านขายของไม่หัก ใช้ดูภาพรวมได้ แต่เทียบกำไรข้ามร้านแบบเป๊ะ ๆ ไม่ได้ |
| legend (ชื่อเส้นเท่านั้น) | ยอดขายรวม · กำไรสุทธิรวม |
| หมายเหตุใต้กราฟ (เสมอ) | กราฟใช้ดูแนวโน้ม ตัวเลขรวมดูที่แถบสรุปด้านบน |
| หมายเหตุกราฟ (เมื่อช่วง ≠ เดือนนี้) | กราฟแสดงทั้งเดือน {เดือน ปี พ.ศ.} ไม่ได้ตามช่วงที่เลือก |
| aria-label กราฟ | กราฟรายวันของยอดขายรวมและกำไรสุทธิรวม เดือน {เดือน ปี พ.ศ.} ตัวเลขรวมอยู่ในสรุปด้านบน |
| หัวรายร้าน | แยกรายร้าน · ท้ายแถว: เรียงตามยอดขาย |
| การ์ดร้าน | ยอดขาย · กำไรสุทธิ (ขาดทุน → "ขาดทุนสุทธิ") · อัตรากำไร {n.n}% · "ไม่เกิน {n.n}%" เมื่อข้อมูลไม่ครบ · "—" เมื่อยอดขาย 0 · {n} {orderNoun} |
| ป้ายการ์ด | ยังไม่ตั้ง{costNoun} · ยังไม่บันทึกค่าใช้จ่าย |
| ท้ายการ์ด (ทุกประเภทร้าน) | ดูการเงินร้านนี้ |
| Empty กราฟ — title | ยังไม่มียอดขายในช่วงนี้ |
| Empty กราฟ — desc | ลองเลือกช่วงเวลาที่กว้างขึ้น |
| การ์ดร้านล้ม | โหลดตัวเลขร้านนี้ไม่สำเร็จ · ปุ่ม "ลองใหม่" |
| ป้ายยอดรวมไม่ครบ (เมื่อมีร้านล้ม) | ยอดรวมยังไม่รวมร้าน {ชื่อ} |
| Error ทั้งส่วน — title | โหลดภาพรวมทุกธุรกิจไม่สำเร็จ |
| Error ทั้งส่วน — message | ส่วนอื่นของหน้านี้ใช้งานได้ตามปกติ ลองโหลดใหม่อีกครั้ง |
| ปุ่มลองใหม่ (ทั้งส่วน) | ลองใหม่ (retryHref = `/dashboard` + query ปัจจุบัน) |
| กำลังโหลด (sr-only) | กำลังโหลด |

น้ำเสียง: บอกเหตุ+ทางออก ไม่มีรูปประโยคราชการ ไม่ไฮป์ ไม่มี "ไม่สามารถ…ได้"

---

## Edge states ที่ต้องออกแบบ

| สถานะ | พฤติกรรม |
|---|---|
| **ไม่เข้าเงื่อนไข** (ไม่ใช่ Personal / ไม่มีร้าน OWNER+จ่ายแล้ว) | `return null` — ไม่มี empty state ไม่มีช่องว่างเหลือ ไม่มีปุ่มซื้อ (FR-001) |
| **Loading (ครั้งแรก/เปลี่ยนช่วง)** | `Suspense` + key ตามช่วง → `PortfolioSkeleton`: หัว (PulseBar 2 บรรทัด) + แถบ 3 ช่อง + บล็อกกราฟสูง 260 + การ์ดร้านเทียม 2 ใบ · `role="status"` + sr-only "กำลังโหลด" · mirror โครงจริงทั้ง 3 ขนาดจอ |
| **ยอดขาย 0 ทุกร้าน** | แถบสรุป ฿0 · กราฟ → `SellerEmptyState compact` (`chart-bar-off`) · ซ่อน legend · การ์ดร้านยังแสดง อัตรากำไร "—" |
| **ร้านเดียวล้ม** | ร้านนั้นเป็นการ์ดล้ม (ชื่อ+โลโก้+ข้อความ+ลองใหม่ ไม่ใช่ปุ่มสลับร้าน) · ร้านอื่นปกติ · **ยอดรวมไม่รวมร้านที่ล้ม และต้องมีป้ายบอก** |
| **ล้มทั้งส่วน** | `SellerErrorState compact` · Dashboard เดิมไม่กระทบ (6.3) |
| **ติดลบ** | ป้ายเปลี่ยนเป็น "ขาดทุนสุทธิ…" + `text-danger-ink` (ค่าสัมบูรณ์ + ป้าย) |
| **เลขหลักล้าน** | `tabular-nums` · `min-w-0` + ตัดบรรทัดได้ · 1440 การ์ดกว้าง ~590px (xl 2 คอลัมน์) · 3 คอลัมน์เฉพาะ ≥2xl |
| **ชื่อร้านยาว** | `truncate` + `title` (ชุด `min-w-0 flex-1`) |
| **ไม่มีโลโก้/รูปแตก** | `AccountAvatar` fallback `building-store` |
| **ร้านเดียว** | แถวเต็มกว้าง ไม่ใช่กริด 3 คอลัมน์ที่ว่าง 2 ช่อง |
| **ร้านมาก (>6)** | ทดสอบ 8 ร้านที่ 375/768/1440 · ไม่ทำ pagination รอบนี้ |
| **ช่วง custom ผิดรูป** | `resolveRangeFromParams` ตกไป "เดือนนี้" เอง |
| **สลับร้าน 403/ล้ม** | toast จาก `useShopSwitcher` · ปลดปุ่มได้ |
| **กดซ้ำ** | hook กัน (ref) · การ์ด `disabled` ระหว่าง `switching` |

---

## a11y
- `<section aria-labelledby="portfolio-title">` + `h2`; "แยกรายร้าน" เป็น `h3` ชื่อร้านบนการ์ดเป็น `h3` ใต้นั้น
- การ์ดร้านเป็น `<button type="button">` จริง → Enter/Space ได้ · ชื่อมาจากเนื้อหา (ชื่อร้าน + ตัวเลข + "ดูการเงินร้านนี้") ไม่ใส่ `aria-label` ทับ
- focus ring `focus-visible:ring-2 focus-visible:ring-primary` ทุกการ์ด
- tap target: การ์ดทั้งใบ ≫44px · ชิปช่วงเวลา 44px จาก `DateRangeControl`
- contrast: ป้ายหัวตัวเลข `text-default-700` · ข้อความบน `bg-warning/15` ใช้ `text-warning-ink` (6.57:1)
- สถานะไม่ครบสื่อด้วย icon + ข้อความ + สี
- กราฟ `role="img"` + aria-label · ตัวเลขทั้งหมดเป็นข้อความอยู่ในแถบสรุปและการ์ด
- เปลี่ยนช่วงเวลา: เนื้อหา `aria-busy` ระหว่างโหลด · skeleton `role="status"`
- `prefers-reduced-motion`: ไม่มีอนิเมชันตัวเลข `transition-shadow` สั้นและไม่เป็นข้อมูล
- icon ตกแต่งทุกตัวใส่ `aria-hidden="true"`

---

### Impeccable compliance
(เนื้อหาเดิมจากข้อความก่อนหน้ายังใช้ได้ ปรับเฉพาะจุดนี้)

- **Mode: Operate** — ผู้ขายเปิดเพื่อดูตัวเลขแล้วตัดสินใจบนคอนโซล Paces
- ข้อความลิงก์การ์ดเปลี่ยนเป็น "ดูการเงินร้านนี้" (เป็นกลางข้ามประเภทร้าน — ร้านบริการไป `/sales?tab=pnl` ร้านอื่นไป `/expenses`)
- legend ไม่มีตัวเลขยอดรวม เพราะผลรวมกราฟอาจไม่เท่ายอดการ์ด (SDS TD-003) → ตัวเลขรวมอยู่ที่แถบสรุปที่เดียว
- accent น้ำเงิน (`text-primary` / `bg-primary`) ใช้เฉพาะ: ชิปช่วงเวลาที่เลือก · เส้นยอดขาย · ข้อความ "ดูการเงินร้านนี้" · focus ring · fallback avatar
- ไม่มีสีเขียวในส่วนนี้ (ไม่มีสถานะ "ยืนยันแล้ว") · ข้อมูลไม่ครบ = warning · แดงเฉพาะขาดทุนจริง
- จุดที่ theme ขัด Impeccable: `chart-secondary` ม่วง, area gradient, `CountUp`, `text-default-400`, ไอคอนเขียวใน strip → ตัด/เปลี่ยนทั้งหมด (Impeccable ชนะเรื่องสี/ลำดับชั้น theme ชนะเรื่องโครง markup)
- เสี่ยงโดน critique: ตัวเลือกช่วงเวลาสองชุดในหน้าเดียว (แก้ด้วย 5 ชั้นใน section A) · เส้นกราฟสีเทาเข้มแทนเขียว (ตั้งใจ) · ลำดับ DOM บนมือถือ

### Design decisions + rationale
1. mount ครั้งเดียวเหนือสอง tree — กัน ApexChart ซ้ำ/วัดไม่ได้ในกล่อง `display:none` และกัน query ซ้ำ
2. รวมหัว+ตัวเลขรวม+กราฟเป็นการ์ดใบเดียว (โครง SalesReport ของ theme) — ตัดของซ้ำ และสื่อว่าเป็น "ผลรวม" ส่วนการ์ดรายร้านเป็น "ส่วนประกอบ"
3. การ์ดร้านเป็นปุ่ม ไม่ใช่ลิงก์ — กดแล้วต้องสลับ session (POST) ก่อนไปหน้าอื่น
4. ไม่ใช้ `PacesStatCard` ในการ์ดร้าน — ห่อ `<button>` ไม่ได้
5. ผลรวมแสดงที่แถบสรุปที่เดียว — กราฟและ legend ไม่แสดงยอดรวม
6. ปลายทางแยกตามประเภทร้าน แต่ข้อความลิงก์เป็นคำเดียว ผู้ใช้ไม่ต้องรู้ว่าไปหน้าไหน
7. กริด 2 คอลัมน์ที่ xl / 3 ที่ 2xl — การ์ดรับเลขเงินหลักล้านพร้อมสตางค์ได้โดยไม่ล้น
8. ซ่อน (return null) ไม่ใช่ empty state เมื่อไม่เข้าเงื่อนไข (BRD FR-001)

### Open questions (ให้ Controller / developer)
1. **อัตรากำไรเมื่อข้อมูลไม่ครบ** — BRD ให้แสดง % แต่ precedent 00067 ห้ามแสดง % เมื่อ capped · เสนอ "ไม่เกิน 16.4%" ขอยืนยัน
2. **ป้ายหัวกำไรรวม** — เสนอคง "กำไรสุทธิรวม" + ป้ายข้อมูลยังไม่ครบ · ทางเลือกคือเติม "ไม่เกิน" ที่หัวตามธรรมเนียม 00067
3. **กำไรสุทธิรายวันในกราฟ** — ยังไม่ยืนยันว่า `getSalesSeries` ให้กำไรสุทธิรายวันได้ · ถ้าไม่ได้ห้ามสร้างสูตรใหม่ (HR16) ต้องตัดสินก่อน build
4. **ความสูงบนมือถือ** — ส่วนนี้ดัน CommandCenter ลง ~1 หน้าจอ · (ก) คงตาม BRD หรือ (ข) พับกราฟบนมือถือ · spec ใช้ (ก)
5. **ปลายทางร้านที่ไม่ใช่บริการ = `/expenses`** — ต้องยืนยันว่ารับ `?range=&start=&end=` และตัวเลขกำไรสุทธิตรงกับการ์ด · และยืนยัน predicate ว่าใช้ `usesServiceFinanceRules(vertical)` ไม่ใช่ `vertical === 'SERVICE_QUEUE'` (LODGING)
6. **ไอคอน `refresh`** ไม่ได้ใช้ (ปุ่มลองใหม่เป็นข้อความล้วน) ไม่ต้องเช็ค gallery
7. **import `SalesDateRange` ข้ามโฟลเดอร์** (`sales/components/` → `dashboard/`) — เสนอ import ตรงก่อน
8. **ผลรวมเมื่อมีร้านล้ม** — เสนอไม่รวมร้านนั้น+ติดป้ายบอก
9. **`app-store-surfaces`** (FR-009) — ไม่มีปุ่มซื้อ แต่ Controller ต้องตรวจบน iOS shell

### Anti-slop self-check
1. **เฉพาะ Deep ไหม** — ใช่: ฐานกำไรต่างกันตามประเภทร้านบริการ/ขายของ · ศัพท์จำนวนตาม vertical · ป้ายกำไรไม่ครบตามกติกา Verified-Means-Green · กดการ์ดสลับ session ร้านด้วยกลไกของ Deep และพาไปปลายทางตามประเภทร้าน
2. **เด่นสุด 1 อย่าง** — กำไรสุทธิรวม (`text-xl font-semibold` + ขึ้นก่อนบนมือถือ + ป้ายความครบ) ที่เหลือ `text-lg font-medium` · การ์ดรายร้านเป็นรายการเปรียบเทียบจึงน้ำหนักเท่ากันโดยตั้งใจ
3. **ตัดของซ้ำ/คงที่** — รวมการ์ดสถิติ 3 ใบเป็นแถบเดียว · ตัด growth rate · ตัดไอคอนตกแต่งเขียว · ตัด tab ตายของ theme · ตัดยอดรวมออกจาก legend (ซ้ำกับแถบสรุป) · ร้านเดียวไม่ยัดกริด 3 ช่อง
4. **ครบทุก state** — ไม่เข้าเงื่อนไข / loading / ยอด 0 / ร้านเดียวล้ม / ทั้งส่วนล้ม / ติดลบ / เลขล้านพร้อมสตางค์ / ชื่อยาว / ไม่มีโลโก้ / ร้านเดียว / ร้านมาก
5. **copy ทำได้จริง** — "ดูการเงินร้านนี้" พาไปหน้าการเงินจริงของร้านนั้น (ร้านบริการ→กำไรขาดทุน ร้านอื่น→ค่าใช้จ่าย) · error บอกว่าส่วนอื่นใช้ได้และมีปุ่มลองใหม่จริง · หมายเหตุกราฟบอกตรง ๆ ว่ากราฟไม่ใช่ตัวเลขรวม
6. **คำเดียวกัน = ของเดียวกัน** — "กำไรสุทธิ" ตรงกับหน้าการเงิน · "ข้อมูลยังไม่ครบ/ยังไม่ตั้งต้นทุน/ยังไม่บันทึกค่าใช้จ่าย" ตรงกับ `DataCompleteness` · "ออเดอร์รวม" (คำกลางข้ามประเภทร้าน) ต่างจากศัพท์จำนวนบนการ์ดโดยตั้งใจ
7. **สีสื่อถูกไหม** — ไม่มีเขียว · ไม่ครบ = warning ทุกที่ (ป้ายรวม ป้ายการ์ด สีค่ากำไร) · แดงเฉพาะขาดทุน · กราฟไม่ใช้ม่วง/เขียว
8. **แตะได้บนมือถือ** — การ์ดทั้งใบเป็นปุ่ม ≫44px · ชิป 44px · ป้ายไม่ครบแสดงบนจอ ไม่พึ่ง tooltip
9. **จอ 1440** — แถบสรุป 3 คอลัมน์เต็มกว้าง · กราฟเต็มกว้าง · การ์ดร้าน 2 คอลัมน์ (3 ที่ ≥1536) · ร้านเดียวใช้แถวเต็มกว้าง ไม่มีคอลัมน์ว่างเปล่า

---


---

## มติ Controller ต่อ Open questions (2026-10-05)

| # | มติ | หลักฐาน |
|---|-----|--------|
| 1 | % margin เมื่อข้อมูลไม่ครบ แสดง "ไม่เกิน x%" ตาม precedent 00067 | `finance-tabs.ts` DataCompleteness |
| 2 | คงหัว "กำไรสุทธิรวม" + ป้ายข้อมูลยังไม่ครบ | — |
| 3 | ได้ — `getSalesSeries(..., includeFinance=true)` คืน `netProfitValues` รายวันอยู่แล้ว ไม่มีสูตรใหม่ | `dashboard.service.ts` `SalesSeries.netProfitValues` |
| 4 | (ก) คงตาม BRD | — |
| 5 | `/expenses` รับ `?range=&start=&end=` และเรียก `getPnlReport` ตัวเดียวกัน · predicate = `usesServiceFinanceRules(vertical)` (เท่ากับ `resolveShopVertical(...) === 'SERVICE_QUEUE'` ที่ `/sales` ใช้เปิดแท็บ) | `expenses/page.tsx:94-120` · `sales/page.tsx:131` |
| 6 | ตัดตามเสนอ | — |
| 7 | import ตรงจาก `sales/components/` | — |
| 8 | ไม่รวมร้านที่ล้ม + ติดป้าย (ตรง SRS TFR-004) | — |
| 9 | Controller ตรวจด้วย skill `app-store-surfaces` ก่อน mark complete | — |

ชื่อ component: ใช้ชื่อ `Portfolio*` ของเอกสารนี้ แทนชื่อ `BusinessOverviewSection`/`ShopOverviewCard` ใน [[SDS]] §3 (หน้าที่เหมือนกัน)

---

# ส่วนแก้ไข v1.1 (2026-10-05 · safepay-ux gate HR8) — ชนะเนื้อหาเดิมเมื่อขัดกัน

## ภาพรวมทุกธุรกิจ v1.1 (`/seller/dashboard`, บริบท Personal)

**Impeccable ที่อ่านแล้ว:** `DESIGN.md`, `design.json`, `shape.md`, `operate.md`, `frontend-design` และ `SalesChartSheet.tsx` ในช่วงบรรทัด 1–612 ส่วนที่เหลือ (613–1133) ยังไม่ได้เปิด จึงยังไม่ได้ยืนยัน JSX หัวชีตและตารางของไฟล์นั้น ช่วงที่ยังไม่ได้ยืนยันมี header/back button, ปุ่ม ‹ ›, segmented ควบคุมรายวัน/รายเดือน และ error+retry ให้ Developer เปิดอ่านเองก่อน copy

### Wireframe
```
375 (PortfolioSheet เต็มจอ)      1440 (การ์ดเดียว ไม่แบ่ง 70/30)
[←] ยอดขายทุกธุรกิจ              ภาพรวมทุกธุรกิจ   [รายวัน|รายเดือน] ‹ ตุลาคม 2569 ›
[รายวัน|รายเดือน] ‹ ต.ค. 69 ›   ยอดขายรวม 128,400   กำไรสุทธิรวม 41,250 [ข้อมูลไม่ครบ]
ยอดขายรวม 128,400                ┌ กราฟแท่งซ้อนต่อวัน (กว้าง ~60%) ┐ ┌ ตารางเทียบ ┐
กำไรสุทธิรวม 41,250 [ไม่ครบ]     └──────────────────────────┘ └ (~40%)   ┘
หมายเหตุฐานค่าส่ง (ถ้าผสม)       คำอธิบายที่มาของตัวเลข
[กราฟแท่งซ้อน h≈220]
ร้าน A            62,000 · 48%
 กำไรสุทธิ 20,100
ส่วนตัว · ไม่นับในยอดรวม
คำอธิบายที่มาของตัวเลข
```
พระเอกของหน้าคือยอดขายรวม ตัวใหญ่สุด กำไรสุทธิรองลงมา กราฟกับตารางอยู่ใต้ตัวเลขสองตัวนี้

### Theme Source Mapping
| Section | Base | หมายเหตุ |
|---|---|---|
| การ์ดและตาราง | `theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalOrder.tsx` (`.card` + stacked bar) และ `.table` ตามที่ SalesChartSheet ใช้อยู่ | ใช้ `.card` แบบเดียวกับการ์ดในหน้าเดิม |
| กราฟแท่งซ้อน | `theme/paces/Admin/TS/src/app/(admin)/charts/apex/column/components/ColumnChart.tsx` (stacked) + `widgets/charts/components/FinancialOverview.tsx` | ผ่าน `ApexChart` wrapper (HR10), ไม่ import `react-apexcharts` ตรง |
| ตัวควบคุมช่วงเวลา, ‹ ›, shell ชีต, error+ลองใหม่ | `SalesChartSheet.tsx` | copy จากไฟล์นี้ + `useLockBodyScroll` |
| ปิดชีตเมื่อจอ ≥1024 | `SalesChartSheet.tsx` บรรทัด 390–397 | ต้องคัดลอกมาด้วยเพื่อกัน scroll ค้างตอนหมุน iPad |

### รายการ component
- `PortfolioPanel` (client) ใช้ทั้ง desktop และในชีต
- `PortfolioSheet` ห่อ `PortfolioPanel` ด้วย shell ของ SalesChartSheet
- ลบ `PortfolioSummaryCard`, `PortfolioChart`, `PortfolioShopGrid` ออก
- ตารางแถวร้านเป็น `<button>` ทั้งแถว

### Icon (tabler)
- `tabler:chevron-left` และ `tabler:chevron-right` สำหรับลูกศรเลื่อนช่วง
- `tabler:arrow-left` สำหรับปุ่มกลับ
- `tabler:info-circle` ข้างป้ายข้อมูลไม่ครบ
- `tabler:alert-triangle` ข้างร้านที่ดึงข้อมูลไม่ได้
- `tabler:chevron-right` ท้ายแถวที่กดได้

### สีชุดกราฟ
- ใช้เฉพาะ `getColor('chart-primary' | 'chart-dark' | 'chart-delta' | 'chart-zeta')` ตามลำดับร้านที่ยอดมากไปน้อย
- "อื่น ๆ" ใช้ `default-400`
- หลีกเลี่ยง `chart-alpha` (เขียว): สีนี้หมายถึงยืนยันแล้ว จะใช้เป็นสีร้านไม่ได้
- หลีกเลี่ยง `chart-beta` (แดง) และ `chart-gamma` (เหลือง) เพราะเป็นสี error/warning
- หลีกเลี่ยง `chart-secondary` เพราะเป็นม่วงในบาง skin
- จุดสีในตารางต้องตรงกับสีแท่งทุกร้าน
- ใส่ "ส่วนตัว" ในกราฟด้วยสีไหนต้องให้ Controller ตัดสิน (ดู Open questions)

### ข้อความ UI
- หัวชีต: "ยอดขายทุกธุรกิจ"
- ตัวควบคุมช่วงเวลา: "รายวัน" / "รายเดือน"
- ป้ายช่วงเวลา: "ตุลาคม 2569" / "ปี 2569"
- ป้ายตัวเลขใหญ่: "ยอดขายรวม" / "กำไรสุทธิรวม"
- ป้ายข้อมูลไม่ครบ: "ต้นทุนบางรายการยังไม่ครบ"
- หัวคอลัมน์ตาราง: "ธุรกิจ" · "ยอดขาย" · "กำไรสุทธิ" · "% ของยอดรวม"
- หมายเหตุฐานค่าส่งเมื่อร้านผสม (ต้องสอดคล้องกับ SDS): "ร้านที่ไม่ใช่บริการนับค่าส่งในกำไร ร้านบริการไม่มีค่าส่ง"
- ป้าย Personal: "ส่วนตัว · ไม่นับในยอดรวม"
- คำอธิบายใต้ตาราง: "ยอดขาย = ยืนยันแล้ว + รอยืนยัน · กำไรสุทธิ = ตามหน้าการเงินของร้าน"
- กราฟอื่น ๆ: "อื่น ๆ (N ร้าน)"
- aria ของกราฟ: "กราฟแท่งซ้อนยอดขายแยกตามธุรกิจ" พร้อมสรุปตัวเลขใน `aria-label`
- aria ของแถว: "เปิดร้าน {ชื่อ}"
- empty: "ช่วงนี้ยังไม่มียอดขาย — ลองเลื่อนไปช่วงก่อนหน้า"
- error ทั้งหมด: "โหลดข้อมูลไม่สำเร็จ ลองอีกครั้ง" พร้อมปุ่ม "ลองใหม่"
- ร้านล้มบางร้าน: แถวนั้นแสดง "ดึงข้อมูลร้านนี้ไม่ได้ · ลองใหม่" โดยยอดรวมเป็นเฉพาะร้านที่ดึงได้ พร้อมบรรทัด "ยอดรวมนี้ยังไม่รวม {n} ร้าน"

### Layout ตารางบนจอ 375 (ไม่มี scroll แนวนอน)
แต่ละร้านเป็นแถวเดียว กด/แตะได้ทั้งแถว ความสูง ≥44px แบ่ง 2 บรรทัด:
- บรรทัด 1: จุดสี · ชื่อร้าน (`truncate` ใน flex ครบชุด ตาม flex-header-truncation) · ยอดขาย · `%`
- บรรทัด 2: "กำไรสุทธิ" ตามด้วยตัวเลข ชิดซ้ายใต้ชื่อร้าน

บน desktop (≥ md) ใช้ `<table>` จริง 4 คอลัมน์ ตัวเลขชิดขวา ชื่อร้านชิดซ้าย

### States
- **loading ระหว่างเลื่อนช่วง:** คงตัวเลขเดิมไว้ ลด opacity และมี skeleton บางส่วน ห้ามกระพริบเป็นหน้าว่าง
- **error ทั้งก้อน:** แสดง error + "ลองใหม่" ตามแบบ SalesChartSheet
- **ร้านล้มบางร้าน:** ตามข้อความด้านบน
- **ยอดเป็น 0:** แสดง empty state ด้วย `SellerEmptyState`
- **ร้านเกิน 5:** กราฟรวมเป็น "อื่น ๆ" ตารางแสดงครบทุกร้าน
- **ชื่อร้านยาว:** `truncate` + `title`
- **ตัวเลขหลักล้าน:** ใช้ `formatNumberNoSymbol` เหมือนเดิม

### Impeccable compliance
- **Mode:** Operate (ตัวเลขการเงินและตารางเทียบสำหรับคนกำลังทำงาน)
- **One Voice:** ใช้ `bg-primary` (น้ำเงิน) เฉพาะ segmented ที่เลือกอยู่ และจุดสีร้านแรก ไม่มีม่วง
- **Verified-Means-Green:** เขียวไม่ถูกใช้เป็นสีร้านในกราฟ ป้ายข้อมูลไม่ครบใช้ warning ส่วนค่า 0 ใช้ neutral
- **Sentence-case, ink-tinted shadow, Anuphan:** ใช้ตามระบบเดิมของ Paces ไม่เพิ่ม gradient หรือ arbitrary value
- **จุดที่ theme ขัดกับ Impeccable:** ธีม Paces ให้ chart-secondary เป็นม่วงในบาง skin จึงไม่ใช้สีนั้นกับร้านใด

### Anti-slop self-check
1. **เฉพาะ Deep:** มีป้าย "ส่วนตัว · ไม่นับในยอดรวม" และหมายเหตุฐานค่าส่งผสมร้านขายของกับร้านบริการ ซึ่งสินค้าอื่นใช้ไม่ได้
2. **พระเอก:** ยอดขายรวมเป็นตัวใหญ่สุด กำไรสุทธิรองลงมา กราฟและตารางถอยเป็นหลักฐานสนับสนุน
3. **ตัดของซ้ำ:** ตัดกริดการ์ดร้านเดิม เพราะข้อมูลซ้ำกับตารางเทียบ
4. **ครบ state:** ตามหัวข้อ States ข้างบน
5. **copy:** error บอกทางออก ("ลองอีกครั้ง"); empty บอกสิ่งที่ทำได้จริง (เลื่อนช่วง ‹ › ซึ่งมีอยู่)
6. **คำเดียวกัน:** "ยอดขาย" และ "กำไรสุทธิ" ใช้ตรงกับ PRD v1.1 ทุกที่
7. **สี:** สีร้านใช้สีกลาง ไม่ใช้เขียว/แดง/เหลือง
8. **มือถือ:** แถวตาราง ≥44px ปุ่ม ‹ › ≥44px ปุ่มกลับอยู่มุมบนซ้ายของชีต
9. **1440:** แบ่งกราฟ ~60% ต่อตาราง ~40% เนื้อหาจริงอยู่ฝั่งกว้างทั้งสองข้าง ไม่มีคอลัมน์ว่าง

### Open questions
- ✔ **ต้องตัดสินก่อน build:** "ส่วนตัว" แสดงในกราฟแท่งซ้อนหรือไม่ มติ Q18/Q23 ระบุไม่นับในยอดรวม — ข้อเสนอคือไม่ใส่ในกราฟ ใส่เฉพาะแถวท้ายตาราง
- ต้นทุนไม่ครบ: ใช้คำ "ต้นทุนบางรายการยังไม่ครบ" ให้ตรงกับ v1.0 ที่ build แล้วหรือไม่ ควรตรวจกับ `PortfolioSummaryCard.tsx` เดิมก่อน
- `SalesChartSheet.tsx` บรรทัด 613–1133 ยังไม่ได้เปิดอ่าน (ดูหมายเหตุต้นรายงาน)

ป้ายถัดไป: `stage:build` · Theme Source: `theme/paces/Admin/TS/src/app/(admin)/charts/apex/column/components/ColumnChart.tsx`
### มติ Controller ต่อ v1.1 (2026-10-05)
| ประเด็น | มติ |
|---|---|
| "ส่วนตัว" ในกราฟ | **ไม่ใส่** — แถวท้ายตารางเท่านั้น (Q23) |
| หมายเหตุฐานค่าส่ง | ข้อความใน spec ข้างบนกลับด้าน — ใช้ข้อความเดิมของ v1.0 (`portfolio-display.ts`): ร้านบริการหักค่าส่งเป็นค่าใช้จ่าย ร้านขายของไม่หัก (`usesServiceFinanceRules` · pnl.service) |
| ป้ายต้นทุน/ค่าใช้จ่ายไม่ครบ | ใช้ข้อความชุดเดิมใน `src/lib/portfolio-display.ts` (บอกได้ว่าขาดต้นทุนหรือค่าใช้จ่าย) |
| ตัวเลขเงิน | ใช้ formatter ชุดเดียวกับ v1.0 (`formatBaht`) ในส่วนรวม · ใน `SalesChartCard` คงของเดิม |
| `SalesChartSheet.tsx` 613–1133 | developer ต้องอ่านเองก่อน copy หัวชีต/‹ ›/segmented/error |
