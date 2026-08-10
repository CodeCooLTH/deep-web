---
title: "TestCase — Customer Multi-Phone & Merge"
owner: shinobu22
status: draft
module: M00042-CustomerMultiPhoneMerge
version: "1.0"
created: 2026-08-10
tags: [feature, test, customer, identity, phone, merge]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[SDS]]", "[[DATABASE]]", "[[API]]", "[[Feature-Docs-Ownership]]"]
---

> **โมดูล:** M00042-CustomerMultiPhoneMerge
> **ประเภทเอกสาร:** Test Case
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-08-10
> **สถานะ:** Draft — เขียนก่อนมีโค้ด (pre-implementation) ตาม Doc-First (Hard Rule 11) — ยังไม่มีการรันจริงสักเคส
> **เจ้าของเอกสาร:** QA (ดู [[Feature-Docs-Ownership]])

# Test Case: ลูกค้าหลายเบอร์และการรวมลูกค้า (Customer Multi-Phone & Merge)

---

## 1. Overview

ชุดทดสอบนี้ครอบคลุมฟีเจอร์ 00042 ทั้ง 2 กลไก — **เพิ่มเบอร์รอง** (FR-CM-001/002/003) และ **รวมลูกค้า**
(FR-CM-004/005/006/007) — รวมถึง 3 จุด critical ที่ต้องแก้ในโค้ดที่มีอยู่แล้ว (TFR-007/008/009) และจุด
"auto-correct" ที่ [[SRS]] §9/§10 อ้างว่าไม่ต้องแก้โค้ด (ชุดนี้พิสูจน์คำอ้างนั้นด้วยเทสจริง ไม่ใช่เชื่อเอกสารเฉย ๆ
ตาม `docs/conventions/docs-claimed-constraint-verify-in-code` โดยอนุโลม — ทิศเดียวกับ Hard Rule 16 ทิศกลับ)

เอกสารนี้เขียนก่อนมีโค้ดสักบรรทัด (`safepay-developer` ยังไม่เริ่ม implement) — ทุกเคสอ้างอิงจากอัลกอริทึม/
โครงสร้างที่ [[SRS]]/[[SDS]]/[[DATABASE]]/[[API]] ล็อกไว้แล้ว เมื่อ implement เสร็จให้รันชุดนี้ทั้งหมดแล้วอัปเดต
§5 "ผลล่าสุด" — ห้ามข้ามเคสที่ทำเครื่องหมาย `[blocker]` แม้แต่ข้อเดียวก่อน merge

- **เอกสารต้นทาง:** [[BRD]] (FR-CM-001..008, BR-CM-01..41) + [[SRS]] (TFR-001..010) + [[DATABASE]] (schema/trigger) + [[SDS]] (`decideMerge`/`decidePhoneConflict`, ลำดับ transaction, error mapping) + [[API]] (endpoint contract)
- **ขอบเขตชุดทดสอบ (Scope):**
  - **In-scope:** pure decision function (`decideMerge`/`decidePhoneConflict`), resolve algorithm (`resolveCustomerIdForPhone`/`findOrCreateCustomer` v2), 2 service ใหม่ (`customer-phone.service.ts`/`customer-merge.service.ts`), 3 จุด critical ที่มีอยู่แล้ว (`resolveCustomerForEditedOrder`/`customers/lookup/route.ts`/`linkBuyerHistory`), 2 API route ใหม่ + error-mapping เต็มตาราง, DB trigger 2 ตัว, PII masking, IDOR/ownership guard, race-condition lock, end-to-end sync ของทุก surface ที่ FR-CM-008 ระบุ, regression ของกลไกเดิม (`canRenameCustomerPhone`/`shouldRelinkThreadCustomer`)
  - **Out-of-scope:** UI ที่ยังไม่มี design spec จาก `safepay-ux` (component markup/layout ของ `MergeCustomersModal.tsx`/`AddPhoneModal.tsx` — เทสตรงนี้เขียนได้แค่ data-contract/state-machine level, รอ spec ก่อนล็อก selector), Phase 2 ทั้งหมดตาม PRD §5 (auto-detect ลูกค้าซ้ำ, self-service unmerge, `/customers/[id]` เต็มรูป, ขยาย `/o/{token}`, Role Permission)
- **สภาพแวดล้อม:**
  - **Unit/Service/Route:** Vitest, `environment: "node"` (ไม่มี jsdom — เทส React component ตรง ๆ ไม่ได้ในโปรเจกต์นี้), mock Prisma ด้วย `vi.mock`
  - **DB-level:** Vitest ชี้ local Docker Postgres เท่านั้น (`.env` → `localhost:5434`, ผ่าน allowlist ของ `tests/setup.ts` — **ห้ามชี้ `.env.local`/Supabase เด็ดขาด**) ต้อง apply migration `20260810120000_customer_multiphone_merge` กับฐาน local ก่อนรัน (ดู [[DATABASE]] §5.1)
  - **Browser QA:** `http://seller.deepth.local:4000` (ตาม `feedback_qa_domains` — user รัน dev server เอง)
- **🛑 ข้อจำกัดของ `tests/setup.ts::deleteTestData` ที่พบระหว่างเขียนเอกสารนี้:** ฟังก์ชันนี้ scope การลบด้วย
  `userIds`/`shopIds` เท่านั้น **ไม่รู้จักตาราง `Customer`/`CustomerPhone`/`CustomerMergeLog` เลย** (ตารางเหล่านี้
  ไม่ผูกกับ `shopId` โดยตรง เพราะเป็นตัวตนข้ามร้าน) — DB-level test ในเอกสารนี้จึง **ต้องลบเอง** ในทรานแซกชัน/afterEach
  ของตัวเอง โดย scope ด้วย id ที่ทดสอบสร้างเองเท่านั้น (`prisma.customerMergeLog.deleteMany({where:{id:{in:[...]}}})`
  → `customerPhone` → `externalContact`/`order` (ผ่าน `deleteTestData` เดิมได้) → `customer` → `shop`/`user`)
  เรียงลำดับลูกก่อนแม่เหมือนเดิม — **ห้ามเพิ่มเงื่อนไขลบแบบไม่ scope ใน `deleteTestData` เด็ดขาด** (Hard Rule 13)
  ดู Open Question ท้ายเอกสารนี้

---

## 2. Test Scenarios

### กลุ่ม A — Unit: `decideMerge()` (`src/lib/customer-merge-rules.ts`, pure function)

#### TC-U-001: [blocker] แถวเดียวกันทั้งคู่ → บล็อก SAME_ROW

- **Linked to:** FR-CM-005 (BRD), TD-001 ([[SDS]])
- **ประเภท:** unit (pure function)
- **Precondition:** ไม่มี (pure function, ไม่ต้อง setup DB)
- **Steps:**
  1. เรียก `decideMerge({id:'c1',userId:null,mergedIntoId:null}, {id:'c1',userId:null,mergedIntoId:null}, 'c1')`
- **Expected Result:** คืน `{ok:false, reason:'SAME_ROW'}`
- **Mutation proof:** แก้เงื่อนไข `a.id === b.id` เป็น `a.id !== b.id` ในโค้ด → เทสนี้ต้องแดง (คืน `ok:true` แทน)

#### TC-U-002: [blocker] แถว A ถูกรวมไปแล้ว (`mergedIntoId` ไม่ null) → บล็อก ALREADY_MERGED

- **Linked to:** FR-CM-006 AC ("แถวที่ถูกรวม ไม่สามารถใช้งานต่อในฐานะตัวตนอิสระได้อีก"), Must-not-miss #2
- **ประเภท:** unit
- **Steps:**
  1. เรียก `decideMerge({id:'c1',userId:null,mergedIntoId:'survivorX'}, {id:'c2',userId:null,mergedIntoId:null}, 'c2')`
- **Expected Result:** คืน `{ok:false, reason:'ALREADY_MERGED'}`
- **Mutation proof:** ลบเงื่อนไขนี้ทิ้ง (comment out) → เทสต้องแดง (ตกไปเช็คเงื่อนไขถัดไปแทนแล้วคืน `ok:true`)

#### TC-U-003: [blocker] แถว B ถูกรวมไปแล้ว → บล็อก ALREADY_MERGED

- **Linked to:** เหมือน TC-U-002 (ฝั่งตรงข้าม — กัน asymmetric bug ที่เช็คแค่ `a.mergedIntoId`)
- **ประเภท:** unit
- **Steps:**
  1. เรียก `decideMerge({id:'c1',userId:null,mergedIntoId:null}, {id:'c2',userId:null,mergedIntoId:'survivorX'}, 'c1')`
- **Expected Result:** คืน `{ok:false, reason:'ALREADY_MERGED'}`
- **Mutation proof:** แก้ `a.mergedIntoId || b.mergedIntoId` เป็น `a.mergedIntoId` เฉย ๆ (ตัด `b` ทิ้ง) → เทสนี้ต้องแดง

#### TC-U-004: [blocker] ทั้งคู่มี `userId` ไม่ null และต่างกัน → บล็อก USERID_CONFLICT

- **Linked to:** BR-CM-11 (BRD), Must-not-miss #4 — "ห้ามรวมเมื่อทั้งสองแถวผูกบัญชีผู้ซื้อ"
- **ประเภท:** unit
- **Precondition:** ไม่มี
- **Steps:**
  1. เรียก `decideMerge({id:'c1',userId:'u1',mergedIntoId:null}, {id:'c2',userId:'u2',mergedIntoId:null}, 'c1')`
- **Expected Result:** คืน `{ok:false, reason:'USERID_CONFLICT'}`
- **Mutation proof:** แก้ `a.userId !== b.userId` เป็น `a.userId === b.userId` → เทสนี้ต้องแดง (คือกรณีที่อันตรายที่สุด — รวมบัญชีสมาชิก 2 คนสำเร็จ)

#### TC-U-005: ทั้งคู่มี `userId` เท่ากัน (เคสทางทฤษฎี) → ไม่ถูกมองว่าเป็น conflict

- **Linked to:** BR-CM-11 (ตรวจว่า guard ไม่ over-block)
- **ประเภท:** unit
- **Steps:**
  1. เรียก `decideMerge({id:'c1',userId:'u1',mergedIntoId:null}, {id:'c2',userId:'u1',mergedIntoId:null}, 'c1')`
- **Expected Result:** ไม่คืน `USERID_CONFLICT` (ตกไปเช็ค forced-survivor ต่อ — `u1===u1` ไม่ผ่านเงื่อนไข `!==`) → ผลสุดท้าย `{ok:true, survivorId:'c1', mergedId:'c2'}` เพราะทั้งคู่มี `userId` เดียวกัน ไม่มี conflict และ `requestedSurvivorId==='c1'` ตรงกับ `forcedSurvivorId` (ทั้งคู่ผ่านเงื่อนไข `userId != null` แต่ `forcedSurvivorId` คำนวณจาก `a` ก่อนเสมอ = `'c1'`)

#### TC-U-006: [blocker] มีแค่ A ที่มี `userId`, ระบุ survivor=A → อนุญาต survivor=A

- **Linked to:** BR-CM-12 (BRD)
- **ประเภท:** unit
- **Steps:**
  1. เรียก `decideMerge({id:'c1',userId:'u1',mergedIntoId:null}, {id:'c2',userId:null,mergedIntoId:null}, 'c1')`
- **Expected Result:** คืน `{ok:true, survivorId:'c1', mergedId:'c2'}`
- **Mutation proof:** สลับ `survivor`/`merged` ตอนคำนวณ (`survivor = requestedSurvivorId===a.id ? b : a`) → เทสนี้ต้องแดง (survivorId ผิดตัว)

#### TC-U-007: [blocker] มีแค่ A ที่มี `userId`, ระบุ survivor=B → บล็อก SURVIVOR_MISMATCH

- **Linked to:** BR-CM-12 — "ผู้ขายไม่ให้เลือกสลับ" — Must-not-miss #4 ฝั่งที่ต้องพิสูจน์ว่า guard ปิดทางลัด
- **ประเภท:** unit
- **Steps:**
  1. เรียก `decideMerge({id:'c1',userId:'u1',mergedIntoId:null}, {id:'c2',userId:null,mergedIntoId:null}, 'c2')`
- **Expected Result:** คืน `{ok:false, reason:'SURVIVOR_MISMATCH'}`
- **Mutation proof:** ลบเงื่อนไข `forcedSurvivorId && forcedSurvivorId !== requestedSurvivorId` ทั้งบล็อกทิ้ง → เทสนี้ต้องแดง (ผู้ขายเลือกแถวที่ไม่มี `userId` เป็นแถวหลักได้สำเร็จ ทับตัวตนที่ยืนยันแล้ว)

#### TC-U-008: มีแค่ B ที่มี `userId`, ระบุ survivor=B → อนุญาต

- **Linked to:** BR-CM-12 (ฝั่งตรงข้าม TC-U-006 — กัน asymmetric bug)
- **ประเภท:** unit
- **Steps:**
  1. เรียก `decideMerge({id:'c1',userId:null,mergedIntoId:null}, {id:'c2',userId:'u2',mergedIntoId:null}, 'c2')`
- **Expected Result:** คืน `{ok:true, survivorId:'c2', mergedId:'c1'}`

#### TC-U-009: มีแค่ B ที่มี `userId`, ระบุ survivor=A → บล็อก SURVIVOR_MISMATCH

- **Linked to:** BR-CM-12 (ฝั่งตรงข้าม TC-U-007)
- **ประเภท:** unit
- **Steps:**
  1. เรียก `decideMerge({id:'c1',userId:null,mergedIntoId:null}, {id:'c2',userId:'u2',mergedIntoId:null}, 'c1')`
- **Expected Result:** คืน `{ok:false, reason:'SURVIVOR_MISMATCH'}`

#### TC-U-010: ไม่มีฝั่งไหนมี `userId`, ระบุ survivor=A → อนุญาต ผู้ขายเลือกได้อิสระ

