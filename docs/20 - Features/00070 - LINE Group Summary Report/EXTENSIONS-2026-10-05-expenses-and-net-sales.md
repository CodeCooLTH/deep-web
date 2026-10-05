---
title: "EXT 2026-10-05 — เพิ่ม 'ค่าใช้จ่าย' และ 'ยอดขายหลังหักค่าใช้จ่าย' ในรายงานกลุ่ม LINE"
owner: shinobu22
status: approved         # user อนุมัติ 2026-10-05 ("ตามแนะนำ") · Q-1..Q-4 = ค่าแนะนำ
module: M68-LineGroupSummary
feature: "00070"
created: 2026-10-05
tags: [feature, extension, prd, brd, line, report, flex, template, expense, net-sales]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[SDS]]", "[[DATABASE]]", "[[API]]", "[[TestCase]]", "[[EXTENSIONS-2026-10-05-message-template-and-charts]]"]
---

# ส่วนขยาย 2026-10-05 — ค่าใช้จ่าย + ยอดขายหลังหักค่าใช้จ่าย ในรายงานเข้ากลุ่ม LINE

> เอกสารนี้ = PRD + BRD ส่วนขยายรวมไฟล์เดียว ต่อยอดจาก `EXTENSIONS-2026-10-05-message-template-and-charts.md` (ต่อไปเรียก **EXT-T**) **ไม่แก้ความหมาย FR-LGS-01..24 / FR-LGS-EXT-01..15 เดิม** เว้นที่ระบุใน §12
>
> 🛑 **Doc-First (HR11):** ผ่านการอนุมัติจาก user ก่อนเริ่มโค้ด · งานแตะ data model/API/enum/validation → sync `docs/SRS.md` (งาน T7)
>
> เลขบรรทัดโค้ดที่อ้าง = อ่านจากโค้ดจริง ณ 2026-10-05 (HR16 — "ข้อจำกัดที่เอกสารอ้างต้องยืนยันกับโค้ด")

---

## 1. Goals

**G-1** คำขอ user: "เติมค่าใช้จ่ายเข้าไปใน line report เพื่อสรุปว่าวันนี้มีค่าใช้จ่ายเท่าไหร่ และมีสรุปยอดที่หักกับค่าใช้จ่ายแล้วเหลือเท่าไหร่" → เจ้าของเลือกใส่ **ค่าใช้จ่าย** และ **ยอดขายหลังหักค่าใช้จ่าย** ลงข้อความที่บอทส่งเข้ากลุ่มได้ ทั้งรายวัน/รายเดือน/ส่งทดสอบ/ตอบคำสั่ง

**G-2** ตัวเลขทั้งสองมาจาก `getPnlReport` ตัวเดียวกับหน้าการเงิน — **ไม่นิยามสูตรใหม่** (HR16)

**G-3** **กลุ่มเดิมทุกกลุ่มไม่เปลี่ยนไบต์เดียว** (`defaultTemplateFromFlags` ไม่เปลี่ยน ⇒ golden เดิมทุกเคสต้องเขียวโดยไม่แก้ไฟล์ golden)

**G-4** ไม่ทำให้ผู้อ่านเข้าใจผิด: ค่าใช้จ่ายยังไม่ได้บันทึก ≠ ฿0 · ยอดหลังหักค่าใช้จ่าย **ไม่ใช่กำไร** (ยังไม่หักต้นทุนสินค้า) · ยอดติดลบอ่านออกโดยไม่ต้องพึ่งเครื่องหมายหรือสีแดง

**ไม่ใช่เป้าหมาย:** กำไรแบบใหม่ · แยกหมวดค่าใช้จ่าย · กราฟค่าใช้จ่าย · เปรียบเทียบกับช่วงก่อน (ดู §10)

---

## 2. User Stories

| # | ในฐานะ | ฉันต้องการ | เพื่อ | Must/Nice |
|---|---|---|---|---|
| US-EXP-1 | เจ้าของร้าน (แพ็กเกจ ACTIVE) | ใส่บล็อก "ค่าใช้จ่าย" ในข้อความรายงาน | ให้ทีมเห็นว่าวันนี้ใช้จ่ายไปเท่าไหร่ | Must |
| US-EXP-2 | เจ้าของร้าน | ใส่บล็อก "ยอดขายหลังหักค่าใช้จ่าย" | รู้ว่าขายได้แล้วเหลือเท่าไหร่หลังหักค่าใช้จ่าย โดยไม่ต้องเปิดแอป | Must |
| US-EXP-3 | เจ้าของกลุ่มหลายร้าน | เลือกดูค่าใช้จ่ายแยกรายร้านในบล็อกรายร้าน | เห็นว่าร้านไหนใช้จ่ายเท่าไหร่ | Must |
| US-EXP-4 | เจ้าของร้าน | ใส่ {ค่าใช้จ่าย} / {ยอดขายหลังหักค่าใช้จ่าย} ในประโยคของฉัน | เขียนประโยคเองแต่ตัวเลขถูกเสมอ | Must |
| US-EXP-5 | เจ้าของร้าน | ถูกถามยืนยันก่อนเปิดตัวเลขเหล่านี้ | ไม่เผลอเปิดเผยตัวเลขการเงินให้ทุกคนในกลุ่ม | Must |
| US-EXP-6 | สมาชิกกลุ่ม LINE | เห็นป้ายบอกเมื่อค่าใช้จ่ายยังไม่ครบ/ยอดติดลบ | ไม่เข้าใจผิดว่า "ไม่มีค่าใช้จ่าย" ทั้งที่แค่ยังไม่ได้บันทึก | Must |

---

## 3. มติที่ user อนุมัติแล้ว (ห้ามเปลี่ยนในเอกสารนี้) + ข้อค้นพบจากโค้ด

| # | มติ |
|---|---|
| D-EXP-1 (Q1) | ค่าใช้จ่าย = `totalExpense` ของ `getPnlReport` เป๊ะ (= ที่ร้านบันทึกเอง + ค่าส่งขาไปที่จ่ายจริง **เฉพาะร้านบริการ** + ค่าส่งขากลับของใบคืน) — ตัวเลขเดียวกับหน้าการเงิน |
| D-EXP-2 (Q2) | "ยอดขายหลังหักค่าใช้จ่าย" = `revenue − totalExpense` จาก `getPnlReport` ชุดเดียวกัน · มีหมายเหตุ "ยังไม่หักต้นทุนสินค้า" · **ไม่ใช่กำไร** (กำไร = บล็อก `profit` เดิม) |
| D-EXP-3 (Q3) | ต้องยืนยันก่อนเปิด แบบเดียวกับกำไร (ทุกคนในกลุ่มเห็น) |
| D-EXP-4 (Q4) | บล็อกรวมทั้งกลุ่ม + ตัวเลือก "ค่าใช้จ่ายต่อร้าน" ในบล็อกรายร้าน (แบบ `shops.profit`) |
| D-EXP-5 (Q5) | บล็อกใหม่ 2 ตัว `expense`, `net_sales` + โทเคน `expense`, `net_sales` · **ไม่อยู่ในแบบมาตรฐาน** · ใช้ทั้งรายวัน/รายเดือน |

### ข้อเท็จจริงที่ยืนยันกับโค้ดแล้ว (HR16)

| # | ข้อเท็จจริง | หลักฐาน | ผลต่อเอกสารนี้ |
|---|---|---|---|
| F-1 | `totalExpense = round2(Σ Expense.amount ในช่วง expenseDate + shippingCost + returnShippingCost)` · `shippingCost` เป็น 0 ถ้าไม่ใช่ร้านบริการ | `pnl.service.ts:212-214` · `Expense` ตัดช่วงด้วย `expenseDate` `:128-131` · ค่าส่งขากลับตัดด้วย `receivedAt` `:158` | ค่าใช้จ่ายของร้านต่างประเภทธุรกิจ **นิยามไม่เท่ากัน** → ประเด็นรวมข้ามร้าน (§4 EXP-03) |
| F-2 | `revenue = Σ netOfReturns(totalAmount)` ของใบใน `revenueOrderWhere` ช่วง `createdAt` | `pnl.service.ts:93, :125` | — |
| F-3 | **`getSalesSeries` ที่บล็อก sales เดิมใช้ ก็หักใบคืนเหมือนกัน** (ไม่ใช่ "ไม่หักใบคืน"): ใช้ `netOfReturns` `dashboard.service.ts:402` · ตัด `RETURNED` ร้านบริการ `:279` · แยก `confirmedValues` ด้วย `countsAsRevenue` ซึ่งคอมเมนต์ระบุว่าต้องตรงกับ `revenueOrderWhere` `order-revenue.ts:60-61` | อ่านโค้ด | ตามโค้ด `revenue` (pnl) ควร = `ShopSummary.confirmed` ⇒ `net_sales = ยอดขาย (นับแล้ว) − ค่าใช้จ่าย` **แต่ห้ามเชื่อคอมเมนต์** → AC-EXP-01-2 เป็นเทส parity บนฐานจริง · ถ้าเทสแดง = พบการเบี่ยงของสองสูตร ต้องรายงาน Controller ก่อนทำต่อ ไม่ใช่ปรับป้ายให้พ้นเทส |
| F-4 | เส้นทางกำไรเรียก `getPnlReport` ภายใต้ guard `flags.showProfit` เท่านั้น แล้วเก็บแค่ `{netProfit, capped}` | `line-report-summary.service.ts:141-158` | ต้องขยาย guard + ผลที่เก็บ (§4 EXP-01) · เทสเดิม "showProfit=false → ไม่เรียก getPnlReport" ต้องอัปเดตเป็น "ไม่มีทั้งกำไรและค่าใช้จ่าย" |
| F-5 | `capped` ของกำไร = `!resolveDataCompleteness(...).complete` และ `complete = !hasMissingCost && expenseCount > 0` | `finance-tabs.ts:65-81` · เรียกที่ `summary.service.ts:151-157` | ค่าใช้จ่าย/ยอดหลังหักค่าใช้จ่ายขึ้นกับ **เฉพาะ `expenseCount > 0`** (ต้นทุนสินค้าไม่เกี่ยว เพราะไม่ได้หักต้นทุน) |
| F-6 | `formatBaht` คืนค่าสัมบูรณ์เสมอ ห้าม `฿-x` — ทิศทางสื่อด้วย **คำ + สี** · `profitDisplay` ใช้คู่คำ "กำไรสุทธิ/ขาดทุนสุทธิ" และ "ไม่เกิน/อย่างน้อย" เมื่อ capped | `format-money.ts:13-14, :22, :115-149` | ยอดติดลบ: เปลี่ยน **ป้าย** ไม่ใช่ใส่เครื่องหมายลบ (§4 EXP-03) |
| F-7 | ในรายงานนี้ สีแดง (`DANGER`) = "ดึงข้อมูลไม่สำเร็จ" (+ป้าย "ทดสอบ") · แถวกำไรขาดทุนวันนี้ render ด้วยสี INK ไม่ใช่แดง | `flex-report-blocks.ts:226, :238, :275, :332` · `profitRow :74-77` (kv ไม่ส่งสี) · BR-LGS-27 | ยอดติดลบของ 2 บล็อกใหม่ = **INK ไม่แดง ไม่เขียว** |
| F-8 | หมายเหตุ "ค่าใช้จ่ายลงตามวันที่บันทึก ไม่เฉลี่ยรายวัน" มีอยู่แล้ว แต่ขึ้นเฉพาะ `shops.profit` + มีร้าน capped | `flex-report-blocks.ts:313-315` | ใช้ข้อความเดิม (แยกเป็นค่าคงที่ร่วม) ไม่คิดคำใหม่ |
| F-9 | `updateTemplate` ส่ง `{...deriveFlags(template), confirmProfit}` เข้า `mergeSettings` แล้วเขียน `next` ลง `prisma.update` ตรง ๆ | `line-report-group.service.ts:273-276` · `mergeSettings :184-201` | 🛑 **ห้ามเพิ่ม key ใน `deriveFlags`** — key แปลกจะกลายเป็นคอลัมน์ที่ไม่มี → Prisma ล้ม |
| F-10 | DB CHECK `LineReportGroup_metric_any_chk` อ่านแค่ 5 คอลัมน์ `show*` | `migrations/20261005100000_line_group_summary_reports/migration.sql:190-191` · app ซ้ำที่ `group.service.ts:198` | บล็อกใหม่ **ไม่นับเป็น "ตัวเลข"** → ไม่ต้อง migrate (§7) |
| F-11 | โทเคน `{กำไร}` คืน `profitDisplay(...).text` ซึ่งเป็นค่าสัมบูรณ์ ไม่มีป้ายขาดทุน/"ไม่เกิน" | `flex-report-blocks.ts:172-176` | ช่องโหว่เดิม (ข้อความอิสระอ่านผิดทิศได้) — โทเคนใหม่ **ต้องไม่ซ้ำรอยนี้** · ส่วนของเดิมเสนอเป็น Q-3 |
| F-12 | ถ้า `summarizeShop` throw (รวมถึง `getPnlReport` ล้ม) ร้านนั้นเป็น `ERROR` ทั้งร้าน (ยอดขายหายด้วย) | `summary.service.ts:175-181` | พฤติกรรมเดียวกับกำไรที่เป็นอยู่ — ขยายให้กลุ่มที่มี expense/net_sales (§9 R-3) |

