import { prisma } from "@/lib/prisma";

/** getPersonalShop — SSOT helper แทน `user.shop` singular หลัง Phase 2 cutover
 *  ก่อน Phase 2: prisma.shop.findUnique({where:{userId}}) ก็ได้ผลเดียวกัน (userId ยัง @unique เต็ม)
 *  หลัง Phase 2: userId ไม่ unique เต็มอีกต่อไป — ต้องกรอง kind='PERSONAL' เสมอ (partial-unique DB constraint
 *  รับประกันว่า findFirst จะได้ไม่เกิน 1 แถวจริง) — ใช้ signature เดียวกันได้ทั้ง 2 ช่วง ไม่ต้องแก้ call-site ซ้ำ
 */
export async function getPersonalShop(userId: string) {
  return prisma.shop.findFirst({ where: { userId, kind: "PERSONAL" } });
}

export async function isShopMember(shopId: string, userId: string): Promise<boolean> {
  const m = await prisma.shopMember.findUnique({
    where: { shopId_userId: { shopId, userId } },
    select: { shopId: true },
  });
  return m !== null;
}

export interface ActiveShopContext {
  shopId: string;
  kind: "PERSONAL" | "BUSINESS";
  role: "OWNER" | "ADMIN";
  locked: boolean;
  lockReason: string | null;
}

/** resolveActiveShopContext — ใช้ใน page/route ที่ต้อง operate บน "shop ปัจจุบัน" ของ session
 *  ไม่ trust session.user.activeShopId เปล่า ๆ — re-verify membership เสมอ (defense-in-depth, TFR-013)
 */
export async function resolveActiveShopContext(session: {
  user: { id: string; activeShopId?: string | null };
}): Promise<ActiveShopContext | null> {
  const shopId = session.user.activeShopId;
  if (!shopId) {
    const personal = await getPersonalShop(session.user.id);
    if (!personal) return null;
    return { shopId: personal.id, kind: "PERSONAL", role: "OWNER", locked: false, lockReason: null };
  }
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, kind: true, userId: true, packageLockedAt: true, packageLockReason: true, deletedAt: true },
  });
  if (!shop || shop.deletedAt) return null; // soft-deleted/ไม่มี → fallback caller ควรพากลับ Personal
  if (shop.kind === "PERSONAL") {
    if (shop.userId !== session.user.id) return null; // ไม่ควรเกิด (Personal เป็นของ user เดียวเสมอ) — defense
    return { shopId: shop.id, kind: "PERSONAL", role: "OWNER", locked: false, lockReason: null };
  }
  // BUSINESS — verify membership จริง (ไม่ trust JWT เพียงอย่างเดียว)
  const member = await prisma.shopMember.findUnique({
    where: { shopId_userId: { shopId: shop.id, userId: session.user.id } },
    select: { role: true },
  });
  if (!member) return null;
  return {
    shopId: shop.id, kind: "BUSINESS", role: member.role as "OWNER" | "ADMIN",
    locked: shop.packageLockedAt !== null, lockReason: shop.packageLockReason,
  };
}
