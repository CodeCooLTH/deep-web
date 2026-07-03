import { prisma } from "@/lib/prisma";
import {
  BUSINESS_PACKAGE_TIER_CONFIG, SHOP_LOCK_REASON,
  type BusinessPackageTier,
} from "@/lib/business-package";

/** inviteShopMember — TFR-008 (FR-BIZ-09/12): owner เชิญ admin เข้า Business shop ผ่านเบอร์โทร/อีเมล
 *  quota คิดต่อ 1 business (BR-BIZ-08) ไม่ใช่รวมทุก business ของ owner
 */
export async function inviteShopMember(
  ownerId: string,
  shopId: string,
  contact: string,
  contactType: "PHONE" | "EMAIL",
) {
  return prisma.$transaction(async (tx) => {
    const shop = await tx.shop.findUnique({ where: { id: shopId } });
    if (!shop || shop.userId !== ownerId || shop.kind !== "BUSINESS") throw new Error("NOT_OWNER");
    if (shop.packageLockedAt !== null) throw new Error("SHOP_LOCKED");

    // lookup tier ของ owner ผ่าน BusinessPackageSubscription (1:1 ownerId) — ไม่มี/ไม่ ACTIVE = ไม่มีสิทธิ์เชิญ
    const sub = await tx.businessPackageSubscription.findUnique({ where: { ownerId } });
    if (!sub || sub.status !== "ACTIVE") throw new Error("NO_ACTIVE_PACKAGE");
    const maxAdmins = BUSINESS_PACKAGE_TIER_CONFIG[sub.tier as BusinessPackageTier].maxAdminsPerBusiness;

    if (maxAdmins !== null) {
      const adminCount = await tx.shopMember.count({ where: { shopId, role: "ADMIN" } });
      if (adminCount >= maxAdmins) throw new Error("ADMIN_QUOTA_EXCEEDED");
    }

    const duplicatePending = await tx.shopInvite.findFirst({
      where: { shopId, invitedContact: contact, status: "PENDING" },
    });
    if (duplicatePending) throw new Error("INVITE_ALREADY_PENDING");

    return tx.shopInvite.create({
      data: { shopId, invitedContact: contact, contactType, invitedByUserId: ownerId, status: "PENDING" },
    });
  });
}

/** acceptShopInvite — TFR-009 (FR-BIZ-10): ผู้ถูกเชิญ (login แล้ว) accept คำเชิญของตัวเอง
 *  contact-match guard กัน accept invite ของคนอื่น; quota re-check กัน race (owner downgrade ระหว่างรอ accept)
 */
export async function acceptShopInvite(inviteId: string, currentUserId: string) {
  return prisma.$transaction(async (tx) => {
    const invite = await tx.shopInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.status !== "PENDING") throw new Error("INVITE_NOT_PENDING");

    const currentUser = await tx.user.findUnique({ where: { id: currentUserId } });
    if (!currentUser) throw new Error("CONTACT_MISMATCH");
    const matched = invite.contactType === "PHONE"
      ? currentUser.phone === invite.invitedContact
      : currentUser.email === invite.invitedContact;
    if (!matched) throw new Error("CONTACT_MISMATCH");

    const shop = await tx.shop.findUnique({ where: { id: invite.shopId } });
    if (!shop) throw new Error("INVITE_NOT_PENDING");
    const sub = await tx.businessPackageSubscription.findUnique({ where: { ownerId: shop.userId } });
    const maxAdmins = sub && sub.status === "ACTIVE"
      ? BUSINESS_PACKAGE_TIER_CONFIG[sub.tier as BusinessPackageTier].maxAdminsPerBusiness
      : 0; // ไม่มี/ไม่ ACTIVE package = ไม่มีโควตาเหลือ (fail-closed)
    if (maxAdmins !== null) {
      const adminCount = await tx.shopMember.count({ where: { shopId: invite.shopId, role: "ADMIN" } });
      if (adminCount >= maxAdmins) throw new Error("ADMIN_QUOTA_EXCEEDED_AT_ACCEPT");
    }

    await tx.shopMember.upsert({
      where: { shopId_userId: { shopId: invite.shopId, userId: currentUserId } },
      create: { shopId: invite.shopId, userId: currentUserId, role: "ADMIN" },
      update: {}, // idempotent กันกด accept ซ้ำ
    });

    return tx.shopInvite.update({
      where: { id: inviteId },
      data: { status: "ACCEPTED", acceptedByUserId: currentUserId, acceptedAt: new Date() },
    });
  });
}

/** removeShopMember — TFR-010 (FR-BIZ-11): owner ลบ admin ออกจาก Business shop (hard delete — ไม่มี soft field)
 *  auto-unlock ถ้า lock reason คือ QUOTA_EXCEEDED_ADMIN_COUNT และหลังลบแล้วโควตาพอดี
 */
export async function removeShopMember(ownerId: string, shopId: string, memberId: string) {
  return prisma.$transaction(async (tx) => {
    const shop = await tx.shop.findUnique({ where: { id: shopId } });
    if (!shop || shop.userId !== ownerId || shop.kind !== "BUSINESS") throw new Error("NOT_OWNER");

    const member = await tx.shopMember.findUnique({ where: { id: memberId } });
    if (!member || member.shopId !== shopId || member.role !== "ADMIN") throw new Error("NOT_AN_ADMIN");

    await tx.shopMember.delete({ where: { id: memberId } });

    if (shop.packageLockReason === SHOP_LOCK_REASON.QUOTA_EXCEEDED_ADMIN_COUNT) {
      const sub = await tx.businessPackageSubscription.findUnique({ where: { ownerId } });
      const maxAdmins = sub && sub.status === "ACTIVE"
        ? BUSINESS_PACKAGE_TIER_CONFIG[sub.tier as BusinessPackageTier].maxAdminsPerBusiness
        : null;
      const adminCount = await tx.shopMember.count({ where: { shopId, role: "ADMIN" } });
      if (maxAdmins === null || adminCount <= maxAdmins) {
        await tx.shop.update({ where: { id: shopId }, data: { packageLockedAt: null, packageLockReason: null } });
      }
    }

    return { removed: true };
  });
}

/** cancelInvite — owner ยกเลิกคำเชิญที่ยังค้าง PENDING */
export async function cancelInvite(ownerId: string, shopId: string, inviteId: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop || shop.userId !== ownerId || shop.kind !== "BUSINESS") throw new Error("NOT_OWNER");

  const invite = await prisma.shopInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.shopId !== shopId || invite.status !== "PENDING") throw new Error("INVITE_NOT_PENDING");

  return prisma.shopInvite.update({
    where: { id: inviteId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}

/** listMembers — สมาชิกทั้งหมดของ shop (role, userId, ข้อมูล user เท่าที่จำเป็นแสดงในหน้าจัดการสมาชิก) */
export async function listMembers(shopId: string) {
  return prisma.shopMember.findMany({
    where: { shopId },
    select: {
      id: true, role: true, userId: true, createdAt: true,
      user: { select: { displayName: true, username: true, avatar: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** listInvites — คำเชิญ PENDING ของ shop
 *  ⚠️ คืน `invitedContact` ดิบ (raw PII เทียบเท่า Order.buyerContact) — caller (route/RSC layer, S-9)
 *  ต้อง mask/neutralize ก่อนส่งลง client component ตาม feedback_rsc_pii_neutralize_at_source — ห้าม mask ที่นี่
 */
export async function listInvites(shopId: string) {
  return prisma.shopInvite.findMany({
    where: { shopId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
}
