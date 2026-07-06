# Customer Directory (feat 00014) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]`.
>
> **SafePay:** feature ใหม่ + แตะ schema → **Hard Rule 11 (documentation-first): ห้าม implement ก่อนมี PRD+BRD ผ่าน user review** (Phase 0). แตะ auth/data → safepay-security. **Controller commit** (dev subagent ห้าม commit — [[feedback_parallel_dev_agents_no_commit]]). Migration = hand-written (shared DB, [[project_shared_db_drift_no_migrate_dev]]) + ขอ user confirm ก่อน apply prod.

**Goal:** เพิ่ม `Customer` entity (phone unique global, cross-shop id) + ผูก order.customerId + คีย์ชื่อ/เบอร์+ค้นหาลูกค้าตัวเอง ตอนสร้างออเดอร์ โดยห้ามเบอร์ซ้ำ.

**Architecture:** Customer global (phone @unique normalize) แยกจาก User; createOrder findOrCreate customer ด้วยเบอร์ (dedup + cross-shop); คง buyerName/buyerContact denormalized; search = order-derived per-shop เดิม (privacy). Backfill order เก่าด้วย phone.

**Tech Stack:** Prisma/PostgreSQL (hand-written migration) · Valibot/Yup · Next 16 route · Vitest (pure fn) · Playwright (E2E)

## Global Constraints
- Customer.phone = normalize `^0[0-9]{9}$` + `@unique` (ห้ามซ้ำเด็ดขาด); email optional ไม่ unique
- ไม่แตะ logic order เดิม (subtotal/vat/fulfillmentMode/STOREFRONT) — เพิ่มแค่ customerId linking
- migration hand-written ใน `prisma/migrations/<ts>_add_customer/migration.sql` + `migrate deploy -e .env.local` (ขอ user confirm; touch prod) — **ห้าม `migrate dev`**
- backfill = idempotent + non-destructive (set customerId เท่านั้น ไม่แก้ field อื่น)
- privacy: `/api/orders/customers` scope shopId session เดิม — ไม่ leak ข้ามร้าน
- tsc = `node node_modules/typescript/lib/tsc.js --noEmit`; UI ผ่าน safepay-ux ถ้าแตะ markup

## File Structure
| ไฟล์ | responsibility | task |
|---|---|---|
| `docs/20 - Features/00014 - Customer Directory/*` | PRD/BRD/SRS/SDS/DATABASE/API/Tests | 1 |
| `prisma/schema.prisma` + `prisma/migrations/<ts>_add_customer/migration.sql` | Customer model + Order.customerId | 2 |
| `src/lib/phone.ts` (ใหม่) | `normalizePhone(raw): string \| null` | 3 |
| `src/services/customer.service.ts` (ใหม่) | `findOrCreateCustomer(tx, phone): Promise<string>` | 4 |
| `src/services/order.service.ts` (แก้) | createOrder → set customerId | 5 |
| `prisma/backfill-customers.ts` (ใหม่) | backfill order เก่า | 6 |
| `src/app/(paces)/seller/(dashboard)/orders/new/components/CustomerSelectBlock.tsx` (แก้) | key-in + normalize/validate + recognize | 7 |

### Locked contract
```ts
// src/lib/phone.ts
export function normalizePhone(raw: string): string | null  // digits only, valid → '0xxxxxxxxx', ไม่ valid → null
// src/services/customer.service.ts
export function findOrCreateCustomer(tx: Prisma.TransactionClient, phone: string): Promise<string>  // คืน customerId (dedup by phone, P2002-safe)
```

---

