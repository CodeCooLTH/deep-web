# Design — OMS State-Machine Redesign (Known Gap #5)

วันที่: 2026-05-16
สถานะ: approved-pending-spec-review
ที่มา: PRD §4 (target ตัดสินใน PRD interview แล้ว) + Known Gap #5 + Discovery 2026-05-16

## ปัญหา

โค้ดปัจจุบันใช้ order status เก่า `CREATED/CONFIRMED/SHIPPED/COMPLETED/CANCELLED`
(plain String). PRD §4 redesign เป็น unified machine `PENDING→(SHIPPED→)CONFIRMED`
(terminal เดียว = `CONFIRMED`, ไม่มี `COMPLETED`/`DELIVERED`) + `cancelInitiator`
สำหรับ Zero-Complaint badge. มี ~15 reader ของ `order.status` ทั่ว codebase ที่
hardcode string เก่า — ต้องเปลี่ยน lockstep มิฉะนั้น trust/badge/public-profile พัง.

## เป้าหมาย / decisions (จาก brainstorm)

- **execution: big-bang atomic** — 1 feature, migration + code lockstep, 1 cutover.
  (ปฏิเสธ phased/dual-write: status rename มี lockstep reader จำนวนมาก, partial
  migration = ระบบพังทันที; dual-write overkill สำหรับ stage นี้.)
- **Q1 — old `CONFIRMED` mapping ตาม fulfillmentMode:** NO_SHIPPING → `CONFIRMED`
  (terminal สำเร็จ); SHIPPED-fulfillment → `PENDING` (ยังไม่ ship).
- **Q2 — snapshot `Order.fulfillmentMode` เป็น column** (ไม่ derive runtime):
  createOrder snapshot จาก product; migration backfill จาก OrderItem→Product;
  order พิมพ์เอง (productId=null) → fallback จาก `order.type`.
- **Q3 — historical `CANCELLED` → `cancelInitiator=null`**; Zero-Complaint นับ
  cancel เฉพาะ `cancelInitiator==='seller'` (null = ไม่ลงโทษย้อนหลัง — lenient).
- **Q4 — scope: core migration + lockstep readers เท่านั้น**; defer #5e / #5l.
- status คงเป็น **plain String** (ไม่ทำ Prisma enum — ทั้งโปรเจกต์ใช้ string,
  enum = blast เพิ่มโดยไม่จำเป็น).

## Migration mapping (กำหนดครบ)

| old status | เงื่อนไข | → new status | cancelInitiator |
|---|---|---|---|
| CREATED | — | PENDING | — |
| COMPLETED | — | CONFIRMED | — |
| SHIPPED | — | SHIPPED | — |
| CONFIRMED | fulfillmentMode = NO_SHIPPING | CONFIRMED (terminal) | — |
| CONFIRMED | fulfillmentMode = SHIPPED | PENDING | — |
| CANCELLED | — | CANCELLED | null |

`fulfillmentMode` backfill (สอดคล้องกับ createOrder rule): order-level =
**`SHIPPED` ถ้ามี OrderItem ใด ๆ ที่ product.fulfillmentMode=SHIPPED หรือ productId=null
และ Order.type=PHYSICAL; มิฉะนั้น `NO_SHIPPING`** (productId=null + type DIGITAL/SERVICE
→ NO_SHIPPING).

## องค์ประกอบ

### 1. Schema + Data migration (Prisma, 1 atomic migration)
- `prisma/schema.prisma` `Order`:
  - `status String @default("PENDING")` (เดิม default `"CREATED"`)
  - เพิ่ม `fulfillmentMode String @default("SHIPPED")`
  - เพิ่ม `cancelInitiator String?`
