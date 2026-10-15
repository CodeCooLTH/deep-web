# Scope Baseline — 00070 ส่วนขยาย: หน้า "สรุปรายละเอียด" สาธารณะจากปุ่มบนการ์ดรายงาน LINE

สถานะ: ACTIVE — user อนุมัติ 2026-10-15 (Q-1..Q-5 ตามค่าแนะนำ)
ไฟล์ปลายทาง: `docs/scope/2026-10-14-00070-public-detail-link-scope-baseline.md`
อ้างอิง PRD/BRD: `docs/20 - Features/00070 - LINE Group Summary Report/EXTENSIONS-2026-10-14-public-detail-link.md` (FR-LGS-LINK-01..09 · BR-LGS-37..45 · F-1..F-18 · AC-LINK-*) · ต่อยอด `EXTENSIONS-2026-10-05-expenses-and-net-sales.md` และ `EXTENSIONS-2026-10-08-sales-total-and-chart.md`
มติ: user 2026-10-14 (D-LNK-1..5) — ลิงก์ถือแล้วเปิดได้ · อายุสิ้นวันถัดไปเวลาไทย · snapshot ตอนส่ง · แสดงชื่อลูกค้า+เบอร์ปิดบาง · ค่าใช้จ่ายทุกรายการพร้อมโน้ต · แบ่ง ปิดงานแล้ว/รอปิดงาน ยอดรวมเท่าการ์ด
เงื่อนไขก่อนเริ่ม: Q-1 (opt-in หรืออัตโนมัติ) · Q-2 (ตามเทมเพลตหรือเปิดครบ) · Q-3 (แกนสถานะร้านบริการ) · Q-4 (ยืนยันการลบอัตโนมัติ) · Q-5 (รูปเบอร์) — ตอบแล้วต้องแก้ S-id ที่ติดป้าย `[Q-n]` ให้ตรงก่อน Gate 0

## Goal
ให้ปุ่มบนการ์ดรายงานที่เจ้าของกลุ่มเลือกเปิด พาสมาชิกกลุ่มไปหน้าสรุปรายละเอียดบนมือถือที่ไม่ต้อง login (snapshot ตอนส่ง · ยอดรวมเท่าการ์ด · แบ่งสถานะ · รายการงาน · ค่าใช้จ่ายตามที่เทมเพลตเปิด) โดยลิงก์หมดอายุสิ้นวันถัดไปและข้อมูลลูกค้าถูกลดทอน/ล้างตามกำหนด

> กติกาทั้งไฟล์: ทุก commit ต้อง map S-id อย่างน้อย 1 ตัว ไม่ map = CREEP · S-id ที่เป็น "กฎบังคับ" ต้องมีเทสที่แดงเมื่อกฎถูกละเมิด + mutation ถอดเงื่อนไขแล้วเทสแดง (`rule-must-be-enforced-not-described`, `mutation-silence-means-weak-corpus`) · golden เดิมต้องเขียวโดย `git diff --stat -- src/lib/line/__tests__/flex-summary-report.golden.test.ts src/lib/line/__tests__/__golden__` ว่าง · แตะ frontend ผ่าน `safepay-ux` (HR8) · ห้าม emoji (HR12) · Paces HR1/HR5/HR7/HR9 · แตะ data model/API/enum ต้อง sync `docs/SRS.md` (HR11) · ศัพท์ ยอดขาย/ค่าใช้จ่าย ใช้นิยามเดิมของระบบ ห้ามตั้งใหม่ (HR16) · เทส DB ปักหมุด localhost:5434 + scope ด้วย id ที่เทสสร้าง (HR13/14) · **prompt developer ต้องมีบรรทัด "ห้ามแก้ assertion ให้อ่อนลง — เทสแดง = รายงาน"**

