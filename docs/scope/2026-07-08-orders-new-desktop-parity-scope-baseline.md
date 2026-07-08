# Scope Baseline — orders-new-desktop-parity

> Phase ID: `orders-new-desktop-parity` · เจ้าของ: `safepay-product` (baseline) / agent team (implement) · Controller commit + เปลี่ยนสถานะ

สถานะ: SIGNED-OFF (2026-07-08 — merged main, deploy prod)
อ้างอิง PRD: ไม่มี FR ตรงใน `docs/PRD.md`/`docs/SRS.md` (feature นี้เป็น UX extension ของ quick-create-order เดิม ไม่ใช่ FR ใหม่ทางธุรกิจ) · spec อ้างอิง: `docs/superpowers/specs/2026-07-06-quick-create-order-design.md` (ต้นทางของ 4 affordance ที่ desktop ยังไม่มี — ตอนนั้นประกาศ non-goal ไว้ว่า "Desktop POS (≥ lg) ไม่เปลี่ยน") · gap analysis ต้นทาง: PM report 2026-07-08 (safepay-product, session นี้)

## Goal
ทำให้ desktop viewport (`≥ lg`) ของหน้า `/orders/new` (`CartPanel.tsx` + `ProductGrid.tsx` + `CustomerSelectBlock.tsx`) มี UX affordance เท่ากับ mobile `QuickForm.tsx` ใน 4 จุด (paste-parse / address autocomplete / SKU search / remember default channel-payment) โดย **reuse logic layer เดิม ไม่ rebuild ของใหม่**

