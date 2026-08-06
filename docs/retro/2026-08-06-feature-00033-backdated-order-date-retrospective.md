# Retro — feature 00033 วันที่คำสั่งซื้อย้อนหลัง (2026-08-06)

**ขอบเขต:** ตั้งแต่ brainstorm ถึง deploy prod 5 รอบ (ฟีเจอร์หลัก `6f12cd6b` → critique P1 `019d1f68` → clarify `0357e5ed` → polish `632f57b9` → optimize `c02efbc5`)
**วิธีเดินงาน:** brainstorm → spec+mockup → plan 12 task → SDD (subagent ต่อ task + reviewer ต่อ task) → final review → impeccable 4 คำสั่ง

---

## Problems

### P-1 ชื่อฟังก์ชันผิดตั้งแต่ spec แล้วลามไปทั้งสายเอกสาร

`updateOrderContent` **ไม่มีอยู่จริงในโค้ดเลย** ชื่อจริงคือ `updateOrder` (`src/services/order.service.ts:416`)

ต้นทางคือ agent สำรวจรอบแรกรายงานชื่อผิดมา แล้ว Controller เชื่อโดยไม่เปิดไฟล์ยืนยัน ชื่อนั้นจึงไหลเข้า design spec §6.2 → implementation plan Task 7 → task brief → จนถึงตัว implementer

**คนที่จับได้คือ `safepay-planner`** ตอนเขียน SRS เพราะถูกสั่งว่า "เขียนเอกสารจากโค้ด ไม่ใช่จากความจำ" และมันเปิดไฟล์จริง — ไม่ใช่ tsc ไม่ใช่ reviewer ไม่ใช่ detector

**หลักฐาน:** commit `9ba7554c` (แก้ทั้ง spec, plan, และเอกสาร feature ทุกไฟล์พร้อมกัน)

### P-2 migration timestamp ชนกับ branch อื่น แล้วลบค่าของกันเองเงียบ ๆ

ไฟล์ `20260806120000_order_event_date_changed` ชนกับ `20260806120000_order_shipment_cod_settled` (branch `feat/i-ship-integrate`) **พอดีตัว** และมี `20260806140000_order_event_payment_synced` ตามมาอีก

ทั้งสามเขียน CHECK constraint แบบ `DROP` แล้ว `ADD` ด้วย **รายชื่อ hardcode ที่ตัวเองรู้จัก** → ตัวที่รันทีหลังลบค่าของตัวที่รันก่อนทิ้ง **ไม่มี error ไม่มี test เดิมจับ** จะไปโผล่เป็น insert ล้มบนฐานจริงเท่านั้น

สิ่งที่จับได้คือ **เทส integration เคสที่ 4** ที่ Task 12 เพิ่งเขียน — ถ้าไม่มีเทสนั้น ปัญหาจะขึ้น prod ไปเงียบ ๆ และรอวันที่มีคนกดแก้วันที่ออเดอร์เป็นครั้งแรก

**หลักฐาน:** commit `87939439` · `pg_get_constraintdef` บนฐาน dev แสดง 12 ค่าโดยไม่มี `ORDER_DATE_CHANGED` ทั้งที่ `_prisma_migrations` บอกว่า apply สำเร็จ

### P-3 การแก้ผลรีวิวรอบเร่ง สร้างบั๊กใหม่ 2 ตัว

**(ก)** แก้ C-1/C-2 ด้วยการ destructure `dirtyFields` จาก `useForm().formState` — `formState` ของ RHF เป็น Proxy การอ่าน key คือการ subscribe ผลคือฟอร์ม **916 บรรทัด** re-render ทุกครั้งที่ฟิลด์ไหนก็ได้ถูกแก้ครั้งแรก ทั้งที่ค่านั้นถูกอ่านที่เดียวใน `onSubmit`
เจอตอน `/impeccable optimize` (`c02efbc5`)