---

## 4. Functional Requirements (FR-LGS-EXP-xx) + Acceptance Criteria

> วิธีอ่านตาราง AC เหมือน EXT-T §4: ทุกข้อชี้ **จุดบังคับ** + **เทสที่แดงเมื่อถอดกลไก** (พิสูจน์ด้วย mutation จริงตอนปิดงาน) · `Must` ทุกข้อ · พาธไฟล์ใหม่ = ข้อเสนอ ยืนยันที่ SDS

### สัญญาข้อมูล (ล็อกก่อนงานขนาน)

```ts
// src/lib/line-report/template.ts — เพิ่มแบบ additive ไม่แตะ v:1
export type Block =
  | /* ...เดิมทั้งหมด... */
  | { id: string; type: 'shops'; top3: boolean; profit: boolean; expense?: boolean }   // expense ไม่ใส่ = false (เทมเพลตเดิมที่เก็บไว้ยังถูกต้อง)
  | { id: string; type: 'expense' }
  | { id: string; type: 'net_sales' }
export type TokenKey = /* ...เดิม 10 ตัว... */ | 'expense' | 'net_sales'
TOKENS.expense   = '{ค่าใช้จ่าย}'
TOKENS.net_sales = '{ยอดขายหลังหักค่าใช้จ่าย}'
BLOCK_LIMITS.expense = 1; BLOCK_LIMITS.net_sales = 1

// src/lib/line-report/types.ts
/** ผลการเงินของร้านเดียวจาก getPnlReport ชุดเดียวกับกำไร — เติมเมื่อ needExpense */
export type ShopFinance = {
  expense: number          // = report.totalExpense
  netSales: number         // = round2(report.revenue − report.totalExpense) (ติดลบได้)
  expenseRecorded: boolean // = listExpenses(...).length > 0  (เกณฑ์เดียวกับ resolveDataCompleteness)
}
// ShopSummary.finance?: ShopFinance      ← ฟิลด์แยกจาก ShopSummary.profit (ไม่ปะปนสิทธิ์ "กำไรเปิดไหม")

// template.ts — ฟังก์ชันใหม่ (ไม่เพิ่ม key ใน deriveFlags — F-9)
export const deriveExposure = (t: TemplateV1): { expense: boolean }   // มีบล็อก expense|net_sales หรือ shops.expense หรือโทเคน expense|net_sales
// deriveNeeds: เพิ่ม needExpense = deriveExposure(t).expense   (needPnl = showProfit คงเดิม)
```

### FR-LGS-EXP-01 — ที่มาของตัวเลข (SSOT) และการดึง

| AC | ข้อกำหนด | จุดบังคับ | เทสแดงถ้าถอด |
|---|---|---|---|
| AC-EXP-01-1 | `ShopFinance.expense` = `report.totalExpense` · `netSales` = `round2(report.revenue − report.totalExpense)` จาก `getPnlReport` ตัวเดียวกับกำไร · **ห้ามคำนวณสูตรใหม่/query `Expense` เอง** ใน lib/composer/charts | `summarizeShop` อ่านฟิลด์ของ `report` เท่านั้น · (ถ้า `round2` ใน `pnl.service` ไม่ได้ export → export จากที่เดิม ห้ามเขียนซ้ำ) | `line-report-summary.test.ts`: mock `getPnlReport` ให้ `{revenue:1000,totalExpense:300.5,netProfit:-1}` → `{expense:300.5, netSales:699.5}` · **mutation:** ใช้ `netProfit`/`grossProfit` แทน `revenue` → แดง · สแกนซอร์สต่อยอด AC-LGS-14-1: ไฟล์ `flex-report-*.ts`, `aggregate.ts`, `template.ts` ห้ามมี `prisma.expense`/`listExpenses`/`totalExpense` |
| AC-EXP-01-2 | **Parity ยอดขาย:** ต่อร้าน ต่อหน้าต่างเวลา `round2(finance.netSales + finance.expense) === ShopSummary.confirmed` (F-3) · fixture ฐานจริง (localhost:5434, scope ด้วย id ที่เทสสร้าง — HR13): ร้านบริการที่คืนบางส่วน · ใบ RETURNED · ใบ SHIPPED ที่ขนส่งรับแล้ว/ยังไม่รับ · ใบแบบร่าง/ยกเลิก · ร้านขายของ · วันนี้/เมื่อวาน/คร่อมเดือน | `line-report-summary.parity.test.ts` ต่อยอด | **mutation:** เติม status ใน `revenueOrderWhere` ฝั่งเดียว / ถอด `netOfReturns` ฝั่ง pnl → แดง · **ถ้าแดงตั้งแต่ก่อน mutation = หยุด รายงาน Controller** (สองสูตรเบี่ยงกันอยู่แล้ว) |
| AC-EXP-01-3 | `expenseRecorded` = `listExpenses(shop.id,{range: range.expenseRange}).length > 0` ผ่าน `resolveDataCompleteness({expenseCount})` เดิม · **ต้นทุนสินค้าไม่ครบ (`hasMissingCost`) ไม่มีผลต่อ `expenseRecorded`** (F-5) | `summarizeShop` (ใช้ promise `expensesP` ตัวเดิม ไม่ query ซ้ำ) | test 2 แถว: `hasMissingCost=true`+expenses 1 → `true` · `hasMissingCost=false`+expenses 0 → `false` · **mutation:** ใช้ `c.complete` แทน → แถวแรกแดง |
| AC-EXP-01-4 | Guard: เรียก `getPnlReport` **ก็ต่อเมื่อ** `showProfit ∨ needExpense` · ครั้งเดียวต่อ (ร้าน, ช่วง) แม้ทั้งสองเปิด (memo key เดิม `shopId:start:end` — rename ช่อง cache `profit`→`pnl` เก็บ `{netProfit,capped,expense,netSales,expenseRecorded}`) · `ShopSummary.profit` ถูกเติม **เฉพาะ `showProfit`** แม้ดึง pnl มาแล้วเพราะค่าใช้จ่าย (กันกำไรรั่วโดยไม่ยืนยัน) · `ShopSummary.finance` เติมเฉพาะ `needExpense` | `summary.service.ts` guard + rename | `line-report-summary.test.ts`: (ก) ไม่มีกำไร/ค่าใช้จ่าย → 0 ครั้ง (ข) ค่าใช้จ่ายอย่างเดียว → 1 ครั้ง ∧ `profit===undefined` (ค) ทั้งคู่ → 1 ครั้ง · **mutation:** เติม `profit` เสมอเมื่อดึง pnl → (ข) แดง |
| AC-EXP-01-5 | `getPnlReport` ล้ม → ร้านเป็น `ERROR` (พฤติกรรมเดิม F-12) → ไม่มีวันแสดง `฿0` แทน "ไม่รู้" | `buildGroupSummary` allSettled เดิม | test: mock pnl throw → `state:'ERROR'` ไม่มี `finance` |

### FR-LGS-EXP-02 — บล็อก โทเคน และโครงเทมเพลต

