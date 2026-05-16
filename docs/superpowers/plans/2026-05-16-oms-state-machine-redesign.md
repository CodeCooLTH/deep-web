# OMS State-Machine Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace order statuses `CREATED/CONFIRMED/SHIPPED/COMPLETED/CANCELLED` with the PRD §4 unified machine `PENDING→(SHIPPED→)CONFIRMED` (terminal `CONFIRMED`) + `Order.fulfillmentMode` snapshot + `Order.cancelInitiator`, updating all ~15 status readers in lockstep + a data migration.

**Architecture:** Big-bang atomic. `Order.status` stays plain String. Code changes + Prisma migration land together; the migration is authored by `safepay-database`, reviewed, then **applied by the user** (Supabase dev, per `docs/conventions/seed-and-env.md`) as the final cutover. trust/badge trigger moves from the deleted `completeOrder` to `confirmOrder` (the new terminal).

**Tech Stack:** Next.js 16, Prisma + PostgreSQL (Supabase dev / local Docker for tests), Vitest. Backend services + Paces(seller/admin)/Vuexy(buyer) UI readers.

Spec: `docs/superpowers/specs/2026-05-16-oms-state-machine-redesign-design.md`. Discovery map (file:line of every reader) is authoritative — re-grep before editing as line numbers may have shifted from the user's parallel seller-rework.

**CRITICAL constraints (every task):**
- Status is plain String → tsc will NOT catch mismatched literals. Correctness depends on changing ALL readers. Do not consider the feature working until grep shows zero `"COMPLETED"`/`"CREATED"`/`completeOrder` in `src/` (Task 9).
- The user has uncommitted seller-rework in `src/app/(paces)/seller/**` (products/orders Card files). **Every commit: explicit `git add <paths>` only — never `-A`/`.`** Verify `git status` shows only your files. Re-grep target file:line before editing (parallel rework may have shifted them); if a target file is currently user-modified-uncommitted, STOP and report (entanglement) instead of editing.
- Empirical Vitest run requires local Docker (`npm run test` = `dotenv -e .env`); Docker is currently DOWN. Per convention rule 7-8: write the tests, run `npx tsc --noEmit` (0 errors = the gate available now), and mark empirical test **deferred** — do NOT run `.env.local` (Supabase guard throws). Do NOT claim verified-green.
- Migration is **authored, NOT applied** by implementers. Final cutover (user runs migrate) = Task 10.

---

### Task 1: Schema + data migration (authored, not applied)

**Files:**
- Modify: `prisma/schema.prisma` (Order model)
- Create: `prisma/migrations/<timestamp>_oms_state_machine_redesign/migration.sql`

Dispatch **safepay-database** for this task.

- [ ] **Step 1: Read current Order model**

Run: `grep -n "model Order" -A 22 prisma/schema.prisma`
Expected: see `status String @default("CREATED")`, `type String @default("PHYSICAL")`, no `fulfillmentMode`, no `cancelInitiator`.

- [ ] **Step 2: Edit `prisma/schema.prisma` Order model**

Apply (Edit tool, match exact current lines):
- `status   String   @default("CREATED")` → `status   String   @default("PENDING")`
- add after `status` line: `  fulfillmentMode String  @default("SHIPPED")`
- add: `  cancelInitiator String?`

- [ ] **Step 3: Create the migration SQL**

Create `prisma/migrations/<UTC timestamp e.g. 20260516120000>_oms_state_machine_redesign/migration.sql`:

```sql
-- (1) new columns
ALTER TABLE "Order" ADD COLUMN "fulfillmentMode" TEXT NOT NULL DEFAULT 'SHIPPED';
ALTER TABLE "Order" ADD COLUMN "cancelInitiator" TEXT;

-- (2) backfill fulfillmentMode (order-level): NO_SHIPPING only if NO item needs shipping.
-- SHIPPED if any OrderItem's product is SHIPPED, OR any one-off item (productId NULL) on a PHYSICAL-type order.
UPDATE "Order" o SET "fulfillmentMode" = 'NO_SHIPPING'
WHERE NOT EXISTS (
  SELECT 1 FROM "OrderItem" oi
  LEFT JOIN "Product" p ON p."id" = oi."productId"
  WHERE oi."orderId" = o."id"
    AND ( (oi."productId" IS NOT NULL AND p."fulfillmentMode" = 'SHIPPED')
       OR (oi."productId" IS NULL AND o."type" = 'PHYSICAL') )
);
-- (rows with at least one shipping item keep DEFAULT 'SHIPPED')

-- (3) status remap — ORDER IS MANDATORY (splits before COMPLETED→CONFIRMED — prevents re-touch corruption, spec-review 2026-05-16)
UPDATE "Order" SET "status" = 'PENDING'   WHERE "status" = 'CREATED';
-- split old CONFIRMED first, while status is still literally 'CONFIRMED':
UPDATE "Order" SET "status" = 'CONFIRMED' WHERE "status" = 'CONFIRMED' AND "fulfillmentMode" = 'NO_SHIPPING';
UPDATE "Order" SET "status" = 'PENDING'   WHERE "status" = 'CONFIRMED' AND "fulfillmentMode" = 'SHIPPED';
-- now safe: no old-CONFIRMED rows remain as 'CONFIRMED'; COMPLETED→CONFIRMED cannot re-touch any of them
UPDATE "Order" SET "status" = 'CONFIRMED' WHERE "status" = 'COMPLETED';
-- SHIPPED stays SHIPPED; CANCELLED stays CANCELLED (cancelInitiator left NULL)

-- (4) change default
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';
```

**Rollback note** (in a leading SQL comment): columns are additive (drop to revert); status remap is lossy for old CONFIRMED→PENDING (cannot distinguish post-migration). Pre-migration safeguard = Step 4 dry-run snapshot.

- [ ] **Step 4: Author the dry-run verification (document in migration dir as README or comment)**

Document these queries for the user to run before/after apply (counts must reconcile):
```sql
-- BEFORE: SELECT status, count(*) FROM "Order" GROUP BY status;
-- AFTER:  SELECT status, count(*) FROM "Order" GROUP BY status;
-- invariant: total rows unchanged; AFTER has only PENDING|SHIPPED|CONFIRMED|CANCELLED;
-- AFTER.CONFIRMED == BEFORE.COMPLETED + BEFORE.CONFIRMED(NO_SHIPPING);
-- AFTER.PENDING  == BEFORE.CREATED + BEFORE.CONFIRMED(SHIPPED);
-- AFTER.SHIPPED == BEFORE.SHIPPED; AFTER.CANCELLED == BEFORE.CANCELLED
```

- [ ] **Step 5: Verify schema validity (NOT applied)**

