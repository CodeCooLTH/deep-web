# Product types & capabilities — P1+P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม schema/registry/form support สำหรับ product capability flags (fulfillmentMode + billingMode + billingPeriod) ตาม spec `2026-05-10-product-types-capability-design.md`. ครอบคลุม P1 (Schema + Registry SSOT) และ P2 (ProductFormV2 — capability picker). P3-P5 (Order flow + Recurring dashboard + Polish) จะมี plan แยกหลัง P1+P2 ship

**Architecture:**
- Single source of truth: `src/lib/product-types/registry.ts` — TS config-driven, `PRODUCT_TYPES` map พร้อม presets ของ capability flags
- Schema: ขยาย `Product` 4 columns (fulfillmentMode/billingMode/billingPeriod/billingPeriodDays) + data migration map type เดิม (PHYSICAL→SHIPPED, DIGITAL/SERVICE→NO_SHIPPING)
- Form V2: type picker → 4 presets (เพิ่ม SUBSCRIPTION). 2 cards ใหม่ (CapabilityCardV2 collapsed override + BillingPeriodCardV2 conditional). PriceCardV2 label เปลี่ยนตาม billingMode

**Tech Stack:**
- Next.js 16 (App Router, Turbopack)
- Prisma + PostgreSQL 16
- TypeScript strict, Valibot (backend), Yup (frontend)
- React Hook Form 7
- Vitest 3 (tests), Chrome DevTools MCP (E2E QA)

**QA gate (per CLAUDE.md hard rule #4):** ทุก UI task ต้อง smoke-test ผ่าน Chrome DevTools MCP บน `http://seller.deepth.local:4000/products/new-v2` ก่อน mark complete. Phase-end (หลัง task 13) ต้องทำ batch integration test ครบทุก capability combo

**Convention reminders:**
- Hard Rule #1: ทุก UI ใหม่/แก้ ต้อง cite Base ใน commit message (theme file path)
- Hard Rule #3: commit body มี `Base:` line สำหรับ UI changes
- ภาษา commit body + comment WHY = ไทย; identifiers/lib names = อังกฤษ

---

## Phase P1 — Schema + Registry SSOT

### Task 1: Create product type registry (TS config + tests)

**Files:**
- Create: `src/lib/product-types/registry.ts`
- Create: `tests/lib/product-types/registry.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/lib/product-types/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  PRODUCT_TYPES,
  PRODUCT_TYPE_IDS,
  FULFILLMENT_MODES,
  BILLING_MODES,
  BILLING_PERIODS,
  type ProductTypeId,
} from "@/lib/product-types/registry";

describe("product-types/registry", () => {
  it("exposes 4 type presets — PHYSICAL/DIGITAL/SERVICE/SUBSCRIPTION", () => {
    expect(PRODUCT_TYPE_IDS).toEqual(["PHYSICAL", "DIGITAL", "SERVICE", "SUBSCRIPTION"]);
  });

  it("PHYSICAL preset = SHIPPED + ONE_TIME", () => {
    expect(PRODUCT_TYPES.PHYSICAL.defaults).toEqual({
      fulfillmentMode: "SHIPPED",
      billingMode: "ONE_TIME",
    });
  });

  it("DIGITAL preset = NO_SHIPPING + ONE_TIME", () => {
    expect(PRODUCT_TYPES.DIGITAL.defaults).toEqual({
      fulfillmentMode: "NO_SHIPPING",
      billingMode: "ONE_TIME",
    });
  });

  it("SERVICE preset = NO_SHIPPING + ONE_TIME", () => {
    expect(PRODUCT_TYPES.SERVICE.defaults).toEqual({
      fulfillmentMode: "NO_SHIPPING",
      billingMode: "ONE_TIME",
    });
  });

  it("SUBSCRIPTION preset = NO_SHIPPING + RECURRING + MONTHLY", () => {
    expect(PRODUCT_TYPES.SUBSCRIPTION.defaults).toEqual({
      fulfillmentMode: "NO_SHIPPING",
      billingMode: "RECURRING",
      billingPeriod: "MONTHLY",
    });
  });

  it("every preset has emoji + label + ariaLabel + description", () => {
    for (const id of PRODUCT_TYPE_IDS) {
      const meta = PRODUCT_TYPES[id];
      expect(meta.emoji).toBeTruthy();
      expect(meta.label).toBeTruthy();
      expect(meta.ariaLabel).toBeTruthy();
      expect(meta.description).toBeTruthy();
    }
  });

  it("ProductTypeId type accepts only registered ids", () => {
    const valid: ProductTypeId = "PHYSICAL";
    expect(PRODUCT_TYPE_IDS.includes(valid)).toBe(true);
  });

  it("FULFILLMENT_MODES = [SHIPPED, NO_SHIPPING]", () => {
    expect([...FULFILLMENT_MODES]).toEqual(["SHIPPED", "NO_SHIPPING"]);
  });

  it("BILLING_MODES = [ONE_TIME, RECURRING]", () => {
    expect([...BILLING_MODES]).toEqual(["ONE_TIME", "RECURRING"]);
  });

  it("BILLING_PERIODS = [MONTHLY, YEARLY, CUSTOM]", () => {
    expect([...BILLING_PERIODS]).toEqual(["MONTHLY", "YEARLY", "CUSTOM"]);
  });

  it("SUBSCRIPTION has price baseOverride (label + unit)", () => {
    const meta = PRODUCT_TYPES.SUBSCRIPTION;
    expect(meta.baseOverrides?.price?.label).toBeTruthy();
    expect(meta.baseOverrides?.price?.unit).toBe("บาท");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/lib/product-types/registry.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/product-types/registry'`

- [ ] **Step 3: Implement registry**

Create `src/lib/product-types/registry.ts`:

```ts
// Single source of truth สำหรับ product types + capability presets.
// Frontend form, backend validation, type picker, future filter UI ใช้ตัวนี้ทั้งหมด.
// เพิ่ม type ใหม่ = เพิ่ม entry ใน PRODUCT_TYPES (registry pickup auto)

export type FulfillmentMode = "SHIPPED" | "NO_SHIPPING";
export type BillingMode = "ONE_TIME" | "RECURRING";
export type BillingPeriod = "MONTHLY" | "YEARLY" | "CUSTOM";

export type ProductTypeMeta = {
  id: string;
  emoji: string;
  label: string;
  ariaLabel: string;
  description: string;
  defaults: {
    fulfillmentMode: FulfillmentMode;
    billingMode: BillingMode;
    billingPeriod?: BillingPeriod;
  };
  baseOverrides?: Partial<{
    name: { label?: string; placeholder?: string; help?: string };
    price: { label?: string; placeholder?: string; help?: string; unit?: string };
    description: { label?: string; placeholder?: string };
    images: { label?: string; help?: string; required?: boolean };
  }>;
};

export const PRODUCT_TYPES = {
  PHYSICAL: {
    id: "PHYSICAL",
    emoji: "📦",
    label: "ของจริง",
    ariaLabel: "สินค้าต้องจัดส่ง",
    description: "ส่งของจริงให้ลูกค้า",
    defaults: { fulfillmentMode: "SHIPPED", billingMode: "ONE_TIME" },
  },
  DIGITAL: {
    id: "DIGITAL",
    emoji: "💻",
    label: "ดิจิทัล",
    ariaLabel: "สินค้าดิจิทัล",
    description: "ส่งเป็นไฟล์ ลิงก์ หรือโค้ด",
    defaults: { fulfillmentMode: "NO_SHIPPING", billingMode: "ONE_TIME" },
  },
  SERVICE: {
    id: "SERVICE",
    emoji: "🛠️",
    label: "บริการ",
    ariaLabel: "การให้บริการ",
    description: "งานบริการ ทำให้ลูกค้าครั้งเดียว",
    defaults: { fulfillmentMode: "NO_SHIPPING", billingMode: "ONE_TIME" },
  },
  SUBSCRIPTION: {
    id: "SUBSCRIPTION",
    emoji: "🔁",
    label: "สมาชิก/รอบ",
    ariaLabel: "บริการเป็นรอบหรือสมาชิก",
    description: "เก็บเงินเป็นรอบ — ประกัน, สมาชิก, ค่าบริการรายเดือน",
    defaults: {
      fulfillmentMode: "NO_SHIPPING",
      billingMode: "RECURRING",
      billingPeriod: "MONTHLY",
    },
    baseOverrides: {
      price: {
        label: "ค่าบริการต่อรอบ",
        unit: "บาท",
        help: "จะเปลี่ยนเป็น บาท/เดือน หรือ บาท/ปี ตามรอบที่เลือก",
      },
    },
  },
} as const satisfies Record<string, ProductTypeMeta>;

export type ProductTypeId = keyof typeof PRODUCT_TYPES;
export const PRODUCT_TYPE_IDS = Object.keys(PRODUCT_TYPES) as ProductTypeId[];

export const FULFILLMENT_MODES = ["SHIPPED", "NO_SHIPPING"] as const;
export const BILLING_MODES = ["ONE_TIME", "RECURRING"] as const;
export const BILLING_PERIODS = ["MONTHLY", "YEARLY", "CUSTOM"] as const;

/**
 * deriveCapabilityDefaults — คืน capability flags default ของ type ที่ระบุ.
 * ใช้ใน form ตอน user เลือก type → set fulfillmentMode/billingMode auto.
 */
export function deriveCapabilityDefaults(typeId: ProductTypeId) {
  const meta = PRODUCT_TYPES[typeId];
  return {
    fulfillmentMode: meta.defaults.fulfillmentMode,
    billingMode: meta.defaults.billingMode,
    billingPeriod: meta.defaults.billingPeriod ?? null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/lib/product-types/registry.test.ts
```
Expected: 10 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/product-types/registry.ts tests/lib/product-types/registry.test.ts
git commit -m "$(cat <<'EOF'
feat(product-types): registry SSOT — 4 presets + capability defaults

Base: docs/superpowers/specs/2026-05-10-product-types-capability-design.md
สร้าง src/lib/product-types/registry.ts เป็น single source ของ type meta +
capability presets. Frontend, backend, picker จะ derive จากที่นี่.
4 presets: PHYSICAL, DIGITAL, SERVICE, SUBSCRIPTION (ใหม่).
EOF
)"
```

---

### Task 2: Update validations.ts to use registry

**Files:**
- Modify: `src/lib/validations.ts:33,66,101` (replace hardcoded picklist + add capability fields)

- [ ] **Step 1: Modify validations.ts — import registry + replace picklist**

Edit `src/lib/validations.ts` — เพิ่ม import + แก้ schemas:

```ts
import * as v from "valibot";
import {
  PRODUCT_TYPE_IDS,
  FULFILLMENT_MODES,
  BILLING_MODES,
  BILLING_PERIODS,
} from "@/lib/product-types/registry";