## In-Scope

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-1 | เอกสารครบและ sync (HR11): EXTENSIONS นี้อนุมัติแล้ว · sync `PRD/BRD/SRS/SDS/DATABASE/API/TestCase` ของ 00070 + `docs/SRS.md` (data model · error enum · validation · route สาธารณะ) + `LINE-API-Facts.md` (อายุ reply token) | `rg "LineReportSnapshot" docs/SRS.md "docs/20 - Features/00070 - LINE Group Summary Report/DATABASE.md"` พบ · `rg "DETAIL_LINK_CONFIRM_REQUIRED" docs/SRS.md` พบ · `rg "BR-LGS-45" "docs/20 - Features/00070 - LINE Group Summary Report/BRD.md"` พบ · `diff` ชื่อไฟล์เอกสาร feature กับ template ครบ | TODO |
| S-2 | lib pure สำหรับ snapshot: ชนิด+Valibot `strictObject` `DetailSnapshotV1` (ไม่มีฟิลด์ buyerContact ดิบ/ที่อยู่/เลขออเดอร์/ลิงก์ออเดอร์/ต้นทุน/กำไร) · token (`randomBytes(16)` base64url + sha256) · คำนวณ `expiresAt` (00:00 ไทยวันที่ 2 นับจากวันสร้าง) · ตัวสร้างแถว (PII ตัดที่จุดเขียนด้วย `maskPhoneForGuest` · ชื่องาน/สินค้า) · ตัวจัดก้อนสถานะ · เพดาน | AC-LINK-01-4 · AC-LINK-03-1/2/3/5/6 · AC-LINK-08-1: เทสตาราง/property ครบ · สแกนซอร์สไม่มี `Math.random` · payload ทุก fixture ไม่เจอ `/0\d{9}/` · **mutation:** เก็บ token ดิบ / ใส่ buyerContact ดิบ / +1 วันแทน +2 → แดง | TODO |
| S-3 | schema + migration additive: ตาราง `LineReportSnapshot` (tokenHash unique · groupId Cascade · deliveryId SetNull · expiresAt · payload Json? · purgedAt) + index + CHECK เขียนมือ (ขนาด payload ≤512KB · expiresAt>createdAt) · **`safepay-database` ทบทวนก่อนแตะ schema** · ไม่ DROP/ALTER ตารางเดิม | migration มีแต่ `CREATE TABLE`/`CREATE INDEX`/`ADD CONSTRAINT` บนตารางใหม่ (`rg "DROP\|TRUNCATE" prisma/migrations/<ใหม่>` = 0) · apply local ด้วย `migrate deploy` ปักหมุด localhost (HR14) · db test: INSERT payload เกิน 512KB → 23514 · ลบกลุ่ม fixture → แถว snapshot หาย (AC-LINK-08-3/08-4) | TODO |
| S-4 | snapshot builder + ยอดขายแบ่งสถานะ + parity: ตัวเลขหัว = ตัวเลขการ์ด (ส่ง `GroupSummary` ชุดเดียวกัน) · ก้อนสถานะร้านบริการแบ่งด้วย `serviceClosedAt` บนชุดใบเดียวกับการ์ด (รวม RETURNED, **ไม่ใช้** `countsAsServiceRevenue`) · ร้านอื่นแบ่งด้วย `countsAsRevenue` · เพดานแถว+ยอดจากชุดเต็ม · กลไก `parity:'MISMATCH'` `[Q-3]` | AC-LINK-04-1..5 · AC-LINK-03-4/03-5: parity ฐานจริง 5434 (Σ bucket = confirmed+unconfirmed, Σ count = orders ทั้งร้านบริการ/ขายของ/ที่พัก + ขอบเวลาไทย) · **mutation:** เปลี่ยนเป็น `countsAsServiceRevenue` / เติม status ฝั่งเดียว / รวมจากแถวที่ตัด / ใช้ผลรวมแถวเป็นหัว → แดง · แดงก่อน mutation = หยุดรายงาน Controller | TODO |
| S-5 | ส่วนค่าใช้จ่ายของหน้ารายละเอียด: `expenseDetailRows` แยกจาก `expenseItems` (ไม่แก้ตัวเดิม) รวมบรรทัดค่าส่งระบบ · แสดงเมื่อ `deriveExposure` เท่านั้น (ส่วนที่ปิดไม่อยู่ใน payload) · โน้ตตัด 200 ตัว · "ยังไม่มีบันทึก" ≠ ฿0 · ยอดรวมกลุ่มตาม BR-LGS-33 `[Q-2]` | AC-LINK-03-4 · AC-LINK-07-1..5: parity Σ rows = `ShopFinance.expense` ฐานจริง · เทสเดิม `expenseItems` ไม่อ่าน note เขียวโดยไม่แก้ assertion · **mutation:** ตัดบรรทัดค่าส่ง / ใส่ expense เสมอ / ให้ `expenseItems` อ่าน note → แดง | TODO |
| S-6 | ต่อเข้าเส้นทางส่ง: `SummaryReportInput.detailUrl?` เลือก `detailUrl ?? sellerDashboardUrl()` · send (D/M) / test / command สร้าง snapshot **ก่อน** build และก่อนบันทึก payload · retry ใช้ลิงก์เดิม · ล้ม/เกินงบเวลา → ปุ่มเดิม ไม่ทำรายงานล้ม · FINAL_NOTICE และ `show:false` ไม่สร้าง | AC-LINK-01-1/2/3/5/6: golden เดิมไม่เปลี่ยนไบต์ · footer.uri = detailUrl ที่ระดับตัดทอน 0–4 · push ล้ม→มีแถว snapshot ตรง token ใน raw · mock service throw → uri เดิม + log ไม่มีข้อมูล · **mutation:** ย้ายเขียนไปหลัง push / ปล่อย throw → แดง | TODO |
| S-7 | สวิตช์ปลายทาง + ด่านยืนยัน `[Q-1]`: `button.target?` ใน `TemplateSchema` (additive) · `needsDetailLinkConfirm` + `confirmDetailLink` + `DETAIL_LINK_CONFIRM_REQUIRED` (exhaustive map + route-catch) · guard ต้องมี orders/sales · `deriveFlags` key เท่าเดิม | AC-LINK-02-1..5: `template-schema.test.ts` +≥4 · `Object.keys(deriveFlags(...))` เท่าเดิม · db test 4 เคส (null→DETAIL ไม่ confirm=400 / confirm ผ่าน / คงอยู่ไม่ถาม / reset แล้วเปิดใหม่=400) · **mutation:** เพิ่ม key ใน deriveFlags / ข้ามเทียบ prev / ถอด guard → แดง | TODO |
| S-8 | หน้าสาธารณะ `/lr/[token]` — การอ่านและด่านป้องกัน: ค้นด้วย hash · 404 เดียวกันทุกเหตุ (รวมกลุ่ม REMOVED ตรวจสด) · 410 เมื่อหมดอายุ (ตัดสิน ณ เวลาอ่าน) · header `no-store` + `noindex` + `no-referrer` ทุกสถานะ · `robots.txt` · rate limit 30/15 นาที/IP · ไม่ log token · `proxy.ts` ยกเว้น `/lr/` · ไม่มี API JSON สาธารณะใหม่ | AC-LINK-05-1..7: fake clock `expiresAt-1ms` ได้/`expiresAt` 410 · token ผิด/REMOVED → HTML 404 เดียวกัน · integration ตรวจ header ทุกสถานะ · proxy test 4 สถานะ (guest/authed/needsOnboarding/app shell) · spy console ไม่มี token · **mutation:** ถอดเงื่อนไขเวลา / ถอด header / ถอด exemption / ถอด rate limit / แยกข้อความ REMOVED → แดง | TODO |
| S-9 | UI หน้าสรุปรายละเอียด (mobile-first) ผ่าน `safepay-ux` ก่อนเขียน: หัว+เวลา snapshot+วันหมดอายุ · ยอดรวมใหญ่ · ต่อร้าน+ก้อนสถานะ · รายการงาน · ค่าใช้จ่าย(เมื่อเปิด) · state ครบ (loading/ว่าง/ERROR/EXCLUDED/410/404/429/error) · ข้อความผู้ใช้เป็นข้อความธรรมดา · `(paces)` สาธารณะ (ยืนยันที่ UX gate) · `Base: theme/...` | AC-LINK-06-1..5: Playwright 375/768/1180 ไม่มี horizontal scroll · ครบทุก state · ชื่อมี `<script>`/ยาว 200 ตัว → escape+ไม่ล้น · `rg` HR5/7/9/12 = 0 · ไม่มี `dangerouslySetInnerHTML`/`fetch(` ในไฟล์หน้า · `/impeccable critique` + `clarify` ก่อน mark complete (HR8) · user ตรวจจอเอง | TODO |
| S-10 | UI หน้าตั้งค่าเทมเพลต `[Q-1]`: ตัวเลือก "ปุ่มเปิดหน้าสรุปรายละเอียด" + Swal ยืนยัน (`pacesConfirm.warning`) + ส่ง `confirmDetailLink` + disabled เมื่อไม่มี orders/sales · พรีวิวไม่สร้างลิงก์จริง · ผ่าน `safepay-ux` · `Base: theme/...` | AC-LINK-09-1..5: `reducer.test.ts` toggle · `confirm-detail-link.test.ts` ทุกเส้นทาง · `preview-data.test.ts` JSON ไม่มี `/lr/` · Playwright ยืนยัน/ยกเลิก · `rg` HR9 `react-toastify` ใน `(paces)` = 0 | TODO |
| S-11 | อายุและการล้างข้อมูล `[Q-4]`: `runCleanup` ล้าง `payload`+ตั้ง `purgedAt` เมื่อหมดอายุ · ลบแถวโครงเปล่าเมื่อเกิน 30 วันหลังหมดอายุ · ผลคืน sweep เพิ่มจำนวน · **ได้รับความเห็นชอบจาก user (Q-4) ก่อน merge** | AC-LINK-08-2: db test scope ด้วย group id ที่เทสสร้าง (HR13) — แถวหมดอายุ payload NULL · แถวสดไม่เปลี่ยน · แถว 31 วันถูกลบ · **mutation:** ถอดการล้าง/ขยาย scope → แดง · เทส cleanup เดิมไม่เปลี่ยนผล | TODO |
| S-12 | QA และปิดงาน: reviewer + `safepay-security` (checklist EXTENSIONS §9) · `npx tsc --noEmit` exit 0 · `npm test` ด้วย `DATABASE_URL` localhost:5434 · build exit code 0 · golden diff ว่าง · ส่งทดสอบเข้า OA ทดสอบจริงแล้ว user ดูบน LINE มือถือ · วัดเวลา sweep+ทางคำสั่ง · **แจ้ง HR15 3 ข้อก่อน push main** · retro · snapshot `docs/claude/state-snapshots.md` + บรรทัดเดียวใน `CLAUDE.md` | รายงาน security ไม่มี finding สูง/กลาง ค้าง · ผล mutation แนบ · บันทึกการแจ้ง HR15 · `git diff --stat` golden ว่าง · เอกสาร sync ตาม S-1 | TODO |