- migration `*_oms_state_machine_redesign`:
  1. `ALTER TABLE "Order" ADD COLUMN "fulfillmentMode" TEXT NOT NULL DEFAULT 'SHIPPED'`
  2. `ALTER TABLE "Order" ADD COLUMN "cancelInitiator" TEXT`
  3. backfill `fulfillmentMode` (UPDATE จาก OrderItem→Product join; productId null → จาก type)
  4. remap `status` ตามตาราง mapping (UPDATE มีเงื่อนไข fulfillmentMode สำหรับ old CONFIRMED)
  5. เปลี่ยน column default `status` → `'PENDING'`
  - **rollback note** + **dry-run: SELECT count ต่อ status ก่อน/หลัง** ต้องตรงตาม mapping
  - safepay-database ออกแบบ migration SQL + review ก่อน apply; **user รัน migrate เอง** (Supabase dev) ตาม convention seed-and-env

### 2. State machine — `src/services/order.service.ts`
- `VALID_TRANSITIONS`:
  ```
  PENDING:   ["SHIPPED", "CONFIRMED", "CANCELLED"]
  SHIPPED:   ["CONFIRMED", "CANCELLED"]
  CONFIRMED: []          // terminal
  CANCELLED: []          // terminal
  ```
- `createOrder`: status=`PENDING`; snapshot order-level `fulfillmentMode` = **`SHIPPED` ถ้ามี item ใด ๆ ที่ product.fulfillmentMode=SHIPPED, มิฉะนั้น `NO_SHIPPING`** (order ต้องส่งถ้ามีของกายภาพอย่างน้อย 1 ชิ้น). item พิมพ์เอง (productId=null) นับเป็น SHIPPED ตาม fallback type ของ order
- ship guard: `order.fulfillmentMode === 'SHIPPED'` (เลิกใช้ `order.type !== 'PHYSICAL'`)
  - `shipOrder`: `PENDING → SHIPPED` (เฉพาะ fulfillmentMode=SHIPPED) + สร้าง ShipmentTracking (เดิม)
- `confirmOrder` (buyer phone-unlock, ไม่มี OTP — FR-6.3): `PENDING|SHIPPED → CONFIRMED`
  (terminal). **ย้าย trigger trust+badge มาที่ confirm** (เดิมอยู่ completeOrder)
- ลบ `completeOrder` + ทุก `"COMPLETED"` ในโค้ด
- `cancelOrder(token, initiator: 'seller'|'buyer')`: `PENDING|SHIPPED → CANCELLED`
  (reject ถ้า status=CONFIRMED) + set `cancelInitiator`
- cancel API route: derive initiator จาก session — requester เป็น shop owner ของ order
  → `'seller'`, มิฉะนั้น `'buyer'` (ไม่รับจาก client body)

### 3. Lockstep readers (เปลี่ยนพร้อม migration — mandatory เพื่อ correctness)
- `trust-score.service.ts:~31` `calcOrderScore` count `status: "CONFIRMED"` (แทน COMPLETED)
- `badge.service.ts` `DEFAULT_TERMINAL_STATUSES = ['CONFIRMED']`; `checkZeroComplaint`
  นับ cancelled เฉพาะ `where:{ shopId, status:'CANCELLED', cancelInitiator:'seller' }`
- `review.service.ts:~18` guard allow `["CONFIRMED","SHIPPED"]` (ลบ COMPLETED)
- public profile `src/app/(marketing)/u/[username]/page.tsx:~76` completedOrders
  groupBy filter → `CONFIRMED`
- seller analytics: `customers/page.tsx`, `products/page.tsx`, `sales/page.tsx`,
  `categories/page.tsx`, `products/[id]/page.tsx` — `o.status === 'COMPLETED'` → `'CONFIRMED'`
- buyer `(buyer-app)/dashboard/page.tsx:~67` + `orders/page.tsx` filter — COMPLETED→CONFIRMED
- OMS UI (Paces seller): `OrderActions.tsx` (ปุ่ม ship/cancel ตาม PENDING/SHIPPED;
  เลิกปุ่ม complete), `ShippingActivity.tsx` FLOW_ORDER (`PENDING→SHIPPED→CONFIRMED`,
  NO_SHIPPING ตัด SHIPPED), `OrderSummary.tsx` STATUS_META (label/สี ค่าใหม่),
  seller `orders/page.tsx` summary counts
- public order (Vuexy): `(marketing)/o/[token]/OrderDetailMobile.tsx` button gates
  (confirm เมื่อ PENDING/SHIPPED; hide CANCELLED; review เมื่อ CONFIRMED)