- **Linked to:** BR-CM-12 ("ถ้าทั้งสองแถวไม่มี `userId` เลย ให้ผู้ขายเลือกแถวหลักเอง")
- **ประเภท:** unit
- **Steps:**
  1. เรียก `decideMerge({id:'c1',userId:null,mergedIntoId:null}, {id:'c2',userId:null,mergedIntoId:null}, 'c1')`
- **Expected Result:** คืน `{ok:true, survivorId:'c1', mergedId:'c2'}`

#### TC-U-011: ไม่มีฝั่งไหนมี `userId`, ระบุ survivor=B → อนุญาต (สลับฝั่งจาก TC-U-010)

- **ประเภท:** unit
- **Steps:**
  1. เรียก `decideMerge({id:'c1',userId:null,mergedIntoId:null}, {id:'c2',userId:null,mergedIntoId:null}, 'c2')`
- **Expected Result:** คืน `{ok:true, survivorId:'c2', mergedId:'c1'}`

#### TC-U-012: [blocker] `requestedSurvivorId` ไม่ใช่ id ของแถวไหนเลย (ค่าปลอม/IDOR) → บล็อก SURVIVOR_MISMATCH

- **Linked to:** [[API]] §4.2 (server ต้อง re-validate เสมอ ห้าม trust client)
- **ประเภท:** unit
- **Steps:**
  1. เรียก `decideMerge({id:'c1',userId:null,mergedIntoId:null}, {id:'c2',userId:null,mergedIntoId:null}, 'c-ปลอม')`
- **Expected Result:** คืน `{ok:false, reason:'SURVIVOR_MISMATCH'}`
- **Mutation proof:** ลบเงื่อนไข `requestedSurvivorId !== a.id && requestedSurvivorId !== b.id` ทิ้ง → เทสนี้ต้องแดง (ฟังก์ชันพยายาม `survivor = requestedSurvivorId===a.id ? a : b` แล้วได้ผลลัพธ์ที่ผิดเงียบ ๆ แทนที่จะบล็อก)

#### TC-U-013: [blocker] survivor/merged ไม่สลับกันเมื่อ requestedSurvivorId=B (mutation-proof เฉพาะจุด)

- **Linked to:** ความถูกต้องของการ mapping `a`/`b` → `survivor`/`merged` — จุดที่ถ้าสลับผิดจะทำให้ merge ทำงาน "ย้อนทิศ" (รวมแถวหลักเข้าแถวรอง)
- **ประเภท:** unit
- **Steps:**
  1. เรียก `decideMerge({id:'aaa',userId:null,mergedIntoId:null}, {id:'bbb',userId:null,mergedIntoId:null}, 'bbb')`
  2. ตรวจ `result.survivorId === 'bbb'` และ `result.mergedId === 'aaa'` (ไม่ใช่กลับกัน)
- **Expected Result:** `survivorId='bbb'`, `mergedId='aaa'` ตรงกับที่ผู้ขายเลือก
- **Mutation proof:** สลับ `const survivor = ... ? a : b` กับ `const merged = ... ? b : a` ให้กลับด้าน → เทสนี้ต้องแดง

---

### กลุ่ม B — Unit: `decidePhoneConflict()` (`src/lib/customer-phone-rules.ts`, pure function)

#### TC-U-014: เบอร์ยังไม่มีเจ้าของเลย → อนุญาต

- **Linked to:** FR-CM-001 AC3 (BRD)
- **ประเภท:** unit
- **Steps:**
  1. เรียก `decidePhoneConflict({ownerCustomerId:null, targetCustomerId:'c1', ownerHasOrderWithShop:false})`
- **Expected Result:** คืน `{ok:true}`

#### TC-U-015: [blocker] เบอร์เป็นของลูกค้าคนเดียวกับที่กำลังจะผูก (sameCustomer) → บล็อก sameCustomer:true

- **Linked to:** FR-CM-001 AC — "เบอร์นี้เป็นเบอร์ของลูกค้ารายนี้อยู่แล้ว"
- **ประเภท:** unit
- **Steps:**
  1. เรียก `decidePhoneConflict({ownerCustomerId:'c1', targetCustomerId:'c1', ownerHasOrderWithShop:true})`
- **Expected Result:** คืน `{ok:false, sameCustomer:true, ownerVisibleToShop:true, ownerCustomerId:'c1'}`
- **Mutation proof:** แก้ `sameCustomer = input.ownerCustomerId === input.targetCustomerId` เป็น `!==` → เทสนี้ต้องแดง

#### TC-U-016: [blocker] เบอร์เป็นของลูกค้าคนอื่นที่ร้านนี้เคยขายให้ (visible) → บล็อก พร้อมคืน ownerCustomerId

- **Linked to:** BR-CM-03, ความเสี่ยงเชิงสถาปัตยกรรม [[SRS]] §8 แถว 3
- **ประเภท:** unit
- **Steps:**
  1. เรียก `decidePhoneConflict({ownerCustomerId:'c2', targetCustomerId:'c1', ownerHasOrderWithShop:true})`
- **Expected Result:** คืน `{ok:false, sameCustomer:false, ownerVisibleToShop:true, ownerCustomerId:'c2'}`

#### TC-U-017: [blocker] เบอร์เป็นของลูกค้าคนอื่นที่ร้านนี้ไม่เคยเห็นเลย (not visible) → บล็อก ห้ามคืน ownerCustomerId

- **Linked to:** BR-CM-23 ("ห้ามเปิดเผยข้อมูลใหม่ที่ระบบไม่เคยเปิดเผยมาก่อน") — เคสรั่วข้อมูลข้ามร้านที่อันตรายที่สุดของฟังก์ชันนี้
- **ประเภท:** unit
- **Steps:**
  1. เรียก `decidePhoneConflict({ownerCustomerId:'c2', targetCustomerId:'c1', ownerHasOrderWithShop:false})`
- **Expected Result:** คืน `{ok:false, sameCustomer:false, ownerVisibleToShop:false, ownerCustomerId:null}` — **ห้ามเป็น `'c2'`**
- **Mutation proof:** แก้ `ownerCustomerId: visibleToShop ? input.ownerCustomerId : null` เป็นคืน `input.ownerCustomerId` เสมอ (ไม่เช็ค `visibleToShop`) → เทสนี้ต้องแดง (นี่คือ mutation ที่อันตรายที่สุดในฟังก์ชันนี้ — รั่ว customerId ของร้านอื่นให้ร้านที่ไม่เคยมีสิทธิ์เห็น)

---

### กลุ่ม C — Service: `customer.service.ts` (resolve algorithm, mock Prisma)

#### TC-S-001: [blocker] `resolveCustomerIdForPhone` — เบอร์ตรงกับ `Customer.phone` (เบอร์หลัก), `mergedIntoId` เป็น null → คืน id ตัวเอง

- **Linked to:** TFR-001 ([[SRS]])
- **ประเภท:** service (mock prisma)
- **Precondition:** mock `client.customer.findUnique` คืน `{id:'c1', mergedIntoId:null}`
- **Steps:**
  1. เรียก `resolveCustomerIdForPhone(mockClient, '0812345678')`
- **Expected Result:** คืน `'c1'`, ไม่เรียก `client.customerPhone.findUnique` เลย (short-circuit)

#### TC-S-002: [blocker] `resolveCustomerIdForPhone` — เบอร์ตรงกับ `Customer.phone` แต่แถวนี้ถูกรวมไปแล้ว → คืน `mergedIntoId` ไม่ใช่ id ตัวเอง

- **Linked to:** Must-not-miss #2, DATABASE.md §3.1 chain-flatten invariant
- **ประเภท:** service
- **Precondition:** mock `client.customer.findUnique` คืน `{id:'c1', mergedIntoId:'survivorX'}`
- **Steps:**
  1. เรียก `resolveCustomerIdForPhone(mockClient, '0812345678')`
- **Expected Result:** คืน `'survivorX'` (ไม่ใช่ `'c1'`)
- **Mutation proof:** แก้ `return c.mergedIntoId ?? c.id` เป็น `return c.id` เฉย ๆ → เทสนี้ต้องแดง (เบอร์ของแถวที่ถูกรวมแล้วจะ dedupe กลับไปแถวเก่าที่ไม่มีใครใช้แล้ว)

#### TC-S-003: `resolveCustomerIdForPhone` — เบอร์ไม่ตรง `Customer.phone` แต่ตรง `CustomerPhone.phone` (เบอร์รอง) → คืน `CustomerPhone.customerId`

- **Linked to:** TFR-001, FR-CM-003
- **ประเภท:** service
- **Precondition:** mock `client.customer.findUnique` คืน `null`; mock `client.customerPhone.findUnique` คืน `{customerId:'c1'}`
- **Steps:**
  1. เรียก `resolveCustomerIdForPhone(mockClient, '0898765432')`
- **Expected Result:** คืน `'c1'`

#### TC-S-004: `resolveCustomerIdForPhone` — เบอร์ไม่เคยผูกกับใครเลย (ทั้ง 2 ตาราง) → คืน `null`

- **Linked to:** TFR-001 (contract: "ผู้เรียกตัดสินใจเองว่าจะสร้างใหม่หรือไม่")
- **ประเภท:** service
- **Steps:**
  1. mock ทั้งสอง query คืน `null`
  2. เรียก `resolveCustomerIdForPhone(mockClient, '0800000000')`
- **Expected Result:** คืน `null`, ไม่ throw

#### TC-S-005: [blocker] `findOrCreateCustomer` v2 — สร้างออเดอร์ด้วยเบอร์รอง → resolve เป็น customerId เดิม ไม่สร้างแถวใหม่

- **Linked to:** Must-not-miss #1 ("ถ้าเคสนี้พลาด ฟีเจอร์ทั้งก้อนไม่ทำงานเลยแต่ทุกอย่างดูปกติ") — FR-CM-003
- **ประเภท:** service
- **Precondition:** mock `tx.$queryRaw` ครั้งแรก (query `Customer` ด้วย `FOR SHARE`) คืน `[]` (ไม่เจอเบอร์นี้เป็นเบอร์หลัก); ครั้งที่สอง (query `CustomerPhone`) คืน `[{customerId:'c-existing'}]`
- **Steps:**
  1. เรียก `findOrCreateCustomer(tx, '0898765432')` (เบอร์รองของลูกค้า `c-existing`)
- **Expected Result:** คืน `'c-existing'`; **`tx.customer.create` ต้องไม่ถูกเรียกเลย**
- **Mutation proof:** ลบขั้นตอนเช็ค `CustomerPhone` ทิ้ง (กลับไปเช็คแค่ `Customer` เหมือนเวอร์ชันเดิม) → เทสนี้ต้องแดง (จะเรียก `tx.customer.create` สร้างแถวใหม่แทน)

#### TC-S-006: `findOrCreateCustomer` v2 — สร้างออเดอร์ด้วยเบอร์หลักของแถวที่ถูกรวมไปแล้ว → resolve เป็น survivor id

- **Linked to:** DB-4 (soft-pointer), Must-not-miss #2
- **ประเภท:** service
- **Precondition:** mock `tx.$queryRaw` (query `Customer` ด้วย `FOR SHARE`) คืน `[{id:'c-old', mergedIntoId:'c-survivor'}]`
- **Steps:**
  1. เรียก `findOrCreateCustomer(tx, '0812345678')`
- **Expected Result:** คืน `'c-survivor'` (ไม่ใช่ `'c-old'`)

#### TC-S-007: `findOrCreateCustomer` v2 — เบอร์ไม่เคยมีใครใช้เลย → สร้างแถวใหม่

- **Linked to:** พฤติกรรมเดิม (regression) — ต้องไม่พังตอนไม่มีเบอร์รองเกี่ยวข้อง
- **ประเภท:** service
- **Precondition:** ทั้งสอง `$queryRaw` คืน `[]`; mock `tx.customer.create` คืน `{id:'c-new'}`
- **Steps:**
  1. เรียก `findOrCreateCustomer(tx, '0899999999')`
- **Expected Result:** คืน `'c-new'`, `tx.customer.create` ถูกเรียก 1 ครั้งด้วย `{data:{phone:'0899999999'}}`

#### TC-S-008: `findOrCreateCustomer` v2 — race P2002 ตอนสร้าง แล้วเบอร์นั้นกลายเป็นเบอร์รองไปแล้วพอดี → re-find ผ่าน `resolveCustomerIdForPhone` สำเร็จ

- **Linked to:** TFR-002 Error/Edge cases — "P2002 race ต้อง re-find ผ่าน `resolveCustomerIdForPhone` ไม่ใช่แค่ `Customer.phone`"
- **ประเภท:** service
- **Precondition:** ทั้งสอง `$queryRaw` แรกคืน `[]`; `tx.customer.create` throw `PrismaClientKnownRequestError` code `P2002`; mock `resolveCustomerIdForPhone` (หรือ query ภายในที่มันเรียก) คืน `'c-raced'`
- **Steps:**
  1. เรียก `findOrCreateCustomer(tx, '0891112222')`
- **Expected Result:** คืน `'c-raced'` ไม่ throw ซ้ำ
- **Mutation proof:** เปลี่ยน re-find กลับไปเช็คแค่ `tx.customer.findUnique({phone})` (ของเดิมก่อนฟีเจอร์นี้) → เทสนี้ต้องแดง (ไม่เจอเพราะแถวที่ชนเป็นเบอร์รอง ไม่ใช่เบอร์หลัก)

#### TC-S-009: `findOrCreateCustomer` v2 — race P2002 ที่ re-find ไม่เจอจริง (race กับ transaction อื่นที่ rollback ไปแล้ว) → throw ต่อ

- **Linked to:** TFR-002 (fail-closed — ไม่เดา ไม่สร้างซ้ำ)
- **ประเภท:** service
- **Precondition:** เหมือน TC-S-008 แต่ re-find คืน `null`
- **Steps:**
  1. เรียก `findOrCreateCustomer(tx, '0891112222')`
- **Expected Result:** throw error เดิม (P2002) ต่อไป ไม่ swallow

---

### กลุ่ม D — Service: `customer-phone.service.ts::addSecondaryPhone`

#### TC-S-010: [blocker] ร้านที่เรียกไม่มี `Order` ร่วมกับ `customerId` ที่ระบุ (IDOR guard) → 404 `CustomerNotOwnedByShopError`