## Out-of-Scope
> แตะ = CREEP (hard block) ต้องให้ Controller ตัดสินแล้วจด Change Log

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | ข้อมูลสด/รีเฟรชอัตโนมัติบนหน้า | มติ D-LNK-2 (snapshot) |
| OOS-2 | ยืนยันว่าผู้เปิดอยู่ในกลุ่ม (LIFF login / PIN / รหัสผ่านลิงก์) | LINE ไม่บอก · มติ D-LNK-1 |
| OOS-3 | ปุ่ม/หน้าเพิกถอนลิงก์รายใบด้วยมือ · หน้ารายการลิงก์ที่ออกไป | เพิกถอนได้ด้วยการนำกลุ่มออกเท่านั้น (BR-LGS-45) · Phase 2 |
| OOS-4 | สถิติการเปิดลิงก์ (ใครเปิด/กี่ครั้ง) | Phase 2 |
| OOS-5 | เลขออเดอร์ · ลิงก์ไปหน้า `/o/{token}` · ที่อยู่จัดส่ง · เบอร์เต็ม · อีเมล/ไอดีช่องทาง · สลิป | BR-LGS-40 (PII) |
| OOS-6 | ต้นทุน · กำไร · ยอดหลังหักค่าใช้จ่าย · Top 3 สินค้า · กราฟ ในหน้ารายละเอียด | ไม่อยู่ในมติ — ส่วนขยายภายหลัง |
| OOS-7 | แถวของใบที่ยกเลิก (แสดงเป็นจำนวนเท่านั้น) · ยอดสะสมรอบ | A-3 · §10 |
| OOS-8 | ค้นหา/กรอง/แบ่งหน้ารายการ · แสดงเกินเพดานแถว | เพดานในแอป · A-4 |
| OOS-9 | ส่งออก PDF/CSV · พิมพ์ · ปุ่มแชร์ | Phase 2 |
| OOS-10 | ภาษาอังกฤษของหน้านี้ | PRD §8 ของ 00070 |
| OOS-11 | แก้หน้าตา/ตัวเลข/ป้ายปุ่มของการ์ดใน LINE · เปลี่ยน `DEFAULT_BUTTON_LABEL` · เปลี่ยน golden | กระทบ AC-EXP-02-2 |
| OOS-12 | แก้ `expenseItems` หรือเพิ่มโน้ตลงการ์ดใน LINE | BR เดิม · R-4 |
| OOS-13 | เปลี่ยนนิยามยอดขาย/ค่าใช้จ่าย/กำไร หรือแก้ `getSalesSeries`/`getPnlReport`/`countsAsRevenue`/`countsAsServiceRevenue` | HR16 (ห้ามแก้ SSOT เพื่อให้หน้านี้ตรง — รายงาน Controller) |
| OOS-14 | แก้เส้นทางหน้า `/o/[token]` · ย้ายหน้าใน `(marketing)` · เขียน shadcn | 00076 ยังไม่ผ่าน user · ขอบเขตผู้ซื้อ |
| OOS-15 | migrate ชี้ prod เอง · แก้ env Vercel | HR15 |
| OOS-16 | แก้ผู้เรียกอื่นของ `buildSummaryReportFlex` นอกเหนือ send/command/test (พรีวิวหน้าตั้งค่า, SampleBubble ต้อง **ไม่** ได้ลิงก์จริง) | AC-LINK-09-4 |
| OOS-17 | แก้บั๊กอื่นที่ไม่เกี่ยวฟีเจอร์นี้ (เช่น ปัญหา 00071/00073) | CREEP |