## In-Scope
> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-1 | **Paste-parse บน desktop** — seller วางข้อความแชท (ชื่อ/เบอร์/ที่อยู่) ที่ accordion "ลูกค้า" ของ `CartPanel` แล้วระบบแยกฟิลด์ให้อัตโนมัติเหมือน mobile | **User story:** ในฐานะ seller ที่ใช้จอ desktop ฉันต้องการวางข้อความแชทลูกค้าแล้วให้ระบบกรอกชื่อ/เบอร์/ที่อยู่ให้อัตโนมัติ เพื่อไม่ต้องพิมพ์เองทุกฟิลด์ เหมือนตอนใช้บนมือถือ<br>**Acceptance:** (1) เปิด accordion "ลูกค้า" บน `≥ lg` มีปุ่ม/entry point เปิดช่องวางข้อความ (2) วางข้อความตัวอย่าง (ชื่อ+เบอร์+ที่อยู่ 4 บรรทัด) → `buyerName`/`buyerContact`/`shippingAddress.*` ถูกเติมด้วยผลลัพธ์เดียวกับที่ `parseOrderMessage()` คืนบนมือถือ (unit-testable, เทียบ input เดียวกัน) (3) seller แก้ไขค่าที่ parse ผิดได้ก่อน submit (4) ไม่กระทบ validation/schema เดิม (FR-6.5 shipping guard ยังทำงาน)<br>**Target file(s):** `CustomerSelectBlock.tsx` (เพิ่ม trigger + UI แสดงผล parse บน desktop container — accordion/inline ไม่ใช่ full-screen sheet), ตัดสินใจ container ใหม่ (เช่น dropdown panel หรือ modal ขนาด desktop) — **ห้าม reuse `PasteParseSheet.tsx` ตรง ๆ** (เป็น full-screen bottom sheet, ผิด pattern desktop)<br>**Reuse source:** `src/lib/parse-order-message.ts` (`parseOrderMessage()` — pure function, reuse ตรง ๆ ได้ 100%, ไม่ต้องแก้) | DONE |
| S-2 | **Thai address autocomplete บน desktop** — accordion "ที่อยู่จัดส่ง" ของ `CartPanel` ค้นหาตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์แทนการพิมพ์ freetext ทั้งหมด | **User story:** ในฐานะ seller ที่ใช้จอ desktop ฉันต้องการค้นหาที่อยู่จากตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์แล้วเติมให้ครบ 4 ฟิลด์ทันที เพื่อกันสะกดผิด/ไม่ตรงกัน เหมือนมือถือ<br>**Acceptance:** (1) accordion "ที่อยู่จัดส่ง" มีช่องค้นหา locality (แทนที่หรือเสริม 3 ช่อง subdistrict/district/province เดิม) (2) พิมพ์คำค้น ≥1 ตัวอักษรจาก dataset จริง → ได้ผลลัพธ์ตรงกับที่ `AddressSearchSheet.tsx` คืนบนมือถือ (เทียบ query เดียวกัน, dataset เดียวกัน) (3) เลือกผลลัพธ์ → `shippingAddress.subdistrict/district/province/postcode` เติมครบ 4 ฟิลด์พร้อมกัน (4) `line1` (บ้านเลขที่/ถนน) ยังเป็น freetext เหมือนเดิม (5) FR-6.5 (shipping required-when-SHIPPED) ยัง enforce เหมือนเดิม<br>**Target file(s):** `CartPanel.tsx` (accordion shipping block, บรรทัด ~207-244) — เปลี่ยนจาก raw `<input>` 3 ช่อง เป็น search-driven picker (component ใหม่ ขนาด desktop เช่น dropdown-panel หรือ modal — **ห้าม reuse `AddressSearchSheet.tsx` ตรง ๆ** เป็น full-screen mobile sheet)<br>**Reuse source:** `public/data/thai-address.json` (dataset เดิม, fetch+cache module-level pattern จาก `AddressSearchSheet.tsx` — reuse fetch/cache logic, สร้าง UI container ใหม่เท่านั้น) | DONE |
| S-3 | **SKU search บน desktop** — `ProductGrid` (ค้นหาสินค้าฝั่งซ้าย) และ `ProductCombobox` (เปลี่ยนสินค้าในบรรทัดตะกร้า) ค้นหาด้วยชื่อ**หรือ** SKU | **User story:** ในฐานะ seller ที่ใช้จอ desktop ฉันต้องการพิมพ์ SKU แล้วเจอสินค้า เพื่อความเร็วเท่าที่ใช้บนมือถือ<br>**Acceptance:** (1) `ProductGrid` — พิมพ์ SKU ของสินค้าที่มีอยู่จริงในช่องค้นหา → สินค้านั้นปรากฏใน grid (ปัจจุบัน filter ชื่ออย่างเดียว ทดสอบ regression: พิมพ์ SKU ที่ไม่ตรงชื่อ ต้องเจอ) (2) `ProductCombobox` (คลิกเปลี่ยนสินค้าในบรรทัดตะกร้า) — พิมพ์ SKU → เจอสินค้าเดียวกัน (3) filter ด้วยชื่อยังทำงานเหมือนเดิม (ไม่ regress) (4) แสดง SKU ในผลลัพธ์ (เหมือน `ProductPickerSheet` ที่โชว์ "SKU: xxx" ใต้ชื่อ) เป็น nice-to-have ไม่ใช่ must<br>**Target file(s):** `ProductGrid.tsx:29-32` (filter logic), `ProductCombobox.tsx:51-54` (filter logic)<br>**Reuse source:** filter pattern เดียวกับ `ProductPickerSheet.tsx:55-60` (`p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s)`) — **copy expression ตรง ๆ ได้เลย ไม่ต้อง component ใหม่** เพราะเป็นแค่ filter predicate ไม่ใช่ UI container | DONE |
| S-4 | **จำ default channel/payment บน desktop** — `CartPanel` accordion "ชำระเงิน/ช่องทาง" มี UI ให้ตั้งค่าเริ่มต้น (เขียน `localStorage`) เหมือนปุ่มดาวบนมือถือ | **User story:** ในฐานะ seller ที่ใช้จอ desktop ฉันต้องการตั้งช่องทางขาย/วิธีชำระเงินที่ใช้บ่อยเป็นค่าเริ่มต้น เพื่อไม่ต้องเลือกใหม่ทุกออเดอร์ เหมือนมือถือ<br>**Acceptance:** (1) accordion "ชำระเงิน/ช่องทาง" มีปุ่ม/ไอคอนตั้งค่าเริ่มต้นข้าง select แต่ละตัว (channel, payment) (2) กดตั้งค่า → เขียนลง `localStorage` key เดียวกับมือถือ (`deep.default.salesChannel`/`deep.default.paymentMethod` จาก `ChannelPaymentSelect.tsx:30-31`) (3) รีเฟรช/เปิดหน้าใหม่บน desktop → ค่าเริ่มต้น auto-apply (จริง ๆ ทำงานอยู่แล้วเพราะ `OrderCreateForm.tsx:253-261` อ่าน localStorage ไม่แยก viewport — ต้องแค่เพิ่ม UI ฝั่ง "เขียน" บน desktop) (4) ตั้งค่าบนมือถือ → เปิดบน desktop เห็นค่าเดียวกัน (และกลับกัน) เพราะ key เดียวกัน<br>**Target file(s):** `CartPanel.tsx:172-203` (payment/channel accordion — เพิ่มปุ่ม/icon ตั้ง default ข้าง `<Select>` แต่ละตัว)<br>**Reuse source:** `localStorage` key + `setDefault()` logic pattern จาก `ChannelPaymentSelect.tsx:30-31,56-59` (reuse key ตรง ๆ — ต้องเป็น key เดียวกันเป๊ะเพื่อ sync ข้าม viewport, ไม่ reuse `OptionPickerSheet.tsx` ซึ่งเป็น bottom sheet) | DONE |