// ... (ของเดิมจนถึง CreateProductSchema)

// CapabilityFieldsSchema — ใช้ซ้ำใน Product create/update
const CapabilityFieldsSchema = {
  fulfillmentMode: v.optional(v.picklist([...FULFILLMENT_MODES])),
  billingMode: v.optional(v.picklist([...BILLING_MODES])),
  billingPeriod: v.optional(v.nullable(v.picklist([...BILLING_PERIODS]))),
  billingPeriodDays: v.optional(
    v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(365))),
  ),
};

export const CreateProductSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  description: v.optional(v.pipe(v.string(), v.maxLength(5000))),
  shortDescription: v.optional(v.pipe(v.string(), v.maxLength(200))),
  price: v.pipe(v.number(), v.minValue(0.01)),
  // type — derive จาก registry (replaces hardcoded picklist)
  type: v.picklist(PRODUCT_TYPE_IDS),
  images: v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
      v.maxLength(10),
    ),
    [],
  ),
  tags: v.optional(
    v.pipe(v.array(TagNameSchema), v.maxLength(10)),
    [],
  ),
  attributes: v.optional(
    v.record(
      v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
      v.pipe(v.string(), v.maxLength(200)),
    ),
    {},
  ),
  ...CapabilityFieldsSchema,
});

export const UpdateProductSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
  description: v.optional(v.pipe(v.string(), v.maxLength(5000))),
  shortDescription: v.optional(v.pipe(v.string(), v.maxLength(200))),
  price: v.optional(v.pipe(v.number(), v.minValue(0.01))),
  // type — derive จาก registry (replaces hardcoded picklist)
  type: v.optional(v.picklist(PRODUCT_TYPE_IDS)),
  images: v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
      v.maxLength(10),
    ),
  ),
  tags: v.optional(v.pipe(v.array(TagNameSchema), v.maxLength(10))),
  attributes: v.optional(
    v.record(
      v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
      v.pipe(v.string(), v.maxLength(200)),
    ),
  ),
  isActive: v.optional(v.boolean()),
  ...CapabilityFieldsSchema,
});
```

ส่วน `CreateOrderSchema.type` (line 101) ขยายเป็น registry ด้วยเพื่อ consistency (ยังไม่เพิ่ม capability fields ที่ Order — รอ P3):

```ts
export const CreateOrderSchema = v.object({
  items: v.pipe(
    v.array(v.object({
      productId: v.optional(v.pipe(v.string(), v.uuid())),
      name: v.pipe(v.string(), v.minLength(1)),
      description: v.optional(v.string()),
      qty: v.pipe(v.number(), v.integer(), v.minValue(1)),
      price: v.pipe(v.number(), v.minValue(0.01)),
    })),
    v.minLength(1),
  ),
  type: v.picklist(PRODUCT_TYPE_IDS),
});
```

- [ ] **Step 2: Verify type-check**

```bash
pnpm tsc --noEmit
```
Expected: no errors related to validations.ts

- [ ] **Step 3: Run existing service tests to verify no regression**

```bash
pnpm vitest run tests/services/
```
Expected: all PASS (capability fields เป็น optional → ไม่ break ของเก่า)

- [ ] **Step 4: Commit**

```bash
git add src/lib/validations.ts
git commit -m "$(cat <<'EOF'
refactor(validations): derive product type list from registry SSOT

Base: src/lib/product-types/registry.ts
ลบ hardcoded ['PHYSICAL','DIGITAL','SERVICE'] ใน CreateProductSchema /
UpdateProductSchema / CreateOrderSchema → ใช้ PRODUCT_TYPE_IDS จาก registry.
เพิ่ม optional capability fields (fulfillmentMode/billingMode/billingPeriod
/billingPeriodDays) ใน CreateProductSchema + UpdateProductSchema.
SUBSCRIPTION type ใช้งานได้แล้วใน API contract.
EOF
)"
```

---

### Task 3: Add Prisma columns + migration

**Files:**
- Modify: `prisma/schema.prisma` (Product model)
- Create: `prisma/migrations/<timestamp>_add_product_capability_flags/migration.sql`

- [ ] **Step 1: Edit schema.prisma — add 4 columns to Product**

Edit `prisma/schema.prisma` model `Product` (after `type` field, before `isActive`):

```prisma
model Product {
  id               String   @id @default(uuid())
  shopId           String
  name             String
  description      String?  @db.Text
  shortDescription String?  @db.VarChar(200)
  attributes       Json     @default("{}")
  price            Decimal  @db.Decimal(12, 2)
  images           Json     @default("[]")
  type             String   @default("PHYSICAL")
  // capability flags (P1 — spec 2026-05-10)
  fulfillmentMode  String   @default("SHIPPED")
  billingMode      String   @default("ONE_TIME")
  billingPeriod    String?
  billingPeriodDays Int?
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  shop       Shop        @relation(fields: [shopId], references: [id], onDelete: Cascade)
  orderItems OrderItem[]
  tags       Tag[]
}
```

- [ ] **Step 2: Generate migration**

```bash
pnpm prisma migrate dev --name add_product_capability_flags --create-only
```
Expected: ไฟล์ migration ใหม่ใน `prisma/migrations/<timestamp>_add_product_capability_flags/migration.sql`

- [ ] **Step 3: Append data migration SQL ลงท้ายไฟล์ migration**

แก้ไฟล์ migration เพิ่ม UPDATE statements ท้ายไฟล์:

```sql
-- Data migration: map type เดิม → capability flags ที่สื่อ semantic ตรง
-- (column default = SHIPPED+ONE_TIME สำหรับ row ใหม่ — แต่ของเก่า DIGITAL/SERVICE
-- ควรเป็น NO_SHIPPING)
UPDATE "Product" SET "fulfillmentMode" = 'NO_SHIPPING'
  WHERE "type" IN ('DIGITAL', 'SERVICE');
