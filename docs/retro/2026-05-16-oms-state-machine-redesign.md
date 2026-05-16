# OMS State-Machine Redesign Retrospective (2026-05-16)

> Feature: `CREATED/CONFIRMED/SHIPPED/COMPLETED/CANCELLED` → `PENDING/SHIPPED/CONFIRMED/CANCELLED`
> (terminal = CONFIRMED, ไม่มี COMPLETED) + `Order.fulfillmentMode` (SHIPPED|NO_SHIPPING)
> + `Order.cancelInitiator` (seller|buyer|null).
> Spec: `docs/superpowers/specs/2026-05-16-oms-state-machine-redesign-design.md`
> Plan: `docs/superpowers/plans/2026-05-16-oms-state-machine-redesign.md` (10 tasks)
> Workflow: subagent-driven (implementer → spec review → quality review) + agent-team gate.

---

## Problems + Root causes + Evidence

### P1. Cutover พบ stale `fulfillmentMode` บน Supabase dev (ไม่ใช่ migration bug)
หลัง `migrate deploy` + `prisma generate` AFTER-verify เจอ Order.fulfillmentMode = SHIPPED ทั้ง 14 แถว; Product SERVICE 4 แถว = SHIPPED.
**Root cause:** seed.ts แก้ให้ SERVICE=NO_SHIPPING ตั้งแต่ Task 8b แต่ DB เดิมไม่เคย re-seed → existing Product rows ติด column default `SHIPPED`; migration backfill derive order จาก product ที่ผิดอยู่แล้ว.
**Evidence:** targeted patch (user-approved) re-derive Product 13 rows จาก `type` + re-derive Order จาก item-rule → Product PHYSICAL/SHIPPED 8 + SERVICE/NO_SHIPPING 5, Order NO_SHIPPING 3 (SERVICE-only) / SHIPPED 11, **status counts ไม่ขยับ** (PENDING 6/CONFIRMED 4/SHIPPED 3/CANCELLED 1). Status-remap เอง verified perfect แยกจาก fulfillmentMode.

### P2. Task 7/8 reader-inventory ไม่ครอบ `tests/**` → Vitest พังหลัง cutover
Empirical Vitest หลัง cutover: 11/106 fail (`badge.test.ts` ใช้ `COMPLETED`/`CREATED`; `trust-score.test.ts:54` latent COMPLETED ผ่านโดยบังเอิญ; ZERO_COMPLAINT test ไม่ตั้ง `cancelInitiator`).
**Root cause:** reader-inventory ของ status/contract change ครอบ `src/` + `seed.ts` แต่ไม่รวม `tests/**` fixtures. stale literal ใน test = false-green / false-red ที่ tsc จับไม่ได้ (status เป็น String ไม่ใช่ enum).
**Evidence:** commit `09d57bb`; `order-state-machine.test.ts:196-197` จงใจ assert `VALID_TRANSITIONS["CREATED"|"COMPLETED"]=undefined` → ต้องแยกแยะ "stale" กับ "intentional negative" ก่อนแก้.

### P3. (CRITICAL) seller IDOR/PII — redirect/notFound-after-fetch รั่วใน Next 16 RSC
Logged-in seller เปิด URL ของ order/product ร้านอื่นได้ — foreign object (รวม `buyerContact`) ถูก serialize เข้า RSC flight data (`self.__next_f.push`) ส่งกลับ **HTTP 200** ก่อน redirect throw. systemic 3 pages.
**Root cause:** page-level guard `const x = await fetchById(id); if (x.shopId !== me) redirect()/notFound()` ไม่กัน leak — Next.js 16 App Router serialize fetched data เข้า flight payload รอบ ๆ redirect; redirect กลายเป็น soft client meta-refresh (200) ไม่ใช่ server 307. Ownership check **หลัง** fetch สายเกินไป.
**Evidence:** programmatic NextAuth login (seller shop `9226d13a`) → `curl /seller/orders/030afdc8…` (shop `7cbd6565`) → body 105KB มี `"buyerContact":"0823456789","shopId":"7cbd6565…"`. Fix commit `8d9485b` (DAL: `findFirst({where:{publicToken|id, shopId}})` → null สำหรับ non-owner → `notFound()`); safepay-security PASS, re-curl leak count = 0, positive control own-order = 200.

### P4. Subagent security claim ต้อง Controller verify เชิงประจักษ์ก่อนเชื่อ/ปฏิเสธ
QA รายงาน "RSC leaks + 6 pages systemic". Code-path reading (redirect ที่ line 55 อยู่ก่อน JSX return) ชี้ว่า "ปลอดภัย" — ผิด. แต่ "6 systemic" ก็ over-broad — จริง 3 (fetch-by-foreign-identifier); `products/new`,`new-v2`,`shop` fetch แค่ shop ของตัวเอง ไม่ vuln.
**Root cause:** ทั้ง theory (code path) และ subagent assertion เชื่อตรง ๆ ไม่ได้ — ต้อง reproduce จริง. Controller ทำ programmatic login + curl + grep flight payload จึงได้ ground truth (ยืนยัน CRITICAL จริง + ตัด scope 6→3).
**Evidence:** grep "try/catch+redirect" = 6 ไฟล์ แต่วิเคราะห์ fetch shape จริง = 3 vulnerable; security re-verify ยืนยัน 3.

