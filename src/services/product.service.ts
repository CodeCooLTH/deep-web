import { prisma } from "@/lib/prisma";
import { COUNTABLE_CARRIER_STATUSES } from "@/lib/public-order-count";
import { Prisma } from "@prisma/client";
import type { FulfillmentMode, BillingMode, BillingPeriod, ProductTypeId } from "@/lib/product-types/registry";
import { deriveCapabilityDefaults, PRODUCT_TYPES } from "@/lib/product-types/registry";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// อักขระ punctuation ที่ต้องเอาออกจาก slug — explicit list ปลอดภัยกว่า range
// (range เช่น `[ -\`]` ใน regex จะกิน A-Z รวมไปด้วย ซึ่งทำให้ slug หายตัวอักษร)
const SLUG_PUNCTUATION_RE = /[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~]/g;

/**
 * slugify — แปลงชื่อ tag เป็น slug
 * - lowercase + trim
 * - whitespace ทุกชนิด (รวม tab, full-width space) → "-"
 * - ตัวอักษรไทยเก็บไว้เหมือนเดิม (Thai ใน URL ใช้ได้แล้ว)
 * - ตัด punctuation ASCII ที่ขัดกับ URL ทิ้ง
 *
 * ตัวอย่าง:
 *   "  Vintage Bag  "         → "vintage-bag"
 *   "ขนมเปี๊ยะ ไส้ทุเรียน"     → "ขนมเปี๊ยะ-ไส้ทุเรียน"
 *   "Hello, World!"           → "hello-world"
 */
export function slugify(name: string): string {
  return name
    .normalize("NFC")
    .trim()
    .toLowerCase()
    // ขั้นแรก: whitespace → "-" (ก่อน strip punctuation เพื่อไม่ให้ space หาย)
    .replace(/\s+/g, "-")
    // ขั้นสอง: ลบ punctuation
    .replace(SLUG_PUNCTUATION_RE, "")
    // ลบ "-" ซ้ำ
    .replace(/-+/g, "-")
    // ตัด "-" ที่หัว/ท้าย
    .replace(/^-+|-+$/g, "");
}

/**
 * upsertTagsByName — upsert tags ตามชื่อ + คืน id list (ใช้สำหรับ update path)
 *
 * - trim + dedupe (case-insensitive) ก่อน
 * - ใช้ Tag.name @unique เป็น dedupe key (ไม่ใช่ slug — slug อาจชนได้ในกรณี
 *   normalize แล้วเหมือนกัน เช่น "Vintage Bag" vs "vintage  bag")
 * - ถ้า slug ชน (P2002 unique violation) จะ retry หนึ่งครั้งโดยเติม suffix
 */
export async function upsertTagsByName(names: string[]): Promise<{ id: string }[]> {
  // trim, drop empty, dedupe โดย lowercase key (เพื่อกัน "Vintage" + "vintage")
  const seen = new Map<string, string>(); // lowerCaseKey → originalTrimmed
  for (const raw of names) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }

  const ids: { id: string }[] = [];
  for (const name of seen.values()) {
    const slug = slugify(name) || name; // กัน slug ว่าง (edge case)

    try {
      const tag = await prisma.tag.upsert({
        where: { name },
        create: { name, slug },
        update: {},
        select: { id: true },
      });
      ids.push(tag);
    } catch (e) {
      // P2002 = unique constraint failed — น่าจะเป็น slug ชน
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const fallbackSlug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
        const tag = await prisma.tag.upsert({
          where: { name },
          create: { name, slug: fallbackSlug },
          update: {},
          select: { id: true },
        });
        ids.push(tag);
      } else {
        throw e;
      }
    }
  }

  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialization (RSC-safe)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Plain product shape ที่ส่งข้าม server→client boundary ได้ — ไม่มี Decimal,
 * ไม่มี nested Date ที่ไม่จำเป็น. ใช้ใน edit page + API responses.
 */
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
  // stockQty — Inventory Add-on (feature 00003): null=untracked
  stockQty: number | null;
  // lowStockThreshold — Deep Stock Pro (feature 00009): null=ไม่ตั้ง alert, N>=0=ตั้งค่า
  lowStockThreshold: number | null;
  // cost — Expense & Cost Tracking (feature 00016): null=ไม่ตั้งราคาทุน, N>=0=ตั้งค่า
  // (ไม่มี gate ของแพ็กเกจแล้ว — D-EXT-1 2026-08-07 เปิดฟรีทุกร้าน)
  cost: number | null;
}

