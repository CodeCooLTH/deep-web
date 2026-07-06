# Customer Directory (feat 00014) — Design Spec

- **วันที่:** 2026-07-04
- **Feature:** 00014 — Customer Directory (ระบบลูกค้า)
- **ประเภท:** data-model feature (schema + migration + service + API + UI) — ผ่าน documentation-first (Hard Rule 11)
- **Surface:** seller Paces (order create) + backend

---

## 1. Goal
ให้ seller คีย์ชื่อ/เบอร์ลูกค้าตรง ๆ ตอนสร้างออเดอร์ → ระบบค้นหาลูกค้าเดิมของร้าน + จับคู่ด้วยเบอร์อัตโนมัติ, **ห้ามเบอร์ซ้ำเด็ดขาด** (unique), และ **เบอร์เดียวกันข้ามร้าน = ลูกค้า (customer id) เดียวกัน** (cross-shop identity).

## 2. Decisions (จาก brainstorm — approved)
- **Customer เป็น entity แยกจาก User** (ไม่ใช้ User เดิม): global identity keyed by phone; link User ทีหลังได้ (Phase 2)
- **phone = บังคับ + unique global** (normalize 0xxxxxxxxx); email เก็บเสริม optional; ลูกค้าที่มีแต่ email (ไม่มีเบอร์) → คงเป็น `order.buyerContact` เดิม ไม่สร้าง Customer
- **Privacy: seller เห็น/ค้นเฉพาะลูกค้าที่เคยสั่งกับร้านตัวเอง**; เบอร์ที่เป็นลูกค้าร้านอื่น → ระบบรู้ว่า id เดียวกัน (cross-shop) แต่ seller ไม่เห็นชื่อ/ข้อมูลร้านอื่น (ชื่อเก็บต่อ order = `buyerName`)

## 3. Data model
```prisma
model Customer {
  id        String   @id @default(uuid())
  phone     String   @unique   // normalize 0xxxxxxxxx (strip space/dash) — SSOT ของ cross-shop identity
  email     String?            // optional เสริม (ไม่ unique — email อาจซ้ำ/ไม่ใช่ตัวระบุหลัก)
  userId    String?  @unique   // link → User เมื่อลูกค้าสมัครเป็น buyer (Phase 2; nullable ตอน MVP)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
  orders Order[]
}
// Order เพิ่ม:
//   customerId String?  (FK → Customer, nullable) + @@index([customerId])
//   คง buyerName / buyerContact เดิม (denormalized display + backward compat)
```
- **ไม่มีตาราง per-shop** — "ลูกค้าของร้าน X" = `SELECT DISTINCT customer FROM Order WHERE shopId = X`; ชื่อ per-shop = `order.buyerName`
- normalize phone: helper `normalizePhone(raw)` → strip non-digit, validate `^0[0-9]{9}$` → เก็บ normalized

## 4. Flow — order create
1. seller คีย์ `buyerName` + `buyerContact`
2. ถ้า `buyerContact` เป็นเบอร์ (ผ่าน normalize/validate):
   - `findOrCreateCustomer(phone)` — เจอ→ใช้ id เดิม (cross-shop), ไม่เจอ→สร้างใหม่ (unique constraint กัน race: catch P2002 → re-find)
   - set `order.customerId`
3. ถ้าเป็น email หรือว่าง → `customerId = null`, คง `buyerContact` เดิม
4. คง `buyerName`/`buyerContact` denormalized บน order เสมอ (display + history-linking เดิมไม่พัง)

## 5. Search (ลูกค้าตัวเอง)
- ต่อยอด `GET /api/orders/customers?q=` เดิม (session-scoped shopId): ค้นจาก order ของร้านตัวเอง (ชื่อ/เบอร์) → คืน distinct customer (name, contact, orderCount)
- คีย์เบอร์เดิมที่เคยสั่ง → auto-fill/recognize (จาก order ร้านตัวเอง). เบอร์ลูกค้าร้านอื่น → ไม่โผล่ใน search (privacy) แต่ตอน submit ยัง findOrCreateCustomer ผูก id เดิม (dedup global)

## 6. Migration + backfill (shared DB — hand-written, ตาม `docs/conventions/prisma-shared-db-drift.md`)
- migration 1: `CREATE TABLE Customer` + unique(phone) + `ALTER Order ADD customerId` + FK + index
- backfill script (idempotent, non-destructive): loop order ที่ `buyerContact ~ ^0[0-9]{9}$` (หลัง normalize) → findOrCreate Customer by phone → set `order.customerId`. email-only → ข้าม. รันด้วย `tsx` ต่อ `.env.local` (dev=prod shared) — **ขอ user confirm ก่อน apply prod**

## 7. Validation / rules
- เบอร์: `^0[0-9]{9}$` หลัง normalize (Valibot backend + Yup frontend); Customer.phone unique (DB) = ห้ามซ้ำเด็ดขาด
- Customer สร้างเฉพาะเมื่อมีเบอร์ valid; ไม่มีเบอร์ → ไม่มี Customer (order ยังสร้างได้ด้วย buyerContact เดิม)
- authz: `/api/orders/customers` scope shopId จาก session (เดิม); ไม่ leak customer ข้ามร้าน (privacy)

## 8. Scope
- **MVP (feat 00014):** Customer model + migration + backfill · normalizePhone + findOrCreateCustomer service · order-create wiring (customerId) · search ลูกค้าตัวเอง (enhance API) · UI ช่องลูกค้า (key-in ชื่อ/เบอร์ + ค้นสด + recognize เบอร์เดิม) · unique enforce
- **Out (Phase 2):** หน้าจัดการลูกค้า (list/แก้/รวม record/ประวัติข้ามร้านของลูกค้า) · auto-link Customer↔User ตอนสมัคร (buyer-history integration) · customer-level analytics

## 9. Edge cases
| กรณี | พฤติกรรม |
|---|---|
| เบอร์ซ้ำ (race สร้างพร้อมกัน) | unique(phone) + catch P2002 → re-find customer เดิม |
| ลูกค้าไม่มีเบอร์ (email/ว่าง) | customerId=null, buyerContact เดิม, ไม่มี Customer |
| เบอร์รูปแบบผิด | validate reject (ไม่สร้าง Customer); order สร้างได้ถ้า buyerContact เป็น email/ว่าง |
| เบอร์เป็นลูกค้าร้านอื่น | findOrCreate เจอ id เดิม (cross-shop) — seller ไม่เห็นข้อมูลร้านอื่น (search ไม่โผล่) |
| order เก่า email-only | ไม่ backfill เป็น Customer (คงเดิม) |
| Customer มี userId (สมัครแล้ว) | Phase 2 — MVP ไม่ auto-link |

## 10. Feature docs (Hard Rule 11) — ownership
PRD/BRD = `safepay-product` · SRS/SDS/API = `safepay-planner` · DATABASE = `safepay-database` · Tests = `safepay-qa` · โฟลเดอร์ `docs/20 - Features/00014 - Customer Directory/`. diagram = Mermaid.

## 11. QA
Playwright E2E + Chrome DevTools MCP: key-in ชื่อ/เบอร์ → search เจอลูกค้าเดิม → เบอร์ซ้ำ (2 order เบอร์เดียว) = customer id เดียว → เบอร์ผิดรูปแบบ reject → email-only ไม่สร้าง Customer → cross-shop (2 ร้านเบอร์เดียว) = id เดียว + privacy (ร้าน B ไม่เห็นชื่อร้าน A ตั้ง) → backfill ผล
