# Retro — Seller Orders Phase B (Create rework B0–B8)

วันที่ 2026-05-17 · branch `feat/seller-orders-phase-a` · workflow `agent-team-phase` (Controller + safepay-developer/reviewer) · commits `7c3203d`(B0) → `4fe522d`(Unit1 B1+B2) → `e75f917`(Unit2 B3) → `94a3857`(Unit3 B4-B8)

## สรุป

แตก Create-order form เดิม (flat single-file) → 4 client block (Customer search-first / Payment+discount/VAT / Cart+ที่อยู่จัดส่ง auto / Summary recap) + รื้อ backend ให้รับ 7 field ใหม่ + endpoint `GET /api/orders/customers`. Reviewer 8-gate PASS ทุก batch, tsc 0, ไฟล์ Controller-verify บน disk ทุกรอบ, migration apply ลง dev DB แล้ว.

## Problems

1. **Plan ขัดกับ approved mockup โดยไม่มีใครสะดุด** — plan §4 B5 + decision §3 บอกใส่ discount/VAT, แต่ mockup `create.html` (UX ที่ user approve แล้ว) ไม่มี field นั้นเลย ทั้ง BLOCK 2 และ summary panel. ถ้า Controller ตาม plan เงียบ ๆ = ส่งของที่ขัด UX ที่ approve; ถ้าตาม mockup เงียบ ๆ = ทิ้ง decision ที่ล็อก. แก้โดยถาม user (เลือก "ตามแผน: ใส่ครบ" + honest breakdown).
2. **Path ใน plan ไม่ตรง physical structure** — plan เขียน target เป็น `.../orders/new/components/X` แต่ component จริงอยู่ใต้ `(dashboard)/orders/new/components/` ส่วน page shell อยู่ `(fullscreen)/orders/new/page.tsx`. ถ้า dispatch developer ด้วย path จาก plan ตรง ๆ = สร้างไฟล์ผิดที่ทั้ง batch.
3. **User เข้าใจผิดเรื่อง DB target** — user สั่ง "migrate ให้เลย มันเป็น docker local" แต่ `.env.local` (ตัวที่ dev ใช้จริง) ชี้ Supabase cloud ที่แชร์กัน ไม่ใช่ docker localhost. รันตามคำพูดเลยโดยไม่ verify = push migration เข้า shared cloud DB โดยที่ user คิดว่าเป็น throwaway local.
4. **Developer self-report ไม่ตรง disk** — B5 report 178 บรรทัด, ไฟล์จริง 199. tsc clean จริงทั้งคู่ แต่ตอกย้ำว่า self-report ≠ persisted.
5. **QA ไม่ได้รัน** — Phase ปิดด้วย code-review + tsc + migration-applied เท่านั้น; ไม่มี runtime/E2E (dev server ไม่รัน, user สั่ง "ต่อเลย retro" ข้าม QA). **นี่คือ open risk: behavior ของ 4-block compose + onSubmit mapping ยังไม่ถูก verify บน browser จริง.**

## Root causes

1. Mockup กับ plan/decision เขียนคนละรอบ — mockup freeze ก่อน decision §3 ใส่ discount/VAT เข้า MVP; ไม่มี gate ที่บังคับ cross-check "plan ↔ approved mockup" ก่อน dispatch.
2. safepay-planner เขียน path เชิง logical ไม่ใช่ verified physical path; resume doc ก็ไม่ระบุว่า component อยู่ route-group ไหน.
3. คำว่า "docker local" เป็น mental model เก่าของ user; memory `project_dev_db_and_paces_pitfalls` รู้ความจริงอยู่แล้วแต่ต้อง Controller เป็นคน trigger การ verify ไม่ใช่เชื่อคำสั่ง.
4. agent เขียนไฟล์ผ่าน tool แต่ report จากความจำ/ประมาณ — โครงสร้าง agent ไม่ได้ echo `wc -l` จริง.
5. QA เป็น gate เดียวที่ต้อง environment ภายนอก (dev server + DB) — block ได้ด้วยเหตุนอกเหนือโค้ด; workflow ไม่มี "ปิด phase แบบมี QA-debt ที่ track ไว้".

## Conventions to adopt