- **Linked to:** [[SRS]] §6 NFR Security, Must-not-miss (IDOR)
- **ประเภท:** service
- **Precondition:** mock `prisma.order.findFirst({customerId, shopId})` คืน `null`
- **Steps:**
  1. เรียก `addSecondaryPhone({shopId:'s1', customerId:'c-อื่นร้าน', phone:'0899999999', createdByUserId:'u1'})`
- **Expected Result:** throw `CustomerNotOwnedByShopError`
- **Mutation proof:** ลบ ownership guard ทิ้งทั้งบล็อก → เทสนี้ต้องแดง (seller ร้าน A ยิง `customerId` ของร้าน B เดามาสำเร็จ)

#### TC-S-011: เบอร์ยังไม่มีเจ้าของเลย → บันทึกสำเร็จ

- **Linked to:** FR-CM-001 AC3
- **ประเภท:** service
- **Precondition:** ownership guard ผ่าน; `tx.customer.findUnique`/`tx.customerPhone.findUnique` คืน `null` ทั้งคู่; `tx.customerPhone.create` สำเร็จ
- **Steps:**
  1. เรียก `addSecondaryPhone({shopId:'s1', customerId:'c1', phone:'0899999999', createdByUserId:'u1'})`
- **Expected Result:** คืน `{phone:'0899999999'}`; `tx.customerPhone.create` ถูกเรียกด้วย `{customerId:'c1', phone:'0899999999', createdByUserId:'u1', addedByShopId:'s1'}`

#### TC-S-012: [blocker] เบอร์เป็นของลูกค้าคนเดียวกัน (sameCustomer) → 409 `PhoneAlreadyLinkedError` sameCustomer:true

- **Linked to:** FR-CM-001 AC
- **ประเภท:** service
- **Precondition:** `tx.customer.findUnique` คืน `{id:'c1'}` (เท่ากับ `params.customerId`)
- **Steps:**
  1. เรียก `addSecondaryPhone({shopId:'s1', customerId:'c1', phone:'0812345678', createdByUserId:'u1'})`
- **Expected Result:** throw `PhoneAlreadyLinkedError` ที่ `sameCustomer===true`

#### TC-S-013: [blocker] เบอร์เป็นเบอร์หลักของลูกค้าอีกคนที่ร้านนี้เคยขายให้ (visible) → 409 พร้อม `ownerCustomerId`

- **Linked to:** Must-not-miss #3, BR-CM-02
- **ประเภท:** service
- **Precondition:** `tx.customer.findUnique` คืน `{id:'c2'}` (≠ `params.customerId`); `tx.order.findFirst({customerId:'c2', shopId:'s1'})` คืน แถวจริง (visible)
- **Steps:**
  1. เรียก `addSecondaryPhone({shopId:'s1', customerId:'c1', phone:'0899999999', createdByUserId:'u1'})`
- **Expected Result:** throw `PhoneAlreadyLinkedError` ที่ `sameCustomer:false, ownerVisibleToShop:true, ownerCustomerId:'c2'`

#### TC-S-014: [blocker] เบอร์เป็น**เบอร์รอง**ของลูกค้าอีกคน (ไม่ใช่เบอร์หลัก) — ที่ร้านนี้ไม่เคยเห็น → 409 ไม่คืน `ownerCustomerId`

- **Linked to:** Must-not-miss #3 (ครอบทั้งเบอร์หลักและเบอร์รองของแถวอื่น), BR-CM-23
- **ประเภท:** service
- **Precondition:** `tx.customer.findUnique` คืน `null`; `tx.customerPhone.findUnique` คืน `{customerId:'c3'}`; `tx.order.findFirst({customerId:'c3', shopId:'s1'})` คืน `null` (not visible)
- **Steps:**
  1. เรียก `addSecondaryPhone({shopId:'s1', customerId:'c1', phone:'0899999999', createdByUserId:'u1'})`
- **Expected Result:** throw `PhoneAlreadyLinkedError` ที่ `sameCustomer:false, ownerVisibleToShop:false, ownerCustomerId:null`
- **Mutation proof:** เปลี่ยนเงื่อนไข "หา owner" ให้เช็คแค่ `tx.customer.findUnique` (ตัด `tx.customerPhone.findUnique` ทิ้ง) → เทสนี้ต้องแดง (เบอร์รองของคนอื่นถูกปล่อยให้ผูกซ้ำสำเร็จ ขัด BR-CM-02)

#### TC-S-015: race — P2002 ตอน `tx.customerPhone.create` (แข่งกับ insert อื่น) → 409 กว้าง ไม่ throw ค้าง

- **Linked to:** TFR-003 Error/Edge cases
- **ประเภท:** service
- **Precondition:** เช็คก่อนหน้าผ่านหมด (ไม่มี owner); `tx.customerPhone.create` throw P2002
- **Steps:**
  1. เรียก `addSecondaryPhone(...)`
- **Expected Result:** throw `PhoneAlreadyLinkedError` ที่ `sameCustomer:false, ownerVisibleToShop:false, ownerCustomerId:null`

#### TC-S-016: [blocker] response ไม่มีเบอร์เต็มดิบหลุดออกไป — ต้อง mask ก่อนคืนที่ระดับ route (ดู TC-R-006)

- **Linked to:** [[API]] §4.1 Response — "ห้ามส่งเบอร์เต็มกลับ"
- **ประเภท:** service (unit บน masking helper ที่ route เรียก)
- **Precondition:** `maskPhone('0899999999')` (จาก `src/lib/phone-mask.ts` ที่มีอยู่แล้ว)
- **Steps:**
  1. เรียก `maskPhone('0899999999')`
- **Expected Result:** คืนรูปแบบ mask (`••••••9999` หรือรูปแบบเดียวกับที่ใช้ mask เบอร์หลักทั้งระบบ) — regression บนฟังก์ชันที่มีอยู่แล้ว ไม่ต้องเขียนใหม่ แค่ยืนยันว่า route เรียกมันจริง (verify ผ่าน TC-R-006)

---

### กลุ่ม E — Service: `customer-merge.service.ts::mergeCustomers`

#### TC-S-017: ownership guard — `customerIdA` ไม่มี `Order` ร่วมกับร้าน → 404

- **Linked to:** [[SRS]] TFR-006 ขั้น 0
- **ประเภท:** service
- **Precondition:** `prisma.order.findFirst({customerId:customerIdA, shopId})` คืน `null`
- **Steps:**
  1. เรียก `mergeCustomers({shopId:'s1', performedByUserId:'u1', customerIdA:'c1', customerIdB:'c2', requestedSurvivorId:'c1'})`
- **Expected Result:** throw `CustomerNotOwnedByShopError`; **ไม่มีการเปิด `$transaction` เลย** (ownership guard อยู่นอกทรานแซกชัน)

#### TC-S-018: ownership guard — `customerIdB` ไม่มี `Order` ร่วมกับร้าน → 404 (ฝั่งตรงข้าม TC-S-017)

- **ประเภท:** service
- **Expected Result:** เหมือน TC-S-017 แต่สลับฝั่ง — กัน asymmetric bug ที่เช็คแค่ `customerIdA`

#### TC-S-019: `customerIdA === customerIdB` → `CustomerMergeSameRowError`

- **Linked to:** [[SRS]] TFR-006 ขั้น check แรกสุด (ก่อน ownership guard ด้วยซ้ำ)
- **ประเภท:** service
- **Steps:**
  1. เรียก `mergeCustomers({..., customerIdA:'c1', customerIdB:'c1', requestedSurvivorId:'c1'})`
- **Expected Result:** throw `CustomerMergeSameRowError` **ก่อน**ที่จะยิง ownership guard query ใด ๆ

#### TC-S-020: [blocker] แถวใดแถวหนึ่งมี `mergedIntoId` แล้ว (stale client preview) → `CustomerMergeAlreadyMergedError`

- **Linked to:** Must-not-miss #2 — client เก็บ id ค้างจากก่อนมีคน merge ไปแล้ว
- **ประเภท:** service
- **Precondition:** ownership guard ผ่าน; `tx.$queryRaw` (`FOR UPDATE`) คืน `[{id:'c1',userId:null,mergedIntoId:'someoneElse',phone:'...',createdAt:...}, {id:'c2',userId:null,mergedIntoId:null,...}]`
- **Steps:**
  1. เรียก `mergeCustomers({..., customerIdA:'c1', customerIdB:'c2', requestedSurvivorId:'c2'})`
- **Expected Result:** throw `CustomerMergeAlreadyMergedError`; **ไม่มี `updateMany`/`create` ใด ๆ ถูกเรียกเลย**

#### TC-S-021: [blocker] `decideMerge` คืน `USERID_CONFLICT` → `CustomerMergeUserIdConflictError`

- **Linked to:** BR-CM-11, Must-not-miss #4
- **ประเภท:** service (mock `decideMerge` ให้คืนค่าตรง ๆ เพื่อแยกความรับผิดชอบจาก TC-U-004 ที่เทส pure function เอง — ที่นี่เทสว่า service map ผลของ `decideMerge` เป็น error class ที่ถูกต้อง)
- **Steps:**
  1. mock `decideMerge` คืน `{ok:false, reason:'USERID_CONFLICT'}`
  2. เรียก `mergeCustomers(...)`
- **Expected Result:** throw `CustomerMergeUserIdConflictError` (ไม่ใช่ error class อื่น)

#### TC-S-022: [blocker] `decideMerge` คืน `SURVIVOR_MISMATCH` → `CustomerMergeSurvivorMismatchError`

- **ประเภท:** service
- **Expected Result:** throw `CustomerMergeSurvivorMismatchError`

#### TC-S-023: [blocker] merge สำเร็จ — `Order.updateMany` ย้าย `customerId=merged.id` → `survivor.id` ครบ

- **Linked to:** FR-CM-006 AC1, BR-CM-13, Must-not-miss #7
- **ประเภท:** service
- **Precondition:** `decideMerge` คืน `{ok:true, survivorId:'c1', mergedId:'c2'}`
- **Steps:**
  1. เรียก `mergeCustomers({..., customerIdA:'c1', customerIdB:'c2', requestedSurvivorId:'c1'})`
- **Expected Result:** `tx.order.updateMany` ถูกเรียกด้วย `{where:{customerId:'c2'}, data:{customerId:'c1'}}` เป๊ะ (ไม่ใช่ทิศกลับ)

#### TC-S-024: [blocker] merge สำเร็จ — `ExternalContact.updateMany` ย้ายครบ

- **Linked to:** BR-CM-13, FR-CM-008 AC2
- **ประเภท:** service
- **Expected Result:** `tx.externalContact.updateMany` ถูกเรียกด้วย `{where:{customerId:'c2'}, data:{customerId:'c1'}}`

#### TC-S-025: [blocker] merge สำเร็จ — `CustomerPhone.updateMany` ย้ายเบอร์รองทั้งหมดของแถวที่ถูกรวมไปเป็นเบอร์รองของแถวหลัก

- **Linked to:** BR-CM-14 — "เบอร์ทั้งหมดของทั้งสองแถวกลายเป็นเบอร์ของแถวหลัก"
- **ประเภท:** service
- **Expected Result:** `tx.customerPhone.updateMany` ถูกเรียกด้วย `{where:{customerId:'c2'}, data:{customerId:'c1'}}`

#### TC-S-026: [blocker] chain-flatten — แถวอื่นที่เคย `mergedIntoId = merged.id` ถูกปรับให้ชี้ `survivor.id` ในทรานแซกชันเดียวกัน

- **Linked to:** Must-not-miss #2 ("รวมซ้อนหลายชั้น A→B แล้ว B→C"), DATABASE.md §3.1 chain-flatten invariant
- **ประเภท:** service
- **Steps:**
  1. เรียก `mergeCustomers({..., customerIdA:'c2'(=B), customerIdB:'c3'(=C), requestedSurvivorId:'c3'})` (สถานการณ์: B เป็น survivor ของการ merge เก่าที่ A เคยถูกรวมเข้ามาแล้ว)
- **Expected Result:** `tx.customer.updateMany` ถูกเรียกด้วย `{where:{mergedIntoId:'c2'}, data:{mergedIntoId:'c3'}}` (จับแถว A ที่เคยชี้ B ให้ชี้ C แทน) **ก่อน**ที่จะตั้ง `mergedIntoId` ของ B เอง
- **Mutation proof:** ลบขั้นตอน chain-flatten (`tx.customer.updateMany({where:{mergedIntoId:merged.id},...})`) ทิ้งทั้งบรรทัด → เทสนี้ต้องแดง (A จะค้างชี้ B ที่ตอนนี้ `mergedIntoId` ไปแล้ว → resolve ต้องเดิน 2 hop ซึ่งขัด invariant "ไม่เกิน 1 hop")

#### TC-S-027: [blocker] merge สำเร็จ — แถวที่ถูกรวมได้ `mergedIntoId`/`mergedAt` ตั้งค่าแล้ว (soft-pointer ไม่ลบแถว)

- **Linked to:** DB-4, FR-CM-006 AC5
- **ประเภท:** service
- **Expected Result:** `tx.customer.update` ถูกเรียกด้วย `{where:{id:'c2'}, data:{mergedIntoId:'c1', mergedAt: <Date>}}` — **ไม่มีการเรียก `tx.customer.delete`/`deleteMany` เลย**

#### TC-S-028: [blocker] `CustomerMergeLog` ถูกสร้างพร้อม `movedOrderIds`/`movedContactIds`/`movedPhones` ตรงกับสิ่งที่ถูกย้ายจริง (ไม่ใช่แค่ id คู่)

- **Linked to:** Must-not-miss #5 — "ถ้าเอา log ไปกางแล้วกู้ด้วยมือได้จริง"
- **ประเภท:** service
- **Precondition:** mock `tx.order.findMany({where:{customerId:'c2'}})` คืน `[{id:'o1'},{id:'o2'}]`; `tx.externalContact.findMany` คืน `[{id:'ec1'}]`; `tx.customerPhone.findMany` (ของ merged) คืน `[{phone:'0898888888'}]`
- **Steps:**
  1. เรียก `mergeCustomers(...)` จนสำเร็จ
