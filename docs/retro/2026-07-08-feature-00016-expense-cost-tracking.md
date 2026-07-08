# Retro — Feature 00016 Expense & Cost Tracking (2026-07-08)

> ระบบบันทึกค่าใช้จ่าย + ตั้งต้นทุนสินค้า + รายงานกำไรขาดทุน (P&L) ฝั่ง seller
> ทำครบ lifecycle ใน session เดียว (Discovery → docs → implement → review → merge prod) ผ่าน agent team
> Merged main + deployed prod `deepthailand.app` — commits `198b4a4f`..`2ad8f45a` (branch `feat/expense-cost-tracking`, FF)

---

## What went right (anchor ที่ควรทำซ้ำ)

1. **Documentation-First (Hard Rule 11) ทำงานจริง** — PRD→BRD (user review + ตอบ open questions 2 รอบ) → SRS/SDS/API/DATABASE → UX Spec → Tests (101 TC) **ก่อน**เขียนโค้ด. ผลคือ implement 6 units (agent team) แทบไม่มี rework เชิง scope เพราะ decision ถูก lock (D-1..D-11) หมดก่อน. การถาม user เป็นชุด (AskUserQuestion) ก่อน draft PRD ช่วยตัดทาง P&L allocation ที่ผิด (ค่า ads หารลงออเดอร์) ตั้งแต่ต้น.

2. **Agent-team security review จับ CRITICAL vuln ที่ human ปกติจะ merge ข้าม** — `safepay-security` (แยกจาก developer/reviewer) เจอช่องโหว่ cross-shop ที่ **มีมาตั้งแต่ feature 00009** ไม่ใช่ของ feature นี้เอง (ดู Problem 1). reviewer 8-gate ผ่าน MERGE แล้วด้วยซ้ำ — security review ชั้นแยกคือด่านที่จับได้. คุ้มค่ามากที่ไม่ยุบ security เข้า reviewer.

3. **Reviewer จับ integration smell 2 จุดที่ dev แต่ละ unit มองไม่เห็น** (date พ.ศ./ค.ศ. asymmetry, icon prefix) เพราะ review ข้าม unit — dev unit 1 กับ unit 5 ต่างคนต่างถูกในมุมตัวเอง แต่ประกอบกันแล้ว fragile.

4. **Migration บน shared prod/dev DB ปลอดภัย** — hand-written + `migrate deploy` (ไม่ใช่ `migrate dev`), additive-only, verify raw SQL ก่อนใช้ — ไม่แตะข้อมูล prod.

---

## Problems + Root causes

### Problem 1 (CRITICAL, security) — cross-shop `productId` ไม่ scope shopId ใน `createOrder`
- **Evidence:** `src/services/order.service.ts::createOrder` resolve loop เดิม (ก่อน commit `f340fd0d`) รับ `item.productId` จาก client แล้ว push เข้า `resolvedItems` ตรง ๆ โดยไม่เช็ค ownership. cost snapshot query (`tx.product.findMany({ where: { id: { in } } })`) + `deductStockForOrderItems` (`inventory-stock.service.ts`) ทั้งคู่ lookup ด้วย productId ไม่ scope shopId.
- **Impact:** seller เอา productId ของคู่แข่ง (เห็นได้จากหน้าร้าน public `/b/[slug]`) มาสร้างออเดอร์ในร้านตัวเอง → (1) ต้นทุนลับ (`Product.cost`) คู่แข่งรั่วเข้า `OrderItem.cost` → โผล่ใน P&L ตัวเอง กู้ต้นทุนต่อหน่วยได้เป๊ะ; (2) ตัด stock จริงของคู่แข่งได้ + เขียน StockMovement ข้ามร้าน.
- **Root cause:** ช่องโหว่มาจาก **feature 00009** (Inventory) ตอนเพิ่ม stock-deduct — ไม่เคยมีใครตั้งสมมติฐานว่า "client จะส่ง productId ของร้านอื่นมา". feature 00016 มา**ต่อยอด**ช่องนี้ด้วยการเพิ่ม cost snapshot (ข้อมูลลับกว่าเดิม) โดย copy pattern lookup เดิมที่ไม่ scope → ขยาย attack surface. **ราก:** ไม่มี convention บังคับว่า query ที่ key ด้วย client-supplied id ต้อง scope ownership.
- **Fix:** commit `f340fd0d` — `ProductNotInShopError`: validate productId ownership (findMany where shopId) ก่อน tx, foreign → 400 + defense-in-depth scope cost/shippedProduct query. ปิดทั้ง 00016 และ 00009.

### Problem 2 — serialize layer format วันที่เป็น พ.ศ. → wire format asymmetry
- **Evidence:** `serializeExpense()` (`expense.service.ts`) เดิมคืน `expenseDate: formatDate(...)` = พ.ศ. "2569-07-08" แต่ `POST/PATCH/GET expenses` รับ ค.ศ. → dev unit 5A ต้องเขียน `beDateToGregorianIso()` (ลบ 543) ตอน prefill edit form กัน backend รับปี พ.ศ.
- **Root cause:** สับสนระหว่าง "wire format" (API in/out) กับ "display format" (สิ่งที่ user เห็น). `date-format.md` เขียนว่า "field ที่**แสดงผล**ต้องผ่าน formatDate" แต่ dev ตีความเป็น "serialize ต้อง format" → format ที่ layer ผิด.
- **Fix:** commit follow-up — `serializeExpense` คืน ISO ค.ศ. ดิบ (`.toISOString().slice(0,10)`), display พ.ศ. ย้ายไป `ExpenseList.tsx` ตอน render (`formatDate`), ลบ `beDateToGregorianIso`.

