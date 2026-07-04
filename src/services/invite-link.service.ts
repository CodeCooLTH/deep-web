import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  BUSINESS_PACKAGE_TIER_CONFIG,
  type BusinessPackageTier,
} from "@/lib/business-package";
import {
  generateInviteSlug,
  expiryKeyToDate,
  type InviteExpiryKey,
} from "@/lib/invite-link";

/**
 * invite-link.service.ts — Shop Staff Invite Link (feature 00012, Task 1.3)
 *
 * mirror pattern ของ src/services/shop-member.service.ts (inviteShopMember/acceptShopInvite):
 * - guard เจ้าของ/kind/lock ใน $transaction เดียวกับ mutation กัน race
 * - quota คิดจาก BUSINESS_PACKAGE_TIER_CONFIG[tier].maxAdminsPerBusiness ต่อ 1 business (BR-BIZ-08)
 * - ไม่มี ACTIVE subscription = fail-closed (maxAdmins = 0) ไม่ใช่ unlimited
 */

/** createInviteLink — TFR (feat 00012): owner สร้างลิงก์เชิญ admin เข้า Business shop
 *  ต่างจาก inviteShopMember (เชิญทีละคนผ่านเบอร์/อีเมล) ตรงที่นี่คือ "ลิงก์กลาง" ใครกดก็ accept ได้
 *  (ยังโดน quota คุมตอน accept อยู่ดี — ดู acceptInviteLink) จึงไม่ต้อง check duplicate-pending แบบ ShopInvite
 */
export async function createInviteLink(
  ownerId: string,
  shopId: string,
  expiryKey: InviteExpiryKey,
): Promise<{ slug: string; expiresAt: Date }> {
  const expiresAt = expiryKeyToDate(expiryKey);

  // 🛑 retry loop ต้องครอบ $transaction ทั้งก้อน (mirror order.service.ts TD-001) —
  // ถ้า tx.shopInviteLink.create ชน P2002 (slug ซ้ำ) ครั้งแรก Postgres จะ mark ทั้ง
  // transaction เป็น aborted; retry ใน tx เดิมจะพังด้วย aborted-transaction error ไม่ใช่ retry จริง
  // จึงต้องเปิด transaction ใหม่ทั้งก้อนทุก attempt (guard ด้านในถูก re-check ทุกรอบ ปลอดภัย)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const shop = await tx.shop.findUnique({ where: { id: shopId } });
        if (!shop || shop.userId !== ownerId || shop.kind !== "BUSINESS") {
          throw new Error("NOT_OWNER");
        }
        if (shop.packageLockedAt !== null) throw new Error("SHOP_LOCKED");

        // lookup tier ของ owner ผ่าน BusinessPackageSubscription (1:1 ownerId) — ไม่มี/ไม่ ACTIVE = ไม่มีสิทธิ์สร้างลิงก์
        const sub = await tx.businessPackageSubscription.findUnique({ where: { ownerId } });
        if (!sub || sub.status !== "ACTIVE") throw new Error("NO_ACTIVE_PACKAGE");

        const slug = generateInviteSlug();
        const link = await tx.shopInviteLink.create({
          data: {
            shopId,
            slug,
            role: "ADMIN",
            createdByUserId: ownerId,
            expiresAt,
          },
        });
        return { slug: link.slug, expiresAt: link.expiresAt };
      });
    } catch (e) {
      // P2002 = unique violation (ชน slug) → regenerate retry (tx ใหม่ทั้งก้อน); error อื่นไม่ retry
      const isUnique = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (isUnique && attempt < 4) continue;
      throw e;
    }
  }
  throw new Error("SLUG_COLLISION"); // unreachable ในทางปฏิบัติ (62^12 keyspace)
}

/** listActiveInviteLinks — ลิงก์ที่ยัง valid ของ shop (ยังไม่ revoke และยังไม่หมดอายุ)
 *  สำหรับหน้า owner จัดการลิงก์เชิญ (Task 4.x) — ไม่คืน createdByUserId (ไม่จำเป็นต้องแสดง)
 */