## Out-of-Scope
> แตะของในนี้ = CREEP (hard block). ถ้าจำเป็นต้องทำ → Controller ตัดสิน + ย้ายขึ้น In-Scope พร้อมจด Change Log.

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | แก้/รีแฟคเตอร์ `QuickForm.tsx` หรือ component มือถือใด ๆ (`CustomerQuickBlock`, `AddressSearchSheet`, `PasteParseSheet`, `ChannelPaymentSelect`, `OptionPickerSheet`, `ProductPickerSheet`, `QuickLineItem`, `QuickPriceSheet`, `QuickSummaryPanel`) | phase นี้ทำ desktop parity เท่านั้น — mobile ทำงานถูกต้องอยู่แล้ว ห้าม regress |
| OOS-2 | เพิ่มวิธีชำระเงินบนมือถือให้ครบ 6 ตัวเท่า desktop (`PROMPTPAY`/`CARD`/`OTHER`) | เป็น gap ทิศทางกลับ (G-5 ใน PM report) — ตั้งใจไว้แล้วตาม spec เดิม (comment ใน `ChannelPaymentSelect.tsx:17`) ไม่ใช่ scope ของ phase นี้ |
| OOS-3 | แตะ `POST /api/orders`, `CreateOrderSchema`, validation ฝั่ง backend, หรือ schema ใน `OrderCreateForm.tsx` (`Yup` schema, `FormValues` type) | ฟิลด์/validation ครบอยู่แล้วทั้งสอง viewport (ยืนยันจาก gap analysis) — phase นี้เป็นแค่ UX affordance ฝั่ง input ไม่ใช่ data model |
| OOS-4 | Redesign layout POS split (`grid lg:grid-cols-2`, sticky footer, ตำแหน่ง `ProductGrid`/`CartPanel`) | นอก scope — แก้แค่เนื้อใน accordion/search ที่มีอยู่ |
| OOS-5 | สร้าง full-screen sheet บน desktop (reuse `AddressSearchSheet`/`PasteParseSheet`/`CustomerSearchSheet`/`ProductPickerSheet` ตรง ๆ โดยไม่ปรับ container) | ผิด UI pattern desktop (accordion/inline, ไม่ใช่ bottom-sheet/full-screen) — ต้อง reuse เฉพาะ **logic layer** (`parse-order-message.ts`, `thai-address.json` fetch/cache, filter predicate, localStorage key) ไม่ใช่ sheet component ทั้งก้อน (ดู Risks) |
| OOS-6 | Server-side default preference (เก็บ default channel/payment ที่ `Shop` model แทน `localStorage`) | ระบุไว้แล้วใน spec เดิมว่าเป็น Phase 2 (`docs/superpowers/specs/2026-07-06-quick-create-order-design.md` §3 "server-side (Shop prefs) = Phase 2") — phase นี้คง `localStorage` per-device เหมือนเดิม |
| OOS-7 | เพิ่ม best-seller card strip ในหน้า desktop (`ProductGrid` มี catalog เต็มอยู่แล้ว) | ไม่ใช่ gap ที่ระบุ (mobile มี best-seller เพราะพื้นที่จำกัด, desktop เห็น catalog เต็มอยู่แล้วผ่าน grid) |

