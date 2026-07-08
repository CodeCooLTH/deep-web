# Convention — Query ที่ key ด้วย client-supplied id ต้อง scope ownership เสมอ

> ที่มา: retro `docs/retro/2026-07-08-feature-00016-expense-cost-tracking.md` (Problem 1 — CRITICAL cross-shop leak)
> ครอบ: service layer ทั้งหมด (`src/services/**`) + API routes ที่ query ด้วย id จาก request

---

## กฎ (actionable)

🛑 **ทุกครั้งที่ query ด้วย id (หรือ list ของ id) ที่มาจาก client request — ต้อง scope ด้วย ownership key (`shopId`/`userId`) ใน `where` เดียวกัน หรือ validate ownership ก่อน แล้ว fail-closed (reject) ถ้า id ไม่อยู่ใน scope.**

**ห้าม:**
```ts
// ❌ productId มาจาก client body — lookup โดด ๆ ไม่ scope
const products = await tx.product.findMany({ where: { id: { in: clientProductIds } } })
```

**ต้อง (แบบ scope ใน where):**
```ts
// ✅ scope ด้วย shopId — id ของร้านอื่นจะไม่ match (คืน [] → ไม่รั่ว)
const products = await tx.product.findMany({ where: { id: { in: clientProductIds }, shopId } })
```

**หรือ (แบบ validate ก่อน fail-closed — ใช้เมื่อต้อง reject ทั้ง request):**
```ts
// ✅ validate ownership ก่อนใช้ id ที่ไหนเลย
const owned = new Set(
  (await prisma.product.findMany({ where: { id: { in: clientProductIds }, shopId }, select: { id: true } }))
    .map((p) => p.id),
)
if (clientProductIds.some((id) => !owned.has(id))) throw new ProductNotInShopError() // route → 400
```

---

## ทำไม

id ที่อ้างถึงทรัพยากร (เช่น `Product.id`) มัก**เปิดเผยต่อสาธารณะ** (หน้าร้าน `/b/[slug]` render `product.id`). ถ้า lookup ไม่ scope ownership, attacker เอา id ของร้านอื่นมายัดใน request ของตัวเอง → อ่าน/แก้/ผูกข้อมูลข้ามร้านได้ (cost ลับรั่ว, ตัด stock คู่แข่ง, ฯลฯ). Postgres FK ไม่กันเรื่องนี้ (FK แค่เช็คว่า id มีจริง ไม่เช็คว่าเป็นของใคร).

Supabase ที่นี่ **ไม่มี RLS** — authz อยู่ที่ service layer 100% (ดู `.claude/agents/safepay-database`). ดังนั้น scope ownership เป็นหน้าที่ของ query ทุกตัว ไม่มี safety net ชั้น DB.

---

## Reviewer / Security grep gate

หา lookup ที่อาจไม่ scope:
```
rg "findMany\(\{ where: \{ id: \{ in:" src/services src/app/api
rg "findFirst\(\{ where: \{ id: \{ in:" src/services src/app/api
rg "findUnique\(\{ where: \{ id:" src/services src/app/api   # ตรวจว่าตามด้วย ownership check ที่ caller
```
ทุก hit ที่ id มาจาก client ต้องมี `shopId`/`userId` ใน where เดียวกัน **หรือ** ownership check ที่ caller ก่อนใช้ผลลัพธ์.

## Carve-out
- Lookup ด้วย id ที่ **server สร้างเอง** (เช่น id ที่เพิ่ง `create` ใน tx เดียวกัน, id จาก session) — ไม่ต้อง scope ซ้ำ (เป็นของ scope อยู่แล้วโดยธรรมชาติ)
- Public-by-design resource (เช่น อ่าน public profile ด้วย username) — scope ตาม semantics ของมัน (public read) ไม่ใช่ shopId

---

## Precedent
- `src/services/order.service.ts::createOrder` — `ProductNotInShopError` validate ก่อน tx (commit `f340fd0d`, feature 00016) — closed pre-existing 00009 vuln
- `src/app/api/expenses/[id]/route.ts` — fetch แล้วเทียบ `expense.shopId !== active.shop.id` → 404 no-leak (TD-004)
- `src/app/api/products/[id]/route.ts` — ownership check `product.shop.userId === session.user.id` ก่อน mutate