Run: `npx prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀". Do NOT run `prisma migrate`/`db push` (cutover is Task 10, user-run).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma "prisma/migrations/"<timestamp>_oms_state_machine_redesign
git commit -m "feat(oms): Task 1 — Order schema + migration (status remap, fulfillmentMode, cancelInitiator)

Authored not applied (cutover = user runs migrate, Task 10). PENDING default,
+fulfillmentMode/+cancelInitiator, status remap per spec mapping table.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: State machine rewrite — `order.service.ts`

**Files:**
- Modify: `src/services/order.service.ts`
- Test: `tests/services/order-state-machine.test.ts` (create)

- [ ] **Step 1: Re-read current file (lines shift)**

Run: `grep -n "VALID_TRANSITIONS\|export async function\|status:\|order.type\|COMPLETED\|evaluateBadges\|recalculateTrustScore" src/services/order.service.ts`
Expected: see `VALID_TRANSITIONS`, `createOrder`, `confirmOrder`, `checkOrderPhone`, `shipOrder`, `completeOrder`, `cancelOrder`, the `order.type !== "PHYSICAL"` ship guard, evaluateBadges in completeOrder.

- [ ] **Step 2: Write failing test `tests/services/order-state-machine.test.ts`**

Mirror the existing test pattern in `tests/services/badge.test.ts` (imports `prisma` + `cleanDatabase` from `tests/setup.ts`; real DB). Include:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma, cleanDatabase } from '../setup'
import { createOrder, shipOrder, confirmOrder, cancelOrder } from '@/services/order.service'

// helper: make shop+product with a given fulfillmentMode, return ids
async function seedShopProduct(fulfillmentMode: 'SHIPPED' | 'NO_SHIPPING') { /* create user, shop, product per existing schema */ }

beforeEach(cleanDatabase)

describe('OMS state machine', () => {
  it('createOrder → PENDING, snapshots fulfillmentMode (any shipping item ⇒ SHIPPED)', async () => {
    const { shopId, productId } = await seedShopProduct('SHIPPED')
    const o = await createOrder({ shopId, items: [{ productId, name: 'x', price: 10, qty: 1 }], totalAmount: 10, type: 'PHYSICAL' })
    expect(o.status).toBe('PENDING')
    expect(o.fulfillmentMode).toBe('SHIPPED')
  })
  it('NO_SHIPPING order: PENDING → confirmOrder ⇒ CONFIRMED (terminal)', async () => {
    const { shopId, productId } = await seedShopProduct('NO_SHIPPING')
    const o = await createOrder({ shopId, items: [{ productId, name: 'x', price: 10, qty: 1 }], totalAmount: 10, type: 'DIGITAL' })
    const c = await confirmOrder(o.publicToken, '0810000000')
    expect(c.status).toBe('CONFIRMED')
  })
  it('SHIPPED-fulfillment: PENDING → ship ⇒ SHIPPED → confirm ⇒ CONFIRMED', async () => {
    const { shopId, productId } = await seedShopProduct('SHIPPED')
    const o = await createOrder({ shopId, items: [{ productId, name: 'x', price: 10, qty: 1 }], totalAmount: 10, type: 'PHYSICAL' })
    const s = await shipOrder(o.publicToken, { trackingNumber: 'TH1', carrier: 'KEX' })
    expect(s.status).toBe('SHIPPED')
    const c = await confirmOrder(o.publicToken, '0810000000')
    expect(c.status).toBe('CONFIRMED')
  })
  it('ship guard: NO_SHIPPING order rejects shipOrder', async () => {
    const { shopId, productId } = await seedShopProduct('NO_SHIPPING')
    const o = await createOrder({ shopId, items: [{ productId, name: 'x', price: 10, qty: 1 }], totalAmount: 10, type: 'DIGITAL' })
    await expect(shipOrder(o.publicToken, { trackingNumber: 'x', carrier: 'y' })).rejects.toThrow()
  })
  it('cancelOrder records initiator; cancel after CONFIRMED rejected', async () => {
    const { shopId, productId } = await seedShopProduct('NO_SHIPPING')
    const o = await createOrder({ shopId, items: [{ productId, name: 'x', price: 10, qty: 1 }], totalAmount: 10, type: 'DIGITAL' })
    const x = await cancelOrder(o.publicToken, 'buyer')
    expect(x.status).toBe('CANCELLED'); expect(x.cancelInitiator).toBe('buyer')
    const o2 = await createOrder({ shopId, items: [{ productId, name: 'x', price: 10, qty: 1 }], totalAmount: 10, type: 'DIGITAL' })
    await confirmOrder(o2.publicToken, '0810000000')
    await expect(cancelOrder(o2.publicToken, 'seller')).rejects.toThrow()
  })
})
```

(Adjust `createOrder`/`shipOrder` arg shapes to the ACTUAL current signatures read in Step 1 — do not invent; keep the assertions.)

- [ ] **Step 3: Run test → FAIL**

Run: `npx dotenv -e .env -- npx vitest run tests/services/order-state-machine.test.ts --testTimeout=60000`
Expected: FAIL. If error is `Can't reach database server`/Docker down → environment-deferred per convention rule 7-8: note it, continue (the code change + tsc is the gate available now); do NOT switch to `.env.local`.

- [ ] **Step 4: Rewrite `order.service.ts`**

- `VALID_TRANSITIONS`:
```ts
const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING:   ["SHIPPED", "CONFIRMED", "CANCELLED"],
  SHIPPED:   ["CONFIRMED", "CANCELLED"],
  CONFIRMED: [],
  CANCELLED: [],
}
```
- `createOrder`: set `status` default path to `"PENDING"`; compute order-level `fulfillmentMode`: query each item's product.fulfillmentMode; `fulfillmentMode = items.some(it => it.productId == null ? type === 'PHYSICAL' : productFulfillment[it.productId] === 'SHIPPED') ? 'SHIPPED' : 'NO_SHIPPING'`; persist on the created Order.
- ship guard: replace `if (order.type !== "PHYSICAL") throw …` with `if (order.fulfillmentMode !== "SHIPPED") throw new Error("ออเดอร์นี้ไม่ต้องจัดส่ง")`. `shipOrder` transition `PENDING → SHIPPED` (assertTransition).
- `confirmOrder`: transition `assertTransition(order.status, "CONFIRMED")` (works from PENDING or SHIPPED), set status `CONFIRMED`. **Move the trust+badge trigger here** (the best-effort `try { await evaluateBadges(order.shop.userId) } catch {…}` block currently in `completeOrder`) — place it after the status update, same best-effort pattern.
- DELETE `completeOrder` entirely and every `"COMPLETED"` literal.
- `cancelOrder(token: string, initiator: 'seller' | 'buyer')`: assertTransition to `CANCELLED` (valid only from PENDING/SHIPPED → throws if CONFIRMED), set `status='CANCELLED'`, `cancelInitiator=initiator`.