| AC | ข้อกำหนด | จุดบังคับ | เทสแดงถ้าถอด |
|---|---|---|---|
| AC-EXP-02-1 | `TemplateSchema` รับ `expense`/`net_sales`/`shops.expense?` และโทเคนใหม่ · อย่างละ ≤1 · `strictObject` ยังปฏิเสธฟิลด์เกิน · **เทมเพลตเดิมที่เก็บในฐาน (ไม่มี `expense`) ผ่าน validate เหมือนเดิม — ไม่มี data migration** | `validations.ts` `BlockSchema` (`:101-116`, `shops` `:107` เติม `expense: v.optional(v.boolean())`) · `BLOCK_LIMITS` | `template-schema.test.ts` +≥6 แถว (ซ้ำ expense · `shops.expense:'x'` · ฟิลด์เกิน) · property: fixture เทมเพลตเดิมทุกชุดใน repo ยัง valid · **mutation:** ถอด limit ใหม่ → "ซ้ำ expense" แดง |
| AC-EXP-02-2 | **แบบมาตรฐานไม่เปลี่ยน:** `defaultTemplateFromFlags` ไม่ปล่อย `expense`/`net_sales`/`shops.expense` · golden เดิมเขียว **โดยไม่แก้ไฟล์ golden/`__golden__/`** | `template.ts:90-101` ไม่แตะ | `git diff --stat -- src/lib/line/__tests__/flex-summary-report.golden.test.ts src/lib/line/__tests__/__golden__` ว่างทุก PR ของงานนี้ (reviewer ตรวจ) + golden เขียว · property `default ∘ derive = identity` (EXT-01-3) ยังครบ 31 ชุด |
| AC-EXP-02-3 | `deriveFlags` คืน **key เดิมครบ 6 ตัวเท่านั้น** (ไม่รั่วลง `prisma.update` — F-9) · `deriveExposure`/`needExpense` เป็นฟังก์ชัน/ฟิลด์แยก | `template.ts` | `template.test.ts`: `Object.keys(deriveFlags(t)).sort()` เท่ารายการเดิมสำหรับเทมเพลตที่มี expense+net_sales+token ครบ · **mutation:** เพิ่ม `showExpense` ใน `deriveFlags` → แดง |
| AC-EXP-02-4 | `deriveExposure` = true เมื่อมีอย่างใดอย่างหนึ่ง: บล็อก `expense` · บล็อก `net_sales` · `shops.expense===true` · โทเคน `expense`/`net_sales` ในข้อความอิสระ (ครบ 5 ทางเข้า — กฎ OR ต้องกั้นทุก operand) | `template.ts` | ตาราง 5 แถว + แถว "ไม่มีสักทาง" → false · **mutation:** ตัดทางเข้า "โทเคน" → แถวโทเคนแดง |
| AC-EXP-02-5 | เทมเพลตที่มีแต่ `expense`/`net_sales` (ไม่มี flag ตัวเลขหลักเปิดเลย) → `INVALID_SETTINGS:METRIC_REQUIRED` 400 ไม่ใช่ raw DB error (F-10) · UI ปุ่มบันทึก disabled + ข้อความ `METRIC_REQUIRED_HELPER` เดิม (`settings-guards.ts` ต้องไม่นับ 2 บล็อกนี้) | `mergeSettings` เดิม (ไม่เขียนกฎใหม่) | `line-report-merge-settings.test.ts` + db test: PUT เทมเพลต `[net_sales]` → 400 `METRIC_REQUIRED` · `settings-guards.test.ts` ต่อยอด · **mutation:** ให้ `deriveFlags.showSales` เป็น true เมื่อมี `net_sales` → แดง |
| AC-EXP-02-6 | ความยาวข้อความอิสระ (≤120) นับโทเคนใหม่เป็นป้ายมาตรฐานคงที่ (`{ยอดขายหลังหักค่าใช้จ่าย}` = 24 code point) · `parseMarkup`/`serializeMarkup` round-trip รับโทเคนใหม่ (ไม่ชนป้ายเดิม เช่น `{ยอดขาย (นับแล้ว)}`) | `template.ts` `TOKENS` | ต่อยอด property round-trip 500 ตัวอย่างให้สุ่มรวมโทเคนใหม่ · `authoredLength` test |

### FR-LGS-EXP-03 — การแสดงผลในข้อความ (composer)

**การรวมข้ามร้าน (ตัดสินใจแล้วใน §13 Q-1 ค่าแนะนำ):** แถวรวมของ `expense`/`net_sales` แสดงก็ต่อเมื่อ **เหมือนกฎแถวกำไรรวมทุกข้อ** — `canSumProfit(shops)` (ทุกร้านกติกาการเงินเดียวกัน) ∧ ไม่มีร้าน `ERROR` ∧ ทุกร้านที่ `OK` มี `finance` เหตุผล (F-1): ค่าส่งขาไปนับเป็นค่าใช้จ่ายเฉพาะร้านบริการ → ผลรวมข้ามประเภทธุรกิจเป็นผลบวกของ "สิ่งที่นิยามต่างกัน" และ **ต่ำกว่าความจริงของร้านที่ไม่ใช่บริการเสมอ** · ร้านเดียวใน `listed` = ใช้ของร้านนั้นตรง ๆ (เทียบ A-3 ของ EXT-T)

**รูปแถว**

| กรณี | `expense` | `net_sales` |
|---|---|---|
| ปกติ (`expenseRecorded`) | `ค่าใช้จ่าย  ฿x` | บวก: `ยอดขายหลังหักค่าใช้จ่าย  ฿x` · ลบ: `ยอดขายต่ำกว่าค่าใช้จ่าย  ฿x` (ค่าสัมบูรณ์ — F-6) |
| ยังไม่มีบันทึก ∧ ยอด > 0 (ร้านบริการมีค่าส่ง) | `ค่าใช้จ่ายอย่างน้อย  ฿x` | บวก: `ยอดขายหลังหักค่าใช้จ่ายไม่เกิน  ฿x` · ลบ: `ยอดขายต่ำกว่าค่าใช้จ่ายอย่างน้อย  ฿x` |
| ยังไม่มีบันทึก ∧ ยอด = 0 | `ค่าใช้จ่าย  ยังไม่มีบันทึก` (**ไม่ใช่ ฿0** — BR-LGS-25) | `ยอดขายหลังหักค่าใช้จ่ายไม่เกิน  ฿x` (x = ยอดขาย) |

คำ "ไม่เกิน/อย่างน้อย" = ชุดเดียวกับ `profitDisplay` (HR16 — ห้ามคิดคำที่สาม) · ฟังก์ชันตัดสินป้าย/ข้อความอยู่ใน `format-money.ts` ข้าง `profitDisplay` (`netSalesDisplay(n,{capped})`, `expenseDisplay(n,{recorded})`) — ไม่เขียนป้ายใน composer