type ProductWithTags = Prisma.ProductGetPayload<{ include: { tags: true } }>;

/**
 * serializeProduct — แปลง Prisma product (Decimal/Json/Date) → plain object
 * ที่ส่งจาก RSC → Client component ได้
 */
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
    stockQty: product.stockQty ?? null,
    lowStockThreshold: product.lowStockThreshold ?? null,
    // cost — Expense & Cost Tracking (feature 00016): Decimal→number แปลงเหมือน price, null=ไม่ตั้ง
    cost: product.cost !== null && product.cost !== undefined ? Number(product.cost) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateProductInput {
  name: string;
  sku?: string;
  description?: string;
  shortDescription?: string;
  price: number;
  type: string;
  images?: string[];
  tags?: string[];
  attributes?: Record<string, string>;
  // capability flags (P1) — optional in input; service ใช้ column default ถ้าไม่ส่ง
  fulfillmentMode?: FulfillmentMode;
  billingMode?: BillingMode;
  billingPeriod?: BillingPeriod | null;
  billingPeriodDays?: number | null;
  // stockQty — Inventory Add-on (feature 00003): undefined=ไม่แตะ, null=untrack, ≥0=track
  stockQty?: number | null;
  // lowStockThreshold — Deep Stock Pro (feature 00009): undefined=ไม่แตะ, null=ไม่ตั้ง alert, ≥0=ตั้งค่า
  lowStockThreshold?: number | null;
  // cost — Expense & Cost Tracking (feature 00016): undefined=ไม่แตะ, null=ล้างค่า, ≥0=ตั้งค่า
  // (ไม่มี gate ของแพ็กเกจแล้ว — D-EXT-1 2026-08-07)
  cost?: number | null;
  // shopVertical — feature 00028 (BR-SBT-22, SDS TD-004): caller ส่ง shop.vertical ที่มีอยู่แล้ว
  // ในมือหลัง guard มาให้ override default ของ fulfillmentMode — ห้าม service query Shop เอง
  // (N+1 ที่ไม่จำเป็น, caller ทั้ง 2 จุดมี shop object พร้อมอยู่แล้ว)
  shopVertical?: string;
}

/**
 * createProduct — สร้างสินค้าใหม่พร้อม tags (atomic ผ่าน connectOrCreate)
 *
 * Atomicity: ใช้ `tags: { connectOrCreate: ... }` ใน product.create call เดียว
 * เพราะ Prisma จะรันทั้งหมดใน transaction ภายในเดียวกันให้ — ถ้า tag upsert ล้ม
 * product จะไม่ถูกสร้าง. ดีกว่า manual upsert + connect แยกขั้น (C5)
 */