- [ ] **Step 5: Run test → PASS (or env-deferred)**

Run: `npx dotenv -e .env -- npx vitest run tests/services/order-state-machine.test.ts --testTimeout=60000`
Expected: PASS. If Docker down → run `npx tsc --noEmit` (expect 0 errors) and record empirical test deferred.

- [ ] **Step 6: Commit**

```bash
git add src/services/order.service.ts tests/services/order-state-machine.test.ts
git commit -m "feat(oms): Task 2 — state machine PENDING→(SHIPPED→)CONFIRMED, fulfillmentMode guard, cancelInitiator

Removed completeOrder/COMPLETED; trust+badge trigger moved to confirmOrder
(new terminal). cancelOrder(initiator). +Vitest (empirical deferred: Docker).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Cancel API route — derive initiator from session

**Files:** Modify the order cancel route.

- [ ] **Step 1: Locate the cancel route + how it calls cancelOrder**

Run: `grep -rn "cancelOrder\|/cancel" src/app/api/orders/ | grep -i cancel`
Expected: a `route.ts` under `src/app/api/orders/[token]/cancel/` calling `cancelOrder(token)`.

- [ ] **Step 2: Read the route + an existing route that derives shop ownership from session**

Run: `grep -rn "getServerSession\|order.shop.userId\|requireAdmin\|session.user" src/app/api/orders/[token]/cancel/route.ts src/app/api/orders/[token]/ship/route.ts`
Expected: see how `ship` (seller-only) authorizes — reuse that ownership check pattern.

- [ ] **Step 3: Edit the cancel route**

Derive initiator: get session; load order (by token) with `shop.userId`; `const initiator = session?.user && (session.user as {id?:string}).id === order.shop.userId ? 'seller' : 'buyer'`; call `cancelOrder(token, initiator)`. (A guest/buyer with no session, or a logged-in non-owner = `'buyer'`.) Keep existing auth/response/error shape; do not accept initiator from the request body.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/orders/[token]/cancel/route.ts
git commit -m "feat(oms): Task 3 — cancel route derives cancelInitiator from session (owner=seller else buyer)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Lockstep readers — services (trust / badge / review)

**Files:** `src/services/trust-score.service.ts`, `src/services/badge.service.ts`, `src/services/review.service.ts`

- [ ] **Step 1: Re-grep exact lines**

Run: `grep -n '"COMPLETED"\|COMPLETED\|DEFAULT_TERMINAL_STATUSES\|cancelled\|status:' src/services/trust-score.service.ts src/services/badge.service.ts src/services/review.service.ts`

- [ ] **Step 2: Edit trust-score.service.ts**

In `calcOrderScore`, the `prisma.order.count({ where: { shopId: shop.id, status: "COMPLETED" } })` → `status: "CONFIRMED"`.

- [ ] **Step 3: Edit badge.service.ts**

- `const DEFAULT_TERMINAL_STATUSES = ['COMPLETED']` → `['CONFIRMED']`.
- `checkZeroComplaint`: the cancelled count query → add `cancelInitiator: 'seller'`:
  `prisma.order.count({ where: { shopId: shop.id, status: 'CANCELLED', cancelInitiator: 'seller' } })` (only seller-initiated cancels penalize; null/buyer excluded — spec Q3).

- [ ] **Step 4: Edit review.service.ts**

The createReview status guard array `["CONFIRMED", "SHIPPED", "COMPLETED"]` → `["CONFIRMED", "SHIPPED"]`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && grep -rn '"COMPLETED"' src/services/ || echo "no COMPLETED in services"`
Expected: 0 tsc errors; no `"COMPLETED"` remaining in `src/services/`.

- [ ] **Step 6: Commit**

