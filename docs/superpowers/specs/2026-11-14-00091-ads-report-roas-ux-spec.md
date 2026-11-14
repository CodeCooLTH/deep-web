# UX Delta Spec — 00091 FR-010 เฟส 2: ค่าโฆษณา · ROAS บน `/reports/ads`

> safepay-ux (HR8) 2026-11-14 · ต่อยอดจาก `2026-11-14-00091-ads-report-dashboard-ux-spec.md` (เฟส 1) · เขียนเฉพาะส่วนที่เปลี่ยน

## มติ Controller 2026-11-14 (ตอบ open questions ของ UX)
1. ตัดกล่อง "ชวนเชื่อม" ใน ③ (ซ้ำแบนเนอร์) ✔
2. **ไม่ได้เชื่อม / state ≠ OK → ซ่อนคอลัมน์ ค่าโฆษณา และ ROAS ใน ⑨** (ตารางกลับเป็น 5 คอลัมน์) — แก้ BRD FR-010 AC ข้อ 4 ให้ตรง
3. ROAS รวม = ยอดขายของแอดที่มีค่าโฆษณา ÷ Σ spend (ไม่นับแอดที่ไม่พบ spend) + บรรทัดแจ้ง `uncoveredNote` ✔
4. กรองเพจ: spend นับเฉพาะแอดที่มีแชทในเพจนั้น + ซ่อนแถว ROAS ใน ③ ✔
5. **ไม่มีตารางใหม่ / ไม่มี migration** — ดึง Insights สดต่อคำขอ แล้วแคชฝั่ง server ~15 นาที (คีย์ shop + adAccount + ช่วง) · ไม่ต้องทำ `asOf`
6. CTA ไป `/settings/capis` เฉย ๆ
7. "วันนี้": ไม่วาดกราฟ spend รายชั่วโมง (ข้อความ `spendTodayNote`) แต่ค่ารวมแสดงได้

## 1. ข้อมูล (serializable)
- `AdReportView.ads`: `state: 'NOT_CONNECTED'|'OK'|'AUTH'|'ERROR'|'CURRENCY'` · `accountName` · `currency` · `tzMismatch` · `summary: { spend, prevSpend, roas, prevRoas, costPerOrder, prevCostPerOrder, uncoveredAds }` · `daily[].spend`, `prevDaily[].spend`
- `AdViewRow` เพิ่ม `spend: number|null`, `noChats: boolean` (แถวผี = มีใน Insights แต่ไม่มีแชทจากแอดในช่วง)
- ฟังก์ชันใน `src/lib/ad-report-view.ts` (มีเทส): `roas(sales, spend)` spend null/0 → null, spend>0 & sales 0 → 0 · `costPerOrder(spend, orders)` orders 0 → null · `bestRoasRow(rows)` เฉพาะ orders ≥ 10 และ spend > 0, เสมอ → orders มากกว่าชนะ
- HR16: ROAS/ต้นทุนรวมใช้ชุดแอดเดียวกันทุกการ์ด (แท็บ ④ · ② · แถวรวม ⑨ · ซีรีส์รายวัน) · เทส parity Σ daily.spend = summary.spend = แถวรวม ⑨
- การตัดสิน state: มี `MetaAudienceConnection` ไหม (ไม่มี → NOT_CONNECTED) · ข้ามเรียก Graph เฉพาะ `stoppedReason = TOKEN_OR_PERMISSION` (→ AUTH) · นอกนั้นลองเรียกแล้วตัดสินจากผล: Graph code 190/200/10 → AUTH · timeout/5xx/rate limit → ERROR · `currency ≠ THB` → CURRENCY · timeout ~5 วินาที · หน้าห้ามล่มเพราะ Meta
- Insights: `GET {GRAPH_BASE}/act_{adAccountId}/insights?level=ad&fields=ad_id,ad_name,spend&time_range={since,until}&time_increment=1&limit=500` (+ paging) · บัญชี: `GET act_{id}?fields=name,currency,timezone_name` · `tzMismatch` = timezone ≠ Asia/Bangkok · token จาก `decryptToken(conn.tokenEnc)` ห้ามออก client/log

