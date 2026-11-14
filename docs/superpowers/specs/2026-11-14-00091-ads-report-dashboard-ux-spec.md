# UX Spec — 00091 FR-009 เฟส 1: แดชบอร์ดรายงานยอดขายตามโฆษณา (`/reports/ads`)

> ผลิตโดย safepay-ux (HR8 gate) 2026-11-14 · mockup ที่ user อนุมัติ: `2026-11-14-00091-ads-report-charts-mockup.html` + `.md` · BRD FR-009
> เฟส 1 = เฉพาะการ์ดที่มีข้อมูลในฐานแล้ว · **ไม่มี** ค่าโฆษณา/ROAS/ป้าย "ตัวอย่าง"/แบนเนอร์เชื่อมบัญชี (เฟส 2)

## ข้อค้นพบก่อนลงมือ
1. `src/components/table/DataTable.tsx` มีการแก้ค้าง (เพิ่ม `meta.align:'center'` ให้หัวคอลัมน์) — อ่าน `git diff` ก่อนแตะ
2. `DataTable` ไม่มี `<tfoot>` → เพิ่ม prop opt-in `footerRow?: ReactNode` (ท่าเดียวกับ `groupRow`, backward-compatible)
3. ใช้ `reports/_shared/DateRangeControl.tsx` เดิม (มติ 2026-10-01 ห้ามแถบเลื่อนแนวนอนมือถือ) — ไม่ใช้ segmented ของ mockup
4. ห้าม `chart-secondary` (#7b70ef ม่วง) · ห้าม `chart-alpha` (= success เขียว) เป็นสีหมวดข้อมูล · `chart-zeta` = ส้มน้ำตาล

## Layout
Grid ตามธีม `dashboard/analytics/page.tsx` 4 แถว ทุกแถว `gap-base mb-base`, ทุก grid item `min-w-0`
- แถว 1 `xl:grid-cols-3`: ① ② ③
- แถว 2 `xl:grid-cols-4`: ④ (col-span-3) + ⑤
- แถว 3 `xl:grid-cols-12`: ⑥ (col-span-7) + ⑦ (col-span-5)
- แถว 4 `xl:grid-cols-4`: ⑧ (1) + ⑨ (3) — ซ่อน ⑧ → ⑨ `xl:col-span-4`
- Tablet `md` 2 คอลัมน์: ①② คู่ · ③ เต็ม · ④ เต็ม · ⑤⑧ คู่ · ⑥ ⑦ ⑨ เต็ม (⑨ ยังเป็นตาราง)
- Mobile คอลัมน์เดียว `gap-3`; ⑨ เป็นรายการ `divide-y` ในการ์ดเดียว (ห้ามการ์ดซ้อนการ์ด) แถวรวมอยู่บนสุด

## หัวหน้า (`AdReportFilters.tsx` ปรับ)
- ถอด `.card` ที่ห่อ · บรรทัด `{from} – {to} · เทียบกับ {prevFrom} – {prevTo}` (`text-xs text-default-700`) · "วันนี้" = `วันนี้ (ถึงตอนนี้) · เทียบกับเมื่อวานทั้งวัน`
- ช่วงก่อนหน้า = เลื่อนถอยหลังเท่าความยาวช่วง คำนวณฝั่ง server ส่งป้ายมา
- เลือกเพจ (`FilterDropdown`) ซ่อนเมื่อร้านมี ≤1 เพจ · ส่งออก (เดิม) · select/ปุ่ม `min-h-11 lg:min-h-0` · URL เป็นแหล่งความจริงเหมือนเดิม

## การ์ด
**① ยอดขายจากโฆษณา (พระเอก)** — `card-header` + เลข `text-xl font-bold tabular-nums` + DeltaText + บรรทัด `ช่วงก่อนหน้า {฿} · {n} ใบ` + แท่งซ้อนรายวัน [จากโฆษณา, ไม่ได้มาจากโฆษณา] · ช่วงก่อน 0 → `ช่วงก่อนหน้าไม่มียอด จึงเทียบเป็น % ไม่ได้`

**② สัดส่วนยอดขาย** — `95.95%` (`text-lg font-semibold`) `ของยอดขายมาจากโฆษณา` + แถบ 2 ส่วน `h-3` (`role="img"` + aria-label) + 2 คอลัมน์ (%, ฿, N ใบ) + ตาราง 3 คอลัมน์ `ตัวชี้วัด · ช่วงนี้ · เทียบช่วงก่อน` (delta บรรทัดบน, `จาก {ค่าเดิม}` `text-2xs` บรรทัดล่าง) แถว: แชทจากโฆษณา · {noun} · อัตราปิดการขาย (delta เป็น "จุด") · ตารางอยู่ท้าย `mt-auto`

**③ แอดที่ทำยอดสูงสุด** — 5 แถว: อันดับ · `AdThumb size-8` · ชื่อ (truncate+title) · ฿ · % + แถบ `h-1.25 bg-primary` บน `bg-default-100` (aria-hidden) · แถวเป็น `<button>` เปิด `AdOrdersSheet` เดิม · ไม่มีหัวข้อชื่ออันดับ 1 ซ้ำ
- กล่องไฮไลต์ (copy `TotalSubscriber.tsx` กล่อง `border-dashed`): **แอดที่ปิดการขายดีที่สุด** = `closeRatePct` สูงสุด เฉพาะแอดที่ {noun} ≥ 10 **และ** อัตรา ≤ 100% · `AdThumb size-12` + ชื่อ + อัตรา + `นับเฉพาะแอดที่มี{noun}ตั้งแต่ 10 ใบขึ้นไป` · ไม่มีแอดเข้าเกณฑ์ → ไม่วาดกล่อง

**④ ภาพรวมรายวัน** — copy `SessionOverview.tsx` แท็บ 2 ตัว (ยอดขาย · {noun}) ไอคอน+ค่า+delta · `role=tablist/tab/tabpanel`, `aria-selected`, `aria-controls`, roving tabindex ลูกศรซ้าย/ขวา · มือถือ `min-h-11` · กราฟ area: เส้นทึบ=ช่วงนี้ เส้นประ=ช่วงก่อน · สลับแท็บ = เปลี่ยน series ไม่ remount · ตัดปุ่ม Export/Import, CountUp · เฟส 2 เพิ่มแท็บได้

**⑤ สัดส่วนยอดขายตามแอด** — donut 5 อันดับ + "อื่น ๆ" กลางวง `฿adSales` label "ยอดจากโฆษณา" · `{n} แอดที่มียอดในช่วงนี้` · ตาราง 2 คอลัมน์ (จุดสี + `AdThumb size-6` + ชื่อ | สัดส่วน) ไม่มีคอลัมน์ ฿ · ปุ่ม `ดูทุกแอดในตาราง` → anchor `#ad-table` (`scroll-mt`)

**⑥ ยอดขายจากโฆษณาตามจังหวัด** — ประโยคใต้หัว: `ยอดขายจากโฆษณาแยกตามจังหวัดที่อยู่จัดส่ง ใบที่ไม่มีที่อยู่ (รับหน้าร้าน/บริการ) อยู่ในแถว ไม่ระบุจังหวัด` · 2 คอลัมน์ (xl) แถว: อันดับ · ชื่อ · ฿ · แถบ · % · แถวพิเศษท้าย: `จังหวัดอื่น ๆ ({n} จังหวัด)` (icon `dots`) และ `ไม่ระบุจังหวัด` (icon `map-pin-off`) แถบ `bg-default-400` · รวม % = 100 · ไม่มีแผนที่ · ทุกใบไม่มีที่อยู่ → แถวเดียว "ไม่ระบุจังหวัด 100%" (ห้ามซ่อน)

**⑦ ยอดขายตามช่องทาง** — copy `TopTrafficSources.tsx` ไทล์ `relative h-10` fill `bg-default-200` ทุกไทล์ · โลโก้จาก `public/images/logos/*.svg` ผ่านโครง `SalesChannelBadge.tsx` (fallback tabler `brand-*`) · หน้าร้าน = `building-store` · คำกำกับ: `ยอดขายทั้งหมดในช่วง (รวมที่ไม่ได้มาจากโฆษณา) {฿} · แถบ = สัดส่วนของยอดทั้งหมด` · เฉพาะช่องทางที่มียอด > 0 · **ไม่มีแถว TikTok "ยังไม่ได้เชื่อม"** · ซ่อนทั้งการ์ดเมื่อกรองเพจเดียว

**⑧ ยอดขายจากโฆษณาตามเพจ** — copy `SessionByBrowser.tsx` (ตัด SimpleBar/dropdown) แถว: avatar `size-10 rounded-full` (`ShopChannel` avatar; ไม่มี → ตัวอักษรแรกบน `bg-default-100`) + badge โลโก้แพลตฟอร์ม `size-5 ring-2 ring-card` มุมล่างขวา + ชื่อ `line-clamp-2` + % + delta (จุด) · `ลูกศร = เปลี่ยนจากช่วงก่อนหน้า (จุดเปอร์เซ็นต์)` · วาดเมื่อร้านมีเพจ ≥2 และไม่ได้กรองเพจเท่านั้น · การ์ด `self-start`

**⑨ ผลลัพธ์รายแอด** (`id="ad-table"`) — copy `AnalyticsOverview.tsx` ตัด checkbox/ลบ · card-header: ชื่อ + `input-icon-group`+`form-input` ค้นหา (`ค้นหาชื่อหรือรหัสแอด`, ชื่อ/รหัส, `getFilteredRowModel`+`globalFilter`, กลับหน้า 1) + native `<select class="form-select">` 10/25/50 (aria `จำนวนแถวต่อหน้า`) · 5 คอลัมน์ ตัวเลขจัดกลาง (`meta.align:'center'`):
1. โฆษณา (รูป + ชื่อ + รหัสบรรทัดรอง)
2. แชทจากโฆษณา
3. {noun} + บรรทัดรอง `ปิด 27.8%` (แชท 0 → `—`) + info-circle อธิบายอัตรา >100% เป็นข้อความเล็กใต้ตาราง
4. ยอดขาย + `เฉลี่ย ฿…/ใบ`
5. ยกเลิก/คืน
- เรียงได้ 2/3/4/5 · แถวรวม `<tfoot>` (`footerRow`) `รวมทุกแอดในช่วงนี้ ({n} แอด)` = ทุกแอด ไม่ใช่เฉพาะหน้า/ผลค้นหา (HR16) · `TablePagination` + `แสดง {a}–{b} จาก {n} แอด` (ถ้าล้นที่ 390 ใช้ปุ่มก่อนหน้า/ถัดไป `min-h-11`) · <768 รายการ `divide-y` แถวเป็น `<button>` `min-h-11` + ตัวเรียง `FilterDropdown` เดิม

## ไฟล์ (`reports/ads/components/`)
`AdSalesClient.tsx` (ปรับ: grid + state ชีต) · `AdReportFilters.tsx` (ปรับ) · `AdSalesCard.tsx` ① · `AdShareCard.tsx` ② · `TopAdsCard.tsx` ③ · `DailyOverviewCard.tsx` ④ · `AdDonutCard.tsx` ⑤ · `ProvinceCard.tsx` ⑥ · `ChannelCard.tsx` ⑦ · `PageSplitCard.tsx` ⑧ · `AdTableCard.tsx` ⑨ · `DeltaText.tsx` (SSOT ▲▼ ขึ้น `text-success-ink` ลง `text-warning-ink` + sr-only `เพิ่มขึ้น/ลดลง`) · `ShareBar.tsx` (ใช้ใน ③⑥) · `data.ts` (ขยาย) · `../loading.tsx` (skeleton เลียน grid ใหม่ด้วย `_shared/SellerCardSkeleton.tsx`)

## สัญญาข้อมูล (service บน `salesOrderWhere` ชุดเดิม · serializable ไม่มี Date/Decimal)
`summary` (เดิม) · `previous: {adSales, adOrders, chats, closeRatePct, nonAdSales}` · `daily[]: {day:'YYYY-MM-DD', adSales, nonAdSales, adOrders}` และ `prevDaily[]` เรียงตามตำแหน่งวัน (วันว่าง = 0 ไม่ใช่ null/undefined; "วันนี้" = รายชั่วโมงหรือรายวันตามที่ทำได้ — ระบุใน PR) · `provinces[]: {name|null, sales}` (จากโฆษณาเท่านั้น) · `channels[]: {provider|null, sales}` (ยอดทั้งร้าน) · `pages[]: {shopChannelId, name, provider, avatarUrl, sales, prevSales}` (จากโฆษณา) · `rangeLabel` / `prevRangeLabel`
**เทส parity:** ผลรวม `daily.adSales` = `summary` ยอดจากโฆษณา = แถวรวม ⑨ · ผลรวม provinces = ยอดจากโฆษณา · ผลรวม channels = ยอดทั้งหมด

## ApexCharts (HR10)
ทุกกราฟผ่าน `@/components/wrappers/ApexChart`, สี `getColor()` เท่านั้น, `getOptions` ห่อ `useCallback` แบบ `Spark` ใน `settings/capis/components/StatsRow.tsx`, `height`/`type` ตรงกันทั้ง options และ prop, ห้ามคีย์ `undefined`, แกน x `formatDayMonth` (`src/lib/format-date.ts`), แกน y `formatBahtCompact`, tooltip `formatBaht`, div ห่อ `min-h-60`/`min-h-72`, ห่อ `role="img"` + aria-label สรุป
| กราฟ | ฐาน | options |
|---|---|---|
| ① แท่งซ้อน | `widgets/charts/components/FinancialOverview.tsx` + `dashboard/analytics/components/TotalOrder.tsx` | bar stacked h240 columnWidth 55% borderRadius 2 · colors `chart-primary`, `chart-delta` · grid `chart-border-color` dash 4 · x tickAmount 6 (มือถือ 4) hideOverlappingLabels · tooltip shared |
| ④ area | `widgets/charts/components/SalesReport.tsx` | area h300 · [ช่วงนี้, ช่วงก่อน] stroke 2 dashArray [0,5] smooth · gradient .35→0 เฉพาะเส้นแรก · colors `chart-primary`, `default-400` · yaxis min 0 tickAmount 3 (ลบ max) · legend บนขวา |
| ⑤ donut | `widgets/charts/components/StorePerformance.tsx` + โครง `AudienceInsight.tsx` | donut h180 size 75% stroke 0 · colors `getColor('chart-primary', a)` a = 1/.8/.6/.45/.3 + อื่น ๆ `default-400` · total.formatter `formatBaht(adSales)` |

## Theme Source Mapping
| ส่วน | ไฟล์ธีม | ปรับ |
|---|---|---|
| grid | `theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx` | ลอก class grid |
| ① | `.../dashboard/analytics/components/TotalOrder.tsx` + chart `.../widgets/charts/components/FinancialOverview.tsx` | ตัด CountUp/select วันที่/kicker uppercase/ไอคอนวงกลมทึบ · ใช้ card-header |
| ② | `.../dashboard/analytics/components/TotalVisitors.tsx` | ตัด select/uppercase/CountUp · ตาราง 3 คอลัมน์ |
| ③ | `.../dashboard/analytics/components/TotalSubscriber.tsx` | ตัด CountUp/medal/Congratulations · แถวเป็นปุ่ม |
| ④ | `.../dashboard/analytics/components/SessionOverview.tsx` + chart `.../widgets/charts/components/SalesReport.tsx` | tablist a11y · ตัด Export/Import |
| ⑤ | `.../widgets/charts/components/StorePerformance.tsx` + `.../dashboard/analytics/components/AudienceInsight.tsx` | ตัดตัวนับ realtime/dots/ปุ่ม bg-secondary |
| ⑥ | `.../dashboard/analytics/components/UserGeography.tsx` (ฝั่งรายการ) | ไม่มีแผนที่ ไม่มีธง |
| ⑦ | `.../dashboard/analytics/components/TopTrafficSources.tsx` | โลโก้ repo · fill เดียว |
| ⑧ | `.../dashboard/analytics/components/SessionByBrowser.tsx` | ตัด SimpleBar/dropdown |
| ⑨ | `.../dashboard/analytics/components/AnalyticsOverview.tsx` + select `.../form/elements/components/InputTextfieldType.tsx` · repo base `reports/products/components/ProductSalesTable.tsx` | ตัด checkbox/ลบ/modal |
| ตัวกรองเพจ | `.../ui/dropdowns/page.tsx` ผ่าน `src/components/safepay/FilterDropdown.tsx` | เดิม |
| แถวรวม | ไม่มีในธีม → `footerRow` ใน `DataTable` | opt-in |

## Edge states
- Loading ครั้งแรก: skeleton ตาม grid ทุก breakpoint · เปลี่ยนช่วง: grid `aria-busy` + `opacity-60` + `role="status"` "กำลังคำนวณใหม่…"
- ร้านไม่มีข้อมูลแอดเลย: หน้าว่าง FR-008 เดิม · ช่วงนี้ไม่มีแชท/ออเดอร์จากแอด: หัว + ตัวกรอง + การ์ดว่างใบเดียว (`emptyRangeTitle/Desc`)
- ช่วงก่อน 0: ไม่แสดง % (ห้ามหาร 0) ช่อง delta `—` · มีแชทแต่ 0 ออเดอร์: ① ฿0 + ข้อความในพื้นที่กราฟ · ⑥⑧ ซ่อน
- แอดเดียว: ③ 1 แถว · ⑤ วงเต็มไม่มี "อื่น ๆ" · ชื่อยาว: truncate+title / `line-clamp-2 break-words`, รหัส `break-all`, `min-w-0` ทุกชั้น · ไม่มีรูป: `AdThumb` ไทล์ speakerphone · ไม่มีชื่อ: `adDisplayName` → `รหัสโฆษณา {adId}`
- `truncated` / `clamped`: แถบเตือนเดิม · Error: `SellerErrorState` เดิมทั้งหน้า · Export ล้ม: `pacesToast.error`
- คำว่าคำสั่งซื้อใช้ `{noun}` จาก `resolveOrderVocab` · หน่วย `countUnit` · คีย์ใหม่ทั้ง `th.ts` และ `en.ts` ใต้ `adReport`

## มติ Controller 2026-11-14
- O1: แอดที่ปิดการขายดีที่สุด = ≥10 {noun} **และ** อัตรา ≤100%
- O2: ไม่มีแถว TikTok · ช่องทางจาก `shopChannelId → ShopChannel.provider` (ไม่มีช่อง = หน้าร้าน/อื่น ๆ) · สโคปยอดทั้งร้านในช่วง
- O3: คงทั้ง ③ และ ⑤
- O4: เพิ่ม `footerRow` opt-in ใน `DataTable`
- O5: delta ลง = `text-warning-ink`
- O6: grep หาตัวปรับชื่อจังหวัดที่มีอยู่ (เช่นใน iShip/address libs) ถ้ามีใช้ · ไม่มี → จัดกลุ่มด้วยค่า trim