```bash
git add src/services/trust-score.service.ts src/services/badge.service.ts src/services/review.service.ts
git commit -m "feat(oms): Task 4 — service readers to CONFIRMED terminal; Zero-Complaint seller-initiated only

trust-score counts CONFIRMED; badge DEFAULT_TERMINAL_STATUSES=['CONFIRMED'];
checkZeroComplaint counts cancelInitiator='seller' only; review guard drops COMPLETED.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Lockstep readers — public profile + buyer app

**Files:** `src/app/(marketing)/u/[username]/page.tsx`, `src/app/(marketing)/(buyer-app)/dashboard/page.tsx`, `src/app/(marketing)/(buyer-app)/orders/page.tsx`

- [ ] **Step 1: Re-grep**

Run: `grep -n "COMPLETED" "src/app/(marketing)/u/[username]/page.tsx" "src/app/(marketing)/(buyer-app)/dashboard/page.tsx" "src/app/(marketing)/(buyer-app)/orders/page.tsx"`

- [ ] **Step 2: Edit each — replace order-status `'COMPLETED'` with `'CONFIRMED'`**

- `u/[username]/page.tsx`: the `orderStats.find((s) => s.status === 'COMPLETED')` (completedOrders) → `'CONFIRMED'`.
- `(buyer-app)/dashboard/page.tsx`: `allOrders.filter((o) => o.status === 'COMPLETED').length` → `'CONFIRMED'`.
- `(buyer-app)/orders/page.tsx`: any `o.status === 'COMPLETED'` / a `'COMPLETED'` filter option → `'CONFIRMED'`; if there is a status filter list containing CREATED/COMPLETED, update to PENDING/SHIPPED/CONFIRMED/CANCELLED. Keep Thai labels consistent with existing.
(Only touch order-status comparisons. Do NOT touch unrelated `VERIFICATION` `status` like `'APPROVED'`/`'PENDING'` records.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(marketing)/u/[username]/page.tsx" "src/app/(marketing)/(buyer-app)/dashboard/page.tsx" "src/app/(marketing)/(buyer-app)/orders/page.tsx"
git commit -m "feat(oms): Task 5 — public profile + buyer app readers COMPLETED→CONFIRMED

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Lockstep readers — seller analytics ×5

**Files:** `src/app/(paces)/seller/(dashboard)/{customers,products,sales,categories}/page.tsx`, `src/app/(paces)/seller/(dashboard)/products/[id]/page.tsx`

- [ ] **Step 1: Re-grep + entanglement check**

Run: `for f in "src/app/(paces)/seller/(dashboard)/customers/page.tsx" "src/app/(paces)/seller/(dashboard)/products/page.tsx" "src/app/(paces)/seller/(dashboard)/sales/page.tsx" "src/app/(paces)/seller/(dashboard)/categories/page.tsx" "src/app/(paces)/seller/(dashboard)/products/[id]/page.tsx"; do echo "== $f =="; git status --porcelain -- "$f"; grep -n "COMPLETED" "$f"; done`
Expected: each `git status` blank (committed/clean). **If any is user-modified-uncommitted → STOP, report entanglement** (do not edit; Controller decides — likely wait for user to commit).

- [ ] **Step 2: Edit each — `o.status === 'COMPLETED'` → `o.status === 'CONFIRMED'`**

One-line replacement per file (the analytics "completed orders" filter). Preserve all other logic.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && grep -rn "'COMPLETED'" "src/app/(paces)/seller/(dashboard)/" || echo "no COMPLETED in seller dashboard"`
Expected: 0 errors; no remaining order `'COMPLETED'` (note: ignore any `VERIFICATION`/unrelated — there should be none in these analytics files).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(paces)/seller/(dashboard)/customers/page.tsx" "src/app/(paces)/seller/(dashboard)/products/page.tsx" "src/app/(paces)/seller/(dashboard)/sales/page.tsx" "src/app/(paces)/seller/(dashboard)/categories/page.tsx" "src/app/(paces)/seller/(dashboard)/products/[id]/page.tsx"
git commit -m "feat(oms): Task 6 — seller analytics ×5 readers COMPLETED→CONFIRMED

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Lockstep readers — OMS UI (seller order detail/list, public order, admin orders)

**Files:** `src/app/(paces)/seller/(dashboard)/orders/page.tsx`, `.../orders/[token]/components/OrderActions.tsx`, `.../components/ShippingActivity.tsx`, `.../components/OrderSummary.tsx`, `src/app/(marketing)/o/[token]/OrderDetailMobile.tsx`, `src/app/(paces)/admin/(dashboard)/orders/page.tsx`, `src/app/(paces)/admin/(dashboard)/orders/components/OrdersTable.tsx`