## Assumptions
- Q-1..Q-5 ใช้ค่าแนะนำใน EXTENSIONS §13 จนกว่า user ตอบ (opt-in · ตามเทมเพลต · แบ่งปิดงานสำหรับร้านบริการ · ลบอัตโนมัติตามที่เสนอ · เบอร์ `•••-•••-891`)
- ปลายทางปุ่มเก็บใน `template.button.target` — ไม่เพิ่มคอลัมน์ที่ `LineReportGroup`
- เพดาน 150 แถว/ร้าน · 100 รายการค่าใช้จ่าย/ร้าน · โน้ต 200 ตัว · payload 400KB (CHECK 512KB) · rate limit 30/15 นาที/IP เป็นค่าเริ่มต้น ปรับได้ด้วยผล QA
- หน้า `/lr/[token]` อยู่ `(paces)` สาธารณะบน seller.* (ข้อเสนอ — ยืนยันที่ UX gate; ถ้าย้าย route group ต้องบันทึก Change Log)
- วัน "ส่ง" = วันไทยของเวลาที่สร้าง snapshot
- ป้ายสถานะรายใบใช้ SSOT ที่มีอยู่ (ต้องค้นไฟล์ตอนวางแผน) · `usesServiceFinanceRules` ครอบเฉพาะ SERVICE_QUEUE (ยืนยันตอนวางแผน)
- browser QA เชิงภาพ: user ตรวจด้วยตา (มติถาวร) — QA agent ทำ Playwright E2E ตามเทสบังคับ
- agent ลงมือ commit ไม่ได้เอง (dev ขนานห้าม commit) — Controller เป็นคน commit