```

- [ ] **Step 4: Apply migration**

```bash
pnpm prisma migrate dev
pnpm prisma generate
```
Expected: migration applied; prisma client regenerated

- [ ] **Step 5: Verify in DB**

```bash
docker exec postgres15-dev psql -U safepay -d safepay -c "
SELECT type, \"fulfillmentMode\", \"billingMode\", count(*) 
FROM \"Product\" GROUP BY 1,2,3 ORDER BY 1;
"
```
Expected: PHYSICAL → SHIPPED+ONE_TIME; DIGITAL/SERVICE → NO_SHIPPING+ONE_TIME

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "$(cat <<'EOF'
feat(db): add product capability flags + data migration

Base: docs/superpowers/specs/2026-05-10-product-types-capability-design.md
Product เพิ่ม fulfillmentMode/billingMode/billingPeriod/billingPeriodDays.
Default = SHIPPED+ONE_TIME สำหรับ row ใหม่. Data migration map type เดิม:
DIGITAL/SERVICE → NO_SHIPPING (PHYSICAL คงเป็น SHIPPED ตาม default).
EOF
)"
```

---

### Task 4: Update product.service.ts — extend SerializedProduct + DTOs

**Files:**
- Modify: `src/services/product.service.ts:98-112` (SerializedProduct), `:120-139` (serializeProduct), `:145-154` (CreateProductInput), `:163-199` (createProduct), `:201-211` (UpdateProductInput), `:228-286` (updateProduct)

- [ ] **Step 1: Extend SerializedProduct interface (line ~98)**

Edit `src/services/product.service.ts` — replace `SerializedProduct` interface:

```ts
export interface SerializedProduct {
  id: string;
  shopId: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  attributes: Record<string, string>;
  price: number;
  images: string[];
  type: string;
  // capability flags (P1)
  fulfillmentMode: string;
  billingMode: string;
  billingPeriod: string | null;
  billingPeriodDays: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  tags: { id: string; name: string; slug: string }[];
}
```

- [ ] **Step 2: Update serializeProduct (line ~120)**

แทนที่ตัว body ของ serializeProduct เพิ่ม capability fields:

```ts
export function serializeProduct(product: ProductWithTags): SerializedProduct {
  return {
    id: product.id,
    shopId: product.shopId,
    name: product.name,
    description: product.description,
    shortDescription: product.shortDescription,
    attributes:
      product.attributes && typeof product.attributes === "object" && !Array.isArray(product.attributes)
        ? (product.attributes as Record<string, string>)
        : {},
    price: Number(product.price),
    images: Array.isArray(product.images) ? (product.images as string[]) : [],
    type: product.type,
    fulfillmentMode: product.fulfillmentMode,
    billingMode: product.billingMode,
    billingPeriod: product.billingPeriod,
    billingPeriodDays: product.billingPeriodDays,
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    tags: product.tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
  };
}
```

- [ ] **Step 3: Extend CreateProductInput (line ~145)**

```ts
export interface CreateProductInput {
  name: string;
  description?: string;
  shortDescription?: string;
  price: number;
  type: string;
  images?: string[];
  tags?: string[];
  attributes?: Record<string, string>;
  // capability flags (P1) — optional in input; service สนำใช้ default จาก registry ถ้าไม่ส่ง
  fulfillmentMode?: string;
  billingMode?: string;
  billingPeriod?: string | null;
  billingPeriodDays?: number | null;
}
```

- [ ] **Step 4: Update createProduct to persist capability fields (line ~163)**

ใน `createProduct`, แก้ `data` block ใน `prisma.product.create`:

```ts
  const created = await prisma.product.create({
    data: {
      shopId,
      name: data.name,
      description: data.description ?? null,
      shortDescription: data.shortDescription ?? null,
      price: data.price,
      type: data.type,
      images: (data.images ?? []) as Prisma.InputJsonValue,
      attributes: (data.attributes ?? {}) as Prisma.InputJsonValue,
      // capability flags — ถ้า input ไม่ส่งมา ปล่อย Prisma ใช้ column default
      ...(data.fulfillmentMode !== undefined && { fulfillmentMode: data.fulfillmentMode }),
      ...(data.billingMode !== undefined && { billingMode: data.billingMode }),
      ...(data.billingPeriod !== undefined && { billingPeriod: data.billingPeriod }),
      ...(data.billingPeriodDays !== undefined && { billingPeriodDays: data.billingPeriodDays }),
      tags: uniqueTagNames.length
        ? {
            connectOrCreate: uniqueTagNames.map((name) => ({
              where: { name },
              create: { name, slug: slugify(name) || name },
            })),
          }
        : undefined,
    },
    include: { tags: true },
  });
```

- [ ] **Step 5: Extend UpdateProductInput (line ~201)**

```ts
export interface UpdateProductInput {
  name?: string;
  description?: string;
  shortDescription?: string;
  price?: number;
  type?: string;
  images?: string[];
  tags?: string[];
  attributes?: Record<string, string>;
  isActive?: boolean;
  // capability flags (P1)
  fulfillmentMode?: string;
  billingMode?: string;
  billingPeriod?: string | null;
  billingPeriodDays?: number | null;
}
```

- [ ] **Step 6: Update updateProduct scalar payload (line ~230)**

ใน `updateProduct`, ใต้ list ของ `if (data.X !== undefined) scalarUpdate.X = ...` เพิ่ม:

```ts
  if (data.fulfillmentMode !== undefined) scalarUpdate.fulfillmentMode = data.fulfillmentMode;
  if (data.billingMode !== undefined) scalarUpdate.billingMode = data.billingMode;
  if (data.billingPeriod !== undefined) scalarUpdate.billingPeriod = data.billingPeriod;
  if (data.billingPeriodDays !== undefined) scalarUpdate.billingPeriodDays = data.billingPeriodDays;
```

- [ ] **Step 7: Type-check + run service tests**

```bash
pnpm tsc --noEmit
pnpm vitest run tests/services/
```
Expected: no type errors; all service tests still pass

- [ ] **Step 8: Commit**

```bash
git add src/services/product.service.ts
git commit -m "$(cat <<'EOF'
feat(product.service): persist + serialize capability flags

Base: prisma/schema.prisma (Product model — Task 3)
SerializedProduct + CreateProductInput + UpdateProductInput เพิ่ม 4 fields:
fulfillmentMode/billingMode/billingPeriod/billingPeriodDays. createProduct
และ updateProduct passthrough ลง DB. Optional input → ใช้ column default.
EOF
)"
```

---

### Task 5: Update product API routes

**Files:**
- Modify: `src/app/api/products/route.ts` (POST handler — pass capability fields)
- Modify: `src/app/api/products/[id]/route.ts` (PATCH handler — pass capability fields)

- [ ] **Step 1: Read current PATCH handler**

```bash
cat src/app/api/products/\[id\]/route.ts
```
ตรวจดู signature + ปัจจุบันส่ง field ใดบ้าง

- [ ] **Step 2: Verify POST passthrough — `parsed.output` ครบ**

ดู `src/app/api/products/route.ts:35` — `createProduct(shop.id, parsed.output)`. CreateProductSchema (Task 2) ขยายแล้วรับ capability fields → `parsed.output` มีครบ; service (Task 4) consume แล้ว → **POST ไม่ต้องแก้** เพิ่ม

- [ ] **Step 3: Verify PATCH passthrough**

อ่าน `src/app/api/products/[id]/route.ts` — ถ้าใช้ pattern `updateProduct(id, parsed.output)` เหมือน POST → ไม่ต้องแก้. ถ้า manual whitelist field → เพิ่ม fulfillmentMode/billingMode/billingPeriod/billingPeriodDays ใน whitelist