- [ ] **Step 1: Re-grep + entanglement check (seller files likely user-touched)**

Run: `for f in "src/app/(paces)/seller/(dashboard)/orders/page.tsx" "src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderActions.tsx" "src/app/(paces)/seller/(dashboard)/orders/[token]/components/ShippingActivity.tsx" "src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderSummary.tsx" "src/app/(marketing)/o/[token]/OrderDetailMobile.tsx" "src/app/(paces)/admin/(dashboard)/orders/page.tsx" "src/app/(paces)/admin/(dashboard)/orders/components/OrdersTable.tsx"; do echo "== $f =="; git status --porcelain -- "$f"; grep -n "CREATED\|CONFIRMED\|SHIPPED\|COMPLETED\|CANCELLED" "$f"; done`
**If any file is user-modified-uncommitted → STOP, report entanglement.**

- [ ] **Step 2: Edit status maps/gates → new states**

Apply per file (preserve Paces/Vuexy structure; Thai labels; no theme re-source — Hard Rule 1 N/A, these are status-literal edits to existing committed UI):
- `orders/page.tsx` summary counts: `CREATED`→`PENDING`; drop `COMPLETED` bucket (fold into `CONFIRMED`); keep SHIPPED/CANCELLED. Counts = pending(PENDING)/active(SHIPPED)/confirmed(CONFIRMED)/cancelled(CANCELLED).
- `OrderActions.tsx`: ship button gate `status==='CONFIRMED' && type==='PHYSICAL'` → `status==='PENDING' && fulfillmentMode==='SHIPPED'`; remove the "complete" button entirely; cancel button visible when `status==='PENDING' || status==='SHIPPED'`. (Read the component to get the real prop names; `fulfillmentMode` is now on the order — ensure the page passes it down.)
- `ShippingActivity.tsx`: `FLOW_ORDER = ['PENDING','SHIPPED','CONFIRMED']`; NO_SHIPPING path filters out `'SHIPPED'` (→ `['PENDING','CONFIRMED']`).
- `OrderSummary.tsx`: `STATUS_META` keys → `PENDING|SHIPPED|CONFIRMED|CANCELLED` (Thai labels: PENDING="รอดำเนินการ", SHIPPED="จัดส่งแล้ว", CONFIRMED="สำเร็จ", CANCELLED="ยกเลิก"; colors: keep existing palette mapping, CONFIRMED=success, CANCELLED=danger, SHIPPED=info, PENDING=warning).
- `OrderDetailMobile.tsx` (public): confirm button visible when `status==='PENDING' || status==='SHIPPED'` (was `==='CREATED'`); review button when `['CONFIRMED','SHIPPED'].includes(status)`; hide actions when `status==='CANCELLED'`. (Old `['CONFIRMED','SHIPPED','COMPLETED']` → `['CONFIRMED','SHIPPED']`.)
- admin `orders/page.tsx` + `OrdersTable.tsx`: status union/cast + filter tabs → `PENDING|SHIPPED|CONFIRMED|CANCELLED` (remove CREATED/COMPLETED tabs).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && grep -rn "'CREATED'\|'COMPLETED'\|\"CREATED\"\|\"COMPLETED\"" src/app/ | grep -iv verification || echo "no CREATED/COMPLETED order-status in src/app"`
Expected: 0 tsc errors; no order-status CREATED/COMPLETED remaining (verification-record statuses are unrelated and fine).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(paces)/seller/(dashboard)/orders/page.tsx" "src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderActions.tsx" "src/app/(paces)/seller/(dashboard)/orders/[token]/components/ShippingActivity.tsx" "src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderSummary.tsx" "src/app/(marketing)/o/[token]/OrderDetailMobile.tsx" "src/app/(paces)/admin/(dashboard)/orders/page.tsx" "src/app/(paces)/admin/(dashboard)/orders/components/OrdersTable.tsx"
git commit -m "feat(oms): Task 7 — OMS UI readers/gates to PENDING/SHIPPED/CONFIRMED/CANCELLED

seller order list+detail (ship gate=PENDING&fulfillmentMode SHIPPED, no
complete btn), public order confirm/review gates, admin orders filter.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Grep-clean + tsc gate (no old status anywhere)

**Files:** none (verification task).

- [ ] **Step 1: Repo-wide order-status grep**

Run: `grep -rn '"COMPLETED"\|'"'"'COMPLETED'"'"'\|"CREATED"\|'"'"'CREATED'"'"'\|completeOrder' src/ prisma/seed.ts | grep -iv "verification\|VerificationRecord" || echo "CLEAN"`
Expected: `CLEAN`. (If `prisma/seed.ts` seeds orders with old status → fix to new; if it seeds none, fine. If any hit remains, it's an unconverted reader — fix in the owning task before proceeding.)

- [ ] **Step 2: Full type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Confirm no scope bleed**

Run: `git status --porcelain | grep -vE '^\?\? (docs/|qa-)' | grep -E '(paces)/seller/(dashboard)/(products|orders)/components|OrderCreateForm|ProductPickerModal' && echo "WARNING user seller-rework present (expected, untouched)" || echo "ok"`
Expected: user's seller-rework still unstaged/untouched (we never `git add`-ed it).

- [ ] **Step 4: (no commit — gate only). If CLEAN+0 errors, proceed to Task 9.**

---

### Task 9: Update spec/PRD known-gap status (docs)

**Files:** `docs/PRD.md` (§11 Known Gaps row #5)

- [ ] **Step 1: Re-read §11 row #5**

Run: `grep -n "Known Gap\|#5\|state machine\|cancelInitiator" docs/PRD.md | head`
Note: `docs/PRD.md` may be user-modified-uncommitted. If so → STOP, report (do not edit an entangled PRD; Controller will fold this into the user's commit or defer).

- [ ] **Step 2: If PRD clean — mark gap #5 done; note #5e/#5l still open**

Edit §11: row #5 (state machine) → mark "✅ done (2026-05-16 OMS redesign)"; keep #5e (shippingAddress required) + #5l (admin completion-rate) as still-open follow-ups.

- [ ] **Step 3: Commit (only if PRD was clean)**

```bash
git add docs/PRD.md
git commit -m "docs(prd): §11 Known Gap #5 OMS state machine — done (defer #5e/#5l)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Cutover — user applies migration (Controller-coordinated, NOT a subagent step)

