import { prisma } from "@/lib/prisma";
import {
  BUSINESS_PACKAGE_TIER_CONFIG, SHOP_LOCK_REASON, SHOP_DELETE_REASON,
  GRACE_ELIGIBLE_LOCK_REASONS, BUSINESS_LOCK_GRACE_DAYS, BUSINESS_DELETE_RETENTION_DAYS,
  type BusinessPackageTier,
} from "@/lib/business-package";

export async function createBusinessShop(ownerId: string, data: {
  shopName: string; businessType: string; category?: string; description?: string;
  // categories = SSOT ของหมวดร้าน (≤5). category ช่องเดียวเป็น LEGACY ที่ยังมีหน้าอื่นอ่านอยู่
  // จึง derive จากตัวแรกของ categories ให้อัตโนมัติ — ผู้เรียกไม่ต้องส่งสองที่ให้ตรงกันเอง
  categories?: string[];
  // feature 00030 — สร้างร้านให้ใช้งานได้ทันทีในคำสั่งเดียว (เดิมต้องไปต่อที่หน้า onboarding)
  logo?: string;
  slug?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  // feature 00017 → ขยายเป็น 3 ค่าที่ feature 00028 — ประเภทร้านค้า:
  //   ONLINE_SALES (ขายออนไลน์) | SERVICE_QUEUE (สินค้าและบริการ) | LODGING (บ้านพัก)
  // optional เพื่อ backward-compat (ผู้เรียกเดิมไม่ส่ง = ONLINE_SALES ตาม default ของ DB)
  // IMPORTANT: เขียนได้ที่นี่ที่เดียวเท่านั้น — เป็น immutable หลังสร้าง (BR-LODG-30/BR-SBT-08)
  // ยกเว้นทางเดียว: POST /api/shops/update ตั้งค่าได้ระหว่าง onboarding ที่ยังไม่มี slug (BR-SBT-09)
  // service ที่แก้ข้อมูลร้าน (updateShop ฯลฯ) ต้องไม่รับ field นี้เข้ามาเลย
  vertical?: string
}) {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.businessPackageSubscription.findUnique({ where: { ownerId } });
    if (!sub || sub.status !== "ACTIVE") throw new Error("NO_ACTIVE_PACKAGE");
    const quota = BUSINESS_PACKAGE_TIER_CONFIG[sub.tier as BusinessPackageTier];
    if (quota.maxBusinesses !== null) {
      const count = await tx.shop.count({ where: { userId: ownerId, kind: "BUSINESS", deletedAt: null } });
      if (count >= quota.maxBusinesses) throw new Error("BUSINESS_QUOTA_EXCEEDED");
    }
    const shop = await tx.shop.create({
      data: {
        userId: ownerId, kind: "BUSINESS", shopName: data.shopName,
        businessType: data.businessType, description: data.description,
        categories: data.categories ?? [],
        category: data.category ?? data.categories?.[0],
        // slug: Shop.slug @unique เป็นด่านสุดท้าย — ชนกันจะได้ P2002 แล้ว route แปลงเป็น SLUG_TAKEN
        ...(data.slug ? { slug: data.slug } : {}),
        ...(data.logo ? { logo: data.logo } : {}),
        ...(data.address ? { address: data.address } : {}),
        ...(data.latitude != null ? { latitude: data.latitude } : {}),
        ...(data.longitude != null ? { longitude: data.longitude } : {}),
        ...(data.vertical ? { vertical: data.vertical } : {}),
      },
    });
    await tx.shopMember.create({ data: { shopId: shop.id, userId: ownerId, role: "OWNER" } });
    await tx.sellerWallet.create({ data: { shopId: shop.id, balance: 0 } });
    return shop;
  });
}

/**
 * updateBusinessShop — แก้ข้อมูลธุรกิจรายตัวจากหน้า /business/[shopId]/settings
 *
 * ทำไมแยกจาก updateShop ของร้าน active: หน้านี้แก้ "ธุรกิจตัวที่เลือกจาก path" ซึ่งอาจไม่ใช่ร้าน
 * ที่ active อยู่ — ownership จึง verify จาก ownerId+shopId ตรง ๆ ไม่ใช่จาก session context
 *
 * 🛑 ไม่รับ vertical และ slug โดยตั้งใจ:
 *   vertical = immutable หลังสร้าง (BR-LODG-30/BR-SBT-08)
 *   slug     = มี setShopSlug ที่จัดการ TOCTOU/unique เอง ห้ามเขียนตรงผ่าน update ทั่วไป
 */
