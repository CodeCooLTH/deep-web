---
title: "Retro — 00096 รายงานกำไรโฆษณารายวัน (P0–P2) + redesign 00091/00093"
created: 2026-11-17
tags: [retro, ads, profit, report, meta]
related: ["[[00096 - Daily Ads Profit/PRD]]", "[[00096 - Daily Ads Profit/BRD]]"]
---

# Retro 00096 — กำไรโฆษณารายวัน · ต้นทุนต่อออเดอร์ · redesign หน้ารายงานโฆษณา

## สิ่งที่ส่ง (prod ทั้งหมด)
- **00091/00093 redesign:** #252 #254 #255 #256 #257 (ad-revenue 7 แท็บเป็น analytics dashboard) · #260 (ad-quality ตามม็อกอัพ)
- **00096:** P0 #258 → P1 #261 (reach/สถานะ · คำแนะนำ · สรุป · กราฟ · แท็บวินิจฉัย) → P2 #263 (แท็บสินค้า) → #265 (ต้นทุนต่อออเดอร์ · migration `Shop.variableCosts`) → #270 (เทียบเมื่อวาน ณ เวลาเดียวกัน + เฉลี่ย 7 วัน)
- อีก session ทำต่อบนไฟล์เดียวกัน: #269 ค่าโฆษณาไม่ปัด · #272 เงิน 2 ทศนิยมทั้งระบบ