## Assumptions
- S-1/S-2 ต้องออกแบบ **UI container ใหม่** สำหรับ desktop (ไม่ใช่แค่ wiring) — เช่น dropdown-panel หรือ modal ขนาดกลาง แทน full-screen sheet มือถือ ต้องผ่าน `safepay-ux` (Hard Rule 8, mandatory gate ทุกงาน frontend) ก่อน implement ทุก S-id ที่แตะ UI
- ค่า default channel/payment (S-4) ยังเป็น `localStorage` per-device เดิม — desktop กับมือถือบนอุปกรณ์เดียวกัน/browser เดียวกันเท่านั้นที่ sync กัน (ข้าม device ไม่ sync เพราะไม่มี server-side pref ใน MVP)
- Thai address dataset (`public/data/thai-address.json`) ใช้ก้อนเดียวกับมือถือ ไม่สร้าง endpoint/ไฟล์ใหม่
- `ProductGrid`/`ProductCombobox` SKU search (S-3) ถือเป็น "must" เพราะเป็นแค่แก้ filter predicate 1 บรรทัด ความเสี่ยง regression ต่ำ — ไม่แยก nice-to-have
- ไม่มี FR ใน PRD/SRS ที่ตรงกับ 4 affordance นี้โดยตรง — acceptance criteria อ้างอิงพฤติกรรมของ mobile component ที่มีอยู่แล้วเป็น SSOT เชิงเปรียบเทียบ (functional parity) แทน FR number

## Deferred → Phase 2
> ของที่จงใจไม่ทำใน phase นี้ — **ไม่นับเป็น GAP** ตอน audit/sign-off

- Server-side (Shop-level) default channel/payment preference — แทน `localStorage` per-device (ตาม spec เดิมกำหนดไว้แล้ว)
- เพิ่มวิธีชำระเงินให้มือถือครบ 6 ตัวเท่า desktop (ทิศทางตรงข้ามของ phase นี้ — OOS-2)
- Sales channel "Shopee" เข้า enum จริง (ค้างจาก spec 2026-07-06 เดิม ไม่เกี่ยวกับ phase นี้)

## Risks
- **Pattern mismatch (สำคัญที่สุด):** mobile ใช้ full-screen bottom sheet (`PasteParseSheet`/`AddressSearchSheet`) แต่ desktop ใช้ accordion + inline field ใน `CartPanel` — **ห้าม reuse sheet component ตรง ๆ** (จะเพี้ยน UX บนจอกว้าง/ผิด Paces pattern) ต้อง reuse เฉพาะ **logic layer**: `parse-order-message.ts` (pure function), `thai-address.json` fetch/cache module pattern, filter predicate string, `localStorage` key — แล้วสร้าง **UI container ใหม่** สำหรับ desktop โดยเฉพาะ (ผ่าน `safepay-ux` ก่อนเสมอ)
- S-1/S-2 มีความซับซ้อน UI มากกว่า S-3/S-4 (ต้องออกแบบ container ใหม่ ไม่ใช่แค่ copy logic) — เสี่ยง scope creep ถ้า dev เผลอ redesign ทั้ง accordion หรือ import sheet component เข้ามาตรง ๆ (ผิด OOS-5) reviewer ต้อง grep import ของ `PasteParseSheet`/`AddressSearchSheet`/`CustomerSearchSheet`/`ProductPickerSheet` ใน `CartPanel.tsx`/`CustomerSelectBlock.tsx` ต้องเป็น 0 (ยกเว้นถ้า Controller อนุมัติเปลี่ยน pattern เป็นพิเศษ)
- `localStorage` key ต้องตรงกันเป๊ะระหว่าง `ChannelPaymentSelect.tsx` (มือถือ, เขียน) กับ implementation ใหม่บน `CartPanel.tsx` (desktop, เขียน) — ถ้า key ไม่ตรง จะไม่ sync ข้าม viewport (silent bug)
- Thai address dataset โหลด runtime (982KB JSON) — ถ้า desktop เรียกซ้ำโดยไม่ reuse module-level cache (`ADDR_CACHE` pattern) จะโหลดซ้ำสองรอบ (มือถือ+desktop คนละ cache instance) ต้องออกแบบให้ share cache module เดียวกันถ้าเป็นไปได้ หรือยอมรับ trade-off แล้วบันทึกเป็น known-gap

## Change Log
> ทุกครั้งที่ Controller อนุมัติแก้ scope (รับเข้า/เลื่อนออก) จดที่นี่ — กัน creep เงียบ

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-07-08 | baseline สร้าง | user รายงาน desktop /orders/new ไม่ครบเท่า mobile → PM gap analysis (G-1..G-5) → Controller ตัดสินใจรับ G-1..G-4 เข้า scope เป็น phase ใหม่ | Controller |
| 2026-07-08 | SIGNED-OFF — S-1..S-4 ครบ acceptance, ไม่มี CREEP/GAP | commit `76792422`(S-3) `40750164`(S-1,S-2) `2f7ae787`(S-4) + baseline `7127c527`; merged FF → main + push (deploy prod); QA static (tsc + 8-gate review ทุก S-id), visual E2E = carried debt (เทส prod) | Controller (product sign-off) |