| AC | ข้อกำหนด | จุดบังคับ | เทสแดงถ้าถอด |
|---|---|---|---|
| AC-EXP-03-1 | `expense`/`net_sales` เข้า `TOTALS_TYPES` — ติดกับ orders/sales/cancelled/profit รวมเป็น section เดียวตามลำดับที่เจ้าของเรียง · แถวไม่ render (รวมไม่ได้ ฯลฯ) → **ข้ามแถว + `skipped.push({label, reason:'รวมค่าใช้จ่ายไม่ได้ในรอบนี้'})`** ไม่ render "-"/"฿0" (หลายร้านเท่านั้น — ร้านเดียวไม่มีแถวรวมเชิงโครงสร้าง = เงียบ เหมือน `profit` `:258-259`) | `flex-report-blocks.ts` `TOTALS_TYPES :242` · `renderTotals :245` | `flex-report-blocks.test.ts` (ไฟล์ใหม่ `flex-report-finance.test.ts`): ผสมกติกา · มี ERROR · ร้านเดียว · 12 ร้าน · **mutation:** ถอดเงื่อนไข `canSumProfit` → แถว "ผสมกติกา" แดง · ถอดเงื่อนไข "ไม่มี ERROR" → แดง |
| AC-EXP-03-2 | **ยอดติดลบ:** ป้ายพลิกเป็น "ยอดขายต่ำกว่าค่าใช้จ่าย" ค่าเป็น `formatBaht` (สัมบูรณ์ ไม่มี `฿-`) · สีค่า = INK (kv ปกติ) · **ห้ามแดง (`DANGER` = ดึงข้อมูลไม่สำเร็จ — BR-LGS-27/F-7) และห้ามเขียว** | `netSalesDisplay` + `kv` ไม่ส่ง `color` | test: `netSales=-500` → JSON มีป้ายใหม่ ไม่มีสตริง `-` นำหน้าตัวเลข · สแกนสีของ node ของ 2 แถวนี้ ⊆ {INK, SLATE} · **mutation:** ใส่ `color: DANGER` เมื่อติดลบ → แดง |
| AC-EXP-03-3 | แถว `net_sales` มีบรรทัดหมายเหตุใต้แถว (SLATE xs): `= ยอดขาย (นับแล้ว) − ค่าใช้จ่าย · ยังไม่หักต้นทุนสินค้า` · คำว่า "ต้นทุนสินค้า" ผันตาม vertical ของร้านที่นับ (`costNoun` จาก `ORDER_VOCAB` — บริการ "ต้นทุนอะไหล่", ที่พัก "ต้นทุนต่อห้อง", **ผสม = "ต้นทุน"**) ห้ามพิมพ์คำเอง · ข้อความ "= ยอดขาย (นับแล้ว) − …" ใช้ได้เพราะ AC-EXP-01-2 (parity) บังคับอยู่ | helper `reportCostNoun(shops)` ข้าง `reportOrderWord` (`flex-report-blocks.ts:45`) | test ต่อ vertical ONLINE/SERVICE/LODGING/ผสม · **mutation:** ฮาร์ดโค้ด "ต้นทุนสินค้า" → แถว SERVICE แดง |
| AC-EXP-03-4 | หมายเหตุ "ค่าใช้จ่ายลงตามวันที่บันทึก ไม่เฉลี่ยรายวัน" ขึ้น **ทุกครั้งที่มี `expense`/`net_sales`/`shops.expense` ในข้อความ** (1 บรรทัด/section — ไม่ใช่เฉพาะตอน capped เหมือน `:313`) · ข้อความ = ค่าคงที่เดียวกับที่ `:314` ใช้ (extract ค่าคงที่ ไม่ copy สตริง) · อยู่ในกลุ่มหมายเหตุอัตโนมัติ (ล็อก — เอาออกไม่ได้ตามโครงสร้าง, BR-LGS-24) | `renderTotals`/`renderShops` + ค่าคงที่ร่วม | test: ทุกเทมเพลตที่ valid และมีบล็อกการเงินใหม่ → มีบรรทัดนี้ (สุ่ม 200 ชุด ต่อยอด AC-EXT-13-1) · **mutation:** ลบหมายเหตุ → แดง · golden เดิม (ไม่มีบล็อกใหม่) ไม่เปลี่ยนไบต์ |
| AC-EXP-03-5 | `shops.expense=true` → แถว `ค่าใช้จ่าย ฿x` ต่อร้านใต้ชื่อร้าน (รูปแถวตามตารางข้างบน) · ตัดที่ **ระดับ ≥3** พร้อมกับกำไรต่อร้าน (`level < 3` เหมือน `:285`) · ผสมกติกา → foot note "ค่าใช้จ่ายแต่ละร้านคิดตามกติกาของประเภทธุรกิจ จึงไม่รวมเป็นยอดเดียว" (คู่กับ `:310-312`) · ร้าน `ERROR` = แถว "ดึงข้อมูลไม่สำเร็จ" เดิม ไม่มีแถวค่าใช้จ่าย | `renderShops :266` | test: 1/2/12 ร้าน · ผสมกติกา · ERROR · ระดับ 3 · **mutation:** เปลี่ยน `level < 3` เป็น `level < 4` → แถวระดับ 3 แดง |
| AC-EXP-03-6 | ลำดับตัดทอน (EXT-08) **ไม่เปลี่ยน** และแถวรวม `expense`/`net_sales` + หมายเหตุของมัน **ไม่ถูกตัดทุกระดับ** (ตัวเลขหลัก) · `measureTemplate` fixture เลวร้ายสุดเติม `finance` ทุกร้าน + เทมเพลตที่มี `expense`+`net_sales`+`shops.expense`+ข้อความอิสระเต็ม ที่ระดับ 3 ต้อง ≤30,000 ไบต์ หรือบันทึกไม่ได้ (`TEMPLATE_TOO_LARGE`) | `template-size.ts` `worstCaseSummary` (`:43` เติม `finance`) · `fitToLimits` ไม่แตะ | `template-size.test.ts` ต่อยอด: เทมเพลตการเงินเต็ม + 6×120 ตัวอักษร → ผลตามจริง (ผ่านพร้อม warning หรือถูกปฏิเสธ — ห้ามบันทึกได้แล้วไปล้มตอนส่ง) · test: ข้อความระดับ 4 ยังมีแถวการเงินครบ |
| AC-EXP-03-7 | **altText:** เพิ่ม `ค่าใช้จ่าย ฿x` / `ยอดขายหลังหักค่าใช้จ่าย ฿x` (ใช้ข้อความจาก `expenseDisplay`/`netSalesDisplay` ตัวเดียวกับแถว) เมื่อมีบล็อกและรวมได้ — ตามเงื่อนไขเดียวกับแถว · ไม่มีบล็อก = ไม่เปลี่ยน altText เดิมไบต์ (golden) · ยังถูกตัดที่ `ALT_TEXT_MAX` ตามเดิม | `flex-summary-report.ts:111-131` `renderAltText` (เช็ค "มีบล็อก" จาก `template.blocks` ตรง ๆ เพราะ `deriveFlags` ไม่มี key นี้) | test: มี/ไม่มีบล็อก × รวมได้/ไม่ได้ · golden เดิมเขียว |
| AC-EXP-03-8 | การกระจายยอดรวม = ผลบวกรายร้านที่แสดง (ต่อ AC-EXT-06-3): `Σ shops.expense` ที่แสดง = แถวรวม `expense` ทุกลำดับบล็อก · แถวรวมรวมจาก `ShopSummary.finance` ของร้าน `OK` ผ่าน helper `combineFinance` ใน `aggregate.ts` (pure, ไม่ใช้ `summary.total`) · ปัดผลรวมด้วย `round2` | `aggregate.ts` | property test 200 ชุด (สลับลำดับบล็อก/จำนวนร้าน) · **mutation:** รวมร้าน ERROR ด้วย → แดง |
| AC-EXP-03-9 | การข้ามที่ "ไม่พร้อมตามเงื่อนไข" บันทึกลง `LineReportDelivery.summary` เช่น `3 ร้าน · ข้าม: ค่าใช้จ่าย` (ไม่มียอดเงิน — DATABASE §3.5) ผ่านกลไก AC-EXT-05-2 เดิม | `diagnostics` → `send.service` | `line-report-send-sweep.db.test.ts` ต่อยอด: กลุ่มผสมกติกา + บล็อก `expense` → `summary` มี "ข้าม: ค่าใช้จ่าย" |

### FR-LGS-EXP-04 — โทเคนในข้อความอิสระ

| key | ป้ายที่เห็น | ค่า | `null` (ตัดบรรทัด+บันทึก) เมื่อ |
|---|---|---|---|
| `expense` | {ค่าใช้จ่าย} | ปกติ `฿x` · ยังไม่มีบันทึก ∧ >0 `อย่างน้อย ฿x` | ไม่มีร้าน OK · หลายร้านและรวมไม่ได้ (กฎ EXP-03) · ยังไม่มีบันทึก ∧ ยอด 0 (ห้ามเขียน ฿0) |
| `net_sales` | {ยอดขายหลังหักค่าใช้จ่าย} | บวก `฿x` · capped `ไม่เกิน ฿x` · ลบ `ติดลบ ฿x` · ลบ+capped `ติดลบอย่างน้อย ฿x` | ไม่มีร้าน OK · หลายร้านและรวมไม่ได้ |

🛑 ค่าของโทเคนต้อง **พกทิศทางไปกับตัวเลข** (คำนำหน้า) เพราะโทเคนไปอยู่กลางประโยคที่เจ้าของเขียนเอง ไม่มีป้ายของแถวคอยบอก (F-11)

| AC | ข้อกำหนด | จุดบังคับ | เทสแดงถ้าถอด |
|---|---|---|---|
| AC-EXP-04-1 | `tokenValue` เพิ่ม 2 case ตามตาราง · ข้อความอิสระที่โทเคน `null` ถูกตัดทั้งบล็อก (กลไก BR-LGS-25 เดิม ไม่เขียนใหม่) | `flex-report-blocks.ts:151` `tokenValue` + `netSalesInline`/`expenseInline` ใน `format-money.ts` | ตาราง 8 แถว: ประโยค "วันนี้ {ยอดขายหลังหักค่าใช้จ่าย}" × {บวก, capped, ลบ, ลบ+capped} · ผสมกติกา · ไม่มีบันทึก+0 → บล็อกถูกตัด ไม่มี `-`/`฿0` · **mutation:** คืนค่าสัมบูรณ์เปล่า ๆ ตอนติดลบ → แถว "ลบ" แดง |
| AC-EXP-04-2 | โทเคนใหม่ใน `text` ⇒ `deriveExposure=true` ⇒ ต้องผ่านด่านยืนยัน (EXP-05) · ไม่พลิก `show*` ตัวไหน | `deriveExposure` | test: เทมเพลตมีแต่ {ค่าใช้จ่าย} ในข้อความ ไม่ confirm → `EXPENSE_CONFIRM_REQUIRED` |

### FR-LGS-EXP-05 — ด่านยืนยัน (Q3) — ไม่ต้องมีคอลัมน์ใหม่

กติกา: ตอน `updateTemplate` เทียบ **การเปิดเผยการเงินของเทมเพลตที่บันทึกไว้เดิม** (`deriveExposure(prev)`; `template=null` = false) กับฉบับใหม่ · `false→true` ต้องมี `confirmExpense:true` มิฉะนั้น error · ค้างเปิดไว้แล้ว = ไม่ถามซ้ำ · reset (DELETE) → `template=null` ⇒ กลับมาเปิดใหม่ต้องยืนยันใหม่ (ตรงกับกำไรที่ reset ล้าง `showProfit`) · **ไม่มี `expenseEnabledAt`** (รับทราบ — ดู §9 R-5; กำไรมี `profitEnabledAt` ที่ความหมายเดิมคงไว้)

| AC | ข้อกำหนด | จุดบังคับ | เทสแดงถ้าถอด |
|---|---|---|---|
| AC-EXP-05-1 | `PUT …/template` body เพิ่ม `confirmExpense?: boolean` · เปิดเพิ่ม (false→true ทางใดก็ได้ใน 5 ทาง) ไม่มี `confirmExpense:true` → 400 `EXPENSE_CONFIRM_REQUIRED` ก่อนเขียนอะไร · ใช้ `template` ที่ select ตอนล็อกกลุ่มใน tx เดียวกัน (กัน race) | `updateTemplate` (`group.service.ts:253`) — select เพิ่ม `template: true` (ตอนนี้เลือกแค่ `templateVersion` `:267`) + ฟังก์ชัน pure `needsExpenseConfirm(prevT, nextT)` ใน `template.ts` | `line-report-services.db.test.ts` ต่อยอด: (ก) null→มี expense ไม่ confirm → 400 (ข) confirm → ผ่าน (ค) มีอยู่แล้วแก้ข้อความอื่น ไม่ confirm → ผ่าน (ง) reset แล้วเพิ่มใหม่ → 400 · **mutation:** ข้ามการเทียบ prev → (ค) หรือ (ก) แดง |
| AC-EXP-05-2 | `EXPENSE_CONFIRM_REQUIRED` 400 อยู่ใน `LineReportErrorCode` + `LINE_REPORT_ERROR_STATUS` (exhaustive) + route-catch ของ PUT | `errors.ts` · `_shared.ts` | เทสเดิม "วนทุกค่าของ `LineReportErrorCode` ยืนยันมี status" แดงถ้าลืม map |
| AC-EXP-05-3 | PATCH เดิมไม่เกี่ยว (ไม่มี flag ใหม่ให้ PATCH) · `mergeSettings` + `profitEnabledAt` **ไม่แก้** | — | `line-report-merge-settings.test.ts` เดิมเขียวโดยไม่แก้ |
| AC-EXP-05-4 | UI: เปิดทางใดก็ได้ใน 5 ทาง → Swal ยืนยัน (`pacesConfirm.warning`) **ก่อนบล็อก/ตัวเลือก/โทเคนลงผืนงาน** · ข้อความ: หัว "แสดงค่าใช้จ่ายในกลุ่ม LINE?" · เนื้อ "ทุกคนในกลุ่มนี้จะเห็นค่าใช้จ่ายและยอดขายหลังหักค่าใช้จ่ายของร้านที่เลือก ปิดได้ทุกเมื่อ" · ปุ่ม "แสดงค่าใช้จ่าย"/"ยกเลิก" · ยกเลิก = ไม่ลง · ฟังก์ชันตัดสินแยกจาก JSX เหมือน `confirm-profit.ts` (`needsExpenseConfirm`, `confirmExpenseExposure`, `expenseNeedsConfirmation` สำหรับพิมพ์โทเคนเอง) · เปิดกำไร+ค่าใช้จ่ายพร้อมกัน = ถามแยกตามทางเข้า (ไม่รวมคำถาม) · แถบเตือนถาวรเมื่อเทมเพลตมีการเงินใหม่ | `template/lib/confirm-expense.ts` (ใหม่ — ข้างไฟล์ `confirm-profit.ts`) | unit `confirm-expense.test.ts` ทุกเส้นทาง (ตามแบบ `confirm-profit.test.ts`) · Playwright 3 ทางเข้า |