## Problems (มีหลักฐาน)
1. **บั๊กเงิน: ร้านขายของไม่ถูกหักค่าธรรมเนียม COD เลย** — ร่างแรกของ `orderVariableCost` (`src/lib/variable-cost.ts`) ตั้ง % COD = 0 เมื่อพัสดุ iShip มี `codFee` โดยให้เหตุผลว่า "codFee อยู่ในค่าส่งขาไปแล้ว" แต่ค่าส่งขาไปถูกหักเฉพาะร้านบริการ (`pnl.service.ts` `shippingCost = newRules ? shipping : 0` · มติ 2026-10-02) ⇒ ร้านขายของ codFee หายทั้งก้อน กำไรสูงเกินใบละหลายสิบบาท · reviewer อิสระจับได้ก่อน merge แก้ใน `544ea97c2` (ส่ง `codFeeInShipping` เข้าไป)
2. **กราฟการเงินร้านบริการไม่เท่า P&L** — ใส่ `variableValues` (ทุกใบ) ใน `finance-chart.service.ts` ขณะที่ `getPnlReport` นับเฉพาะใบที่เป็นยอดขาย · reviewer จับได้ แก้เป็น `variableConfirmedValues`
3. **ตัวแปลงเงินปัดเป็นบาท** — `formatBaht(Math.round(...))` ในการ์ด/ตาราง ทำค่าโฆษณา ฿1,580.61 ขึ้น ฿1,581 · user จับได้บน prod (#269 · #272)
4. **`git checkout <file>` เพื่อถอดของปลอมชั่วคราว ลบงานที่ยังไม่ commit ทิ้งด้วย** — ถอด TEMP-QA ออกจาก `meta-ads-spend.service.ts` แล้วการแก้ `spendByDay` ที่ยังไม่ commit หายไป ต้องเขียนใหม่
5. **เทส [blocker] แดง 3 ไฟล์จาก mock `prisma` ไม่มีตาราง `shop`** — `getSalesSeries`/`getPnlReport` เริ่มอ่าน `Shop.variableCosts` ⇒ ต้องแก้ไฟล์ [blocker] (ติดป้าย แตะด่าน) + มิเรอร์ `SalesSeries` ฝั่ง client (`command-center.ts`) + ทะเบียน GET ใน `role-contract.test.ts`
6. **`OUTCOME_ENGAGEMENT` ถูกจัดเป็นโฆษณาสร้างการรับรู้** — คำแนะนำรายวันหายหมดสำหรับร้านที่ยิงโฆษณาข้อความ แก้ + เทสใน `ads-profit-insights.test.ts`

## Root causes
- (1) เหตุผล "ไม่คิดซ้ำเพราะหักที่อื่นแล้ว" ถูกเขียนจากความจำเรื่องค่าส่ง ไม่ได้ไล่ว่าที่อื่นนั้นหักจริงในทุกประเภทร้านไหม — กติกาการเงินของระบบนี้แยกตาม vertical (`usesServiceFinanceRules`) ทำให้ข้ออ้างที่จริงในร้านหนึ่งเป็นเท็จในอีกร้าน
- (2) ตัวตั้ง (`values` ทุกใบ) กับตัวลบ (P&L เฉพาะใบยอดขาย) มาจากคนละชุด — ซ้ำรอยบทเรียน [[feedback_subtrahend_must_match_minuend_scope]]
- (3) `Math.round` ถูก copy ต่อกันมาจาก KPI ตัวแรก ไม่มีกฎกลางว่า "เงินห้ามปัด" จนกระทั่ง user สั่ง
- (4) ใช้ `git checkout` ซึ่งย้อนทั้งไฟล์ แทนการถอดเฉพาะบล็อก
- (5) service ตัวกลางเพิ่ม query ใหม่ ⇒ เทสที่ mock prisma ทั้งก้อนแดงทุกไฟล์ — คาดได้ล่วงหน้าถ้า grep `vi.mock('@/lib/prisma'` ของ caller ก่อน

## Conventions to adopt
1. **ข้ออ้าง "ไม่คิดซ้ำ/หักที่อื่นแล้ว" ต้องชี้บรรทัดที่หักจริง แยกตามประเภทร้าน** → `docs/conventions/no-double-count-claim-must-trace-deduction.md`
2. **เงินบนรายงาน = `formatBaht` ตรง ๆ ห้ามครอบ `Math.round`** (มีแล้วใน memory `feedback_money_two_decimals`)
3. **ของปลอมชั่วคราวเพื่อถ่ายภาพ: ถอดเฉพาะบล็อก TEMP-QA หรือ `cp` สำรองไฟล์ก่อน — ห้าม `git checkout <file>` ถ้าไฟล์มีงานที่ยังไม่ commit**
4. **แก้ service ตัวกลางที่จะ query ตารางใหม่: grep `vi.mock('@/lib/prisma'` ในเทสของ caller ก่อนเริ่ม** แล้ววางแผนแก้ mock ในรอบเดียว (รวมป้าย แตะด่าน)
5. **ข้อมูลภายนอกที่ "ว่าง" ต้องแยกจาก 0** — Meta breakdown รายชั่วโมงคืนว่างได้ (ประกาศ Meta 2026-08-06) ⇒ `UNAVAILABLE` ไม่เทียบ (ต่อยอด [[docs/conventions/partial-data-must-be-labeled-or-filled]])

## What went right
- **reviewer อิสระก่อน merge งานเงิน** จับบั๊กจริง 2 ข้อที่เทสทั้ง 13,700 ตัวเขียวหมด — ทำซ้ำทุกงานที่แตะตัวเลขกำไร
- **เทส DB parity "หน้ากำไร = รายงานโฆษณา หักเท่ากัน"** (`variable-cost.db.test.ts`) พิสูจน์ HR16 ข้ามพื้นผิวในเทสเดียว
- **ยืนยันชื่อฟิลด์ Meta กับเอกสารทางการก่อนใช้** (Meta developer docs) ทำให้เจอข้อจำกัด "อาจคืนว่าง" ก่อนเขียนโค้ด
- **ประสานกับอีก session ผ่านข้อความ** — รอ #269 merge ก่อนแตะ `AdsProfitKpis.tsx` ⇒ ไม่มี conflict เลยแม้แตะไฟล์เดียวกัน
- **HR17 ทุกรอบ rebase** (`comm -12`) — 5 รอบ ไม่มีรอบไหนพาโค้ดเก่ากลับ

## Action items
1. เปิด `/reports/ads-profit` · `/reports/ad-revenue` · `/reports/ad-quality` ด้วยบัญชีที่เชื่อม Meta จริงบน prod (ภาพทั้งหมดยังเป็นค่าโฆษณาจำลอง)
2. ยืนยันว่าบัญชีโฆษณาจริงได้ข้อมูลรายชั่วโมง — ถ้าว่าง แจ้งร้านให้เปิดใน Ads Manager
3. ลองตั้งต้นทุนต่อออเดอร์บน prod 1 ร้าน แล้วเทียบกำไรสุทธิหน้า `/expenses` ก่อน/หลัง
4. ค้างจาก 00091: ตัวกรองเพจกรณีไม่มีรูปโปรไฟล์ (ใช้ร่วมกับกล่องแชท — รอ user) · ล้างข้อมูลทดสอบ qa91 บนฐาน local (รอ user อนุญาต)
5. พิจารณาเก็บประวัติค่าต้นทุนต่อออเดอร์ (ตอนนี้แก้ค่า = ตัวเลขย้อนหลังเปลี่ยน) — รอ user ตัดสินว่าจำเป็นไหม