export async function listActiveInviteLinks(
  shopId: string,
): Promise<{ slug: string; expiresAt: Date; createdAt: Date }[]> {
  return prisma.shopInviteLink.findMany({
    where: { shopId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { slug: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

/** revokeInviteLink — owner ปิดใช้งานลิงก์เชิญเอง (ก่อนหมดอายุ)
 *  idempotent: ถ้า revoke ซ้ำ (revokedAt ตั้งไว้แล้ว) ไม่ throw — แค่ no-op
 */
export async function revokeInviteLink(
  ownerId: string,
  shopId: string,
  slug: string,
): Promise<void> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop || shop.userId !== ownerId || shop.kind !== "BUSINESS") throw new Error("NOT_OWNER");

  const link = await prisma.shopInviteLink.findUnique({ where: { slug } });
  if (!link || link.shopId !== shopId) throw new Error("NOT_OWNER");

  if (link.revokedAt !== null) return; // idempotent — revoke ซ้ำไม่ throw

  await prisma.shopInviteLink.update({
    where: { slug },
    data: { revokedAt: new Date() },
  });
}

/** resolveInviteLink — resolve slug → ข้อมูล shop สำหรับหน้า landing (`/i/[slug]`, public ไม่ auth)
 *  คืน `valid:false` + `reason` แทน throw เพราะ caller คือหน้า public landing ที่ต้องแสดงผล NOT_FOUND/EXPIRED/REVOKED
 *  ให้ user เห็นตรง ๆ ไม่ใช่ error page
 */
export async function resolveInviteLink(slug: string): Promise<{
  valid: boolean;
  shopId?: string;
  shopName?: string;
  shopLogo?: string | null;
  reason?: "EXPIRED" | "REVOKED" | "NOT_FOUND";
}> {
  const link = await prisma.shopInviteLink.findUnique({
    where: { slug },
    include: { shop: { select: { id: true, shopName: true, logo: true } } },
  });
  if (!link) return { valid: false, reason: "NOT_FOUND" };
  if (link.revokedAt !== null) return { valid: false, reason: "REVOKED" };
  if (link.expiresAt <= new Date()) return { valid: false, reason: "EXPIRED" };

  return {
    valid: true,
    shopId: link.shop.id,
    shopName: link.shop.shopName,
    shopLogo: link.shop.logo,
  };
}

/** acceptInviteLink — ผู้ถูกเชิญ (login แล้ว) กดลิงก์ยอมรับเข้าเป็น admin ของ shop
 *  ต่างจาก acceptShopInvite (ไม่มี contact-match guard เพราะลิงก์ไม่ผูกกับ contact ใดคนหนึ่ง)
 *  แต่ยัง quota re-check เหมือนกัน กัน race (owner downgrade/ลิงก์เก่าถูก accept พร้อมกันหลายคน)
 */
export async function acceptInviteLink(
  slug: string,
  userId: string,
): Promise<{ shopId: string }> {
  return prisma.$transaction(async (tx) => {
    const link = await tx.shopInviteLink.findUnique({ where: { slug } });
    if (!link || link.revokedAt !== null || link.expiresAt <= new Date()) {
      throw new Error("LINK_INVALID");
    }

    const shop = await tx.shop.findUnique({ where: { id: link.shopId } });
    if (!shop) throw new Error("LINK_INVALID");
    if (shop.userId === userId) throw new Error("ALREADY_OWNER");

    // idempotent: ถ้าเป็นสมาชิกอยู่แล้ว (ADMIN เดิม/เคย accept ลิงก์เดียวกันมาก่อน) ข้าม quota check
    // ไปเลย — ไม่ใช่การ "เพิ่ม" สมาชิกใหม่ จึงไม่ควรถูกบล็อกด้วย quota ที่อาจเต็มไปแล้วหลังเข้าจริง
    const existingMember = await tx.shopMember.findUnique({
      where: { shopId_userId: { shopId: link.shopId, userId } },
    });
    if (existingMember) return { shopId: link.shopId };

    const sub = await tx.businessPackageSubscription.findUnique({ where: { ownerId: shop.userId } });
    const maxAdmins = sub && sub.status === "ACTIVE"
      ? BUSINESS_PACKAGE_TIER_CONFIG[sub.tier as BusinessPackageTier].maxAdminsPerBusiness
      : 0; // ไม่มี/ไม่ ACTIVE package = ไม่มีโควตาเหลือ (fail-closed)
    if (maxAdmins !== null) {
      const adminCount = await tx.shopMember.count({ where: { shopId: link.shopId, role: "ADMIN" } });
      if (adminCount >= maxAdmins) throw new Error("ADMIN_QUOTA_EXCEEDED");
    }

    await tx.shopMember.upsert({
      where: { shopId_userId: { shopId: link.shopId, userId } },
      create: { shopId: link.shopId, userId, role: "ADMIN" },
      update: {}, // idempotent กันกด accept ซ้อน (race ระหว่าง existingMember check กับที่นี่)
    });

    return { shopId: link.shopId };
  });
}