**Not an implementer task.** After Tasks 1–9 merged + reviewed, Controller hands the user the exact commands (user runs migrate on Supabase dev per `docs/conventions/seed-and-env.md`; tests need local Docker):

- [ ] **Step 1:** User runs the BEFORE dry-run query (Task 1 Step 4), records counts.
- [ ] **Step 2:** User runs migrate (Supabase dev): `npx dotenv -e .env.local -- npx prisma migrate deploy` (apply the authored migration; NOT `migrate dev` which would try to author a new one) then `npx prisma generate`.
- [ ] **Step 3:** User runs the AFTER dry-run query; Controller verifies invariants in Task 1 Step 4 hold.
- [ ] **Step 4:** Empirical Vitest (when Docker up): `docker compose up -d db` then `npm run test`. Browser QA 3-level (when server+chrome MCP up) per spec Testing section. Both remain **deferred** until env available; Controller tracks in retro action items — feature is "code-gated, cutover+QA deferred", do NOT claim verified-green.

---

## Self-Review (writing-plans)

**Spec coverage:** §1 schema/migration→Task1; §2 state machine→Task2; cancel route initiator→Task3; §3 lockstep readers→Task4(services)/5(public+buyer)/6(seller analytics)/7(OMS UI); migration mapping table→Task1 Step3 (all 6 rows incl. old-CONFIRMED-by-fulfillmentMode + CANCELLED→null); fulfillmentMode any-shipping-item rule→Task1 Step3 backfill + Task2 Step4 createOrder; Zero-Complaint seller-only→Task4; out-of-scope #5e/#5l→Task9 (kept open) + never implemented; acceptance grep-clean→Task8; cutover→Task10. ✅ no gap.
**Placeholder scan:** no TBD/TODO; every code step has concrete code or exact old→new string + exact grep/commands. Test code provided (Task2) with explicit note to match real signatures from Step-1 grep (not a vague "write tests"). ✅
**Type/string consistency:** status literals uniform `PENDING|SHIPPED|CONFIRMED|CANCELLED` across all tasks; `cancelInitiator` values `'seller'|'buyer'` consistent (Task2/3/4); `fulfillmentMode` `'SHIPPED'|'NO_SHIPPING'` consistent (Task1/2/7); `confirmOrder`/`shipOrder`/`cancelOrder` names consistent Task2↔3↔7; entanglement-guard step present in every task touching seller files (6,7,9). ✅