1. **Controller cross-check approved mockup ↔ plan/decision ก่อน dispatch batch UI** — ถ้า field/section ใน plan ไม่มีใน mockup ที่ user approve (หรือกลับกัน) = หยุด ถาม user ก่อน build ห้ามเลือกข้างเงียบ ๆ. (ขยาย Hard Rule 6: ไม่ใช่แค่ reference ของ user แต่รวม plan-vs-own-approved-mockup ด้วย)
2. **Plan path ต้อง verify เป็น physical path ก่อนเข้า Develop** — Controller `ls`/`Glob` ยืนยัน target dir + route-group จริง แล้วค่อยฝัง absolute path ใน developer prompt; ห้ามส่ง logical path จาก plan ดิบ.
3. **คำสั่งที่อ้าง infra/DB/env ("มันคือ docker", "local เฉย ๆ") = verify ปลายทางก่อนทำเสมอ** — โดยเฉพาะ migrate/seed/reset. echo host จาก env ที่จะใช้จริง + แก้ความเข้าใจ user ถ้าไม่ตรง ก่อนรัน. (เสริม `feedback_verify_dont_assume` + `project_dev_db_and_paces_pitfalls`)
4. **ปิด phase แบบมี QA-debt = อนุญาตเฉพาะเมื่อ user สั่งชัด + บันทึก QA-debt เป็น action item + memory** — ห้าม claim "Phase complete" ลอย ๆ; เขียน "code-complete, QA-pending" ให้ session หน้าเห็น.

## What went right (anchor — ทำซ้ำ)

1. **ล็อก shared contract ก่อน dispatch parallel dev** — Controller นิยาม `FormValues` field-name + API mapping (vatRate%÷100, vatAmount formula, shippingAddress key set) แล้วฝังใน prompt ของ B4/B5/B6 ทุกตัว → B7 integrate ได้โดย **ศูนย์ rework** ทั้งที่ 3 block สร้างแบบ parallel. นี่คือกุญแจที่ทำให้ parallelism ไม่พังตอน integrate.
2. **Controller verify ไฟล์บน disk + fresh tsc ทุก batch** — จับ self-report discrepancy ได้ (memory `feedback_verify_agent_edits` พิสูจน์ค่า session นี้).
3. **Selective staging เป๊ะ** — `git add` เฉพาะ path ของ unit ทุก commit; parallel-stream noise (WalletCard/sms route/qa-seed) ไม่เคยหลุดเข้า commit แม้แต่ครั้งเดียว.
4. **Reviewer อิสระจับ blocker จริง** — Unit 1 reviewer จับ `orderCount` นับเฉพาะ order ที่ match q (ไม่ใช่ total) — bug ตรรกะที่ tsc/ตัว dev ไม่เห็น; REWORK → fix → re-review PASS.
5. **ถาม user ตรงจุดตัดสินใจ** (discount/VAT) แทนเดา — ตรง `feedback_brainstorm_pace` / Hard Rule 6.

## Action items

1. [Promote] เพิ่ม convention 1–4 เข้า `docs/conventions/agent-team-workflow.md` (addendum 2026-05-17 Phase B). ✅ (commit นี้)
2. [Memory] เขียน `feedback_lock_contract_before_parallel.md` — ล็อก shared type/field-name/API-mapping เป็น Controller ก่อน dispatch developer ที่ทำชิ้นพึ่งกัน + 1 บรรทัด `MEMORY.md`. ✅ (commit นี้)
3. [QA-debt] **Phase B ยัง code-complete ไม่ใช่ verified-complete** — ครั้งหน้าที่ dev server ขึ้น: dispatch `safepay-qa` batch-E2E + end-of-phase ที่ `seller.deepth.local` (สร้างออเดอร์ครบ 4 block → ลูกค้าเดิม/ใหม่ → discount/VAT breakdown → derive type → ที่อยู่ auto → POST → redirect `/orders/{token}` + ตรวจ field ใหม่ persist จริงใน DB). บันทึกใน `project_seller_orders_phase_resume`.
4. [Backlog] cart ที่เป็น `SUBSCRIPTION` ล้วน → `derivedType` ตก `DIGITAL` (plan §3 ล็อก 3-way ไม่ครอบ SUBSCRIPTION). nice-to-have — ถ้าจะรับ SUBSCRIPTION order ต้องเพิ่ม fallback.
5. [ค้าง] Phase A Unit D (Detail variant A) ยังไม่ทำ — ตัดสินใจกับ user ว่าทำต่อเลย หรือหลัง Phase B QA เขียว.