export async function createProduct(shopId: string, data: CreateProductInput) {
  // dedupe tag names (case-insensitive) ก่อนส่งให้ connectOrCreate
  // เพราะถ้ามีชื่อซ้ำใน array, Prisma จะพยายาม create ซ้ำ → P2002
  const seenTags = new Map<string, string>();
  for (const raw of data.tags ?? []) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seenTags.has(key)) seenTags.set(key, trimmed);
  }
  const uniqueTagNames = Array.from(seenTags.values());

  const created = await prisma.product.create({
    data: {
      shopId,
      name: data.name,
      sku: data.sku ?? null,
      description: data.description ?? null,
      shortDescription: data.shortDescription ?? null,
      price: data.price,
      type: data.type,
      images: (data.images ?? []) as Prisma.InputJsonValue,
      attributes: (data.attributes ?? {}) as Prisma.InputJsonValue,
      // stockQty — Inventory Add-on (feature 00003): omit ก็ default เป็น null (untracked)
      stockQty: data.stockQty ?? null,
      // lowStockThreshold — Deep Stock Pro (feature 00009): omit ก็ default เป็น null (ไม่ตั้ง alert)
      lowStockThreshold: data.lowStockThreshold ?? null,
      // cost — Expense & Cost Tracking (feature 00016): omit ก็ default เป็น null (ไม่ตั้งราคาทุน)
      cost: data.cost ?? null,
      // capability flags — derive fulfillmentMode จาก type ถ้า caller ไม่ส่งมา
      // ไม่พึ่ง client หรือ DB default: SERVICE/DIGITAL ที่ไม่ส่ง fulfillmentMode จะได้
      // SHIPPED จาก schema default → post-OMS createOrder จะ require shipping ผิด
      //
      // priority (feature 00030 BR-BKU-13 — กลับด้านจาก 00028 BR-SBT-22):
      //   1) ร้าน SERVICE_QUEUE → NO_SHIPPING **เสมอ** ไม่ว่า caller จะส่งอะไรมา
      //   2) data.fulfillmentMode ที่ caller ส่งมาเอง
      //   3) เดิม — derive จาก type (PHYSICAL → SHIPPED, SERVICE/DIGITAL/... → ตาม registry)
      //
      // ทำไมต้องกลับด้าน: 00028 ตั้งใจ "ล็อก" แต่เขียนเป็น default ที่ caller ทับได้ ซึ่งไม่ได้
      // ปิดอะไรเลย — ฟอร์มสินค้าส่ง fulfillmentMode มาทุกครั้งอยู่แล้ว ค่าที่ตั้งใจให้ล็อกจึงแพ้
      // ทุกครั้งในทางปฏิบัติ. ร้านที่ประกาศว่า "ไม่มีการจัดส่ง" ต้องไม่มีทางสร้างสินค้าที่ต้อง
      // ส่งของได้ ไม่ว่าจะผ่าน UI หรือยิง API ตรง
      fulfillmentMode: resolveFulfillmentMode({
        shopVertical: data.shopVertical,
        explicit: data.fulfillmentMode,
        type: data.type,
      }),
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

  return created;
}

/**
 * resolveFulfillmentMode — ตัวตัดสินค่า Product.fulfillmentMode ที่เดียวของระบบ
 * (feature 00030 BR-BKU-13 — สกัดออกมาเพราะเดิม createProduct กับ updateProduct ตัดสินคนละที่
 *  ด้วยลำดับคนละแบบ จนสร้างถูกแล้วแก้ให้ผิดทีหลังได้)
 *
 * ลำดับ:
 *   1) ร้าน SERVICE_QUEUE → NO_SHIPPING **เสมอ** ไม่ว่า caller จะส่งอะไรมา (ล็อก ไม่ใช่ default)
 *   2) ค่าที่ caller ส่งมาเอง
 *   3) derive จาก product type ตาม registry
 *   4) undefined = ไม่แตะ (ให้ schema default / ค่าเดิมใน DB ทำงาน)
 *
 * ทำไมข้อ 1 ต้องชนะข้อ 2: 00028 (BR-SBT-22) ตั้งใจล็อกแต่เขียนเป็น default ที่ caller ทับได้
 * ซึ่งไม่ได้ปิดอะไรเลย เพราะฟอร์มสินค้าส่ง fulfillmentMode มาทุกครั้งอยู่แล้ว
 */
export function resolveFulfillmentMode(input: {
  shopVertical?: string;
  explicit?: FulfillmentMode;
  type?: string;
}): FulfillmentMode | undefined {
  if (input.shopVertical === "SERVICE_QUEUE") return "NO_SHIPPING";
  if (input.explicit !== undefined) return input.explicit;
  if (input.type !== undefined && input.type in PRODUCT_TYPES) {
    return deriveCapabilityDefaults(input.type as ProductTypeId).fulfillmentMode;
  }
  return undefined;
}

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
  fulfillmentMode?: FulfillmentMode;
  billingMode?: BillingMode;
  billingPeriod?: BillingPeriod | null;
  billingPeriodDays?: number | null;
  // stockQty — Inventory Add-on (feature 00003): omit=ไม่แตะ, null=untrack, ≥0=track
  stockQty?: number | null;
  // lowStockThreshold — Deep Stock Pro (feature 00009): omit=ไม่แตะ, null=ไม่ตั้ง alert, ≥0=ตั้งค่า
  lowStockThreshold?: number | null;
  // cost — Expense & Cost Tracking (feature 00016): omit=ไม่แตะ, null=ล้างค่า, ≥0=ตั้งค่า
  // (ไม่มี gate ของแพ็กเกจแล้ว — D-EXT-1 2026-08-07)
  cost?: number | null;
  /**
   * shopVertical — feature 00030 (BR-BKU-13): mirror ของ CreateProductInput
   * ร้าน SERVICE_QUEUE ต้องได้ NO_SHIPPING เสมอตอนแก้ไขด้วย ไม่ใช่แค่ตอนสร้าง
   * (เดิม updateProduct ไม่รู้จัก vertical เลย — สร้างถูกแล้วแก้ให้ผิดทีหลังได้)
   * caller ส่ง shop.vertical ที่มีอยู่แล้วในมือ ไม่ต้อง query ซ้ำใน service
   */
  shopVertical?: string;
}

/**
 * updateProduct — partial update
 *
 * Field semantics:
 *   - omitted (undefined) → ไม่แตะ
 *   - present (รวม [] หรือ {}) → เขียนทับ
 *
 * Tags replacement strategy:
 *   tags @ Prisma รองรับ `set` (connect by id) และ `connectOrCreate` แยกกัน —
 *   เราต้องการ "replace ทั้งหมดด้วย list ใหม่" + "auto-create tag ใหม่ที่ยัง
 *   ไม่มีในระบบ". วิธีที่ atomic + ง่ายสุด: ทำ 2 step ใน $transaction
 *     1) update tags: { set: [] }  → clear ทั้งหมด
 *     2) update tags: { connectOrCreate: [...] } → re-attach (สร้างใหม่ถ้ายังไม่มี)
 *   ทำใน prisma.$transaction ให้ atomic (C5)
 */
export async function updateProduct(productId: string, data: UpdateProductInput) {
  // Build scalar/json update payload (เฉพาะ field ที่ defined)
  const scalarUpdate: Prisma.ProductUpdateInput = {};
  if (data.name !== undefined) scalarUpdate.name = data.name;
  if (data.description !== undefined) scalarUpdate.description = data.description;
  if (data.shortDescription !== undefined) scalarUpdate.shortDescription = data.shortDescription;
  if (data.price !== undefined) scalarUpdate.price = data.price;
  if (data.type !== undefined) scalarUpdate.type = data.type;
  if (data.images !== undefined) scalarUpdate.images = data.images as Prisma.InputJsonValue;
  if (data.attributes !== undefined) scalarUpdate.attributes = data.attributes as Prisma.InputJsonValue;
  if (data.isActive !== undefined) scalarUpdate.isActive = data.isActive;
  // pinnedAt auto-unpin (Pin Products, feature 00013, TFR-PIN-08 / BR-PIN-11): true→false เท่านั้น
  // ล้าง pinnedAt ในธุรกรรมเดียวกับ isActive — ไม่แตะเมื่อ isActive=true/undefined (reactivate ไม่ auto re-pin)
  if (data.isActive === false) scalarUpdate.pinnedAt = null;
  // ถ้าเปลี่ยน type + ไม่ได้ส่ง fulfillmentMode มาด้วย → re-derive จาก type ใหม่
  // ไม่พึ่ง client: PHYSICAL→SERVICE โดยไม่ส่ง fulfillmentMode จะเหลือ SHIPPED เดิม → OMS ผิด
  // feature 00030 BR-BKU-13 — ร้าน SERVICE_QUEUE ล็อก NO_SHIPPING เสมอ ชนะทั้งค่าที่ caller
  // ส่งมาและค่าที่ derive จาก type. เขียนไว้ก่อน branch เดิมเพื่อให้อ่านลำดับได้จากบนลงล่าง
  const resolvedFulfillment = resolveFulfillmentMode({
    shopVertical: data.shopVertical,
    explicit: data.fulfillmentMode,
    type: data.type,
  });
  // undefined = caller ไม่ได้ส่งและไม่ได้เปลี่ยน type → ไม่แตะค่าเดิมใน DB (partial update)
  if (resolvedFulfillment !== undefined) scalarUpdate.fulfillmentMode = resolvedFulfillment;
  if (data.billingMode !== undefined) scalarUpdate.billingMode = data.billingMode;
  if (data.billingPeriod !== undefined) scalarUpdate.billingPeriod = data.billingPeriod;
  if (data.billingPeriodDays !== undefined) scalarUpdate.billingPeriodDays = data.billingPeriodDays;
  // stockQty — Inventory Add-on (feature 00003): omit=ไม่แตะ (pattern เดียวกับ field อื่นข้างบน)
  if (data.stockQty !== undefined) scalarUpdate.stockQty = data.stockQty;
  // lowStockThreshold — Deep Stock Pro (feature 00009): omit=ไม่แตะ (pattern เดียวกับ stockQty)
  if (data.lowStockThreshold !== undefined) scalarUpdate.lowStockThreshold = data.lowStockThreshold;
  // cost — Expense & Cost Tracking (feature 00016): omit=ไม่แตะ (pattern เดียวกับ lowStockThreshold)
  if (data.cost !== undefined) scalarUpdate.cost = data.cost;

  // ถ้าไม่มี tags ใน payload — update ครั้งเดียว ไม่ต้อง transaction
  if (data.tags === undefined) {
    return prisma.product.update({
      where: { id: productId },
      data: scalarUpdate,
      include: { tags: true },
    });
  }

  // มี tags — replace ทั้งหมดใน $transaction
  // dedupe tag names (case-insensitive)
  const seenTags = new Map<string, string>();
  for (const raw of data.tags) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seenTags.has(key)) seenTags.set(key, trimmed);
  }
  const uniqueTagNames = Array.from(seenTags.values());

  const [, updated] = await prisma.$transaction([
    // step 1: clear tags ทั้งหมด + apply scalar update
    prisma.product.update({
      where: { id: productId },
      data: { ...scalarUpdate, tags: { set: [] } },
    }),
    // step 2: re-attach tags ใหม่ (ถ้ามี)
    prisma.product.update({
      where: { id: productId },
      data:
        uniqueTagNames.length > 0
          ? {
              tags: {
                connectOrCreate: uniqueTagNames.map((name) => ({
                  where: { name },
                  create: { name, slug: slugify(name) || name },
                })),
              },
            }
          : {},
      include: { tags: true },
    }),
  ]);

  return updated;
}

