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