## 2. ส่วนที่เปลี่ยน
**หัวหน้า (`AdReportFilters`)** — state OK: บรรทัด `ค่าโฆษณานับจากบัญชีโฆษณา {name} เท่านั้น` (`text-xs text-default-700`, ชื่อว่าง → `act_{id}`) · tzMismatch → บรรทัด `text-xs text-warning-ink` (`spendTzNote`) · กรองเพจ → `pageFilterSpendNote`

**`AdSpendNotice.tsx` (ใหม่)** เหนือกริด ใต้แถบ truncated · กล่องเดียวตาม state · `role="status"`
- NOT_CONNECTED: โทน `bg-default-100 text-default-800` + ไอคอน `plug-connected-x` + `spendNoneTitle/Body` + ปุ่ม primary `เชื่อมบัญชีโฆษณา` → `/settings/capis`
- AUTH: โทน warning (`bg-warning/15 text-warning-ink`) + `spendAuthTitle/Body` + ปุ่ม primary `เชื่อมบัญชีโฆษณาใหม่`
- CURRENCY: โทน warning + `spendCurrencyTitle/Body` + ปุ่มไป `/settings/capis`
- ERROR: inline เล็ก โทน warning + `spendErrorBody` + ปุ่ม `btn border-default-300` "ลองใหม่" (`router.refresh()`)
- ห้าม danger (ยอดขายยังถูก) · ปุ่ม `min-h-11 lg:min-h-0` มือถือเต็มบรรทัด · ปุ่มเป็น `next/link` + คลาสปุ่ม (ท่า `BTN_PRIMARY` ใน `settings/capis/components/AudienceCard.tsx`) · ฐานธีม `ui/alerts/page.tsx`

**④ DailyOverviewCard** — แท็บ 2 → 4: ยอดขาย · {noun} · ค่าโฆษณา · ROAS · `grid-cols-2 md:grid-cols-4` (มือถือ 2×2, `min-h-11`) · วงกลมไอคอน `hidden 2xl:flex` · ไอคอนใหม่ `receipt`, `chart-arrows-vertical` · เพิ่ม Home/End ใน roving tabindex
- Delta: ค่าโฆษณาใช้ `DeltaText` prop ใหม่ `tone="neutral"` (`text-default-700`) · ROAS ใช้ปกติ · ช่วงก่อน 0/null → "—"
- แท็บ 3–4 กดได้ทุก state; state ≠ OK → ค่า "—" + sr-only เหตุ และแผงแสดงข้อความแทนกราฟ (NOT_CONNECTED: `spendChartNone` + ปุ่มเชื่อม · อื่น ๆ ข้อความตาม state)
- "วันนี้": แท็บ 3–4 แสดงค่ารวม ไม่วาดกราฟ (`spendTodayNote`)
- กราฟค่าโฆษณา: ฐาน `widgets/charts/components/ProjectPerformance.tsx` (area+line) · series "ยอดขายจากโฆษณา" area `chart-primary` gradient .35→0 · series "ค่าโฆษณา" line stroke 3 `chart-zeta` · y `formatBahtCompact`, tooltip shared `formatBaht`
- กราฟ ROAS: ฐาน `widgets/charts/components/SalesReport.tsx` · "ROAS รายวัน" line `chart-primary` · เส้นอ้างอิงคงที่ 1 ประ `default-400` ("ROAS 1 = ยอดขายเท่าค่าโฆษณา") · y `toFixed(1)`, tooltip 2 ตำแหน่ง · ไม่ใช้ annotations · วัน spend=0 → ROAS `null` (เส้นขาด) — ข้อยกเว้นเดียวจากกฎห้าม undefined (ใช้ null)
- ทุกกราฟ: ApexChart wrapper · `getColor` · `useCallback` · height/type ตรงกัน · `role="img"` + aria-label สรุป

**② AdShareCard** — state OK และ costPerOrder ≠ null: เพิ่มแถว "ต้นทุนต่อ{noun}" ในตาราง 3 คอลัมน์ · delta neutral · `จาก {ค่าเดิม}`

