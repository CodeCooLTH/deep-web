import { prisma } from "@/lib/prisma";
import { normalizeSlug, isValidSlugFormat, isReservedSlug } from "@/lib/shop-slug";
import { getTierScoreRange } from "@/lib/trust-tier";

export async function createShop(userId: string, data: {
  shopName: string;
  description?: string;
  category?: string;
  address?: string;
  businessType: string;
  logo?: string; // fileId จาก /api/upload — เดิม CreateShopSchema strip ทิ้ง (B6 retro)
}) {
  // S-C4: shop.create + user.update(isShop) ต้อง atomic — เดิม 2 query แยก
  // partial-fail = shop มี แต่ isShop=false กู้ไม่ได้ (unique บล็อก recreate)
  return prisma.$transaction(async (tx) => {
    const shop = await tx.shop.create({
      data: { userId, ...data },
    });
    await tx.user.update({
      where: { id: userId },
      data: { isShop: true },
    });
    return shop;
  });
}

// IMPORTANT: allowlist นี้จงใจ "ไม่มี" vertical (feature 00017) — ประเภทกิจการตั้งได้ครั้งเดียว
// ตอนสร้างธุรกิจเท่านั้น เปลี่ยนภายหลังไม่ได้ (BR-LODG-30) เพราะการเปลี่ยนจะทำให้ห้องพัก/การจอง
// เดิมกลายเป็นข้อมูลกำพร้าที่ไม่มีหน้าจอรองรับ ห้ามเพิ่ม vertical เข้า type นี้
/** field ที่แก้ผ่าน updateShop ได้ — whitelist ระดับ runtime ไม่ใช่แค่ type
 *
 *  ทำไมต้องมี: PATCH /api/shops/[id] ส่ง body ที่ parse จาก request.json() (ชนิด any) เข้ามาตรง ๆ
 *  TypeScript จึงไม่ช่วยอะไรเลยที่ขอบเขตนั้น ถ้าปล่อยเข้า prisma.update ทั้งก้อน ผู้ที่เป็นสมาชิก
 *  ร้านจะเขียนทับคอลัมน์ไหนก็ได้ที่มีในตาราง เช่น userId (ย้ายเจ้าของ), kind, slug, deletedAt
 *  การ pick เฉพาะคีย์ที่อนุญาตปิดช่องนี้โดยไม่ต้องแก้ทุก caller
 */
const SHOP_UPDATABLE_FIELDS = [
  "shopName",
  "description",
  "logo",
  "coverImage",
  "category",
  "address",
  "businessType",
] as const;

type ShopUpdatableField = (typeof SHOP_UPDATABLE_FIELDS)[number];

export async function updateShop(shopId: string, data: Partial<Record<ShopUpdatableField, string>>) {
  const safe: Partial<Record<ShopUpdatableField, string>> = {};
  for (const key of SHOP_UPDATABLE_FIELDS) {
    const value = (data as Record<string, unknown>)?.[key];
    if (typeof value === "string") safe[key] = value;
  }
  return prisma.shop.update({ where: { id: shopId }, data: safe });
}

// P2-2 (feature 00008 Phase 2 cutover): Shop.userId ตัด @unique แล้ว (1 user มีได้หลาย Shop —
// PERSONAL 1 แถว unique partial + BUSINESS หลายแถว) — findUnique ใช้ไม่ได้อีกต่อไป เปลี่ยนเป็น
// findFirst({userId, kind:'PERSONAL'}) คง signature/return เดิม (Shop | null) ให้ 26 caller ไม่ต้องแก้
export async function getShopByUserId(userId: string) {
  return prisma.shop.findFirst({ where: { userId, kind: "PERSONAL" } });
}

/** จำนวนร้านค้า (ผู้ขาย) ที่ใช้งานอยู่ — ใช้โชว์สถิติหน้า landing */
export async function getShopCount(): Promise<number> {
  return prisma.shop.count();
}