export async function updateBusinessShop(
  ownerId: string,
  shopId: string,
  data: {
    shopName?: string;
    description?: string;
    logo?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    categories?: string[];
  },
) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop || shop.userId !== ownerId || shop.kind !== "BUSINESS") throw new Error("NOT_OWNER");
  if (shop.deletedAt) throw new Error("ALREADY_DELETED");
  return prisma.shop.update({
    where: { id: shopId },
    data: {
      ...(data.shopName !== undefined && { shopName: data.shopName }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.logo !== undefined && { logo: data.logo }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.latitude !== undefined && { latitude: data.latitude }),
      ...(data.longitude !== undefined && { longitude: data.longitude }),
      // category ช่องเดียวเป็น LEGACY — sync จากตัวแรกให้เหมือนตอนสร้าง ไม่ให้ 2 ช่องขัดกัน
      ...(data.categories !== undefined && {
        categories: data.categories,
        category: data.categories[0] ?? null,
      }),
    },
  });
}

export async function softDeleteBusinessShop(ownerId: string, shopId: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop || shop.userId !== ownerId || shop.kind !== "BUSINESS") throw new Error("NOT_OWNER");
  if (shop.deletedAt) throw new Error("ALREADY_DELETED");
  return prisma.shop.update({
    where: { id: shopId },
    data: { deletedAt: new Date(), deletedReason: SHOP_DELETE_REASON.OWNER_DELETED },
  });
}

export async function restoreBusinessShop(ownerId: string, shopId: string) {
  return prisma.$transaction(async (tx) => {
    const shop = await tx.shop.findUnique({ where: { id: shopId } });
    if (!shop || shop.userId !== ownerId || shop.kind !== "BUSINESS") throw new Error("NOT_OWNER");
    if (!shop.deletedAt) throw new Error("NOT_DELETED");
    if (shop.purgedAt) throw new Error("RESTORE_WINDOW_EXPIRED");

    const sub = await tx.businessPackageSubscription.findUnique({ where: { ownerId } });
    const quota = sub && sub.status === "ACTIVE" ? BUSINESS_PACKAGE_TIER_CONFIG[sub.tier as BusinessPackageTier] : null;
    const activeCount = await tx.shop.count({ where: { userId: ownerId, kind: "BUSINESS", deletedAt: null, packageLockedAt: null } });
    const fits = !quota || quota.maxBusinesses === null || activeCount < quota.maxBusinesses;

    return tx.shop.update({
      where: { id: shopId },
      data: fits
        ? { deletedAt: null, deletedReason: null, packageLockedAt: null, packageLockReason: null }
        : { deletedAt: null, deletedReason: null, packageLockedAt: new Date(), packageLockReason: SHOP_LOCK_REASON.QUOTA_EXCEEDED_BUSINESS_COUNT },
    });
  });
}

/** autoSoftDeleteLapsedShops — cron phase 2 (TFR-021): shop ที่ lock ด้วยเหตุ grace-eligible เกิน grace period → soft-delete */
export async function autoSoftDeleteLapsedShops(): Promise<{ processed: number; softDeleted: number; errors: number }> {
  const cutoff = new Date(Date.now() - BUSINESS_LOCK_GRACE_DAYS * 86_400_000);
  const lapsed = await prisma.shop.findMany({
    where: {
      kind: "BUSINESS", deletedAt: null, purgedAt: null,
      packageLockReason: { in: [...GRACE_ELIGIBLE_LOCK_REASONS] },
      packageLockedAt: { lte: cutoff },
    },
    select: { id: true },
  });
  let softDeleted = 0, errors = 0;
  for (const { id } of lapsed) {
    try {
      await prisma.shop.update({ where: { id }, data: { deletedAt: new Date(), deletedReason: SHOP_DELETE_REASON.PACKAGE_LAPSED } });
      softDeleted += 1;
    } catch (e) { errors += 1; console.error(`[cron] autoSoftDelete shopId=${id}`, e); }
  }
  return { processed: lapsed.length, softDeleted, errors };
}

/** purgeExpiredShops — cron phase 3 (TFR-022) — tombstone เท่านั้น (ตั้ง purgedAt) ห้าม physical DELETE
 *  เหตุผล (TD-002 SDS §6): FK Order→Shop เป็น Restrict + Product.shopId onDelete:Cascade จะทำลายข้อมูล
 *  ขัด BR-BIZ-20 — ถ้าจะ hard-delete จริงต้องออกแบบ compensating step แยก (นอกเหนือ SDS นี้)
 */
export async function purgeExpiredShops(): Promise<{ processed: number; purged: number; errors: number }> {
  const cutoff = new Date(Date.now() - BUSINESS_DELETE_RETENTION_DAYS * 86_400_000);
  const expired = await prisma.shop.findMany({
    where: { deletedAt: { not: null, lte: cutoff }, purgedAt: null },
    select: { id: true },
  });
  let purged = 0, errors = 0;
  for (const { id } of expired) {
    try {
      await prisma.shop.update({ where: { id }, data: { purgedAt: new Date() } });
      purged += 1;
    } catch (e) { errors += 1; console.error(`[cron] purge shopId=${id}`, e); }
  }
  return { processed: expired.length, purged, errors };
}