export async function deleteProduct(productId: string) {
  // pinnedAt: null — auto-unpin (Pin Products, feature 00013, TFR-PIN-08 / BR-PIN-11) ในธุรกรรม
  // เดียวกับ isActive:false (single UPDATE statement = atomic, unconditional/idempotent)
  return prisma.product.update({ where: { id: productId }, data: { isActive: false, pinnedAt: null } });
}

export interface GetProductsByShopOptions {
  // excludePinned — Pin Products (feature 00013, TD-002): true = ตัดสินค้าที่ปักหมุดออกจาก
  // grid ทั่วไป (โปรไฟล์เรียกคู่กับ getPinnedProducts แยกโซน). optional param ที่ 3 ท้ายสุด
  // เพื่อ backward-compat 100% กับ call-site เดิม (ไม่ส่ง = พฤติกรรมเดิมทุกประการ)
  excludePinned?: boolean;
}

export async function getProductsByShop(
  shopId: string,
  take?: number,
  opts?: GetProductsByShopOptions,
) {
  return prisma.product.findMany({
    where: {
      shopId,
      isActive: true,
      ...(opts?.excludePinned ? { pinnedAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { tags: true },
    ...(take ? { take } : {}),
  });
}

/**
 * getBestSellerProducts — สินค้าขายดี เรียงจากยอดขายรวม (sum OrderItem.qty) มากสุด desc
 * ใช้บน quick-create (ProductPickerSheet) + Command Center (feature Quick Create Order).
 * นับเฉพาะ line ที่มี productId (ไม่นับ custom item) ของ order ในร้านนี้; คืนเฉพาะ product ที่ยัง active.
 * groupBy คืนลำดับตามยอดขาย แต่ findMany ไม่การันตีลำดับ → re-order ตาม best-seller ก่อนคืน.
 */
/**
 * สินค้าขายดีของร้าน (หลังบ้าน: dashboard + หน้า POS)
 *
 * เกณฑ์นับ (user เคาะ 2026-08-06): **ทุกสถานะยกเว้น CANCELLED** (= PENDING+SHIPPED+CONFIRMED)
 * — ร้านที่ขายผ่านแชท ผู้ซื้อแทบไม่กลับมากดยืนยันรับของ (เคสจริง: ร้านธนภัทร์ SHIPPED 23 ใบ
 * CONFIRMED 0) ถ้านับเฉพาะ CONFIRMED ฝั่งหลังร้านจะว่างตลอดทั้งที่ขายจริงต่อเนื่อง
 *
 * ประวัติ: 2026-07-30 เคยแก้จาก "ไม่กรองเลย" → CONFIRMED เท่านั้น เพราะตัวเลขโป่งเกือบ 3 เท่า;
 * รอบนี้ผ่อนกลับมาที่ not-CANCELLED **เฉพาะฝั่งหลังร้าน** และ UI เปลี่ยนคำจาก "ขายแล้ว" →
 * "สั่งซื้อแล้ว" เพื่อไม่ให้คำเดียวมีสองความหมาย — คำว่า "ขายแล้ว" (CONFIRMED-only) ยังใช้อยู่ที่
 * หน้าสาธารณะ /u /b (getConfirmedOrderCountByProduct ข้างล่าง) + ProductsListing (totalSold)
 * ซึ่ง**ไม่ได้เปลี่ยน**ตามรอบนี้ — ห้ามลามเกณฑ์นี้ไปหน้าสาธารณะ (ร้านปั่นยอดโชว์ผู้ซื้อได้)
 */
export async function getBestSellerProducts(shopId: string, take = 8) {
  const grouped = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { productId: { not: null }, order: { shopId, status: { not: "CANCELLED" } } },
    _sum: { qty: true },
    orderBy: { _sum: { qty: "desc" } },
    take,
  });
  const ids = grouped
    .map((g) => g.productId)
    .filter((v): v is string => Boolean(v));
  if (ids.length === 0) return [];
  // จำนวนขายรวม (sum qty) ต่อ product — แนบเป็น soldCount ให้ UI โชว์ "ขายไป X ชิ้น"
  const qtyById = new Map(grouped.map((g) => [g.productId, g._sum.qty ?? 0]));
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, shopId, isActive: true },
    include: { tags: true },
  });
  // คงลำดับ best-seller (findMany อาจสลับ + product ที่ปิด/ลบ หลุดออกไป)
  const byId = new Map(products.map((p) => [p.id, p]));
  return ids
    .map((id) => {
      const p = byId.get(id);
      return p ? { ...p, soldCount: qtyById.get(id) ?? 0 } : null;
    })
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
}