- admin orders: `admin/(dashboard)/orders/page.tsx` + `OrdersTable.tsx` status cast/filter
  (ค่าใหม่; ไม่มี COMPLETED tab)

### 4. Out of scope (defer → follow-up แยก)
- #5e: `shippingAddress` required-on-create เมื่อ fulfillmentMode=SHIPPED
- #5l: admin completion-rate metric (CONFIRMED/(CONFIRMED+CANCELLED))
- dispute/complaint system (Phase 2, PRD)
- Prisma enum สำหรับ OrderStatus

## Error handling

- `assertTransition(from, to)` คงเดิม + reject cancel เมื่อ from=CONFIRMED
- trust/badge trigger หลัง confirm = best-effort try/catch (pattern เดิม) ไม่บล็อก confirm
- migration: ทุก UPDATE มี WHERE ชัด; rollback note; ถ้า count ก่อน/หลังไม่ match → abort

## Testing

- **Vitest** (`tests/services/`): VALID_TRANSITIONS (valid/invalid + reject cancel-after-CONFIRMED);
  ship guard fulfillmentMode; confirm triggers trust+badge once; cancelOrder set
  cancelInitiator; checkZeroComplaint นับเฉพาะ seller-initiated; migration mapping
  pure-function unit (ถ้าแยก mapping logic เป็น fn ได้)
- **empirical test = `npm run test` (local Docker/.env)** ตาม convention rule 7-8;
  Docker ดับ ⇒ **deferred** (code-gate + tsc + static เพียงพอชั่วคราว, ห้าม claim verified-green)
- **Browser QA (3-level, deferred — server/chrome MCP):** seller สร้าง order →
  PENDING; ship (SHIPPED-fulfillment) → SHIPPED → buyer phone-unlock กดรับ → CONFIRMED;
  NO_SHIPPING order PENDING → buyer confirm → CONFIRMED; cancel seller/buyer ก่อน
  CONFIRMED → CANCELLED + initiator; trust/badge bump ที่ CONFIRMED; public profile
  completed count

## Implementation sequencing (atomic — กันสถานะพังกลางคัน)

ทุกอย่างต้อง land เป็น unit เดียว (tsc ไม่ผ่านจน reader เปลี่ยนครบ + migration ต้อง
มาคู่โค้ด). agent-team Phase 4 batching จะกำหนดใน writing-plans แต่ commit boundary
= migration+schema+state-machine+lockstep-readers ต้อง atomic (อาจ bundle commit
ถ้า tsc ผูกกัน — ตาม retro "Bundle commits ตาม atomic unit").

## Acceptance

- [ ] migration: dry-run count ต่อ status ก่อน/หลัง ตรง mapping table ทุกแถว; ไม่มี row หาย; rollback note มี
- [ ] schema: `Order.fulfillmentMode` (default SHIPPED) + `cancelInitiator String?`; status default `PENDING`
- [ ] VALID_TRANSITIONS = ค่าใหม่; cancel หลัง CONFIRMED ถูก reject; ไม่มี `COMPLETED`/`completeOrder` เหลือใน codebase (grep clean)
- [ ] ship guard = fulfillmentMode==='SHIPPED'; createOrder snapshot fulfillmentMode
- [ ] confirm = terminal CONFIRMED + trust/badge trigger ที่ confirm (ครั้งเดียว)
- [ ] cancelOrder set cancelInitiator (seller/buyer derive จาก session, ไม่ใช่ client)
- [ ] checkZeroComplaint นับ cancel เฉพาะ seller-initiated; DEFAULT_TERMINAL_STATUSES=['CONFIRMED']
- [ ] readers ทั้งหมด (trust/review/public-profile/seller-analytics×5/buyer/OMS UI/admin) ไม่อ้าง 'COMPLETED'/'CREATED' (grep clean) + tsc 0
- [ ] #5e/#5l ไม่ถูกทำ (defer); dispute ไม่ถูกแตะ
- [ ] ไม่ปนงาน seller-rework uncommitted ของ user (selective git add ทุก commit)