## Deferred → Phase 2
> ไม่นับเป็น GAP ตอน audit/sign-off

- OOS-3 เพิกถอนลิงก์รายใบ · OOS-4 สถิติการเปิด · OOS-6 ยอดหลังหักค่าใช้จ่าย/Top 3/กราฟบนหน้า · OOS-8 ค้นหา/แบ่งหน้า · OOS-9 ส่งออก/พิมพ์ · ลิงก์ "เปิด Deep" ท้ายหน้า (Nice, US-LNK-8)

## ความเสี่ยงเปิด
- R-1 PII ถึงคนนอกกลุ่มจากการส่งต่อลิงก์ → S-7 ด่านยืนยัน + S-2 ลดทอนที่จุดเขียน + S-11 ล้างหลังหมดอายุ
- R-2 ยอดแบ่งสถานะไม่เท่าการ์ด → S-4 parity ฐานจริง
- R-4 โน้ตรั่วลงการ์ด → S-5 ฟังก์ชันแยก + เทสเดิมเขียว
- R-5 `proxy.ts` เด้งผู้ล็อกอินออก → S-8 เทส 4 สถานะ
- R-8 ทางคำสั่งช้าจน reply token หมด → S-6 งบเวลา+fallback
- R-9 เทส DB ชี้ prod → HR13/14
- R-12 migration ขึ้น prod ตอน push main → S-12 แจ้ง HR15

## Definition of Done
1. S-id ทุกข้อ DONE พร้อมหลักฐาน (commit hash / file:line / ผลเทส)
2. mutation แดงจริงทุกแถวที่ระบุ · `tsc` exit 0 · `npm test` localhost:5434 · build exit 0
3. ทุก commit map S-id · ไม่แตะ OOS · golden diff ว่าง
4. security: ไม่มี finding สูง/กลางค้าง · ไม่มี PII ดิบใน payload · ไม่มี token ใน log
5. migration additive · แจ้ง HR15 ก่อน push · user รับทราบการลบอัตโนมัติ (Q-4)
6. เอกสาร sync (S-1) · retro · snapshot

## Change Log
> ทุกครั้งที่ Controller อนุมัติแก้ scope (รับเข้า/เลื่อนออก) จดที่นี่ — กัน creep เงียบ

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-10-14 | baseline ร่างสร้าง (S-1..S-12 / OOS-1..17) | user ขอปุ่มบนการ์ดเปิดหน้าสรุปรายละเอียดสาธารณะ + ตอบมติ D-LNK-1..5 | user 2026-10-15 "ลุยต่อจนจบเลย" |