**(ข)** แก้ I-4 ด้วยการตัด `ORDER_EDITED` เมื่อ `changedCount = 0` — แต่ `changedCount` มีจุดบอด (ไม่เทียบ `description`/`productId`) ผลคือ **แก้รายละเอียดสินค้าแล้วไม่เหลือร่องรอยในประวัติเลย** จากเดิมที่ยังมีแถว "แก้ไขคำสั่งซื้อ"
เจอตอน re-review รอบสอง (`8dc2fd7c`)

### P-4 gate อัตโนมัติผ่านหมด แต่ของยังใช้ไม่ได้ดี

`tsc` 0 · `build` 0 · เทส 29/29 · detector `[]` ทั้ง 4 ไฟล์ · grep gate ทุกตัว 0 บรรทัด — **แต่**:

| สิ่งที่หลุด gate ทั้งหมด | ใครจับ |
|---|---|
| `btn-ghost` เป็นคลาสที่ไม่มีอยู่จริงใน Paces | `safepay-ux` |
| บรีฟระบุไฟล์ผิดตัวทั้งสองจุด (จริงคือ `CartPanel`/`QuickForm`) | `safepay-ux` |
| prop เดียวแยก "ไม่มีข้อความ" กับ "มีแต่เก่าเกิน" ไม่ออก → ชิปเตือนไม่มีวันแสดง | `safepay-ux` |
| คอนทราสต์ตก 4 จุด ทั้งที่ทุกจุดใช้ token ที่ถูกกฎ | `impeccable critique` + `audit` |
| `focus:outline-none` ไม่มีตัวแทน — WCAG 2.4.7 ตก | `impeccable audit` |
| เคสหลักของฟีเจอร์ต้องใช้ ~6 การกระทำ | `impeccable critique` |
| ป้าย "วันที่สั่งซื้อ" ผิดสำหรับร้าน 2 ใน 3 ประเภท | `impeccable clarify` |

### P-5 ไม่มี Scope Baseline ตลอด phase — และไม่มีใครหยุดไปสร้าง

`safepay-reviewer` เขียนว่า "ไม่พบ `docs/scope/*00033*` จึงไม่บังคับ cite S-id" **ถึง 4 รอบ** ทุกรอบถูกบันทึกเป็น N/A แล้วผ่านไป

### P-6 เอกสาร feature ครบ แต่เอกสารระบบค้าง

`docs/20 - Features/00033/` ครบ 7 ไฟล์ตาม template ตั้งแต่ Task 1 (HR11 ผ่าน) **แต่ `docs/SRS.md` ซึ่ง CLAUDE.md ประกาศเองว่าเป็นที่ที่ "งานที่แตะ data model/API/enum/validation ต้องอ่านก่อน" ไม่ถูก sync เลย** จนกระทั่ง user ถามว่า "เหลืออะไรอีกไหม" แล้วผมไปเช็ค

จุดที่ค้าง: `CreateOrderSchema` มีคีย์ใหม่ · `OrderEvent.type` 9→13 ค่า · `Order.createdAt` เปลี่ยนความหมาย · `PATCH /api/orders/[token]` ไม่เคยอยู่ใน SRS เลย · โมเดล `OrderEvent` ไม่เคยอยู่ใน SRS เลยตั้งแต่ 00031

---

## Root causes

**P-1** — รายงานของ agent สำรวจถูกใช้เป็น "ความจริง" โดยตรง ไม่มีขั้นตอน verify symbol ด้วย grep ก่อนเขียนลง spec · และเมื่อชื่อผิดอยู่ใน spec แล้ว ทุกด่านถัดไป (plan, brief, implementer) อ่านต่อจาก spec ไม่ได้อ่านโค้ด — ความผิดจึงเดินทางได้ไกลโดยไม่มีแรงต้าน