### FR-LGS-EXP-06 — หน้าจัดข้อความ (UI)

| AC | ข้อกำหนด | จุดบังคับ | เทสแดงถ้าถอด |
|---|---|---|---|
| AC-EXP-06-1 | คลังเพิ่มบล็อก `expense` ("ค่าใช้จ่าย"), `net_sales` ("ยอดขายหลังหักค่าใช้จ่าย") ในกลุ่ม "ข้อมูล" ต่อท้าย `profit` · คำอธิบายเตือนเหมือน `profit` (`block-meta.ts:107`): "ทุกคนในกลุ่มจะเห็น — ถามยืนยันก่อนเพิ่ม" · ใส่ซ้ำไม่ได้ (limit 1) ตามกลไก `libraryAvailability` เดิม · **ชื่อ icon: ไม่เดา — ยืนยันกับ gallery ธีม Paces ที่ UX gate (T6) ก่อนเขียน** (HR12; `profit` ใช้ `coin` อยู่แล้ว `block-meta.ts:16`) | `block-meta.ts` (`:16, :30, :50, :65, :91, :107`) | `block-meta` test: ทุก `BlockType` มี label/icon/ตัวสร้างเริ่มต้น (ต่อยอดเทสเดิมที่ครอบ type ครบ) |
| AC-EXP-06-2 | ตัวเลือกบล็อกรายร้านเพิ่มสวิตช์ "ค่าใช้จ่ายต่อร้าน" ข้าง "กำไรต่อร้าน" (ค่าเริ่ม false · `makeBlock('shops')` ใส่ `expense:false`) · สรุปบรรทัดย่อยในผืนงานเพิ่ม "ค่าใช้จ่ายต่อร้าน" (`block-meta.ts:52`) | `CanvasList.tsx`, `block-meta.ts`, `reducer.ts` | `reducer.test.ts` ต่อยอด: toggle `shops.expense` · เทมเพลตเดิมที่ไม่มี `expense` โหลดเป็น false ไม่ dirty |
| AC-EXP-06-3 | ปุ่ม "+ ข้อมูล" ในตัวแก้ข้อความมีโทเคนใหม่ 2 ตัว (ป้ายตามตาราง FR-04) · ถ้าใส่โทเคนที่ ณ ตอนนี้รวมไม่ได้ (กลุ่มผสมกติกา) → warning ในผืนงานแบบเดียวกับกำไร (`draft-issues.ts`) "กลุ่มนี้มีร้านต่างประเภทธุรกิจ — ค่าใช้จ่ายรวมจะไม่ถูกส่ง ใช้ 'ค่าใช้จ่ายต่อร้าน' แทน" | `TextBlockEditor.tsx`, `draft-issues.ts`, `availability.ts` (`blockWarning`) | `availability.test.ts` + `draft-issues.test.ts` ต่อยอด · ไม่ลบเงียบ |
| AC-EXP-06-4 | พรีวิว: ข้อมูลตัวอย่างเติม `finance` ให้ร้าน OK (`withSampleFinance` ข้าง `withSampleProfit` `preview-sample.ts:90`) ครอบ 3 สถานะ: ปกติ · ยังไม่มีบันทึก · ติดลบ (สลับตัวอย่างที่ UI ได้หรืออย่างน้อยมีร้านติดลบ 1 ร้านใน fixture เลวร้ายสุด) · พรีวิวผ่าน composer ตัวเดียวกัน (AC-EXT-06-4) | `preview-sample.ts`, `template/lib/preview-data.ts` | `preview-data.test.ts` ต่อยอด: JSON พรีวิว = JSON ที่ `send` สร้างจาก `ShopSummary` ชุดเดียวกัน |
| AC-EXP-06-5 | ปฏิบัติตาม HR1/3/5/7/8/9/10/12 · ใช้ `pacesToast`/`pacesConfirm` · commit ที่แตะ UI มี `Base: theme/...` · ผ่าน `safepay-ux` ก่อน build และ `/impeccable critique` + `clarify` หลัง build | — | reviewer grep |

---

## 5. Business Rules เพิ่ม (ต่อจาก BR-LGS-30 ใน EXT-T)

| BR | กฎ | FR |
|---|---|---|
| **BR-LGS-31** | "ค่าใช้จ่าย" ในรายงาน = `totalExpense` ของ `getPnlReport` เท่านั้น · "ยอดขายหลังหักค่าใช้จ่าย" = `revenue − totalExpense` · **ไม่ใช่กำไร** (ยังไม่หักต้นทุนสินค้า — ต้องบอกในข้อความ) · ห้ามเรียกสองตัวนี้ว่า "กำไร" (HR16 — นิยามเดียวทั้งระบบ; `SALES_PROFIT_FORMULA`/`NET_PROFIT_FORMULA` คนละตัว) | EXP-01, 03 |
| **BR-LGS-32** | ค่าใช้จ่ายที่ยังไม่มีบันทึกเลยในช่วง = "ยังไม่รู้" ไม่ใช่ ฿0 → ใช้ป้าย "ยังไม่มีบันทึก/อย่างน้อย/ไม่เกิน" ชุดเดียวกับกำไร | EXP-03, 04 |
| **BR-LGS-33** | ยอดรวมข้ามร้านของค่าใช้จ่ายและยอดหลังหักค่าใช้จ่าย ใช้กฎเดียวกับกำไรรวม: ทุกร้านกติกาการเงินเดียวกัน ∧ ไม่มีร้านล้ม · ไม่ผ่าน = ไม่ส่งแถวรวม + บันทึก (ไม่ประมาณ ไม่รวมบางส่วน) · ดูรายร้านได้ด้วย `shops.expense` | EXP-03 |
| **BR-LGS-34** | ค่าใช้จ่ายลงตามวันที่บันทึก (`expenseDate`) ไม่เฉลี่ยรายวัน — ต้องมีหมายเหตุอัตโนมัติเสมอเมื่อมีบล็อกการเงินใหม่ (ล็อก) | EXP-03 |
| **BR-LGS-35** | ทิศทางของยอดติดลบสื่อด้วยคำ ไม่ใช้เครื่องหมายลบ ไม่ใช้สีแดง/เขียว (แดง = ดึงข้อมูลไม่สำเร็จ ต่อ BR-LGS-27) | EXP-03, 04 |
| **BR-LGS-36** | การเปิดค่าใช้จ่าย/ยอดหลังหักค่าใช้จ่ายทุกทางเข้า (บล็อก · ตัวเลือกต่อร้าน · โทเคน) ต้องผ่านขั้นยืนยัน · ฝั่ง server ตัดสินจากการเทียบกับเทมเพลตที่บันทึกไว้ ไม่เชื่อ client | EXP-05 |

---

## 6. Edge Cases (ทุกข้อต้องมี fixture ในเทส)

