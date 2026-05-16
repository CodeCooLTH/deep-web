import { prisma } from "@/lib/prisma";

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

export async function getShopByUserId(userId: string) {
  return prisma.shop.findUnique({ where: { userId } });
}