- **Expected Result:** `tx.customerMergeLog.create` ถูกเรียกด้วย `data.movedOrderIds = ['o1','o2']`, `data.movedContactIds = ['ec1']`, `data.movedPhones = ['0898888888']` — **ตรงกับค่าที่อ่านมาจริง ไม่ใช่ mock ค่าอื่นที่ไม่เกี่ยวข้อง**
- **Mutation proof:** เปลี่ยนให้ `movedOrderIds` เก็บแค่ `[]` เสมอ (ลืม populate) → เทสนี้ต้องแดง — พิสูจน์ว่าถ้า field นี้ว่างเปล่า เทสจับได้ทันที (นี่คือฟิลด์ที่ทำให้ OD-2 irreversible ไม่ใช่การรับความเสี่ยงเปล่า ๆ)

#### TC-S-029: [blocker] snapshot (`survivorSnapshot`/`mergedSnapshot`) สะท้อนสถานะ**ก่อน**รวม (มีเบอร์รองของแต่ละฝั่งครบตามที่อ่านไว้ในขั้น 5 ของ SDS §4.2)

- **Linked to:** DB-5, [[DATABASE]] §3.3
- **ประเภท:** service
- **Steps:**
  1. mock `tx.customerPhone.findMany({customerId:survivor.id})` คืนเบอร์รอง 2 เบอร์ของ survivor (ก่อนรวม)
  2. เรียก `mergeCustomers(...)` จนสำเร็จ
- **Expected Result:** `data.survivorSnapshot.secondaryPhones` มีเบอร์รอง 2 เบอร์นั้นครบ (ไม่ใช่ query ซ้ำหลัง update ซึ่งจะได้เบอร์ที่เพิ่มเข้ามาจาก merged ปนด้วย — ต้องเป็นค่า **ก่อน** update เท่านั้น)

#### TC-S-030: [blocker] all-or-nothing — ทุกการเขียนอยู่ใน `prisma.$transaction(async (tx) => {...})` เดียว ไม่มี query ใดถูกเรียกผ่าน `prisma.` (top-level client) หลังขั้นตอน guard

- **Linked to:** Must-not-miss #6 — "จำลองความล้มเหลวกลางทางแล้วต้องไม่เหลือสถานะครึ่ง ๆ"
- **ประเภท:** service (structural — ตรวจว่า mock ของ `prisma.$transaction` ถูกเรียกครั้งเดียว และทุก write call อยู่บน `tx` ที่ callback ได้รับ ไม่ใช่ `prisma` ตรง ๆ)
- **Precondition:** mock `prisma.$transaction` ให้ track ว่าถูกเรียกกี่ครั้ง และ mock `tx` แยกจาก `prisma` object หลัก (คนละ reference) เพื่อจับกรณีโค้ดพลาดเขียน `prisma.order.updateMany` แทน `tx.order.updateMany`
- **Steps:**
  1. เรียก `mergeCustomers(...)` จนสำเร็จ
  2. ตรวจว่า `prisma.$transaction` ถูกเรียก **1 ครั้ง**
  3. ตรวจว่า `prisma.order.updateMany`/`prisma.externalContact.updateMany`/`prisma.customerPhone.updateMany`/`prisma.customer.update`/`prisma.customerMergeLog.create` (บน object `prisma` โดยตรง ไม่ใช่ `tx`) **ไม่ถูกเรียกเลยสักครั้ง**
- **Expected Result:** ผ่านตามข้อ 2-3 — ยืนยันว่าไม่มี write ใดหลุดออกไปนอกทรานแซกชัน (ซึ่งจะทำให้ all-or-nothing เพี้ยน)
- **Mutation proof:** ย้าย `tx.customerMergeLog.create` หนึ่งบรรทัดออกไปเรียกด้วย `prisma.customerMergeLog.create` แทน (จำลองบั๊กที่เขียนผิด client) → เทสนี้ต้องแดง

#### TC-S-031: [blocker] ทรานแซกชันล้มกลางทาง (เช่น `tx.customerMergeLog.create` throw) → error โยนออกไปทั้งก้อน ไม่มี partial return

- **Linked to:** Must-not-miss #6
- **ประเภท:** service
- **Precondition:** mock `tx.order.updateMany`/`tx.externalContact.updateMany`/`tx.customerPhone.updateMany`/`tx.customer.updateMany`/`tx.customer.update` สำเร็จหมด แต่ `tx.customerMergeLog.create` throw error (เช่น DB constraint จำลอง)
- **Steps:**
  1. เรียก `mergeCustomers(...)`
- **Expected Result:** `mergeCustomers` throw error เดิมออกไป (ไม่ถูก catch แล้ว swallow, ไม่คืน partial result `{survivorId,...}` แบบไม่มี `mergeLogId`)

#### TC-S-032: lock ordering — SQL string ที่ส่งเข้า `$queryRaw` มี `ORDER BY "id"` ก่อน `FOR UPDATE`

- **Linked to:** [[SDS]] TD-002 — กัน deadlock ABBA เมื่อ merge(A,B) กับ merge(B,A) พร้อมกัน
- **ประเภท:** service
- **Steps:**
  1. spy `tx.$queryRaw` แล้วเก็บ template string/SQL text ที่ถูกเรียก
  2. เรียก `mergeCustomers({..., customerIdA:'c1', customerIdB:'c2', ...})`
- **Expected Result:** SQL ที่เรียกมี `ORDER BY "id"` อยู่ก่อน `FOR UPDATE` (regex/substring check)

#### TC-S-033: `requestedSurvivorId` ไม่ใช่ 1 ใน 2 id ที่ส่งมา (ผ่าน service เต็ม ไม่ใช่แค่ pure function) → `CustomerMergeSurvivorMismatchError`

- **Linked to:** [[API]] — server ต้อง re-validate เสมอ (ทดสอบ integration ระหว่าง service กับ `decideMerge` จริง ไม่ mock)
- **ประเภท:** service (ใช้ `decideMerge` จริง ไม่ mock — integration ภายในไฟล์เดียวกัน)
- **Steps:**
  1. เรียก `mergeCustomers({..., customerIdA:'c1', customerIdB:'c2', requestedSurvivorId:'c-ปลอม'})`
- **Expected Result:** throw `CustomerMergeSurvivorMismatchError`

---

### กลุ่ม F — Service: จุด critical ที่มีอยู่แล้ว (TFR-007/008/009)

#### TC-S-034: [blocker] `resolveCustomerForEditedOrder` — เบอร์ใหม่เป็น**เบอร์รอง**ของลูกค้าอีกคน → `newPhoneTaken=true`

- **Linked to:** TFR-007 — "critical gap" ที่ [[SRS]] เตือนไว้ตรง ๆ ว่าถ้าไม่แก้แอดมิน rename เบอร์ไปชนเบอร์รองคนอื่นสำเร็จ
- **ประเภท:** service (⚠️ ต้อง export `resolveCustomerForEditedOrder` จาก `order.service.ts` ก่อนถึงจะเทสตรงได้ — ปัจจุบันเป็น `async function` ที่ไม่ export ดู Open Question ท้ายเอกสาร)
- **Precondition:** `resolveCustomerIdForPhone(tx, newPhone)` (mock) คืน `customerId` ที่ **ไม่ใช่** `current.id`
- **Steps:**
  1. เรียก `resolveCustomerForEditedOrder(tx, {...current, newPhone})`
- **Expected Result:** `newPhoneTaken === true` ถูกส่งต่อให้ `canRenameCustomerPhone`
- **Mutation proof:** เปลี่ยนกลับไปเช็คแค่ `tx.customer.findUnique({phone:newPhone})` (ของเดิม) → เทสนี้ต้องแดง (เบอร์รองไม่ถูกตรวจ)

#### TC-S-035: `resolveCustomerForEditedOrder` — เบอร์ใหม่ไม่มีเจ้าของเลย → `newPhoneTaken=false`

- **ประเภท:** service
- **Precondition:** `resolveCustomerIdForPhone` คืน `null`
- **Expected Result:** `newPhoneTaken === false`

#### TC-S-036: `resolveCustomerForEditedOrder` — เบอร์ใหม่ resolve กลับมาเป็น `current.id` เอง (เช่น เบอร์รองของลูกค้าคนเดียวกัน) → `newPhoneTaken=false`

- **Linked to:** Must-not-miss #8 — แยกเคส "เพิ่มเบอร์ที่สอง" ออกจาก "คีย์เบอร์ผิด"
- **ประเภท:** service
- **Precondition:** `resolveCustomerIdForPhone` คืนค่าเท่ากับ `current.id`
- **Expected Result:** `newPhoneTaken === false` (ไม่ block — เบอร์นี้เป็นของลูกค้าคนเดียวกันอยู่แล้ว ไม่ใช่ conflict)

#### TC-S-037: [regression] `canRenameCustomerPhone` — ทุก branch เดิมยังทำงานเหมือนเดิมเมื่อ `newPhoneTaken` มาจาก TFR-007 (ไม่ใช่แค่จาก `Customer.phone` เหมือนก่อนหน้า)

- **Linked to:** Must-not-miss #8, [[SRS]] §7.1 "pure function ไม่ต้องแก้"
- **ประเภท:** unit (regression — รันชุดเทสเดิมที่ `src/lib/customer-phone-edit.test.ts` ซ้ำ ไม่แก้ไฟล์)
- **Steps:**
  1. รัน `npx vitest run src/lib/customer-phone-edit.test.ts` (ไม่แก้ไฟล์นี้เลยในฟีเจอร์ 00042)
- **Expected Result:** ทุกเคสเดิมยังเขียว — ยืนยันว่าฟังก์ชันนี้ไม่ได้รับผลกระทบจาก schema/logic ใหม่ (ตามที่ SRS อ้าง)

#### TC-S-038: [blocker] scenario "แก้เบอร์ผิด" (rename) ยังทำงานแยกจาก merge — เบอร์เดิมไม่มีเจ้าของจริง (0 order/contact อื่น, ไม่มี `userId`), เบอร์ใหม่ไม่มีใครถือ → rename สำเร็จในแถวเดิม ไม่มีการสร้าง `CustomerPhone`/`CustomerMergeLog`

- **Linked to:** Must-not-miss #8 — "ผู้ใช้กดคนละปุ่ม แต่ระบบต้องไม่สับสนกันเอง" (ฝั่ง "คีย์ผิด")
- **ประเภท:** service (integration `resolveCustomerForEditedOrder` + `canRenameCustomerPhone`)
- **Steps:**
  1. เรียก path เดิมของการแก้เบอร์บนออเดอร์ (ผ่าน `updateOrder`) ด้วยเงื่อนไข typo-fix ล้วน ๆ
- **Expected Result:** `Customer.phone` ของแถวเดิมถูก rename (id เดิม); `tx.customerPhone.create`/`tx.customerMergeLog.create` **ไม่ถูกเรียกเลย**

#### TC-S-039: [blocker] scenario "เพิ่มเบอร์ที่สอง" ไม่แตะ `Order.customerId` เลย — `addSecondaryPhone` ต้องไม่เรียก `order.update`/`order.updateMany` ใด ๆ

- **Linked to:** Must-not-miss #8 — "ผู้ใช้กดคนละปุ่ม แต่ระบบต้องไม่สับสนกันเอง" (ฝั่ง "เพิ่มเบอร์")
- **ประเภท:** service
- **Steps:**
  1. เรียก `addSecondaryPhone(...)` จนสำเร็จ (เคสเดียวกับ TC-S-011)
  2. ตรวจว่า mock ของ `tx.order.update`/`tx.order.updateMany` ไม่ถูกเรียกเลย
- **Expected Result:** ไม่มีการเรียก order update ใด ๆ — พิสูจน์ว่าปุ่ม "เพิ่มเบอร์" ไม่ทำให้ประวัติออเดอร์เปลี่ยนเจ้าของโดยไม่ตั้งใจ (ต่างจาก merge ที่ต้องย้าย)

#### TC-S-040: [blocker] `customers/lookup/route.ts` — ค้นด้วยเบอร์ที่เป็นเบอร์หลักของแถวที่ถูกรวมไปแล้ว → resolve `mergedIntoId` ก่อนเรียก `getCancellationSummary`

- **Linked to:** TFR-008, FR-CM-008 AC3, BR-LODG-38/39
- **ประเภท:** service (route handler, mock prisma)
- **Precondition:** `prisma.customer.findUnique({phone})` คืน `{id:'c-old', mergedIntoId:'c-survivor'}`; mock `getCancellationSummary` เพื่อ spy argument ที่ถูกส่งเข้าไป
- **Steps:**
  1. เรียก `GET` handler ด้วย `?phone=<เบอร์เก่า>`
- **Expected Result:** `getCancellationSummary` ถูกเรียกด้วย `'c-survivor'` (ไม่ใช่ `'c-old'`); `order.findFirst` (สำหรับหาชื่อ) ก็ต้องใช้ `'c-survivor'` เช่นกัน
- **Mutation proof:** ใช้ `customer.id` ตรง ๆ แทน `customer.mergedIntoId ?? customer.id` → เทสนี้ต้องแดง (ค้นเบอร์เก่าแล้วได้ประวัติยกเลิก 0 เสมอ ทั้งที่ประวัติจริงย้ายไป survivor แล้ว)

#### TC-S-041: [regression] `customers/lookup/route.ts` — ค้นด้วยเบอร์ที่ไม่เคยถูกรวม → พฤติกรรมเหมือนเดิมทุกประการ

- **ประเภท:** service
- **Precondition:** `prisma.customer.findUnique({phone})` คืน `{id:'c1', mergedIntoId:null}`
- **Expected Result:** `getCancellationSummary('c1')` ถูกเรียก — เหมือนก่อนมีฟีเจอร์นี้

#### TC-S-042: [blocker] `linkBuyerHistory` — สมัครสมาชิกด้วยเบอร์ที่เป็น**เบอร์รอง**ของลูกค้าที่มีออเดอร์เก่าอยู่แล้วภายใต้เบอร์หลัก → ออเดอร์เก่าทุกใบถูก `buyerUserId` set (ไม่ใช่แค่ใบที่ `buyerContact` ตรงกับเบอร์ที่สมัคร)