| # | กรณี | พฤติกรรมที่กำหนด | อ้าง AC |
|---|---|---|---|
| E-1 | **กลุ่มผสมกติกาการเงิน** (บริการ + ขายของ/ที่พัก) | ไม่ส่งแถวรวม `expense`/`net_sales` + บันทึก "ข้าม" · `shops.expense` ใช้ได้ + foot note · หมายเหตุ "ยอดแต่ละร้านคิดตามกติกา…" เดิมขึ้นตามปกติ · UI warning ในผืนงาน | 03-1, 03-5, 06-3 |
| E-2 | **ร้าน ERROR ในกลุ่มหลายร้าน** | ไม่ส่งแถวรวม (ไม่รวมบางส่วน) + บันทึก · หมายเหตุสีแดง "ยอดรวมยังไม่ครบ…" เดิม · แถวร้านนั้นใน `shops.expense` = "ดึงข้อมูลไม่สำเร็จ" | 03-1, 03-5 |
| E-3 | **ร้านเดียวและ ERROR** | ไม่ส่งทั้งข้อความ (`ALL_SHOPS_FAILED` เดิม) · โทเคน null | 01-5 |
| E-4 | **ค่าใช้จ่ายมากกว่ายอดขาย** (ยอดหลังหักติดลบ) | ป้าย "ยอดขายต่ำกว่าค่าใช้จ่าย" ค่าสัมบูรณ์ สี INK · โทเคน "ติดลบ ฿x" · altText ใช้ข้อความเดียวกับแถว | 03-2, 04-1 |
| E-5 | **ยังไม่มีบันทึกค่าใช้จ่ายเลย** (วันธรรมดา ร้านลงค่าใช้จ่ายสิ้นเดือน — ใกล้เคียงกรณีส่วนใหญ่ของรายวัน) | `expense` = "ยังไม่มีบันทึก" · `net_sales` = "ไม่เกิน ฿ยอดขาย" · โทเคน `expense` ตัดบรรทัด+บันทึก · หมายเหตุวันที่บันทึกขึ้นเสมอ — *ผลคือรายงานรายวันจะขึ้น "ไม่เกิน" บ่อยสำหรับร้านที่ไม่ลงค่าใช้จ่ายรายวัน ซึ่งตรงความจริงและตรงกับป้ายกำไรบนหน้าการเงิน (F-5)* | 03, BR-LGS-32 |
| E-6 | **ร้านบริการมีแต่ค่าส่งขาไป (ไม่มี Expense แถว)** | `expenseRecorded=false` · `expense` ="ค่าใช้จ่ายอย่างน้อย ฿ค่าส่ง" (เกณฑ์เดียวกับ `resolveDataCompleteness` — บอกว่ายังไม่ครบ ไม่ซ่อน) | 01-3, 03 |
| E-7 | **ค่าส่งยังไม่ถูกคิดเงินจริง** (`shippingPendingCount > 0` ร้านบริการ) | `totalExpense` ใช้ราคาประมาณตามที่ `pnl.service:100-104` ทำอยู่แล้ว · รายงานนี้ไม่มีป้ายพิเศษ (หน้าการเงินก็ไม่ได้ซ่อนในตัวเลขรวม) — **รับทราบเป็น known behavior** (Assumption A-4) | — |
| E-8 | **ใบคืน/คืนบางส่วนของร้านบริการ** | `revenue` ใน pnl หักแล้ว ตรงกับยอดขาย (นับแล้ว) เดิม (F-3) · ค่าส่งขากลับนับเป็นค่าใช้จ่ายตาม `receivedAt` (ไม่ใช่วันที่เปิดใบ) — หมายเหตุ "ลงตามวันที่บันทึก" ใช้ข้อความเดิม (ไม่ละเอียดรายองค์ประกอบ) | 01-2 |
| E-9 | **รายเดือน / รอบตัดเดือน** | ใช้ `getPnlReport` ช่วงของหน้าต่างรายเดือนผ่าน memo key `shopId:start:end` · ข้อความรายวัน+รายเดือนใน push เดียวกันใช้เทมเพลตเดียวกัน (EXT-06-5) แต่ **ตัวเลขของแต่ละใบตามหน้าต่างของใบนั้น** | 01-4 |
| E-10 | **ยอดขายหลังหักค่าใช้จ่าย = ฿0 พอดี** | `positive` (n ≥ 0) ป้าย "ยอดขายหลังหักค่าใช้จ่าย ฿0" (รู้ว่า 0 จริง เมื่อ `expenseRecorded`) | 03 |
| E-11 | **ชื่อร้านยาว 50 ตัวอักษร/ป้ายยาว** "ยอดขายต่ำกว่าค่าใช้จ่ายอย่างน้อย" ใน `kv` | `wrap:true` ห่อบรรทัด ไม่ล้น (fixture ในเทสสแน็ปช็อต) | 03-6 |
| E-12 | **`skipWhenNoOrders=true` และวันนั้นมีค่าใช้จ่ายแต่ไม่มีออเดอร์** | ยังถูกข้ามตามกติกาเดิม (ตัดสินด้วยจำนวนออเดอร์ ไม่เกี่ยวค่าใช้จ่าย) — ไม่เปลี่ยน (Assumption A-5) | — |
| E-13 | **ข้อมูล ณ 18:00 (ยังไม่จบวัน)** | หัวรายงาน "ข้อมูล ณ HH:MM น." เดิมบอกอยู่แล้ว · ค่าใช้จ่ายที่ร้านยังไม่ได้บันทึกตอนเย็นไม่มีทางรู้ → ความเสี่ยง §9 R-4 (รับทราบ) | — |
| E-14 | **ปิดบล็อกการเงินแล้วบันทึกใหม่** | ปกติ ไม่ถามยืนยัน (ปิด ไม่ใช่เปิด) · ไม่เรียก `getPnlReport` อีก (AC-EXP-01-4) | 01-4, 05-1 |
| E-15 | **โหลดเทมเพลตเดิมที่ไม่มี `shops.expense`** | ตีความเป็น false · ไม่ dirty · บันทึกใหม่ไม่ถามยืนยัน | 02-1, 06-2 |
| E-16 | **แพ็กเกจหยุด** | PUT/DELETE 403 เหมือนเดิม · เทมเพลตที่มีบล็อกการเงินเก็บไว้ กลับ ACTIVE ใช้ต่อได้โดยไม่ถามยืนยันซ้ำ | EXT-10-6 |

---

## 7. Data model impact

**ไม่มี migration · ไม่แก้ `schema.prisma` · ไม่เพิ่มคอลัมน์ · ไม่เพิ่ม enum DB**

- เทมเพลตเป็น JSON ใน `LineReportGroup.template` (`v:1`) — ฟิลด์ใหม่เป็น additive/optional (`shops.expense?`) และบล็อก/โทเคนใหม่ → ฟังก์ชัน validate ฝั่ง app รับเอง · CHECK ขนาด `octet_length ≤ 16384` เดิมยังครอบ
- **`metric_any_chk` (CHECK `showOrders ∨ showSales ∨ showCancelled ∨ showTopProducts ∨ showProfit`) ไม่แก้:** บล็อก `expense`/`net_sales` **ไม่นับเป็น "ตัวเลข"** (ขยาย A-4 ของ EXT-T) เพราะไม่มีคอลัมน์ `show*` รองรับ และ `deriveFlags` ห้ามเพิ่ม key (F-9) → เทมเพลตที่มีแต่ 2 บล็อกนี้บันทึกไม่ได้ (`METRIC_REQUIRED`) · ถ้า user ต้องการ "รายงานค่าใช้จ่ายล้วน ๆ" ต้อง migrate (คอลัมน์ `showExpense` + ผ่อน CHECK) — อยู่ใน Q-2
- ไม่มี `expenseEnabledAt` (ไม่มี column) → ไม่บันทึกเวลายืนยัน (§9 R-5)
- `LineReportDelivery`: ไม่เปลี่ยนสคีมา — ใช้ `summary` เดิมเก็บ "ข้าม: …"
- Sync เอกสาร: `DATABASE.md` (บันทึกว่าไม่เปลี่ยน + หมายเหตุ CHECK) · `docs/SRS.md` (validation/enum — HR11)
- **ไม่มี HR15 (migration prod)** — ไม่ต้องแจ้ง 3 ข้อ

---

## 8. API

| Method | Path | Auth | การเปลี่ยน |
|---|---|---|---|
| PUT | `/api/line-report/groups/{id}/template` | L2 | body เพิ่ม `confirmExpense?: boolean` · `template` รับบล็อก/ฟิลด์ใหม่ (Valibot) · error ใหม่ `EXPENSE_CONFIRM_REQUIRED` |
| อื่น ๆ | — | — | ไม่เปลี่ยน (GET `effectiveTemplate` ส่งเทมเพลตตามที่เก็บ — ไม่มี expense ในแบบมาตรฐาน) |

| Error | HTTP | throw ที่ | route ที่ต้องครอบ |
|---|---|---|---|
| `EXPENSE_CONFIRM_REQUIRED` | 400 | `updateTemplate` | PUT (ผ่าน `toErrorResponse` เดิม + เพิ่มใน `LINE_REPORT_ERROR_STATUS`) |

Sync: `API.md` (§ PUT template + error) · `docs/SRS.md` API reference/enum error

---

## 9. NFR และ Risks

**NFR**

| NFR | ข้อกำหนด |
|---|---|
| NFR-EXP-1 ประสิทธิภาพ | ไม่เพิ่ม query ต่อร้านนอกจากชุดของ `getPnlReport`+`listExpenses` ที่กำไรใช้อยู่ · เรียกครั้งเดียวต่อ (ร้าน, ช่วง) ผ่าน memo · QA วัดเวลา sweep กลุ่ม 10 ร้านที่เปิดบล็อกการเงิน (ก่อน/หลัง) — `getPnlReport` ยังดึงช่วงก่อนหน้าไปคำนวณ %เปลี่ยนที่รายงานไม่ใช้ **ไม่ optimize ตอนนี้ (YAGNI) ถ้าวัดแล้วเกินงบเวลา sweep ค่อยเสนอแยก** |
| NFR-EXP-2 ความเป็นส่วนตัว | log ใหม่ prefix `[line-report]` ไม่มียอดเงิน/เนื้อหาข้อความ · `summary` ไม่มียอด |
| NFR-EXP-3 ความเข้ากันได้ | กลุ่ม/เทมเพลตเดิมไม่เปลี่ยนไบต์ (AC-EXP-02-2) · rollback โค้ดปลอดภัย (ไม่มี migration) — เทมเพลตที่บันทึกบล็อกใหม่แล้วโดนโค้ดเก่า validate ไม่ผ่าน → `resolveReportConfig` ตกไปแบบมาตรฐาน (`report-config.ts:36-39`) = known behavior |

**Risks**

| # | ความเสี่ยง | ผลถ้าพลาด | การป้องกัน (ต้องบังคับได้) |
|---|---|---|---|
| **R-1** | `deriveFlags` รั่ว key ใหม่ลง `prisma.update` (F-9) | PUT เทมเพลตทุกฉบับล้ม (Prisma unknown field) | AC-EXP-02-3 (เทส key set) |
| **R-2** | เปิด pnl เพราะค่าใช้จ่ายแล้วกำไรรั่วโดยไม่ยืนยัน (ใช้ cache ร่วม) | กำไรโผล่ในกลุ่มที่ไม่เคยยืนยัน | AC-EXP-01-4 (`profit` เติมเฉพาะ `showProfit`) |
| **R-3** | pnl ล้ม → ทั้งร้านเป็น ERROR (ยอดขายหายด้วย — F-12) กลุ่มที่เพิ่มบล็อกการเงินเสี่ยงขึ้นเท่ากับกลุ่มที่เปิดกำไร | รายงานที่เคยครบกลายเป็นไม่ครบ | พฤติกรรมเดียวกับกำไรที่ prod อยู่ — **ไม่แยก failure domain ในรอบนี้** (เสนอเป็นงานแยกถ้า QA เจอบ่อย) · หมายเหตุสีแดงเดิมบอกผู้อ่านอยู่แล้ว |
| **R-4** | ค่าใช้จ่ายที่ร้านลงช้ากว่าเวลารายงาน (ลงตอนค่ำ) ทำให้ยอดหลังหักค่าใช้จ่ายสูงเกินจริง ณ เวลาส่ง และไม่ติดป้าย "ไม่เกิน" เมื่อมีบางรายการแล้ว | ทีมเชื่อตัวเลขที่ยังไม่ครบ | หมายเหตุวันที่บันทึก (BR-LGS-34) + หัว "ข้อมูล ณ HH:MM" + ป้าย `ไม่เกิน` เมื่อไม่มีบันทึกเลย · ข้อจำกัดนี้ **เกณฑ์ completeness เดิมของระบบ** (`expenseCount>0`) — ไม่เปลี่ยนเกณฑ์ในรอบนี้ · บันทึกใน TestCase |
| **R-5** | ไม่มี `expenseEnabledAt` → ตรวจย้อนหลังไม่ได้ว่าเปิดเมื่อไร | audit ได้แค่ `templateVersion` | ยอมรับ (ไม่ migrate) · ถ้า user ต้องการ audit → รวมใน Q-2 |
| **R-6** | ผู้อ่านเทียบ "ยอดขาย (นับแล้ว)" − "ค่าใช้จ่าย" กับ "ยอดหลังหักค่าใช้จ่าย" แล้วไม่ตรง (F-3 พิสูจน์ตามโค้ดว่าควรตรง แต่เป็นคอมเมนต์) | เสียความน่าเชื่อถือ | AC-EXP-01-2 parity บนฐานจริง + สูตรเขียนในหมายเหตุของแถว (AC-EXP-03-3) |
| **R-7** | ข้อความยาวเกิน 30KB เมื่อมีบล็อกใหม่ + ข้อความอิสระ | ล้มตอนส่ง | AC-EXP-03-6 (ด่านตอนบันทึก fixture เลวร้ายสุด) |
| **R-8** | ทดสอบ DB ชี้ prod | ลบ/ล้างข้อมูลจริง (HR13/14) | เทส DB ปักหมุด `localhost:5434` · scope ด้วย id ที่เทสสร้าง · `npm test` override `DATABASE_URL` |