ถ้า PATCH route ใช้ explicit field whitelist เช่น:
```ts
await updateProduct(id, {
  name: parsed.output.name,
  price: parsed.output.price,
  // ...
});
```
→ เพิ่ม:
```ts
  fulfillmentMode: parsed.output.fulfillmentMode,
  billingMode: parsed.output.billingMode,
  billingPeriod: parsed.output.billingPeriod,
  billingPeriodDays: parsed.output.billingPeriodDays,
```

- [ ] **Step 4: Manual smoke test — POST ส่ง SUBSCRIPTION**

ขณะ dev server รันอยู่ (user start เอง):

```bash
# สมมติ session cookie อยู่แล้ว — ใช้ http test ของจริงผ่าน chrome devtools MCP ก็ได้
# ตรงนี้แค่ verify endpoint ไม่ 400 ต่อ payload ที่มี capability fields
curl -X POST http://seller.deepth.local:4000/api/products \
  -H "Content-Type: application/json" \
  -H "Cookie: $(cat /tmp/seller-cookie 2>/dev/null || echo 'next-auth.session-token=...')" \
  -d '{
    "name":"Test Sub","price":299,"type":"SUBSCRIPTION",
    "fulfillmentMode":"NO_SHIPPING","billingMode":"RECURRING","billingPeriod":"MONTHLY"
  }' | head -50
```
Expected: status 201 + product object ที่ response มี capability fields ครบ

ถ้าไม่ทำได้ผ่าน curl (ปัญหา auth) → skip step นี้, ไปทำใน QA Task 13 ผ่าน Chrome DevTools MCP

- [ ] **Step 5: Commit**

```bash
git add src/app/api/products/
git commit -m "$(cat <<'EOF'
feat(api/products): accept capability fields in POST/PATCH

Base: src/lib/validations.ts (CreateProductSchema/UpdateProductSchema — Task 2)
API routes รับ + persist fulfillmentMode/billingMode/billingPeriod/
billingPeriodDays. ใช้ Valibot schema ที่ขยาย → pass-through service.
EOF
)"
```

---

## Phase P2 — ProductFormV2 Capability Picker

### Task 6: Extend ProductFormV2.types.ts

**Files:**
- Modify: `src/app/(paces)/seller/(dashboard)/products/components/ProductFormV2.types.ts`

- [ ] **Step 1: Replace contents of file**

```ts
import type {
  ProductTypeId,
  FulfillmentMode,
  BillingMode,
  BillingPeriod,
} from "@/lib/product-types/registry";

// ลบ ProductTypeV2 ที่ hardcoded — ใช้ ProductTypeId จาก registry แทน
export type ProductTypeV2 = ProductTypeId;

export type ProductFormV2Values = {
  name: string;
  shortDescription: string;
  description: string;
  price: number;
  type: ProductTypeV2;
  images: string[];
  tags: string[];
  attributes: Record<string, string>;
  // capability flags (P2)
  fulfillmentMode: FulfillmentMode;
  billingMode: BillingMode;
  // null ใน RHF state แทน undefined เพื่อให้ Yup nullable() ทำงานตรง
  billingPeriod: BillingPeriod | null;
  billingPeriodDays: number | null;
};
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit
```
Expected: errors ใน ProductFormV2.tsx + ProductTypePickerCardV2.tsx + ProductPreviewPanel.tsx (เพราะ defaultValues / consumer ยังไม่มี capability fields) — จะแก้ใน task ถัดไป. **ไม่ commit ตอนนี้**, รวมกับ task 7+ ที่จะแก้ผู้ consume

- [ ] **Step 3: ระบุไว้ — ยังไม่ commit จนกว่า task 11 จะ wire ครบ**

---

### Task 7: Update ProductTypePickerCardV2 — registry-driven + 4 options + sync capability

**Files:**
- Modify: `src/app/(paces)/seller/(dashboard)/products/components/ProductTypePickerCardV2.tsx`

- [ ] **Step 1: Replace contents**

```tsx
'use client'

// Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
//   line 355-381 (Radio Toggle — peer hidden + <label className="btn ...peer-checked:bg-primary">)
// Layout: marketplace-style segmented control — inline pills, scroll-x
// Options derive จาก registry — เพิ่ม type ใหม่ใน registry → picker pickup auto

import type { UseFormRegister, FieldErrors, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import { useEffect, useRef } from 'react'
import {
  PRODUCT_TYPES,
  PRODUCT_TYPE_IDS,
  deriveCapabilityDefaults,
} from '@/lib/product-types/registry'
import type { ProductFormV2Values } from './ProductFormV2.types'

interface ProductTypePickerCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
  setValue: UseFormSetValue<ProductFormV2Values>
  watch: UseFormWatch<ProductFormV2Values>
}

export default function ProductTypePickerCardV2({
  register,
  errors,
  setValue,
  watch,
}: ProductTypePickerCardV2Props) {
  // Sync capability flags เมื่อ user เปลี่ยน type — set defaults จาก registry.
  // Use case: user เลือก SUBSCRIPTION → fulfillmentMode auto NO_SHIPPING + billingMode RECURRING.
  // user เปลี่ยน manual ใน CapabilityCardV2 ภายหลังได้ — code นี้ trigger เฉพาะตอน type change.
  const type = watch('type')
  const lastSyncedType = useRef(type)
  useEffect(() => {
    if (type !== lastSyncedType.current) {
      const caps = deriveCapabilityDefaults(type)
      setValue('fulfillmentMode', caps.fulfillmentMode, { shouldDirty: true })
      setValue('billingMode', caps.billingMode, { shouldDirty: true })
      setValue('billingPeriod', caps.billingPeriod, { shouldDirty: true })
      lastSyncedType.current = type
    }
  }, [type, setValue])

  return (
    <div className="px-3 py-2.5">
      <div className="-mx-3 overflow-x-auto px-3">
        <div className="flex w-max items-center gap-1.5">
          {PRODUCT_TYPE_IDS.map((id) => {
            const meta = PRODUCT_TYPES[id]
            const elemId = `v2-type-${id.toLowerCase()}`
            return (
              <div key={id}>
                <input
                  type="radio"
                  id={elemId}
                  value={id}
                  className="peer hidden"
                  {...register('type')}
                />
                <label
                  htmlFor={elemId}
                  aria-label={meta.ariaLabel}
                  title={meta.ariaLabel}
                  className="btn btn-xs border-default-300 text-default-700 peer-checked:bg-primary peer-checked:border-primary cursor-pointer min-h-9 rounded-full px-3 text-xs peer-checked:text-white"
                >
                  <span className="mr-1">{meta.emoji}</span>
                  {meta.label}
                </label>
              </div>
            )
          })}
        </div>
      </div>
      {errors.type && <p className="text-danger mt-1 text-sm">{errors.type.message}</p>}
    </div>
  )
}
```

- [ ] **Step 2: ตรวจ — นี่ไม่ commit จนกว่า task 11**

ProductFormV2.tsx เก่ายังส่งแค่ `{ register, errors }` — type-check จะ error จนกว่า task 11. คงไว้แค่ saved state รอ wire

---

### Task 8: Create ProductCapabilityCardV2 (collapsed advanced override)

**Files:**
- Create: `src/app/(paces)/seller/(dashboard)/products/components/ProductCapabilityCardV2.tsx`

- [ ] **Step 1: Create file**