/**
 * จำนวน "คำสั่งซื้อที่ซื้อไปแล้ว" ต่อสินค้า — ใช้โชว์บนหน้าร้านสาธารณะ (user ขอ 2026-07-26)
 *
 * นับเฉพาะ **CONFIRMED** เท่านั้น: บน Deep ออเดอร์จะ CONFIRMED ก็ต่อเมื่อผู้ซื้อกดยืนยันว่าได้รับ
 * ของแล้ว ตัวเลขนี้จึงแปลว่า "มีคนซื้อแล้วได้ของจริงกี่ครั้ง" ซึ่งเป็นสิ่งเดียวที่ควรเอาไปวางบนหน้า
 * ที่คนใช้ตัดสินใจโอนเงิน — PENDING คือสร้างออเดอร์ไว้เฉย ๆ ใครก็สร้างได้ ถ้านับด้วยจะกลายเป็น
 * ตัวเลขที่ร้านปั่นเองได้ ขัดกับเหตุผลทั้งหมดของแพลตฟอร์ม (เกณฑ์เดียวกับที่ Revenue/P&L ใช้)
 *
 * นับเป็น "จำนวนคำสั่งซื้อ" ไม่ใช่จำนวนชิ้น — ออเดอร์เดียวซื้อ 10 ชิ้นไม่ได้แปลว่ามีคนเชื่อใจร้าน
 * 10 ครั้ง groupBy ด้วย [productId, orderId] จึงได้หนึ่งแถวต่อหนึ่งคู่ = จำนวนออเดอร์ที่ไม่ซ้ำพอดี
 * (สินค้าเดียวกันลงสองบรรทัดในออเดอร์เดียวจะไม่ถูกนับซ้ำ)
 *
 * หมายเหตุ: ต่างจาก getBestSellerProducts ที่นับ **ทุกสถานะ** และนับเป็นจำนวนชิ้น — ตัวนั้นเป็น
 * ตัวเลขฝั่งหลังบ้านให้ร้านดูเอง คนละความหมายกับตัวเลขที่โชว์ผู้ซื้อ
 */