- **Linked to:** FR-CM-008 AC4, Must-not-miss #7 ("linkBuyerHistory ตอนผู้ซื้อ login")
- **ประเภท:** service
- **Precondition:** `resolveCustomerIdForPhone(prisma, phone)` (mock) คืน `'c1'`; ลูกค้า `c1` มีออเดอร์เก่า 3 ใบ ที่ `buyerContact` เป็นเบอร์หลักคนละเบอร์กับที่สมัคร (แต่ทุกใบ `customerId='c1'`)
- **Steps:**
  1. เรียก `linkBuyerHistory('u-new', '<เบอร์รอง>', undefined)`
- **Expected Result:** `prisma.order.updateMany` ถูกเรียกด้วย `where` ที่มี `{customerId:'c1'}` รวมอยู่ใน `OR` — ครอบคลุมทั้ง 3 ใบแม้ `buyerContact` จะไม่ตรงกับเบอร์ที่สมัครเป๊ะ ๆ
- **Mutation proof:** ตัด `{customerId}` ออกจาก `orderConditions` (เหลือแค่ string-match เดิม) → เทสนี้ต้องแดง (ออเดอร์เก่าที่สั่งด้วยเบอร์อื่นในชุดเดียวกันไม่ถูกผูก)

#### TC-S-043: `linkBuyerHistory` — `resolveCustomerIdForPhone` คืน `null` (เบอร์ที่สมัครไม่เคยมีออเดอร์เลย) → ถอยไป string-match เดิม ไม่ throw

- **Linked to:** TFR-009 Error/Edge cases — best-effort ไม่บล็อก signup
- **ประเภท:** service
- **Expected Result:** ไม่ throw; `orderConditions` เหลือแค่ conditions เดิม (string-match)

#### TC-S-044: [regression] `linkBuyerHistory` — `Review.updateMany` ยังใช้ string-match เดิมล้วน ๆ ไม่ผสม `customerId` (ตามขอบเขตที่ TFR-009 ระบุไว้ชัด — `Review` ไม่มีคอลัมน์ `customerId`)

- **Linked to:** Must-not-miss #8 (ของที่เพิ่ง ship ต้องไม่พัง — ในที่นี้คือ "ของที่ตั้งใจไม่แตะ" ต้องพิสูจน์ว่าไม่ถูกแตะโดยไม่ตั้งใจ)
- **ประเภท:** service
- **Steps:**
  1. เรียก `linkBuyerHistory('u-new', '0812345678', undefined)`
  2. ตรวจ argument ที่ `prisma.review.updateMany` ถูกเรียกด้วย
- **Expected Result:** `where` ของ `review.updateMany` ไม่มี `customerId` ปรากฏอยู่เลย (ยัง `reviewerContact` string-match ล้วน)

---

### กลุ่ม G — DB-level: trigger/constraint (real local Postgres)

> **Precondition ร่วมของกลุ่มนี้:** migration `20260810120000_customer_multiphone_merge` ต้อง apply กับ local Docker
> Postgres (`localhost:5434`) ก่อนรัน (`DATABASE_URL`/`DIRECT_URL` ปักหมุด localhost ตรง ๆ ตาม Hard Rule 14 —
> ห้ามใช้ `.env.local`). ทุกเทสในกลุ่มนี้ต้องลบข้อมูลที่ตัวเองสร้างใน `afterEach` โดย scope ด้วย id ของตัวเอง
> (`customerMergeLog`→`customerPhone`→`externalContact`/`order`→`customer`→`shop`→`user`, ลูกก่อนแม่) — **ห้ามเรียก
> `deleteMany()` แบบไม่มี `where` เด็ดขาด** (Hard Rule 13)

#### TC-D-001: [blocker] trigger `customer_phone_cross_table_unique` — INSERT `CustomerPhone.phone` ที่ซ้ำกับ `Customer.phone` ของแถวอื่น (แม้ผ่านด่าน app-level check-then-insert ไม่ทัน เช่นยิงตรงด้วย SQL ทดสอบ) → Postgres ปฏิเสธด้วย exception code `23505`

- **Linked to:** BR-CM-02, [[DATABASE]] §5.1 ข้อ 4 (REQUIRED — ด่านสุดท้าย)
- **ประเภท:** DB-level
- **Precondition:** สร้าง `Customer` จริง 1 แถว (`phone='0811111111'`) ผ่าน `prisma.customer.create` (เก็บ id ไว้ล้างทีหลัง)
- **Steps:**
  1. `INSERT INTO "CustomerPhone" (id, "customerId", phone) VALUES (...)` ด้วยค่า `phone='0811111111'` (ตรงกับ `Customer.phone` ของแถวข้างต้น) ผ่าน `prisma.$executeRaw`
- **Expected Result:** query ล้มด้วย error ที่มี message ขึ้นต้น `CUSTOMER_PHONE_ALREADY_PRIMARY`

#### TC-D-002: [blocker] trigger `customer_phone_cross_table_unique` — UPDATE `Customer.phone` ให้ตรงกับ `CustomerPhone.phone` ของลูกค้าคนอื่น → ปฏิเสธ

- **Linked to:** BR-CM-02 (ทิศตรงข้าม TC-D-001)
- **ประเภท:** DB-level
- **Precondition:** สร้าง `Customer` A + `CustomerPhone` ของลูกค้า B (`phone='0822222222'`)
- **Steps:**
  1. `UPDATE "Customer" SET phone='0822222222' WHERE id=<A.id>`
- **Expected Result:** ล้มด้วย error `CUSTOMER_PHONE_ALREADY_SECONDARY`

#### TC-D-003: `CustomerPhone.phone` UNIQUE — เพิ่มเบอร์รองซ้ำกันของลูกค้า 2 คน (ผ่าน DB ตรง ไม่ผ่าน service) → P2002

- **Linked to:** [[DATABASE]] §3.2
- **ประเภท:** DB-level
- **Steps:**
  1. สร้าง `CustomerPhone` แถวแรก (`phone='0833333333'`) ของลูกค้า A
  2. พยายามสร้าง `CustomerPhone` แถวที่สอง (`phone='0833333333'`) ของลูกค้า B
- **Expected Result:** แถวที่สองล้มด้วย unique violation (P2002)

#### TC-D-004: [blocker] `CustomerMergeLog.mergedCustomerId` UNIQUE — พยายามสร้าง log แถวที่สองสำหรับ `mergedCustomerId` เดียวกัน → ล้ม

- **Linked to:** [[DATABASE]] §3.3 — "1 แถวรวมได้ครั้งเดียวตลอดกาล" (DB-level backstop ของ app logic ที่เช็ค `mergedIntoId` ก่อน merge)
- **ประเภท:** DB-level
- **Steps:**
  1. สร้าง `CustomerMergeLog` แถวแรกด้วย `mergedCustomerId=<X>`
  2. พยายามสร้าง `CustomerMergeLog` แถวที่สองด้วย `mergedCustomerId=<X>` เดิม (survivor คนละคนก็ตาม)
- **Expected Result:** แถวที่สองล้มด้วย unique violation

#### TC-D-005: trigger `customer_merge_userid_guard` (ถ้า implement ตาม [[DATABASE]] §5.1 ข้อ 5 — RECOMMENDED) — UPDATE `mergedIntoId` ให้ survivor มี `userId` ต่างจาก merged → ปฏิเสธด้วย `23514`