```tsx
'use client'

// Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
//   line 355-381 (Radio Toggle pattern — peer hidden + label.btn)
// Base: theme/paces/Admin/TS/src/app/(admin)/components/accordion/page.tsx
//   (Preline data-hs-collapse pattern — แต่ control ด้วย React state แทน
//    เพื่อกัน hydration race เหมือนที่ทำใน ProductDescriptionCardV2)
// "ตั้งค่าขั้นสูง" — ป้าๆ ใช้ default จาก type pickerได้, advanced user override

import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import { useState } from 'react'
import { FULFILLMENT_MODES, BILLING_MODES } from '@/lib/product-types/registry'
import type { ProductFormV2Values } from './ProductFormV2.types'

interface ProductCapabilityCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
}

const FULFILLMENT_LABEL: Record<string, string> = {
  SHIPPED: 'ต้องจัดส่ง',
  NO_SHIPPING: 'ไม่ต้องจัดส่ง',
}
const BILLING_LABEL: Record<string, string> = {
  ONE_TIME: 'จ่ายครั้งเดียว',
  RECURRING: 'เก็บเป็นรอบ',
}

export default function ProductCapabilityCardV2({
  register,
  errors,
}: ProductCapabilityCardV2Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="px-3 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-default-700 hover:text-dark inline-flex items-center gap-1.5 text-xs font-medium"
        aria-expanded={open}
        aria-controls="v2-capability-panel"
      >
        <span className="text-base leading-none">⚙️</span>
        ตั้งค่าขั้นสูง
        <span className="text-default-400">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div id="v2-capability-panel" className="mt-3 space-y-3">
          <fieldset>
            <legend className="text-default-700 mb-1.5 text-xs font-semibold">การจัดส่ง</legend>
            <div className="flex flex-wrap items-center gap-1.5">
              {FULFILLMENT_MODES.map((mode) => {
                const elemId = `v2-fulfillment-${mode.toLowerCase()}`
                return (
                  <div key={mode}>
                    <input
                      type="radio"
                      id={elemId}
                      value={mode}
                      className="peer hidden"
                      {...register('fulfillmentMode')}
                    />
                    <label
                      htmlFor={elemId}
                      className="btn btn-xs border-default-300 text-default-700 peer-checked:bg-primary peer-checked:border-primary cursor-pointer min-h-8 rounded-full px-2.5 text-xs peer-checked:text-white"
                    >
                      {FULFILLMENT_LABEL[mode]}
                    </label>
                  </div>
                )
              })}
            </div>
            {errors.fulfillmentMode && (
              <p className="text-danger mt-1 text-sm">{errors.fulfillmentMode.message}</p>
            )}
          </fieldset>

          <fieldset>
            <legend className="text-default-700 mb-1.5 text-xs font-semibold">การเก็บเงิน</legend>
            <div className="flex flex-wrap items-center gap-1.5">
              {BILLING_MODES.map((mode) => {
                const elemId = `v2-billing-${mode.toLowerCase()}`
                return (
                  <div key={mode}>
                    <input
                      type="radio"
                      id={elemId}
                      value={mode}
                      className="peer hidden"
                      {...register('billingMode')}
                    />
                    <label
                      htmlFor={elemId}
                      className="btn btn-xs border-default-300 text-default-700 peer-checked:bg-primary peer-checked:border-primary cursor-pointer min-h-8 rounded-full px-2.5 text-xs peer-checked:text-white"
                    >
                      {BILLING_LABEL[mode]}
                    </label>
                  </div>
                )
              })}
            </div>
            {errors.billingMode && (
              <p className="text-danger mt-1 text-sm">{errors.billingMode.message}</p>
            )}
          </fieldset>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: ระบุไว้ — wire + commit ใน task 11**

---

### Task 9: Create ProductBillingPeriodCardV2 (conditional)

**Files:**
- Create: `src/app/(paces)/seller/(dashboard)/products/components/ProductBillingPeriodCardV2.tsx`

- [ ] **Step 1: Create file**

```tsx
'use client'

// Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
//   line 355-381 (Radio Toggle pattern)
// Conditional render — แสดงเฉพาะเมื่อ billingMode === 'RECURRING'

import type { UseFormRegister, FieldErrors, UseFormWatch } from 'react-hook-form'
import { BILLING_PERIODS } from '@/lib/product-types/registry'
import type { ProductFormV2Values } from './ProductFormV2.types'

interface ProductBillingPeriodCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
  watch: UseFormWatch<ProductFormV2Values>
}

const PERIOD_LABEL: Record<string, string> = {
  MONTHLY: 'รายเดือน',
  YEARLY: 'รายปี',
  CUSTOM: 'กำหนดเอง',
}