### P5. (minor / out-of-scope tracked findings)
- foreign `notFound()` ใน Turbopack dev = HTTP 500 (ไม่มี `not-found.tsx` ใน seller segment) — cosmetic, prod = default 404; leak ปิดแล้ว.
- pre-existing: `GET /api/orders/[token]/route.ts` ไม่มี auth → ใครรู้ token เห็น full order JSON รวม `buyerContact` (Medium, ไม่ได้เกิดจาก feature นี้).
- pre-existing: `/api/orders/[token]/complete` route ยัง live (TODO Task 7 ลบก่อน prod, LOW).

---

## Conventions to adopt

### C1. Ownership/authz enforce ที่ query layer (DAL) — ห้าม guard หลัง fetch
ดู `docs/conventions/security-conventions.md` §"DAL ownership — Next RSC". กฎ: resource-by-identifier ที่ scope ด้วยเจ้าของ → `findFirst({ where: { <id>, <ownerKey> } })` คืน null ให้ non-owner แล้ว `notFound()`. **ห้าม** `findUnique({where:{id}})` แล้ว `if (x.ownerKey !== me) redirect/notFound` — Next 16 serialize object เข้า flight ก่อน throw → 200 + PII leak.

### C2. Inventory ของ status/enum/contract change ต้องรวม `tests/**` + `seed` + docs
ไม่ใช่แค่ `src/`. ทุก stale literal ใน fixture = false signal ที่ tsc จับไม่ได้ (เมื่อ field เป็น String). แยก "stale" ออกจาก "intentional negative assertion" (เช่น assert ว่า status เก่า invalid) ก่อนแก้ — grep แล้วอ่าน context ทุกจุด ห้าม blind replace.

### C3. Security/critical claim จาก subagent → Controller reproduce เชิงประจักษ์ก่อน act
ทั้งเพื่อ "ยืนยัน" และ "ปฏิเสธ/ลด scope". Code-path theory ผิดได้; subagent scope อาจ inflate. ทำ repro จริง (programmatic auth + request + ตรวจ payload) เป็น ground truth.

### C4. Cutover ที่มี derived column → re-derive ทุก row จาก source-of-truth หลัง migrate
อย่าเชื่อ column default กับ existing rows. snapshot ก่อน/หลัง, re-derive idempotent จาก source field (เช่น `fulfillmentMode` จาก `type`/items), และ verify ส่วนนี้ **แยก** จาก verify status-remap (คนละ failure domain).

---

## What went right (anchor — ทำซ้ำ)

1. spec-review จับ migration ordering-corruption ตั้งแต่ Task 1 (COMPLETED→CONFIRMED ก่อน CONFIRMED-split) → fix `4882bf2` **ก่อน** apply จริง — ไม่มี data loss.
2. targeted patch idempotent (re-derive from `type`) + snapshot ก่อน/หลัง + assert status counts ไม่ขยับ → low-risk surgical, ไม่กระทบ status-remap ที่ verified แล้ว.
3. empirical Vitest จับ stale-status ที่ type-check ผ่าน (String column) — proof > tsc.
4. Controller ไม่เชื่อ QA repro ลอย ๆ — programmatic NextAuth login + curl + grep flight payload พิสูจน์ CRITICAL จริง และ refute "6 systemic" → 3.
5. agent-team gate: safepay-developer → safepay-security (independent, read-only) → re-verify curl — ปิด CRITICAL ด้วย review ชั้นที่สอง.

---

## Action items (numbered, concrete)

1. **(user)** commit CLAUDE.md ที่ค้างอยู่ก่อน แล้ว promote **C1** เข้าตาราง HARD RULES (Controller แก้ไม่ได้ตอนนี้ — CLAUDE.md user-uncommitted/entangled).
2. **(user)** `docs/PRD.md` §11 Known Gap: (a) log `GET /api/orders/[token]` no-auth (Medium); (b) log stale `/api/orders/[token]/complete` (LOW, ลบก่อน prod); (c) mark Gap #5 (OMS) = done. (PRD.md entangled — user-only.)
3. เพิ่ม `not-found.tsx` ใน seller `(dashboard)` segment → foreign access ได้ 404 สะอาดแทน dev-500 (follow-up, cosmetic).
4. นำ **C2/C3/C4** เข้า checklist ของ `docs/conventions/agent-team-workflow.md` (inventory + verification gate).
5. DAL audit รอบถัดไป: หา page/route อื่นที่ยังเป็น `findUnique`-by-id แล้ว post-check ownership (นอกเหนือ 3 ไฟล์ที่ปิดใน `8d9485b`).

---

## Retro of the retro
เขียนหลัง cutover + empirical Vitest 106/106 + CRITICAL fixed/security-PASS. ส่วน promote CLAUDE.md HARD RULE ติด entanglement-guard (CLAUDE.md user-uncommitted) → defer เป็น action item #1 แทนการฝืนแก้.