**③ TopAdsCard** — กล่องเส้นประเดิมมี 2 แถวคั่นเส้นประ: "ปิดการขายดีที่สุด" (เดิม) + "ROAS ดีที่สุด" (ใหม่) · thumb `size-10` · หมายเหตุร่วมบรรทัดเดียว `นับเฉพาะแอดที่มี{noun}ตั้งแต่ 10 ใบขึ้นไป` · แถวที่ไม่เข้าเกณฑ์ซ่อน (ROAS ซ่อนเมื่อ state ≠ OK / ไม่มีแอดเข้าเกณฑ์ / กรองเพจ) · ไม่มีเลย → ไม่วาดกล่อง · แต่ละแถวเป็น `<button>` เปิด `AdOrdersSheet`

**⑨ AdTableCard** — state OK: 7 คอลัมน์ (`table-fixed` + `colgroup` โฆษณา ~30%): โฆษณา · แชทจากโฆษณา · {noun}/`ปิด x%` · ยอดขาย/เฉลี่ย · **ค่าโฆษณา/บรรทัดรอง ต้นทุนต่อ{noun}** · **ROAS** · ยกเลิก/คืน · ห่อ `overflow-x-auto` · ≥฿1,000,000 ใช้ `formatBahtCompact` + `title`
- state ≠ OK → ไม่มี 2 คอลัมน์ใหม่ (มติ 2)
- sort: เพิ่ม `spend`, `roas` · null เรียงท้ายเสมอทั้งสองทิศ · มือถือ `AD_SORT_KEYS` เพิ่ม `spend`,`roas`
- ค่าในเซลล์: ปกติ `฿4,820`/`฿129` · `3.77` | ไม่มีแถว Insights `—`/`—` · `—` | spend>0 แต่ 0 {noun} `฿2,300`/`—` · `0.00` | spend=0 `฿0`/`—` · `—` · "—" มี sr-only `ไม่มีค่าโฆษณา`
- ROAS ไม่ระบายสี · หัว ROAS มีไอคอน info + `roasTip` (ข้อความเห็นได้ ไม่ใช่ hover อย่างเดียว)
- แถวรวม (`footerRow`): ค่าโฆษณารวม + ต้นทุนรวม (บรรทัดรอง) + ROAS รวม ตามกติกา §1 (รวมแถวผี) · `uncoveredNote` ใต้ตารางเมื่อ uncoveredAds > 0
- แถวผี: ชื่อจาก Insights `ad_name`, `AdThumb` ค่าเริ่มต้น, แชท 0, {noun} 0 (ปิด —), ยอดขาย ฿0 (เฉลี่ย —), ยกเลิก 0 · badge เทา `ยังไม่มีแชทจากโฆษณา` (`bg-default-100 text-default-800`) · **ไม่คลิกได้** (`div`) · ไม่เข้า ③ ⑤ · ถ้ามี: บรรทัด `text-xs text-warning-ink` ใต้ card-header `ghostNote` + ปุ่มข้อความ `ghostSort` (ตั้ง sort spend มาก→น้อย)
- มือถือ: ขวาบนยอดขาย + `ROAS 3.77` (`text-xs text-default-700`) · บรรทัดใหม่ `ค่าแอด ฿4,820 · ต้นทุน ฿129/{noun}` เฉพาะ state OK และมี spend · แถวรวมบนสุดต่อท้าย `ค่าแอด ฿… · ROAS …` · แถวผี `div` + badge

