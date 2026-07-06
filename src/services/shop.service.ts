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

export async function updateShop(shopId: string, data: {
  shopName?: string;
  description?: string;
  logo?: string;
  category?: string;
  address?: string;
  businessType?: string;
}) {
  return prisma.shop.update({ where: { id: shopId }, data });
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
  cursor?: string;
  take?: number;
}): Promise<{ items: BrowseShopRow[]; nextCursor: string | null }> {
  const take = opts.take ?? 20;
  const range = opts.tier ? getTierScoreRange(opts.tier) : null;
  const q = opts.q?.trim();

  const rows = await prisma.user.findMany({
    where: {
      isShop: true,
      shops: { some: { deletedAt: null, purgedAt: null } },
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
      badges: { include: { badge: true } },
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