### Problem 3 — icon prefix `"tabler-"` ใช้ผิดฝั่ง (Vuexy convention ใน Paces context)
- **Evidence:** `EXPENSE_CATEGORY_ICON` (`lib/expense.ts`) เดิมเก็บ `"tabler-building-store"` (มี prefix) แต่ Paces `@/components/wrappers/Icon` เติม `"tabler:"` ให้เอง → ได้ `"tabler:tabler-xxx"` (invalid). dev unit 5A ต้อง `.replace(/^tabler-/,'')` ตอน render.
- **Root cause:** dev unit 1 อ้าง precedent `badge-icons.ts`/`auction-level.ts` (ซึ่งเป็น **buyer/Vuexy** ที่ consume ผ่าน `@iconify/react` raw — parse hyphen ได้) generalize มาใช้ใน **Paces** ที่ Icon wrapper คนละตัว. ราก: convention icon ต่างกันระหว่าง 2 theme แต่ไม่มีที่ documented ชัด.
- **Fix:** follow-up — `EXPENSE_CATEGORY_ICON` เก็บ bare name (`"building-store"`), ลบ `.replace()`.

---

## Conventions to adopt (actionable)

1. **🛑 Query ที่ key ด้วย client-supplied id ต้อง scope ownership (shopId/userId) ก่อนใช้เสมอ** — โดยเฉพาะ `Product`/`Order`/`Expense` lookup ใน service layer. ห้าม `where: { id: { in: clientIds } }` โดด ๆ; ต้อง `where: { id: { in }, shopId }` หรือ validate ownership ก่อน แล้ว reject (fail-closed) ถ้า id ไม่ใช่ของ scope. → promote เป็น `docs/conventions/query-scope-shopid.md` + memory `feedback_query_scope_client_id`.

2. **Serialize layer คืน wire format คงที่ (ISO ค.ศ.) เท่านั้น — ห้าม format พ.ศ. ที่ service** — `formatDate`/`formatDateTH` เรียกที่ presentation layer (component render) เท่านั้น. `serialize*()` คืน `.toISOString()` (หรือ `.slice(0,10)` สำหรับ date-only). → เพิ่มหมายเหตุใน `docs/conventions/date-format.md`.

3. **Icon ใน `(paces)/**` ใช้ bare tabler name (`"package"`) ไม่ใช่ `"tabler-package"`** — Paces `Icon` wrapper เติม `tabler:` เอง. prefix `"tabler-"` เป็นของ buyer/Vuexy (raw `@iconify/react`) เท่านั้น. → เพิ่มใน `docs/conventions/no-emoji-use-icons.md` (มี icon topic อยู่แล้ว).

4. **Migration บน shared prod/dev DB: hand-written + `migrate deploy` เท่านั้น — ห้าม `migrate dev`** (จะเสนอ reset ลบข้อมูล เพราะ DB มี unmanaged drift). ยืนยัน SQL additive-only + verify raw SQL ก่อน apply. (มี `docs/conventions/prisma-shared-db-drift.md` อยู่แล้ว — anchor ซ้ำ)

---

## Action items

1. ✅ **[DONE]** Security fix cross-shop productId (`f340fd0d`) + security re-verify PASS
2. ✅ **[DONE]** date-format refactor (serialize คืน ISO ค.ศ.) + icon prefix fix + API.md sync
3. ✅ **[DONE]** สร้าง `docs/conventions/query-scope-shopid.md` + memory
4. 🔴 **[TODO — สำคัญ]** E2E QA จริง (Chrome DevTools MCP) — feature merged prod ด้วย tsc+review เท่านั้น ยังไม่เดิน browser. โดยเฉพาะ **smoke test order-create บน prod** (critical path เพิ่งเปลี่ยน — validation ใหม่กระทบทุก seller). 101 TC ใน `Tests/00001-*.md` ยัง Blocked.
5. 🟡 **[TODO]** audit จุดอื่นที่ lookup ด้วย client id ไม่ scope shopId (ตาม convention #1) — เริ่มจาก `order.service.ts:100-109` shippedProduct (fix แล้ว), หา pattern เดียวกันที่อื่น
6. 🟡 **[TODO]** legacy V1 `ProductForm` ไม่มี cost field (เฉพาะ V2) — เพิ่มถ้า V1 ยัง reachable หรือลบ V1
7. 🟡 **[TODO]** Business Package tier gate — ปัจจุบันทุก tier ที่จ่ายเงินปลดล็อกเท่ากัน (D-8); ถ้าธุรกิจอยากจำกัดเฉพาะ tier สูง ต้องแก้ `isCostEditAllowed`/`resolveExpenseAccess`

---

## Process note

feature นี้ใช้ Documentation-First template (`docs/20 - Features/00016/`) แทน scope-baseline S-id doc — commit cite `feat(00016)` + TFR-id ใน SDS §8 (Unit boundary) เป็น scope-trace. ยืนยันแล้วว่ายอมรับได้แทน S-id format สำหรับ feature ที่มาทาง Documentation-First (Hard Rule 11).