export async function getConfirmedOrderCountByProduct(
  productIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (productIds.length === 0) return result;

  const pairs = await prisma.orderItem.groupBy({
    by: ["productId", "orderId"],
    // BR-POC-03 — "ขายแล้ว N" ใช้เกณฑ์เดียวกับช่อง "ออเดอร์" ในหัวโปรไฟล์
    // (ผู้ซื้อยืนยันเอง **หรือ** ขนส่งขยับพัสดุจริงแล้ว) ไม่งั้นการ์ดสินค้ากับหัวหน้าจะนับคนละแบบ
    // ⚠️ ไม่มี shopId ที่นี่โดยตั้งใจ — productIds ถูก scope ด้วยร้านมาแล้วจากผู้เรียก
    where: {
      productId: { in: productIds },
      order: {
        status: { not: "CANCELLED" },
        OR: [
          { status: "CONFIRMED" },
          {
            shipments: {
              some: {
                status: "CREATED",
                isDryRun: false,
                carrierStatus: { in: [...COUNTABLE_CARRIER_STATUSES] },
              },
            },
          },
        ],
      },
    },
  });

  for (const row of pairs) {
    if (!row.productId) continue;
    result.set(row.productId, (result.get(row.productId) ?? 0) + 1);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat Product Context Card (extension #1, feat 00011) — lightweight product ref
// ใช้ 2 ที่: chat.service.sendMessage (S-17 verify cross-shop) +
// api/chat .../messages GET (S-18 enrich productCard)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductRefLite {
  id: string;
  shopId: string;
  name: string;
  price: number;
  images: string[];
  isActive: boolean;
}

const PRODUCT_REF_SELECT = {
  id: true,
  shopId: true,
  name: true,
  price: true,
  images: true,
  isActive: true,
} as const;

type ProductRefRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_REF_SELECT }>;

function toProductRefLite(p: ProductRefRow): ProductRefLite {
  return {
    id: p.id,
    shopId: p.shopId,
    name: p.name,
    price: Number(p.price),
    images: Array.isArray(p.images) ? (p.images as string[]) : [],
    isActive: p.isActive,
  };
}

/**
 * getProductById — สำหรับ verify cross-shop (S-17 sendMessage) + enrich productCard (S-18 GET)
 * คืน null ถ้าไม่พบ (ลบจริงหรือ id ผิด) — caller ตัดสินใจ error/graceful-degrade เอง (FR-CTX-07/08)
 */
export async function getProductById(productId: string): Promise<ProductRefLite | null> {
  const p = await prisma.product.findUnique({ where: { id: productId }, select: PRODUCT_REF_SELECT });
  return p ? toProductRefLite(p) : null;
}

/**
 * getProductsByIds — batch fetch สำหรับ enrich รายการข้อความ (กัน N+1 query ใน GET messages, S-18)
 */
export async function getProductsByIds(productIds: string[]): Promise<ProductRefLite[]> {
  if (productIds.length === 0) return [];
  const rows = await prisma.product.findMany({ where: { id: { in: productIds } }, select: PRODUCT_REF_SELECT });
  return rows.map(toProductRefLite);
}