**P-2** — timestamp ของ migration เลือกจาก "เวลาปัจจุบันปัดชั่วโมง" ซึ่งชนกันได้ง่ายมากเมื่อหลาย branch ทำงานวันเดียวกัน · และ **pattern `DROP` + `ADD` ด้วยรายชื่อ hardcode เป็นค่าตั้งต้นของทุก migration ก่อนหน้า** เราจึงลอกมาโดยไม่ตั้งคำถาม ทั้งที่มันไม่ปลอดภัยเมื่อมีมากกว่าหนึ่งคนเพิ่มค่า

**P-3** — แก้ "อาการ" โดยไม่อ่าน "กลไก" ของ API ที่ใช้: (ก) ไม่รู้ว่า `formState` เป็น Proxy ที่ subscribe ตอนอ่าน (ข) ไม่ได้ตรวจว่า `changedCount` ครอบฟิลด์อะไรบ้างก่อนเอามาเป็นเงื่อนไข · ทั้งคู่เกิดในรอบที่ user สั่งให้เร่ง ซึ่งเราตีความว่า "ลดการตรวจ" แทนที่จะ "ลดการถาม"

**P-4** — gate อัตโนมัติทั้งหมดตอบคำถาม *"ผิดกฎไหม"* ไม่มีตัวไหนตอบ *"ใช้ได้จริงไหม / ดีไหม"* — ซึ่งเป็นคำถามที่ต้องมีคนอ่านโค้ดในบริบทของผู้ใช้จริงเท่านั้นถึงจะตอบได้

**P-5** — SDD ledger (`.superpowers/sdd/`) ทำหน้าที่ติดตามงานได้ดีพอจนไม่มีใครรู้สึกว่าขาดอะไร · และ reviewer ถูกออกแบบให้ "ไม่บังคับเมื่อไม่มี baseline" ซึ่งทำให้การไม่มี baseline กลายเป็นสถานะที่สบายกว่าการมี

**P-6** — HR11 เขียนถึง **feature docs** ชัดเจนมาก (มีตาราง ownership มีคำสั่ง `diff` ให้เช็ค) แต่ไม่ได้พูดถึงเอกสารระบบเลย ทำให้ "ครบ 7 ไฟล์" ถูกเข้าใจว่า = "เอกสารเสร็จ"

---

## Conventions to adopt

### C-1 migration ที่แก้ CHECK constraint แบบรายชื่อ ต้องเป็น additive ห้าม hardcode

อ่านรายชื่อเดิมจาก `pg_constraint` แล้วต่อท้ายค่าใหม่ · ล้มเสียงดังเมื่อ parse ไม่ครบ · idempotent · และ **เช็ค timestamp ชนก่อนตั้งชื่อโฟลเดอร์เสมอ**
→ `docs/conventions/migration-check-constraint-additive.md`

### C-2 ชื่อ symbol ที่ได้จากรายงาน agent ต้อง grep ยืนยันก่อนเขียนลง spec

รายงานของ agent สำรวจไม่ใช่หลักฐาน — `rg "^export (async )?function <ชื่อ>"` ใช้เวลา 2 วินาที เทียบกับความผิดที่เดินทางผ่าน spec → plan → brief → implementer
→ ขยาย memory `feedback_entity_names_from_schema_not_memory` ให้ครอบชื่อฟังก์ชัน ไม่ใช่แค่ table/column

### C-3 งานที่แตะ data model / API / enum / validation ต้อง sync `docs/SRS.md` ด้วย ไม่ใช่แค่ feature docs

"ครบ 7 ไฟล์ตาม template" ≠ "เอกสารเสร็จ" — SRS คือเอกสารที่คนถัดไปจะเปิดอ่านก่อนทำงาน ถ้ามันค้าง กับดักถูกวางไว้รอ
→ เพิ่มบรรทัดใน HR11 ของ CLAUDE.md

### C-4 "เร่ง" = ลดการถาม ไม่ใช่ลดการตรวจ