- **Linked to:** BR-CM-11 (defense-in-depth ชั้นที่สอง — [[SRS]] §10 Open Question #2 ยังไม่เคาะว่าจะเก็บ trigger นี้ไว้หรือไม่)
- **ประเภท:** DB-level — **เงื่อนไข: รันเฉพาะถ้า dev ตัดสินใจคง trigger นี้ไว้** (ถ้าตัดออกตาม Open Question #2 ให้ลบเคสนี้ออกจากชุดรัน ไม่ใช่ปล่อยให้แดงค้าง)
- **Steps:**
  1. สร้าง `Customer` survivor (`userId='u-A'`) และ `Customer` merged (`userId='u-B'`, ต่างกัน)
  2. `UPDATE "Customer" SET "mergedIntoId"=<survivor.id> WHERE id=<merged.id>` ตรง ๆ ผ่าน `$executeRaw` (ข้าม service layer โดยตั้งใจ เพื่อพิสูจน์ว่า DB กันได้เองแม้ service มีบั๊ก)
- **Expected Result:** ล้มด้วย error `CUSTOMER_MERGE_USERID_CONFLICT`

#### TC-D-006: `Customer.mergedIntoId` FK — `ON DELETE SET NULL` (regression บน schema self-reference)

- **Linked to:** [[DATABASE]] §3.1 — เหตุผลที่เลือก `SetNull` ไม่ใช่ `Restrict`
- **ประเภท:** DB-level
- **Precondition:** สร้าง survivor + merged (`merged.mergedIntoId = survivor.id`)
- **Steps:**
  1. ลบแถว survivor ทิ้ง (`prisma.customer.delete`, สถานการณ์สมมติแม้ในทางปฏิบัติแทบไม่เกิด)
  2. อ่านแถว merged ใหม่
- **Expected Result:** `merged.mergedIntoId === null` (ไม่ throw FK violation, ไม่ cascade ลบ merged ไปด้วย)

---

### กลุ่ม D2 — DB-level: end-to-end integration (real transaction, ไม่ mock)

#### TC-D-007: [blocker] merge เต็มรูปแบบกับฐานจริง — Order/ExternalContact/CustomerPhone ย้ายครบ, แถวเดิมยังอยู่พร้อม `mergedIntoId`

- **Linked to:** Must-not-miss #1/#6/#7 พร้อมกัน — พิสูจน์ atomicity จริง (ไม่ใช่แค่โครงสร้างโค้ดแบบ TC-S-030)
- **ประเภท:** DB-level (integration, เรียก `mergeCustomers()` จริงกับ Postgres local)
- **Precondition:** seed จริง: `Shop`(s1) + `User`(u1, owner) → `Customer` A (มี `Order` 2 ใบกับ s1) + `Customer` B (มี `Order` 1 ใบกับ s1, `CustomerPhone` 1 แถว, `ExternalContact` 1 แถว)
- **Steps:**
  1. เรียก `mergeCustomers({shopId:'s1', performedByUserId:'u1', customerIdA:A.id, customerIdB:B.id, requestedSurvivorId:A.id})` จริง
  2. query DB ตรง ๆ หลังจบ
- **Expected Result:** `Order` ทั้ง 3 ใบมี `customerId=A.id`; `ExternalContact` มี `customerId=A.id`; `CustomerPhone` เดิมของ B มี `customerId=A.id`; แถว B ยังมีอยู่จริง (`select` เจอ) พร้อม `mergedIntoId=A.id`, `mergedAt` ไม่ null; `CustomerMergeLog` 1 แถวใหม่ที่ `movedOrderIds` มี id ของใบที่เดิมเป็นของ B (1 ใบ) เท่านั้น (ไม่รวมใบเดิมของ A)

#### TC-D-008: [blocker] dedupe เต็มรูปแบบกับฐานจริง — เพิ่มเบอร์รองแล้วสร้างออเดอร์ใหม่ด้วยเบอร์นั้น → ได้ `customerId` เดิม

- **Linked to:** Must-not-miss #1, ครอบคลุมทั้ง trigger + resolve algorithm พร้อมกันในสถานการณ์จริง
- **ประเภท:** DB-level
- **Precondition:** seed `Customer` A (`phone='0811111111'`) จริง
- **Steps:**
  1. เรียก `addSecondaryPhone({shopId:'s1', customerId:A.id, phone:'0899999999', createdByUserId:'u1'})` จริง
  2. เปิด `prisma.$transaction(tx => findOrCreateCustomer(tx, '0899999999'))` จริง
- **Expected Result:** ค่าที่คืนจากขั้นตอนที่ 2 เท่ากับ `A.id` เป๊ะ — ไม่มีแถว `Customer` ใหม่ถูกสร้างขึ้น (นับจำนวนแถว `Customer` ที่มี `phone` หรือ `CustomerPhone.phone` เกี่ยวข้องกับเบอร์ชุดนี้ ต้องเท่าเดิม)

#### TC-D-009: [blocker] chain-merge เต็มรูปแบบกับฐานจริง — merge(A,B) แล้ว merge(B,C) → `A.mergedIntoId` ลงเอยที่ `C.id` โดยตรง (ไม่ใช่ `B.id`)

- **Linked to:** Must-not-miss #2 — "รวมซ้อนหลายชั้น (A→B แล้ว B→C)" พิสูจน์ด้วย 2 การเรียกจริงติดกัน
- **ประเภท:** DB-level
- **Precondition:** seed `Customer` A, B, C ที่แต่ละคนมี `Order` กับ `s1` อย่างน้อย 1 ใบ
- **Steps:**
  1. เรียก `mergeCustomers({..., customerIdA:A.id, customerIdB:B.id, requestedSurvivorId:B.id})` จริง (A ถูกรวมเข้า B)
  2. เรียก `mergeCustomers({..., customerIdA:B.id, customerIdB:C.id, requestedSurvivorId:C.id})` จริง (B ถูกรวมเข้า C)
  3. query `Customer` A ตรง ๆ
- **Expected Result:** `A.mergedIntoId === C.id` (ไม่ใช่ `B.id`) — `resolveCustomerIdForPhone`/`findOrCreateCustomer` เดินตามได้ใน 1 hop เสมอตาม invariant

#### TC-D-010: [blocker] transaction rollback จริง — จำลองความล้มเหลวกลางทาง (เช่น ยิง `mergeCustomers` ซ้ำด้วยคู่เดิมพร้อมกัน 2 ครั้งแบบ concurrent เพื่อชนกับ unique constraint ของ `CustomerMergeLog.mergedCustomerId`) → ไม่มีสถานะครึ่ง ๆ กลาง ๆ

- **Linked to:** Must-not-miss #6 — พิสูจน์ atomicity ด้วย Postgres จริง ไม่ใช่แค่ mock structure
- **ประเภท:** DB-level
- **Precondition:** seed A, B ที่มี Order กับ s1
- **Steps:**
  1. ยิง `Promise.allSettled([mergeCustomers({...A,B,survivor:A}), mergeCustomers({...A,B,survivor:A})])` (2 คำขอพร้อมกันด้วยคู่เดียวกันเป๊ะ)
  2. query DB หลังทั้งคู่ resolve
- **Expected Result:** มีคำขอเดียวที่สำเร็จ (อีกคำขอ throw `CustomerMergeAlreadyMergedError` เพราะโดน `FOR UPDATE` บล็อกจนอีกฝั่ง commit ก่อนแล้วเจอ `mergedIntoId` ไม่ null); `Order` ทุกใบของ B ต้องมี `customerId=A.id` **ครบ 100%** ไม่มีใบไหนตกหล่นหรือถูกย้าย 2 รอบ; `CustomerMergeLog` มีแถวเดียวสำหรับคู่นี้ (ไม่ใช่ 2 แถว)

#### TC-D-011: `customers/lookup` route กับฐานจริง — ค้นเบอร์เก่าของแถวที่ถูกรวมแล้ว ได้ยอดยกเลิกรวมถูกต้อง

- **Linked to:** FR-CM-008 AC3
- **ประเภท:** DB-level
- **Precondition:** seed A มี `Order` ที่ `status='CANCELLED'`, `cancelReason` เข้าเงื่อนไข guest-fault 2 ใบ; merge B เข้า A (B ไม่มีใบยกเลิก); ทำ merge จริงแล้วค้นด้วยเบอร์เดิมของ B
- **Steps:**
  1. เรียก `GET` handler จริงด้วย `?phone=<เบอร์เดิมของ B>`
- **Expected Result:** `cancellationSummary.total === 2` (นับจาก A ที่เป็น survivor ถูกต้อง แม้ค้นด้วยเบอร์ของ B)

#### TC-D-012: `linkBuyerHistory` กับฐานจริง — สมัครด้วยเบอร์รอง ผูกออเดอร์เก่าทุกใบในกลุ่มให้ `buyerUserId`

- **Linked to:** FR-CM-008 AC4
- **ประเภท:** DB-level
- **Precondition:** seed `Customer` A (`phone` หลัก) มี `Order` 2 ใบ (`buyerContact` = เบอร์หลัก, `buyerUserId=null`); เพิ่มเบอร์รองให้ A จริงผ่าน `addSecondaryPhone`
- **Steps:**
  1. เรียก `linkBuyerHistory('u-new', '<เบอร์รอง>', undefined)` จริง
  2. query `Order` ทั้ง 2 ใบ
- **Expected Result:** ทั้ง 2 ใบมี `buyerUserId='u-new'` แม้ `buyerContact` ของทั้งคู่จะเป็นเบอร์หลัก ไม่ใช่เบอร์รองที่สมัคร

#### TC-D-013: [blocker] race condition จริง — `mergeCustomers` กับ `findOrCreateCustomer` (สร้างออเดอร์ใหม่ด้วยเบอร์ของแถวที่กำลังถูกรวม) ยิงพร้อมกัน → ไม่มี state ที่ผิด (ไม่มี Order ใดชี้ไปแถวที่ `mergedIntoId != null`)

- **Linked to:** [[PRD]] §6.2 ความเสี่ยงทางเทคนิค #2 ("ออเดอร์ใหม่อาจถูกสร้างชี้ไปแถวที่กำลังจะถูกรวมทิ้งพอดี"), [[SDS]] §4.2 (`FOR UPDATE`/`FOR SHARE` คู่ล็อก)
- **ประเภท:** DB-level (race — รันซ้ำหลายรอบเพื่อลดโอกาส false-negative จาก timing)
- **Precondition:** seed A, B ที่มี Order กับ s1; B มี `phone='0877777777'`
- **Steps:**
  1. ยิง `Promise.all([ mergeCustomers({...A,B,survivor:A}), prisma.$transaction(tx => findOrCreateCustomer(tx, '0877777777')) ])` พร้อมกัน
  2. query `Order` ใหม่ที่ถูกสร้างจากขั้นตอน 2 (ถ้ามีการสร้างออเดอร์จริงในเทสนี้ ต้อง seed order creation ด้วย ไม่ใช่แค่เรียก `findOrCreateCustomer` เฉย ๆ — ปรับ setup ให้ครอบ `order.create` ในทรานแซกชันเดียวกับ `findOrCreateCustomer` เพื่อจำลอง `createOrder` จริง)
  3. ตรวจว่า `Order` ใหม่ที่สร้าง มี `customerId` ที่ query แล้วพบว่า `mergedIntoId IS NULL` เสมอ (resolve ไปที่แถวที่ยังใช้งานได้จริง ไม่ว่าจะเป็น A หรือ B ก็ตามแต่ timing)
- **Expected Result:** ไม่มีกรณีที่ Order ใหม่ชี้ไปยัง `customerId` ที่ตอนหลังกลายเป็นแถวที่ถูกรวม (orphan reference เชิงความหมาย) — รันซ้ำ ≥20 รอบไม่พบ state ผิดสักครั้ง

---

### กลุ่ม R — Route: `POST .../[customerId]/phones` (mock service + guard)

#### TC-R-001: ไม่มี session → 401 `unauthorized`

- **Linked to:** [[API]] §2, §5
- **ประเภท:** route (mock `requireShopMember` คืน error 401)
- **Expected Result:** status 401, body `{error:'unauthorized'}`

#### TC-R-002: มี session แต่ resolve active shop ไม่ได้ → 403 `FORBIDDEN`

- **ประเภท:** route
- **Expected Result:** status 403, body `{error:'FORBIDDEN'}`

#### TC-R-003: body ไม่ผ่าน `AddCustomerPhoneSchema` (เบอร์ผิดรูปแบบ) → 400 `VALIDATION_ERROR`

- **Linked to:** [[API]] §4.1
- **ประเภท:** route
- **Steps:**
  1. POST `{phone:'12345'}`
- **Expected Result:** status 400, body `{error:'VALIDATION_ERROR'}`; **`addSecondaryPhone` ต้องไม่ถูกเรียกเลย** (validate ก่อน service เสมอ)

#### TC-R-004: [blocker] route catch `CustomerNotOwnedByShopError` → 404 `CUSTOMER_NOT_OWNED_BY_SHOP`

- **Linked to:** [[SRS]] §4.5 error-mapping — reviewer grep gate
- **ประเภท:** route
- **Precondition:** mock `addSecondaryPhone` throw `CustomerNotOwnedByShopError`
- **Expected Result:** status 404, body `{error:'CUSTOMER_NOT_OWNED_BY_SHOP'}`

#### TC-R-005: [blocker] route catch `PhoneAlreadyLinkedError` → 409 `PHONE_ALREADY_LINKED` พร้อม `sameCustomer`/`ownerVisibleToShop`/`ownerCustomerId`

- **ประเภท:** route
- **Precondition:** mock throw `PhoneAlreadyLinkedError('...', false, true, 'c2')`
- **Expected Result:** status 409, body `{error:'PHONE_ALREADY_LINKED', sameCustomer:false, ownerVisibleToShop:true, ownerCustomerId:'c2'}`

#### TC-R-006: [blocker] สำเร็จ → 201 พร้อม `phone` ที่ mask แล้ว (ไม่ใช่ raw)

- **Linked to:** [[API]] §4.1 Response — PII
- **ประเภท:** route
- **Precondition:** mock `addSecondaryPhone` คืน `{phone:'0899999999'}` (raw)
- **Steps:**
  1. POST `{phone:'089-999-9999'}` สำเร็จ
- **Expected Result:** status 201, body `{phone:'••••••9999', customerId:...}` — **route ต้อง mask ก่อนคืน ไม่ใช่ echo raw จาก service ตรง ๆ**
- **Mutation proof:** เอา `maskPhone()` ออกจาก route (คืน `data.phone` ดิบ) → เทสนี้ต้องแดง (PII หลุด)

#### TC-R-007: route ที่ไม่รู้จัก error class (`Prisma.PrismaClientKnownRequestError` อื่น/error ทั่วไป) → 500 `INTERNAL_ERROR` + `console.error` ถูกเรียก

- **ประเภท:** route
- **Expected Result:** status 500, `console.error` ถูกเรียก 1 ครั้งอย่างน้อย (ไม่ log เบอร์โทรดิบ — เช็คว่า argument ไม่มี raw phone อยู่)

#### TC-R-008: response header — `cache-control: private, no-store` ทุก response (สำเร็จและ error)

- **Linked to:** `docs/conventions/feedback_auth_api_cache_control`
- **ประเภท:** route
- **Expected Result:** header `Cache-Control` ตรงตามค่าที่ `jsonNoStore()` ตั้ง ทั้งเคส 201/400/404/409/500

---

### กลุ่ม R2 — Route: `POST .../merge`

#### TC-R-009: ไม่มี session → 401

- **ประเภท:** route
- **Expected Result:** เหมือน TC-R-001

#### TC-R-010: body ขาดฟิลด์ (`survivorCustomerId` หาย) → 400 `VALIDATION_ERROR`

- **ประเภท:** route
- **Expected Result:** status 400; `mergeCustomers` ไม่ถูกเรียก

#### TC-R-011: [blocker] catch `CustomerMergeSameRowError` → 400 `CUSTOMER_MERGE_SAME_ROW`

- **ประเภท:** route
- **Expected Result:** status 400, `{error:'CUSTOMER_MERGE_SAME_ROW'}`

#### TC-R-012: [blocker] catch `CustomerNotOwnedByShopError` → 404 `CUSTOMER_NOT_OWNED_BY_SHOP`

- **ประเภท:** route
- **Expected Result:** status 404

#### TC-R-013: [blocker] catch `CustomerMergeAlreadyMergedError` → 409 `CUSTOMER_MERGE_ALREADY_MERGED`

- **ประเภท:** route
- **Expected Result:** status 409, `{error:'CUSTOMER_MERGE_ALREADY_MERGED'}`

#### TC-R-014: [blocker] catch `CustomerMergeUserIdConflictError` → 409 `CUSTOMER_MERGE_USERID_CONFLICT`

- **Linked to:** BR-CM-11 — เคสที่อันตรายที่สุดของทั้งฟีเจอร์ ต้องมี route test แยกจาก service/unit test เพื่อพิสูจน์ HTTP contract จริง
- **ประเภท:** route
- **Expected Result:** status 409, `{error:'CUSTOMER_MERGE_USERID_CONFLICT'}`

#### TC-R-015: [blocker] catch `CustomerMergeSurvivorMismatchError` → 400 `CUSTOMER_MERGE_SURVIVOR_MISMATCH`

- **ประเภท:** route
- **Expected Result:** status 400

#### TC-R-016: [blocker] สำเร็จ → 200 พร้อม `survivorCustomerId`/`mergedCustomerId`/`mergeLogId`

- **ประเภท:** route
- **Expected Result:** body ตรงตาม [[API]] §4.2 Response schema เป๊ะ (ชื่อ field ตรงตัว — กัน drift จาก `{survivorId,mergedId,mergeLogId}` ที่ service คืนภายใน vs `{survivorCustomerId,mergedCustomerId,mergeLogId}` ที่ API ประกาศ — **ต้องมี mapping ที่ route ถ้าชื่อไม่ตรงกัน**)

#### TC-R-017: [blocker] reviewer grep gate — `rg "instanceof (CustomerNotOwnedByShopError|PhoneAlreadyLinkedError|CustomerMerge\w+Error)"` ในทั้ง 2 route file ต้องเจอครบทุก error class ที่ [[API]] §5 ระบุว่า route นั้นต้อง catch

- **Linked to:** [[API]] §5 (Gate สำหรับ reviewer) — ป้องกันคลาส 00003 P2 (`OutOfStockError` ตกหล่นจน route คืน 500)
- **ประเภท:** static/grep (เขียนเป็น vitest ที่อ่านซอร์สจริงด้วย `fs.readFileSync` แล้ว `expect(source).toMatch(...)` ต่อ error class ที่คาดหวัง — ตาม pattern `upload-no-multipart-callers.test.ts` ที่มีอยู่แล้วในโปรเจกต์)
- **Steps:**
  1. อ่าน `src/app/api/shops/current/customers/[customerId]/phones/route.ts` → ต้องมี `instanceof CustomerNotOwnedByShopError` และ `instanceof PhoneAlreadyLinkedError`
  2. อ่าน `src/app/api/shops/current/customers/merge/route.ts` → ต้องมี `instanceof CustomerNotOwnedByShopError`, `CustomerMergeSameRowError`, `CustomerMergeAlreadyMergedError`, `CustomerMergeUserIdConflictError`, `CustomerMergeSurvivorMismatchError`
- **Expected Result:** เจอครบทุกตัว — เทสนี้ต้องรันเป็นส่วนหนึ่งของ CI/`npm test` ปกติ (ไม่ใช่ manual grep ครั้งเดียว) เพื่อกันการลบ catch block ทิ้งในอนาคตโดยไม่มีใครรู้

#### TC-R-018: guard function ที่ใช้จริงคือ `requireShopMember()` ไม่ใช่ `requireLodgingShop()`/`requireGeneralShop()` (regression บนความเข้าใจผิดที่ [[SRS]] §4.1 เขียนกำกับสั้นเกินไป — [[API]]/[[SDS]] แก้ให้ตรงแล้ว)

- **Linked to:** [[API]] §2 — "ปรับจาก SRS ให้ตรงกับโค้ดจริง"
- **ประเภท:** route (static — grep import ในไฟล์ route ทั้ง 2)
- **Expected Result:** ทั้ง 2 route file import `requireShopMember` จาก `@/lib/shop-api-guard` — **ไม่มี** `requireLodgingShop`/`requireGeneralShop` ปรากฏในไฟล์เหล่านี้เลย (endpoint ต้องใช้ได้ทุก `Shop.vertical`)

---

### กลุ่ม Q — Browser QA (manual, `http://seller.deepth.local:4000`)

#### TC-Q-001: happy path — เพิ่มเบอร์รองจากหน้า `/customers`

- **Linked to:** FR-CM-001
- **ประเภท:** browser QA
- **Precondition:** login เป็น seller ที่มีลูกค้าอย่างน้อย 1 คนในหน้า `/customers`
- **Steps:**
  1. เปิด `/customers`, กด "เพิ่มเบอร์" ที่แถวลูกค้า
  2. กรอกเบอร์ใหม่ที่ไม่เคยมีใครใช้ กดยืนยัน
- **Expected Result:** toast สำเร็จ (`pacesToast`), เบอร์ใหม่ (mask แล้ว) ปรากฏใต้แถวลูกค้าโดยไม่ต้อง refresh หน้า

#### TC-Q-002: happy path — เพิ่มเบอร์รองจากแผงลูกค้าในห้องแชท (`CustomerPanel.tsx`)

- **ประเภท:** browser QA
- **Steps:**
  1. เปิดห้องแชทที่ผูกกับลูกค้าที่มี `Customer` กลางแล้ว
  2. กด "เพิ่มเบอร์" ในแผงลูกค้า กรอกเบอร์ใหม่ กดยืนยัน
- **Expected Result:** เบอร์ใหม่โผล่ในแผงลูกค้าทันที (optimistic UI ตาม TFR-004)

#### TC-Q-003: reject — เพิ่มเบอร์ที่เป็นเบอร์หลักของลูกค้าคนอื่นที่ร้านนี้เคยขายให้

- **Linked to:** BR-CM-03
- **ประเภท:** browser QA
- **Expected Result:** ข้อความปฏิเสธชัดเจน ชี้ทางไปหน้า "รวมลูกค้า" (ไม่มี emoji ตาม HR12), ไม่มีการเขียนอะไรลง DB

#### TC-Q-004: reject — เพิ่มเบอร์ที่เป็นเบอร์รองของลูกค้าคนอื่นที่ร้านนี้ไม่เคยเห็น

- **ประเภท:** browser QA
- **Expected Result:** ข้อความปฏิเสธ **ไม่เปิดเผยว่าเป็นของใคร** (ไม่มี customerId/ชื่อลูกค้าอื่นโผล่ในข้อความ)

#### TC-Q-005: เลือกแถวใน `/customers` — checkbox จำกัดที่ 2 แถว, disable แถวอื่นเมื่อเลือกครบ

- **Linked to:** [[SDS]] TD-003
- **ประเภท:** browser QA
- **Steps:**
  1. เลือก 2 แถวที่มี `customerId` (ไม่ null)
  2. ลองเลือกแถวที่ 3
- **Expected Result:** checkbox แถวที่ 3 (และแถวอื่นทั้งหมด) เป็น disabled จนกว่าจะยกเลิกการเลือกแถวใดแถวหนึ่งก่อน; แถวที่ `customerId === null` (guest ที่ไม่เคยผูก) เป็น disabled ตั้งแต่แรกพร้อม tooltip

#### TC-Q-006: เปิด modal เปรียบเทียบ — เห็นข้อมูลครบตาม BR-CM-10 ทั้งสองฝั่ง

- **Linked to:** FR-CM-004, TFR-005
- **ประเภท:** browser QA
- **Expected Result:** เห็นชื่อ/เบอร์ทั้งหมด (mask)/จำนวนออเดอร์ร้านตัวเอง/ยอดซื้อร้านตัวเอง/วันที่เป็นลูกค้ามา — ของทั้ง 2 แถว ไม่มี id ดิบของฐานข้อมูลโผล่บนจอ (BRD §6.5)

#### TC-Q-007: [blocker] merge — ทั้งสองแถวมี `userId` ต่างกัน → บล็อกทันทีที่ client ไม่ยิง POST เลย

- **Linked to:** BR-CM-11, TFR-005 ข้อ 3
- **ประเภท:** browser QA (ยืนยันด้วย DevTools Network tab)
- **Steps:**
  1. เลือก 2 แถวที่เป็นบัญชีสมาชิกคนละคน (ทั้งคู่ `hasLinkedAccount=true`)
  2. เปิด Network tab ของ Chrome DevTools ก่อนเปิด modal
- **Expected Result:** banner บล็อกแสดงทันที ("ทั้งสองเบอร์เป็นบัญชีสมาชิกที่ยืนยันตัวตนแล้วคนละคน ไม่สามารถรวมได้"); **ไม่มี request ไปที่ `POST .../merge` เลย** ใน Network tab

#### TC-Q-008: merge — ฝั่งเดียวมี `userId` → radio ถูกล็อกไว้ที่แถวนั้น กดสลับไม่ได้

- **Linked to:** BR-CM-12, TFR-005 ข้อ 4
- **ประเภท:** browser QA
- **Expected Result:** radio ของแถวที่มี `userId` ถูก pre-select และ disabled/ไม่ตอบสนองเมื่อพยายามกดแถวตรงข้าม

#### TC-Q-009: happy path — merge สำเร็จ (ทั้งสองแถวไม่มี `userId`, เลือกแถวหลักเอง)

- **Linked to:** FR-CM-006
- **ประเภท:** browser QA
- **Steps:**
  1. เลือก 2 แถว guest, เปิด modal, เลือกแถวหลัก, อ่านคำเตือนผลกระทบข้ามร้าน, กดยืนยัน
- **Expected Result:** toast สำเร็จ, modal ปิด, กลับไปหน้า `/customers` เห็นลูกค้าคนนี้เหลือ **1 แถว** ยอดซื้อ/จำนวนออเดอร์รวมกัน

#### TC-Q-010: คำเตือนผลกระทบข้ามร้าน (BR-CM-20) แสดงถาวรในหน้าจอ ไม่ใช่ dismiss ครั้งเดียวหาย

- **ประเภท:** browser QA
- **Steps:**
  1. เปิด modal เปรียบเทียบ เลื่อนดู/คลิกที่อื่นในหน้าจอ
- **Expected Result:** คำเตือนยังอยู่บนจอตลอดเวลาที่ modal เปิด ไม่มีปุ่ม "ปิด" คำเตือนแยกต่างหาก

#### TC-Q-011: หลัง merge — แผงลูกค้าในห้องแชทของเธรดที่ผูกกับเบอร์ที่ถูกรวม เห็นประวัติออเดอร์รวมแล้ว

- **Linked to:** FR-CM-008 AC2
- **ประเภท:** browser QA
- **Steps:**
  1. เปิดห้องแชทที่ผูกกับเบอร์ของแถวที่ถูก merge เข้าไป (แถว "merged" ไม่ใช่ "survivor")
- **Expected Result:** แผงลูกค้าแสดงสถิติ/รายการออเดอร์ที่รวมทั้งสองแถวแล้ว (ไม่ใช่แค่ของเธรดนี้เธรดเดียว)

#### TC-Q-012: หลัง merge — สร้างออเดอร์ใหม่ด้วยเบอร์ที่เคยเป็นเบอร์หลักของแถวที่ถูกรวม → ได้ลูกค้าเดิม (survivor) ทันที

- **Linked to:** FR-CM-003
- **ประเภท:** browser QA
- **Steps:**
  1. สร้างออเดอร์ใหม่ (ผ่านฟอร์มสร้างออเดอร์ของ seller) ด้วยเบอร์เดิมของแถวที่ถูก merge
- **Expected Result:** ชื่อ/ประวัติที่แสดงตอนกรอกฟอร์ม (ถ้ามี autofill/lookup) หรือหลังบันทึก ตรงกับลูกค้า survivor ไม่ใช่สร้างลูกค้าใหม่

#### TC-Q-013: mobile viewport — modal เปรียบเทียบ/ฟอร์มเพิ่มเบอร์ render ถูกต้อง (44px tap target, ไม่ overflow, ไม่ scroll หลุด)

- **Linked to:** `docs/conventions/overlay-scroll-lock.md`, HR7
- **ประเภท:** browser QA (ใช้ Chrome DevTools MCP mobile viewport)
- **Expected Result:** ปุ่มทุกปุ่ม ≥44px, พื้นหลังไม่เลื่อนตามเมื่อลากในโมดัล (scroll-lock ทำงาน), ไม่มี arbitrary Tailwind value (HR7 grep gate ผ่าน)

#### TC-Q-014: console clean ตลอด flow (เพิ่มเบอร์ + merge เต็ม flow)

- **ประเภท:** browser QA (`list_console_messages`)
- **Expected Result:** ไม่มี error/warning ใหม่ที่เกี่ยวกับฟีเจอร์นี้ปรากฏใน console

#### TC-Q-015: no-emoji gate ผ่านบน UI ทั้งหมดของฟีเจอร์นี้ (ปุ่ม/ข้อความ error/toast/banner)

- **Linked to:** HR12
- **ประเภท:** browser QA + grep (`grep -rnP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]'` บนไฟล์ UI ที่แตะ)
- **Expected Result:** 0 emoji

#### TC-Q-016: Base: comment — ทุกไฟล์ UI ใหม่ (`MergeCustomersModal.tsx`/`AddPhoneModal.tsx`) มี Base: ชี้ theme file ที่ copy มา (Hard Rule 3)

- **ประเภท:** browser QA + grep (ตรวจ commit message/comment header)
- **Expected Result:** เจอ `Base:` ระบุไฟล์ theme ที่ copy โครงมา (Paces `.modal`/`.card` ตาม `docs/system/ui-guideline/paces-component-reference.md`)

---

### กลุ่ม M — Edge cases เพิ่มเติม

#### TC-M-001: เพิ่มเบอร์ที่ตรงกับเบอร์หลักของลูกค้าคนเดียวกันเป๊ะ (noop ที่ดูเหมือน conflict)

- **Linked to:** FR-CM-001 AC (sameCustomer)
- **ประเภท:** service
- **Expected Result:** `Customer.findUnique({phone})` เจอแถวตัวเอง (`ownerCustomerId === params.customerId`) → `sameCustomer:true` (เหมือน TC-S-012 แต่ผ่านเบอร์**หลัก** ไม่ใช่เบอร์รอง — พิสูจน์ว่า guard เช็คทั้ง `Customer` และ `CustomerPhone`)

#### TC-M-002: `normalizePhone`/Valibot ปฏิเสธเบอร์ที่ไม่ใช่รูปแบบไทย (ไม่ขึ้นต้น 0, ไม่ครบ 10 หลัก, มีตัวอักษร)

- **Linked to:** BR-CM-01
- **ประเภท:** route (Valibot schema test)
- **Steps:**
  1. ทดสอบ `AddCustomerPhoneSchema` ด้วยค่า `'123'`, `'0812345'`, `'08123456789'`, `'081234567a'`, `'+66812345678'`
- **Expected Result:** ทุกค่าล้มการ validate

#### TC-M-003: `MergeCustomersSchema` — string ว่างเปล่า (`''`) สำหรับ id ใด ๆ → ล้ม

- **ประเภท:** route
- **Expected Result:** validate ล้มด้วย `minLength(1)`

#### TC-M-004: `customerId` ที่ระบุใน path param ของ `/phones` เป็น id ที่ไม่มีอยู่จริงในระบบเลย (ไม่ใช่แค่ไม่ใช่ของร้านนี้)

- **Linked to:** ownership guard ต้องครอบทั้ง "ไม่มีอยู่จริง" และ "มีอยู่แต่ไม่ใช่ของร้านนี้" ด้วย query เดียว (`Order.findFirst`)
- **ประเภท:** service
- **Expected Result:** `CustomerNotOwnedByShopError` เหมือนกันทั้งสองกรณี (ไม่ leak ว่า id มีอยู่จริงหรือไม่ — ป้องกัน enumeration)

#### TC-M-005: [blocker] `ownerCustomerId` ที่ `PhoneAlreadyLinkedError` คืนกลับมา ต้องไม่ใช่ PII อื่นปนมา (เฉพาะ opaque id เท่านั้น — ไม่มีชื่อ/เบอร์ของเจ้าของเดิม)

- **Linked to:** [[SRS]] §8 ความเสี่ยงเชิงสถาปัตยกรรม แถว 3, BR-CM-23
- **ประเภท:** route
- **Steps:**
  1. ตรวจ response body ของ TC-R-005 ทั้งก้อน
- **Expected Result:** body มีแค่ `error`/`sameCustomer`/`ownerVisibleToShop`/`ownerCustomerId` — ไม่มี field อื่นที่เป็นชื่อ/เบอร์/ที่อยู่ของเจ้าของเดิม

---

## 3. Traceability Matrix

| AC / FR / BR (BRD) | Test Case | ครอบคลุมหรือไม่ |
|---|---|---|
| FR-CM-001 (เพิ่มเบอร์) | TC-U-014..017, TC-S-010..016, TC-S-039, TC-R-001..008, TC-Q-001..004, TC-M-001..002, TC-M-004 | Yes |
| FR-CM-002 (มองเห็นเบอร์ทั้งหมด) | TC-S-016 (masking), TC-Q-001, TC-Q-002 | Yes |
| FR-CM-003 (dedupe ด้วยเบอร์ใดก็ได้) | TC-S-001..009, TC-D-008, TC-Q-012 | Yes |
| FR-CM-004 (เปรียบเทียบก่อนรวม) | TC-U-001..013, TC-S-017..019, TC-Q-005, TC-Q-006 | Yes |
| FR-CM-005 (บล็อกการรวมที่เสี่ยง) | TC-U-004..009, TC-S-020..022, TC-R-011..015, TC-D-005, TC-Q-007..008 | Yes |
| FR-CM-006 (ยืนยันแล้วรวมทันที) | TC-S-023..031, TC-D-007, TC-D-010, TC-Q-009 | Yes |
| FR-CM-007 (บันทึกร่องรอย) | TC-S-028..029, TC-D-004, TC-D-007 | Yes |
| FR-CM-008 AC1 (`/customers` เหลือ 1 แถว) | TC-D-007, TC-Q-009 | Yes |
| FR-CM-008 AC2 (แผงลูกค้าในแชท) | TC-S-024, TC-D-007, TC-Q-011 | Yes |
| FR-CM-008 AC3 (`getCancellationSummary`) | TC-S-040..041, TC-D-011 | Yes |
| FR-CM-008 AC4 (`linkBuyerHistory`) | TC-S-042..044, TC-D-012 | Yes |
| FR-CM-008 AC5 (`ai-context.service.ts`) | (auto-correct ตาม TFR-010 — ไม่มีเทสอัตโนมัติแยก, ดู Open Question ท้ายเอกสาร) | **No — ดู Open Question** |
| BR-CM-01 (validate รูปแบบเบอร์) | TC-M-002 | Yes |
| BR-CM-02 (1 เบอร์ = 1 ลูกค้าเสมอ) | TC-D-001..003, TC-S-013..014 | Yes |
| BR-CM-03 (ปฏิเสธ+ชี้ทางไปรวม) | TC-S-013..014, TC-Q-003..004 | Yes |
| BR-CM-04 (เบอร์แรกเป็นเบอร์หลักเสมอ) | (schema-level — ไม่มี UI สลับใน MVP, ยืนยันโดย TC-D-007 ที่ survivor คงเบอร์หลักเดิม) | Yes |
| BR-CM-05 (ทุกเบอร์ dedupe เท่ากัน) | TC-S-001..009, TC-D-008 | Yes |
| BR-CM-10 (ต้องผ่านหน้าเปรียบเทียบ) | TC-Q-006, TC-Q-007 (ยิง POST ตรงไม่ผ่าน UI ก็ยัง blocked ที่ server — TC-S-021) | Yes |
| BR-CM-11 (ห้ามรวมข้าม userId) | TC-U-004, TC-S-021, TC-R-014, TC-D-005, TC-Q-007 | Yes |
| BR-CM-12 (แถวที่มี userId เป็นหลักเสมอ) | TC-U-006..009, TC-S-022, TC-R-015, TC-Q-008 | Yes |
| BR-CM-13 (ย้าย FK ทั้งหมด all-or-nothing) | TC-S-023..026, TC-S-030..031, TC-D-007, TC-D-010 | Yes |
| BR-CM-14 (เบอร์ทั้งหมดกลายเป็นของแถวหลัก) | TC-S-025, TC-D-007 | Yes |
| BR-CM-15 (audit log ถาวร) | TC-S-028..029, TC-D-004 | Yes |
| BR-CM-16 (ไม่กระทบ Trust Score/Badge) | (out of scope ตาม PRD — ยืนยันด้วยการไม่มีเทสแตะ trust-score.service.ts เลย, ไม่ใช่ negative test) | N/A |
| BR-CM-20/21/22 (ผลกระทบข้ามร้าน) | TC-D-011, TC-Q-010 | Yes |
| BR-CM-23 (ห้ามเปิดเผยเกินเดิม) | TC-U-017, TC-S-014, TC-M-005, TC-Q-004 | Yes |
| BR-CM-30 (ไม่ auto-merge) | (negative-by-absence — ไม่มี endpoint/cron ที่ trigger merge อัตโนมัติ, ยืนยันด้วย code review ไม่ใช่เทส) | N/A |
| BR-CM-40/41 (สัมพันธ์กับกลไกเดิม, ไม่มี role gate เพิ่ม) | TC-S-034..039, TC-R-018 | Yes |
| Must-not-miss #1 (dedupe ข้ามเบอร์รอง) | TC-S-005, TC-D-008 | Yes |
| Must-not-miss #2 (chain-merge หลายชั้น) | TC-S-002, TC-S-006, TC-S-026, TC-D-009 | Yes |
| Must-not-miss #3 (trigger กันเบอร์ซ้ำ 2 ตาราง) | TC-D-001..002, TC-S-013..014 | Yes |
| Must-not-miss #4 (ห้ามรวมข้าม userId ทั้งคู่) | TC-U-004, TC-S-021, TC-D-005 | Yes |
| Must-not-miss #5 (`CustomerMergeLog` กู้มือได้จริง) | TC-S-028 | Yes |
| Must-not-miss #6 (ทรานแซกชันเดียว all-or-nothing) | TC-S-030..031, TC-D-010 | Yes |
| Must-not-miss #7 (ผลปรากฏครบทุก surface) | TC-S-040..044, TC-D-007, TC-D-011..012, TC-Q-009, TC-Q-011 | Yes |
| Must-not-miss #8 (แยก "แก้เบอร์ผิด" vs "เพิ่มเบอร์ที่สอง") | TC-S-034..039, TC-M-001 | Yes |

> ทุก FR/BR ใน [[BRD]] ปรากฏในตารางนี้ — 2 แถวที่ทำเครื่องหมาย **N/A** (BR-CM-16/BR-CM-30) เป็น "negative by
> absence" (ยืนยันด้วยการไม่มีจุดใดในโค้ดแตะสิ่งที่ห้ามแตะ ตรวจผ่าน code review/grep ไม่ใช่ automated test ที่ยืนยันเชิงบวกได้)
> ส่วน **FR-CM-008 AC5 ยังไม่มีเทสอัตโนมัติ** — ดู Open Question ท้ายเอกสาร

---

## 4. Flow (ถ้ามี)

```mermaid
flowchart TD
    Start([เริ่มเทส 00042]) --> A[กลุ่ม A/B: unit — decideMerge/decidePhoneConflict]
    A --> C[กลุ่ม C: resolve algorithm — resolveCustomerIdForPhone/findOrCreateCustomer v2]
    C --> D{ทุก unit เขียว?}
    D -- ไม่ --> Fix1[แก้ pure function ก่อน — ห้ามไปต่อ]
    Fix1 --> A
    D -- ใช่ --> E[กลุ่ม D/E: service — addSecondaryPhone/mergeCustomers mock prisma]
    E --> F{[blocker] ทุกตัวเขียว + mutation-proof ผ่าน?}
    F -- ไม่ --> Fix2[ห้าม merge PR — แก้ service]
    Fix2 --> E
    F -- ใช่ --> G[กลุ่ม F: จุด critical เดิม — resolveCustomerForEditedOrder/lookup/linkBuyerHistory]
    G --> H[กลุ่ม G/D2: DB-level กับ local Postgres จริง — trigger + end-to-end + race]
    H --> I{DB-level ทุกตัวเขียว?}
    I -- ไม่ --> Fix3[แก้ migration/service — ห้าม apply prod]
    Fix3 --> H
    I -- ใช่ --> J[กลุ่ม R/R2: route error-mapping ครบตาราง]
    J --> K[กลุ่ม Q: Browser QA บน seller.deepth.local]
    K --> L{ทุกอย่างผ่าน?}
    L -- ใช่ --> M([MERGE พร้อม deploy ตาม TD-005 — schema ก่อน โค้ดทีหลัง])
    L -- ไม่ --> N([REWORK — กลับไปกลุ่มที่ล้ม])
```

---

## 5. ผลล่าสุด

| Run | วันที่ | ผล (Pass/Fail/Blocked) | ผู้ทดสอบ (Tester) |
|-----|--------|--------------------------|---------------------|
| — | — | **ยังไม่เคยรัน** — เอกสารนี้เขียนก่อนมีโค้ด (pre-implementation, Doc-First HR11) | — |

> อัปเดตตารางนี้ทุกครั้งที่รันชุดทดสอบจริงหลัง `safepay-developer` implement เสร็จ — ระบุ TC ที่ fail เป็นรายตัว
> ห้ามสรุปว่า "ผ่าน" ถ้ามี `[blocker]` ตัวใดตัวหนึ่งยังแดงอยู่

---

## 6. สรุป (Summary)

เอกสาร Test Case นี้กำหนด **ชุดเคสทดสอบ 113 เคส** ของ **ลูกค้าหลายเบอร์และการรวมลูกค้า (00042)** แบ่งเป็น
unit 17 เคส (กลุ่ม A/B), service 44 เคส (กลุ่ม C/D/E/F), DB-level 13 เคส (กลุ่ม G/D2), route 18 เคส (กลุ่ม R/R2),
browser QA 16 เคส (กลุ่ม Q), edge case 5 เคส (กลุ่ม M) — trace กลับ Acceptance Criteria ใน [[BRD]] ทุกข้อ (§3)
รวมถึง 8 "เคสที่ห้ามตกหล่น" ที่ระบุไว้ในคำสั่งงานนี้โดยตรง **56 เคสถูกทำเครื่องหมาย `[blocker]`** พร้อม mutation
proof (แก้ตรรกะให้ผิดแล้วต้องแดง) — ตรงตามบทเรียนของโปรเจกต์ว่าเทสที่เขียวโดยไม่เคยพิสูจน์ว่าจับอะไรได้ = ไม่มีค่า

**จุดที่หนักที่สุดของชุดนี้ (สมกับความเสี่ยงของฟีเจอร์):** กลุ่ม E (`mergeCustomers`, 17 เคส) และกลุ่ม D2
(end-to-end integration กับ Postgres จริง, 7 เคส) เพราะการรวมย้อนกลับไม่ได้ด้วยตัวผู้ขายเอง (OD-2) — ถ้า
`[blocker]` กลุ่มนี้ตัวใดตัวหนึ่งพลาด ผลคือข้อมูลของลูกค้า 2 คนปนกันถาวรในระดับที่กู้คืนยาก

**Open Questions (เอกสารต้นน้ำยังไม่พอให้เขียนเทสได้ครบ — ถามกลับ ไม่เดาเอง):**

1. **`order.service.ts::resolveCustomerForEditedOrder` เป็น `async function` ที่ไม่ได้ `export`** (verified: `src/services/order.service.ts:173`) — กลุ่ม TC-S-034..036 ต้องการเทสตรงฟังก์ชันนี้ตามที่ [[SRS]] TFR-007 ระบุ แต่ปัจจุบันเรียกได้ผ่าน `updateOrder` (exported) เท่านั้น **ต้องถาม `safepay-developer`/`safepay-planner` ว่าจะ export ฟังก์ชันนี้เพื่อให้เทสตรง (แบบเดียวกับ `canRenameCustomerPhone`/`shouldRelinkThreadCustomer` ที่แยกเป็น pure function ต่างหากแล้ว) หรือให้ QA เทสผ่าน `updateOrder` แบบ integration เท่านั้น** — เลือกทางไหนกระทบว่ากลุ่ม F ทั้งกลุ่มจะเป็น "service ตรง" หรือ "service integration ผ่าน caller"

2. **`FR-CM-008 AC5` (`ai-context.service.ts::buildCustomerBlock` เห็นประวัติรวมหลัง merge) ไม่มีเทสอัตโนมัติในเอกสารนี้** — [[SRS]] TFR-010 อ้างว่า "auto-correct" (ไม่ต้องแก้โค้ด) เพราะฟังก์ชันนี้ query ผ่าน `ExternalContact.customerId`/`Customer.userId` ที่ merge sync ให้แล้ว แต่ **ไม่มีเอกสารไหนให้ signature/ที่ตั้งของ `buildCustomerBlock` มากพอให้เขียนเทสตรง ๆ ได้** (ไม่มีใน [[SDS]] Component Design §3, ไม่มีใน [[SRS]] §9 นอกจากชื่อไฟล์) — **ถาม `safepay-planner`/`safepay-developer`: ต้องการให้ QA เขียนเทสแยกยืนยัน AC5 โดยตรง (ต้องมี signature ของ `buildCustomerBlock` ก่อน) หรือยอมรับว่า TC-D-007 (end-to-end merge ที่ `ExternalContact.customerId` ย้ายถูกต้อง) เพียงพอเป็นหลักฐานทางอ้อมแล้ว** เพราะ AC5 ไม่มี route/UI ให้ทดสอบทางอ้อมผ่าน browser QA ได้เลย (เป็นบริบทภายในของ AI ที่ไม่แสดงผลตรง ๆ บนจอ)

3. **`tests/setup.ts::deleteTestData()` ไม่รองรับ `Customer`/`CustomerPhone`/`CustomerMergeLog`** (ดู §1 ของเอกสารนี้) — เอกสารนี้แก้ปัญหาด้วยการให้แต่ละ DB-level test (กลุ่ม G/D2) ลบข้อมูลของตัวเองแบบ scoped ในไฟล์เทสนั้นโดยตรง ไม่แตะ `deleteTestData` **แต่ควรถาม Controller ว่าต้องการให้ขยาย `deleteTestData({customerIds, mergeLogIds})` เป็นส่วนกลางแทนหรือไม่** (ประหยัดโค้ดซ้ำถ้าฟีเจอร์ในอนาคตต้อง seed `Customer` บ่อยขึ้นเรื่อย ๆ) — ไม่ใช่ blocker ของการเขียนเทสตอนนี้ แค่เป็นทางเลือกเชิง maintainability

4. **`[[DATABASE]] §5.1 ข้อ 5` (trigger `customer_merge_userid_guard`) ยังเป็น RECOMMENDED ไม่ใช่ MANDATORY** ([[SRS]] §10 Open Question #2 ระบุว่า "ต้องเคาะก่อน implementation phase") — TC-D-005 เขียนไว้เป็นเงื่อนไข ("รันเฉพาะถ้า dev ตัดสินใจคง trigger นี้ไว้") แต่ **ยังไม่มีมติสุดท้าย** ว่าจะเก็บ trigger นี้หรือไม่ — ถ้าตัดออก ต้องลบ TC-D-005 ออกจากชุดรันจริง (ไม่ใช่ปล่อยให้ error "ไม่มี trigger นี้" ค้างเป็น false failure)

CHECKLIST/TestCase นี้ไม่ทดแทน `docs/qa/customer-multi-phone-merge-qa-checklist.md` (ยังไม่สร้าง เพราะยังไม่มี UI ให้ browser
QA รอบแรกจับต้องได้จริง) — เมื่อ `safepay-ux` ออก Design Spec ของ `MergeCustomersModal.tsx`/`AddPhoneModal.tsx`
แล้ว ให้สร้าง QA checklist คู่กันตาม mandatory rule ของ `safepay-qa` agent (ต้นแบบ `docs/qa/seller-auth-qa-checklist.md`)