---

## 10. Out of Scope

| MVP นี้ไม่ทำ | หมายเหตุ |
|---|---|
| ค่าใช้จ่ายแยกหมวด/ตามผู้จ่าย · รายการค่าใช้จ่ายรายตัวในข้อความ | ยอดรวมเท่านั้น (ตามมติ Q1) |
| ยอดหลังหักค่าใช้จ่ายต่อร้าน (`shops.netSales`) | มติ Q4 ให้เฉพาะ "ค่าใช้จ่ายต่อร้าน" · เพิ่มได้ภายหลังเป็นสวิตช์ในบล็อกรายร้าน (ข้อมูลมีอยู่แล้วใน `ShopFinance`) |
| กราฟค่าใช้จ่าย / กราฟยอดหลังหักค่าใช้จ่าย | EXT-T §11 ยังไม่เปลี่ยน |
| %เปลี่ยนเทียบช่วงก่อน / เทียบงบประมาณ | `getPnlReport` มี `prevExpense` แต่รายงานนี้ไม่ใช้ |
| รายงานที่มีแต่ค่าใช้จ่าย (ไม่มีตัวเลขหลักเลย) | ต้อง migrate คอลัมน์ + ผ่อน CHECK → Q-2 |
| บันทึกเวลายืนยันเปิดค่าใช้จ่าย (`expenseEnabledAt`) | ต้อง migrate → Q-2 |
| แยก failure domain ของ pnl (ร้านไม่ ERROR เมื่อ pnl ล้ม) | R-3 · งานแยก |
| ปรับ `getPnlReport` ไม่ให้ดึงช่วงก่อนหน้า | NFR-EXP-1 · วัดก่อนค่อยทำ |
| แก้โทเคน `{กำไร}` ให้พกทิศทาง/ป้ายเพดาน | Q-3 (ช่องโหว่เดิม ไม่ใช่ของรอบนี้ — ต้องมติ) |
| Phase 2 (PRD §8 ของ 00070): รายสัปดาห์ · หลายภาษา · OA ของร้านเอง ฯลฯ | ไม่เปลี่ยน |

---

## 11. Assumptions (สมมติแล้วจด — ถ้าผิดค่อยแก้)

| # | สมมติฐาน |
|---|---|
| A-1 | ยืนยันด้วยฟิลด์แยก `confirmExpense` + error `EXPENSE_CONFIRM_REQUIRED` (ไม่ยัดเข้า `confirmProfit` เพราะความหมายต่างกัน และ `PROFIT_CONFIRM_REQUIRED` ผูกกับ `profitEnabledAt`) |
| A-2 | บล็อก `expense`/`net_sales` ไม่นับเป็น "ตัวเลข" ของกติกา ≥1 (F-10) |
| A-3 | ป้าย capped ของค่าใช้จ่าย/ยอดหลังหักค่าใช้จ่ายขึ้นกับ `expenseRecorded` เท่านั้น ไม่เกี่ยวต้นทุนสินค้า (เพราะไม่หักต้นทุน — บอกในหมายเหตุแล้ว) |
| A-4 | ค่าส่งขาไปที่ยังเป็นราคาประมาณ (ร้านบริการ) นับรวมตามที่ `getPnlReport` ทำ ไม่ติดป้ายพิเศษในรายงาน (E-7) |
| A-5 | `skipWhenNoOrders` ไม่เปลี่ยน — วันที่มีแต่ค่าใช้จ่ายไม่มีออเดอร์ยังถูกข้าม (E-12) |
| A-6 | เจ้าของกลุ่ม = เจ้าของที่จ่ายแพ็กเกจเท่านั้นแก้เทมเพลตได้ (สิทธิ์เดิมของ PUT — ไม่เปลี่ยน) |
| A-7 | `net_sales` ใช้ตัวเลขจาก pnl ตามมติ Q2 แม้ parity (F-3) บอกว่าเท่ากับยอดขาย (นับแล้ว) − ค่าใช้จ่าย — เก็บเป็นสองแหล่งพร้อมเทสผูก ไม่รวมเป็นแหล่งเดียวเพราะมติ user ระบุ pnl |

---

## 12. ผลต่อ FR/AC เดิม และเอกสารที่ต้อง sync

| ของเดิม | ผลกระทบ |
|---|---|
| TFR-LGS-11 / AC-EXT-07-4 "showProfit=false ⇒ ไม่เรียก getPnlReport" | **ปรับถ้อยคำ:** "ไม่เรียกเมื่อ `showProfit=false ∧ needExpense=false`" · เทส "ไม่มีกำไร → ไม่เรียก pnl" เดิมยังเขียว (fixture ไม่มีค่าใช้จ่าย) |
| EXT-T AC-EXT-07-3 (ยืนยันกำไร) | ไม่เปลี่ยน · เพิ่มคู่ขนาน EXP-05 |
| EXT-T §5 BR-LGS-26 | ไม่เปลี่ยน · BR-LGS-36 คู่ขนาน |
| EXT-T AC-EXT-13 หมายเหตุอัตโนมัติ | เพิ่มหมายเหตุ "ยังไม่หักต้นทุน…" และขยายขอบเขต "ค่าใช้จ่ายลงตามวันที่บันทึก…" (BR-LGS-34) |
| EXT-T A-4 (กราฟ/โทเคนอย่างเดียวไม่นับเป็นตัวเลข) | ขยายครอบ 2 บล็อกใหม่ |
| `SummaryFlags`/`SweepCache.profit` | rename ช่อง cache เป็น `pnl` + type ใหม่ — `rg "cache\.profit|profit:" src` ให้ครบก่อนแก้ (กฎ enum-removal: ขยาย type ให้ tsc บังคับ) |
| `line-report-flags-wiring.test.ts` (สแกน) | ต้องยังเขียว · เพิ่มการสแกน AC-EXP-01-1 |

**เอกสารที่ต้องแก้ (T7):** `docs/20 - Features/00070 …/` → `PRD.md` (ชี้ส่วนขยาย) · `BRD.md` (FR-LGS-EXP + BR-LGS-31..36 + traceability) · `SRS.md` (TFR ตัวเลขที่แสดง + ถ้อยคำ guard pnl) · `SDS.md` (`ShopFinance` · `deriveExposure` · `needsExpenseConfirm` · flow) · `DATABASE.md` (ไม่เปลี่ยนสคีมา + หมายเหตุ CHECK) · `API.md` (`confirmExpense` + error) · `TestCase.md` (TC-EXP-*) · **`docs/SRS.md`** (error enum · validation · template schema — HR11) · diff ชื่อไฟล์กับ template ก่อนปิด

---

## 13. Open Questions — ปิดแล้ว

> **มติ 2026-10-05:** user ตอบ "ตามแนะนำ" ⇒ Q-1 ไม่รวมข้ามกติกา · Q-2 ไม่อนุญาต (ไม่ migrate) · Q-3 แก้โทเคน `{กำไร}` ในรอบนี้ (commit แยก) · Q-4 คงเกณฑ์ `expenseCount>0`

**Q-1 — รวมค่าใช้จ่าย/ยอดหลังหักค่าใช้จ่ายข้ามร้านที่ "กติกาการเงินต่างกัน" ไหม**
- **แนะนำ (ใช้อยู่ใน AC-EXP-03-1):** ไม่รวม (เหมือนกำไร) — ค่าส่งขาไปเป็นค่าใช้จ่ายเฉพาะร้านบริการ (F-1) ผลรวมข้ามประเภทต่ำกว่าความจริงของร้านอื่นเสมอ และยอดหลังหักค่าใช้จ่ายจะคละนิยาม · ผู้ใช้ดูรายร้านด้วย `shops.expense`
- ทางเลือก: รวมทุกร้าน + หมายเหตุเดิม "ยอดแต่ละร้านคิดตามกติกา…" (เหมือนที่บล็อกยอดขายทำอยู่) — ง่ายกว่า แต่ตัวเลขรวม "ค่าใช้จ่าย" จะอ่านเป็นผลรวมจริงทั้งที่ไม่ใช่

**Q-2 — เทมเพลตที่มีแต่ `expense`/`net_sales` (ไม่มีตัวเลขหลักอื่นเลย) บันทึกได้ไหม**
- **แนะนำ:** ไม่ได้ ใช้ `METRIC_REQUIRED` เดิม ไม่ต้อง migrate (§7) — ผู้ใช้จริงมักมี "จำนวน/ยอดขาย" อยู่แล้ว
- ทางเลือก: ได้ → ต้อง migrate คอลัมน์ `showExpense` + ผ่อน `metric_any_chk` + (ถ้าต้องการ audit) `expenseEnabledAt` · HR15 (แจ้ง 3 ข้อ) · เพิ่มงาน DB

**Q-3 — แก้โทเคน `{กำไร}` เดิมให้พกทิศทาง/ป้าย "ไม่เกิน/อย่างน้อย" เหมือนโทเคนใหม่ไหม (F-11)**
- **แนะนำ:** ใช่ แยก commit เล็กต่างหาก (ไม่กระทบ golden เพราะ golden ไม่มีข้อความอิสระ) — ปัจจุบันกำไรติดลบในประโยคอ่านเป็นกำไรบวก
- ถ้าไม่ทำ: โทเคนใหม่ถูกต้อง ส่วน `{กำไร}` คงช่องโหว่เดิม — บันทึกเป็นหนี้ที่เปิดอยู่