### Task 1: Feature docs (Hard Rule 11 GATE — ก่อน implement)
**Files:** `docs/20 - Features/00014 - Customer Directory/{PRD,BRD,SRS,SDS,DATABASE,API,Tests}.md` (template `docs/99 - Rules/Feature-Templates/`)
- [ ] **Step 1:** safepay-product ออก **PRD + BRD** จาก design spec `docs/superpowers/specs/2026-07-04-customer-directory-design.md` (Goal/personas/FR/NFR/acceptance/edge/out-of-scope + business rules: phone unique, cross-shop, privacy). diagram = Mermaid
- [ ] **Step 2:** Controller commit PRD+BRD → **user review (BR pre-tick ถ้ามีต้อง ack)** — GATE: ห้ามไป Step 3 ก่อน user approve
- [ ] **Step 3:** safepay-planner (SRS/SDS/API) + safepay-database (DATABASE) + safepay-qa (Tests) → Controller commit
- [ ] **Step 4:** Controller commit ทั้งชุด

---

### Task 2: schema + migration (Customer + Order.customerId)
**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/<ts>_add_customer/migration.sql`

- [ ] **Step 1: เพิ่ม model ใน schema.prisma**
```prisma
model Customer {
  id        String   @id @default(uuid())
  phone     String   @unique
  email     String?
  userId    String?  @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
  orders Order[]
}
```
เพิ่มใน `model Order`: `customerId String?` + `customer Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)` + `@@index([customerId])`
เพิ่มใน `model User`: `customer Customer?` (back-relation)

- [ ] **Step 2: hand-written migration.sql** (`prisma/migrations/<ts>_add_customer/migration.sql` — ตั้ง `<ts>` > 20260704095036)
```sql
CREATE TABLE "Customer" (
  "id" TEXT NOT NULL, "phone" TEXT NOT NULL, "email" TEXT, "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD COLUMN "customerId" TEXT;
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```
- [ ] **Step 3:** `npx prisma generate` (ไม่ต่อ DB) → tsc 0. **ยังไม่ apply prod** (apply ตอน Task 6 พร้อม backfill, ขอ user confirm)
- [ ] **Step 4:** Controller commit (safepay-database review ก่อน)

---

### Task 3: normalizePhone (pure fn, TDD)
**Files:** Create `src/lib/phone.ts` + `src/lib/__tests__/phone.test.ts`
**Produces:** `normalizePhone(raw: string): string | null`

- [ ] **Step 1: failing test** (`phone.test.ts`)
```ts
import { describe, it, expect } from 'vitest'
import { normalizePhone } from '@/lib/phone'
describe('normalizePhone', () => {
  it('รับเบอร์ไทย valid', () => expect(normalizePhone('0812345678')).toBe('0812345678'))
  it('strip space/dash', () => expect(normalizePhone('081-234 5678')).toBe('0812345678'))
  it('เบอร์ผิด → null', () => { expect(normalizePhone('123')).toBeNull(); expect(normalizePhone('66812345678')).toBeNull() })
  it('email/ว่าง → null', () => { expect(normalizePhone('a@b.com')).toBeNull(); expect(normalizePhone('')).toBeNull() })
})
```
- [ ] **Step 2:** `npm run test -- phone` → FAIL (module not found)
- [ ] **Step 3: implement** (`src/lib/phone.ts`)
```ts
/** normalize เบอร์ไทย → '0xxxxxxxxx' (digits only); ไม่ตรงรูปแบบ → null */
export function normalizePhone(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  return /^0[0-9]{9}$/.test(digits) ? digits : null
}
```
- [ ] **Step 4:** `npm run test -- phone` → PASS
- [ ] **Step 5:** Controller commit

---

### Task 4: customer.service — findOrCreateCustomer (TDD)
**Files:** Create `src/services/customer.service.ts` + `src/services/__tests__/customer.service.test.ts`
**Consumes:** Prisma Customer (Task 2). **Produces:** `findOrCreateCustomer(tx, phone): Promise<string>`

- [ ] **Step 1: failing test** (mock tx.customer.findUnique/create)
```ts
import { describe, it, expect, vi } from 'vitest'
import { findOrCreateCustomer } from '@/services/customer.service'
const mkTx = (existing: any, created = { id: 'new' }) => ({
  customer: { findUnique: vi.fn().mockResolvedValue(existing), create: vi.fn().mockResolvedValue(created) },
}) as any
describe('findOrCreateCustomer', () => {
  it('เจอ customer เดิม → คืน id เดิม (dedup/cross-shop)', async () => {
    const tx = mkTx({ id: 'exist' }); expect(await findOrCreateCustomer(tx, '0812345678')).toBe('exist')
    expect(tx.customer.create).not.toHaveBeenCalled()
  })
  it('ไม่เจอ → สร้างใหม่', async () => {
    const tx = mkTx(null); expect(await findOrCreateCustomer(tx, '0812345678')).toBe('new')
  })
  it('P2002 race → re-find คืน id เดิม', async () => {
    const err: any = new Error('dup'); err.code = 'P2002'
    const tx: any = { customer: { findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'raced' }), create: vi.fn().mockRejectedValue(err) } }
    expect(await findOrCreateCustomer(tx, '0812345678')).toBe('raced')
  })
})
```
- [ ] **Step 2:** `npm run test -- customer.service` → FAIL
- [ ] **Step 3: implement** (`src/services/customer.service.ts`)
```ts
import { Prisma } from '@prisma/client'
/** dedup by phone (unique) — คืน customerId. P2002-safe (concurrent create) */
export async function findOrCreateCustomer(tx: Prisma.TransactionClient, phone: string): Promise<string> {
  const existing = await tx.customer.findUnique({ where: { phone }, select: { id: true } })
  if (existing) return existing.id
  try {
    const c = await tx.customer.create({ data: { phone }, select: { id: true } })
    return c.id
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const again = await tx.customer.findUnique({ where: { phone }, select: { id: true } })
      if (again) return again.id
    }
    throw e
  }
}
```
- [ ] **Step 4:** `npm run test -- customer.service` → PASS
- [ ] **Step 5:** Controller commit (safepay-security review — authz/dedup)

---

### Task 5: wire customerId เข้า createOrder
**Files:** Modify `src/services/order.service.ts`
**Consumes:** `normalizePhone` (T3), `findOrCreateCustomer` (T4)

- [ ] **Step 1:** import + resolve customerId ก่อน `tx.order.create` (ใน `$transaction` retry loop — ใช้ tx เดียวกัน)
```ts
import { normalizePhone } from '@/lib/phone'
import { findOrCreateCustomer } from '@/services/customer.service'
// ...ใน tx (ก่อน tx.order.create) :
const phone = data.buyerContact ? normalizePhone(data.buyerContact) : null
const customerId = phone ? await findOrCreateCustomer(tx, phone) : null
// เพิ่ม customerId ใน order data:
//   data: { ...orderDataBase, customerId: customerId ?? undefined, items: {...}, shortCode }
```
เพิ่ม `customerId` ใน object ที่ส่ง `tx.order.create` (ไม่แตะ field เดิม)
- [ ] **Step 2:** tsc 0
- [ ] **Step 3:** Controller commit

---

### Task 6: backfill + apply migration (ขอ user confirm)
**Files:** Create `prisma/backfill-customers.ts`

- [ ] **Step 1: backfill script** (idempotent)
```ts
import { PrismaClient } from '@prisma/client'
import { normalizePhone } from '../src/lib/phone'
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } } })
async function run() {
  const orders = await prisma.order.findMany({ where: { customerId: null, buyerContact: { not: null } }, select: { id: true, buyerContact: true } })
  let linked = 0
  for (const o of orders) {
    const phone = normalizePhone(o.buyerContact!); if (!phone) continue
    const existing = await prisma.customer.findUnique({ where: { phone }, select: { id: true } })
    const customerId = existing?.id ?? (await prisma.customer.create({ data: { phone }, select: { id: true } })).id
    await prisma.order.update({ where: { id: o.id }, data: { customerId } }); linked++
  }
  console.log(`[backfill-customers] linked ${linked}/${orders.length}`)
}
run().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
```
- [ ] **Step 2: 🛑 ขอ user confirm** → apply migration prod: `npx dotenv -e .env.local -- npx prisma migrate deploy` (touch shared prod DB)
- [ ] **Step 3: 🛑 ขอ user confirm** → รัน backfill: `npx dotenv -e .env.local -- npx tsx prisma/backfill-customers.ts`
- [ ] **Step 4:** Controller commit script + verify (query: order.customerId not null count; customer distinct phone)

---

### Task 7: UI — CustomerSelectBlock key-in + normalize + recognize
**Files:** Modify `src/app/(paces)/seller/(dashboard)/orders/new/components/CustomerSelectBlock.tsx`
**Prereq:** safepay-ux (แตะ markup) — key-in ชื่อ/เบอร์ inline + live search (มี search อยู่แล้ว) + phone validate (Yup `^0[0-9]{9}$`) + เจอเบอร์เดิมจาก search → recognize/auto-fill ชื่อ

- [ ] **Step 1:** ให้โหมด key-in ชื่อ+เบอร์ ใช้ได้ทันที (ไม่ต้องสลับโหมด) + validate เบอร์ (แสดง error ถ้าผิดรูปแบบ) — คง `buyerName`/`buyerContact` binding เดิม (server derive customerId เอง, UI ไม่ต้องส่ง customerId)
- [ ] **Step 2:** search เดิม (`/api/orders/customers`) — เลือกผล → fill ชื่อ+เบอร์ (เหมือนเดิม); พิมพ์เบอร์ครบ 10 หลักที่ตรงลูกค้าเดิม → highlight/auto-suggest
- [ ] **Step 3:** tsc + grep HR7 (arbitrary value 0) + reviewer
- [ ] **Step 4:** Controller commit (`Base:` line)

---

### Task 8: QA (Playwright + Chrome MCP) + merge
- [ ] **Step 1:** safepay-qa @ `seller.deepth.local:4000`: (1) คีย์ชื่อ/เบอร์ → สร้าง order → DB มี Customer + order.customerId (2) เบอร์เดิม order ที่ 2 → customer id เดียว (3) เบอร์ผิด → validate reject (4) email-only → customerId null ไม่มี Customer (5) 2 ร้านเบอร์เดียว → customer เดียว (cross-shop) + ร้าน B search ไม่เห็นชื่อร้าน A (privacy) (6) search ลูกค้าตัวเองเจอ
- [ ] **Step 2:** grep gate + verify migration/backfill ผล (DB query)
- [ ] **Step 3:** phase-retro + merge→main (ขอ user sign-off; push=deploy prod)

---

## Self-Review
**Spec coverage:** §3 model → T2 ✓ · §4 flow → T3/T4/T5 ✓ · §5 search → T7 (API เดิม privacy-scoped พอ) ✓ · §6 migration+backfill → T2/T6 ✓ · §7 validation/unique → T3(normalize)+T2(unique DB)+T7(Yup) ✓ · §8 scope MVP → T1-8; Phase 2 (customer-admin/User-link) out ✓ · §9 edge (P2002/email-only/cross-shop) → T4/T5/T6 + T8 QA ✓ · §10 feature docs → T1 ✓ · §11 QA → T8 ✓

**Placeholder scan:** โค้ด/SQL/test ครบ; ไม่มี TBD.

**Type consistency:** `normalizePhone(raw): string|null` (T3→T5,T6); `findOrCreateCustomer(tx, phone): Promise<string>` (T4→T5); `Order.customerId`/`Customer.phone` (T2→ทุก task). สอดคล้อง.

**หมายเหตุ execution:** Task 1 = **Hard Rule 11 gate** (PRD/BRD → user review ก่อน code). Migration/backfill (T6) = **2 user-confirm** ก่อน touch prod. Controller commit ทุก task; dev subagent ห้าม commit. branch `feat/00014-customer-directory` (มี spec commit แล้ว).