## 3. ข้อความ (`adReport` ใน th.ts + en.ts)
| คีย์ | th |
|---|---|
| spendNoneTitle | ยังไม่ได้เชื่อมบัญชีโฆษณา Meta |
| spendNoneBody | ค่าโฆษณา · ROAS · ต้นทุนต่อ{noun} จะแสดงเมื่อเชื่อมบัญชีโฆษณา ส่วนยอดขายและ{noun}จากโฆษณาดูได้ตามปกติ |
| spendConnectCta | เชื่อมบัญชีโฆษณา |
| spendAuthTitle | การเชื่อมบัญชีโฆษณาใช้อ่านค่าโฆษณาไม่ได้แล้ว |
| spendAuthBody | Meta ไม่ให้ Deep อ่านค่าโฆษณาในตอนนี้ (โทเคนหมดอายุหรือสิทธิ์ถูกถอน) เชื่อมใหม่เพื่อกลับมาดูค่าโฆษณา ส่วนยอดขายและ{noun}ยังดูได้ตามปกติ |
| spendReconnectCta | เชื่อมบัญชีโฆษณาใหม่ |
| spendErrorBody | โหลดค่าโฆษณาจาก Meta ไม่สำเร็จในตอนนี้ ยอดขายและ{noun}แสดงตามปกติ |
| spendRetry | ลองใหม่ |
| spendCurrencyTitle | บัญชีโฆษณานี้ใช้สกุลเงิน {currency} |
| spendCurrencyBody | Deep คำนวณ ROAS ได้เฉพาะบัญชีที่ใช้บาท (THB) จึงยังไม่แสดงค่าโฆษณา เปลี่ยนไปใช้บัญชีที่เป็นบาทได้ที่หน้าเชื่อมบัญชี |
| spendAccountLine | ค่าโฆษณานับจากบัญชีโฆษณา {name} เท่านั้น |
| spendTzNote | บัญชีโฆษณานี้ใช้เขตเวลา {tz} ค่าโฆษณารายวันอาจเหลื่อมกับยอดขายไปหนึ่งวัน ผลรวมทั้งช่วงยังใช้ได้ |
| colSpend | ค่าโฆษณา |
| costLine | ต้นทุนต่อ{noun} |
| colRoas | ROAS |
| roasTip | ยอดขายของ Deep ÷ ค่าโฆษณา (ยังไม่หักต้นทุนสินค้า) |
| bestRoasTitle | ROAS ดีที่สุด |
| tabSpend / tabRoas | ค่าโฆษณา / ROAS |
| spendChartNone | เชื่อมบัญชีโฆษณาแล้วจะเห็นค่าโฆษณารายวันย้อนหลังได้ทันที |
| spendTodayNote | ค่าโฆษณารายชั่วโมงยังไม่มี ดูรายวันได้ที่ช่วง 7 วันขึ้นไป |
| seriesSpend / seriesRoas / seriesRoasRef | ค่าโฆษณา / ROAS รายวัน / ROAS 1 = ยอดขายเท่าค่าโฆษณา |
| noChatsBadge | ยังไม่มีแชทจากโฆษณา |
| ghostNote | แอด {n} ตัวใช้เงิน {amount} แต่ยังไม่มีแชทจากโฆษณา |
| ghostSort | เรียงตามค่าโฆษณา |
| uncoveredNote | ROAS รวมไม่นับ {n} แอดที่ไม่พบค่าโฆษณา |
| pageFilterSpendNote | เมื่อกรองเพจ ค่าโฆษณานับเฉพาะแอดที่มีแชทในเพจนี้ |
| noSpendSr | ไม่มีค่าโฆษณา |

## 4. ทิ้งจาก mockup
ป้าย "ตัวอย่าง" · แถบสลับเชื่อม/ไม่เชื่อม · กล่องชวนเชื่อมใน ③ · hex ดิบ (#ff8f1f, teal) · annotations · badge award บนรูป · segmented ช่วงเวลา

## 5. A11y
แบนเนอร์ `role="status"` · แท็บ ARIA เดิม + Home/End · "—" ทุกตัวมี sr-only (ห้าม aria-label บน span ลอย) · แถวผีไม่อยู่ใน tab order · ปุ่ม `min-h-11 lg:min-h-0` · delta มีลูกศร + sr-only

## 6. ความเสี่ยงให้ critique
`chart-zeta` (#db9052) คอนทราสต์ต่ำกว่า 3:1 เล็กน้อย (เส้นหนา 3 + legend + tooltip ช่วย) · แถบแท็บ 4 ช่องที่ 1280 · ตาราง 7 คอลัมน์ที่ ~720px