บั๊กทั้งสองตัวใน P-3 เกิดในรอบที่ถูกสั่งให้เร่ง · สิ่งที่ตัดได้คือ micro-approval ระหว่าง task และ review รายตัว สิ่งที่ตัดไม่ได้คือการอ่านกลไกของ API ที่กำลังจะใช้
(เป็นบทเรียนเดียวกับที่ HR11 เขียนไว้แล้วเรื่อง doc-first — ขยายให้ครอบการแก้บั๊กด้วย)

---

## What went right

1. **SSOT เดียวของกฎวันที่ได้ผลจริง** — `order-date-window.ts` ป้อนทั้ง bound ของ input, ข้อความ error, Valibot, service และ Yup · ตอน clarify เปลี่ยนข้อความ error จาก "บอกกฎ" เป็น "บอกวันที่จริง" **แก้ที่เดียวแล้วทั้ง client และ API เปลี่ยนพร้อมกัน** — บทเรียนจาก `shipping-address-status.ts` ถูกใช้จริง ไม่ใช่แค่เขียนไว้ใน retro เก่า

2. **เทส integration เป็นตัวจับ P-2** — เคสที่ assert ว่า `occurredAt ≈ now` **ไม่ใช่** ค่าที่ส่งไป เป็นเคสที่เขียนขึ้นมาเพราะรู้ว่าจุดนั้นพังเงียบได้ และมันก็จับ migration ที่ถูกลบค่าได้จริงในรอบเดียวกัน

3. **`safepay-ux` เป็น gate ที่คุ้มค่าที่สุดในรอบนี้** — จับ 3 อย่างที่ tsc/detector/reviewer มองไม่เห็นเลย รวมถึง "บรีฟระบุไฟล์ผิดตัว" ซึ่งถ้าไม่จับ implementer จะไปแก้ไฟล์ที่ไม่ได้ render อะไรเลย

4. **impeccable 4 คำสั่งเรียงกันแล้วไม่ซ้ำงาน** — critique หาปัญหาดีไซน์ · clarify หาคำพูด · audit หาเรื่องเทคนิค · optimize หาของช้า แต่ละตัวเจอคนละชั้น และ optimize จับ regression ที่ critique-fix สร้างเอง

5. **การหยุดถามตอนเจอกับดักภาษา** — ตอนจะผันป้ายตาม vertical เจอว่า `"วันที่" + noun` ทำให้ร้านบ้านพักได้ "วันที่บิลเข้าพัก" ซึ่งชนกับ `Order.checkIn` คนละคอลัมน์ · หยุดถาม user แทนที่จะเดา ตรงกับ `feedback_vocab_substitution_needs_sentence_sets`

---

## Action items

1. เขียน `docs/conventions/migration-check-constraint-additive.md` (C-1) — **ทำในรอบนี้**
2. เพิ่มบรรทัด SRS sync ใน HR11 ของ `CLAUDE.md` (C-3) — **ทำในรอบนี้**
3. ขยาย memory `feedback_entity_names_from_schema_not_memory` ให้ครอบชื่อฟังก์ชันจากรายงาน agent (C-2) — **ทำในรอบนี้**
4. เพิ่มบันทึก 00033 ใน "Current State Snapshots" ของ `CLAUDE.md` — **ทำในรอบนี้**
5. **browser QA 75 เคส** — user รับไปกดเองบน prod (2026-08-06)
6. **E2E Playwright** สำหรับ flow วันที่ย้อนหลัง — ยังไม่มี ค้างไว้
7. **P2 จาก impeccable critique 3 ข้อ** — ปุ่มเขียนทับโดยไม่ถาม · ปี พ.ศ./ค.ศ. บนจอเดียว · ลำดับชั้น 4 บรรทัดตอนขยาย (ต้องเห็นจอจริง)
8. `schema.prisma:2725` ยังมีคอมเมนต์ "type: 9 ค่าคงที่" ที่ล้าสมัย (ตอนนี้ 13) — `safepay-docs` ทักไว้ นอกขอบเขตงานตอนนั้น
