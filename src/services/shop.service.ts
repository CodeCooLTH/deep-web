import { prisma } from "@/lib/prisma";
import { normalizeSlug, isValidSlugFormat, isReservedSlug } from "@/lib/shop-slug";

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
        select: { shopName: true, logo: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });
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