// ร้านน่าเชื่อถือ (buyer mobile home "ร้านน่าเชื่อถือ") — Profile-Centric: trust อยู่ที่ User
// เรียงตาม trustScore มากสุด, เฉพาะ user ที่เป็นร้าน + มี shop ที่ยัง active (ไม่ถูก soft-delete)
// link ปลายทาง = /u/{username} (trust profile). shopName/logo ดึงจาก shop แถวแรกที่ยัง active
export async function getTrustedShops(limit = 10) {
  return prisma.user.findMany({
    where: {
      isShop: true,
      shops: { some: { deletedAt: null, purgedAt: null } },
    },
    orderBy: { trustScore: "desc" },
    take: limit,
    select: {
      username: true,
      displayName: true,
      avatar: true,
      trustScore: true,
      verifications: { where: { status: "APPROVED" }, select: { level: true } },
      shops: {
        where: { deletedAt: null, purgedAt: null },
        select: { id: true, shopName: true, logo: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });
}

// จำนวนดีลสำเร็จ (CONFIRMED orders) ต่อ shopId — batched groupBy (สัญญาณ "ซื้อขายจริง" บนการ์ดร้าน)
export async function getConfirmedOrderCountByShopIds(shopIds: string[]): Promise<Map<string, number>> {
  if (shopIds.length === 0) return new Map();
  const groups = await prisma.order.groupBy({
    by: ["shopId"],
    where: { shopId: { in: shopIds }, status: "CONFIRMED" },
    _count: true,
  });
  return new Map(groups.map((g) => [g.shopId, g._count]));
}

// seller trust ตาม shopId (buyer mobile: โชว์บนการ์ดประมูล) — map shopId → { trustScore, verified }.
// trust = user (owner) trustScore; verified = มี verification APPROVED อย่างน้อย 1 (mirror getTrustedShops)
export async function getSellerTrustByShopIds(
  shopIds: string[],
): Promise<Map<string, { trustScore: number; verified: boolean }>> {
  if (shopIds.length === 0) return new Map();
  const shops = await prisma.shop.findMany({
    where: { id: { in: shopIds } },
    select: {
      id: true,
      user: {
        select: {
          trustScore: true,
          verifications: { where: { status: "APPROVED" }, select: { id: true }, take: 1 },
        },
      },
    },
  });
  return new Map(
    shops.map((s) => [s.id, { trustScore: s.user.trustScore, verified: s.user.verifications.length > 0 }]),
  );
}

export type BrowseShopRow = {
  username: string;
  displayName: string;
  avatar: string | null;
  trustScore: number;
  verifications: { level: number }[];
  shops: { shopName: string; logo: string | null }[];
};

// browse ร้านค้าแบบ scale จริง (buyer mobile discovery) — filter ตามเลเวล (tier→score range) + ค้นชื่อ,
// เรียง trust desc, cursor pagination (id). ไม่ใช่ top-N ตายตัวเหมือน getTrustedShops
export async function browseShops(opts: {
  tier?: string;
  q?: string;
  category?: string;
  cursor?: string;
  take?: number;
}): Promise<{ items: BrowseShopRow[]; nextCursor: string | null }> {
  const take = opts.take ?? 20;
  const range = opts.tier ? getTierScoreRange(opts.tier) : null;
  const q = opts.q?.trim();
  const category = opts.category?.trim();

  const rows = await prisma.user.findMany({
    where: {
      isShop: true,
      // filter หมวดร้าน (Shop.categories String[] → has); กรอง soft-delete เสมอ
      shops: { some: { deletedAt: null, purgedAt: null, ...(category ? { categories: { has: category } } : {}) } },
      ...(range ? { trustScore: { gte: range.gte, ...(range.lt != null ? { lt: range.lt } : {}) } } : {}),
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: "insensitive" as const } },
              { shops: { some: { shopName: { contains: q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    },
    orderBy: [{ trustScore: "desc" }, { id: "asc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
      trustScore: true,
      verifications: { where: { status: "APPROVED" }, select: { level: true } },
      shops: {
        where: { deletedAt: null, purgedAt: null },
        select: { shopName: true, logo: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  return {
    items: page.map((r) => ({
      username: r.username,
      displayName: r.displayName,
      avatar: r.avatar,
      trustScore: r.trustScore,
      verifications: r.verifications,
      shops: r.shops,
    })),
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
  };
}

// 00008 Phase 5 (P5-4): resolve BUSINESS shop จาก public slug สำหรับหน้า /b/[slug]
// คืนเฉพาะ kind='BUSINESS' + deletedAt:null (soft-deleted shop ไม่โชว์ public) — PERSONAL shop ไม่ผ่าน endpoint นี้ (คนละหน้ากับ /u/[username])
// include user.avatar สำหรับ fallback เมื่อ shop.logo เป็น null + badges join Badge (P5-2, business-scope achievement)
export async function findShopBySlug(slug: string) {
  return prisma.shop.findFirst({
    where: { slug, kind: "BUSINESS", deletedAt: null },
    include: {
      user: { select: { avatar: true } },
      // orderBy earnedAt desc — sync กับ user.service.ts::findByUsername: /b/[slug] ก็ใช้ BadgePillRow
      // "3 ใบล่าสุดที่ได้รับ" เหมือนกัน ถ้าไม่เรียงตรงนี้ลำดับ pill จะขึ้นกับ insertion order ของ DB
      badges: { include: { badge: true }, orderBy: { earnedAt: "desc" } },
    },
  });
}

/** slug ใช้ได้ไหม: format ถูก + ไม่ reserved + ไม่ถูกใช้ใน DB */
export async function isSlugAvailable(rawSlug: string): Promise<boolean> {
  const slug = normalizeSlug(rawSlug);
  if (!isValidSlugFormat(slug) || isReservedSlug(slug)) return false;
  const existing = await prisma.shop.findUnique({ where: { slug } });
  return existing === null;
}

/** ตั้ง slug ให้ shop — throw ถ้าไม่ available (กัน TOCTOU เบื้องต้น; unique index = guard ชั้นสุดท้าย) */
export async function setShopSlug(shopId: string, rawSlug: string) {
  const slug = normalizeSlug(rawSlug);
  if (!(await isSlugAvailable(slug))) {
    throw new Error("SLUG_UNAVAILABLE");
  }
  return prisma.shop.update({ where: { id: shopId }, data: { slug } });
}

/**
 * สถิติสำหรับหน้าร้านสาธารณะ /u/[username] (redesign 2026-07-26)
 *
 * รวมคิวรีที่หน้าโปรไฟล์ต้องใช้ไว้ที่เดียว เพื่อไม่ให้ page.tsx บวมและให้ทดสอบแยกได้
 *
 * กติกาสำคัญ: คืน null เมื่อ "ยังไม่มีข้อมูล" ไม่ใช่คืน 0 — ฝั่ง UI ใช้ null เป็นสัญญาณให้ซ่อน
 * ทั้งบล็อกแทนการโชว์เลขศูนย์ ตามหลักของระบบที่ไม่แสดงตัวเลขที่ไม่มีความหมาย (PRD 00015 §11.3)
 */
export async function getShopProfileStats(shopId: string) {
  const [statusGroups, customerGroups, ratingGroups, channels] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      where: { shopId },
      _count: { _all: true },
    }),
    // นับ "ลูกค้า" จาก customerId ที่ผูกกับออเดอร์ของร้านนี้ — ออเดอร์ที่ยังไม่ผูก Customer
    // (ของเก่าก่อน feat 00014) จะไม่ถูกนับ ซึ่งถูกต้องกว่าการเดาจากเบอร์ซ้ำ
    //
    // status CONFIRMED (เพิ่ม 2026-07-31 จาก Impeccable critique): เดิมนับทุกสถานะ ทำให้หน้าร้าน
    // แสดง "3 ออเดอร์" คู่กับ "23 จำนวนลูกค้า" ซึ่งเป็นไปไม่ได้ในสายตาคนอ่าน เพราะสองตัวเลข
    // ใช้ตัวหารคนละชุด — ออเดอร์นับเฉพาะที่ผู้ซื้อยืนยันรับของแล้ว แต่ลูกค้านับ PENDING ด้วย
    //
    // บนหน้าที่ทั้งหน้ามีไว้พิสูจน์ว่าเชื่อได้ ตัวเลขที่เป็นไปไม่ได้หนึ่งตัวทำให้ผู้ซื้อสงสัยตัวเลขที่
    // เหลือทั้งหมด และที่อันตรายกว่านั้นคือ PENDING เป็นสิ่งที่ร้านสร้างเองได้ไม่จำกัด — มิจฉาชีพ
    // เปิดร้านแล้วสร้างออเดอร์ทิ้งไว้ 50 รายการก็ได้ "50 จำนวนลูกค้า" ฟรี ๆ ซึ่งขัดพันธกิจของ
    // ทั้งแพลตฟอร์ม เกณฑ์เดียวกับ completionRate/ยอดขายรายสินค้าที่ใช้ CONFIRMED เท่านั้น
    prisma.order.groupBy({
      by: ["customerId"],
      where: { shopId, customerId: { not: null }, status: "CONFIRMED" },
      _count: { _all: true },
    }),
    prisma.review.groupBy({
      by: ["rating"],
      where: { order: { shopId } },
      _count: { _all: true },
    }),
    prisma.shopChannel.findMany({
      where: { shopId, status: "ACTIVE" },
      select: { provider: true, name: true, avatarUrl: true, externalId: true },
    }),
  ]);

  const confirmed = statusGroups.find((s) => s.status === "CONFIRMED")?._count._all ?? 0;
  const cancelled = statusGroups.find((s) => s.status === "CANCELLED")?._count._all ?? 0;
  const settled = confirmed + cancelled;

  const customerCount = customerGroups.length;
  // "กลับมาซื้อซ้ำ" = ลูกค้าที่ซื้อสำเร็จกับร้านนี้ตั้งแต่ 2 ครั้งขึ้นไป (นับจากชุด CONFIRMED เดียวกัน)
  const repeatCustomerCount = customerGroups.filter((g) => g._count._all >= 2).length;

  const reviewCount = ratingGroups.reduce((sum, g) => sum + g._count._all, 0);
  const ratingSum = ratingGroups.reduce((sum, g) => sum + g.rating * g._count._all, 0);

  // การกระจายดาว 5→1 — ค่าเฉลี่ยเท่ากันแต่กระจายต่างกันมีความหมายคนละอย่างต่อคนที่กำลังจะโอนเงิน
  const ratingDistribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: ratingGroups.find((g) => g.rating === star)?._count._all ?? 0,
  }));

  return {
    completedOrders: confirmed > 0 ? confirmed : null,
    completionRate: settled > 0 ? Math.round((confirmed / settled) * 100) : null,
    customerCount: customerCount > 0 ? customerCount : null,
    repeatCustomerCount: repeatCustomerCount > 0 ? repeatCustomerCount : null,
    avgRating: reviewCount > 0 ? Number((ratingSum / reviewCount).toFixed(1)) : null,
    reviewCount,
    ratingDistribution: reviewCount > 0 ? ratingDistribution : null,
    channels,
  };
}
