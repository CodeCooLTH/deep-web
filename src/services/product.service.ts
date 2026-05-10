import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { FulfillmentMode, BillingMode, BillingPeriod } from "@/lib/product-types/registry";

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
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateProductInput {
  name: string;
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

  return created;
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
  if (data.fulfillmentMode !== undefined) scalarUpdate.fulfillmentMode = data.fulfillmentMode;
  if (data.billingMode !== undefined) scalarUpdate.billingMode = data.billingMode;
  if (data.billingPeriod !== undefined) scalarUpdate.billingPeriod = data.billingPeriod;
  if (data.billingPeriodDays !== undefined) scalarUpdate.billingPeriodDays = data.billingPeriodDays;

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
  return prisma.product.update({ where: { id: productId }, data: { isActive: false } });
}

export async function getProductsByShop(shopId: string) {
  return prisma.product.findMany({
    where: { shopId, isActive: true },
    orderBy: { createdAt: "desc" },
    include: { tags: true },
  });
}