**Q-4 — ยืนยันการตีความ "ยังไม่มีบันทึกค่าใช้จ่าย" บนรายงานรายวัน**
- **แนะนำ:** ใช้เกณฑ์เดิมของระบบ (`expenseCount>0`, F-5) ⇒ ร้านที่ไม่ลงค่าใช้จ่ายรายวันจะเห็น "ยอดขายหลังหักค่าใช้จ่ายไม่เกิน ฿x" เกือบทุกวัน (E-5) · ตรงกับป้ายกำไรบนหน้าการเงิน
- ทางเลือก: ไม่ติดป้ายสำหรับรายวัน (ตัวเลข = ยอดขาย) — **ไม่แนะนำ** ขัด BR-LGS-25 และทำให้ผู้อ่านเข้าใจว่าไม่มีค่าใช้จ่าย

---

## 14. แผนงานสำหรับ agent team (HR4: Planner→Developer→Reviewer→QA→Controller + retro)

**Gate:** Gate 0 = PM ออก Scope Baseline หลัง user อนุมัติเอกสารนี้ · แต่ละ batch ผ่าน Scope Audit · ปิดด้วย Sign-off · `safepay-ux` เป็น gate ของทุก task frontend · dev ขนานห้าม commit เอง (Controller commit) · ล็อกสัญญาข้อมูล (§4 บนสุด) ก่อนขนาน

| Task | งาน | แตะไฟล์หลัก | FR/AC | ต้องรอ |
|---|---|---|---|---|
| **T0** | อนุมัติเอกสาร + ตอบ Q-1..Q-4 (หรือยืนยันค่าแนะนำ) · PM Scope Baseline | docs | ทั้งหมด | — |
| **T1** | **ยืนยัน golden เขียวก่อนแตะโค้ด** (`npm test` golden ด้วย `DATABASE_URL` ชี้ 5434) + บันทึก SHA · **ห้ามจับ golden ใหม่/แก้ไฟล์ golden** (AC-EXP-02-2) | — | 02-2 | T0 |
| **T2** | **lib (pure):** `template.ts` (Block/Token/`BLOCK_LIMITS`/`deriveExposure`/`deriveNeeds.needExpense`/`needsExpenseConfirm`) · `validations.ts` · `types.ts` (`ShopFinance`) · `aggregate.ts` (`combineFinance`) · `format-money.ts` (`netSalesDisplay`/`expenseDisplay`/inline) · `availability.ts` · `settings-guards.ts` · เทส property/ตาราง | `src/lib/line-report/*`, `format-money.ts` | 02, 03-8, 04, 06-3 | T1 |
| **T3** | **Summary:** guard `showProfit∨needExpense` · rename cache `pnl` · เติม `profit` เฉพาะ `showProfit` + `finance` เฉพาะ `needExpense` · parity test บนฐาน 5434 | `line-report-summary.service.ts`, `line-report-summary*.test.ts` | 01 | T2 |
| **T4** | **Composer:** `TOTALS_TYPES` + แถว/หมายเหตุ/`reportCostNoun`/ค่าคงที่หมายเหตุร่วม · `shops.expense` · โทเคน · altText · `worstCaseSummary` + `measureTemplate` · เทสไฟล์ใหม่ `flex-report-finance.test.ts` + mutation proofs · golden เดิมต้องเขียว | `flex-report-blocks.ts`, `flex-summary-report.ts`, `template-size.ts` | 03, 04 | T2 (ขนานกับ T3 ได้ — คนละไฟล์) |
| **T5** | **Service/API:** `updateTemplate` select `template` + `needsExpenseConfirm` + `EXPENSE_CONFIRM_REQUIRED` + route/`LINE_REPORT_ERROR_STATUS` + body `confirmExpense` · db test | `line-report-group.service.ts`, `errors.ts`, `_shared.ts`, `…/template/route.ts` | 05-1/2/3 | T2 |
| **T6a** | **UX gate:** `safepay-ux` ตรวจป้าย/ตำแหน่ง/ชื่อ icon (ยืนยันกับ gallery ธีม Paces — ไม่เดา) / ข้อความ Swal / warning กลุ่มผสม · mockup 3 จอ (375/768/1180) ตามมติ spec · `Base: theme/...` | docs/สเปก | 06 | T5 (สัญญา API ล็อก) |
| **T6b** | **UI:** `block-meta.ts` · `CanvasList.tsx` สวิตช์ · `TextBlockEditor.tsx` โทเคน · `confirm-expense.ts` + wiring ใน `TemplateBuilderClient.tsx` · `draft-issues.ts` · `preview-data.ts`/`preview-sample.ts` (`withSampleFinance`) · ส่ง `confirmExpense` ตอน PUT · เทส unit | `…/template/**`, `preview-sample.ts` | 05-4, 06 | T6a, T4 |
| **T7** | **Docs sync** (§12) — ขนานกับ T6b · diff ชื่อไฟล์กับ template (HR11) | docs, `docs/SRS.md` | ทั้งหมด | T5 |
| **T8** | **Security review:** ไม่รั่วกำไรผ่านทางค่าใช้จ่าย (R-2) · gate ฝั่ง server ไม่เชื่อ client · log ไม่มียอด | — | 05, 01-4 | T5 |
| **T9** | **QA:** (1) golden เดิมเขียว + `git diff` golden ว่าง (2) parity AC-EXP-01-2 (3) mutation proofs ทุกแถวที่ระบุ (4) Playwright 375/768/1180: เพิ่มบล็อก/สวิตช์ต่อร้าน/โทเคน → Swal ยืนยัน/ยกเลิก/บันทึก/reset/พรีวิว 3 สถานะ (ปกติ·ไม่มีบันทึก·ติดลบ) (5) ส่งทดสอบเข้า OA ทดสอบด้วยเส้นทาง `pushToGroup` จริง + กลุ่มผสมกติกา แล้วให้ **user ดูจอเอง** (6) `/impeccable critique` + `clarify` (7) `rg` HR7/9/12 (8) วัดเวลา sweep (NFR-EXP-1) (9) build exit code + เปิดหน้าจริง | — | ทั้งหมด | T6b, T7, T8 |
| **T10** | PM Gate 2 Sign-off · retro `docs/retro/` · snapshot ใน `docs/claude/state-snapshots.md` + บรรทัดเดียวใน CLAUDE.md | docs | — | T9 |

**ขนานได้ปลอดภัย:** T3 ∥ T4 ∥ T5 (หลังสัญญา T2 ล็อก — คนละไฟล์; Controller commit) · T6b ∥ T7
**ห้ามขนาน:** T2 กับ T3/T4/T5 (สัญญาร่วม) · T1 กับทุกงานแก้โค้ด

**Definition of Done ต่อ task:** ผูก AC → จุดบังคับ + เทสแดงเมื่อถอด (พิสูจน์ด้วย mutation จริง) · `tsc` + `vitest` เขียว (`DATABASE_URL` ชี้ 5434) · reviewer grep ผ่าน · task UI ผ่าน ux gate ก่อนและ critique/clarify หลัง · เปิดหน้าจริงอย่างน้อย 1 ครั้ง

---

## 15. ไฟล์ที่เกี่ยวข้อง (อ่านจากโค้ดจริงแล้ว)

- `src/services/pnl.service.ts` — `PnlReport` `:15`, `sumOrders :85`, `getPnlReport :110`, `totalExpense :214`
- `src/services/line-report-summary.service.ts` — `summarizeShop :68`, guard กำไร `:141-158`, `buildGroupSummary :163`
- `src/services/line-report-group.service.ts` — `mergeSettings :184`, `updateTemplate :253`, `resetTemplate :283`
- `src/services/dashboard.service.ts` — `getSalesSeries :215` (หักคืน `:402`, ตัด RETURNED `:279`) · `src/lib/order-revenue.ts` (`revenueOrderWhere :42`, `countsAsRevenue :63`)
- `src/lib/finance-tabs.ts` `resolveDataCompleteness :65` · `src/lib/finance-rules.ts` `usesServiceFinanceRules :25` · `src/lib/format-money.ts` (`formatBaht :22`, `profitDisplay :115`)
- `src/lib/line-report/{template,validations,types,aggregate,availability,report-config,template-size,preview-sample,settings-guards}.ts`
- `src/lib/line/flex-report-blocks.ts` (`profitRow :74`, `totalProfit :102`, `tokenValue :151`, `TOTALS_TYPES :242`, `renderTotals :245`, `renderShops :266`) · `src/lib/line/flex-summary-report.ts` (`renderAltText :111`)
- `prisma/migrations/20261005100000_line_group_summary_reports/migration.sql:190-191` (`metric_any_chk`)
- UI: `src/app/(paces)/seller/(fullscreen)/business/line-reports/[groupId]/template/{TemplateBuilderClient.tsx, lib/{block-meta,confirm-profit,draft-issues,preview-data,reducer}.ts, components/{CanvasList,TextBlockEditor}.tsx}`
- เทสที่ต้องต่อยอด/ห้ามแก้ผลเดิม: `src/lib/line/__tests__/flex-summary-report.golden.test.ts` (+ `__golden__/`) · `line-report-summary.test.ts` · `line-report-summary.parity.test.ts` · `line-report-merge-settings.test.ts` · `line-report-services.db.test.ts` · `line-report-flags-wiring.test.ts`
- convention ที่ใช้: `rule-must-be-enforced-not-described` · `partial-data-must-be-labeled-or-filled` · `one-value-many-entry-points` · `stored-flag-vs-owner-truth` (กฎ OR กั้นทุก operand) · `value-fate-decided-at-write-site` · `ui-boolean-needs-a-testable-home` · `sibling-surface-parity` · `enum-value-removal` (rename cache)

---

## 16. สถานะการส่งมอบ (2026-10-05)

รอบแรกขึ้นแบบลดขอบเขต (ลูกค้ารอใช้): บล็อกรวม `expense` + `net_sales` · ด่านยืนยัน · พรีวิว
**เลื่อนไปรอบหน้า:** `shops.expense` (ค่าใช้จ่ายต่อร้าน · AC-EXP-03-5, 06-2) · โทเคน `{ค่าใช้จ่าย}`/`{ยอดขายหลังหักค่าใช้จ่าย}` (FR-EXP-04, 06-3) · แก้โทเคน `{กำไร}` (Q-3)