export default function ProductBillingPeriodCardV2({
  register,
  errors,
  watch,
}: ProductBillingPeriodCardV2Props) {
  const billingMode = watch('billingMode')
  const billingPeriod = watch('billingPeriod')

  if (billingMode !== 'RECURRING') return null

  return (
    <div className="px-3 py-2.5">
      <fieldset>
        <legend className="text-default-700 mb-1.5 text-xs font-semibold">รอบเก็บเงิน</legend>
        <div className="flex flex-wrap items-center gap-1.5">
          {BILLING_PERIODS.map((period) => {
            const elemId = `v2-period-${period.toLowerCase()}`
            return (
              <div key={period}>
                <input
                  type="radio"
                  id={elemId}
                  value={period}
                  className="peer hidden"
                  {...register('billingPeriod')}
                />
                <label
                  htmlFor={elemId}
                  className="btn btn-xs border-default-300 text-default-700 peer-checked:bg-primary peer-checked:border-primary cursor-pointer min-h-8 rounded-full px-2.5 text-xs peer-checked:text-white"
                >
                  {PERIOD_LABEL[period]}
                </label>
              </div>
            )
          })}
        </div>
        {errors.billingPeriod && (
          <p className="text-danger mt-1 text-sm">{errors.billingPeriod.message}</p>
        )}
      </fieldset>

      {billingPeriod === 'CUSTOM' && (
        <div className="mt-3">
          <label htmlFor="v2-period-days" className="text-default-700 mb-1 block text-xs font-semibold">
            ทุกๆ กี่วัน
          </label>
          <input
            id="v2-period-days"
            type="number"
            min="1"
            max="365"
            inputMode="numeric"
            {...register('billingPeriodDays', { valueAsNumber: true })}
            className="border-default-300 focus:border-primary block w-32 rounded-md border bg-white px-3 py-2 text-base outline-hidden focus:ring-0"
            placeholder="เช่น 7"
          />
          {errors.billingPeriodDays && (
            <p className="text-danger mt-1 text-sm">{errors.billingPeriodDays.message}</p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: ระบุไว้ — wire + commit ใน task 11**

---

### Task 10: Update ProductPriceCardV2 — label ตาม billingMode

**Files:**
- Modify: `src/app/(paces)/seller/(dashboard)/products/components/ProductPriceCardV2.tsx`

- [ ] **Step 1: Add watch prop + dynamic placeholder/label**

แก้ `ProductPriceCardV2.tsx` — เพิ่ม `watch` prop และเปลี่ยน placeholder ตาม billingMode + billingPeriod:

```tsx
'use client'

// Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
//   line 322-381 (peer hidden + label.btn + peer-checked:bg-primary toggle pattern — quick-pick chips)
// Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputGroup.tsx
//   line 35-40 (input-group + input-group-text pattern — แต่ override เป็น inline borderless)
// Layout override: marketplace-style — ฿ inline, ไม่มี label, chips เล็ก scrollable
// P2: placeholder + sr-only label เปลี่ยนตาม billingMode + billingPeriod (registry-aware)

import type { UseFormRegister, FieldErrors, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import { useState } from 'react'
import type { ProductFormV2Values } from './ProductFormV2.types'

const QUICK_PICK_PRICES = [49, 99, 199, 299, 499, 999] as const

interface ProductPriceCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
  setValue: UseFormSetValue<ProductFormV2Values>
  watch: UseFormWatch<ProductFormV2Values>
}

function derivePriceCopy(
  billingMode: ProductFormV2Values['billingMode'],
  billingPeriod: ProductFormV2Values['billingPeriod'],
): { srLabel: string; placeholder: string } {
  if (billingMode === 'RECURRING') {
    if (billingPeriod === 'MONTHLY') return { srLabel: 'ค่าบริการ บาทต่อเดือน', placeholder: 'ค่าบริการ/เดือน*' }
    if (billingPeriod === 'YEARLY') return { srLabel: 'ค่าบริการ บาทต่อปี', placeholder: 'ค่าบริการ/ปี*' }
    return { srLabel: 'ค่าบริการต่อรอบ บาท', placeholder: 'ค่าบริการ/รอบ*' }
  }
  return { srLabel: 'ราคา บาท', placeholder: 'ราคา*' }
}

export default function ProductPriceCardV2({
  register,
  errors,
  setValue,
  watch,
}: ProductPriceCardV2Props) {
  const [selectedChip, setSelectedChip] = useState<number | null>(null)

  const handleChipClick = (price: number) => {
    setSelectedChip(price)
    setValue('price', price, { shouldValidate: true, shouldTouch: true })
  }

  const priceField = register('price', { valueAsNumber: true })
  const { srLabel, placeholder } = derivePriceCopy(watch('billingMode'), watch('billingPeriod'))

  return (
    <div className="px-3 py-2.5">
      <label htmlFor="v2-price" className="sr-only">
        {srLabel}
      </label>
      <div className="flex items-center gap-1">
        <span className="text-dark text-base font-bold">฿</span>
        <input
          id="v2-price"
          type="number"
          step="0.01"
          min="0.01"
          inputMode="decimal"
          className="text-dark placeholder:text-default-400 focus:border-primary block w-full min-h-11 border-0 border-b-2 border-transparent bg-transparent px-0 text-base font-medium outline-hidden focus:ring-0"
          placeholder={placeholder}
          aria-describedby={errors.price ? 'v2-price-error' : undefined}
          {...priceField}
          onChange={(e) => {
            priceField.onChange(e)
            if (selectedChip !== null) setSelectedChip(null)
          }}
        />
      </div>
      {errors.price && (
        <p id="v2-price-error" className="text-danger mt-1 text-sm">
          {errors.price.message}
        </p>
      )}

      <div className="-mx-3 mt-2 overflow-x-auto px-3 pb-1">
        <div className="flex w-max items-center gap-1.5">
          {QUICK_PICK_PRICES.map((price) => {
            const id = `v2-chip-${price}`
            const checked = selectedChip === price
            return (
              <div key={price}>
                <input
                  type="radio"
                  name="v2-price-chip"
                  id={id}
                  value={price}
                  checked={checked}
                  onChange={() => handleChipClick(price)}
                  className="peer hidden"
                />
                <label
                  htmlFor={id}
                  className="btn btn-xs border-default-300 text-default-700 peer-checked:bg-primary peer-checked:border-primary cursor-pointer min-h-8 rounded-full px-2.5 text-xs peer-checked:text-white"
                >
                  ฿{price}
                </label>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: ระบุไว้ — wire + commit ใน task 11**

---

### Task 11: Wire all new + modified cards into ProductFormV2

**Files:**
- Modify: `src/app/(paces)/seller/(dashboard)/products/components/ProductFormV2.tsx` (Yup schema, defaultValues, body, render flow)

- [ ] **Step 1: Update imports + Yup schema**

ที่หัวไฟล์ — แทนที่ block import เดิม + Yup schema:

```tsx
import { yupResolver } from '@hookform/resolvers/yup'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import * as Yup from 'yup'
import {
  PRODUCT_TYPE_IDS,
  FULFILLMENT_MODES,
  BILLING_MODES,
  BILLING_PERIODS,
} from '@/lib/product-types/registry'
import ProductImagesCardV2 from './ProductImagesCardV2'
import ProductBasicCardV2 from './ProductBasicCardV2'
import ProductShortDescCardV2 from './ProductShortDescCardV2'
import ProductPriceCardV2 from './ProductPriceCardV2'
import ProductTypePickerCardV2 from './ProductTypePickerCardV2'
import ProductCapabilityCardV2 from './ProductCapabilityCardV2'
import ProductBillingPeriodCardV2 from './ProductBillingPeriodCardV2'
import ProductTagsCardV2 from './ProductTagsCardV2'
import ProductAttributesCardV2 from './ProductAttributesCardV2'
import ProductDescriptionCardV2 from './ProductDescriptionCardV2'
import ProductPreviewPanel from './ProductPreviewPanel'
import type { ProductFormV2Values } from './ProductFormV2.types'
import type { SerializedProduct } from '@/services/product.service'

// schema — error messages ภาษาคน ตาม Copy deck
// description ขยายเป็น 5000 ตาม validations.ts
const schema = Yup.object({
  name: Yup.string()
    .min(2, 'ชื่อสั้นไป ใส่อย่างน้อย 2 ตัวอักษร')
    .max(200, 'ชื่อยาวเกินไป (ไม่เกิน 200 ตัวอักษร)')
    .required('ใส่ชื่อสินค้าก่อนนะคะ'),
  shortDescription: Yup.string()
    .max(200, 'คำอธิบายสั้นต้องไม่เกิน 200 ตัวอักษร')
    .default(''),
  description: Yup.string()
    .max(5000, 'คำอธิบายยาวเกินไป (ไม่เกิน 5000 ตัวอักษร)')
    .default(''),
  price: Yup.number()
    .typeError('ใส่ราคาก่อนนะคะ')
    .positive('ราคาต้องมากกว่า 0 บาท')
    .test('decimal', 'ราคาทศนิยมได้ไม่เกิน 2 ตำแหน่ง', (v) =>
      v !== undefined ? /^\d+(\.\d{1,2})?$/.test(String(v)) : true,
    )
    .required('ใส่ราคาก่อนนะคะ'),
  type: Yup.string()
    .oneOf(PRODUCT_TYPE_IDS as unknown as string[], 'เลือกประเภทสินค้าก่อนนะคะ')
    .required('เลือกประเภทสินค้าก่อนนะคะ'),
  images: Yup.array()
    .of(Yup.string().required().max(200))
    .max(10, 'ใส่ได้มากที่สุด 10 รูปค่ะ')
    .default([]),
  tags: Yup.array()
    .of(Yup.string().required().max(50, 'แท็กยาวได้ไม่เกิน 50 ตัวอักษร'))
    .max(10, 'แท็กได้สูงสุด 10 รายการ')
    .default([]),
  attributes: Yup.object()
    .default({})
    .test('shape', 'รายละเอียดสินค้าผิดรูปแบบ', (val) => {
      if (val === undefined || val === null) return true
      if (typeof val !== 'object' || Array.isArray(val)) return false
      const entries = Object.entries(val as Record<string, unknown>)
      if (entries.length > 10) return false
      return entries.every(([k, v]) => {
        if (typeof k !== 'string' || typeof v !== 'string') return false
        if (k.length < 1 || k.length > 50) return false
        if (v.length > 200) return false
        return true
      })
    }),
  // capability flags (P2)
  fulfillmentMode: Yup.string()
    .oneOf(FULFILLMENT_MODES as unknown as string[], 'เลือกการจัดส่ง')
    .required(),
  billingMode: Yup.string()
    .oneOf(BILLING_MODES as unknown as string[], 'เลือกการเก็บเงิน')
    .required(),
  billingPeriod: Yup.string()
    .oneOf(BILLING_PERIODS as unknown as string[], 'เลือกรอบเก็บเงิน')
    .nullable()
    .default(null)
    // required เฉพาะถ้า billingMode = RECURRING
    .when('billingMode', {
      is: 'RECURRING',
      then: (s) => s.required('เลือกรอบเก็บเงิน').nonNullable(),
    }),
  billingPeriodDays: Yup.number()
    .integer()
    .min(1)
    .max(365)
    .nullable()
    .default(null)
    .when('billingPeriod', {
      is: 'CUSTOM',
      then: (s) => s.required('ใส่จำนวนวันต่อรอบ').min(1, 'อย่างน้อย 1 วัน'),
    }),
})
```

- [ ] **Step 2: Update defaultValues**

ใน `useForm({ defaultValues: ... })` block — เพิ่ม capability defaults:

```tsx
    defaultValues: {
      name: product?.name ?? '',
      shortDescription: product?.shortDescription ?? '',
      description: product?.description ?? '',
      price:
        product?.price !== undefined
          ? Number(product.price)
          : (undefined as unknown as number),
      type: ((product?.type as ProductFormV2Values['type']) ?? 'PHYSICAL'),
      images: product?.images ?? [],
      tags: product?.tags?.map((t) => t.name) ?? [],
      attributes:
        product?.attributes &&
        typeof product.attributes === 'object' &&
        !Array.isArray(product.attributes)
          ? (product.attributes as Record<string, string>)
          : {},
      // capability defaults — edit mode อ่านจาก product, create mode = SHIPPED+ONE_TIME
      fulfillmentMode: (product?.fulfillmentMode as ProductFormV2Values['fulfillmentMode']) ?? 'SHIPPED',
      billingMode: (product?.billingMode as ProductFormV2Values['billingMode']) ?? 'ONE_TIME',
      billingPeriod: (product?.billingPeriod as ProductFormV2Values['billingPeriod']) ?? null,
      billingPeriodDays: product?.billingPeriodDays ?? null,
    },
```

- [ ] **Step 3: Update onSubmit body**

ใน `onSubmit`, แก้ body ให้รวม capability fields:

```tsx
      const body: Record<string, unknown> = {
        name: values.name,
        description: values.description ? values.description : undefined,
        shortDescription: values.shortDescription ? values.shortDescription : undefined,
        price: values.price,
        type: values.type,
        images: values.images ?? [],
        tags: values.tags ?? [],
        attributes: values.attributes ?? {},
        // capability fields
        fulfillmentMode: values.fulfillmentMode,
        billingMode: values.billingMode,
        billingPeriod: values.billingPeriod,
        billingPeriodDays: values.billingPeriodDays,
      }
```

- [ ] **Step 4: Update render — add new cards + props**

ใน JSX `<div className={...}> {/* LEFT */}` block — แก้ TypePickerCardV2 props + insert 2 cards ใหม่ ระหว่าง TypePicker กับ Tags:

แทนที่ block:
```tsx
            <div className="border-default-100 border-t" />
            <ProductTypePickerCardV2 register={register} errors={errors} />
```

ด้วย:
```tsx
            <div className="border-default-100 border-t" />
            <ProductTypePickerCardV2
              register={register}
              errors={errors}
              setValue={setValue}
              watch={watch}
            />

            <div className="border-default-100 border-t" />
            <ProductCapabilityCardV2 register={register} errors={errors} />

            {/* BillingPeriodCardV2 self-renders null ถ้า billingMode !== RECURRING */}
            <ProductBillingPeriodCardV2
              register={register}
              errors={errors}
              watch={watch}
            />
```

และแก้ `<ProductPriceCardV2 ...>`:
```tsx
            <div className="border-default-100 border-t" />
            <ProductPriceCardV2 register={register} errors={errors} setValue={setValue} watch={watch} />
```

- [ ] **Step 5: Type-check**

```bash
pnpm tsc --noEmit
```
Expected: zero errors

- [ ] **Step 6: Run vitest (no UI tests; just confirm no regression in existing)**

```bash
pnpm vitest run
```
Expected: all PASS

- [ ] **Step 7: QA via Chrome DevTools MCP**

ขณะ user รัน dev server:
1. เปิด `http://seller.deepth.local:4000/products/new-v2`
2. Take screenshot — verify มี type picker 4 pills (📦💻🛠️🔁), CapabilityCardV2 (collapsed "ตั้งค่าขั้นสูง")
3. คลิก SUBSCRIPTION pill → verify มี "รอบเก็บเงิน" section โผล่ + price placeholder เปลี่ยนเป็น "ค่าบริการ/เดือน*"
4. คลิก "ตั้งค่าขั้นสูง" → verify expand แสดง fulfillment + billing radios, ติด NO_SHIPPING + RECURRING ตาม preset
5. คลิก CUSTOM ใน period → verify field "ทุกๆ กี่วัน" โผล่
6. กด save (ใส่ name + price) → verify toast success + list page แสดง product ใหม่

ถ้า fail → กลับไป fix step ที่เกี่ยวข้อง, ห้าม mark complete

- [ ] **Step 8: Commit (ของ task 6+7+8+9+10+11 รวมเป็นก้อนเดียว)**

```bash
git add src/app/\(paces\)/seller/\(dashboard\)/products/components/ProductFormV2.tsx \
        src/app/\(paces\)/seller/\(dashboard\)/products/components/ProductFormV2.types.ts \
        src/app/\(paces\)/seller/\(dashboard\)/products/components/ProductTypePickerCardV2.tsx \
        src/app/\(paces\)/seller/\(dashboard\)/products/components/ProductCapabilityCardV2.tsx \
        src/app/\(paces\)/seller/\(dashboard\)/products/components/ProductBillingPeriodCardV2.tsx \
        src/app/\(paces\)/seller/\(dashboard\)/products/components/ProductPriceCardV2.tsx
git commit -m "$(cat <<'EOF'
feat(product-form-v2): capability picker — type presets + advanced override + billing period

Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
TypePickerCardV2 derive 4 options จาก registry — เพิ่ม SUBSCRIPTION preset
(NO_SHIPPING + RECURRING + MONTHLY). CapabilityCardV2 ใหม่ — collapsed
"ตั้งค่าขั้นสูง" สำหรับ override default. BillingPeriodCardV2 ใหม่ —
conditional render เมื่อ RECURRING, รองรับ CUSTOM days. PriceCardV2 label
เปลี่ยนตาม billingMode + period. Yup schema + body POST/PATCH ขยายครบ.
EOF
)"
```

---

### Task 12: Update ProductPreviewPanel — show capability hint

**Files:**
- Modify: `src/app/(paces)/seller/(dashboard)/products/components/ProductPreviewPanel.tsx`

- [ ] **Step 1: Read current file structure**

```bash
head -60 src/app/\(paces\)/seller/\(dashboard\)/products/components/ProductPreviewPanel.tsx
```

ดู signature ปัจจุบัน + แก้ทางขั้นต่อไปตามที่เห็น

- [ ] **Step 2: Add billingMode + billingPeriod props + render badge**

แก้ component props (เพิ่มหลัง `attributes`):

```ts
// ใน Props interface — เพิ่ม:
  billingMode?: string
  billingPeriod?: string | null
  fulfillmentMode?: string
```

ใน JSX ส่วนที่แสดง price — wrap label ตาม billingMode (ถ้า component เดิมแสดงแค่ "฿{price}"):

```tsx
const priceLabel = (() => {
  if (billingMode === 'RECURRING') {
    if (billingPeriod === 'MONTHLY') return '/เดือน'
    if (billingPeriod === 'YEARLY') return '/ปี'
    if (billingPeriod === 'CUSTOM') return '/รอบ'
    return '/รอบ'
  }
  return ''
})()

// แสดง: ฿{price}{priceLabel}
```

เพิ่ม badge เล็กแสดง capability ใต้ชื่อสินค้าหรือเหนือ price:

```tsx
{(fulfillmentMode === 'NO_SHIPPING' || billingMode === 'RECURRING') && (
  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
    {fulfillmentMode === 'NO_SHIPPING' && (
      <span className="bg-default-100 text-default-700 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
        ไม่ต้องจัดส่ง
      </span>
    )}
    {billingMode === 'RECURRING' && (
      <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
        🔁 เก็บเป็นรอบ
      </span>
    )}
  </div>
)}
```

- [ ] **Step 3: Update consumer in ProductFormV2.tsx — pass new props**

ใน `<ProductPreviewPanel ...>` block ของ `ProductFormV2.tsx` — เพิ่ม:

```tsx
              <ProductPreviewPanel
                name={watched.name ?? ''}
                shortDescription={watched.shortDescription}
                description={watched.description}
                price={watched.price}
                type={watched.type ?? 'PHYSICAL'}
                images={watched.images ?? []}
                tags={watched.tags ?? []}
                attributes={watched.attributes ?? {}}
                shopName={shopName}
                fulfillmentMode={watched.fulfillmentMode}
                billingMode={watched.billingMode}
                billingPeriod={watched.billingPeriod}
              />
```

- [ ] **Step 4: Type-check**

```bash
pnpm tsc --noEmit
```
Expected: zero errors

- [ ] **Step 5: QA via Chrome DevTools MCP**

1. เปิด `/products/new-v2`
2. Toggle desktop preview (lg) — verify badge แสดงตามที่คาดหวัง:
   - Type=PHYSICAL → ไม่มี badge, price = "฿299"
   - Type=DIGITAL → badge "ไม่ต้องจัดส่ง", price = "฿299"
   - Type=SUBSCRIPTION + MONTHLY → 2 badges, price = "฿299/เดือน"
   - Type=SUBSCRIPTION + CUSTOM → "฿299/รอบ"

- [ ] **Step 6: Commit**

```bash
git add src/app/\(paces\)/seller/\(dashboard\)/products/components/ProductPreviewPanel.tsx \
        src/app/\(paces\)/seller/\(dashboard\)/products/components/ProductFormV2.tsx
git commit -m "$(cat <<'EOF'
feat(product-form-v2): preview panel — capability badges + per-cycle price label

Base: src/app/(paces)/seller/(dashboard)/products/components/ProductFormV2.tsx
Preview แสดง badge "ไม่ต้องจัดส่ง" และ "🔁 เก็บเป็นรอบ" ตาม capability flags.
Price label เพิ่ม "/เดือน" หรือ "/ปี" หรือ "/รอบ" สำหรับ RECURRING.
EOF
)"
```

---

### Task 13: End-of-phase batch QA (CLAUDE.md hard rule #4 level 2)

**Files:** ไม่แก้ไฟล์ — QA gate

- [ ] **Step 1: Verify dev server up**

ขอให้ user confirm dev server ที่ port 4000 พร้อม + login เป็น seller. Claude ไม่ start dev server เอง

- [ ] **Step 2: Golden path — สร้าง 4 product ครบทุก preset**

ผ่าน Chrome DevTools MCP:

1. PHYSICAL: เปิด `/products/new-v2`, ใส่ name="ทดสอบของจริง", price=199, เลือก 📦, save → list ต้องขึ้น product ใหม่
2. DIGITAL: เปิดอีก, name="ทดสอบโค้ด", price=99, เลือก 💻, save
3. SERVICE: name="ทดสอบบริการ", price=499, เลือก 🛠️, save
4. SUBSCRIPTION+MONTHLY: name="สมาชิกรายเดือน", price=299, เลือก 🔁, save → DB ต้องเก็บ billingMode=RECURRING, billingPeriod=MONTHLY
5. SUBSCRIPTION+YEARLY: เปิดอีก, name="สมาชิกรายปี", price=2999, เลือก 🔁 → ใน BillingPeriodCard เปลี่ยนเป็น YEARLY, save
6. SUBSCRIPTION+CUSTOM: name="ทุก 14 วัน", price=199, เลือก 🔁 → CUSTOM → ใส่ 14 → save

- [ ] **Step 3: Verify DB persistence**

```bash
docker exec postgres15-dev psql -U safepay -d safepay -c "
SELECT name, type, \"fulfillmentMode\", \"billingMode\", \"billingPeriod\", \"billingPeriodDays\"
FROM \"Product\" WHERE name LIKE 'ทดสอบ%' OR name LIKE 'สมาชิก%' OR name LIKE 'ทุก%'
ORDER BY \"createdAt\" DESC LIMIT 10;
"
```
Expected: 6 rows ตรงกับ data ที่ใส่ — type/capability ครบ

- [ ] **Step 4: Override flow — Capability card override**

1. เปิด `/products/new-v2`, เลือก SUBSCRIPTION (default NO_SHIPPING + RECURRING)
2. กด "ตั้งค่าขั้นสูง" → expand
3. คลิก SHIPPED ใต้ "การจัดส่ง"
4. Save → verify DB: fulfillmentMode=SHIPPED + billingMode=RECURRING (sub box scenario)

- [ ] **Step 5: Edit flow — load existing capability values**

1. กลับไป `/products`
2. กด edit ที่ SUBSCRIPTION+MONTHLY product จาก step 2
3. Verify form load → type pill 🔁 selected, price placeholder = "ค่าบริการ/เดือน*", "รอบเก็บเงิน" pill MONTHLY selected
4. เปลี่ยนเป็น YEARLY, save → verify DB updated

- [ ] **Step 6: Validation — required period when RECURRING**

1. เปิด `/products/new-v2`, เลือก SUBSCRIPTION
2. ใน BillingPeriodCard — กด **clear** ทุก radio (ผ่าน DOM manipulation ใน console ถ้า UI ไม่ให้ clear: `document.querySelectorAll('[name="billingPeriod"]').forEach(el => el.checked = false)` แล้ว trigger React state)
3. กด save → verify error "เลือกรอบเก็บเงิน" ขึ้น + form ไม่ submit

- [ ] **Step 7: Backward compat — products เก่ายังโหลดได้**

1. เปิด `/products` → list page
2. กด edit product เก่า (ก่อน migration) — verify form load defaults SHIPPED+ONE_TIME (PHYSICAL) หรือ NO_SHIPPING+ONE_TIME (DIGITAL/SERVICE) ตาม data migration
3. Save without change → verify ไม่ error + DB ยังตรง

- [ ] **Step 8: Cleanup test products (optional)**

```bash
docker exec postgres15-dev psql -U safepay -d safepay -c "
DELETE FROM \"Product\" WHERE name LIKE 'ทดสอบ%' OR name LIKE 'สมาชิก%' OR name LIKE 'ทุก%';
"
```

- [ ] **Step 9: Mark phase complete + retro note**

ถ้าทุก step ผ่าน — Phase P1+P2 ship-able. เขียน retro note ตาม CLAUDE.md hard rule #4:

```bash
mkdir -p docs/retro
cat > docs/retro/2026-05-10-p1-p2-product-capability.md <<'EOF'
# Retro — P1+P2: Product capability flags

## ผลลัพธ์
- Schema + registry SSOT พร้อม + data migration map type เดิมตรง semantic
- Form V2 มี 4 type presets + advanced override + per-period billing
- backward compat — product เก่าทุกชิ้นทำงานต่อได้

## ปัญหา + solution
- (เขียนตาม actual experience ของ implementer)

## Convention ที่จะ adopt
- (registry pattern — ถ้าใช้ดี promote ขึ้น CLAUDE.md เป็น default ของ feature ที่มี enum-with-config)

## Action items
- [ ] เขียน plan P3 (order flow NO_SHIPPING)
- [ ] เขียน plan P4 (recurring dashboard)
EOF
```

(implementer เติม section "ปัญหา + solution" ตาม actual)

- [ ] **Step 10: Commit retro**

```bash
git add docs/retro/2026-05-10-p1-p2-product-capability.md
git commit -m "docs(retro): P1+P2 product capability — schema + form V2 ship"
```

---

## Self-Review

**Spec coverage** (against `2026-05-10-product-types-capability-design.md`):
- [x] Section 3 (Type registry) → Task 1
- [x] Section 4.1 (Product schema + migration) → Task 3
- [x] Section 4.2 (Order schema) → **Out of scope P1+P2** (P3 plan)
- [x] Section 6.1-6.5 (Form layout, type picker, capability card, billing period card, price label) → Tasks 7-11
- [x] Section 6.6 (OrderCreateForm) → **Out of scope P1+P2** (P3 plan)
- [x] Section 6.7 (PublicOrderClient) → **Out of scope P1+P2** (P3 plan)
- [x] Section 6.8 (RecurringDashboardCard) → **Out of scope P1+P2** (P4 plan)
- [x] Section 7 (Existing-code audit) → Task 4 (service) + Task 5 (API) + Tasks 7-12 (UI)
- [x] Section 8 P1 + P2 → covered

**Placeholders:** none ✅

**Type consistency:**
- `ProductTypeId` ใน registry.ts ↔ `ProductTypeV2` re-export ใน types.ts ✓
- `FulfillmentMode` / `BillingMode` ↔ used ใน types.ts + cards + Yup ✓
- `deriveCapabilityDefaults` คืน `{ fulfillmentMode, billingMode, billingPeriod }` ✓ (used ใน TypePicker effect)

---

## After P1+P2 ships

**Plan ถัดไป:** `2026-05-10-product-capability-p3-p4.md` (P3 Order flow + P4 Recurring dashboard) — เขียน after P1+P2 deploys + ได้ feedback จริง
