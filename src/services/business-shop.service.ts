import { prisma } from "@/lib/prisma";
import {
  BUSINESS_PACKAGE_TIER_CONFIG, SHOP_LOCK_REASON, SHOP_DELETE_REASON,
  GRACE_ELIGIBLE_LOCK_REASONS, BUSINESS_LOCK_GRACE_DAYS, BUSINESS_DELETE_RETENTION_DAYS,
  type BusinessPackageTier,
} from "@/lib/business-package";

export async function createBusinessShop(ownerId: string, data: {
  shopName: string; businessType: string; category?: string; description?: string;
  // feature 00017 — ประเภทกิจการ: GENERAL (สินค้าและบริการ) | LODGING (บ้านพักตากอากาศ)
  // optional เพื่อ backward-compat (ผู้เรียกเดิมไม่ส่ง = GENERAL ตาม default ของ DB)
  // IMPORTANT: เขียนได้ที่นี่ที่เดียวเท่านั้น — เป็น immutable หลังสร้าง (BR-LODG-30)
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
        businessType: data.businessType, category: data.category, description: data.description,
        ...(data.vertical ? { vertical: data.vertical } : {}),
      },
    });
    await tx.shopMember.create({ data: { shopId: shop.id, userId: ownerId, role: "OWNER" } });
    await tx.sellerWallet.create({ data: { shopId: shop.id, balance: 0 } });
    return shop;
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
